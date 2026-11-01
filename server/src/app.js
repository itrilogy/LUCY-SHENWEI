const express = require('express');
const cors = require('cors');
const path = require('path');
const fsSync = require('fs');
const { initDB, getDB } = require('./db');
const { verifyPassword } = require('./auth');
const session = require('./session');

const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_PIN = process.env.ADMIN_PIN || 'safeeye';
const APP_VERSION = '1.4.1-web';

const app = express();

if (!IS_PROD) {
    app.use(cors({ origin: true, credentials: true }));
}
app.use(express.json({ limit: '2mb' }));
app.use(session.attachSession);
app.use('/api', session.gateApi);

// 静态资源直通：图片文件
const DIR_RAW = path.join(__dirname, '../data/assets/raw');
app.use('/assets/raw', express.static(DIR_RAW));

// 基础健康检查与服务诊断
app.get('/api/ping', (req, res) => res.send('pong'));

app.get('/api/health', (req, res) => {
    try {
        let dbOk = false;
        try {
            const db = getDB();
            dbOk = !!db.prepare('SELECT 1 as ok').get()?.ok;
        } catch (_) {
            dbOk = false;
        }
        res.json({
            status: dbOk ? 'ok' : 'degraded',
            version: APP_VERSION,
            time: new Date().toISOString(),
            db: dbOk,
            mode: IS_PROD ? 'production' : 'development'
        });
    } catch (e) {
        res.status(500).json({ status: 'error', error: e.message });
    }
});

// 模块化领域路由挂载
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/assets'));
app.use('/api', require('./routes/knowledge'));
app.use('/api', require('./routes/exams'));
app.use('/api', require('./routes/org'));
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/analytics'));
app.use('/api', require('./routes/system'));
app.use('/api', require('./routes/play'));
app.use('/api', require('./routes/embed'));

// 生产单端口静态托管 (React Client dist)
function serveClientIfNeeded() {
    const should = IS_PROD || process.env.SERVE_CLIENT === '1';
    if (!should) return;
    const dist = path.join(__dirname, '../../client/dist');
    if (!fsSync.existsSync(path.join(dist, 'index.html'))) {
        console.warn(`[SafeSpot] 未找到 ${dist}/index.html，跳过静态托管（请先 npm run build）`);
        return;
    }
    app.use(express.static(dist));
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (req.path.startsWith('/api') || req.path.startsWith('/assets')) return next();
        res.sendFile(path.join(dist, 'index.html'));
    });
    console.log(`[SafeSpot] 已托管前端 ${dist}`);
}

function assertProductionSecrets(db) {
    if (!IS_PROD) return;
    if (process.env.ALLOW_INSECURE === '1') {
        console.warn('[SafeSpot] ALLOW_INSECURE=1：生产仍允许默认口令，仅应急使用');
        return;
    }
    if (!process.env.ADMIN_PIN || process.env.ADMIN_PIN === 'safeeye') {
        throw new Error('生产环境请设置非默认 ADMIN_PIN，或临时 ALLOW_INSECURE=1');
    }
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-only-secret') {
        throw new Error('生产环境请设置 SESSION_SECRET，或临时 ALLOW_INSECURE=1');
    }
    const admin = db.prepare("SELECT password_hash FROM users WHERE username = 'admin'").get();
    if (admin && verifyPassword('admin123', admin.password_hash)) {
        throw new Error('生产环境请修改 admin 默认密码，或临时 ALLOW_INSECURE=1');
    }
}

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

async function startServer() {
    await initDB();
    assertProductionSecrets(getDB());
    serveClientIfNeeded();
    return app.listen(PORT, HOST, () => {
        console.log(`[SafeSpot] Web 已启动 http://${HOST}:${PORT} · v${APP_VERSION}`);
        if (!IS_PROD) {
            console.log(`[SafeSpot] 开发模式：管理口令可用 ADMIN_PIN 覆盖；账号会话见 /api/auth/login`);
        }
    });
}

if (require.main === module) {
    startServer().catch(err => {
        console.error('[SafeSpot] 启动失败', err);
        process.exit(1);
    });
}

module.exports = { app, startServer };
