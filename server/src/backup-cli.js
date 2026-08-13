#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { createBackup, restoreBackup } = require('./backup');

const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'safeeye.db');

const cmd = process.argv[2] || 'backup';
const arg = process.argv[3];

if (cmd === 'backup') {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    let db = { pragma() {} };
    try {
        db = new Database(DB_PATH);
    } catch (_) { /* 无法打开库时仍打包文件 */ }
    const r = createBackup(db);
    try { db.close && db.close(); } catch (_) { /* ignore */ }
    if (arg) {
        fs.copyFileSync(r.path, arg);
        console.log(`[backup] ${arg} (${r.bytes} bytes)`);
    } else {
        console.log(`[backup] ${r.path} (${r.bytes} bytes)`);
    }
    process.exit(0);
}

if (cmd === 'restore') {
    if (!arg) {
        console.error('用法: node src/backup-cli.js restore <file.zip>');
        process.exit(1);
    }
    const buf = fs.readFileSync(arg);
    const r = restoreBackup(buf);
    console.log('[restore] 已恢复', r.files.length, '个条目。请重启服务。');
    process.exit(0);
}

console.error('用法: node src/backup-cli.js backup [out.zip] | restore <file.zip>');
process.exit(1);
