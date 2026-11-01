const express = require('express');
const { getDB } = require('../db');

const router = express.Router();

const calculateItemWeight = (item, riskDict) => {
    const lValue = riskDict.find(d => d.id === item.likelihood_level)?.level_value || 1;
    const cValue = riskDict.find(d => d.id === item.consequence_level)?.level_value || 1;
    return lValue * cValue;
};

// 获取法规字典（从三张新表联查聚合为原有嵌套树结构）
router.get('/knowledge', async (req, res) => {
    try {
        const db = getDB();

        const scenes = db.prepare('SELECT * FROM knowledge_scenes ORDER BY sort_order ASC, id ASC').all();
        const categories = db.prepare('SELECT * FROM knowledge_categories ORDER BY sort_order ASC, id ASC').all();
        const items = db.prepare('SELECT * FROM knowledge_items ORDER BY sort_order ASC, id ASC').all();
        const riskDict = db.prepare('SELECT * FROM risk_dictionary').all();

        const knowledgeTree = scenes.map(s => {
            const sceneCats = categories.filter(c => c.scene_id === s.id);
            return {
                id: s.id,
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

// --- 风险字典 (Risk Dictionary) ---
router.get('/admin/risk/dict', (req, res) => {
    try {
        const rows = getDB().prepare('SELECT * FROM risk_dictionary ORDER BY type ASC, level_value ASC').all();
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/admin/risk/dict/:id', (req, res) => {
    try {
        const { level_name, level_value } = req.body;
        getDB().prepare('UPDATE risk_dictionary SET level_name = ?, level_value = ? WHERE id = ?')
            .run(level_name, level_value, req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 场景 Scenes ---
router.get('/admin/knowledge/scenes', (req, res) => {
    try {
        const rows = getDB().prepare('SELECT * FROM knowledge_scenes ORDER BY sort_order ASC').all();
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/knowledge/scenes', (req, res) => {
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

router.put('/admin/knowledge/scenes/:id', (req, res) => {
    try {
        const { name, description } = req.body;
        getDB().prepare('UPDATE knowledge_scenes SET name = ?, description = ? WHERE id = ?')
            .run(name, description || '', req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/knowledge/scenes/:id', (req, res) => {
    try {
        getDB().prepare('DELETE FROM knowledge_scenes WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 大类 Categories ---
router.get('/admin/knowledge/categories', (req, res) => {
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

router.post('/admin/knowledge/categories', (req, res) => {
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

router.put('/admin/knowledge/categories/:id', (req, res) => {
    try {
        const { name } = req.body;
        getDB().prepare('UPDATE knowledge_categories SET name = ? WHERE id = ?').run(name, req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/knowledge/categories/:id', (req, res) => {
    try {
        getDB().prepare('DELETE FROM knowledge_categories WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 细则 Items ---
router.get('/admin/knowledge/items', (req, res) => {
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
            score_weight: calculateItemWeight(r, riskDict)
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/knowledge/items', (req, res) => {
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

router.put('/admin/knowledge/items/:id', (req, res) => {
    try {
        const { title, content, score_weight, likelihood_level, consequence_level, standard_code, tags } = req.body;
        getDB().prepare('UPDATE knowledge_items SET title = ?, content = ?, score_weight = ?, likelihood_level = ?, consequence_level = ?, standard_code = ?, tags = ? WHERE id = ?')
            .run(title, content || '', score_weight || 10, likelihood_level || null, consequence_level || null, standard_code || '', JSON.stringify(tags || []), req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/knowledge/items/:id', (req, res) => {
    try {
        getDB().prepare('DELETE FROM knowledge_items WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
