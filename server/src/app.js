const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const multer = require('multer');
const { initDB, getDB } = require('./db');
const { hashPassword, verifyPassword, newId } = require('./auth');
const analytics = require('./analytics');
const session = require('./session');
const examEngine = require('./examEngine');
const { parseExamSettings } = require('./scoring');
const backup = require('./backup');
const bankPack = require('./bankPack');
const attendance = require('./attendance');
const { writeAudit, listAudit } = require('./audit');
const { seedStarterPack } = require('./seedStarter');
const { importPersonnelCsv } = require('./personnelImport');
const cleanup = require('./cleanup');

const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_PIN = process.env.ADMIN_PIN || 'safeeye';
const APP_VERSION = '1.4.0-web';

const app = express();
if (!IS_PROD) {
    app.use(cors({ origin: true, credentials: true }));
}
app.use(express.json({ limit: '2mb' }));
app.use(session.attachSession);
app.use('/api', session.gateApi);

// 路径宏定义（health 等路由需尽早可用）
const DIR_RAW = path.join(__dirname, '../data/assets/raw');
const DIR_META = path.join(__dirname, '../data/assets/meta');
const DIR_RECORDS = path.join(__dirname, '../data/sessions/records');
const DIR_EXAMS = path.join(__dirname, '../data/exams');

// 诊断路由：确保后端逻辑已加载
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
        const rawExists = fsSync.existsSync(DIR_RAW);
        res.json({
            status: dbOk && rawExists ? 'ok' : 'degraded',
            version: APP_VERSION,
            db: dbOk,
            assetsDir: rawExists,
            auth: 'session',
            user: req.user ? { id: req.user.id, role: req.user.role } : null,
            timestamp: Date.now()
        });
    } catch (e) {
        res.status(503).json({ status: 'error', error: e.message, version: APP_VERSION });
    }
});

function pinAllowed() {
    if (IS_PROD && ADMIN_PIN === 'safeeye' && process.env.ALLOW_INSECURE !== '1') return false;
    return !!ADMIN_PIN;
}

