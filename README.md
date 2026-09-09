<div align="center">
  <img src="client/public/safespot.svg" width="64" height="64" alt="审微 · ShenWei 产品标" />
  &nbsp;&nbsp;
  <img src="client/public/brand/luxi-lab-main.svg" width="64" height="64" alt="鹿溪联合创新实验室 LUXI LAB" />
</div>

<h1 align="center">审微 · ShenWei（安全隐患识别培训系统）</h1>

<p align="center">
  <strong>察于至微，防于未萌</strong><br/>
  <em>Discerning the minute, preempting the hazard.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Matrix-具身%C2%B7二察-0D5E42" alt="matrix" />
  <img src="https://img.shields.io/badge/Product-审微%20ShenWei-2F7A73" alt="product" />
  <img src="https://img.shields.io/badge/Lab-鹿溪联合创新实验室-0D5E42" alt="lab" />
  <img src="https://img.shields.io/badge/Version-V1.4--web-f1c40f" alt="version" />
  <img src="https://img.shields.io/badge/Stack-React%2019%20%7C%20Express%205%20%7C%20SQLite-61DAFB" alt="stack" />
</p>

<p align="center">
  <b>鹿溪联合创新实验室</b>（LUXI Joint Innovation Lab）出品 · 工程名 SafeEYE · 本地优先 Web<br/>
  仓库：<a href="https://github.com/itrilogy/LUCY-SHENWEI">itrilogy/LUCY-SHENWEI</a>
</p>

---

<p align="center">
  <a href="#1-快速开始">快速开始</a> ·
  <a href="#产品标识">产品标识</a> ·
  <a href="#3-学员端">学员端</a> ·
  <a href="#4-管理端">管理端</a> ·
  <a href="#7-文档">文档</a>
</p>

用现场照片做「找隐患」考核：安环员在浏览器里标注并组卷，员工点击作答，成绩与学情留在本厂服务器。

数据在本机 **SQLite + 本地图片**，默认不上云。  
**不是安装包，也不是独立手机 App**——一台机器跑服务，Chrome / Edge 打开同一地址即可。窄屏为响应式，没有 `/m` 站点。

点应用顶栏 Logo 可打开声明页。

---

## 🎨 产品标识

| 标识 | 预览 | 说明 | 源文件 |
| :---: | :---: | :--- | :--- |
| **产品方标** | <img src="client/public/safespot.svg" width="32" height="32" alt="审微" /> | 光学分划 / 观测场 + 琥珀色隐患点 | `client/public/safespot.svg` |
| **产品字锁** | <img src="client/public/safespot-logo.svg" width="200" alt="审微 · ShenWei 字锁" /> | 横版产品字锁 | `client/public/safespot-logo.svg` |
| **实验室主标** | <img src="client/public/brand/luxi-lab-main.svg" width="32" height="32" alt="LUXI LAB" /> | 官方 LUXI LAB（唯一权威源） | `client/public/brand/luxi-lab-main.svg` |

产品标语义：光学分划 / 观测场 + 琥珀色隐患点。实验室主标只认官方鹿标，不用几何实验稿。说明见 [`client/public/brand/README.md`](./client/public/brand/README.md)。

**色板（LUXI CI）**

| Token | 色值 | 用途 |
| :--- | :--- | :--- |
| 鹿溪绿 | `#0D5E42` | 主色 / 图标底板 |
| 源启白 | `#F5F7FA` | 浅色背景 / 反白 |
| 进化蓝 | `#00D2FF` | 溪流 / 数据高亮 |
| 琥珀色 | `#F1C40F` | 隐患点 / 显著信号 |

---

## 1. 快速开始

需要 Node.js **20 LTS**（推荐）。更高主版本可能导致 `better-sqlite3` 编不过。

```bash
npm run install:all
npm run dev
```

浏览器打开 **http://127.0.0.1:5173**

| 入口 | 地址 | 说明 |
|------|------|------|
| 学员端 | http://127.0.0.1:5173/#/play | 选卷、考试、龙虎榜 |
| 管理端 | http://127.0.0.1:5173/#/admin | 管理员 / 培训师账号 |
| 培训机 | http://127.0.0.1:5173/#/play?kiosk=1 | 隐藏管理入口 |

```bash
curl http://127.0.0.1:3000/api/health
```

空库首次启动会预置开箱示范卷（12 张场景图；热区为示意框，正式培训请按现场图重标）。

### 生产（一个端口）

```bash
# 先改掉默认密码与 SESSION_SECRET，见 .env.example
NODE_ENV=production npm start
```

浏览器打开 **http://127.0.0.1:3000**（页面和接口同一端口）。内网多人访问时设 `HOST=0.0.0.0`。

生产若仍是默认口令 / `admin123`，进程会拒绝启动。

Docker：`docker compose up -d --build`。备份：`npm run backup`。详见 [docs/DEPLOY.md](./docs/DEPLOY.md)。

### 开发凭据（勿用于现场）

| 用途 | 值 |
|------|-----|
| 管理 / 学员演示 | `admin` / `admin123` |
| 开发口令（可选） | `safeeye`（`ADMIN_PIN`） |

---

## 2. 推荐流程

