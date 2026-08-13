function ensureTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            username TEXT,
            action TEXT NOT NULL,
            target TEXT,
            detail TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);
    `);
}

function writeAudit(db, req, action, target, detail) {
    try {
        ensureTable(db);
        db.prepare(`
            INSERT INTO audit_log (user_id, username, action, target, detail, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            req?.user?.id || null,
            req?.user?.username || req?.user?.realName || null,
            action,
            target || null,
            detail != null ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null,
            Date.now()
        );
    } catch (e) {
        console.error('[audit]', e.message);
    }
}

function listAudit(db, { limit = 200 } = {}) {
    ensureTable(db);
    return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?')
        .all(Math.min(Number(limit) || 200, 1000));
}

module.exports = { writeAudit, listAudit, ensureTable };
