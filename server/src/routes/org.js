const express = require('express');
const multer = require('multer');
const { getDB } = require('../db');
const { newId, hashPassword } = require('../auth');
const session = require('../session');
const { writeAudit } = require('../audit');
const { importPersonnelCsv } = require('../personnelImport');

const router = express.Router();
const uploadZip = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024, files: 1 }
});

// 获取主组织信息
router.get('/org', (req, res) => {
    try {
        const db = getDB();
        const org = db.prepare('SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1').get();
        res.json(org || null);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取部门列表
router.get('/org/departments', (req, res) => {
    try {
        const rows = getDB().prepare('SELECT * FROM departments ORDER BY sort_order ASC, name ASC').all();
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 创建部门
router.post('/org/departments', (req, res) => {
    try {
        const db = getDB();
        const { name, parent_id, org_id } = req.body;
        if (!name || !String(name).trim()) {
            return res.status(400).json({ error: '部门名称必填' });
        }
        let org = org_id || db.prepare('SELECT id FROM organizations LIMIT 1').get()?.id;
        if (!org) {
            org = 'org_default';
            db.prepare('INSERT OR IGNORE INTO organizations (id, name, code, created_at) VALUES (?, ?, ?, ?)')
                .run(org, '默认企业', 'DEFAULT', Date.now());
        }
        let parent = parent_id && String(parent_id).trim() ? String(parent_id).trim() : null;
        if (parent) {
            const p = db.prepare('SELECT id FROM departments WHERE id = ?').get(parent);
            if (!p) return res.status(400).json({ error: '上级部门不存在' });
        }
        const id = newId('dept');
        const countRow = db.prepare('SELECT count(*) as c FROM departments WHERE org_id = ?').get(org);
        const count = countRow?.c ?? 0;
        db.prepare('INSERT INTO departments (id, org_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?, ?)')
            .run(id, org, parent, String(name).trim(), count);
        res.json({ id, org_id: org, parent_id: parent, name: String(name).trim(), sort_order: count });
    } catch (e) {
        console.error('[departments POST]', e);
        res.status(500).json({ error: e.message || '添加部门失败' });
    }
});

// 修改部门
router.put('/org/departments/:id', (req, res) => {
    try {
        const db = getDB();
        const id = req.params.id;
        const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ error: '部门不存在' });

        const name = req.body.name != null ? String(req.body.name).trim() : existing.name;
        if (!name) return res.status(400).json({ error: '部门名称必填' });

        let parent = req.body.parent_id;
        if (parent === '' || parent === undefined) parent = null;
        if (parent === id) return res.status(400).json({ error: '不能将自己设为上级部门' });

        if (parent) {
            const p = db.prepare('SELECT id FROM departments WHERE id = ?').get(parent);
            if (!p) return res.status(400).json({ error: '上级部门不存在' });
            let cursor = parent;
            const seen = new Set();
            while (cursor) {
                if (cursor === id) return res.status(400).json({ error: '不能选择自己的下级作为上级' });
                if (seen.has(cursor)) break;
                seen.add(cursor);
                cursor = db.prepare('SELECT parent_id FROM departments WHERE id = ?').get(cursor)?.parent_id;
            }
        }

        db.prepare('UPDATE departments SET name = ?, parent_id = ? WHERE id = ?')
            .run(name, parent, id);
        res.json({ status: 'success', id, name, parent_id: parent });
    } catch (e) {
        console.error('[departments PUT]', e);
        res.status(500).json({ error: e.message });
    }
});

// 删除部门
router.delete('/org/departments/:id', (req, res) => {
    try {
        const db = getDB();
        const child = db.prepare('SELECT count(*) as c FROM departments WHERE parent_id = ?').get(req.params.id).c;
        if (child > 0) return res.status(400).json({ error: '请先删除子部门' });
        db.prepare('UPDATE user_profiles SET department_id = NULL WHERE department_id = ?').run(req.params.id);
        db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 人员列表查询
router.get('/org/users', (req, res) => {
    try {
        const db = getDB();
        const { department_id, q, status } = req.query;
        let sql = `
            SELECT u.id, u.username, u.role, u.status, u.created_at, u.org_id,
                   p.real_name, p.employee_no, p.mobile, p.email, p.department_id, p.job_title,
                   d.name as department_name
            FROM users u
            LEFT JOIN user_profiles p ON p.user_id = u.id
            LEFT JOIN departments d ON d.id = p.department_id
            WHERE 1=1
        `;
        const params = [];
        if (department_id) { sql += ' AND p.department_id = ?'; params.push(department_id); }
        if (status) { sql += ' AND u.status = ?'; params.push(status); }
        if (q) {
            sql += ' AND (u.username LIKE ? OR p.real_name LIKE ? OR p.employee_no LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like);
        }
        sql += ' ORDER BY u.created_at DESC';
        res.json(db.prepare(sql).all(...params));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 创建人员
router.post('/org/users', (req, res) => {
    try {
        const db = getDB();
        const { username, password, role, real_name, employee_no, mobile, department_id, job_title } = req.body;
        if (!username?.trim() || !password) return res.status(400).json({ error: '用户名与密码必填' });
        if (!real_name?.trim()) return res.status(400).json({ error: '真实姓名必填' });
        if (role === 'admin' && !session.isAdmin(req.user)) {
            return res.status(403).json({ error: '只有系统管理员可以创建管理员' });
        }
        const org = db.prepare('SELECT id FROM organizations LIMIT 1').get()?.id;
        const id = newId('user');
        const now = Date.now();
        db.transaction(() => {
            db.prepare('INSERT INTO users (id, org_id, username, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(id, org, username.trim(), hashPassword(password), role || 'trainee', 'active', now);
            db.prepare(`INSERT INTO user_profiles (user_id, real_name, employee_no, mobile, department_id, job_title)
                        VALUES (?, ?, ?, ?, ?, ?)`)
                .run(id, real_name.trim(), employee_no || '', mobile || '', department_id || null, job_title || '');
        })();
        res.json({ id, username: username.trim(), real_name: real_name.trim() });
    } catch (e) {
        if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: '用户名已存在' });
        res.status(500).json({ error: e.message });
    }
});

// 更新人员
router.put('/org/users/:id', (req, res) => {
    try {
        const db = getDB();
        const id = req.params.id;
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!u) return res.status(404).json({ error: '用户不存在' });

        const {
            username, role, status, real_name, employee_no, mobile,
            department_id, job_title, password, email
        } = req.body;

        if ((role === 'admin' || u.role === 'admin') && !session.isAdmin(req.user)) {
            return res.status(403).json({ error: '只有系统管理员可以变更管理员账号' });
        }

        if (username != null && String(username).trim()) {
            const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
                .get(String(username).trim(), id);
            if (taken) return res.status(400).json({ error: '用户名已被占用' });
        }

        if (department_id) {
            const d = db.prepare('SELECT id FROM departments WHERE id = ?').get(department_id);
            if (!d) return res.status(400).json({ error: '所属部门不存在' });
        }

        const prof = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(id);

        db.transaction(() => {
            if (username != null && String(username).trim()) {
                db.prepare('UPDATE users SET username = ? WHERE id = ?').run(String(username).trim(), id);
            }
            if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
            if (status) db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
            if (password && String(password).trim()) {
                db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
            }

            const nextName = real_name != null ? String(real_name).trim() : (prof?.real_name || '');
            if (!nextName) throw new Error('真实姓名必填');

            const deptVal = Object.prototype.hasOwnProperty.call(req.body, 'department_id')
                ? (department_id || null)
                : (prof?.department_id || null);

            if (prof) {
                db.prepare(`
                    UPDATE user_profiles SET
                        real_name = ?,
                        employee_no = ?,
                        mobile = ?,
                        email = ?,
                        department_id = ?,
                        job_title = ?
                    WHERE user_id = ?
                `).run(
                    nextName,
                    employee_no != null ? String(employee_no) : (prof.employee_no || ''),
                    mobile != null ? String(mobile) : (prof.mobile || ''),
                    email != null ? String(email) : (prof.email || ''),
                    deptVal,
                    job_title != null ? String(job_title) : (prof.job_title || ''),
                    id
                );
            } else {
                db.prepare(`
                    INSERT INTO user_profiles (user_id, real_name, employee_no, mobile, email, department_id, job_title)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    id, nextName,
                    employee_no || '', mobile || '', email || '',
                    deptVal, job_title || ''
                );
            }
        })();
        if (password && String(password).trim()) writeAudit(db, req, 'user.password', id, u.username);
        res.json({ status: 'success' });
    } catch (e) {
        console.error('[users PUT]', e);
        res.status(500).json({ error: e.message });
    }
});

// 软删：禁用账号，成绩保留
router.delete('/org/users/:id', (req, res) => {
    try {
        getDB().prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 开考用：活跃人员名册（可下拉选择）
router.get('/org/roster', (req, res) => {
    try {
        const rows = getDB().prepare(`
            SELECT u.id as userId, u.username, p.real_name as realName, p.employee_no as employeeNo,
                   p.department_id as departmentId, d.name as departmentName
            FROM users u
            JOIN user_profiles p ON p.user_id = u.id
            LEFT JOIN departments d ON d.id = p.department_id
            WHERE u.status = 'active' AND u.role IN ('trainee', 'trainer', 'admin')
            ORDER BY d.name ASC, p.real_name ASC
        `).all();
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 批量人员导入 (CSV / ZIP)
router.post('/admin/personnel/import', session.requireStaff, uploadZip.single('file'), (req, res) => {
    try {
        const text = req.file?.buffer
            ? req.file.buffer.toString('utf8')
            : String(req.body?.csv || '');
        const r = importPersonnelCsv(getDB(), text);
        writeAudit(getDB(), req, 'personnel.import', 'csv', r);
        res.json({ status: 'success', ...r });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
