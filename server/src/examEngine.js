const { newId } = require('./auth');
const { hitTestAnnotation } = require('./hitTest');
const { buildPointScoreMap, clampScore, getGrade, parseExamSettings } = require('./scoring');
const analytics = require('./analytics');

const MAX_MISS = 3;

function emptyState() {
    return { hits: {}, missBySlide: {}, revealed: {}, log: [] };
}

function annotationSnapshot(db, assetId) {
    const annos = db.prepare('SELECT * FROM annotations WHERE asset_id = ?').all(assetId);
    return annos.map((a) => ({
        id: a.id,
        shape: a.shape,
        rect: { x: a.x, y: a.y, w: a.w, h: a.h },
        clauseId: a.clause_id,
        scoreWeight: a.score_weight,
        description: a.description || ''
    }));
}

function buildSnapshot(db, exam, mode) {
    const rows = db.prepare(
        'SELECT asset_id, item_meta FROM exam_items WHERE exam_id = ? ORDER BY order_index ASC'
    ).all(exam.id);
    const settings = parseExamSettings(exam.settings);
    const slides = [];
    const allPoints = [];
    for (const row of rows) {
        let items = null;
        if (row.item_meta) {
            try {
                const parsed = JSON.parse(row.item_meta);
                if (Array.isArray(parsed) && parsed.length) items = parsed;
            } catch (_) { items = null; }
        }
        if (!items) {
            const annos = db.prepare('SELECT * FROM annotations WHERE asset_id = ?').all(row.asset_id);
            items = annos.map((a) => ({
                id: a.id,
                shape: a.shape,
                rect: { x: a.x, y: a.y, w: a.w, h: a.h },
                clauseId: a.clause_id,
                scoreWeight: a.score_weight,
                description: a.description || ''
            }));
        }
        allPoints.push(...items);
        slides.push({ assetId: row.asset_id, items });
    }
    const scoreMap = buildPointScoreMap(allPoints, {
        total_score: settings.totalScore,
        scoring_rule: settings.scoringRule
    });
    for (const s of slides) {
        for (const it of s.items) it.points = scoreMap[it.id] || 0;
    }
    return {
        examId: exam.id,
        examName: exam.exam_name,
        mode,
        paperTotal: settings.totalScore,
        scoringRule: settings.scoringRule,
        timeLimitSec: settings.timeLimitSec,
        maxMiss: MAX_MISS,
        slides
    };
}

function computeScore(snapshot, state) {
    let raw = 0;
    for (const s of snapshot.slides) {
        for (const it of s.items) {
            if (state.hits[it.id]) raw += Number(it.points) || 0;
        }
    }
    return clampScore(raw, snapshot.paperTotal);
}

function isExpired(row, snapshot, now = Date.now()) {
    if (row.status !== 'active') return row.status !== 'active';
    const limit = Number(snapshot.timeLimitSec) || 0;
    if (limit > 0 && now >= row.started_at + limit * 1000) return true;
    return false;
}

function remainingSec(row, snapshot, now = Date.now()) {
    const limit = Number(snapshot.timeLimitSec) || 0;
    if (limit <= 0) return null;
    return Math.max(0, Math.ceil((row.started_at + limit * 1000 - now) / 1000));
}

function serializeItem(it, found) {
    return {
        id: it.id,
        shape: it.shape,
        rect: it.rect,
        clauseId: it.clauseId,
        description: it.description,
        points: it.points,
        found
    };
}

function publicSlide(slide, state, mode) {
    const revealed = !!state.revealed[slide.assetId];
    const visible = slide.items.filter((it) => revealed || state.hits[it.id]);
    return {
        assetId: slide.assetId,
        url: `/assets/raw/${encodeURIComponent(slide.assetId)}`,
        hazardHint: mode === 'practice' || revealed ? slide.items.length : undefined,
        foundCount: slide.items.filter((it) => state.hits[it.id]).length,
        missCount: state.missBySlide[slide.assetId] || 0,
        revealed,
        items: visible.map((it) => serializeItem(it, !!state.hits[it.id]))
    };
}