```text
管理端：人员组织 → 知识与风险 → 图库标注并保存 → 组卷发布
学员端：浏览器打开考核大厅 →（可选登录）→ 找隐患 → 交卷
管理端：成绩报表 / 学情分析 / 导出 CSV
```

组卷中心只列出 **已保存标注** 的图片。正式考核分数由 **服务端** 按点击坐标与卷面快照计算，浏览器上报的数字不入库。

---

## 3. 学员端

`#/play`

- 可选登录（人员组织中的账号），或访客手填姓名；访客不能绑定他人工号
- **正式考核**进正式榜与学情；**练习**默认不进
- 点中热区得分；空白点击计误点，单题默认容错 3 次
- 限时到点后服务端拒点并自动交卷
- 计分：权重倒挤或均分；等第 优/良/中/差；另有 PRI 识别熟练度
- 结果页可打印合格证（浏览器打印 / PDF；不是法定资质）
- 宽屏右侧龙虎榜；平板点右下角奖杯打开抽屉

---

## 4. 管理端

`#/admin`

| 菜单 | 功能 |
|------|------|
| 图库标注 | 多图上传、矩形/椭圆、绑定条款、保存 |
| 组卷中心 | 选题、总分/规则/限时、草稿或发布、部门布置 |
| 知识与风险 | 场景→大类→细则；5×5 风险字典 |
| 人员组织 | 多级部门、账号启停、CSV 导入 |
| 成绩报表 | 流水、未考/未过、CSV、薄弱点（仅遗漏） |
| 学情分析 | 试卷/部门切片、PRI、规则结论 |
| 数据巡检 | 表预览、重复图与失效学情清理 |
| 操作审计 | 管理端关键写操作记录 |

删卷 **不删** 历史成绩。`admin` 全权限；`trainer` 内容与报表；学员调不了管理接口。

---

## 5. 目录

```text
LUCY-SHENWEI/
├── README.md                 本文件（对外说明）
├── COPYRIGHT.md / NOTICE.md  版权摘要与第三方组件
├── Dockerfile · docker-compose.yml
├── docs/
│   ├── README.md             文档地图
│   ├── 软著/                 登记用产品/功能/使用说明
│   └── archive/              历史文档，非真源
├── client/                   React 19 + Vite + Tailwind
│   └── public/brand/         实验室主 LOGO（官方 LUXI LAB）
└── server/                   Express + SQLite
    └── data/                 safeeye.db + assets/raw
```

---

## 6. 技术要点

| 项 | 说明 |
|----|------|
| 前端 | React 19 · Vite · Tailwind 3 |
| 后端 | Express 5 · better-sqlite3 · multer |
| 会话 | httpOnly；表 `auth_sessions` |
| 坐标 | 热区 0～1 相对比例 |
| 计分 | `examEngine` + `hitTest` + 卷面 `item_meta` 快照 |
| 学情 | `session_log` v2 → `attempt_stats` / `knowledge_error_facts` |

| 变量 | 默认 | 含义 |
|------|------|------|
| `ADMIN_PIN` | `safeeye` | 开发口令（生产禁止默认值） |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址；内网设 `0.0.0.0` |
| `SESSION_SECRET` | `dev-only-secret` | 会话签名（生产必改） |

---

## 7. 文档

| 文档 | 内容 |
|------|------|
| [docs/README.md](./docs/README.md) | **文档地图** |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | 产品定位（Web，非安装包） |
| [docs/USER_GUIDE.md](./docs/USER_GUIDE.md) | 日常操作手册 |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | 开发 / 生产 / Docker / 备份 |
| [docs/软著/00_文档索引.md](./docs/软著/00_文档索引.md) | 软著：产品说明、功能说明、使用说明 |
| [docs/PLAN.md](./docs/PLAN.md) | 规划与进度真源 |
| [docs/PROCESS.md](./docs/PROCESS.md) | 改造过程流水 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 架构 |
| [docs/ANALYTICS.md](./docs/ANALYTICS.md) | 学情与 PRI |
| [COPYRIGHT.md](./COPYRIGHT.md) | 版权声明摘要 |
| [NOTICE.md](./NOTICE.md) | 第三方开源组件 |

---

## 8. 常见问题

| 现象 | 处理 |
|------|------|
| 组卷中心无案例 | 先标注并点「保存标注」 |
| 中文文件名乱码 | 重启后端后再传 |
| 删卷后成绩还在吗 | 会保留 |
| 学情是空的 | 要有正式考核交卷；练习默认不进主统计 |
| 薄弱点出现 unknown | 现行只统计遗漏；误点进 PRI |
| 有独立手机版吗 | 没有；用手机浏览器打开同一地址 |
| better-sqlite3 编译失败 | 换 Node 20，在 `server/` 重装 |
| 3000 端口占用 | `PORT=3010` 启动后端 |

---

<div align="center">
  <img src="client/public/brand/luxi-lab-main.svg" width="48" height="48" alt="LUXI LAB" />
  <p><strong>审微 · ShenWei</strong> · 察于至微，防于未萌</p>
  <p>© 鹿溪联合创新实验室 · LUXI Joint Innovation Lab</p>
  <p><em>林深见鹿，源启清溪 · Deep Insights, Evolutionary Origin.</em></p>
</div>
