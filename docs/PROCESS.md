# SafeSpot 改造过程记录

> **本文是改造过程的唯一流水真源。**  
> 每一次实现、修订、回退都必须在本文追加条目，不得只改代码不记账。  
> 进度与范围仍以 [`PLAN.md`](./PLAN.md) 为准；本文记「做了什么、动了哪些文件、为何、残留什么」。

**维护纪律**

1. 开工前：在对应阶段下写「开始」一行（日期 + 任务 ID）。  
2. 完成时：写条目，含改动文件、行为变化、验收、残留风险。  
3. 未写入本文的改动，视为未完成交付。  
4. 不要把过程细节堆回 README；对外说明保持短。

状态与 `PLAN.md` 相同：`⬜` `🔄` `✅` `➖` `⛔`

---

## 0. 产品锁定（2026-08-13）

用户明确：**Web 应用，不要安装包 / Electron / Tauri。**

据此作废 `archive/UPGRADE_PLAN.md` 中的桌面壳，重写文档地图。现行文档：

| 文件 | 职责 |
|------|------|
| `PLAN.md` | 分期任务与验收 |
| **`PROCESS.md`（本文）** | 过程流水 |
| `PRODUCT.md` / `ARCHITECTURE.md` / `DEPLOY.md` / `USER_GUIDE.md` | 定位、架构、部署、操作 |

---

## 1. 基线审计（改造前）

对 `client/src` + `server/src` 的研读结论（未改代码的那一轮）：

- 业务闭环已在：标注 → 组卷 → 考试 → 报表 / 学情。
- **管理鉴权是前端门禁**（`local-admin`），API 无会话。
- **成绩由浏览器上报**，服务端只钳分。
- **开考前可拉全量热区**。
- 名册公开，提交可冒充 `userId`。
- 生产不能单端口出网页；`server/node_modules` 与 WAL 入库。
- 无测试、无 CI、无备份脚本。
- 文档四代并存，进度表自相矛盾。

判断：功能面约 65%，厂区可交付约 35%。成绩当时不宜作合规唯一依据。

---

## 2. W0 — 文档重整 ✅

**日期**：2026-08-13

**做了什么**

- 过时文档迁入 `docs/archive/`（`Design.md`、`UPGRADE_PLAN.md`、Sprint 日志、过期依赖表等）。
- 新建 `PRODUCT` / `PLAN` / `ARCHITECTURE` / `DEPLOY` / `ANALYTICS`，重写根 `README` 与 `USER_GUIDE`。
- 产品形态锁定为内网 Web；P3 安装包永久取消。

**主要文件**

- 新增：`docs/README.md`、`PRODUCT.md`、`PLAN.md`、`ARCHITECTURE.md`、`DEPLOY.md`、`ANALYTICS.md`、`archive/README.md`
- 重写：`README.md`、`docs/USER_GUIDE.md`
- 归档：见 `docs/archive/`

**验收**：新人只读 `README` + `docs/` 能理解「这是 Web，下一步是 W1」。

---

## 3. W1 — 诚实 Web 底座 ✅

**日期**：2026-08-13  
**任务**：W1-A ~ W1-E（见 `PLAN.md` §3）

### 3.1 行为变化

- 登录写 **httpOnly** 会话表 `auth_sessions`；管理端用账号（`admin`/`trainer`），PIN 仅开发引导。
- `/api` 默认要培训师/管理员；开考、已发布卷、龙虎榜对学员开放。
- `POST /api/exam-sessions` 开考；点击只传坐标；服务端 hit-test；交卷按快照计分，忽略客户端 `score`。
- 正式卷揭晓前不下发热区；访客不能绑他人工号。
- `npm start` = build + 单进程托管 `client/dist`；默认 `HOST=127.0.0.1`。
- 生产拒绝默认 PIN / `admin123` / 默认 `SESSION_SECRET`（除非 `ALLOW_INSECURE=1`）。
- 上传限 JPEG/PNG/WebP；删图路径约束；SQLite `foreign_keys` + `schema_version`。
- git 停止跟踪 `server/node_modules`、`*.db-wal`、`*.db-shm`。
- `npm test` + `.github/workflows/ci.yml`（Node 20）。

### 3.2 主要文件

- 新增：`server/src/{hitTest,scoring,session,examEngine}.js`、`server/src/start-prod.js`、`server/test/*.test.js`、`client/src/lib/api.js`、`.env.example`、`.github/workflows/ci.yml`
- 大改：`server/src/app.js`、`server/src/db.js`、`client/src/App.jsx`、`InteractionJudge.jsx`、`adminAuth.js`、`userAuth.js`

