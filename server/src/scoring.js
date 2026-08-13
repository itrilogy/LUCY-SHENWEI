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

    const totalWeight = allPoints.reduce((sum, p) => sum + (Number(p.scoreWeight) || 0), 0);
    if (totalWeight <= 0) {
        allPoints.forEach((p) => { scoreMap[p.id] = 0; });
        return scoreMap;
    }

    let runningSum = 0;
    allPoints.forEach((p, idx) => {
        if (idx === allPoints.length - 1) {
            scoreMap[p.id] = paperTotal - runningSum;
        } else {
            const score = Math.floor(((Number(p.scoreWeight) || 0) / totalWeight) * paperTotal);
            scoreMap[p.id] = score;
            runningSum += score;
        }
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
