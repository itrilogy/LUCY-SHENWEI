export const MAX_MISS = 3;

export function parseExamSettings(examObj) {
    const total =
        examObj?.totalScore ??
        examObj?.total_score ??
        examObj?.settings?.totalScore ??
        examObj?.settings?.total_score ??
        100;
    const rule =
        examObj?.scoringRule ??
        examObj?.scoring_rule ??
        examObj?.settings?.scoringRule ??
        examObj?.settings?.scoring_rule ??
        'weighted';
    const timeLimit =
        examObj?.timeLimitSec ??
        examObj?.time_limit_sec ??
        examObj?.settings?.timeLimitSec ??
        examObj?.settings?.time_limit_sec ??
        0;
    return {
        total_score: Number(total) || 100,
        scoring_rule: rule || 'weighted',
        time_limit_sec: Number(timeLimit) || 0
    };
}