### 3.3 残留

- 本机 Node 26 无法编译 `better-sqlite3`，`examEngine` 集成测试自动跳过；CI 用 Node 20。
- 失败重建 native 模块后需从 git 恢复 `.node` 或换 Node 20 重装。

---

## 4. W2 — 培训可运营 ✅

**日期**：2026-08-13  
**任务**：W2-01 ~ W2-10

### 4.1 行为变化

- 新卷使用稳定 `exam_*` ID；组卷可回载、↑↓ 调序；发布写入 `exam_items.item_meta` 快照。
- 考卷可布置部门 / 截止 / 必考；报表按布置或全员给出未考/未过并导出 CSV。
- 学情与报表接 7/30/90 天。
- `npm run backup` / `restore`；巡检页也可备份；题库 zip 导入导出。
- 标注：滚轮缩放、Alt/空格平移、Ctrl+Z；已发布卷引用的图删除需确认。
- 破坏性操作改用 `ConfirmDialog`。

### 4.2 主要文件

- 新增：`server/src/{zipStore,backup,backup-cli,bankPack,attendance}.js`、`client/src/components/ConfirmDialog.jsx`
- 大改：`app.js` 组卷/删图、`examEngine.js` 读快照、`TestAssembler` / `ExamManager` / `ReportsDashboard` / `AnalyticsDashboard` / `AnnotationEngine` / `KnowledgeManager` / `PersonnelManager` / `DBInspector`

### 4.3 残留

- 组卷预览分仍按「每题」倒挤，实考按「每点」；预览与实考可能差 1 分量级（未改算法，以免管理端误解已对齐）。

---

## 5. W3 — Web 产品化 ✅

**日期**：2026-08-13  
**任务**：W3-01 ~ W3-08

### 5.1 行为变化

- 窄屏龙虎榜抽屉、考试条款抽屉；`#/play?kiosk=1` 隐藏管理入口。
- 正式考核达标可「打印合格证」（浏览器打印 PDF）。
- `audit_log` + 管理端「操作审计」；发卷/删卷/删图/改密/备份/导入/布置记账。
- `Dockerfile` + `docker-compose.yml`，数据 volume。
- 人员 CSV 导入（Excel 另存 UTF-8）；样例 `docs/personnel-import.sample.csv`。
- 空库或手动「开箱示范卷」预置 12 张场景图（**热区为示意框**）。
- Hash 深链：`#/admin/reports` 等刷新不丢页。
- 开考会话路由抽到 `server/src/routes/play.js`。

### 5.2 主要文件

- 新增：`server/src/{audit,seedStarter,personnelImport}.js`、`server/src/routes/play.js`、`client/src/lib/certificate.js`、`AuditDashboard.jsx`、`Dockerfile`、`docker-compose.yml`、`.dockerignore`
- 大改：`App.jsx`（hash / kiosk / 抽屉）、`InteractionJudge.jsx`（合格证 / 条款抽屉）、`PersonnelManager.jsx`、`ExamManager.jsx`、`db.js` schema v4

### 5.3 残留（W3 结束时）

- 学员端 `InteractionJudge.jsx` 仍是大厅+画布+结果一体，W3-08 前端拆分未做完。
- `KnowledgeManager.jsx` 仍有失败 `alert`。
- 开箱卷热区不是实拍框选。
- 验收矩阵 T-01/T-02/T-03/T-06 等仍待真人点选回归。

---

## 6. W4 — 过程建档与结构补完

**日期**：2026-08-13  
**状态**：🔄 本条目随提交更新

### 6.1 立项原因

用户要求：此前所有变更与后续修订都必须写入**具体的过程 md**。`PLAN.md` 只有任务勾选，不够当流水；`archive/ENGINEERING_LOG.md` 已归档且过时。

### 6.2 本轮结果

| ID | 内容 | 状态 |
|----|------|------|
| W4-01 | 建立本文并回写 W0–W3 | ✅ |
| W4-02 | 拆分学员端大厅 / 结果页（补完 W3-08 前端） | ✅ |
| W4-03 | 知识库失败提示去掉原生 `alert` | ✅ |
| W4-04 | 文档地图与 README 挂载本文；`PLAN.md` 增加 W4 | ✅ |

**行为变化**

- 学员端大厅、结果页独立组件；`InteractionJudge` 只编排状态与考试画布。
- 知识库增删改失败改为页内黄条，不再弹系统对话框。
- 之后每次改造必须在本文 §7 模板下追加；未记账不算交付。

