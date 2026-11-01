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

/** 得分上限：不超过卷面总分 */
export function clampScore(score, paperTotal = 100) {
    const s = Math.round(Number(score) || 0);
    const max = Number(paperTotal) || 100;
    return Math.max(0, Math.min(max, s));
}
