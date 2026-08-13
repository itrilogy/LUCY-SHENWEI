const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

const DB_PATH = path.join(__dirname, '../data/safeeye.db');
const DIR_RAW = path.join(__dirname, '../data/assets/raw');
const DIR_META = path.join(__dirname, '../data/assets/meta');
const DIR_EXAMS = path.join(__dirname, '../data/exams');
const DIR_RECORDS = path.join(__dirname, '../data/sessions/records');
const KNOWLEDGE_PATH = path.join(__dirname, '../data/knowledge/clauses.json');

let db;

async function initDB() {
    console.log("初始化 SQLite 数据库...");

    // 确保数据目录存在
    await fs.mkdir(path.join(__dirname, '../data/assets'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../data/sessions'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../data/knowledge'), { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    // 1. 创建表结构
    db.exec(`
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            path TEXT NOT NULL,
            is_annotated INTEGER DEFAULT 0,
            upload_time INTEGER,
            metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS annotations (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            shape TEXT,
            x REAL, y REAL, w REAL, h REAL,
            clause_id TEXT,
            score_weight INTEGER,
            description TEXT,
            extra_configs TEXT,
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS exams (
            id TEXT PRIMARY KEY,
            exam_name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'active',
            created_at INTEGER,
            settings TEXT
        );

        CREATE TABLE IF NOT EXISTS exam_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            order_index INTEGER,
            item_meta TEXT,
            FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id TEXT,
            user_name TEXT,
            score INTEGER,
            duration INTEGER,
            completed_at INTEGER,
            session_log TEXT
        );

        CREATE TABLE IF NOT EXISTS knowledge_scenes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS knowledge_categories (
            id TEXT PRIMARY KEY,
            scene_id TEXT NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY(scene_id) REFERENCES knowledge_scenes(id) ON DELETE CASCADE
        );

        -- 5. 风险矩阵字典表
        CREATE TABLE IF NOT EXISTS risk_dictionary (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL, -- 'likelihood' or 'consequence'
            level_name TEXT NOT NULL,
            level_value INTEGER NOT NULL
        );

        -- 6. 知识明细表 (增加风险评估字段)
        CREATE TABLE IF NOT EXISTS knowledge_items (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            score_weight INTEGER DEFAULT 10,
            likelihood_level TEXT, -- 关联风险字典
            consequence_level TEXT, -- 关联风险字典
            standard_code TEXT,
            tags TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (category_id) REFERENCES knowledge_categories(id) ON DELETE CASCADE
        );
    `);

    // 升级现有表结构 (若已存在)
    try {
        db.exec("ALTER TABLE knowledge_items ADD COLUMN likelihood_level TEXT");
    } catch (e) { }
    try {
        db.exec("ALTER TABLE knowledge_items ADD COLUMN consequence_level TEXT");
    } catch (e) { }
    // Phase 1: 成绩身份字段
    try {
        db.exec("ALTER TABLE records ADD COLUMN department TEXT");
    } catch (e) { }
    try {
        db.exec("ALTER TABLE records ADD COLUMN employee_id TEXT");
    } catch (e) { }

    // Phase 2 + 用户体系
    db.exec(`
        CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT,
            created_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS departments (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            parent_id TEXT,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
            FOREIGN KEY(parent_id) REFERENCES departments(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'trainee',
            status TEXT NOT NULL DEFAULT 'active',
            created_at INTEGER,
            FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id TEXT PRIMARY KEY,
            real_name TEXT NOT NULL,
            employee_no TEXT,
            mobile TEXT,
            email TEXT,
            department_id TEXT,
            job_title TEXT,
            extra_json TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE SET NULL
        );
    `);

    const recordCols = [
        ['user_id', 'TEXT'],
        ['exam_name', 'TEXT'],
        ['mode', "TEXT DEFAULT 'exam'"],
        ['paper_total', 'INTEGER'],
        ['department_id', 'TEXT']
    ];
    for (const [col, typ] of recordCols) {
        try { db.exec(`ALTER TABLE records ADD COLUMN ${col} ${typ}`); } catch (e) { }
    }
    try { db.exec('ALTER TABLE assets ADD COLUMN original_name TEXT'); } catch (e) { }

    // 学情分析物化表
    db.exec(`
        CREATE TABLE IF NOT EXISTS attempt_stats (
            record_id INTEGER PRIMARY KEY,
            user_id TEXT,
            department_id TEXT,
            exam_id TEXT,
            exam_name TEXT,
            user_name TEXT,
            mode TEXT,
            score REAL,
            paper_total REAL,
            score_rate REAL,
            duration_ms INTEGER,
            hazards_total INTEGER,
            hazards_hit INTEGER,
            hazards_unfound INTEGER,
            invalid_clicks INTEGER,
            pri REAL,
            r_miss REAL,
            waste_ratio REAL,
            completed_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS knowledge_error_facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER,
            user_id TEXT,
            department_id TEXT,
            exam_id TEXT,
            clause_id TEXT,
            category_id TEXT,
            scene_id TEXT,
            outcome TEXT,
            label TEXT,
            weight REAL,
            completed_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_attempt_stats_exam ON attempt_stats(exam_id);
        CREATE INDEX IF NOT EXISTS idx_attempt_stats_user ON attempt_stats(user_id);
        CREATE INDEX IF NOT EXISTS idx_attempt_stats_dept ON attempt_stats(department_id);
        CREATE INDEX IF NOT EXISTS idx_attempt_stats_time ON attempt_stats(completed_at);
        CREATE INDEX IF NOT EXISTS idx_kef_clause ON knowledge_error_facts(clause_id);
        CREATE INDEX IF NOT EXISTS idx_kef_record ON knowledge_error_facts(record_id);

        CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS auth_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            role TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exam_attempts (
            id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            exam_name TEXT,
            user_id TEXT,
            user_name TEXT NOT NULL,
            department TEXT,
            department_id TEXT,
            employee_id TEXT,
            mode TEXT NOT NULL,
            paper_total INTEGER,
            scoring_rule TEXT,
            time_limit_sec INTEGER,
            started_at INTEGER NOT NULL,
            submitted_at INTEGER,
            status TEXT NOT NULL,
            snapshot_json TEXT NOT NULL,
            state_json TEXT NOT NULL,
            record_id INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_auth_sessions_exp ON auth_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id);

        CREATE TABLE IF NOT EXISTS assignments (
            id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            due_at INTEGER,
            required INTEGER DEFAULT 1,
            created_at INTEGER,
            created_by TEXT
        );
        CREATE TABLE IF NOT EXISTS assignment_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            target_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_assign_exam ON assignments(exam_id);

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            username TEXT,
            action TEXT NOT NULL,
            target TEXT,
            detail TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);
    `);

    const ver = db.prepare('SELECT version FROM schema_version WHERE id = 1').get();
    if (!ver) {
        db.prepare('INSERT INTO schema_version (id, version) VALUES (1, 4)').run();
    } else if (ver.version < 4) {
        db.prepare('UPDATE schema_version SET version = 4 WHERE id = 1').run();
    }

    // 默认组织与管理员种子
    try {
        const orgCount = db.prepare('SELECT count(*) as c FROM organizations').get().c;
        if (orgCount === 0) {
            const orgId = 'org_default';
            const now = Date.now();
            db.prepare('INSERT INTO organizations (id, name, code, created_at) VALUES (?, ?, ?, ?)')
                .run(orgId, '默认企业', 'DEFAULT', now);
            const deptRoot = 'dept_root';
            db.prepare('INSERT INTO departments (id, org_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?, ?)')
                .run(deptRoot, orgId, null, '总部', 0);
            db.prepare('INSERT INTO departments (id, org_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?, ?)')
                .run('dept_safe', orgId, deptRoot, '安环部', 1);
            db.prepare('INSERT INTO departments (id, org_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?, ?)')
                .run('dept_prod', orgId, deptRoot, '生产部', 2);

            // 默认管理员 admin / admin123（本地演示；生产请改密）
            const crypto = require('crypto');
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto.scryptSync('admin123', salt, 64).toString('hex');
            const password_hash = `${salt}:${hash}`;
            const adminId = 'user_admin';
            db.prepare('INSERT INTO users (id, org_id, username, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(adminId, orgId, 'admin', password_hash, 'admin', 'active', now);
            db.prepare('INSERT INTO user_profiles (user_id, real_name, employee_no, department_id, job_title) VALUES (?, ?, ?, ?, ?)')
                .run(adminId, '系统管理员', 'A001', deptRoot, '管理员');
            console.log('[SafeSpot-DB] 已初始化默认组织/部门/管理员 (admin / admin123)');
        }
    } catch (e) {
        console.error('初始化组织用户失败', e);
    }

    // 回填 records.exam_name（卷名快照，删卷后仍可展示）
    try {
        db.prepare(`
            UPDATE records SET exam_name = exam_id
            WHERE exam_name IS NULL OR exam_name = ''
        `).run();
    } catch (e) { }

    // 初始化存量数据的风险等级 (仅针对未设置的记录)
    try {
        const nullCount = db.prepare("SELECT count(*) as c FROM knowledge_items WHERE likelihood_level IS NULL OR consequence_level IS NULL").get().c;
        if (nullCount > 0) {
            console.log(`[SafeEYE-DB] 发现 ${nullCount} 条未设置风险等级的条目，正在初始化为级别 3 (Weight 9)...`);
            db.exec("UPDATE knowledge_items SET likelihood_level = 'lh_3', consequence_level = 'cq_3' WHERE likelihood_level IS NULL OR consequence_level IS NULL");
        }
    } catch (e) { console.error("初始化风险等级失败", e); }

    // 初始化风险字典数据
    const dictCount = db.prepare('SELECT count(*) as c FROM risk_dictionary').get().c;
    if (dictCount === 0) {
        console.log('[SafeEYE-DB] Initializing risk dictionary...');
        const insertDict = db.prepare('INSERT INTO risk_dictionary (id, type, level_name, level_value) VALUES (?, ?, ?, ?)');
        const defaults = [
            // Consequences
            ['cq_1', 'consequence', '极轻微', 1],
            ['cq_2', 'consequence', '轻微', 2],
            ['cq_3', 'consequence', '普通', 3],
            ['cq_4', 'consequence', '严重', 4],
            ['cq_5', 'consequence', '非常严重', 5],
            // Likelihoods
            ['lh_1', 'likelihood', '几乎不会发生', 1],
            ['lh_2', 'likelihood', '不太可能发生', 2],
            ['lh_3', 'likelihood', '可能发生', 3],
            ['lh_4', 'likelihood', '很可能发生', 4],
            ['lh_5', 'likelihood', '几乎肯定发生', 5]
        ];
        db.transaction(() => {
            for (const d of defaults) insertDict.run(...d);
        })();
    }

    // 检查是否需要从扁平版 knowledge 表迁移为新版结构化表
    try {
        const oldTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge'").get();
        if (oldTableExists) {
            const scenesCount = db.prepare('SELECT count(*) as count FROM knowledge_scenes').get().count;
            if (scenesCount === 0) {
                console.log("检测到旧版 knowledge 扁平表，开始执行向上的聚类抽取与结构化迁移...");
                const scenes = db.prepare('SELECT DISTINCT scene FROM knowledge WHERE scene IS NOT NULL').all();

                const insertScene = db.prepare('INSERT INTO knowledge_scenes (id, name, sort_order) VALUES (?, ?, ?)');
                const insertCategory = db.prepare('INSERT INTO knowledge_categories (id, scene_id, name, sort_order) VALUES (?, ?, ?, ?)');
                const insertItem = db.prepare('INSERT INTO knowledge_items (id, category_id, title, content, score_weight, standard_code, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

                db.transaction(() => {
                    let sceneOrder = 0;
                    for (const s of scenes) {
                        const sceneId = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                        insertScene.run(sceneId, s.scene, sceneOrder++);

                        const categories = db.prepare('SELECT DISTINCT category FROM knowledge WHERE scene = ? AND category IS NOT NULL').all(s.scene);
                        let catOrder = 0;
                        for (const c of categories) {
                            const catId = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                            insertCategory.run(catId, sceneId, c.category, catOrder++);

                            const items = db.prepare('SELECT * FROM knowledge WHERE scene = ? AND category = ?').all(s.scene, c.category);
                            let itemOrder = 0;
                            for (const i of items) {
                                insertItem.run(i.id, catId, i.title, i.content, i.score_weight, i.standard_code, i.tags || '[]', itemOrder++);
                            }
                        }
                    }
                    db.exec('ALTER TABLE knowledge RENAME TO _legacy_knowledge');
                })();
                console.log("知识库结构化迁移完成！旧表已重命名为 _legacy_knowledge。");
            }
        }
    } catch (e) { console.error("检测并迁移旧版知识库失败", e); }

    // 检查是否需要迁移
    const assetCount = db.prepare('SELECT count(*) as count FROM assets').get().count;
    const knowledgeCount = db.prepare('SELECT count(*) as count FROM knowledge_items').get().count;
    const examCount = db.prepare('SELECT count(*) as count FROM exams').get().count;
    const recordCount = db.prepare('SELECT count(*) as count FROM records').get().count;

    if (assetCount === 0 || knowledgeCount === 0 || examCount === 0 || recordCount === 0) {
        console.log("检测到部分数据缺失，执行按需迁移脚本...");
        await migrateData({ assetCount, knowledgeCount, examCount, recordCount });
    }

    try {
        const liveExams = db.prepare('SELECT count(*) as c FROM exams').get().c;
        if (liveExams === 0) {
            const { seedStarterPack } = require('./seedStarter');
            const seeded = seedStarterPack(db);
            if (seeded.examId) console.log('[SafeSpot-DB] 已预置开箱示范卷', seeded.examId);
        }
    } catch (e) {
        console.error('[SafeSpot-DB] 开箱卷预置失败', e.message);
    }
}

async function migrateData(counts = {}) {
    // 迁移逻辑：读目录，解析 JSON，存入数据库

    // 1. 迁移 Assets & Annotations
    try {
        if (fsSync.existsSync(DIR_RAW)) {
            const files = await fs.readdir(DIR_RAW);
            for (const file of files) {
                if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;

                const stats = await fs.stat(path.join(DIR_RAW, file));
                const assetId = file; // 暂时直接用文件名作为 ID
                const baseName = path.basename(file, path.extname(file));
                const metaPath = path.join(DIR_META, `${baseName}.json`);

                let isAnnotated = 0;
                let annotations = [];

                if (fsSync.existsSync(metaPath)) {
                    try {
                        const content = await fs.readFile(metaPath, 'utf-8');
                        const data = JSON.parse(content);
                        isAnnotated = 1;
                        annotations = data.items || [];
                    } catch (e) { }
                }

                db.prepare('INSERT OR REPLACE INTO assets (id, filename, path, is_annotated, upload_time) VALUES (?, ?, ?, ?, ?)')
                    .run(assetId, file, `/assets/raw/${file}`, isAnnotated, stats.mtimeMs);

                for (const anno of annotations) {
                    db.prepare('INSERT OR REPLACE INTO annotations (id, asset_id, shape, x, y, w, h, clause_id, score_weight, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                        .run(anno.id, assetId, anno.shape, anno.rect.x, anno.rect.y, anno.rect.w, anno.rect.h, anno.clauseId, anno.scoreWeight, anno.description || '');
                }
            }
        }
    } catch (e) { console.error("Assets 迁移失败", e); }

    // 2. 迁移 Knowledge (clauses.json)
    try {
        let tree = [];
        if (fsSync.existsSync(KNOWLEDGE_PATH)) {
            const content = await fs.readFile(KNOWLEDGE_PATH, 'utf-8');
            const data = JSON.parse(content);
            tree = data.knowledgeTree || [];
        } else {
            // 只有当知识库完全为空时才使用默认知识库
            if (counts.knowledgeCount === 0) {
                console.log("未发现知识库 JSON 文件且数据库为空，使用系统预置默认数据...");
                tree = getDefaultKnowledge();
            } else {
                console.log("知识库已存在数据，跳过默认知识库迁移。");
            }
        }

        if (tree.length > 0) {
            const insertScene = db.prepare('INSERT OR IGNORE INTO knowledge_scenes (id, name, sort_order) VALUES (?, ?, ?)');
            const insertCategory = db.prepare('INSERT OR IGNORE INTO knowledge_categories (id, scene_id, name, sort_order) VALUES (?, ?, ?, ?)');
            const insertItem = db.prepare('INSERT OR IGNORE INTO knowledge_items (id, category_id, title, content, score_weight, standard_code, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

            db.transaction(() => {
                let sceneOrder = 0;
                for (const scItem of tree) {
                    const sceneId = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                    insertScene.run(sceneId, scItem.scene, sceneOrder++);
                    let catOrder = 0;
                    for (const typeItem of scItem.types) {
                        const catId = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                        insertCategory.run(catId, sceneId, typeItem.typeName, catOrder++);
                        let itemOrder = 0;
                        for (const item of typeItem.items) {
                            insertItem.run(item.id, catId, item.desc, item.clause, item.weight || 10, '', '[]', itemOrder++);
                        }
                    }
                }
            })();
        }
    } catch (e) { console.error("Knowledge 迁移失败", e); }

    // 3. 迁移 Exams
    try {
        if (counts.examCount === 0 && fsSync.existsSync(DIR_EXAMS)) {
            const files = await fs.readdir(DIR_EXAMS);
            for (const f of files) {
                if (!f.endsWith('.json')) continue;
                const content = await fs.readFile(path.join(DIR_EXAMS, f), 'utf-8');
                const data = JSON.parse(content);
                const examId = data.examName;

                db.prepare('INSERT OR REPLACE INTO exams (id, exam_name, description, created_at) VALUES (?, ?, ?, ?)')
                    .run(examId, data.examName, data.description || '', data.createdAt || Date.now());

                if (data.slides) {
                    data.slides.forEach((assetId, idx) => {
                        db.prepare('INSERT OR IGNORE INTO exam_items (exam_id, asset_id, order_index) VALUES (?, ?, ?)')
                            .run(examId, assetId, idx);
                    });
                }
            }
        }
    } catch (e) { console.error("Exams 迁移失败", e); }

    // 4. 迁移 Records
    try {
        if (counts.recordCount === 0 && fsSync.existsSync(DIR_RECORDS)) {
            const files = await fs.readdir(DIR_RECORDS);
            for (const f of files) {
                if (!f.endsWith('.json')) continue;
                const content = await fs.readFile(path.join(DIR_RECORDS, f), 'utf-8');
                const data = JSON.parse(content);
                db.prepare('INSERT OR IGNORE INTO records (exam_id, user_name, score, completed_at) VALUES (?, ?, ?, ?)')
                    .run(data.examId, data.userName, data.score, data.completedAt);
            }
        }
    } catch (e) { console.error("Records 迁移失败", e); }

    console.log("结构化数据迁移分析完成。");
}

function getDB() {
    return db;
}

function getDefaultKnowledge() {
    return [
        {
            scene: "建设施工现场",
            types: [
                {
                    typeName: "高处坠落隐患",
                    items: [
                        { id: "JB-01", desc: "高空作业人员未正确佩戴安全防护装备（安全带/安全帽）", clause: "《建设工程安全生产管理条例》第三十二条: 施工单位应当向作业人员提供安全防护用具，并书面告知危险...", weight: 15 },
                        { id: "JB-02", desc: "临边外开洞口未设置围挡防护栏或醒目盖板", clause: "《建筑施工高处作业安全技术规范》JGJ80: 坠落高度基准面2m及以上进行临边作业时，必须按规定设置防护设施...", weight: 20 },
                        { id: "JB-03", desc: "脚手架踏板破损、缺失或未满铺", clause: "《建筑施工扣件式钢管脚手架安全技术规范》JGJ130: 作业层脚手板应铺满、铺稳、铺实...", weight: 15 },
                        { id: "JB-04", desc: "深基坑周边未设置安全防护栏杆", clause: "《建筑深基坑工程施工安全技术规范》JGJ311: 基坑周边必须安装防护栏杆...", weight: 25 }
                    ]
                },
                {
                    typeName: "触电灾害隐患",
                    items: [
                        { id: "JB-05", desc: "主干配电箱未上锁或无防雨防砸棚盖措施", clause: "《施工现场临时用电安全技术规范》JGJ46-2005: 配电箱、开关箱应装设在干燥、通风及常温场所...", weight: 10 },
                        { id: "JB-06", desc: "多台设备共用一个开关或插座（一闸多机）", clause: "《施工现场临时用电安全技术规范》JGJ46: 每台用电设备必须有各自专用的开关箱，严禁用同一个开关箱直接控制2台及2台以上用电设备（含插座）。", weight: 20 },
                        { id: "JB-07", desc: "电缆线浸泡在水中或直接拖地未绝缘悬挂", clause: "《施工现场临时用电安全技术规范》JGJ46: 电缆线路必须采用埋地或架空敷设，严禁沿地面明设...", weight: 20 }
                    ]
                },
                {
                    typeName: "物体打击隐患",
                    items: [
                        { id: "JB-08", desc: "交叉作业区域未设置安全防护棚", clause: "《建筑施工安全检查标准》JGJ59-2011: 处于起重机臂架回转范围内的通道，应搭设安全防护棚...", weight: 15 },
                        { id: "JB-09", desc: "未规范堆放建筑材料，存在倾覆风险", clause: "《建筑施工安全检查标准》JGJ59-2011: 物料堆放应整齐平稳，高度不宜超过2m...", weight: 10 }
                    ]
                }
            ]
        },
        {
            scene: "化工生产车间",
            types: [
                {
                    typeName: "火灾爆炸隐患",
                    items: [
                        { id: "HG-01", desc: "易燃易爆区域内违章动火或吸烟", clause: "《化学品生产单位特殊作业安全规范》GB30871: 动火作业应办理动火安全作业证，并在规定时间地点动火...", weight: 30 },
                        { id: "HG-02", desc: "防爆区域内使用非防爆电气设备（如普通手机、手电）", clause: "《爆炸危险环境电力装置设计规范》GB50058: 爆炸性环境内电力装置的选择应符合防爆要求...", weight: 30 },
                        { id: "HG-03", desc: "静电接地线脱落或未按规范连接", clause: "《化工企业安全卫生设计规定》HG20571: 易燃易爆物料系统的设备和管道应有防静电接地...", weight: 25 }
                    ]
                },
                {
                    typeName: "中毒窒息隐患",
                    items: [
                        { id: "HG-04", desc: "有限空间作业未进行强制通风或有毒气体检测", clause: "《化学品生产单位特殊作业安全规范》GB30871: 受限空间作业前，须进行氧含量及有毒有害气体分析...", weight: 35 },
                        { id: "HG-05", desc: "剧毒物料泄漏，作业人员未佩戴符合标准的防毒面具", clause: "《个体防护装备选用规范》GB/T 11651: 在有毒有害环境中作业，必须佩戴适用的呼吸防护用品...", weight: 30 }
                    ]
                },
                {
                    typeName: "特种设备隐患",
                    items: [
                        { id: "HG-06", desc: "压力容器安全阀或压力表逾期未校验", clause: "《固定式压力容器安全技术监察规程》TSG 21: 安全阀、爆破片等安全附件应当定期校验...", weight: 20 },
                        { id: "HG-07", desc: "管道无流向标识及介质名称标记", clause: "《工业管路的基本识别色、识别符号和安全标牌》GB7231: 工业管道应当标识流体属性及方向...", weight: 5 }
                    ]
                }
            ]
        },
        {
            scene: "仓储与物流区域",
            types: [
                {
                    typeName: "消防安全隐患",
                    items: [
                        { id: "CC-01", desc: "货物堆垛堵塞消防通道或安全出口", clause: "《中华人民共和国消防法》第二十八条: 任何单位、个人不得占用、堵塞、封闭疏散通道、安全出口、消防车通道...", weight: 25 },
                        { id: "CC-02", desc: "消防设施（灭火器/消火栓）被货物遮挡或未点检失效", clause: "《中华人民共和国消防法》第二十八条: 任何单位、个人不得损坏、挪用或者擅自拆除、停用消防设施...", weight: 15 },
                        { id: "CC-03", desc: "库区内违规给电动叉车或电瓶充电", clause: "《仓储场所消防安全管理通则》GA1131: 室内明火及违章充电等易引燃周遭仓储物...", weight: 20 }
                    ]
                },
                {
                    typeName: "机械伤害与装卸隐患",
                    items: [
                        { id: "CC-04", desc: "叉车超速行驶或未鸣笛警告", clause: "《特种设备安全监察条例》: 厂内机动车辆驾驶应遵守厂区交通规则，转弯或人员密集区须鸣笛减速...", weight: 15 },
                        { id: "CC-05", desc: "货架超高堆叠且无防倾倒加固措施", clause: "《冷库安全规程》或相关库区管理标准: 堆垛高度需满足防倾覆力学要求，避免重物砸伤...", weight: 20 },
                        { id: "CC-06", desc: "人员在吊装物下方违规停留或穿越", clause: "《起重机械安全规程》GB6067: 起重机工作时，严禁人员在重物下停留或穿行...", weight: 25 }
                    ]
                }
            ]
        },
        {
            scene: "办公室及公共楼宇",
            types: [
                {
                    typeName: "日常消防隐患",
                    items: [
                        { id: "BG-01", desc: "常闭式防火门处于常开状态，或完全锁死阻碍逃生", clause: "《中华人民共和国消防法》第二十八条: 建筑内的防火门应保持相应的常开或常闭状态以达到防火防烟效果...", weight: 20 },
                        { id: "BG-02", desc: "应急照明和疏散指示标志损坏未亮", clause: "《建筑设计防火规范》GB50016: 疏散通道应设置明显的疏散指示标志和应急照明...", weight: 15 },
                        { id: "BG-03", desc: "办公区违规使用大功率电器（热得快，电暖风）", clause: "《机关、团体、企业、事业单位消防安全管理规定》: 严禁违章使用大功率电器元件以防电路过载起火...", weight: 15 }
                    ]
                },
                {
                    typeName: "日常用电隐患",
                    items: [
                        { id: "BG-04", desc: "拖线板（插座）存在私拉乱接或串联超载", clause: "《用电安全导则》GB/T 13869: 避免电插板嵌套串联使用以防超出额定承载电流...", weight: 10 },
                        { id: "BG-05", desc: "电器设备外壳破损导致内部绝缘线外露", clause: "《用电安全导则》GB/T 13869: 用电设备的绝缘防护应当完好无损...", weight: 15 }
                    ]
                }
            ]
        },
        {
            scene: "实验室研发中心",
            types: [
                {
                    typeName: "危险化学品隐患",
                    items: [
                        { id: "SY-01", desc: "危化品（如易制爆、易制毒试剂）未实行双人双锁管理", clause: "《危险化学品安全管理条例》第二十四条: 剧毒化学品以及储存数量构成重大危险源的其他危险化学品，应当在专用仓库内单独存放，并实行双人收发、双人保管制度...", weight: 30 },
                        { id: "SY-02", desc: "废液收集桶未分类张贴有效标签导致混跑可能爆炸", clause: "《废弃危险化学品污染环境防治办法》: 收集废弃物应分类盛装，并附带明确物质及危害说明标签...", weight: 25 },
                        { id: "SY-03", desc: "酸碱试剂随意同柜混放未隔离", clause: "《常用化学危险品贮存通则》GB 15603: 互为禁忌物的危险化学品不得同库或同柜存放...", weight: 20 }
                    ]
                },
                {
                    typeName: "特种防护隐患",
                    items: [
                        { id: "SY-04", desc: "实验人员未佩戴符合要求的护目镜或白大褂", clause: "《实验室安全管理规定》: 开展有飞溅或腐蚀风险性质实验时必须佩戴眼部防护...", weight: 10 },
                        { id: "SY-05", desc: "洗眼器/紧急喷淋装置周边被杂物阻挡或无水压", clause: "《化工企业安全卫生设计规范》HG20571: 喷淋洗眼设施的周边15米范围内须保持畅通且水压达标...", weight: 20 }
                    ]
                }
            ]
        }
    ];
}

module.exports = { initDB, getDB };
