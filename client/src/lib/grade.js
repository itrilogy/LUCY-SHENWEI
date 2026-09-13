/**
 * 等第规则：≥90 优 / ≥75 良 / ≥60 中 / 否则差
 */
export function getGrade(score, total = 100) {
    const pct = total > 0 ? (Number(score) / Number(total)) * 100 : Number(score);
    if (pct >= 90) return { key: 'excellent', label: '优', color: 'text-[var(--text-ok)]', bar: 'bg-[var(--state-up)]' };
    if (pct >= 75) return { key: 'good', label: '良', color: 'text-[var(--text-info)]', bar: 'bg-[var(--info-blue)]' };
    if (pct >= 60) return { key: 'pass', label: '中', color: 'text-[var(--text-warn)]', bar: 'bg-[var(--luxi-gold)]' };
    return { key: 'fail', label: '差', color: 'text-[var(--text-danger)]', bar: 'bg-[var(--state-down)]' };
}
