const crypto = require('crypto');
const { getDB } = require('./db');

const COOKIE = 'safespot_sid';
const TTL_MS = 12 * 60 * 60 * 1000;
const STAFF_ROLES = new Set(['admin', 'trainer']);

// 会话短期内存缓存：防止高频请求击穿 SQLite（5 秒 TTL，容量 5000）
const sessionCache = new Map();
const SESSION_CACHE_TTL_MS = 5000;
const MAX_CACHE_ENTRIES = 5000;

function getCachedSession(sid) {
    const entry = sessionCache.get(sid);
    if (!entry) return null;
    const now = Date.now();
    if (now - entry.cachedAt > SESSION_CACHE_TTL_MS || now > entry.expiresAt) {
        sessionCache.delete(sid);
        return null;
    }
    return entry.user;
}

function setCachedSession(sid, user, expiresAt) {
    if (sessionCache.size >= MAX_CACHE_ENTRIES) {
        const iter = sessionCache.keys();
        for (let i = 0; i < 1000; i++) {
            const next = iter.next();
            if (next.done) break;
            sessionCache.delete(next.value);
        }
    }
    sessionCache.set(sid, {
        user,
        expiresAt,
        cachedAt: Date.now()
    });
}

function invalidateSession(sid) {
    if (sid) sessionCache.delete(sid);
}

function invalidateUserSessions(userId) {
    if (!userId) return;
    for (const [sid, entry] of sessionCache.entries()) {
        if (entry.user && entry.user.id === userId) {
            sessionCache.delete(sid);
        }
    }
}

function clearAllSessionCache() {
    sessionCache.clear();
}

function cookieSecret() {
    return process.env.SESSION_SECRET || 'dev-only-secret';
}

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of String(header).split(';')) {
        const i = part.indexOf('=');
        if (i < 0) continue;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
    return out;
}

function sign(sid) {
    const mac = crypto.createHmac('sha256', cookieSecret()).update(sid).digest('hex');
    return `${sid}.${mac}`;
}

function unsign(value) {
    if (!value || !value.includes('.')) return null;
    const i = value.lastIndexOf('.');
    const sid = value.slice(0, i);
    const mac = value.slice(i + 1);
    const expect = crypto.createHmac('sha256', cookieSecret()).update(sid).digest('hex');
    try {
        const a = Buffer.from(mac, 'hex');
        const b = Buffer.from(expect, 'hex');
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    } catch {
        return null;
    }
    return sid;
}

function cookieHeader(value, maxAgeSec) {
    // 厂区内网多为 HTTP，默认不加 Secure，避免 cookie 发不出去
    return `${COOKIE}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

function attachSession(req, res, next) {
    req.user = null;
    req.sessionId = null;
    try {
        const raw = parseCookies(req.headers.cookie || '')[COOKIE];
        const sid = unsign(raw);
        if (!sid) return next();

        // 1. 优先查短期内存缓存（5 秒 TTL），避免高频请求重复打入 SQLite
        const cachedUser = getCachedSession(sid);
        if (cachedUser) {
            req.sessionId = sid;
            req.user = cachedUser;
            return next();
        }

        // 2. 缓存未命中时查库
        const db = getDB();
        const row = db.prepare('SELECT * FROM auth_sessions WHERE id = ? AND expires_at > ?').get(sid, Date.now());
        if (!row || !row.user_id) return next();
        const profile = db.prepare(`
            SELECT u.id, u.username, u.role, u.status,
                   p.real_name, p.employee_no, p.department_id, p.mobile,
                   d.name as department_name
            FROM users u
            LEFT JOIN user_profiles p ON p.user_id = u.id
            LEFT JOIN departments d ON d.id = p.department_id
            WHERE u.id = ?
        `).get(row.user_id);
        if (!profile || profile.status !== 'active') return next();
        req.sessionId = sid;
        req.user = publicUser(profile);

        // 3. 写入内存短缓存
        setCachedSession(sid, req.user, row.expires_at);
    } catch (e) {
        console.error('[session]', e.message);
    }
    next();
}

function publicUser(profile) {
    return {
        id: profile.id,
        username: profile.username,
        role: profile.role,
        realName: profile.real_name || profile.username,
        employeeNo: profile.employee_no || '',
        departmentId: profile.department_id || null,
        departmentName: profile.department_name || '',
        mobile: profile.mobile || ''
    };
}

function createSession(res, user) {
    const db = getDB();
    const id = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const expiresAt = now + TTL_MS;
    db.prepare('INSERT INTO auth_sessions (id, user_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, user.id, user.role, now, expiresAt);
    res.setHeader('Set-Cookie', cookieHeader(encodeURIComponent(sign(id)), Math.floor(TTL_MS / 1000)));
    setCachedSession(id, user, expiresAt);
    return id;
}

function clearSession(req, res) {
    if (req.sessionId) {
        invalidateSession(req.sessionId);
        try { getDB().prepare('DELETE FROM auth_sessions WHERE id = ?').run(req.sessionId); } catch (_) { /* ignore */ }
    }
    res.setHeader('Set-Cookie', cookieHeader('', 0));
}

function isStaff(user) {
    return !!(user && STAFF_ROLES.has(user.role));
}

function isAdmin(user) {
    return !!(user && user.role === 'admin');
}

function requireStaff(req, res, next) {
    if (!isStaff(req.user)) {
        return res.status(401).json({ error: '需要管理员或培训师登录' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!isAdmin(req.user)) {
        return res.status(403).json({ error: '需要系统管理员权限' });
    }
    next();
}

/** /api 下默认需培训师/管理员；白名单除外 */
function gateApi(req, res, next) {
    const path = req.path;
    const method = req.method;
    if (isPublicApi(method, path)) return next();
    return requireStaff(req, res, next);
}

function isPublicApi(method, rawPath) {
    const path = rawPath.startsWith('/api/') ? rawPath.slice(4) : rawPath;
    if (path === '/ping' || path === '/health') return true;
    if (path === '/auth/login' || path === '/auth/logout' || path === '/auth/me') return true;
    if (path === '/admin/login') return true;
    if (method === 'GET' && path === '/knowledge') return true;
    if (method === 'GET' && (path === '/exams' || path === '/exams/latest')) return true;
    if (method === 'GET' && path === '/session/records/latest') return true;
    if (path.startsWith('/embed/')) return true;
    if (method === 'POST' && path === '/exam-sessions') return true;
    if (method === 'GET' && /^\/exam-sessions\/[^/]+$/.test(path)) return true;
    if (method === 'POST' && /^\/exam-sessions\/[^/]+\/(click|submit|advance)$/.test(path)) return true;
    return false;
}

module.exports = {
    attachSession,
    createSession,
    clearSession,
    invalidateSession,
    invalidateUserSessions,
    clearAllSessionCache,
    publicUser,
    isStaff,
    isAdmin,
    requireStaff,
    requireAdmin,
    gateApi,
    COOKIE
};
