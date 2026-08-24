import React from 'react';

/** Product mark. Geometry lives in /safespot.svg (鹿溪四层方标). */
export function SafeSpotMark({ size = 32, className = '', title = '审微 · ShenWei' }) {
  return (
    <img
      src="/safespot.svg"
      width={size}
      height={size}
      alt={title}
      className={`rounded-xl ${className}`.trim()}
    />
  );
}

export function SafeSpotWordmark({ size = 32, stacked = false, className = '' }) {
  return (
    <span className={`inline-flex items-center min-w-0 ${stacked ? 'gap-2.5' : 'gap-2'} ${className}`}>
      <SafeSpotMark size={size} />
      <span className="leading-none min-w-0">
        <span className="block font-black tracking-tighter text-[#1A2428]" style={{ fontSize: Math.round(size * 0.62) }}>
          审微 · ShenWei
        </span>
        {stacked && (
          <span className="block mt-1 text-[10px] font-semibold tracking-[0.22em] text-[#2F7A73]">
            鹿溪联合创新实验室
          </span>
        )}
      </span>
    </span>
  );
}