**改动文件**

- `docs/PROCESS.md` — 本文（W0–W4 流水）
- `docs/README.md`、`README.md`、`docs/PLAN.md` — 挂载过程真源
- `client/src/lib/examSettings.js` — 开考设置解析抽出
- `client/src/components/User/ExamLobby.jsx` — 三步大厅
- `client/src/components/User/ExamResult.jsx` — 结果与合格证
- `client/src/components/User/ExamToast.jsx` — 统一 toast
- `client/src/components/User/InteractionJudge.jsx` — 瘦身为编排 + 画布
- `client/src/components/Admin/KnowledgeManager.jsx` — 去掉 `alert`

**验收**：打开 `docs/PROCESS.md` 能按时间读完本次会话全部改造；学员端大厅/结果仍可用。

**残留**：考试画布仍在 `InteractionJudge` 内（未再拆 `ExamCanvas`）；T-01 等 UI 回归未做；开箱卷热区仍为示意框。

### 2026-08-13 · 热修 App.jsx 三元缺省

- **原因**：`npm run dev` 时 Vite 解析 `App.jsx` 失败：`mode === 'play' && !kiosk ? … : mode === 'admin' ? …` 没有最后的 `: null`，kiosk 学员端无法编译。
- **行为变化**：kiosk 模式下顶栏不再渲染「管理端」按钮，语法合法。
- **改动文件**：
  - `client/src/App.jsx` — 补全嵌套三元的第三支
- **验收**：Vite 应能完成依赖扫描并打开 5173。
- **残留 / 不做**：无。

---

### 2026-08-13 · 清理重复未标注图与失效学情

- **原因**：案例图人工标注后，库里还留着同图的旧上传副本（带时间戳后缀、0 条标注）。已删试卷的 7 条演示成绩仍在 `records`，学情筛选会看到「卷已删」脏数据。
- **行为变化**：
  - 删除 12 张未标注重复图及磁盘文件；保留已标注 12 张 + 1 张无关未标注图。
  - 删除 exam 已不存在的 7 条成绩，并清无主 `attempt_stats` / `knowledge_error_facts`。
  - 数据巡检增加「清理重复图与失效学情」。
  - 开箱卷种子若已有同名案例，复用已有资产，不再复制第二份。
- **改动文件**：
  - `server/src/cleanup.js` — 预览与清理逻辑
  - `server/src/app.js` — `/api/admin/hygiene`；删卷时清无主学情
  - `server/src/seedStarter.js` — 按 stem 复用资产
  - `client/src/components/Admin/DBInspector.jsx` — 清理按钮
  - `server/test/cleanup.test.js`、`server/test/examEngine.test.js` — stem 单测；补 `item_meta` 列
- **验收**：库内 12 张已标注案例、成绩 0 条、无重复未标注同图。
- **残留 / 不做**：`Gemini_Generated_…png` 无对应已标注副本，未删。

---

### 2026-08-13 · 实验室风格 SVG 标志与应用声明页

- **原因**：顶栏与 favicon 仍是通用 Lucide 盾标；版权弹窗信息过短，不像实验室产品声明。用户要求矢量 SVG，不要位图。
- **行为变化**：
  - Favicon 与主 Logo 改为光学分划/观测场矢量徽标（墨色仪壳、青绿环、琥珀观测点）。
  - 顶栏、管理登录、学员登录使用同一 SVG 徽标；字标「SafeSpot」由页面排版写出，避免生成图乱字。
  - 点击顶栏 Logo 打开应用声明：产品/工程/版本/形态元数据，以及产品声明、数据边界、成绩与责任、使用约定。
- **改动文件**：
  - `client/public/safespot.svg` — favicon 矢量徽标
  - `client/public/safespot-logo.svg` — 横版主 Logo（徽标 + 字标）
  - `client/src/components/Brand/SafeSpotMark.jsx` — 可缩放 SVG 组件
  - `client/src/components/Brand/AppDeclaration.jsx` — 应用声明页
  - `client/src/App.jsx` — 接入 Logo 与声明
  - `client/index.html` — `zh-CN`、主题色、描述、SVG favicon
- **验收**：标签页图标为 SVG 观测场；顶栏 Logo 可点开声明；声明含实验室署名与本地优先边界。
- **残留 / 不做**：未改合格证版式；未做 PNG 触摸图标（按用户要求只用 SVG）。

---

### 2026-08-13 · 声明弹窗对齐实验室双层品牌

