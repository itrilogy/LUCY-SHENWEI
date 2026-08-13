import React from 'react';
import { SafeSpotMark } from './SafeSpotMark';
import LabProducer from './LabProducer';
import ModalShell from './ModalShell';

const DECLARATIONS = [
  {
    id: '01',
    title: '产品声明',
    body: 'SafeSpot 是面向厂区培训的 Web 应用：用现场照片做「找隐患」考核。安环员标注并组卷，学员在浏览器中点击作答。工程目录名 SafeEYE，对外品牌为 SafeSpot。本系统不是桌面安装包，也不依赖公有云账号。',
  },
  {
    id: '02',
    title: '数据边界',
    body: '默认本地优先。主库为部署机上的 SQLite，现场图保存在本机资产目录。成绩、名册与图片默认不出厂、不上公有云。同一套 Web 可跑在讲师笔记本的 localhost，或机房内网主机。',
  },
  {
    id: '03',
    title: '成绩与责任',
    body: '正式考核以服务端根据点击坐标与卷面快照回放计分为准，浏览器展示的分数仅作即时反馈。访客可考，但不能绑定他人正式工号。删卷保留历史成绩台账。本页不构成法定安全资质证明；合格证仅记录本系统内一次考核结果。',
  },
  {
    id: '04',
    title: '使用约定',
    body: '供本组织内训、演练与演示使用。知识库条文为引用摘要，以现行法规与本厂制度为准。默认演示口令仅用于开发环境；生产部署须改密并限制监听地址。',
  },
];

export default function AppDeclaration({ open, onClose, version }) {
  const ver = version || '—';
  const year = new Date().getFullYear();

  return (
    <ModalShell open={open} onClose={onClose} maxWidth="max-w-3xl" labelledBy="app-declaration-title">
      <div className="px-6 sm:px-10 pt-8 pb-4 text-center">
        <div className="flex justify-center mb-2">
          <SafeSpotMark size={56} />
        </div>
        <h2 id="app-declaration-title" className="text-2xl font-black text-gray-900 tracking-tight">
          SafeSpot
        </h2>
        <p className="text-sm font-semibold text-indigo-600 mt-1">现场隐患识别 · 本地优先培训系统</p>
      </div>

      <dl className="mx-6 sm:mx-10 grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-gray-100 bg-gray-100 text-left text-[12px]">
        <Meta label="产品" value="SafeSpot" />
        <Meta label="工程" value="SafeEYE" />
        <Meta label="版本" value={ver} />
        <Meta label="形态" value="Web" />
      </dl>

      <div className="px-6 sm:px-10 pt-4 pb-2">
        <LabProducer />
      </div>

      <div className="px-6 sm:px-10 py-4 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-left">
        {DECLARATIONS.map((item) => (
          <section key={item.id} className="flex gap-3">
            <span className="font-mono text-[11px] font-bold text-indigo-500 pt-0.5 w-6 shrink-0">
              {item.id}
            </span>
            <div>
              <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
              <p className="mt-0.5 text-[13px] leading-relaxed text-gray-600">{item.body}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="px-6 sm:px-10 pb-7 text-center">
        <button
          type="button"
          onClick={onClose}
          className="mt-1 px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500"
        >
          知道了
        </button>
        <p className="text-[11px] text-gray-400 mt-3">
          Copyright © {year} 鹿溪联合创新实验室 · SafeSpot
        </p>
      </div>
    </ModalShell>
  );
}

function Meta({ label, value }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <dt className="text-[10px] tracking-[0.16em] uppercase text-gray-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-gray-800 truncate" title={value}>{value}</dd>
    </div>
  );
}
