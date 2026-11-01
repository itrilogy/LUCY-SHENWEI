const express = require('express');
const { getDB } = require('../db');
const { verifyPassword } = require('../auth');
const session = require('../session');
const { createRateLimiter } = require('../rateLimit');

const router = express.Router();

const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_PIN = process.env.ADMIN_PIN || 'safeeye';

const loginLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 15,
    message: '登录尝试过于频繁，请1分钟后再试'
});

function pinAllowed() {
    if (IS_PROD && ADMIN_PIN === 'safeeye' && process.env.ALLOW_INSECURE !== '1') return false;
    return !!ADMIN_PIN;
}

// 管理员 PIN 口令解锁登录
router.post('/admin/login', loginLimiter, (req, res) => {
    if (!pinAllowed()) {
        return res.status(403).json({ error: '生产环境已关闭默认口令，请使用管理员账号登录' });
    }
    const pin = String(req.body?.pin ?? '');
    if (pin !== ADMIN_PIN) {
        return res.status(401).json({ error: '管理口令错误' });
    }
    const db = getDB();
    const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at ASC LIMIT 1").get();
    if (!admin) return res.status(500).json({ error: '未找到管理员账号' });
    const p = db.prepare(`
        SELECT p.*, d.name as department_name FROM user_profiles p
        LEFT JOIN departments d ON d.id = p.department_id WHERE p.user_id = ?
    `).get(admin.id);
    const user = session.publicUser({
        id: admin.id, username: admin.username, role: admin.role, status: admin.status,
        real_name: p?.real_name, employee_no: p?.employee_no, department_id: p?.department_id,
        department_name: p?.department_name, mobile: p?.mobile
    });
    session.createSession(res, user);
    res.json({ status: 'success', user, message: '管理端已解锁' });
});

// 学员/员工/管理员账号密码登录
router.post('/auth/login', loginLimiter, (req, res) => {
    try {
        const { username, password } = req.body;
        const db = getDB();
        const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username?.trim());
        if (!u || u.status !== 'active' || !verifyPassword(password, u.password_hash)) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        const p = db.prepare(`
            SELECT p.*, d.name as department_name FROM user_profiles p
            LEFT JOIN departments d ON d.id = p.department_id WHERE p.user_id = ?
        `).get(u.id);
        const user = session.publicUser({
            id: u.id, username: u.username, role: u.role, status: u.status,
            real_name: p?.real_name, employee_no: p?.employee_no, department_id: p?.department_id,
            department_name: p?.department_name, mobile: p?.mobile
        });
        session.createSession(res, user);
        res.json({ status: 'success', user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 获取当前会话状态
router.get('/auth/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({ user: req.user });
});

// 退出登录并清除会话
router.post('/auth/logout', (req, res) => {
    session.clearSession(req, res);
    res.json({ status: 'success' });
});

module.exports = router;
