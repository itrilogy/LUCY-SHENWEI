const { expandDepartmentIds } = require('./analytics');

const PASS_RATE = 0.6;

function loadUserRow(db, id) {
    return db.prepare(`
        SELECT u.id, u.username, u.role, u.status,
               p.real_name, p.employee_no, p.department_id, d.name as department_name
        FROM users u
        LEFT JOIN user_profiles p ON p.user_id = u.id
        LEFT JOIN departments d ON d.id = p.department_id
        WHERE u.id = ?
    `).get(id);
}

function allActiveTrainees(db) {
    return db.prepare(`
        SELECT u.id, u.username, u.role, u.status,
               p.real_name, p.employee_no, p.department_id, d.name as department_name
        FROM users u
        LEFT JOIN user_profiles p ON p.user_id = u.id
        LEFT JOIN departments d ON d.id = p.department_id
        WHERE u.status = 'active' AND u.role IN ('trainee', 'trainer')
        ORDER BY d.name, p.real_name
    `).all();
}

function usersForAssignment(db, assignmentId) {
    const targets = db.prepare('SELECT * FROM assignment_targets WHERE assignment_id = ?').all(assignmentId);
    const ids = new Set();
    for (const t of targets) {
        if (t.kind === 'user') ids.add(t.target_id);
        if (t.kind === 'department') {
            const deptIds = expandDepartmentIds(db, t.target_id, true);
            if (!deptIds.length) continue;
            const ph = deptIds.map(() => '?').join(',');
            const rows = db.prepare(`
                SELECT u.id FROM users u
                JOIN user_profiles p ON p.user_id = u.id
                WHERE u.status = 'active' AND p.department_id IN (${ph})
            `).all(...deptIds);
            rows.forEach((r) => ids.add(r.id));
        }
    }
    return [...ids].map((id) => loadUserRow(db, id)).filter(Boolean);
}

function listAssignments(db, examId) {
    const rows = examId
        ? db.prepare('SELECT * FROM assignments WHERE exam_id = ? ORDER BY created_at DESC').all(examId)
        : db.prepare('SELECT * FROM assignments ORDER BY created_at DESC').all();
    return rows.map((a) => ({
        ...a,
        required: !!a.required,
        targets: db.prepare('SELECT kind, target_id FROM assignment_targets WHERE assignment_id = ?').all(a.id)
    }));
}

function bestRecords(db, { examId, from, to }) {
    let sql = "SELECT * FROM records WHERE COALESCE(mode,'exam') = 'exam'";
    const params = [];
    if (examId) { sql += ' AND exam_id = ?'; params.push(examId); }
    if (from) { sql += ' AND completed_at >= ?'; params.push(Number(from)); }
    if (to) { sql += ' AND completed_at <= ?'; params.push(Number(to)); }
    const rows = db.prepare(sql).all(...params);
    const best = new Map();
    for (const r of rows) {
        const key = r.user_id || `guest:${String(r.user_name || '').toLowerCase()}`;
        const prev = best.get(key);
        if (!prev || r.score > prev.score) best.set(key, r);
    }
    return best;
}

function buildAttendance(db, { examId, from, to, assignmentId }) {
    if (!examId) {
        const err = new Error('请选择试卷');
        err.status = 400;
        throw err;
    }
    let roster;
    const assigns = assignmentId
        ? listAssignments(db, examId).filter((a) => a.id === assignmentId)
        : listAssignments(db, examId);
    if (assigns.length) {
        const map = new Map();
        for (const a of assigns) {
            for (const u of usersForAssignment(db, a.id)) map.set(u.id, u);
        }
        roster = [...map.values()];
    } else {
        roster = allActiveTrainees(db);
    }

    const best = bestRecords(db, { examId, from, to });
    const absent = [];
    const failed = [];
    const passed = [];
    for (const u of roster) {
        const rec = best.get(u.id);
        const row = {
            userId: u.id,
            userName: u.real_name || u.username,
            username: u.username,
            department: u.department_name || '',
            departmentId: u.department_id,
            employeeNo: u.employee_no || ''
        };
        if (!rec) {
            absent.push(row);
            continue;
        }
        const rate = (Number(rec.paper_total) || 100) > 0 ? rec.score / rec.paper_total : 0;
        const item = { ...row, score: rec.score, paperTotal: rec.paper_total, completedAt: rec.completed_at, rate };
        if (rate >= PASS_RATE) passed.push(item);
        else failed.push(item);
    }
    return {
        examId,
        rosterSize: roster.length,
        passLine: PASS_RATE,
        assigned: assigns.length > 0,
        counts: { absent: absent.length, failed: failed.length, passed: passed.length },
        absent,
        failed,
        passed
    };
}

module.exports = {
    PASS_RATE,
    listAssignments,
    usersForAssignment,
    buildAttendance,
    allActiveTrainees
};
