/**
 * SafeSpot 学情分析核心：PRI、知识掌握、结论引擎
 * 设计见 docs/LEARNING_ANALYTICS_DESIGN.md
 */

const MAX_MISS_DEFAULT = 3;
const PRI_WEIGHTS = { w1: 0.40, w2: 0.25, w3: 0.15, w4: 0.20 };
const PASS_RATE = 0.6;

function parseLog(raw) {
    if (!raw) return [];
    try {
        const log = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(log) ? log : [];
    } catch {
        return [];
    }
}

/** 从 session_log 汇总 attempt 指标 */
function summarizeSessionLog(sessionLog, opts = {}) {
    const log = parseLog(sessionLog);
    const maxMiss = opts.maxMiss ?? MAX_MISS_DEFAULT;
    const slideCount = opts.slideCount || 1;
    const hazardsTotal = opts.hazardsTotal != null
        ? opts.hazardsTotal
        : new Set(log.filter(e => e.itemId || e.clauseId).map(e => e.itemId || e.clauseId)).size;

    let hits = 0;
    let misses = 0;
    let unfound = 0;
    const hitTimes = [];
    const startT = log.length ? Math.min(...log.map(e => e.t || Date.now())) : null;

    for (const ev of log) {
        const r = ev.result;
        if (r === 'hit') {
            hits++;
            if (ev.t && startT) hitTimes.push(ev.t - startT);
        } else if (r === 'miss' || r === 'invalid_click') {
            misses++;
        } else if (r === 'unfound') {
            unfound++;
        }
    }

    // unfound 若日志未写全，用 hazardsTotal - hits 兜底
    if (hazardsTotal > 0 && unfound === 0 && hits < hazardsTotal) {
        // 仅当日志里完全没有 unfound 事件时兜底
        const hasUnfoundEv = log.some(e => e.result === 'unfound');
        if (!hasUnfoundEv) unfound = Math.max(0, hazardsTotal - hits);
    }

    const durationMs = opts.durationMs != null
        ? opts.durationMs
        : (log.length >= 2
            ? Math.max(0, (log[log.length - 1].t || 0) - (log[0].t || 0))
            : 0);

    const durationSec = Math.max(durationMs / 1000, 1);
    const denom = misses + hits + 1e-6;
    const rMiss = misses / denom;
    const missCap = Math.max(slideCount * maxMiss, 1);
    const W = Math.min(1, misses / missCap);
    const mHit = hazardsTotal > 0 ? hits / hazardsTotal : 0;
    const eta = hits / durationSec;
    // logistic 归一：η0=0.02 hit/s
    const etaNorm = 1 / (1 + Math.exp(-80 * (eta - 0.02)));

    const { w1, w2, w3, w4 } = PRI_WEIGHTS;
    const pri = 100 * (
        w1 * mHit
        + w2 * (1 - W)
        + w3 * etaNorm
        + w4 * (1 - rMiss)
    );

    return {
        hazardsTotal: hazardsTotal || (hits + unfound),
        hazardsHit: hits,
        hazardsUnfound: unfound,
        invalidClicks: misses,
        rMiss,
        wasteRatio: W,
        hitRate: mHit,
        eta,
        etaNorm,
        pri: Math.round(Math.max(0, Math.min(100, pri)) * 10) / 10,
        durationMs,
        firstHitLatencyMs: hitTimes.length ? hitTimes[0] : null,
        avgHitLatencyMs: hitTimes.length
            ? Math.round(hitTimes.reduce((a, b) => a + b, 0) / hitTimes.length)
            : null
    };
}

function priLabel(pri) {
    if (pri >= 85) return { key: 'expert', label: '熟练' };
    if (pri >= 70) return { key: 'good', label: '良好' };
    if (pri >= 55) return { key: 'fair', label: '一般' };
    return { key: 'weak', label: '生疏' };
}

function scoreRate(score, paperTotal) {
    const t = Number(paperTotal) || 100;
    return t > 0 ? Number(score) / t : 0;
}

