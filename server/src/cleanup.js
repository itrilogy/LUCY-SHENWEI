const fs = require('fs');
const path = require('path');

const DIR_RAW = path.join(__dirname, '../data/assets/raw');

function assetStem(id) {
    const base = path.basename(String(id || ''), path.extname(String(id || '')));
    return base.replace(/_\d{10,}-\w{4,8}$/, '');
}

function safeUnlink(filename) {
    const safe = path.basename(filename);
    const filePath = path.resolve(DIR_RAW, safe);
    const root = path.resolve(DIR_RAW);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) return false;
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return true;
    } catch {
        return false;
    }
}

function previewDuplicateAssets(db) {
    const rows = db.prepare(`
        SELECT a.id, a.original_name, a.filename,
               (SELECT count(*) FROM annotations n WHERE n.asset_id = a.id) as anno_count
        FROM assets a
    `).all();
    const annotatedStems = new Set(
        rows.filter((r) => r.anno_count > 0).map((r) => assetStem(r.id))
    );
    const used = new Set(
        db.prepare('SELECT DISTINCT asset_id FROM exam_items').all().map((r) => r.asset_id)
    );
    return rows
        .filter((r) => r.anno_count === 0 && annotatedStems.has(assetStem(r.id)) && !used.has(r.id))
        .map((r) => ({ id: r.id, stem: assetStem(r.id), original_name: r.original_name }));
}

function purgeDuplicateUnannotatedAssets(db) {
    const dupes = previewDuplicateAssets(db);
    const delAnno = db.prepare('DELETE FROM annotations WHERE asset_id = ?');
    const delItems = db.prepare('DELETE FROM exam_items WHERE asset_id = ?');
    const delAsset = db.prepare('DELETE FROM assets WHERE id = ?');
    const files = [];
    const tx = db.transaction(() => {
        for (const d of dupes) {
            delAnno.run(d.id);
            delItems.run(d.id);
            delAsset.run(d.id);
            files.push(d.id);
        }
    });
    tx();
    for (const id of files) safeUnlink(id);
    return { removed: dupes, count: dupes.length };
}

function previewOrphanRecords(db) {
    return db.prepare(`
        SELECT r.id, r.exam_id, r.exam_name, r.user_name, r.score
        FROM records r
        WHERE r.exam_id IS NULL OR r.exam_id = ''
           OR NOT EXISTS (SELECT 1 FROM exams e WHERE e.id = r.exam_id)
    `).all();
}

function purgeOrphanAnalytics(db) {
    const stats = db.prepare(`
        DELETE FROM attempt_stats WHERE record_id NOT IN (SELECT id FROM records)
    `).run();
    const facts = db.prepare(`
        DELETE FROM knowledge_error_facts WHERE record_id NOT IN (SELECT id FROM records)
    `).run();
    const byMissingExam = db.prepare(`
        DELETE FROM attempt_stats WHERE exam_id IS NOT NULL
          AND exam_id NOT IN (SELECT id FROM exams)
          AND record_id NOT IN (SELECT id FROM records)
    `).run();
    return {
        attemptStats: stats.changes,
        knowledgeFacts: facts.changes,
        extra: byMissingExam.changes
    };
}

function purgeRecordsOfDeletedExams(db) {
    const rows = previewOrphanRecords(db);
    const ids = rows.map((r) => r.id);
    if (!ids.length) return { records: 0, analytics: purgeOrphanAnalytics(db), preview: [] };
    const ph = ids.map(() => '?').join(',');
    const tx = db.transaction(() => {
        db.prepare(`DELETE FROM knowledge_error_facts WHERE record_id IN (${ph})`).run(...ids);
        db.prepare(`DELETE FROM attempt_stats WHERE record_id IN (${ph})`).run(...ids);
        db.prepare(`DELETE FROM records WHERE id IN (${ph})`).run(...ids);
    });
    tx();
    return {
        records: ids.length,
        analytics: purgeOrphanAnalytics(db),
        preview: rows
    };
}

function runHygiene(db) {
    const assets = purgeDuplicateUnannotatedAssets(db);
    const scores = purgeRecordsOfDeletedExams(db);
    return { assets, scores };
}

function previewHygiene(db) {
    return {
        duplicateAssets: previewDuplicateAssets(db),
        orphanRecords: previewOrphanRecords(db),
        orphanAttemptStats: db.prepare(`
            SELECT count(*) as c FROM attempt_stats
            WHERE record_id NOT IN (SELECT id FROM records)
        `).get().c,
        orphanFacts: db.prepare(`
            SELECT count(*) as c FROM knowledge_error_facts
            WHERE record_id NOT IN (SELECT id FROM records)
        `).get().c
    };
}

module.exports = {
    assetStem,
    previewHygiene,
    runHygiene,
    purgeDuplicateUnannotatedAssets,
    purgeOrphanAnalytics,
    purgeRecordsOfDeletedExams
};
