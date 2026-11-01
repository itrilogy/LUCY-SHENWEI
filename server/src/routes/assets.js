const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const multer = require('multer');
const { getDB } = require('../db');
const { writeAudit } = require('../audit');

const router = express.Router();
const DIR_RAW = path.join(__dirname, '../../data/assets/raw');

/**
 * 修复 multer/busboy 对中文文件名的乱码：
 * 浏览器以 UTF-8 发送文件名，busboy 常按 latin1 读成“æ…/å…”等 mojibake。
 */
function decodeUploadFilename(originalName) {
    if (!originalName || typeof originalName !== 'string') return 'image';
    let name = originalName;
    try {
        if (/%[0-9A-Fa-f]{2}/.test(name)) {
            try { name = decodeURIComponent(name); } catch (_) { /* keep */ }
        }
        const hasCjk = (s) => /[一-鿿㐀-䶿]/.test(s);
        const hasMojibake = (s) => /[ÃÂÅÆØÐÑåæø]/.test(s) || /Ã./.test(s);
        if (!hasCjk(name) || hasMojibake(name)) {
            const repaired = Buffer.from(originalName, 'latin1').toString('utf8');
            if (hasCjk(repaired) && !repaired.includes('�')) {
                name = repaired;
            }
        }
    } catch (_) { /* keep original */ }
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

// 获取所有的图片列表（来自数据库，带标注统计与纠偏）
router.get('/assets', async (req, res) => {
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
                if (!Array.isArray(items) || (items.length === 1 && items[0] == null)) items = [];
            } catch (_) { items = []; }

            const count = Number(a.anno_count) || items.length;
            const isAnnotated = count > 0;
            if ((a.is_annotated === 1) !== isAnnotated) {
                try { fixFlag.run(isAnnotated ? 1 : 0, a.id); } catch (_) { /* ignore */ }
            }

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

// 上传新图片 (同步写入数据库) — 支持单文件 image 或多文件 images
router.post('/assets/upload', upload.any(), async (req, res) => {
    const files = (req.files && req.files.length) ? req.files : (req.file ? [req.file] : []);
    if (!files.length) return res.status(400).json({ error: '没有上传任何文件' });

    try {
        const db = getDB();
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

// 删除图片及关联标注数据 (物理 + 数据库)
router.delete('/assets/:filename', async (req, res) => {
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

// 获取特定图片的标注元数据
router.get('/assets/meta/:imgName', async (req, res) => {
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

// 保存图片的标注配置信息 (先删后增，事务处理)
router.post('/assets/meta/:imgName', async (req, res) => {
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

module.exports = router;
module.exports.DIR_RAW = DIR_RAW;