/** 贝叶斯掌握度 */
function mastery(H, E, alpha = 1, beta = 1) {
    if (E <= 0) return null;
    return (H + alpha) / (E + alpha + beta);
}

/**
 * 构建 clauseId → { sceneId, sceneName, categoryId, categoryName, title, weight }
 */
function buildClauseIndex(db) {
    const map = {};
    const rows = db.prepare(`
        SELECT i.id as clause_id, i.title, i.score_weight, i.category_id,
               c.name as category_name, c.scene_id, s.name as scene_name
        FROM knowledge_items i
        LEFT JOIN knowledge_categories c ON c.id = i.category_id
        LEFT JOIN knowledge_scenes s ON s.id = c.scene_id
    `).all();
    for (const r of rows) {
        map[r.clause_id] = {
            clauseId: r.clause_id,
            title: r.title,
            weight: r.score_weight || 10,
            categoryId: r.category_id,
            categoryName: r.category_name,
            sceneId: r.scene_id,
            sceneName: r.scene_name
        };
    }
    return map;
}

/** 从 session_log 抽出知识事实 */
function extractKnowledgeFacts(sessionLog, clauseIndex) {
    const log = parseLog(sessionLog);
    const facts = [];
    for (const ev of log) {
        if (ev.result !== 'hit' && ev.result !== 'unfound') continue;
        const clauseId = ev.clauseId || null;
        if (!clauseId) continue;
        const meta = clauseIndex[clauseId] || {};
        facts.push({
            clauseId,
            categoryId: meta.categoryId || null,
            sceneId: meta.sceneId || null,
            outcome: ev.result,
            label: ev.label || meta.title || clauseId,
            weight: meta.weight || 10
        });
    }
    return facts;
}

/**
 * 交卷后物化 attempt_stats + knowledge_error_facts
 */
