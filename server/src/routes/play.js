const express = require('express');
const { getDB } = require('../db');
const session = require('../session');
const examEngine = require('../examEngine');
const { verifyLaunchTicket } = require('../embedTicket');

const router = express.Router();

router.post('/exam-sessions', (req, res) => {
    try {
        const db = getDB();
        let { examId, mode, userName, department, employeeId, ticket } = req.body || {};

        // 若携带签名票据，优先采用票据内防篡改身份与配置
        let ticketUserId = null;
        if (ticket) {
            const ticketRes = verifyLaunchTicket(ticket);
            if (!ticketRes.valid) {
                return res.status(400).json({ error: ticketRes.error || '无效的开考票据' });
            }
            const p = ticketRes.payload || {};
            if (p.examId) examId = p.examId;
            if (p.userName) userName = p.userName;
            if (p.department) department = p.department;
            if (p.employeeId) employeeId = p.employeeId;
            if (p.mode) mode = p.mode;
            if (p.userId) ticketUserId = p.userId;
        }

        if (!examId) return res.status(400).json({ error: '缺少试卷' });
        let exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
        if (!exam) {
            exam = db.prepare('SELECT * FROM exams WHERE exam_name = ?').get(examId);
        }
        if (!exam) return res.status(404).json({ error: '试卷不存在' });
        if ((exam.status || 'published') !== 'published' && !session.isStaff(req.user)) {
            return res.status(403).json({ error: '试卷未发布' });
        }

        let identity;
        if (req.user) {
            identity = {
                userId: req.user.id,
                userName: req.user.realName || req.user.username,
                department: req.user.departmentName || '',
                departmentId: req.user.departmentId || null,
                employeeId: req.user.employeeNo || ''
            };
        } else {
            const name = String(userName || '').trim();
            if (!name) return res.status(400).json({ error: '姓名不能为空' });
            identity = {
                userId: ticketUserId || null,
                userName: name,
                department: department ? String(department).trim() : '',
                departmentId: null,
                employeeId: employeeId ? String(employeeId).trim() : ''
            };
        }

        const attempt = examEngine.startAttempt(db, {
            exam,
            mode: mode === 'practice' ? 'practice' : 'exam',
            identity
        });
        res.json(attempt);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.get('/exam-sessions/:id', (req, res) => {
    try {
        const loaded = examEngine.loadAttempt(getDB(), req.params.id);
        if (!loaded) return res.status(404).json({ error: '开考会话不存在' });
        res.json(examEngine.publicAttempt(loaded.row, loaded.snapshot, loaded.state));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/exam-sessions/:id/click', (req, res) => {
    try {
        const { slideId, x, y } = req.body || {};
        if (!slideId) return res.status(400).json({ error: '缺少题目' });
        res.json(examEngine.applyClick(getDB(), req.params.id, { slideId, x, y }));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.post('/exam-sessions/:id/submit', (req, res) => {
    try {
        res.json(examEngine.submitAttempt(getDB(), req.params.id));
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

module.exports = router;
