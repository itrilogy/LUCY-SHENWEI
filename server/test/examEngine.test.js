const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let Database;
try {
    Database = require('better-sqlite3');
    const probe = new Database(':memory:');
    probe.close();
} catch (e) {
    Database = null;
}

const examEngine = Database ? require('../src/examEngine') : null;
const startAttempt = examEngine?.startAttempt;
const applyClick = examEngine?.applyClick;
const submitAttempt = examEngine?.submitAttempt;

function memoryDb() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE exams (id TEXT PRIMARY KEY, exam_name TEXT, description TEXT, status TEXT, settings TEXT, created_at INTEGER);
        CREATE TABLE exam_items (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id TEXT, asset_id TEXT, order_index INTEGER, item_meta TEXT);
        CREATE TABLE annotations (
            id TEXT PRIMARY KEY, asset_id TEXT, shape TEXT, x REAL, y REAL, w REAL, h REAL,
            clause_id TEXT, score_weight INTEGER, description TEXT
        );
        CREATE TABLE records (
            id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id TEXT, exam_name TEXT, user_name TEXT, user_id TEXT,
            score INTEGER, paper_total INTEGER, mode TEXT, completed_at INTEGER, department TEXT,
            department_id TEXT, employee_id TEXT, duration INTEGER, session_log TEXT
        );
        CREATE TABLE attempt_stats (
            record_id INTEGER PRIMARY KEY, user_id TEXT, department_id TEXT, exam_id TEXT, exam_name TEXT,
            user_name TEXT, mode TEXT, score REAL, paper_total REAL, score_rate REAL, duration_ms INTEGER,
            hazards_total INTEGER, hazards_hit INTEGER, hazards_unfound INTEGER, invalid_clicks INTEGER,
            pri REAL, r_miss REAL, waste_ratio REAL, completed_at INTEGER
        );
        CREATE TABLE knowledge_error_facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, record_id INTEGER, user_id TEXT, department_id TEXT,
            exam_id TEXT, clause_id TEXT, category_id TEXT, scene_id TEXT, outcome TEXT, label TEXT,
            weight REAL, completed_at INTEGER
        );
        CREATE TABLE knowledge_items (
            id TEXT PRIMARY KEY, category_id TEXT, title TEXT, content TEXT, score_weight INTEGER
        );
        CREATE TABLE knowledge_categories (id TEXT PRIMARY KEY, scene_id TEXT, name TEXT);
        CREATE TABLE knowledge_scenes (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE exam_attempts (
            id TEXT PRIMARY KEY, exam_id TEXT, exam_name TEXT, user_id TEXT, user_name TEXT,
            department TEXT, department_id TEXT, employee_id TEXT, mode TEXT, paper_total INTEGER,
            scoring_rule TEXT, time_limit_sec INTEGER, started_at INTEGER, submitted_at INTEGER,
            status TEXT, snapshot_json TEXT, state_json TEXT, record_id INTEGER
        );
    `);
    db.prepare(`INSERT INTO exams (id, exam_name, status, settings, created_at) VALUES (?,?,?,?,?)`)
        .run('paper-a', '隐患卷A', 'published', JSON.stringify({ totalScore: 100, scoringRule: 'average', timeLimitSec: 0 }), Date.now());
    db.prepare('INSERT INTO exam_items (exam_id, asset_id, order_index) VALUES (?,?,?)').run('paper-a', 'slide1.jpg', 0);
    db.prepare(`INSERT INTO annotations (id, asset_id, shape, x, y, w, h, clause_id, score_weight, description)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run('h1', 'slide1.jpg', 'rect', 0.1, 0.1, 0.2, 0.2, 'JB-01', 10, '洞口');
    db.prepare(`INSERT INTO annotations (id, asset_id, shape, x, y, w, h, clause_id, score_weight, description)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run('h2', 'slide1.jpg', 'circle', 0.6, 0.6, 0.2, 0.2, 'JB-02', 10, '临边');
    return db;
}

describe('examEngine authoritative scoring', { skip: !Database }, () => {
    let db;
    before(() => { db = memoryDb(); });

    it('start → hit → miss → submit; score ignores client and matches snapshot', () => {
        const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get('paper-a');
        const started = startAttempt(db, {
            exam,
            mode: 'exam',
            identity: { userId: null, userName: '张三', department: '生产部' }
        });
        assert.equal(started.mode, 'exam');
        assert.equal(started.paperTotal, 100);
        assert.equal(started.slides[0].items.length, 0, 'exam mode hides unfound hotspots');

        const hit = applyClick(db, started.id, { slideId: 'slide1.jpg', x: 0.2, y: 0.2 });
        assert.equal(hit.result, 'hit');
        assert.equal(hit.score, 50);

        const miss = applyClick(db, started.id, { slideId: 'slide1.jpg', x: 0.01, y: 0.01 });
        assert.equal(miss.result, 'miss');

        const done = submitAttempt(db, started.id);
        assert.equal(done.score, 50);
        assert.equal(done.paperTotal, 100);
        assert.equal(done.missed.length, 1);
        assert.equal(done.missed[0].id, 'h2');

        const rec = db.prepare('SELECT * FROM records WHERE id = ?').get(done.recordId);
        assert.equal(rec.score, 50);
        assert.equal(rec.user_name, '张三');
        assert.equal(rec.mode, 'exam');
        assert.ok(rec.session_log.includes('unfound'));
    });

    it('practice can be started but cannot be flipped to exam by the client after start', () => {
        const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get('paper-a');
        const started = startAttempt(db, {
            exam,
            mode: 'practice',
            identity: { userName: '练习生' }
        });
        assert.equal(started.mode, 'practice');
        const done = submitAttempt(db, started.id);
        assert.equal(done.mode, 'practice');
        const rec = db.prepare('SELECT mode FROM records WHERE id = ?').get(done.recordId);
        assert.equal(rec.mode, 'practice');
    });
});