function publicAttempt(row, snapshot, state) {
    return {
        id: row.id,
        examId: snapshot.examId,
        examName: snapshot.examName,
        mode: snapshot.mode,
        status: row.status,
        paperTotal: snapshot.paperTotal,
        scoringRule: snapshot.scoringRule,
        timeLimitSec: snapshot.timeLimitSec,
        maxMiss: snapshot.maxMiss,
        userName: row.user_name,
        department: row.department,
        startedAt: row.started_at,
        timeLeft: remainingSec(row, snapshot),
        expired: isExpired(row, snapshot),
        score: computeScore(snapshot, state),
        slides: snapshot.slides.map((s) => publicSlide(s, state, snapshot.mode))
    };
}

function persist(db, id, state) {
    db.prepare('UPDATE exam_attempts SET state_json = ? WHERE id = ?').run(JSON.stringify(state), id);
}

function loadAttempt(db, id) {
    const row = db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(id);
    if (!row) return null;
    const snapshot = JSON.parse(row.snapshot_json);
    const state = JSON.parse(row.state_json || '{"hits":{},"missBySlide":{},"revealed":{},"log":[]}');
    return { row, snapshot, state };
}

function startAttempt(db, { exam, mode, identity }) {
    const attemptMode = mode === 'practice' ? 'practice' : 'exam';
    const snapshot = buildSnapshot(db, exam, attemptMode);
    if (!snapshot.slides.length) {
        const err = new Error('该试卷没有题目');
        err.status = 400;
        throw err;
    }
    const id = newId('att');
    const now = Date.now();
    const state = emptyState();
    db.prepare(`
        INSERT INTO exam_attempts (
            id, exam_id, exam_name, user_id, user_name, department, department_id, employee_id,
            mode, paper_total, scoring_rule, time_limit_sec, started_at, status, snapshot_json, state_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
        id, exam.id, exam.exam_name, identity.userId || null, identity.userName,
        identity.department || null, identity.departmentId || null, identity.employeeId || null,
        attemptMode, snapshot.paperTotal, snapshot.scoringRule, snapshot.timeLimitSec,
        now, JSON.stringify(snapshot), JSON.stringify(state)
    );
    const row = db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(id);
    return publicAttempt(row, snapshot, state);
}

function applyClick(db, id, { slideId, x, y }) {
    const loaded = loadAttempt(db, id);
    if (!loaded) {
        const err = new Error('开考会话不存在');
        err.status = 404;
        throw err;
    }
    const { row, snapshot, state } = loaded;
    if (row.status === 'submitted') {
        const err = new Error('本场已交卷');
        err.status = 409;
        throw err;
    }
    const now = Date.now();
    if (isExpired(row, snapshot, now)) {
        if (row.status === 'active') {
            db.prepare("UPDATE exam_attempts SET status = 'expired' WHERE id = ?").run(id);
            row.status = 'expired';
        }
        return { expired: true, result: 'expired', ...publicAttempt(row, snapshot, state) };
    }

    const uX = Number(x);
    const uY = Number(y);
    if (!Number.isFinite(uX) || !Number.isFinite(uY)) {
        const err = new Error('坐标无效');
        err.status = 400;
        throw err;
    }

    const slide = snapshot.slides.find((s) => s.assetId === slideId);
    if (!slide) {
        const err = new Error('题目不存在');
        err.status = 400;
        throw err;
    }

    if (state.revealed[slide.assetId]) {
        return { result: 'revealed', ...publicAttempt(row, snapshot, state), slide: publicSlide(slide, state, snapshot.mode) };
    }

    let hitItem = null;
    for (const item of slide.items) {
        if (state.hits[item.id]) continue;
        if (hitTestAnnotation(uX, uY, item)) {
            hitItem = item;
            break;
        }
    }

    if (hitItem) {
        state.hits[hitItem.id] = { t: now, slideId };
        state.log.push({
            v: 2, t: now, type: 'click', result: 'hit',
            x: uX, y: uY, itemId: hitItem.id, clauseId: hitItem.clauseId,
            label: hitItem.description || hitItem.clauseId,
            scoreDelta: hitItem.points, slideId
        });
        const allFound = slide.items.every((it) => state.hits[it.id]);
        if (allFound) state.revealed[slide.assetId] = true;
        persist(db, id, state);
        return {
            result: 'hit',
            item: serializeItem(hitItem, true),
            scoreDelta: hitItem.points,
            ...publicAttempt(row, snapshot, state),
            slide: publicSlide(slide, state, snapshot.mode)
        };
    }

    state.missBySlide[slide.assetId] = (state.missBySlide[slide.assetId] || 0) + 1;
    const missIndex = state.missBySlide[slide.assetId];
    state.log.push({
        v: 2, t: now, type: 'click', result: 'miss', kind: 'invalid_click',
        x: uX, y: uY, missIndex, slideId
    });
    if (missIndex >= snapshot.maxMiss) state.revealed[slide.assetId] = true;
    persist(db, id, state);
    return {
        result: 'miss',
        missCount: missIndex,
        ...publicAttempt(row, snapshot, state),
        slide: publicSlide(slide, state, snapshot.mode)
    };
}

function submitAttempt(db, id) {
    const loaded = loadAttempt(db, id);
    if (!loaded) {
        const err = new Error('开考会话不存在');
        err.status = 404;
        throw err;
    }
    const { row, snapshot, state } = loaded;
    if (row.status === 'submitted' && row.record_id) {
        const prev = db.prepare('SELECT * FROM records WHERE id = ?').get(row.record_id);
        return {
            already: true,
            recordId: row.record_id,
            score: prev?.score ?? computeScore(snapshot, state),
            paperTotal: snapshot.paperTotal,
            grade: getGrade(prev?.score ?? 0, snapshot.paperTotal),
            mode: snapshot.mode,
            pri: null,
            missed: []
        };
    }

    const now = Date.now();
    for (const slide of snapshot.slides) {
        for (const it of slide.items) {
            if (state.hits[it.id]) continue;
            state.log.push({
                v: 2, t: now, type: 'submit', result: 'unfound',
                itemId: it.id, clauseId: it.clauseId,
                label: it.description || it.clauseId, slideId: slide.assetId
            });
        }
        state.revealed[slide.assetId] = true;
    }

    const score = computeScore(snapshot, state);
    const duration = now - row.started_at;
    const hazardsTotal = snapshot.slides.reduce((n, s) => n + s.items.length, 0);

    let recordId;
    let mat = null;
    const tx = db.transaction(() => {
        const info = db.prepare(`
            INSERT INTO records (
                exam_id, exam_name, user_name, user_id, score, paper_total, mode,
                completed_at, department, department_id, employee_id, duration, session_log
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            snapshot.examId, snapshot.examName, row.user_name, row.user_id,
            score, snapshot.paperTotal, snapshot.mode, now,
            row.department, row.department_id, row.employee_id, duration,
            JSON.stringify(state.log)
        );
        recordId = info.lastInsertRowid;
        mat = analytics.materializeAttempt(db, recordId, {
            user_id: row.user_id,
            department_id: row.department_id,
            exam_id: snapshot.examId,
            exam_name: snapshot.examName,
            user_name: row.user_name,
            mode: snapshot.mode,
            score,
            paper_total: snapshot.paperTotal,
            duration,
            completed_at: now
        }, state.log, { hazardsTotal, slideCount: snapshot.slides.length });
        db.prepare(`
            UPDATE exam_attempts SET status = 'submitted', submitted_at = ?, state_json = ?, record_id = ? WHERE id = ?
        `).run(now, JSON.stringify(state), recordId, id);
    });
    tx();

    const missed = [];
    for (const slide of snapshot.slides) {
        for (const it of slide.items) {
            if (!state.hits[it.id]) missed.push(serializeItem(it, false));
        }
    }

    return {
        recordId,
        score,
        paperTotal: snapshot.paperTotal,
        grade: getGrade(score, snapshot.paperTotal),
        mode: snapshot.mode,
        duration,
        pri: mat?.stats?.pri ?? null,
        invalidClicks: mat?.stats?.invalidClicks ?? null,
        missed,
        attempt: publicAttempt({ ...row, status: 'submitted' }, snapshot, state)
    };
}

module.exports = {
    MAX_MISS,
    buildSnapshot,
    startAttempt,
    applyClick,
    submitAttempt,
    loadAttempt,
    publicAttempt,
    computeScore,
    annotationSnapshot
};
