const fs = require('fs');
const path = require('path');
const { packZip, unpackZip } = require('./zipStore');

const DATA_DIR = path.join(__dirname, '../data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'safeeye.db');
const RAW_DIR = path.join(DATA_DIR, 'assets/raw');

function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function createBackup(db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) { /* ignore */ }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const entries = [];
    if (fs.existsSync(DB_PATH)) {
        entries.push({ name: 'safeeye.db', data: fs.readFileSync(DB_PATH) });
    }
    if (fs.existsSync(RAW_DIR)) {
        for (const name of fs.readdirSync(RAW_DIR)) {
            const full = path.join(RAW_DIR, name);
            if (fs.statSync(full).isFile()) {
                entries.push({ name: `assets/raw/${name}`, data: fs.readFileSync(full) });
            }
        }
    }
    entries.push({
        name: 'manifest.json',
        data: JSON.stringify({
            kind: 'safespot-backup',
            version: 1,
            createdAt: Date.now(),
            files: entries.map((e) => e.name)
        }, null, 2)
    });
    const buf = packZip(entries);
    const fileName = `safespot-${stamp()}.zip`;
    const dest = path.join(BACKUP_DIR, fileName);
    fs.writeFileSync(dest, buf);
    return { fileName, path: dest, bytes: buf.length, count: entries.length };
}

function restoreBackup(zipBuf, { wipeRaw = true } = {}) {
    const files = unpackZip(zipBuf);
    const man = files.find((f) => f.name === 'manifest.json');
    if (man) {
        const m = JSON.parse(man.data.toString('utf8'));
        if (m.kind && m.kind !== 'safespot-backup' && m.kind !== 'safespot-bank') {
            throw new Error('不是 SafeSpot 备份包');
        }
    }
    fs.mkdirSync(RAW_DIR, { recursive: true });
    if (wipeRaw && fs.existsSync(RAW_DIR)) {
        for (const name of fs.readdirSync(RAW_DIR)) {
            const full = path.join(RAW_DIR, name);
            if (fs.statSync(full).isFile()) fs.unlinkSync(full);
        }
    }
    for (const f of files) {
        if (f.name === 'safeeye.db') {
            fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
            fs.writeFileSync(DB_PATH, f.data);
        } else if (f.name.startsWith('assets/raw/')) {
            const base = path.basename(f.name);
            if (!base || base === '.' || base === '..') continue;
            fs.writeFileSync(path.join(RAW_DIR, base), f.data);
        }
    }
    return { files: files.map((f) => f.name) };
}

function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
        .filter((n) => n.endsWith('.zip'))
        .map((n) => {
            const st = fs.statSync(path.join(BACKUP_DIR, n));
            return { fileName: n, bytes: st.size, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
}

function readBackupFile(fileName) {
    const safe = path.basename(fileName);
    const full = path.join(BACKUP_DIR, safe);
    if (!full.startsWith(path.resolve(BACKUP_DIR) + path.sep) && full !== path.resolve(BACKUP_DIR, safe)) {
        throw new Error('非法文件名');
    }
    if (!fs.existsSync(full)) throw new Error('备份不存在');
    return { fileName: safe, path: full, data: fs.readFileSync(full) };
}

module.exports = { createBackup, restoreBackup, listBackups, readBackupFile, BACKUP_DIR };
