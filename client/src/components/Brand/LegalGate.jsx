import React, { useState, useEffect } from 'react';
import { SafeSpotMark } from './SafeSpotMark';
import LabProducer from './LabProducer';

export const LEGAL_GATE_KEY = 'luxi-shenwei-legal-gate-v1';

export function hasAcceptedLegalGate() {
  try {
    return localStorage.getItem(LEGAL_GATE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function LegalGate({ onAccept }) {
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(LEGAL_GATE_KEY, '1');
    } catch { /* ignore quota */ }
    onAccept();
  };

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-6">
      <div className="luxi-card shadow-md w-full max-w-lg p-8" role="dialog" aria-modal="true" aria-labelledby="gate-title">
        <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-primary mb-2">LegalGate</p>
        <div className="flex justify-center mb-3">
          <SafeSpotMark size={48} />
        </div>
        <h1 id="gate-title" className="text-[22px] font-semibold text-center text-fg">首次运行确认</h1>
        <p className="text-sm text-secondary mt-2 text-center leading-relaxed">
          审微默认本地优先：现场图、名册与成绩留在本机 / 内网，不上公有云。首次使用必须显式确认，不可默认同意。
        </p>
        <ul className="mt-4 space-y-2 text-[13px] text-secondary leading-relaxed">
          <li>合格证只记录本系统一次考核，不构成法定安全资质。</li>
          <li>知识库条文为引用摘要，以现行法规与本厂制度为准。</li>
          <li>演示口令仅用于开发环境；生产须改密并限制监听地址。</li>
        </ul>
        <label className="mt-5 flex gap-2 items-start text-[13px] bg-sunken p-3 rounded-[4px]">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5"
          />
          <span>我已了解数据不出厂边界，并确认在本组织内训场景使用本系统。</span>
        </label>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn btn-primary" disabled={!agreed} onClick={accept}>
            显式确认并进入
          </button>
        </div>
        <div className="mt-6">
          <LabProducer compact />
        </div>
      </div>
    </div>
  );
}
