const fs = require('fs');
const path = require('path');
const { annotationSnapshot } = require('./examEngine');
const { newId } = require('./auth');
const { assetStem } = require('./cleanup');

const RAW_DIR = path.join(__dirname, '../data/assets/raw');
const CANDIDATE_DIRS = [
    path.join(__dirname, '../data/assets/case-bank-generated'),
    path.join(__dirname, '../../seed/case-bank')
];

function findPackDir() {
    for (const dir of CANDIDATE_DIRS) {
        if (fs.existsSync(path.join(dir, 'MANIFEST.json'))) return dir;
    }
    return null;
}

function layoutBoxes(n) {
    const boxes = [];
    for (let i = 0; i < n; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        boxes.push({
            x: 0.08 + col * 0.30,
            y: 0.12 + row * 0.28,
            w: 0.24,
            h: 0.22
        });
    }
    return boxes;
}

function seedStarterPack(db) {
    const packDir = findPackDir();
    if (!packDir) return { skipped: true, reason: 'no-pack' };

    const existing = db.prepare("SELECT id FROM exams WHERE exam_name = '开箱示范卷'").get();
    if (existing) return { skipped: true, reason: 'exists', examId: existing.id };

    const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'MANIFEST.json'), 'utf8'));
    const cases = (manifest.cases || []).filter((c) => c.type === 'case_photo');
    if (!cases.length) return { skipped: true, reason: 'no-cases' };

    fs.mkdirSync(RAW_DIR, { recursive: true });
    const slides = [];

    const tx = db.transaction(() => {
        for (const c of cases) {
            const src = path.join(packDir, c.file);
            if (!fs.existsSync(src)) continue;
            const ext = path.extname(c.file) || '.jpg';
            const destName = path.basename(c.file, ext).replace(/[^\w\u4e00-\u9fff-]+/g, '_') + ext;
            const dest = path.join(RAW_DIR, destName);
            const stem = assetStem(destName);
            const reused = db.prepare('SELECT id FROM assets').all().find((a) => assetStem(a.id) === stem);
            if (reused) {
                slides.push(reused.id);
                continue;
            }
            if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);

            const asset = db.prepare('SELECT id FROM assets WHERE id = ?').get(destName);
            if (!asset) {
                db.prepare(`INSERT INTO assets (id, filename, path, is_annotated, upload_time, original_name)
                    VALUES (?, ?, ?, 1, ?, ?)`)
                    .run(destName, destName, `/assets/raw/${destName}`, Date.now(), c.file);
            }

            const have = db.prepare('SELECT count(*) as c FROM annotations WHERE asset_id = ?').get(destName).c;
            if (!have) {
                const clauses = c.clauseIds || [];
                const boxes = layoutBoxes(clauses.length);
                clauses.forEach((clauseId, i) => {
                    const b = boxes[i];
                    const id = newId('anno');
                    db.prepare(`INSERT INTO annotations (id, asset_id, shape, x, y, w, h, clause_id, score_weight, description)
                        VALUES (?, ?, 'rect', ?, ?, ?, ?, ?, 10, ?)`)
                        .run(id, destName, b.x, b.y, b.w, b.h, clauseId, (c.suggestedHazards && c.suggestedHazards[i]) || clauseId);
                });
            }
            db.prepare('UPDATE assets SET is_annotated = 1 WHERE id = ?').run(destName);
            slides.push(destName);
        }

        if (!slides.length) return;
        const examId = newId('exam');
        const settings = JSON.stringify({ totalScore: 100, scoringRule: 'weighted', timeLimitSec: 0 });
        db.prepare(`INSERT INTO exams (id, exam_name, description, status, settings, created_at)
            VALUES (?, ?, ?, 'published', ?, ?)`)
            .run(
                examId,
                '开箱示范卷',
                '系统预置的 12 张场景示范卷。热区为示意框，正式培训请按现场实图重新标注。',
                settings,
                Date.now()
            );
        const ins = db.prepare('INSERT INTO exam_items (exam_id, asset_id, order_index, item_meta) VALUES (?, ?, ?, ?)');
        slides.forEach((assetId, idx) => {
            ins.run(examId, assetId, idx, JSON.stringify(annotationSnapshot(db, assetId)));
        });
        return examId;
    });

    const examId = tx();
    return { skipped: !examId, examId, slides: slides.length };
}

module.exports = { seedStarterPack, findPackDir };
