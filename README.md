# SafeSpot（工程名 SafeEYE）

基于「找隐患」的交互式安全应知应会 **Web 应用**。  
安环员在浏览器里标注现场图、组卷；员工用浏览器考试；成绩与学情留在本厂服务器。

数据在本机 **SQLite + 本地图片**，默认不上云。  
**不是安装包，也不是桌面客户端**——一台机器跑服务，多人打开网页即可。

---

## 1. 快速开始（开发）

需要 Node.js 18+（推荐 20）。

```bash
npm run install:all
npm run dev
```

浏览器打开 **http://127.0.0.1:5173**

| 入口 | 地址 | 说明 |
|------|------|------|
| 学员端 | http://127.0.0.1:5173/#/play | 选卷、考试、龙虎榜 |
| 管理端 | http://127.0.0.1:5173/#/admin | 管理员 / 培训师账号 |

```bash
curl http://127.0.0.1:3000/api/health
```

### 生产（一个端口）

```bash
# 先改掉默认密码与 SESSION_SECRET，见 .env.example
npm start
```

浏览器打开 **http://127.0.0.1:3000**（页面和接口同一端口）。内网多人访问时设 `HOST=0.0.0.0`。

培训机可开 `#/play?kiosk=1` 隐藏管理入口。Docker：`docker compose up -d --build`。详见 [docs/DEPLOY.md](./docs/DEPLOY.md)。

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

组卷中心只列出 **已保存标注** 的图片。

---

## 3. 学员端

`#/play`

- 可选登录（人员组织里的账号），或访客手填姓名
- **正式考核**进正式榜与学情；**练习**默认不进正式榜
- 点中热区得分；空白点击计误点，单题默认容错 3 次后揭晓
- 计分：权重倒挤或均分；等第 优/良/中/差；另有 PRI 识别熟练度

正式考核的点击由 **服务端判定并计分**；浏览器上报的分数不会入库。

---

## 4. 管理端

`#/admin`

| 菜单 | 功能 |
|------|------|
| 图库标注 | 多图上传、框选、绑定条款、保存 |
| 组卷中心 | 选题、总分/规则/限时、草稿或发布 |
| 知识与风险 | 场景→大类→细则；5×5 风险字典 |
| 人员组织 | 多级部门、账号启停 |
| 成绩报表 | 流水、CSV、薄弱点（仅遗漏） |
| 学情分析 | 试卷/部门切片、PRI、规则结论 |
| 数据巡检 | 表预览、历史 JSON 清理 |

删卷 **不删** 历史成绩。

---

## 5. 案例图（可选）

`server/data/assets/case-bank-generated/` 提供按 5 大场景生成的示例图。  
需在图库中上传、按 `MANIFEST.json` 标注并组卷后才能考。

---

## 6. 目录

```text
SafeEYE/
├── README.md                 本文件
├── docs/                     现行文档（从 docs/README.md 进入）
│   └── archive/              历史文档，非真源
├── client/                   Vite + React 前端
└── server/                   Express + SQLite
    └── data/                 safeeye.db + assets/raw
```

---

## 7. 技术要点

| 项 | 说明 |
|----|------|
| 前端 | React 19 · Vite · Tailwind 3 |
| 后端 | Express · better-sqlite3 · multer |
| 坐标 | 0~1 相对比例 |
| 学情 | `session_log` v2 → `attempt_stats` / `knowledge_error_facts` |

| 变量 | 默认 | 含义 |
|------|------|------|
| `ADMIN_PIN` | `safeeye` | 开发口令（生产禁止默认值） |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址；内网设 `0.0.0.0` |
| `SESSION_SECRET` | `dev-only-secret` | 会话签名（生产必改） |

---

## 8. 文档

| 文档 | 内容 |
|------|------|
| [docs/README.md](./docs/README.md) | **文档地图** |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | 产品定位（Web，非安装包） |
| [docs/PLAN.md](./docs/PLAN.md) | **规划与进度真源** |
| [docs/PROCESS.md](./docs/PROCESS.md) | **改造过程流水**（每次改动必记） |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 架构 |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | 开发 / 生产 / 备份 |
| [docs/USER_GUIDE.md](./docs/USER_GUIDE.md) | 操作手册 |
| [docs/ANALYTICS.md](./docs/ANALYTICS.md) | 学情与 PRI |
| [docs/软著/00_文档索引.md](./docs/软著/00_文档索引.md) | 软著：产品 / 功能 / 使用说明 |
| [COPYRIGHT.md](./COPYRIGHT.md) | 版权声明摘要 |

---

## 9. 常见问题

| 现象 | 处理 |
|------|------|
| 组卷中心无案例 | 先标注并点「保存标注」 |
| 中文文件名乱码 | 重启后端后再传 |
| 删卷后成绩还在吗 | 会保留 |
| 薄弱点出现 unknown | 现行逻辑只统计遗漏；误点进 PRI |
| better-sqlite3 编译失败 | 在 `server` 重装，对齐 Node 版本 |
| 3000 端口占用 | `PORT=3010` 启动后端 |

---

*SafeSpot · Web · 鹿溪联合创新实验室*
