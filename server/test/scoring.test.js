const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildPointScoreMap, clampScore, getGrade, parseExamSettings } = require('../src/scoring');
const { hitTestAnnotation } = require('../src/hitTest');
const { summarizeSessionLog } = require('../src/analytics');

describe('buildPointScoreMap', () => {
    it('average splits remainder onto the first points', () => {
        const map = buildPointScoreMap(
            [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
            { total_score: 100, scoring_rule: 'average' }
        );
        assert.equal(map.a + map.b + map.c, 100);
        assert.equal(map.a, 34);
        assert.equal(map.b, 33);
        assert.equal(map.c, 33);
    });

    it('weighted distributes remainders smoothly via largest remainder method', () => {
        const map = buildPointScoreMap(
            [
                { id: 'a', scoreWeight: 1 },
                { id: 'b', scoreWeight: 1 },
                { id: 'c', scoreWeight: 1 }
            ],
            { total_score: 100, scoring_rule: 'weighted' }
        );
        assert.equal(map.a + map.b + map.c, 100);
        assert.equal(map.a, 34);
        assert.equal(map.b, 33);
        assert.equal(map.c, 33);
    });

    it('weighted handles multi-item remainder distribution without end-point clustering', () => {
        // 15 个相同权重的隐患点，总分 100 分
        const points = Array.from({ length: 15 }, (_, i) => ({ id: `p_${i + 1}`, scoreWeight: 10 }));
        const map = buildPointScoreMap(points, { total_score: 100, scoring_rule: 'weighted' });
        const values = Object.values(map);
        const sum = values.reduce((acc, v) => acc + v, 0);
        assert.equal(sum, 100);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        // 最大分差绝对不超过 1 分（6分与7分），绝不允许旧逻辑末位 16 分的失真
        assert.ok(maxVal - minVal <= 1);
        assert.equal(minVal, 6);
        assert.equal(maxVal, 7);
    });
});

describe('clampScore / grade', () => {
    it('clamps to paper total', () => {
        assert.equal(clampScore(999, 100), 100);
        assert.equal(clampScore(-3, 100), 0);
    });
    it('grades 88 as 良', () => {
        assert.equal(getGrade(88, 100).label, '良');
        assert.equal(getGrade(90, 100).label, '优');
        assert.equal(getGrade(59, 100).label, '差');
    });
});

describe('parseExamSettings', () => {
    it('reads camel and snake keys', () => {
        const a = parseExamSettings({ total_score: 80, scoring_rule: 'average', time_limit_sec: 12 });
        assert.equal(a.totalScore, 80);
        assert.equal(a.scoringRule, 'average');
        assert.equal(a.timeLimitSec, 12);
    });
});

describe('hitTestAnnotation', () => {
    const circle = { shape: 'circle', rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } };
    it('hits circle center', () => {
        assert.equal(hitTestAnnotation(0.5, 0.5, circle), true);
    });
    it('misses circle corner of bounding box', () => {
        assert.equal(hitTestAnnotation(0.4, 0.4, circle), false);
    });
    it('hits rectangle interior', () => {
        const rect = { shape: 'rect', rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } };
        assert.equal(hitTestAnnotation(0.2, 0.2, rect), true);
        assert.equal(hitTestAnnotation(0.01, 0.01, rect), false);
    });
});

describe('summarizeSessionLog', () => {
    it('counts hit / miss / unfound and keeps PRI in range', () => {
        const log = [
            { t: 1000, result: 'hit', itemId: '1', clauseId: 'A' },
            { t: 2000, result: 'miss' },
            { t: 3000, result: 'unfound', itemId: '2', clauseId: 'B' }
        ];
        const s = summarizeSessionLog(log, { hazardsTotal: 2, slideCount: 1, durationMs: 2000 });
        assert.equal(s.hazardsHit, 1);
        assert.equal(s.invalidClicks, 1);
        assert.equal(s.hazardsUnfound, 1);
        assert.ok(s.pri >= 0 && s.pri <= 100);
    });
});
