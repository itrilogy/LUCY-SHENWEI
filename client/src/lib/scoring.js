/**
 * 将整卷隐患点权重倒挤为卷面分（总和严格等于 paperTotal）
 * @param {Array<{id:string, scoreWeight?:number}>} allPoints
 * @param {{ total_score?: number, scoring_rule?: string }} settings
 * @returns {Record<string, number>}
 */
export function buildPointScoreMap(allPoints, settings = {}) {
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

    // weighted
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

/** 得分上限：不超过卷面总分 */
export function clampScore(score, paperTotal = 100) {
    const s = Math.round(Number(score) || 0);
    const max = Number(paperTotal) || 100;
    return Math.max(0, Math.min(max, s));
}
