const express = require('express');
const { getDB } = require('../db');
const analytics = require('../analytics');
const attendance = require('../attendance');
const { mapRecordRow } = require('./exams');

const router = express.Router();

function csvEscape(v) {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

// 考试记录综合查询（带过滤、分页、试卷存续标记、会话日志）
router.get('/admin/reports/records', (req, res) => {
    try {
        const db = getDB();
        const { examId, department, userName, mode, limit, from, to } = req.query;
        let sql = 'SELECT * FROM records WHERE 1=1';
        const params = [];
        if (examId) { sql += ' AND exam_id = ?'; params.push(examId); }
        if (department) { sql += ' AND department LIKE ?'; params.push(`%${department}%`); }
        if (userName) { sql += ' AND user_name LIKE ?'; params.push(`%${userName}%`); }
        if (mode && mode !== 'all') { sql += " AND COALESCE(mode, 'exam') = ?"; params.push(mode); }
        if (from) { sql += ' AND completed_at >= ?'; params.push(Number(from)); }
        if (to) { sql += ' AND completed_at <= ?'; params.push(Number(to)); }
        sql += ' ORDER BY completed_at DESC LIMIT ?';
        params.push(Math.min(Number(limit) || 200, 1000));
        const rows = db.prepare(sql).all(...params);

        const examIds = [...new Set(rows.map(r => r.exam_id))];
        const existing = new Set(
            examIds.length
                ? db.prepare(`SELECT id FROM exams WHERE id IN (${examIds.map(() => '?').join(',')})`).all(...examIds).map(e => e.id)
                : []
        );
        res.json(rows.map(r => ({
            ...mapRecordRow(r),
            examDeleted: !existing.has(r.exam_id),
            sessionLog: r.session_log ? JSON.parse(r.session_log) : null
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 成绩导出为 CSV
router.get('/admin/reports/export.csv', (req, res) => {
    try {
        const db = getDB();
        const { examId, mode } = req.query;
        let sql = 'SELECT * FROM records WHERE 1=1';
        const params = [];
        if (examId) { sql += ' AND exam_id = ?'; params.push(examId); }
        if (mode && mode !== 'all') { sql += " AND COALESCE(mode, 'exam') = ?"; params.push(mode); }
        sql += ' ORDER BY completed_at DESC LIMIT 5000';
        const rows = db.prepare(sql).all(...params);
        const header = ['id', 'exam_id', 'exam_name', 'user_name', 'user_id', 'department', 'employee_id', 'score', 'paper_total', 'mode', 'duration_ms', 'completed_at'];
        const lines = [header.join(',')];
        for (const r of rows) {
            lines.push([
                r.id,
                csvEscape(r.exam_id),
                csvEscape(r.exam_name || r.exam_id),
                csvEscape(r.user_name),
                csvEscape(r.user_id || ''),
                csvEscape(r.department || ''),
                csvEscape(r.employee_id || ''),
                r.score,
                r.paper_total ?? '',
                r.mode || 'exam',
                r.duration ?? '',
                r.completed_at ? new Date(r.completed_at).toISOString() : ''
            ].join(','));
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="safespot-records.csv"');
        res.send('﻿' + lines.join('\n'));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 知识薄弱 Top：优先物化表，回退会话日志
router.get('/admin/reports/weak-items', (req, res) => {
    try {
        const db = getDB();
        const filters = analytics.buildFilters(req.query, db);
        const level = req.query.level || 'L3';
        const limit = Number(req.query.limit) || 20;

        const fromFacts = db.prepare('SELECT count(*) as c FROM knowledge_error_facts').get()?.c || 0;
        if (fromFacts > 0) {
            const rows = analytics.aggregateKnowledge(db, filters, level === 'L1' ? 'L1' : level === 'L2' ? 'L2' : 'L3')
                .filter(r => r.unfound > 0)
                .slice(0, limit)
                .map(r => ({
                    key: r.id,
                    clauseId: level === 'L3' ? r.id : null,
                    label: r.name,
                    count: r.unfound,
                    exposure: r.exposure,
                    unfoundRate: r.unfoundRate,
                    mastery: r.mastery,
                    severityScore: r.severityScore
                }));
            return res.json(rows);
        }

        let sql = "SELECT session_log FROM records WHERE session_log IS NOT NULL AND COALESCE(mode,'exam') = 'exam'";
        const params = [];
        if (req.query.examId) { sql += ' AND exam_id = ?'; params.push(req.query.examId); }
        sql += ' ORDER BY completed_at DESC LIMIT 500';
        const rows = db.prepare(sql).all(...params);
        const missMap = {};
        for (const r of rows) {
            let log;
            try { log = JSON.parse(r.session_log); } catch { continue; }
            if (!Array.isArray(log)) continue;
            for (const ev of log) {
                if (ev.result !== 'unfound') continue;
                const key = ev.clauseId || ev.itemId;
                if (!key) continue;
                if (!missMap[key]) {
                    missMap[key] = { key, clauseId: ev.clauseId || null, itemId: ev.itemId || null, count: 0, label: ev.label || key };
                }
                missMap[key].count++;
            }
        }
        res.json(Object.values(missMap).sort((a, b) => b.count - a.count).slice(0, limit));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 成绩卷宗列表（含已删试卷的 exam_id，便于报表筛选）
router.get('/admin/reports/exam-ids', (req, res) => {
    try {
        const db = getDB();
        const fromRecords = db.prepare(`
            SELECT exam_id as id, MAX(exam_name) as exam_name, count(*) as record_count,
                   MAX(completed_at) as last_at
            FROM records GROUP BY exam_id ORDER BY last_at DESC
        `).all();
        const live = new Set(db.prepare('SELECT id FROM exams').all().map(e => e.id));
        res.json(fromRecords.map(r => ({
            id: r.id,
            examName: r.exam_name || r.id,
            recordCount: r.record_count,
            deleted: !live.has(r.id)
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 应考率/到考率分析
router.get('/admin/reports/attendance', (req, res) => {
    try {
        res.json(attendance.buildAttendance(getDB(), {
            examId: req.query.examId,
            from: req.query.from,
            to: req.query.to,
            assignmentId: req.query.assignmentId
        }));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// 应考记录 CSV 导出
router.get('/admin/reports/attendance.csv', (req, res) => {
    try {
        const data = attendance.buildAttendance(getDB(), {
            examId: req.query.examId,
            from: req.query.from,
            to: req.query.to,
            assignmentId: req.query.assignmentId
        });
        const header = ['status', 'user_name', 'username', 'department', 'employee_no', 'score', 'paper_total', 'completed_at'];
        const lines = [header.join(',')];
        const push = (status, r) => {
            lines.push([
                status,
                csvEscape(r.userName),
                csvEscape(r.username || ''),
                csvEscape(r.department || ''),
                csvEscape(r.employeeNo || ''),
                r.score ?? '',
                r.paperTotal ?? '',
                r.completedAt ? new Date(r.completedAt).toISOString() : ''
            ].join(','));
        };
        data.absent.forEach((r) => push('absent', r));
        data.failed.forEach((r) => push('failed', r));
        data.passed.forEach((r) => push('passed', r));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="safespot-attendance.csv"');
        res.send('﻿' + lines.join('\n'));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
