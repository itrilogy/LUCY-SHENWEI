import React from 'react';
import { SafeSpotMark } from './SafeSpotMark';

export const LAB_LOGO = '/brand/luxi-lab.svg';

/** 符号标几何与 luxi-lab.svg 同源。配色随 data-theme：浅色绿+蓝，深色白+蓝。 */
export function LabMark({ size = 48, className = '' }) {
  return (
    <svg
      className={`lab-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="鹿溪联合创新实验室 LUXI LAB"
    >
      <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="butt">
        <path d="M23 24C22 15 16 9 8 8" />
        <path d="M25 24C26 15 32 9 40 8" />
        <path d="M24 22V39" />
      </g>
      <path
        d="M14 25H34"
        fill="none"
        stroke="var(--mark-accent)"
        strokeWidth="7"
        strokeLinecap="butt"
      />
    </svg>
  );
}

/** 出品方：产品方标 × 实验室符号标，等大并排。 */
export default function LabProducer({ compact = false }) {
  const tile = compact ? 48 : 64;
  return (
    <div className="text-center">
      <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted">出品</p>
      <div className="mt-2 flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1 min-w-0">
          <SafeSpotMark size={tile} />
          <span className="text-[10px] font-semibold text-fg">审微 · ShenWei</span>
        </div>
        <span className="text-muted font-medium text-lg pb-4" aria-hidden="true">×</span>
        <div className="flex flex-col items-center gap-1 min-w-0">
          <LabMark size={tile} />
          <span className="text-[10px] font-semibold text-fg">鹿溪联合创新实验室</span>
        </div>
      </div>
      <p className="mt-1.5 text-[10px] text-muted">LUXI Joint Innovation Lab</p>
    </div>
  );
}
