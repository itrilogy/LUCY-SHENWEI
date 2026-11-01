const express = require('express');
const { getDB } = require('../db');
const { newId } = require('../auth');
const session = require('../session');
const examEngine = require('../examEngine');
const analytics = require('../analytics');
const attendance = require('../attendance');
const { writeAudit } = require('../audit');
const { parseExamSettings } = require('../scoring');

const router = express.Router();

function mapExamRow(e, items) {
    const settings = parseExamSettings(e.settings);
    return {
        name: e.id,
        examName: e.exam_name,
        description: e.description,
        status: e.status || 'published',
        slides: items.map(i => i.asset_id),
        mtime: e.created_at,
        settings,
        totalScore: settings.totalScore,
        scoringRule: settings.scoringRule,
        timeLimitSec: settings.timeLimitSec,
        total_score: settings.totalScore,
        scoring_rule: settings.scoringRule,
        time_limit_sec: settings.timeLimitSec
    };
}

function mapRecordRow(r) {
    return {
        id: r.id,
        userName: r.user_name,
        userId: r.user_id || null,
        examId: r.exam_id,
        examName: r.exam_name || r.exam_id,
        score: r.score,
        paperTotal: r.paper_total != null ? r.paper_total : null,
        mode: r.mode || 'exam',
        completedAt: r.completed_at,
        department: r.department || null,
        departmentId: r.department_id || null,
        employeeId: r.employee_id || null,
        duration: r.duration != null ? r.duration : null,
        hasSessionLog: !!(r.session_log)
    };
}