app.post('/api/admin/login', (req, res) => {
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

/**
 * 修复 multer/busboy 对中文文件名的乱码：
 * 浏览器以 UTF-8 发送文件名，busboy 常按 latin1 读成“æ…/å…”等 mojibake。
 */
function decodeUploadFilename(originalName) {
    if (!originalName || typeof originalName !== 'string') return 'image';
    let name = originalName;
    try {
        // RFC5987 / 部分客户端
        if (/%[0-9A-Fa-f]{2}/.test(name)) {
            try { name = decodeURIComponent(name); } catch (_) { /* keep */ }
        }
        const hasCjk = (s) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
        const hasMojibake = (s) => /[ÃÂÅÆØÐÑåæø]/.test(s) || /Ã./.test(s);
        // 典型乱码：latin1 误读 UTF-8 → 转回
        if (!hasCjk(name) || hasMojibake(name)) {
            const repaired = Buffer.from(originalName, 'latin1').toString('utf8');
            if (hasCjk(repaired) && !repaired.includes('\uFFFD')) {
                name = repaired;
            }
        }
    } catch (_) { /* keep original */ }
    // 去掉路径成分，只保留文件名
    name = name.replace(/\\/g, '/').split('/').pop() || 'image';
    return name;
}

function sanitizeFilenameBase(base) {
    let s = String(base || 'image')
        .normalize('NFC')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[\/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^\.+/, '')
        .trim();
    if (!s || s === '.' || s === '..') s = 'image';
    // 过长截断（保留中文语义前缀）
    if ([...s].length > 60) s = [...s].slice(0, 60).join('');
    return s;
}

const ALLOWED_UPLOAD = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function extFromMime(mimetype) {
    const map = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp'
    };
    return map[mimetype] || '';
}

// multer 上传配置
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        try {
            await fs.mkdir(DIR_RAW, { recursive: true });
            cb(null, DIR_RAW);
        } catch (e) {
            cb(e);
        }
    },
    filename: function (req, file, cb) {
        try {
            const decoded = decodeUploadFilename(file.originalname);
            // 挂到 file 上，供入库展示用
            file.decodedOriginalName = decoded;

            let ext = path.extname(decoded).toLowerCase();
            if (!ext || ext.length > 6) {
                ext = extFromMime(file.mimetype) || '.jpg';
            }
            const rawBase = path.basename(decoded, path.extname(decoded));
            const base = sanitizeFilenameBase(rawBase);
            const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const finalName = `${base}_${unique}${ext}`;
            cb(null, finalName);
        } catch (e) {
            const fallback = `img_${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
            cb(null, fallback);
        }
    }
});
const uploadZip = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024, files: 1 }
});

const upload = multer({
    storage,
    limits: { fileSize: 12 * 1024 * 1024, files: 20 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype || !ALLOWED_UPLOAD.has(file.mimetype.toLowerCase())) {
            return cb(new Error('仅支持 JPEG / PNG / WebP 图片'));
        }
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (ext === '.svg' || ext === '.html' || ext === '.js') {
            return cb(new Error('不支持的文件类型'));
        }
        cb(null, true);
    }
});

// 1. 静态引流
app.use('/assets/raw', express.static(DIR_RAW));

// 2. 获取所有的图片列表（来自数据库）
// isAnnotated 以真实 annotations 数量为准，并回写纠偏 is_annotated 脏标记
app.get('/api/assets', async (req, res) => {
    try {
        const db = getDB();
        const assets = db.prepare(`
            SELECT a.*, 
            (SELECT json_group_array(json_object('id', id, 'shape', shape, 'rect', json_object('x', x, 'y', y, 'w', w, 'h', h), 'clauseId', clause_id, 'scoreWeight', score_weight, 'description', description))
             FROM annotations WHERE asset_id = a.id) as annotations_json,
            (SELECT count(*) FROM annotations WHERE asset_id = a.id) as anno_count
            FROM assets a
            ORDER BY upload_time DESC
        `).all();

        const fixFlag = db.prepare('UPDATE assets SET is_annotated = ? WHERE id = ?');
        const data = assets.map(a => {
            let items = [];
            try {
                items = JSON.parse(a.annotations_json || '[]');
                // sqlite json_group_array 无行时可能返回 "[null]"
                if (!Array.isArray(items) || (items.length === 1 && items[0] == null)) items = [];
            } catch (_) { items = []; }

            const count = Number(a.anno_count) || items.length;
            const isAnnotated = count > 0;
            // 纠偏脏标记，避免组卷中心「可组卷案例」被 is_annotated=0 滤空
            if ((a.is_annotated === 1) !== isAnnotated) {
                try { fixFlag.run(isAnnotated ? 1 : 0, a.id); } catch (_) { /* ignore */ }
            }

            // 展示名：优先 original_name，否则从磁盘文件名去掉 _时间戳 后缀
            let displayName = a.original_name || null;
            if (!displayName) {
                const rawBase = path.basename(a.id, path.extname(a.id));
                displayName = rawBase.replace(/_\d{10,}-\w{4,8}$/, '') || rawBase;
            }
            return {
                name: a.id,
                url: a.path,
                baseName: displayName,
                originalName: a.original_name || displayName,
                isAnnotated,
                meta: { items }
            };
        });

        res.json({ status: "success", data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. 上传新图片 (同步写入数据库) — 支持单文件 image 或多文件 images
// filename 存磁盘唯一名；metadata 可存原始中文名便于展示
app.post('/api/assets/upload', upload.any(), async (req, res) => {
    const files = (req.files && req.files.length) ? req.files : (req.file ? [req.file] : []);
    if (!files.length) return res.status(400).json({ error: '没有上传任何文件' });

    try {
        const db = getDB();
        // 兼容旧库：补 original_name 列
        try { db.exec('ALTER TABLE assets ADD COLUMN original_name TEXT'); } catch (_) { /* exists */ }

        const insert = db.prepare(
            'INSERT INTO assets (id, filename, path, upload_time, original_name) VALUES (?, ?, ?, ?, ?)'
        );
        const saved = [];
        const tx = db.transaction(() => {
            for (const f of files) {
                if (!f.mimetype || !f.mimetype.startsWith('image/')) continue;
                const original = f.decodedOriginalName || decodeUploadFilename(f.originalname);
                insert.run(
                    f.filename,
                    f.filename,
                    `/assets/raw/${f.filename}`,
                    Date.now(),
                    original
                );
                saved.push({
                    file: f.filename,
                    originalName: original,
                    url: `/assets/raw/${f.filename}`
                });
            }
        });
        tx();
        if (!saved.length) return res.status(400).json({ error: '没有有效的图片文件' });
        res.json({
            status: 'success',
            file: saved[0].file,
            originalName: saved[0].originalName,
            files: saved.map(s => s.file),
            items: saved,
            count: saved.length
        });
    } catch (e) {
        console.error('[upload]', e);
        res.status(500).json({ error: e.message });
    }
});

// 3.5 删除图片及所有关联数据 (物理 + 数据库)
app.delete('/api/assets/:filename', async (req, res) => {
    try {
        const db = getDB();
        const filename = path.basename(req.params.filename);

        const used = db.prepare(`
            SELECT e.id, e.exam_name, e.status FROM exam_items i
            JOIN exams e ON e.id = i.exam_id
            WHERE i.asset_id = ? AND e.status = 'published'
        `).all(filename);
        if (used.length && req.query.force !== '1') {
            return res.status(409).json({
                error: `该图已被 ${used.length} 套已发布试卷引用，请先下线试卷或确认强制删除`,
                exams: used
            });
        }

        const deleteAsset = db.prepare('DELETE FROM assets WHERE id = ?');
        const deleteAnnos = db.prepare('DELETE FROM annotations WHERE asset_id = ?');
        const deleteExamItems = db.prepare('DELETE FROM exam_items WHERE asset_id = ?');

        db.transaction(() => {
            deleteAnnos.run(filename);
            deleteExamItems.run(filename);
            deleteAsset.run(filename);
        })();

        const safeName = path.basename(filename);
        const filePath = path.resolve(DIR_RAW, safeName);
        const root = path.resolve(DIR_RAW);
        if (filePath !== root && !filePath.startsWith(root + path.sep)) {
            return res.status(400).json({ error: '非法文件名' });
        }
        try {
            await fs.unlink(filePath);
        } catch (fileErr) {
            console.warn(`[Warn] Physical file not found or already deleted: ${filePath}`);
        }

        writeAudit(db, req, 'asset.delete', filename, used.length ? 'force' : '');
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. 获取特定图片的标注元数据
app.get('/api/assets/meta/:imgName', async (req, res) => {
    try {
        const db = getDB();
        const assetId = req.params.imgName;
        const annos = db.prepare('SELECT * FROM annotations WHERE asset_id = ?').all(assetId);

        const items = annos.map(a => ({
            id: a.id,
            shape: a.shape,
            rect: { x: a.x, y: a.y, w: a.w, h: a.h },
            clauseId: a.clause_id,
            scoreWeight: a.score_weight,
            description: a.description
        }));

        res.json({ status: "success", meta: { sceneId: assetId, items } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. 保存图片的标注配置信息 (先删后增，事务处理)
app.post('/api/assets/meta/:imgName', async (req, res) => {
    const db = getDB();
    const assetId = req.params.imgName;
    const items = req.body.items || [];

    const deleteStmt = db.prepare('DELETE FROM annotations WHERE asset_id = ?');
    const insertStmt = db.prepare('INSERT INTO annotations (id, asset_id, shape, x, y, w, h, clause_id, score_weight, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const updateAssetStmt = db.prepare('UPDATE assets SET is_annotated = ? WHERE id = ?');

    const runTransaction = db.transaction((annos) => {
        deleteStmt.run(assetId);
        for (const a of annos) {
            insertStmt.run(a.id, assetId, a.shape, a.rect.x, a.rect.y, a.rect.w, a.rect.h, a.clauseId, a.scoreWeight, a.description || '');
        }
        updateAssetStmt.run(annos.length > 0 ? 1 : 0, assetId);
    });

    try {
        runTransaction(items);
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 辅助函数：根据比例字典实时计算分值
const calculateItemWeight = (item, riskDict) => {
    const lValue = riskDict.find(d => d.id === item.likelihood_level)?.level_value || 1;
    const cValue = riskDict.find(d => d.id === item.consequence_level)?.level_value || 1;
    return lValue * cValue;
};

// 6. 获取法规字典 (重构: 从三张新表联查聚合为原有嵌套树结构)
app.get('/api/knowledge', async (req, res) => {
    try {
        const db = getDB();

        // 分别查出三张表的数据
        const scenes = db.prepare('SELECT * FROM knowledge_scenes ORDER BY sort_order ASC, id ASC').all();
        const categories = db.prepare('SELECT * FROM knowledge_categories ORDER BY sort_order ASC, id ASC').all();
        const items = db.prepare('SELECT * FROM knowledge_items ORDER BY sort_order ASC, id ASC').all();

        // 获取风险字典用于实时计算权重
        const riskDict = db.prepare('SELECT * FROM risk_dictionary').all();

        // 重新聚合成原来的 tree 结构以保持前端兼容
        const knowledgeTree = scenes.map(s => {
            const sceneCats = categories.filter(c => c.scene_id === s.id);
            return {
                id: s.id, // 新增，便于前端映射
                scene: s.name,
                types: sceneCats.map(c => {
                    const catItems = items.filter(i => i.category_id === c.id);
                    return {
                        id: c.id,
                        typeName: c.name,
                        items: catItems.map(i => ({
                            id: i.id,
                            desc: i.title,
                            clause: i.content,
                            weight: calculateItemWeight(i, riskDict),
                            likelihood_level: i.likelihood_level,
                            consequence_level: i.consequence_level,
                            standard_code: i.standard_code,
                            tags: JSON.parse(i.tags || '[]')
                        }))
                    };
                })
            };
        });

        res.json({ knowledgeTree });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 知识库管理模块专用 CRUD 接口 (Sprint 16 & 17)
// ==========================================

// --- Risk Dictionary 风险字典 (Sprint 17) ---
app.get('/api/admin/risk/dict', (req, res) => {
    try {
        const rows = getDB().prepare('SELECT * FROM risk_dictionary ORDER BY type ASC, level_value ASC').all();
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/risk/dict/:id', (req, res) => {
    try {
        const { level_name, level_value } = req.body;
        getDB().prepare('UPDATE risk_dictionary SET level_name = ?, level_value = ? WHERE id = ?')
            .run(level_name, level_value, req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Scenes 场景 ---
app.get('/api/admin/knowledge/scenes', (req, res) => {
    try {
        const rows = getDB().prepare('SELECT * FROM knowledge_scenes ORDER BY sort_order ASC').all();
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/knowledge/scenes', (req, res) => {
    try {
        const db = getDB();
        const { name, description } = req.body;
        const id = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const count = db.prepare('SELECT count(*) as c FROM knowledge_scenes').get().c;
        db.prepare('INSERT INTO knowledge_scenes (id, name, description, sort_order) VALUES (?, ?, ?, ?)')
            .run(id, name, description || '', count);
        res.json({ id, name, description, sort_order: count });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/knowledge/scenes/:id', (req, res) => {
    try {
        const { name, description } = req.body;
        getDB().prepare('UPDATE knowledge_scenes SET name = ?, description = ? WHERE id = ?')
            .run(name, description || '', req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/knowledge/scenes/:id', (req, res) => {
    try {
        getDB().prepare('DELETE FROM knowledge_scenes WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Categories 大类 ---
app.get('/api/admin/knowledge/categories', (req, res) => {
    try {
        const { scene_id } = req.query;
        let query = 'SELECT * FROM knowledge_categories ORDER BY sort_order ASC';
        let params = [];
        if (scene_id) {
            query = 'SELECT * FROM knowledge_categories WHERE scene_id = ? ORDER BY sort_order ASC';
            params.push(scene_id);
        }
        res.json(getDB().prepare(query).all(...params));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/knowledge/categories', (req, res) => {
    try {
        const db = getDB();
        const { scene_id, name } = req.body;
        const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const count = db.prepare('SELECT count(*) as c FROM knowledge_categories WHERE scene_id = ?').get(scene_id).c;
        db.prepare('INSERT INTO knowledge_categories (id, scene_id, name, sort_order) VALUES (?, ?, ?, ?)')
            .run(id, scene_id, name, count);
        res.json({ id, scene_id, name, sort_order: count });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/knowledge/categories/:id', (req, res) => {
    try {
        const { name } = req.body;
        getDB().prepare('UPDATE knowledge_categories SET name = ? WHERE id = ?').run(name, req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/knowledge/categories/:id', (req, res) => {
    try {
        getDB().prepare('DELETE FROM knowledge_categories WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Items 细则 ---
app.get('/api/admin/knowledge/items', (req, res) => {
    try {
        const { category_id } = req.query;
        let query = 'SELECT * FROM knowledge_items ORDER BY sort_order ASC';
        let params = [];
        if (category_id) {
            query = 'SELECT * FROM knowledge_items WHERE category_id = ? ORDER BY sort_order ASC';
            params.push(category_id);
        }
        const rows = getDB().prepare(query).all(...params);
        const riskDict = getDB().prepare('SELECT * FROM risk_dictionary').all();
        res.json(rows.map(r => ({
            ...r,
            tags: JSON.parse(r.tags || '[]'),
            score_weight: calculateItemWeight(r, riskDict) // 实时覆盖
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/knowledge/items', (req, res) => {
    try {
        const db = getDB();
        const { category_id, title, content, score_weight, likelihood_level, consequence_level, standard_code, tags } = req.body;
        const id = `itm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const count = db.prepare('SELECT count(*) as c FROM knowledge_items WHERE category_id = ?').get(category_id).c;
        db.prepare('INSERT INTO knowledge_items (id, category_id, title, content, score_weight, likelihood_level, consequence_level, standard_code, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(id, category_id, title, content || '', score_weight || 10, likelihood_level || null, consequence_level || null, standard_code || '', JSON.stringify(tags || []), count);
        res.json({ id, category_id, title, score_weight });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/knowledge/items/:id', (req, res) => {
    try {
        const { title, content, score_weight, likelihood_level, consequence_level, standard_code, tags } = req.body;
        getDB().prepare('UPDATE knowledge_items SET title = ?, content = ?, score_weight = ?, likelihood_level = ?, consequence_level = ?, standard_code = ?, tags = ? WHERE id = ?')
            .run(title, content || '', score_weight || 10, likelihood_level || null, consequence_level || null, standard_code || '', JSON.stringify(tags || []), req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/knowledge/items/:id', (req, res) => {
    try {
        getDB().prepare('DELETE FROM knowledge_items WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// 7. 保存用户成绩 + 学情物化（attempt_stats / knowledge_error_facts）
app.post('/api/session/record', async (req, res) => {
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

app.use('/api', require('./routes/play'));

// 8. 组卷保存/发布
app.post('/api/exams/publish', async (req, res) => {
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

// 9. 拉取最新考卷
app.get('/api/exams/latest', async (req, res) => {
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

// 9.1 拉取所有考卷列表
app.get('/api/exams', async (req, res) => {
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

app.get('/api/exams/:id', (req, res) => {
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

// 9.2 删除试卷（绝不删除 records；先补齐 exam_name 快照）
app.delete('/api/exams/:id', async (req, res) => {
    try {
        const db = getDB();
        const examId = req.params.id;
        const exam = db.prepare('SELECT exam_name FROM exams WHERE id = ?').get(examId);
        const snapName = exam?.exam_name || examId;
        const kept = db.prepare('SELECT count(*) as c FROM records WHERE exam_id = ?').get(examId)?.c || 0;

        const tx = db.transaction(() => {
            // 保证删卷后龙虎榜/报表仍能显示卷名
            db.prepare(`
                UPDATE records SET exam_name = COALESCE(NULLIF(exam_name, ''), ?)
                WHERE exam_id = ?
            `).run(snapName, examId);
            db.prepare('DELETE FROM exam_items WHERE exam_id = ?').run(examId);
            db.prepare('DELETE FROM exams WHERE id = ?').run(examId);
            db.prepare('DELETE FROM attempt_stats WHERE exam_id = ? AND record_id NOT IN (SELECT id FROM records)').run(examId);
            db.prepare('DELETE FROM knowledge_error_facts WHERE exam_id = ? AND record_id NOT IN (SELECT id FROM records)').run(examId);
            // records 故意不删；学情物化若无对应成绩则清掉
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

// 9.3 切换考卷发布状态
app.put('/api/exams/:id/status', async (req, res) => {
    try {
        const db = getDB();
        const { status } = req.body;
        db.prepare('UPDATE exams SET status = ? WHERE id = ?').run(status, req.params.id);
        res.json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. 龙虎榜数据
// rankMode=best|all；attemptMode=exam|practice|all（默认 exam，练习不上正式榜）
// 即使试卷已删除，仍可按 exam_id 查询历史 records
app.get('/api/session/records/latest', async (req, res) => {
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

        // best：每人（user_id 优先，否则姓名+部门）最高分
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

// ========== 组织 / 部门 / 用户 ==========
app.get('/api/org', (req, res) => {
    try {
        const db = getDB();
        const org = db.prepare('SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1').get();
        res.json(org || null);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/org/departments', (req, res) => {
    try {
        const rows = getDB().prepare('SELECT * FROM departments ORDER BY sort_order ASC, name ASC').all();
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/org/departments', (req, res) => {
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

app.put('/api/org/departments/:id', (req, res) => {
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
            // 防止成环：parent 不能是自己的子孙
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

app.delete('/api/org/departments/:id', (req, res) => {
    try {
        const db = getDB();
        const child = db.prepare('SELECT count(*) as c FROM departments WHERE parent_id = ?').get(req.params.id).c;
        if (child > 0) return res.status(400).json({ error: '请先删除子部门' });
        db.prepare('UPDATE user_profiles SET department_id = NULL WHERE department_id = ?').run(req.params.id);
        db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/org/users', (req, res) => {
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

app.post('/api/org/users', (req, res) => {
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

app.put('/api/org/users/:id', (req, res) => {
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

            // 明确传 department_id 时更新（空串=清空）；不传则保持
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

app.delete('/api/org/users/:id', (req, res) => {
    try {
        // 软删：禁用账号，成绩保留
        getDB().prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 学员/员工登录（可选，与管理 PIN 分离）
app.post('/api/auth/login', (req, res) => {
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
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({ user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
    session.clearSession(req, res);
    res.json({ status: 'success' });
});

// 开考用：活跃人员名册（可下拉选择）
app.get('/api/org/roster', (req, res) => {
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

// ========== 报表 / 导出 / 薄弱点 ==========
app.get('/api/admin/reports/records', (req, res) => {
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
        // 标记试卷是否仍存在
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

app.get('/api/admin/reports/export.csv', (req, res) => {
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
        res.send('\uFEFF' + lines.join('\n'));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

function csvEscape(v) {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

// 知识薄弱 Top：仅 unfound（不含 miss 无效点击，避免 unknown）
app.get('/api/admin/reports/weak-items', (req, res) => {
    try {
        const db = getDB();
        const filters = analytics.buildFilters(req.query, db);
        const level = req.query.level || 'L3';
        const limit = Number(req.query.limit) || 20;
        // 优先物化表
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
        // 回退：扫 session_log 仅 unfound
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

// ========== 学情分析 Analytics ==========
app.get('/api/admin/analytics/summary', (req, res) => {
    try {
        const db = getDB();
        const filters = analytics.buildFilters(req.query, db);
        res.json(analytics.getSummary(db, filters));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/analytics/knowledge', (req, res) => {
    try {
        const db = getDB();
        const filters = analytics.buildFilters(req.query, db);
        res.json({
            L1: analytics.aggregateKnowledge(db, filters, 'L1'),
            L2: analytics.aggregateKnowledge(db, filters, 'L2'),
            L3: analytics.aggregateKnowledge(db, filters, 'L3').slice(0, Number(req.query.limit) || 50)
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/analytics/org', (req, res) => {
    try {
        const db = getDB();
        res.json(analytics.getOrgAnalytics(db, analytics.buildFilters(req.query, db)));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/analytics/proficiency', (req, res) => {
    try {
        const db = getDB();
        res.json(analytics.getProficiency(db, analytics.buildFilters(req.query, db)));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/analytics/insights', (req, res) => {
    try {
        const db = getDB();
        res.json({ insights: analytics.buildInsights(db, analytics.buildFilters(req.query, db)) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/analytics/overview', (req, res) => {
    try {
        res.json(analytics.buildOverview(getDB(), req.query));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// 筛选器用：试卷列表 + 部门树
app.get('/api/admin/analytics/filters', (req, res) => {
    try {
        const db = getDB();
        const exams = db.prepare(`
            SELECT exam_id as id, MAX(exam_name) as exam_name, count(*) as record_count,
                   MAX(completed_at) as last_at
            FROM records GROUP BY exam_id ORDER BY last_at DESC
        `).all();
        const live = new Set(db.prepare('SELECT id FROM exams').all().map(e => e.id));
        // 也并入尚无成绩的已发布卷
        const published = db.prepare(`SELECT id, exam_name FROM exams WHERE status = 'published'`).all();
        const examMap = new Map(exams.map(e => [e.id, {
            id: e.id,
            examName: e.exam_name || e.id,
            recordCount: e.record_count,
            deleted: !live.has(e.id)
        }]));
        for (const p of published) {
            if (!examMap.has(p.id)) {
                examMap.set(p.id, { id: p.id, examName: p.exam_name, recordCount: 0, deleted: false });
            }
        }
        const departments = db.prepare('SELECT id, name, parent_id, sort_order FROM departments ORDER BY sort_order, name').all();
        res.json({
            exams: [...examMap.values()],
            departments
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 成绩卷宗列表（含已删试卷的 exam_id，便于报表筛选）
app.get('/api/admin/reports/exam-ids', (req, res) => {
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

// 11. 数据库巡检：查询任意表内容
app.get('/api/admin/db/query/:table', async (req, res) => {
    try {
        const db = getDB();
        const table = req.params.table;
        const validTables = [
            'assets', 'annotations', 'exams', 'exam_items', 'records',
            'knowledge_scenes', 'knowledge_categories', 'knowledge_items',
            'risk_dictionary', '_legacy_knowledge',
            'organizations', 'departments', 'users', 'user_profiles',
            'attempt_stats', 'knowledge_error_facts',
            'auth_sessions', 'exam_attempts', 'schema_version',
            'assignments', 'assignment_targets', 'audit_log'
        ];
        if (!validTables.includes(table)) {
            return res.status(400).json({ error: "Invalid table name" });
        }
        let rows = db.prepare(`SELECT * FROM ${table} LIMIT 100`).all();
        if (table === 'users') {
            rows = rows.map(({ password_hash, ...rest }) => rest);
        }
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 12. 数据清理：强力移除存量 JSON Sidecar 文件
app.get('/api/admin/assignments', (req, res) => {
    try {
        res.json(attendance.listAssignments(getDB(), req.query.examId || null));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/assignments', (req, res) => {
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

app.delete('/api/admin/assignments/:id', (req, res) => {
    try {
        const db = getDB();
        db.transaction(() => {
            db.prepare('DELETE FROM assignment_targets WHERE assignment_id = ?').run(req.params.id);
            db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
        })();
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/reports/attendance', (req, res) => {
    try {
        res.json(attendance.buildAttendance(getDB(), {
            examId: req.query.examId,
            from: req.query.from,
            to: req.query.to,
            assignmentId: req.query.assignmentId
        }));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/admin/reports/attendance.csv', (req, res) => {
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
        res.send('\uFEFF' + lines.join('\n'));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post('/api/admin/backup', session.requireAdmin, (req, res) => {
    try {
        const r = backup.createBackup(getDB());
        writeAudit(getDB(), req, 'backup.create', r.fileName, { bytes: r.bytes });
        res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/backup', session.requireAdmin, (req, res) => {
    try { res.json(backup.listBackups()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/backup/download/:name', session.requireAdmin, (req, res) => {
    try {
        const f = backup.readBackupFile(req.params.name);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`);
        res.send(f.data);
    } catch (e) { res.status(404).json({ error: e.message }); }
});

app.post('/api/admin/restore', session.requireAdmin, uploadZip.single('file'), (req, res) => {
    try {
        if (!req.file?.buffer) return res.status(400).json({ error: '请上传 zip' });
        const r = backup.restoreBackup(req.file.buffer);
        writeAudit(getDB(), req, 'backup.restore', req.file.originalname, r.files?.length);
        res.json({ status: 'success', ...r, hint: '请重启服务以加载新数据库' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/bank/export.zip', (req, res) => {
    try {
        const buf = bankPack.exportBank(getDB(), { examId: req.query.examId || null });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="safespot-bank.zip"');
        res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/bank/import', uploadZip.single('file'), (req, res) => {
    try {
        if (!req.file?.buffer) return res.status(400).json({ error: '请上传题库 zip' });
        const r = bankPack.importBank(getDB(), req.file.buffer);
        writeAudit(getDB(), req, 'bank.import', req.file.originalname, r);
        res.json({ status: 'success', ...r });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/audit', (req, res) => {
    try {
        res.json(listAudit(getDB(), { limit: req.query.limit }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/personnel/import', session.requireStaff, uploadZip.single('file'), (req, res) => {
    try {
        const text = req.file?.buffer
            ? req.file.buffer.toString('utf8')
            : String(req.body?.csv || '');
        const r = importPersonnelCsv(getDB(), text);
        writeAudit(getDB(), req, 'personnel.import', 'csv', r);
        res.json({ status: 'success', ...r });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/admin/hygiene', (req, res) => {
    try {
        res.json(cleanup.previewHygiene(getDB()));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/hygiene', (req, res) => {
    try {
        const r = cleanup.runHygiene(getDB());
        writeAudit(getDB(), req, 'admin.hygiene', 'assets+analytics', r);
        res.json({ status: 'success', ...r });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/bank/seed-starter', (req, res) => {
    try {
        const r = seedStarterPack(getDB());
        writeAudit(getDB(), req, 'bank.seed', r.examId || '', r);
        res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/cleanup', session.requireAdmin, async (req, res) => {
    try {
        const targets = [DIR_META, DIR_EXAMS, DIR_RECORDS];
        let deletedCount = 0;
        for (const dir of targets) {
            if (fsSync.existsSync(dir)) {
                const files = await fs.readdir(dir);
                for (const f of files) {
                    if (f.endsWith('.json')) {
                        await fs.unlink(path.join(dir, f));
                        deletedCount++;
                    }
                }
            }
        }
        writeAudit(getDB(), req, 'admin.cleanup', 'json', { deletedCount });
        res.json({ status: "success", message: `清理完成，共移除 ${deletedCount} 个无效 JSON 文件。` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