- **原因**：声明页自造了纸本/标本签风格，与本应用其它白底弹窗、以及志愿 / VectorStream / IQS 的关于页不一致；出品方只用了文字，没有官方实验室主 LOGO。用户要求对照其它项目记忆，加入 `LUXI LAB.svg`。
- **行为变化**：
  - 拷入官方实验室主标（网页用 `luxi-lab-main.svg`）。
  - 声明 / 学员登录 / 管理登录共用白底圆角弹窗；出品区为 SafeSpot 产品标 × 鹿溪主标。
  - 确认框 overlay 与圆角对齐同一套。
- **改动文件**：
  - `client/public/brand/luxi-lab-main.svg` — 官方 LUXI LAB 网页稿
  - `client/public/brand/LUXI LAB.svg` — 官方副本
  - `client/public/brand/README.md` — 双层品牌说明
  - `client/src/components/Brand/LabProducer.jsx` — 出品双标
  - `client/src/components/Brand/ModalShell.jsx` — 弹窗壳
  - `client/src/components/Brand/AppDeclaration.jsx` — 白底声明 + 出品
  - `client/src/App.jsx` — 登录弹窗接入
  - `client/src/components/ConfirmDialog.jsx` — overlay 对齐
- **验收**：点顶栏 Logo 可见官方鹿标；登录弹窗与声明同一白卡片。
- **残留 / 不做**：未改合格证；未把鹿溪绿换成全站主色（产品 UI 仍用靛蓝）。

---

### 2026-08-13 · 声明弹窗加宽与出品标透明底

- **原因**：出品双标套了白底方块；弹窗 `max-w-lg` 正文换行过多导致过长。
- **行为变化**：
  - 去掉出品标 CSS 白底；网页用 `luxi-lab-main.svg` 去掉整幅白画板（官方 `LUXI LAB.svg` 原件不动）。
  - 声明弹窗改为 `max-w-3xl`，元数据四列、声明两列。
- **改动文件**：
  - `client/public/brand/luxi-lab-main.svg`
  - `client/src/components/Brand/LabProducer.jsx`
  - `client/src/components/Brand/AppDeclaration.jsx`
- **验收**：出品鹿标无白方块；桌面声明页明显变矮。
- **残留 / 不做**：无独立 mobile 路由（见产品说明：同一套响应式 Web）。

---

### 2026-08-13 · 软著鉴别材料

- **原因**：准备计算机软件著作权登记，需要独立成篇的产品说明、功能说明、使用说明及填报表。
- **行为变化**：新增 `docs/软著/` 全套底稿；根目录 `COPYRIGHT.md`、`NOTICE.md`；发行号与根 `package.json` 对齐 V1.4。
- **改动文件**：
  - `docs/软著/00`–`09` — 索引、登记表、产品/功能/使用、部署、源码页、开源、版权、检查单
  - `COPYRIGHT.md`、`NOTICE.md`
  - `docs/README.md`、`PRODUCT.md`、`USER_GUIDE.md`、`README.md`、`package.json`
- **验收**：按 `00_文档索引.md` 可独立打印三份说明书提交鉴别材料二。
- **残留 / 不做**：著作权人法定全称留空，须书面约定后填入 `01`；未自动排版源程序 60 页 PDF。

---

### 2026-08-13 · 同步修订根 README

- **原因**：软著与 V1.4 功能已落地，根 README 仍缺版本、审计菜单、出品、软著目录与「无独立手机站」说明。
- **行为变化**：根 README、前端 README、文档地图与现行产品对齐。
- **改动文件**：
  - `README.md` — 对外说明真源
  - `client/README.md` — 前端入口说明
  - `docs/README.md` — 标明根 README 职责
- **验收**：打开根 README 能看到 V1.4、八个管理菜单、软著入口、实验室出品。
- **残留 / 不做**：无。

---

## 7. 回写模板（以后每次改造复制）

```markdown
### YYYY-MM-DD · <任务 ID 或简述>

- **原因**：
- **行为变化**：
- **改动文件**：
  - `path` — 一句话
- **验收**：
- **残留 / 不做**：
```

---

## 8. 与 PLAN 的分工

| 问题 | 看哪份 |
|------|--------|
| 下一步做什么、是否完工 | `PLAN.md` |
| 某天改了哪些文件、为什么 | **本文** |
| 怎么部署 / 怎么操作 | `DEPLOY.md` / `USER_GUIDE.md` |
| 历史宣言、旧进度表 | `archive/`（只读） |
