const express = require('express');
const { getDB } = require('../db');
const analytics = require('../analytics');

const router = express.Router();

// 学情综合 KPI 统计
router.get('/admin/analytics/summary', (req, res) => {
    try {
        const db = getDB();
        const filters = analytics.buildFilters(req.query, db);
        res.json(analytics.getSummary(db, filters));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 知识点掌握度多层级聚合（L1场景、L2类别、L3细则）
router.get('/admin/analytics/knowledge', (req, res) => {
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

// 部门组织维度的学情统计
router.get('/admin/analytics/org', (req, res) => {
    try {
        const db = getDB();
        res.json(analytics.getOrgAnalytics(db, analytics.buildFilters(req.query, db)));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 学员熟练度分布（PRI 分级：精通/合格/需提升/高危）
router.get('/admin/analytics/proficiency', (req, res) => {
    try {
        const db = getDB();
        res.json(analytics.getProficiency(db, analytics.buildFilters(req.query, db)));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 学情诊断与薄弱预警洞察
router.get('/admin/analytics/insights', (req, res) => {
    try {
        const db = getDB();
        res.json({ insights: analytics.buildInsights(db, analytics.buildFilters(req.query, db)) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 整体学情看板大盘数据
router.get('/admin/analytics/overview', (req, res) => {
    try {
        res.json(analytics.buildOverview(getDB(), req.query));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// 筛选器下拉源：试卷列表 + 部门树
router.get('/admin/analytics/filters', (req, res) => {
    try {
        const db = getDB();
        const exams = db.prepare(`
            SELECT exam_id as id, MAX(exam_name) as exam_name, count(*) as record_count,
                   MAX(completed_at) as last_at
            FROM records GROUP BY exam_id ORDER BY last_at DESC
        `).all();
        const live = new Set(db.prepare('SELECT id FROM exams').all().map(e => e.id));
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

module.exports = router;
