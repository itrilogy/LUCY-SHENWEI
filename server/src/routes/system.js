const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const multer = require('multer');
const { getDB } = require('../db');
const session = require('../session');
const backup = require('../backup');
const bankPack = require('../bankPack');
const { writeAudit, listAudit } = require('../audit');
const cleanup = require('../cleanup');
const { seedStarterPack } = require('../seedStarter');

const router = express.Router();
const uploadZip = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024, files: 1 }
});

const DIR_META = path.join(__dirname, '../../data/assets/meta');
const DIR_RECORDS = path.join(__dirname, '../../data/sessions/records');
const DIR_EXAMS = path.join(__dirname, '../../data/exams');

// 数据库巡检：只读查询白名单表数据
router.get('/admin/db/query/:table', async (req, res) => {
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

// 数据备份：创建全量备份包
router.post('/admin/backup', session.requireAdmin, (req, res) => {
    try {
        const r = backup.createBackup(getDB());
        writeAudit(getDB(), req, 'backup.create', r.fileName, { bytes: r.bytes });
        res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 数据备份：列出可用备份
router.get('/admin/backup', session.requireAdmin, (req, res) => {
    try { res.json(backup.listBackups()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// 数据备份：下载备份包
router.get('/admin/backup/download/:name', session.requireAdmin, (req, res) => {
    try {
        const f = backup.readBackupFile(req.params.name);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`);
        res.send(f.data);
    } catch (e) { res.status(404).json({ error: e.message }); }
});

// 数据恢复：从备份包恢复
router.post('/admin/restore', session.requireAdmin, uploadZip.single('file'), (req, res) => {
    try {
        if (!req.file?.buffer) return res.status(400).json({ error: '请上传 zip' });
        const r = backup.restoreBackup(req.file.buffer);
        writeAudit(getDB(), req, 'backup.restore', req.file.originalname, r.files?.length);
        res.json({ status: 'success', ...r, hint: '请重启服务以加载新数据库' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 题库包导出
router.get('/admin/bank/export.zip', (req, res) => {
    try {
        const buf = bankPack.exportBank(getDB(), { examId: req.query.examId || null });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="safespot-bank.zip"');
        res.send(buf);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 题库包导入
router.post('/admin/bank/import', uploadZip.single('file'), (req, res) => {
    try {
        if (!req.file?.buffer) return res.status(400).json({ error: '请上传题库 zip' });
        const r = bankPack.importBank(getDB(), req.file.buffer);
        writeAudit(getDB(), req, 'bank.import', req.file.originalname, r);
        res.json({ status: 'success', ...r });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 操作审计日志查询
router.get('/admin/audit', (req, res) => {
    try {
        res.json(listAudit(getDB(), { limit: req.query.limit }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 数据卫生巡检：预览孤立图片及物化缺失
router.get('/admin/hygiene', (req, res) => {
    try {
        res.json(cleanup.previewHygiene(getDB()));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 数据卫生修复：执行清理与物化重构
router.post('/admin/hygiene', (req, res) => {
    try {
        const r = cleanup.runHygiene(getDB());
        writeAudit(getDB(), req, 'admin.hygiene', 'assets+analytics', r);
        res.json({ status: 'success', ...r });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 初始化预置样例题库
router.post('/admin/bank/seed-starter', (req, res) => {
    try {
        const r = seedStarterPack(getDB());
        writeAudit(getDB(), req, 'bank.seed', r.examId || '', r);
        res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 清理存量已废弃的 JSON Sidecar 历史冗余文件
router.post('/admin/cleanup', session.requireAdmin, async (req, res) => {
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

module.exports = router;
