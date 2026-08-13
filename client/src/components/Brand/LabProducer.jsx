import React from 'react';
import { SafeSpotMark } from './SafeSpotMark';

const LAB_LOGO = '/brand/luxi-lab-main.svg';

/** 出品方：产品标 × 官方实验室主 LOGO。对齐志愿 / VectorStream / IQS。 */
export default function LabProducer({ compact = false }) {
  const tile = compact ? 48 : 72;
  return (
    <div className="text-center">
      <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400">出品</p>
      <div className="mt-2 flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1 min-w-0">
          <SafeSpotMark size={tile} />
          <span className="text-[10px] font-bold text-gray-700">SafeSpot</span>
        </div>
        <span className="text-gray-300 font-black text-lg pb-4" aria-hidden="true">×</span>
        <div className="flex flex-col items-center gap-1 min-w-0">
          <img
            src={LAB_LOGO}
            alt="鹿溪联合创新实验室"
            width={tile}
            height={tile}
            className="object-contain bg-transparent"
            style={{ width: tile, height: tile }}
          />
          <span className="text-[10px] font-bold text-gray-700">鹿溪联合创新实验室</span>
        </div>
      </div>
      <p className="mt-1.5 text-[10px] text-gray-400">LUXI Joint Innovation Lab</p>
    </div>
  );
}

export function LabMark({ size = 48, className = '' }) {
  return (
    <img
      src={LAB_LOGO}
      alt="鹿溪联合创新实验室"
      width={size}
      height={size}
      className={`object-contain bg-transparent ${className}`}
    />
  );
}
