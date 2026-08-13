import React from 'react';

/** Laboratory optical-reticle mark. Geometry matches /safespot.svg. */
export function SafeSpotMark({ size = 32, className = '', title = 'SafeSpot' }) {
  const gid = React.useId().replace(/:/g, '');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <radialGradient id={`${gid}-spot`} cx="38%" cy="34%" r="68%">
          <stop offset="0%" stopColor="#F3C45A" />
          <stop offset="52%" stopColor="#E39B2E" />
          <stop offset="100%" stopColor="#B45309" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30.5" fill="#2A3338" />
      <circle cx="32" cy="32" r="28.4" fill="none" stroke="#1A2226" strokeWidth="0.55" />
      <circle cx="32" cy="32" r="26.6" fill="none" stroke="#3D484E" strokeWidth="0.4" />
      <circle cx="32" cy="32" r="24.8" fill="none" stroke="#1A2226" strokeWidth="0.35" />
      <circle cx="32" cy="32" r="20.6" fill="#F3EFE6" />
      <circle cx="32" cy="32" r="21.7" fill="none" stroke="#2F7A73" strokeWidth="1.55" />
      <circle cx="32" cy="32" r="20.15" fill="none" stroke="#C4845A" strokeWidth="0.85" />
      <g stroke="#2F7A73" strokeWidth="1.25" strokeLinecap="butt">
        <line x1="32" y1="13.6" x2="32" y2="22.2" />
        <line x1="32" y1="41.8" x2="32" y2="50.4" />
        <line x1="13.6" y1="32" x2="22.2" y2="32" />
        <line x1="41.8" y1="32" x2="50.4" y2="32" />
      </g>
      <circle cx="40.4" cy="36.8" r="4.55" fill={`url(#${gid}-spot)`} />
    </svg>
  );
}

export function SafeSpotWordmark({ size = 32, stacked = false, className = '' }) {
  return (
    <span className={`inline-flex items-center min-w-0 ${stacked ? 'gap-2.5' : 'gap-2'} ${className}`}>
      <SafeSpotMark size={size} />
      <span className="leading-none min-w-0">
        <span className="block font-black tracking-tighter text-[#1A2428]" style={{ fontSize: Math.round(size * 0.72) }}>
          SafeSpot
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
