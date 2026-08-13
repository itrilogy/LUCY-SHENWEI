const { hashPassword, newId } = require('./auth');

function parseCsv(text) {
    const raw = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
        const cells = splitCsvLine(line);
        const row = {};
        headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
        return row;
    });
}

function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (q && line[i + 1] === '"') { cur += '"'; i++; }
            else q = !q;
        } else if (ch === ',' && !q) {
            out.push(cur);
            cur = '';
        } else cur += ch;
    }
    out.push(cur);
    return out;
}

function ensureDepartment(db, orgId, name) {
    if (!name) return null;
    const hit = db.prepare('SELECT id FROM departments WHERE org_id = ? AND name = ?').get(orgId, name);
    if (hit) return hit.id;
    const id = newId('dept');
    const count = db.prepare('SELECT count(*) as c FROM departments WHERE org_id = ?').get(orgId).c;
    db.prepare('INSERT INTO departments (id, org_id, parent_id, name, sort_order) VALUES (?, ?, NULL, ?, ?)')
        .run(id, orgId, name, count);
    return id;
}

function importPersonnelCsv(db, csvText) {
    const rows = parseCsv(csvText);
    if (!rows.length) {
        const err = new Error('CSV 为空或无法解析。请使用表头：real_name,username,password,employee_no,department,role');
        err.status = 400;
        throw err;
    }
    const orgId = db.prepare('SELECT id FROM organizations LIMIT 1').get()?.id || 'org_default';
    const created = [];
    const skipped = [];
    const tx = db.transaction(() => {
        for (const r of rows) {
            const realName = r.real_name || r.name || r['姓名'];
            const username = r.username || r['用户名'] || r.user;
            const password = r.password || r['密码'] || '123456';
            if (!realName || !username) {
                skipped.push({ username, reason: '缺少姓名或用户名' });
                continue;
            }
            if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
                skipped.push({ username, reason: '用户名已存在' });
                continue;
            }
            const role = ['admin', 'trainer', 'trainee'].includes(r.role) ? r.role : 'trainee';
            const deptName = r.department || r['部门'] || '';
            const deptId = ensureDepartment(db, orgId, deptName);
            const id = newId('user');
            db.prepare('INSERT INTO users (id, org_id, username, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(id, orgId, username, hashPassword(password), role, 'active', Date.now());
            db.prepare(`INSERT INTO user_profiles (user_id, real_name, employee_no, mobile, email, department_id, job_title)
                VALUES (?, ?, ?, '', '', ?, '')`)
                .run(id, realName, r.employee_no || r['工号'] || '', deptId);
            created.push({ id, username, realName });
        }
    });
    tx();
    return { created: created.length, skipped, sample: created.slice(0, 5) };
}

module.exports = { parseCsv, importPersonnelCsv };
