const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv } = require('../src/personnelImport');

describe('parseCsv', () => {
    it('reads excel-exported header aliases', () => {
        const rows = parseCsv('姓名,用户名,密码,工号,部门\n李四,lisi,abc,E2,安环部');
        assert.equal(rows.length, 1);
        assert.equal(rows[0]['姓名'], '李四');
        assert.equal(rows[0]['用户名'], 'lisi');
    });
});