function materializeAttempt(db, recordId, recordRow, sessionLog, extra = {}) {
    const clauseIndex = buildClauseIndex(db);
    const stats = summarizeSessionLog(sessionLog, {
        durationMs: recordRow.duration,
        hazardsTotal: extra.hazardsTotal,
        slideCount: extra.slideCount || 1,
        maxMiss: extra.maxMiss || MAX_MISS_DEFAULT
    });

    const scoreR = scoreRate(recordRow.score, recordRow.paper_total);
    db.prepare(`
        INSERT OR REPLACE INTO attempt_stats (
            record_id, user_id, department_id, exam_id, exam_name, user_name, mode,
            score, paper_total, score_rate, duration_ms,
            hazards_total, hazards_hit, hazards_unfound, invalid_clicks,
            pri, r_miss, waste_ratio, completed_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
        recordId,
        recordRow.user_id || null,
        recordRow.department_id || null,
        recordRow.exam_id || null,
        recordRow.exam_name || recordRow.exam_id || null,
        recordRow.user_name || null,
        recordRow.mode || 'exam',
        recordRow.score,
        recordRow.paper_total || 100,
        scoreR,
        stats.durationMs,
        stats.hazardsTotal,
        stats.hazardsHit,
        stats.hazardsUnfound,
        stats.invalidClicks,
        stats.pri,
        stats.rMiss,
        stats.wasteRatio,
        recordRow.completed_at || Date.now()
    );

    db.prepare('DELETE FROM knowledge_error_facts WHERE record_id = ?').run(recordId);
    const insertFact = db.prepare(`
        INSERT INTO knowledge_error_facts (
            record_id, user_id, department_id, exam_id, clause_id, category_id, scene_id,
            outcome, label, weight, completed_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);
    const facts = extractKnowledgeFacts(sessionLog, clauseIndex);
    for (const f of facts) {
        insertFact.run(
            recordId,
            recordRow.user_id || null,
            recordRow.department_id || null,
            recordRow.exam_id || null,
            f.clauseId,
            f.categoryId,
            f.sceneId,
            f.outcome,
            f.label,
            f.weight,
            recordRow.completed_at || Date.now()
        );
    }

    return { stats, factsCount: facts.length };
}

/**
 * 部门树：展开选中节点及其全部子孙
 */
function expandDepartmentIds(db, rootId, includeChildren = true) {
    if (!rootId) return [];
    if (!includeChildren) return [rootId];
    const all = db.prepare('SELECT id, parent_id FROM departments').all();
    const children = {};
    for (const d of all) {
        const p = d.parent_id || '';
        if (!children[p]) children[p] = [];
        children[p].push(d.id);
    }
    const result = [];
    const stack = [rootId];
    const seen = new Set();
    while (stack.length) {
        const x = stack.pop();
        if (seen.has(x)) continue;
        seen.add(x);
        result.push(x);
        for (const c of (children[x] || [])) stack.push(c);
    }
    return result;
}

function getDepartmentMeta(db, departmentId) {
    if (!departmentId) return null;
    return db.prepare('SELECT id, name, parent_id FROM departments WHERE id = ?').get(departmentId) || null;
}

function getExamMeta(db, examId) {
    if (!examId) return null;
    const live = db.prepare('SELECT id, exam_name FROM exams WHERE id = ?').get(examId);
    if (live) return { id: live.id, examName: live.exam_name, deleted: false };
    const fromRec = db.prepare(`
        SELECT exam_id as id, MAX(exam_name) as exam_name FROM records WHERE exam_id = ?
    `).get(examId);
    if (fromRec?.id) return { id: fromRec.id, examName: fromRec.exam_name || fromRec.id, deleted: true };
    return { id: examId, examName: examId, deleted: true };
}

function resolveAnalysisMode(filters) {
    const hasE = !!filters.examId;
    const hasD = !!filters.departmentId;
    if (hasE && hasD) return 'exam_department';
    if (hasE) return 'exam';
    if (hasD) return 'department';
    return 'all';
}

function buildFilters(query, db = null) {
    const mode = query.mode && query.mode !== 'all' ? query.mode : 'exam';
    const examId = query.examId || null;
    const departmentId = query.departmentId || null;
    const includeChildren = query.includeChildren === undefined || query.includeChildren === '1' || query.includeChildren === true || query.includeChildren === 1;
    const from = query.from ? Number(query.from) : null;
    const to = query.to ? Number(query.to) : null;

    let expandedDeptIds = [];
    if (departmentId && db) {
        expandedDeptIds = expandDepartmentIds(db, departmentId, includeChildren);
    } else if (departmentId) {
        expandedDeptIds = [departmentId];
    }

    return {
        mode, examId, departmentId, includeChildren, expandedDeptIds, from, to
    };
}

function whereAttempt(filters, alias = '') {
    const p = alias ? `${alias}.` : '';
    const parts = [];
    const params = [];
    if (filters.mode) {
        parts.push(`COALESCE(${p}mode,'exam') = ?`);
        params.push(filters.mode);
    }
    if (filters.examId) {
        parts.push(`${p}exam_id = ?`);
        params.push(filters.examId);
    }
    if (filters.expandedDeptIds && filters.expandedDeptIds.length) {
        const ph = filters.expandedDeptIds.map(() => '?').join(',');
        parts.push(`${p}department_id IN (${ph})`);
        params.push(...filters.expandedDeptIds);
    } else if (filters.departmentId && !filters.expandedDeptIds?.length) {
        // 部门 id 无效时返回空集
        parts.push('1=0');
    }
    if (filters.from) {
        parts.push(`${p}completed_at >= ?`);
        params.push(filters.from);
    }
    if (filters.to) {
        parts.push(`${p}completed_at <= ?`);
        params.push(filters.to);
    }
    return {
        sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
        params
    };
}

/** 直接子部门列表（用于部门拆解图） */
function getDirectChildren(db, parentId) {
    if (!parentId) {
        return db.prepare('SELECT id, name, parent_id FROM departments WHERE parent_id IS NULL ORDER BY sort_order, name').all();
    }
    return db.prepare('SELECT id, name, parent_id FROM departments WHERE parent_id = ? ORDER BY sort_order, name').all(parentId);
}

function buildCharts(db, filters, summary, knowledge, org) {
    const priBuckets = [
        { label: '熟练', value: summary.priDistribution?.['熟练'] || 0 },
        { label: '良好', value: summary.priDistribution?.['良好'] || 0 },
        { label: '一般', value: summary.priDistribution?.['一般'] || 0 },
        { label: '生疏', value: summary.priDistribution?.['生疏'] || 0 }
    ];
    const l1Unfound = (knowledge.L1 || [])
        .filter(r => r.exposure > 0)
        .slice(0, 8)
        .map(r => ({ label: r.name, value: Math.round((r.unfoundRate || 0) * 1000) / 10, extra: r.exposure }));
    const l3Severity = (knowledge.L3 || [])
        .filter(r => (r.unfound || 0) > 0)
        .slice(0, 8)
        .map(r => ({ label: r.name, value: r.severityScore || 0, extra: r.unfound }));

    // 得分率分桶
    const { sql, params } = whereAttempt(filters);
    const rows = db.prepare(`SELECT score_rate FROM attempt_stats ${sql}`).all(...params);
    const buckets = [
        { label: '<60', value: 0 },
        { label: '60-75', value: 0 },
        { label: '75-90', value: 0 },
        { label: '≥90', value: 0 }
    ];
    for (const r of rows) {
        const s = (r.score_rate || 0) * 100;
        if (s < 60) buckets[0].value++;
        else if (s < 75) buckets[1].value++;
        else if (s < 90) buckets[2].value++;
        else buckets[3].value++;
    }

    // 子部门 PRI（当前部门的直接子节点，在过滤条件下）
    let childDeptPRI = [];
    if (filters.departmentId) {
        const children = getDirectChildren(db, filters.departmentId);
        for (const c of children) {
            const childFilters = {
                ...filters,
                departmentId: c.id,
                expandedDeptIds: expandDepartmentIds(db, c.id, true)
            };
            const cs = getSummary(db, childFilters);
            if (cs.attempts > 0) {
                childDeptPRI.push({
                    label: c.name,
                    value: cs.avgPRI,
                    extra: cs.attempts,
                    avgScoreRate: cs.avgScoreRate
                });
            }
        }
    } else if (org.departments?.length) {
        childDeptPRI = org.departments.slice(0, 10).map(d => ({
            label: d.departmentName,
            value: d.avgPRI,
            extra: d.attempts,
            avgScoreRate: d.avgScoreRate
        }));
    }

    return { priBuckets, l1Unfound, l3Severity, scoreBuckets: buckets, childDeptPRI };
}

function buildBaseline(db, filters) {
    // 对照：全库 / 仅试卷 / 仅部门
    const all = getSummary(db, { mode: filters.mode || 'exam' });
    let examOnly = null;
    let deptOnly = null;
    if (filters.examId) {
        examOnly = getSummary(db, {
            mode: filters.mode || 'exam',
            examId: filters.examId,
            expandedDeptIds: []
        });
    }
    if (filters.expandedDeptIds?.length) {
        deptOnly = getSummary(db, {
            mode: filters.mode || 'exam',
            expandedDeptIds: filters.expandedDeptIds
        });
    }
    return { all, examOnly, deptOnly };
}

function buildFilterPayload(db, filters) {
    const examMeta = getExamMeta(db, filters.examId);
    const deptMeta = getDepartmentMeta(db, filters.departmentId);
    return {
        examId: filters.examId,
        examName: examMeta?.examName || null,
        examDeleted: examMeta?.deleted || false,
        departmentId: filters.departmentId,
        departmentName: deptMeta?.name || null,
        includeChildren: !!filters.includeChildren,
        expandedDeptIds: filters.expandedDeptIds || [],
        expandedDeptCount: (filters.expandedDeptIds || []).length,
        analysisMode: resolveAnalysisMode(filters),
        mode: filters.mode || 'exam'
    };
}

function getSummary(db, filters) {
    const { sql, params } = whereAttempt(filters);
    const rows = db.prepare(`SELECT * FROM attempt_stats ${sql}`).all(...params);
    if (!rows.length) {
        return {
            attempts: 0, passRate: 0, avgScoreRate: 0, avgPRI: 0,
            avgInvalidClicks: 0, totalUnfound: 0, totalHits: 0
        };
    }
    let pass = 0, sumS = 0, sumP = 0, sumM = 0, unf = 0, hits = 0;
    for (const r of rows) {
        if ((r.score_rate || 0) >= PASS_RATE) pass++;
        sumS += r.score_rate || 0;
        sumP += r.pri || 0;
        sumM += r.invalid_clicks || 0;
        unf += r.hazards_unfound || 0;
        hits += r.hazards_hit || 0;
    }
    const n = rows.length;
    return {
        attempts: n,
        passRate: Math.round((pass / n) * 1000) / 1000,
        avgScoreRate: Math.round((sumS / n) * 1000) / 1000,
        avgPRI: Math.round((sumP / n) * 10) / 10,
        avgInvalidClicks: Math.round((sumM / n) * 10) / 10,
        totalUnfound: unf,
        totalHits: hits,
        priDistribution: {
            熟练: rows.filter(r => (r.pri || 0) >= 85).length,
            良好: rows.filter(r => (r.pri || 0) >= 70 && (r.pri || 0) < 85).length,
            一般: rows.filter(r => (r.pri || 0) >= 55 && (r.pri || 0) < 70).length,
            生疏: rows.filter(r => (r.pri || 0) < 55).length
        }
    };
}

function aggregateKnowledge(db, filters, level = 'L3') {
    const { sql, params } = whereAttempt(filters, 'a');
    // join facts with attempt filter via record_id
    const rows = db.prepare(`
        SELECT f.clause_id, f.category_id, f.scene_id, f.outcome, f.label, f.weight,
               f.user_id, f.department_id
        FROM knowledge_error_facts f
        INNER JOIN attempt_stats a ON a.record_id = f.record_id
        ${sql}
    `).all(...params);

    const clauseIndex = buildClauseIndex(db);
    const buckets = {};

    for (const r of rows) {
        let key, name, meta = {};
        if (level === 'L1') {
            key = r.scene_id || 'unknown_scene';
            name = clauseIndex[r.clause_id]?.sceneName || key;
        } else if (level === 'L2') {
            key = r.category_id || 'unknown_cat';
            name = clauseIndex[r.clause_id]?.categoryName || key;
        } else {
            key = r.clause_id || 'unknown';
            name = r.label || clauseIndex[r.clause_id]?.title || key;
            meta = clauseIndex[r.clause_id] || {};
        }
        if (!buckets[key]) {
            buckets[key] = {
                level, id: key, name,
                exposure: 0, hits: 0, unfound: 0,
                weightSum: 0, weightN: 0,
                sceneId: r.scene_id, categoryId: r.category_id,
                sceneName: meta.sceneName, categoryName: meta.categoryName
            };
        }
        const b = buckets[key];
        b.exposure++;
        if (r.outcome === 'hit') b.hits++;
        if (r.outcome === 'unfound') b.unfound++;
        if (r.weight) { b.weightSum += r.weight; b.weightN++; }
    }

    return Object.values(buckets).map(b => {
        const Ru = b.exposure > 0 ? b.unfound / b.exposure : 0;
        const M = mastery(b.hits, b.exposure);
        const avgW = b.weightN ? b.weightSum / b.weightN : 10;
        return {
            ...b,
            missRate: Math.round(Ru * 1000) / 1000, // 此处为遗漏率 unfound rate
            unfoundRate: Math.round(Ru * 1000) / 1000,
            mastery: M == null ? null : Math.round(M * 1000) / 1000,
            riskWeightAvg: Math.round(avgW * 10) / 10,
            severityScore: Math.round(Ru * avgW * 100) / 100
        };
    }).sort((a, b) => (b.severityScore || 0) - (a.severityScore || 0));
}

function getOrgAnalytics(db, filters) {
    const { sql, params } = whereAttempt(filters);
    const rows = db.prepare(`SELECT * FROM attempt_stats ${sql}`).all(...params);

    // 直接子部门（用于部门拆解）
    let childDepartments = [];
    if (filters.departmentId) {
        const children = getDirectChildren(db, filters.departmentId);
        childDepartments = children.map(c => {
            const cf = {
                ...filters,
                departmentId: c.id,
                expandedDeptIds: expandDepartmentIds(db, c.id, true)
            };
            const cs = getSummary(db, cf);
            return {
                departmentId: c.id,
                departmentName: c.name,
                attempts: cs.attempts,
                avgPRI: cs.avgPRI,
                avgScoreRate: cs.avgScoreRate,
                passRate: cs.passRate
            };
        }).filter(c => c.attempts > 0);
    }

    // 用户
    const byUser = {};
    for (const r of rows) {
        const key = r.user_id || `guest:${r.user_name || '匿名'}`;
        if (!byUser[key]) {
            byUser[key] = {
                userId: r.user_id, userName: r.user_name,
                departmentId: r.department_id,
                attempts: 0, sumPRI: 0, sumScore: 0, sumMiss: 0, pass: 0
            };
        }
        const u = byUser[key];
        u.attempts++;
        u.sumPRI += r.pri || 0;
        u.sumScore += r.score_rate || 0;
        u.sumMiss += r.invalid_clicks || 0;
        if ((r.score_rate || 0) >= PASS_RATE) u.pass++;
        if (r.department_id) u.departmentId = r.department_id;
        if (r.user_name) u.userName = r.user_name;
    }

    const depts = db.prepare('SELECT id, name, parent_id FROM departments').all();
    const deptName = Object.fromEntries(depts.map(d => [d.id, d.name]));

    const users = Object.values(byUser).map(u => {
        const avgPRI = u.attempts ? u.sumPRI / u.attempts : 0;
        const avgScore = u.attempts ? u.sumScore / u.attempts : 0;
        const avgMasteryProxy = avgScore; // 粗代理；详细掌握见 knowledge
        return {
            userId: u.userId,
            userName: u.userName,
            departmentId: u.departmentId,
            departmentName: u.departmentId ? (deptName[u.departmentId] || '') : '',
            attempts: u.attempts,
            avgPRI: Math.round(avgPRI * 10) / 10,
            priLabel: priLabel(avgPRI).label,
            avgScoreRate: Math.round(avgScore * 1000) / 1000,
            passRate: Math.round((u.pass / u.attempts) * 1000) / 1000,
            avgInvalidClicks: Math.round((u.sumMiss / u.attempts) * 10) / 10,
            quadrant: classifyQuadrant(avgMasteryProxy, avgPRI)
        };
    }).sort((a, b) => a.avgPRI - b.avgPRI);

    // 部门
    const byDept = {};
    for (const u of users) {
        const key = u.departmentId || '_none';
        if (!byDept[key]) {
            byDept[key] = {
                departmentId: u.departmentId,
                departmentName: u.departmentName || '未分配部门',
                users: 0, sumPRI: 0, sumScore: 0, sumPass: 0, attempts: 0
            };
        }
        const d = byDept[key];
        d.users++;
        d.sumPRI += u.avgPRI;
        d.sumScore += u.avgScoreRate;
        d.sumPass += u.passRate;
        d.attempts += u.attempts;
    }

    const departments = Object.values(byDept).map(d => ({
        departmentId: d.departmentId,
        departmentName: d.departmentName,
        users: d.users,
        attempts: d.attempts,
        avgPRI: Math.round((d.sumPRI / d.users) * 10) / 10,
        avgScoreRate: Math.round((d.sumScore / d.users) * 1000) / 1000,
        avgPassRate: Math.round((d.sumPass / d.users) * 1000) / 1000
    })).sort((a, b) => a.avgPRI - b.avgPRI);

    return { users, departments, childDepartments };
}

function classifyQuadrant(masteryProxy, pri) {
    const highM = masteryProxy >= 0.7;
    const highP = pri >= 70;
    if (highM && highP) return { key: 'excellent', label: '优秀' };
    if (highM && !highP) return { key: 'rusty', label: '会但手生' };
    if (!highM && highP) return { key: 'coverage', label: '熟练但知识缺口' };
    return { key: 'dual_weak', label: '双弱' };
}

function getProficiency(db, filters) {
    const { sql, params } = whereAttempt(filters);
    const rows = db.prepare(`SELECT * FROM attempt_stats ${sql} ORDER BY invalid_clicks DESC`).all(...params);
    const summary = getSummary(db, filters);
    const highMiss = rows
        .filter(r => (r.invalid_clicks || 0) >= 3)
        .slice(0, 20)
        .map(r => ({
            recordId: r.record_id,
            userName: r.user_name,
            userId: r.user_id,
            examName: r.exam_name,
            invalidClicks: r.invalid_clicks,
            pri: r.pri,
            scoreRate: r.score_rate,
            completedAt: r.completed_at
        }));

    return {
        distribution: summary.priDistribution,
        avgPRI: summary.avgPRI,
        avgInvalidClicks: summary.avgInvalidClicks,
        highMissAttempts: highMiss,
        note: '无效点击(miss)计入熟练度，不计入知识薄弱 Top'
    };
}

function buildInsights(db, filters) {
    const summary = getSummary(db, filters);
    const knowledgeL3 = aggregateKnowledge(db, filters, 'L3').slice(0, 10);
    const knowledgeL1 = aggregateKnowledge(db, filters, 'L1').slice(0, 5);
    const { users, departments, childDepartments } = getOrgAnalytics(db, filters);
    const insights = [];
    const mode = resolveAnalysisMode(filters);
    const examMeta = getExamMeta(db, filters.examId);
    const deptMeta = getDepartmentMeta(db, filters.departmentId);

    if (summary.attempts === 0) {
        let tip = '当前筛选条件下暂无正式考核成绩，请先组织考试以积累学情数据。';
        if (mode === 'exam_department') tip = `部门「${deptMeta?.name || ''}」在试卷「${examMeta?.examName || ''}」下暂无交卷记录。`;
        else if (mode === 'exam') tip = `试卷「${examMeta?.examName || filters.examId}」暂无交卷记录。`;
        else if (mode === 'department') tip = `部门「${deptMeta?.name || ''}」${filters.includeChildren ? '（含下级）' : ''}暂无交卷记录。`;
        insights.push({ level: 'info', code: 'NO_DATA', text: tip });
        return insights;
    }

    const scopeBits = [];
    if (mode === 'exam' || mode === 'exam_department') scopeBits.push(`试卷《${examMeta?.examName || filters.examId}》`);
    if (mode === 'department' || mode === 'exam_department') {
        scopeBits.push(`部门「${deptMeta?.name || ''}」${filters.includeChildren && (filters.expandedDeptIds?.length || 0) > 1 ? `（含 ${filters.expandedDeptIds.length - 1} 个下级）` : ''}`);
    }
    const scope = scopeBits.length ? scopeBits.join(' · ') + '：' : '';

    insights.push({
        level: 'info',
        code: 'SUMMARY',
        text: `${scope}共 ${summary.attempts} 次考核，通过率 ${(summary.passRate * 100).toFixed(1)}%，平均得分率 ${(summary.avgScoreRate * 100).toFixed(1)}%，平均识别熟练度 PRI ${summary.avgPRI}（${priLabel(summary.avgPRI).label}）。`
    });

    // 对照差值
    const baseline = buildBaseline(db, filters);
    if (mode === 'exam_department' && baseline.examOnly?.attempts) {
        const dS = summary.avgScoreRate - baseline.examOnly.avgScoreRate;
        const dP = summary.avgPRI - baseline.examOnly.avgPRI;
        insights.push({
            level: dS < -0.05 || dP < -5 ? 'warn' : 'tip',
            code: 'EXAM_DEPT_DELTA',
            text: `相对本卷全体：得分率 ${dS >= 0 ? '+' : ''}${(dS * 100).toFixed(1)}pt，PRI ${dP >= 0 ? '+' : ''}${dP.toFixed(1)}。`
        });
    }
    if ((mode === 'department' || mode === 'exam_department') && childDepartments?.length) {
        const weakest = [...childDepartments].sort((a, b) => a.avgPRI - b.avgPRI)[0];
        if (weakest) {
            insights.push({
                level: 'tip',
                code: 'DEPT_CHILD_SPLIT',
                text: `下级部门中「${weakest.departmentName}」PRI 最低（${weakest.avgPRI}，n=${weakest.attempts}），建议优先帮扶。`
            });
        }
    }

    for (const k of knowledgeL3.slice(0, 5)) {
        if (k.exposure >= 3 && k.unfoundRate >= 0.4) {
            insights.push({
                level: 'warn',
                code: 'KNOWLEDGE_GAP_L3',
                text: `细则「${k.name}」遗漏率 ${(k.unfoundRate * 100).toFixed(0)}%（暴露 ${k.exposure} 次），建议专项复训。`,
                refs: { clauseId: k.id, severity: k.severityScore }
            });
        }
    }

    if (departments.length && knowledgeL1.length) {
        const companyAvg = summary.avgScoreRate;
        for (const d of departments) {
            if (d.users >= 1 && d.avgScoreRate <= companyAvg - 0.15) {
                insights.push({
                    level: 'warn',
                    code: 'DEPT_BELOW',
                    text: `部门「${d.departmentName}」平均得分率 ${(d.avgScoreRate * 100).toFixed(1)}%，低于整体约 ${((companyAvg - d.avgScoreRate) * 100).toFixed(0)} 个百分点。`,
                    refs: { departmentId: d.departmentId }
                });
            }
        }
    }

    for (const u of users) {
        if (u.attempts < 1) continue;
        if (u.quadrant.key === 'rusty') {
            insights.push({
                level: 'tip',
                code: 'RUSTY_USER',
                text: `「${u.userName}」得分尚可但 PRI 偏低（${u.avgPRI}），无效点击偏多（均 ${u.avgInvalidClicks} 次），建议做限时扫描练习。`,
                refs: { userId: u.userId }
            });
        }
        if (u.quadrant.key === 'dual_weak') {
            insights.push({
                level: 'warn',
                code: 'DUAL_WEAK',
                text: `「${u.userName}」知识与识别双弱（得分率 ${(u.avgScoreRate * 100).toFixed(0)}%，PRI ${u.avgPRI}），建议先练习模式再考核。`,
                refs: { userId: u.userId }
            });
        }
    }

    if (summary.avgInvalidClicks >= 4) {
        insights.push({
            level: 'tip',
            code: 'HIGH_MISS_GLOBAL',
            text: `整体人均无效点击 ${summary.avgInvalidClicks} 次/卷，偏高。请检查标注热区是否过小，或加强「先观察再点击」的操作规范。`
        });
    }

    // 去重限量
    return insights.slice(0, 30);
}

function buildOverview(db, query) {
    const filters = buildFilters(query, db);
    const summary = getSummary(db, filters);
    const knowledge = {
        L1: aggregateKnowledge(db, filters, 'L1'),
        L2: aggregateKnowledge(db, filters, 'L2'),
        L3: aggregateKnowledge(db, filters, 'L3').slice(0, 50)
    };
    const org = getOrgAnalytics(db, filters);
    const proficiency = getProficiency(db, filters);
    const insights = buildInsights(db, filters);
    const charts = buildCharts(db, filters, summary, knowledge, org);
    const baseline = buildBaseline(db, filters);
    const filter = buildFilterPayload(db, filters);
    return { filter, summary, baseline, knowledge, org, proficiency, insights, charts };
}

module.exports = {
    summarizeSessionLog,
    materializeAttempt,
    buildFilters,
    expandDepartmentIds,
    getSummary,
    aggregateKnowledge,
    getOrgAnalytics,
    getProficiency,
    buildInsights,
    buildOverview,
    buildCharts,
    priLabel,
    parseLog,
    PASS_RATE,
    MAX_MISS_DEFAULT
};