// 保存用户成绩 + 学情物化（attempt_stats / knowledge_error_facts）
router.post('/session/record', async (req, res) => {
    try {
        const db = getDB();
        const {
            examId, userName, score, completedAt, department, employeeId, duration,
            paperTotal, userId, mode, sessionLog, examName, departmentId,
            hazardsTotal, slideCount
        } = req.body;
        if (!userName || !String(userName).trim()) {
            return res.status(400).json({ error: '姓名不能为空' });
        }

        const attemptMode = (mode === 'practice') ? 'practice' : 'exam';
        let maxScore = 100;
        let snapshotName = examName || examId || 'unknown';
        let slides = Number(slideCount) || 1;
        if (paperTotal != null && Number(paperTotal) > 0) {
            maxScore = Number(paperTotal);
        }
        if (examId) {
            const exam = db.prepare('SELECT exam_name, settings FROM exams WHERE id = ?').get(examId);
            if (exam) {
                snapshotName = exam.exam_name || examId;
                if (paperTotal == null) {
                    const s = parseExamSettings(exam.settings);
                    maxScore = s.totalScore || 100;
                }
            }
            if (!slideCount) {
                const n = db.prepare('SELECT count(*) as c FROM exam_items WHERE exam_id = ?').get(examId)?.c;
                if (n) slides = n;
            }
        }

        const raw = Math.round(Number(score) || 0);
        const finalScore = Math.max(0, Math.min(maxScore, raw));
        const logJson = sessionLog != null ? JSON.stringify(sessionLog) : null;
        const completed = completedAt || Date.now();

        const info = db.prepare(`
            INSERT INTO records (
                exam_id, exam_name, user_name, user_id, score, paper_total, mode,
                completed_at, department, department_id, employee_id, duration, session_log
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            examId || 'unknown',
            snapshotName,
            String(userName).trim(),
            userId || null,
            finalScore,
            maxScore,
            attemptMode,
            completed,
            department ? String(department).trim() : null,
            departmentId || null,
            employeeId ? String(employeeId).trim() : null,
            duration != null ? Number(duration) : null,
            logJson
        );

        const recordId = info.lastInsertRowid;
        const recordRow = {
            user_id: userId || null,
            department_id: departmentId || null,
            exam_id: examId || 'unknown',
            exam_name: snapshotName,
            user_name: String(userName).trim(),
            mode: attemptMode,
            score: finalScore,
            paper_total: maxScore,
            duration: duration != null ? Number(duration) : null,
            completed_at: completed
        };

        let mat = null;
        try {
            mat = analytics.materializeAttempt(db, recordId, recordRow, sessionLog || [], {
                hazardsTotal: hazardsTotal != null ? Number(hazardsTotal) : undefined,
                slideCount: slides
            });
        } catch (me) {
            console.error('[analytics materialize]', me);
        }

        res.json({
            status: "success",
            score: finalScore,
            capped: finalScore !== raw,
            mode: attemptMode,
            recordId,
            pri: mat?.stats?.pri ?? null,
            invalidClicks: mat?.stats?.invalidClicks ?? null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 组卷保存/发布
router.post('/exams/publish', async (req, res) => {
    try {
        const db = getDB();
        const { examId: incomingId, examName, description, slides, status, total_score, scoring_rule, time_limit_sec } = req.body;
        if (!examName || !String(examName).trim()) return res.status(400).json({ error: '请填写卷名' });
        const finalStatus = status || 'published';
        const settings = JSON.stringify({
            totalScore: total_score || 100,
            scoringRule: scoring_rule || 'weighted',
            timeLimitSec: time_limit_sec != null ? Number(time_limit_sec) : 0
        });

        let examId = incomingId && String(incomingId).trim();
        const existing = examId ? db.prepare('SELECT id FROM exams WHERE id = ?').get(examId) : null;
        if (!existing) examId = newId('exam');

        const upsert = existing
            ? db.prepare('UPDATE exams SET exam_name = ?, description = ?, status = ?, settings = ? WHERE id = ?')
            : db.prepare('INSERT INTO exams (id, exam_name, description, status, settings, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        const deleteItems = db.prepare('DELETE FROM exam_items WHERE exam_id = ?');
        const insertItem = db.prepare('INSERT INTO exam_items (exam_id, asset_id, order_index, item_meta) VALUES (?, ?, ?, ?)');

        const tx = db.transaction(() => {
            if (existing) upsert.run(String(examName).trim(), description || '', finalStatus, settings, examId);
            else upsert.run(examId, String(examName).trim(), description || '', finalStatus, settings, Date.now());
            deleteItems.run(examId);
            (slides || []).forEach((assetId, idx) => {
                const snap = examEngine.annotationSnapshot(db, assetId);
                insertItem.run(examId, assetId, idx, JSON.stringify(snap));
            });
        });
        tx();
        writeAudit(db, req, finalStatus === 'published' ? 'exam.publish' : 'exam.save', examId, examName);
        const actionText = finalStatus === 'published' ? '发布' : '保存';
        res.json({ status: 'success', examId, message: `试卷【${examName}】${actionText}成功！` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 拉取最新考卷
router.get('/exams/latest', async (req, res) => {
    try {
        const db = getDB();
        const exam = session.isStaff(req.user)
            ? db.prepare('SELECT * FROM exams ORDER BY created_at DESC LIMIT 1').get()
            : db.prepare("SELECT * FROM exams WHERE status = 'published' ORDER BY created_at DESC LIMIT 1").get();
        if (!exam) return res.status(404).json({ error: "No exams found" });

        const items = db.prepare('SELECT asset_id FROM exam_items WHERE exam_id = ? ORDER BY order_index ASC').all(exam.id);
        res.json(mapExamRow(exam, items));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 拉取所有考卷列表
router.get('/exams', async (req, res) => {
    try {
        const db = getDB();
        const exams = db.prepare('SELECT * FROM exams ORDER BY created_at DESC').all();
        const staff = session.isStaff(req.user);

        const data = exams
            .filter(e => staff || (e.status || 'published') === 'published')
            .map(e => {
                const items = db.prepare('SELECT asset_id FROM exam_items WHERE exam_id = ? ORDER BY order_index ASC').all(e.id);
                return mapExamRow(e, items);
            });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/exams/:id', (req, res) => {
    try {
        if (req.params.id === 'latest') return res.status(404).json({ error: 'Not found' });
        const db = getDB();
        const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
        if (!exam) return res.status(404).json({ error: '试卷不存在' });
        if ((exam.status || 'published') !== 'published' && !session.isStaff(req.user)) {
            return res.status(403).json({ error: '试卷未发布' });
        }
        const items = db.prepare('SELECT asset_id, order_index FROM exam_items WHERE exam_id = ? ORDER BY order_index ASC').all(exam.id);
        res.json(mapExamRow(exam, items));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 删除试卷（保留 records；先补齐 exam_name 快照）
router.delete('/exams/:id', async (req, res) => {
    try {
        const db = getDB();
        const examId = req.params.id;
        const exam = db.prepare('SELECT exam_name FROM exams WHERE id = ?').get(examId);
        const snapName = exam?.exam_name || examId;
        const kept = db.prepare('SELECT count(*) as c FROM records WHERE exam_id = ?').get(examId)?.c || 0;

        const tx = db.transaction(() => {
            db.prepare(`
                UPDATE records SET exam_name = COALESCE(NULLIF(exam_name, ''), ?)
                WHERE exam_id = ?
            `).run(snapName, examId);
            db.prepare('DELETE FROM exam_items WHERE exam_id = ?').run(examId);
            db.prepare('DELETE FROM exams WHERE id = ?').run(examId);
            db.prepare('DELETE FROM attempt_stats WHERE exam_id = ? AND record_id NOT IN (SELECT id FROM records)').run(examId);
            db.prepare('DELETE FROM knowledge_error_facts WHERE exam_id = ? AND record_id NOT IN (SELECT id FROM records)').run(examId);
        });
        tx();
        writeAudit(db, req, 'exam.delete', examId, snapName);
        res.json({
            status: "success",
            message: `试卷已删除；保留 ${kept} 条历史成绩，可在报表/龙虎榜按 exam_id 查询`,
            recordsKept: kept,
            examId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 切换考卷发布状态
router.put('/exams/:id/status', async (req, res) => {
    try {
        const db = getDB();
        const { status } = req.body;
        db.prepare('UPDATE exams SET status = ? WHERE id = ?').run(status, req.params.id);
        res.json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 龙虎榜数据
router.get('/session/records/latest', async (req, res) => {
    try {
        const db = getDB();
        const examId = req.query.examId || null;
        const rankMode = (req.query.mode || 'best').toLowerCase();
        const attemptMode = (req.query.attemptMode || 'exam').toLowerCase();
        const modeVal = attemptMode === 'all' ? null : (attemptMode === 'practice' ? 'practice' : 'exam');

        const whereParts = [];
        const params = [];
        if (examId) { whereParts.push('exam_id = ?'); params.push(examId); }
        if (modeVal) { whereParts.push("COALESCE(mode, 'exam') = ?"); params.push(modeVal); }
        const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        if (rankMode === 'all') {
            const rows = db.prepare(`SELECT * FROM records ${whereSql} ORDER BY score DESC, completed_at DESC LIMIT 50`).all(...params);
            return res.json(rows.map(mapRecordRow));
        }

        const rows = db.prepare(`
            SELECT r.* FROM records r
            INNER JOIN (
                SELECT
                    exam_id,
                    COALESCE(user_id, '') AS uid,
                    LOWER(TRIM(user_name)) AS uname,
                    COALESCE(TRIM(department), '') AS dept,
                    MAX(score) AS max_score
                FROM records
                ${whereSql}
                GROUP BY exam_id, COALESCE(user_id, ''), LOWER(TRIM(user_name)), COALESCE(TRIM(department), '')
            ) t ON r.exam_id = t.exam_id
                AND COALESCE(r.user_id, '') = t.uid
                AND LOWER(TRIM(r.user_name)) = t.uname
                AND COALESCE(TRIM(r.department), '') = t.dept
                AND r.score = t.max_score
            GROUP BY r.exam_id, COALESCE(r.user_id, ''), LOWER(TRIM(r.user_name)), COALESCE(TRIM(r.department), '')
            ORDER BY r.score DESC, r.completed_at ASC
            LIMIT 20
        `).all(...params);
        res.json(rows.map(mapRecordRow));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 考试任务与指派 Assignments ---
router.get('/admin/assignments', (req, res) => {
    try {
        res.json(attendance.listAssignments(getDB(), req.query.examId || null));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/assignments', (req, res) => {
    try {
        const db = getDB();
        const { examId, dueAt, required, departmentIds, userIds } = req.body || {};
        if (!examId) return res.status(400).json({ error: '缺少试卷' });
        const exam = db.prepare('SELECT id FROM exams WHERE id = ?').get(examId);
        if (!exam) return res.status(404).json({ error: '试卷不存在' });
        const id = newId('asg');
        db.transaction(() => {
            db.prepare('INSERT INTO assignments (id, exam_id, due_at, required, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
                .run(id, examId, dueAt ? Number(dueAt) : null, required === false ? 0 : 1, Date.now(), req.user?.id || null);
            const ins = db.prepare('INSERT INTO assignment_targets (assignment_id, kind, target_id) VALUES (?, ?, ?)');
            for (const d of departmentIds || []) ins.run(id, 'department', d);
            for (const u of userIds || []) ins.run(id, 'user', u);
        })();
        writeAudit(db, req, 'assignment.create', examId, { departmentIds, userIds, required });
        res.json({ id, examId });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/assignments/:id', (req, res) => {
    try {
        const db = getDB();
        db.transaction(() => {
            db.prepare('DELETE FROM assignment_targets WHERE assignment_id = ?').run(req.params.id);
            db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
        })();
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.mapRecordRow = mapRecordRow;
