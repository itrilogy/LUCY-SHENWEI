const fs = require('fs');
const path = require('path');
const { packZip, unpackZip } = require('./zipStore');
const { newId } = require('./auth');

const RAW_DIR = path.join(__dirname, '../data/assets/raw');

function collectKnowledge(db, clauseIds) {
    const ids = [...new Set(clauseIds.filter(Boolean))];
    if (!ids.length) return { scenes: [], categories: [], items: [] };
    const ph = ids.map(() => '?').join(',');
    const items = db.prepare(`SELECT * FROM knowledge_items WHERE id IN (${ph})`).all(...ids);
    const catIds = [...new Set(items.map((i) => i.category_id).filter(Boolean))];
    const categories = catIds.length
        ? db.prepare(`SELECT * FROM knowledge_categories WHERE id IN (${catIds.map(() => '?').join(',')})`).all(...catIds)
        : [];
    const sceneIds = [...new Set(categories.map((c) => c.scene_id).filter(Boolean))];
    const scenes = sceneIds.length
        ? db.prepare(`SELECT * FROM knowledge_scenes WHERE id IN (${sceneIds.map(() => '?').join(',')})`).all(...sceneIds)
        : [];
    return { scenes, categories, items };
}

function snapshotAsset(db, assetId) {
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
    const annos = db.prepare('SELECT * FROM annotations WHERE asset_id = ?').all(assetId);
    return { asset, annos };
}

function exportBank(db, { examId } = {}) {
    const exams = examId
        ? db.prepare('SELECT * FROM exams WHERE id = ?').all(examId)
        : db.prepare("SELECT * FROM exams WHERE status = 'published'").all();
    const examItems = [];
    const assetIds = new Set();
    for (const e of exams) {
        const items = db.prepare('SELECT * FROM exam_items WHERE exam_id = ? ORDER BY order_index').all(e.id);
        examItems.push(...items);
        items.forEach((i) => assetIds.add(i.asset_id));
    }
    const assets = [];
    const annotations = [];
    const clauseIds = [];
    const imageEntries = [];
    for (const id of assetIds) {
        const { asset, annos } = snapshotAsset(db, id);
        if (asset) assets.push(asset);
        annotations.push(...annos);
        annos.forEach((a) => clauseIds.push(a.clause_id));
        const disk = path.join(RAW_DIR, id);
        if (fs.existsSync(disk)) {
            imageEntries.push({ name: `images/${id}`, data: fs.readFileSync(disk) });
        }
    }
    const knowledge = collectKnowledge(db, clauseIds);
    const payload = {
        kind: 'safespot-bank',
        version: 1,
        exportedAt: Date.now(),
        exams,
        examItems,
        assets: assets.map((a) => ({ ...a, metadata: undefined })),
        annotations,
        knowledge
    };
    return packZip([
        { name: 'manifest.json', data: JSON.stringify(payload, null, 2) },
        ...imageEntries
    ]);
}

function importBank(db, zipBuf) {
    const files = unpackZip(zipBuf);
    const man = files.find((f) => f.name === 'manifest.json');
    if (!man) throw new Error('题库包缺少 manifest.json');
    const pack = JSON.parse(man.data.toString('utf8'));
    if (pack.kind !== 'safespot-bank') throw new Error('不是题库包');

    fs.mkdirSync(RAW_DIR, { recursive: true });
    const assetMap = {};
    const examMap = {};

    const tx = db.transaction(() => {
        const kn = pack.knowledge || {};
        for (const s of kn.scenes || []) {
            db.prepare('INSERT OR IGNORE INTO knowledge_scenes (id, name, description, sort_order) VALUES (?, ?, ?, ?)')
                .run(s.id, s.name, s.description || '', s.sort_order || 0);
        }
        for (const c of kn.categories || []) {
            db.prepare('INSERT OR IGNORE INTO knowledge_categories (id, scene_id, name, sort_order) VALUES (?, ?, ?, ?)')
                .run(c.id, c.scene_id, c.name, c.sort_order || 0);
        }
        for (const i of kn.items || []) {
            db.prepare(`INSERT OR IGNORE INTO knowledge_items
                (id, category_id, title, content, score_weight, likelihood_level, consequence_level, standard_code, tags, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(i.id, i.category_id, i.title, i.content || '', i.score_weight || 10,
                    i.likelihood_level || null, i.consequence_level || null,
                    i.standard_code || '', i.tags || '[]', i.sort_order || 0);
        }

        for (const a of pack.assets || []) {
            const oldId = a.id;
            let newIdName = oldId;
            const src = files.find((f) => f.name === `images/${oldId}` || f.name.endsWith('/' + oldId));
            if (src) {
                if (fs.existsSync(path.join(RAW_DIR, newIdName))) {
                    const ext = path.extname(oldId);
                    newIdName = `${path.basename(oldId, ext)}_${Date.now().toString(36)}${ext}`;
                }
                fs.writeFileSync(path.join(RAW_DIR, newIdName), src.data);
            }
            assetMap[oldId] = newIdName;
            db.prepare(`INSERT OR IGNORE INTO assets (id, filename, path, is_annotated, upload_time, original_name)
                VALUES (?, ?, ?, ?, ?, ?)`)
                .run(newIdName, newIdName, `/assets/raw/${newIdName}`, a.is_annotated || 0, a.upload_time || Date.now(), a.original_name || oldId);
        }

        for (const an of pack.annotations || []) {
            const assetId = assetMap[an.asset_id] || an.asset_id;
            const id = db.prepare('SELECT id FROM annotations WHERE id = ?').get(an.id) ? newId('anno') : an.id;
            db.prepare(`INSERT OR REPLACE INTO annotations (id, asset_id, shape, x, y, w, h, clause_id, score_weight, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(id, assetId, an.shape, an.x, an.y, an.w, an.h, an.clause_id, an.score_weight, an.description || '');
        }

        for (const e of pack.exams || []) {
            let examId = e.id;
            if (db.prepare('SELECT id FROM exams WHERE id = ?').get(examId)) examId = newId('exam');
            examMap[e.id] = examId;
            db.prepare(`INSERT INTO exams (id, exam_name, description, status, settings, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`)
                .run(examId, e.exam_name, e.description || '', e.status || 'draft', e.settings || '{}', Date.now());
        }
        for (const it of pack.examItems || []) {
            const examId = examMap[it.exam_id] || it.exam_id;
            const assetId = assetMap[it.asset_id] || it.asset_id;
            db.prepare('INSERT INTO exam_items (exam_id, asset_id, order_index, item_meta) VALUES (?, ?, ?, ?)')
                .run(examId, assetId, it.order_index || 0, it.item_meta || null);
        }
    });
    tx();
    return {
        exams: Object.keys(examMap).length,
        assets: Object.keys(assetMap).length,
        annotations: (pack.annotations || []).length
    };
}

module.exports = { exportBank, importBank };
