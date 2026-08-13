const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { packZip, unpackZip } = require('../src/zipStore');

describe('zipStore', () => {
    it('roundtrips store-only zip entries', () => {
        const buf = packZip([
            { name: 'manifest.json', data: '{"ok":true}' },
            { name: 'assets/raw/a.txt', data: Buffer.from('hello') }
        ]);
        const files = unpackZip(buf);
        assert.equal(files.length, 2);
        assert.equal(files[0].name, 'manifest.json');
        assert.equal(files[0].data.toString(), '{"ok":true}');
        assert.equal(files[1].data.toString(), 'hello');
    });
});
