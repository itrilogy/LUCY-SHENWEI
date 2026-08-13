const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function u16(n) {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n, 0);
    return b;
}
function u32(n) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n >>> 0, 0);
    return b;
}

function packZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const e of entries) {
        const name = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8');
        const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data || '');
        const crc = crc32(data);
        const header = Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x03, 0x04]),
            u16(20), u16(0), u16(0), u16(0), u16(0),
            u32(crc), u32(data.length), u32(data.length),
            u16(name.length), u16(0),
            name, data
        ]);
        const central = Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x01, 0x02]),
            u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
            u32(crc), u32(data.length), u32(data.length),
            u16(name.length), u16(0), u16(0), u16(0), u16(0),
            u32(0), u32(offset), name
        ]);
        locals.push(header);
        centrals.push(central);
        offset += header.length;
    }
    const centralBuf = Buffer.concat(centrals);
    const eocd = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x05, 0x06]),
        u16(0), u16(0), u16(entries.length), u16(entries.length),
        u32(centralBuf.length), u32(offset), u16(0)
    ]);
    return Buffer.concat([...locals, centralBuf, eocd]);
}

function unpackZip(buf) {
    const out = [];
    let i = 0;
    while (i + 4 <= buf.length) {
        const sig = buf.readUInt32LE(i);
        if (sig === 0x02014b50 || sig === 0x06054b50) break;
        if (sig !== 0x04034b50) break;
        const method = buf.readUInt16LE(i + 8);
        const comp = buf.readUInt32LE(i + 18);
        const nameLen = buf.readUInt16LE(i + 26);
        const extraLen = buf.readUInt16LE(i + 28);
        const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
        const start = i + 30 + nameLen + extraLen;
        if (method !== 0) throw new Error(`不支持压缩方式 ${method}（${name}）`);
        out.push({ name, data: buf.slice(start, start + comp) });
        i = start + comp;
    }
    return out;
}

function walkFiles(dir, prefix = '') {
    const acc = [];
    if (!fs.existsSync(dir)) return acc;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const rel = prefix ? `${prefix}/${name}` : name;
        const st = fs.statSync(full);
        if (st.isDirectory()) acc.push(...walkFiles(full, rel));
        else acc.push({ name: rel, full });
    }
    return acc;
}

module.exports = { packZip, unpackZip, walkFiles, crc32 };
