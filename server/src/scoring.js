/**
 * 将整卷隐患点权重倒挤为卷面分（总和严格等于 paperTotal）
 */
function buildPointScoreMap(allPoints, settings = {}) {
    const paperTotal = Number(settings.total_score) || 100;
    const rule = settings.scoring_rule || 'weighted';
    const scoreMap = {};
    if (!allPoints?.length) return scoreMap;

    if (rule === 'average') {
        const base = Math.floor(paperTotal / allPoints.length);
        let remainder = paperTotal % allPoints.length;
        allPoints.forEach((p) => {
            scoreMap[p.id] = base + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
        });
        return scoreMap;
    }

    // weighted：最大余额法（Hamilton-Hare Method），消除末位余数堆积失真
    const totalWeight = allPoints.reduce((sum, p) => sum + (Number(p.scoreWeight) || 0), 0);
    if (totalWeight <= 0) {
        allPoints.forEach((p) => { scoreMap[p.id] = 0; });
        return scoreMap;
    }

    const items = allPoints.map((p, index) => {
        const exact = ((Number(p.scoreWeight) || 0) / totalWeight) * paperTotal;
        const integerPart = Math.floor(exact);
        return {
            id: p.id,
            index,
            integerPart,
            remainder: exact - integerPart
        };
    });

    let currentSum = items.reduce((sum, it) => sum + it.integerPart, 0);
    let diff = paperTotal - currentSum;

    // 稳定排序：余数从大到小，余数相同时优先按原始索引保序
    const sorted = [...items].sort((a, b) => {
        const diffRem = b.remainder - a.remainder;
        if (Math.abs(diffRem) > 1e-9) return diffRem;
        return a.index - b.index;
    });

    for (let i = 0; i < sorted.length && diff > 0; i++, diff--) {
        sorted[i].integerPart += 1;
    }

    items.forEach((it) => {
        scoreMap[it.id] = it.integerPart;
    });
    return scoreMap;
}

function clampScore(score, paperTotal = 100) {
    const s = Math.round(Number(score) || 0);
    const max = Number(paperTotal) || 100;
    return Math.max(0, Math.min(max, s));
}

function getGrade(score, total = 100) {
    const pct = total > 0 ? (Number(score) / Number(total)) * 100 : Number(score);
    if (pct >= 90) return { key: 'excellent', label: '优' };
    if (pct >= 75) return { key: 'good', label: '良' };
    if (pct >= 60) return { key: 'pass', label: '中' };
    return { key: 'fail', label: '差' };
}

function parseExamSettings(settingsRaw) {
    let totalScore = 100;
    let scoringRule = 'weighted';
    let timeLimitSec = 0;
    try {
        const s = typeof settingsRaw === 'string' ? JSON.parse(settingsRaw || '{}') : (settingsRaw || {});
        if (s.totalScore != null) totalScore = Number(s.totalScore) || 100;
        if (s.total_score != null) totalScore = Number(s.total_score) || 100;
        if (s.scoringRule) scoringRule = s.scoringRule;
        if (s.scoring_rule) scoringRule = s.scoring_rule;
        if (s.timeLimitSec != null) timeLimitSec = Number(s.timeLimitSec) || 0;
        if (s.time_limit_sec != null) timeLimitSec = Number(s.time_limit_sec) || 0;
    } catch (_) { /* defaults */ }
    return {
        totalScore, scoringRule, timeLimitSec,
        total_score: totalScore, scoring_rule: scoringRule, time_limit_sec: timeLimitSec
    };
}

module.exports = { buildPointScoreMap, clampScore, getGrade, parseExamSettings };
