/**
 * 等第规则：≥90 优 / ≥75 良 / ≥60 中 / 否则差
 */
export function getGrade(score, total = 100) {
    const pct = total > 0 ? (Number(score) / Number(total)) * 100 : Number(score);
    if (pct >= 90) return { key: 'excellent', label: '优', color: 'text-emerald-400', bar: 'bg-emerald-500' };
    if (pct >= 75) return { key: 'good', label: '良', color: 'text-sky-400', bar: 'bg-sky-500' };
    if (pct >= 60) return { key: 'pass', label: '中', color: 'text-amber-400', bar: 'bg-amber-500' };
    return { key: 'fail', label: '差', color: 'text-red-400', bar: 'bg-red-500' };
}
