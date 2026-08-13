const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assetStem } = require('../src/cleanup');

describe('assetStem', () => {
    it('strips upload timestamp suffix so case copies match', () => {
        assert.equal(
            assetStem('01_建设施工_高处坠落与物料_JB-01-03-09_1784181895934-6tfcdh.jpg'),
            assetStem('01_建设施工_高处坠落与物料_JB-01-03-09.jpg')
        );
    });
});
