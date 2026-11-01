# 审微 · ShenWei（SafeSpot）工程化与产品深度评估审计及演进方案

> **文档定位**：立足于工业安环培训的业务初衷与本地优先（Local-First）架构约束，对系统代码实现、技术栈选型、核心算法、产品功能完整度、人机交互与工程化体系进行全维度评估与审计，并给出结构化的演进实施路线图，作为后续迭代升级的权威技术与产品指南。  
> **编制基线**：V1.4.1-web · 2026-11-01  
> **归属工程**：`LUCY-SHENWEI`（SafeEYE） · 鹿溪联合创新实验室（LUXI Joint Innovation Lab）

---

## 目录

1. [执行摘要与审计综述](#1-执行摘要与审计综述)
2. [技术栈与基础依赖审计](#2-技术栈与基础依赖审计)
3. [系统架构与代码实现深度审计](#3-系统架构与代码实现深度审计)
4. [核心算法模型评估与数学优化](#4-核心算法模型评估与数学优化)
5. [产品功能完整度与业务闭环差距分析](#5-产品功能完整度与业务闭环差距分析)
6. [交互体验与人机工程学改进建议](#6-交互体验与人机工程学改进建议)
7. [安全合规、DevOps 与工程化运维](#7-安全合规devops-与工程化运维)
8. [演进落地路线图与优先级实施矩阵](#8-演进落地路线图与优先级实施矩阵)

---

## 1. 执行摘要与审计综述

### 1.1 项目初衷与设计原则回顾

审微（SafeSpot）的设计初衷是解决工业制造与施工现场安环培训中“**知行脱节**”的痛点：传统的书面选择题、课件宣讲无法衡量一线作业人员在复杂现场“**能不能肉眼发现隐患**”的具身能力。系统通过真实场景照片标注、归一化相对坐标热区检测、学员视觉探查交互与服务端权威计分，实现了可记录、可对账的隐患排查考核。

在架构上，项目确立了六项核心军规：
1. **Local-First**：SQLite 单文件主库 + 本地图片目录，数据严格不出厂。
2. **Web 单进程交付**：无桌面外壳、无原生 App，单端口同时提供静态前端、REST API 与图片静态托管。
3. **服务端权威计分**：前端仅作坐标采集与即时视效，分值与判定由服务端快照回放计算。
4. **相对坐标体系**：$x, y, w, h \in [0, 1]$ 相对图片内容盒，任意分辨率缩放不失真。
5. **条款松耦合引用**：知识树与标注解耦，发布时冻结快照，改条文不坏历史卷。
6. **删卷留史**：试卷下线不破坏历史培训档案与台账。

### 1.2 评估现状雷达图（基于 1.4.1-web 基线）

| 维度 | 得分（10分制） | 核心优势 | 关键风险与瓶颈 |
| :--- | :---: | :--- | :--- |
| **架构设计与合规** | **8.5** | Local-First 贯彻彻底，服务端权威计分，会话机制规范 | 后端上帝文件严重（`app.js` 达 1700+ 行），前后端未解耦 |
| **数据模型与性能** | **6.5** | WAL 模式、外键开启、物化表设计明确 | **`records` 核心流水表完全裸奔无索引**，大批量时性能悬崖 |
| **算法与计算模型** | **7.0** | PRI 熟练度与贝叶斯平滑先验立意深远 | 分值余数末位堆积失真、PRI 误点惩罚重叠、未融合 5×5 风险加权 |
| **前端工程与代码** | **6.0** | LUXI 品牌设计系统落地，React 19 尝鲜 | **Vite 8-beta 风险**，组件庞大缺乏抽离，80% 后台组件裸调 `fetch` |
| **产品功能完整度** | **7.5** | 标注-组卷-考试-报表全链路打通，具备开箱卷 | 缺少**错题强化复训**闭环、无**扫码开考**体系、无题目随机防抄袭 |
| **工程运维与容灾** | **6.5** | 提供 Docker、备份恢复 CLI、基础单测 | 手写 `zipStore` 全内存加载面临 OOM 风险、测试覆盖率偏低（14用例） |

---

## 2. 技术栈与基础依赖审计

### 2.1 前端：构建工具与框架稳定性

```text
client/package.json
├── react: ^19.2.0           (最新前沿版本，并发渲染与 Hooks 表现优异)
├── vite: ^8.0.0-beta.13     (⚠️ 高危风险：生产依赖 beta 版本，存在 overrides 锁定)
├── tailwindcss: ^3.4.19     (稳定，LUXI 设计 Token 映射良好)
└── lucide-react: ^0.575.0   (图标完备)
```

#### 缺陷诊断：
1. **打包器使用 Beta 预发布版本**：
   `client/package.json` 中强行通过 `overrides` 指定了 `vite: ^8.0.0-beta.13`。对于面向工业现场、政企安全合规交付的软件系统，构建工具链使用不稳定的 beta 版本会导致底层打包缓存行为异常、CI 破坏、以及随时可能发生的隐蔽编译缺陷。
2. **缺乏类型保障（TypeScript / JSDoc）**：
   全量代码使用 JavaScript 编写。尤其在核心数据协议（例如：试卷快照 `snapshot`、学员点击日志 `session_log` v2 格式、考核状态 `state`、图元坐标 `rect`）缺乏静态类型约束，字段拼写（如 `examName` vs `exam_name`、`clauseId` vs `clause_id`）在多处通过运行时兜底，代码坏味道重，隐式维护成本高。

#### 建议方案：
- **降级/平移至 Vite 5.x / 6.x 正式稳定版**，移除 `package.json` 中的 `overrides`。
- 引入 **TypeScript** 渐进式改造（或全量 JSDoc + `checkJs`），优先为 `lib/types.d.ts` 定义核心协议接口（`ExamSnapshot`, `AnnotationItem`, `SessionLogEvent`, `UserProfile`）。

---

### 2.2 后端：运行时环境与依赖排查

```text
server/package.json
├── better-sqlite3: ^12.11.1 (同步执行、WAL 性能高，但强依赖 C++ 构建)
├── express: ^5.2.1          (现代化异步错误捕获)
├── lowdb: ^7.0.1            (❌ 僵尸依赖，全库已切 SQLite，无任何调用)
└── multer: ^2.0.2           (多图上传支持)
```

#### 缺陷诊断：
1. **僵尸依赖残留**：
   全库代码经过排查，已彻底剥离早期 JSON 存储，全面转向 SQLite。但 `server/package.json` 中仍然将 `lowdb` 列为运行时依赖并打包进 `node_modules`，属于无谓的包体积负担与安全审计隐患。
2. **Native 模块现场部署阻力**：
   `better-sqlite3` 是 C++ 原生扩展。虽然在 Node 20 LTS 下表现极佳，但在国内部分受限局域网机房或低版本 Linux 环境部署时，常常遇到缺少 `python3`, `make`, `g++` 导致编译失败的问题。目前 Dockerfile 虽然处理了依赖编译，但非 Docker 纯净宿主机直接 `npm install` 仍存在门槛。

#### 建议方案：
- 运行 `npm uninstall lowdb --prefix server`，彻底清理无用依赖。
- 在部署脚手架中固化预编译二进制（Prebuilt Binaries）配置，提供预打包好的 `better-sqlite3` 离线依赖包或推荐 Docker 优先交付。

---

### 2.3 归档模块性能瓶颈：手写 `zipStore` 审计

在 `server/src/zipStore.js` 与 `server/src/backup.js` 中，开发团队为了追求“零外部依赖”，手写了一个仅支持 Store 模式（`method = 0`，未压缩）的 ZIP 打包/解包器。

#### 缺陷诊断：
1. **全内存加载引发的 OOM（Out Of Memory）崩溃风险**：
   ```javascript
   // backup.js 现状：
   entries.push({ name: `assets/raw/${name}`, data: fs.readFileSync(full) });
   // ...
   const buf = packZip(entries); // 在内存中一次性分配拼接全量字节！
   ```
   当现场高清工业图片累积至数百张（如 2GB~5GB）时，一次备份会触发瞬间巨量内存分配，直接打爆 Node.js 默认 V8 堆内存（1.4GB~2GB），导致主后台服务进程直接崩溃退出！
2. **解包兼容性差**：
   解包逻辑严格判定 `if (method !== 0) throw new Error(...)`。安环员在 Windows / macOS 操作系统上自行压缩题库包时，系统自带压缩通常默认为 **Deflate（method 8）**。此时导入将直接报错，严重损害用户体验。

#### 建议方案：
- 采用 Node.js 原生支持流式处理的轻量成熟方案（如引入 `archiver` 进行流式归档输出，以及 `unzipper` / Node 原生 `zlib` 流解压），将全内存加载改造为**管道流式写入（Pipeline Stream）**，内存占用稳定在 20MB 以内。

---

## 3. 系统架构与代码实现深度审计

### 3.1 后端上帝文件：`server/src/app.js` 拆分重构

#### 现状分析：
`server/src/app.js` 文件体积高达 **1708 行**，聚集了超过 50 个路由端点，涵盖：
- 资产管理（上传、重命名、去重、删除、元数据写入）
- 知识库三级树 CRUD 与 5×5 风险字典管理
- 组织架构、部门树、用户管理、花名册
- 考试发布、试卷启停、试卷编辑、指派管理
- 成绩查询、出勤对账、CSV 流式导出、薄弱知识点分析
- 学情聚合、PRI 统计、规则建议引擎
- 数据库底层巡检、无用数据清理、系统备份与恢复

```text
现状（单体集中）：
server/src/app.js (1708 lines) ── 承载 95% 的业务路由与控制器逻辑

目标（模块化架构）：
server/src/
├── app.js               (内核：Express装配、安全头、全局中间件、错误兜底 < 100行)
├── routes/
│   ├── auth.js          (登录、会话校验、登出、个人信息)
│   ├── play.js          (学员考试会话、点击判定、交卷 [已存在])
│   ├── assets.js        (现场图库上传、流转、元数据)
│   ├── exams.js         (试卷生命周期、组卷发布、指派)
│   ├── knowledge.js     (场景/类别/细则知识树、风险字典)
│   ├── org.js           (组织、部门、员工名册、导入)
│   ├── reports.js       (成绩流水、未考对账、CSV导出)
│   ├── analytics.js     (学情分析切片、PRI分布、规则建议)
│   └── system.js        (备份恢复、题包导入导出、数据巡检与清理)
└── controllers/ / services/ (业务逻辑与 SQL 交互下沉)
```

#### 重构收益：
- 降低代码冲突概率，支持团队多模块并行开发。
- 方便为单一路由挂载独立的中间件（如仅对 `/api/auth/login` 启用频次限制）。

---

### 3.2 数据库关键性能陷阱：缺失联合索引

#### 现状审查：
经审计 `server/src/db.js`，发现系统存在严重的索引遗漏：
```sql
-- records 表：整个系统的“核心高频业务写入与分析流水表”，居然完全没有索引！
CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id TEXT,
    user_name TEXT,
    score INTEGER,
    duration INTEGER,
    completed_at INTEGER,
    session_log TEXT
    -- 后续 ALTER 追加了 user_id, exam_name, mode, paper_total, department_id
);
```

而在 `attendance.js`、`app.js`、`analytics.js` 中，存在大量如下查询：
```sql
-- 龙虎榜与报表频繁全表扫描
SELECT * FROM records WHERE exam_id = ? AND COALESCE(mode,'exam') = 'exam' ORDER BY score DESC, completed_at DESC;
-- 出勤与个人最好成绩
SELECT * FROM records WHERE COALESCE(mode,'exam') = 'exam' AND exam_id = ?;
-- 组织人员关联合查
SELECT * FROM users WHERE status = 'active' AND org_id = ?;
```

#### 风险评估：
随着厂区常态化考核推行，`records` 数据量达到数万条时，每次加载学员龙虎榜或安环员生成报表，都会触发**全表扫描 + 临时文件排序**，直接造成 SQLite 锁竞争和 UI 严重卡顿。

#### 索引加固方案（需立即写入 Schema 升级）：
```sql
-- 1. 试卷与考核模式联合索引（覆盖出勤与龙虎榜主路径）
CREATE INDEX IF NOT EXISTS idx_records_exam_mode_score 
ON records(exam_id, mode, score DESC, completed_at DESC);

-- 2. 学员维度历史查询索引
CREATE INDEX IF NOT EXISTS idx_records_user_id 
ON records(user_id, completed_at DESC);

-- 3. 组织人员高频过滤索引
CREATE INDEX IF NOT EXISTS idx_users_org_status_role 
ON users(org_id, status, role);

CREATE INDEX IF NOT EXISTS idx_user_profiles_dept 
ON user_profiles(department_id);

-- 4. 试卷题目关联索引（加速题面加载）
CREATE INDEX IF NOT EXISTS idx_exam_items_exam_order 
ON exam_items(exam_id, order_index ASC);
```

---

### 3.3 会话与鉴权中间件的高频查库开销

#### 缺陷诊断：
查看 `server/src/session.js` 中的 `attachSession` 中间件：
```javascript
function attachSession(req, res, next) {
    // 每个进来的 HTTP 请求（包括页面轮询、图片、API）都会同步执行 2 次 SQLite 读操作：
    const row = db.prepare('SELECT * FROM auth_sessions WHERE id = ? AND expires_at > ?').get(sid, Date.now());
    const profile = db.prepare('SELECT ... FROM users ... WHERE u.id = ?').get(row.user_id);
    // ...
}
```
由于 `better-sqlite3` 是同步执行，在集中并发场景下，高频请求反复触发同一会话的重复查库，空耗 CPU 与 SQLite 锁。

#### 优化建议：
在 Node 内存中建立**极简带 TTL 的会话 LRU 缓存**（如保留 5~10 秒）：
```javascript
const sessionCache = new Map(); // sid -> { user, expiresAt }
// 命中内存缓存直接返回，大幅减轻 85% 以上的基础鉴权查库压力。
```

---

### 3.4 前端架构与网络请求层割裂

#### 现状分析：
虽然工程建立了 `client/src/lib/api.js` 并提供了 `apiFetch` 统一凭据（`credentials: 'include'`）与错误处理，但在全局 10 多个 Admin 业务组件中，**直接调用原生 `fetch()` 的地方仍有 40 多处**：
- `AnnotationEngine.jsx` 直接写了 8 处原生 `fetch`。
- `PersonnelManager.jsx` 写了 10 处原生 `fetch`。
- `KnowledgeManager.jsx` 写了 10 处原生 `fetch`。

#### 产生的工程隐患：
1. **身份认证丢失风险**：部分手写 `fetch` 漏传 `credentials: 'include'`，在特定反向代理或跨域调试下直接报 401。
2. **错误处理不一致**：有的页面通过页内 Toast 提示，有的页面用浏览器原生弹窗，有的页面直接在 catch 里吃掉错误，导致安环员在网络断开或超时时看到“界面无反应”，误以为系统卡死。
3. **前端状态树臃肿（Prop Drilling）**：
   `App.jsx` 聚合了 25+ 个 state，通过 Props 跨越 3-4 层向下透传；同时缺少全局状态管理（如切换 Tab 重新挂载组件，上一个 Tab 填了一半的筛选全部丢失）。

#### 改造方案：
1. **全局清剿原生 `fetch`**：一律收敛至 `lib/api.js`，增加统一拦截器机制（401 自动拉起登录弹窗，500 给出友好本地故障提示）。
2. **引入轻量状态管理（Zustand）**：
   将全局用户信息（`userStore`）、系统配置/枚举（`configStore`）与管理端筛选上下文抽离至独立 Store，解除 `App.jsx` 的庞大状态负担。

---

## 4. 核心算法模型评估与数学优化

### 4.1 权重倒挤分值算法缺陷与最大余额法优化

#### 现状缺陷（`server/src/scoring.js`）：
```javascript
// 现有实现：
let runningSum = 0;
allPoints.forEach((p, idx) => {
    if (idx === allPoints.length - 1) {
        scoreMap[p.id] = paperTotal - runningSum; // ⚠️ 致命缺陷：末位吸收全部余数
    } else {
        const score = Math.floor(((Number(p.scoreWeight) || 0) / totalWeight) * paperTotal);
        scoreMap[p.id] = score;
        runningSum += score;
    }
});
```
**数学失真模拟**：
假设试卷总分 100 分，共 15 个隐患点，每个点的业务风险权重均为 10。
- 前 14 个点计算分值：$\lfloor \frac{10}{150} \times 100 \rfloor = \lfloor 6.666... \rfloor = 6$ 分。
- 前 14 个点累计分值：$14 \times 6 = 84$ 分。
- 最后一个点分值：$100 - 84 = \mathbf{16}$ 分！
**业务危害**：原本在安环规程中危险程度完全相同的 15 个隐患，最后一个点的分值居然是前面每个点的 **2.67 倍**！这直接导致考核得分充满了极大的随机性与不公——学员碰巧点中最后一个点就能拿高分，漏掉最后一个点就扣重分。

#### 优化方案：采用最大余额法（Largest Remainder Method）
先分配整数部分，计算每个点的浮点小数余数，将剩余差额按小数部分从大到小依次补 1 分，确保最大分差不超过 1 分。

```javascript
/**
 * 优化实现：最大余额法（Hamilton-Hare Method）
 */
function buildPointScoreMapOptimized(allPoints, settings = {}) {
    const paperTotal = Number(settings.total_score) || 100;
    const rule = settings.scoring_rule || 'weighted';
    const scoreMap = {};
    if (!allPoints?.length) return scoreMap;

    if (rule === 'average') {
        const base = Math.floor(paperTotal / allPoints.length);
        let remainder = paperTotal % allPoints.length;
        allPoints.forEach((p) => {
            scoreMap[p.id] = base + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
        });
        return scoreMap;
    }

    const totalWeight = allPoints.reduce((sum, p) => sum + (Number(p.scoreWeight) || 0), 0);
    if (totalWeight <= 0) {
        allPoints.forEach((p) => { scoreMap[p.id] = 0; });
        return scoreMap;
    }

    // 1. 计算理论精准浮点值与整数底分
    const items = allPoints.map((p) => {
        const exact = ((Number(p.scoreWeight) || 0) / totalWeight) * paperTotal;
        const integerPart = Math.floor(exact);
        const remainder = exact - integerPart;
        return { id: p.id, integerPart, remainder };
    });

    let currentSum = items.reduce((sum, item) => sum + item.integerPart, 0);
    let diff = paperTotal - currentSum;

    // 2. 将差额分配给余数最大的项
    items.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < items.length && diff > 0; i++, diff--) {
        items[i].integerPart += 1;
    }

    // 3. 输出平滑分数
    items.forEach((item) => {
        scoreMap[item.id] = item.integerPart;
    });
    return scoreMap;
}
```
**改进效果**：15 个点中，10 个点得 7 分，5 个点得 6 分，总计恰好 100 分。分值均匀平滑，彻底消除运气成分。

---

### 4.2 PRI（识别熟练度）算法合理性修正

#### 现状公式回顾：
$$PRI = 100 \times \left( 0.40 \cdot M_{hit} + 0.25 \cdot (1 - W) + 0.15 \cdot \eta' + 0.20 \cdot (1 - R_{miss}) \right)$$
其中：
- $M_{hit}$ 为找全率
- $W = \min(1, \frac{Misses}{Slides \times 3})$ 为容错浪费率
- $\eta'$ 为全局点击速度的 Logistic 归一化：$\eta' = \frac{1}{1 + e^{-80(\eta - 0.02)}}$
- $R_{miss} = \frac{Misses}{Misses + Hits + 10^{-6}}$ 为无效点击率

#### 审计发现的缺陷：
1. **误点双重惩罚（Double Penalty on Misses）**：
   $W$ 与 $R_{miss}$ 均在严厉惩罚误点，两项权重叠加高达 **45%**。这导致“**消极作答策略**”的收益过高——学员只需点击 1 个最明显的隐患，剩下 9 个一律不点，由于误点数为 0，$1 - W = 1$ 且 $1 - R_{miss} = 1$，仅凭这两项就直接白拿 45 分！即使找全率极低，PRI 仍能得到中等评价。
2. **全局时长失真**：
   $\eta = \frac{Hits}{DurationSec}$ 采用开考到交卷的全程用时。如果学员作答速度极快（10 秒找全），但在交卷前仔细核对或喝水停顿了 3 分钟，其 $\eta$ 将被严重拉低；反之盲目交卷则可能拉高指标。

#### 算法演进公式建议：
$$PRI^* = 100 \times \left( 0.50 \cdot M_{hit} + 0.20 \cdot (1 - W^*) + 0.20 \cdot T_{latency}' + 0.10 \cdot S_{confidence} \right)$$
1. **提高找全率权重**至 50%：明确“发现隐患是第一要务”。
2. **合并误点惩罚**：仅保留单题加权容错浪费率 $W^*$（权重 20%）。
3. **引入首中延迟与命中间隔（First-Hit & Inter-Hit Latency）**：
   以每次切题后点击首个隐患的时间差 $\Delta t_{first}$ 计算归一化速度 $T_{latency}'$，真实反映作业人员的**视觉敏感度与现场本能反应**，彻底剥离交卷闲置等待带来的噪声干扰。

---

### 4.3 贝叶斯掌握度：融入 5×5 风险等级加权

#### 现状缺陷：
`server/src/analytics.js` 中知识薄弱点采用标准的无偏拉普拉斯平滑：
$$\text{Mastery} = \frac{H + 1}{E + 2}$$
但现场安全管理的核心原则是“**风险分级管控**”。遗漏高处作业“未系安全绳（5级重大风险）”与遗漏“警示标识略有褪色（1级轻微风险）”，在安环合规上具有完全不同的事故隐患当量。目前系统对两者的掌握度计算完全一视同仁。

#### 加权贝叶斯掌握度演进：
引入知识项绑定的 $L \times C$（可能性 × 后果）风险矩阵综合权重 $R_i \in [1, 25]$：
$$\text{Mastery}_{Risk} = \frac{\sum_{h \in Hits} R_h + \bar{R}}{\sum_{e \in Exposed} R_e + 2\bar{R}}$$
在学情报表与管理端大屏上，优先将“**重大风险低掌握度条目**”排在第一警示梯队，使安环部门的培训干预有的放矢。

---

### 4.4 几何碰撞检测：异形多边形与带状隐患支持

#### 现状约束：
`server/src/hitTest.js` 仅支持标准轴对齐矩形（AABB）和椭圆。
实际工业现场隐患往往呈狭长斜向或不规则形状（例如：斜拉钢丝绳破损、地面不规则液体溢流、管道焊缝裂纹）。使用矩形外接框会框入大量非隐患背景，造成“点在空白也算中”的虚假命中。

#### 建议演进：
支持 **多边形（Polygon）射线法** 与 **带状折线（Polyline with Radius）碰撞**：
```javascript
// 多边形射线交叉判定（Even-Odd Rule）
function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
```

---

## 5. 产品功能完整度与业务闭环差距分析

基于 `docs/PRODUCT.md`、`docs/软著/` 与一线车间安环培训的实际业务场景对比，系统存在以下关键产品功能断点：

```text
现行流程闭环：
[安环员制卷] ──> [学员答题] ──> [报表看分] (流程终止)
                   ▲                │
                   └─ 缺乏反馈闭环 ──┘

理想运营闭环：
[安环员制卷] ──> [现场扫码开考] ──> [即时成绩] ──> [薄弱点智能错题集]
                                                        │
[培训合规电子台账归档] <── [未过人员自动重考指派] <─────────────┘
```

### 5.1 痛点一：缺少“错题本与弱项强化练习”功能（学员闭环断裂）
- **现象**：学员考完试后，在 `ExamResult` 界面看一眼漏找的隐患红框便退出了。下次再考，同样的隐患依然视而不见。
- **改进建议**：
  - 新增 **「我的错题与薄弱集」** 模块。
  - 系统根据 `knowledge_error_facts` 中高频 `unfound` 隐患，自动生成学员个人的“靶向强化卷”。
  - 练习模式支持“闪卡复习模式”：仅呈现历史错题图片，要求学员重新找出隐患点并阅读规程条款，直到连续 2 次识别成功才移出待强化库。

### 5.2 痛点二：现场扫码开考与“一卷一码”体系缺失（一线落地断裂）
- **现象**：车间一线员工在流动工位或培训机前，往往难以在平板浏览器中记忆并输入形如 `http://192.168.1.100:3000/#/play?kiosk=1` 的长链接；若手动输入工号和姓名也极易产生录入错误或代考。
- **改进建议**：
  - **试卷二维码（QR Code）**：管理端一键生成试卷二维码，安环员可直接打印张贴在班组看板或车间交接班宣讲栏。
  - **员工扫码快考**：员工使用厂区内网终端扫码直接跳转进入对应试卷大厅，若结合员工工牌条形码/二维码扫描，可实现免敲键盘 1 秒核验身份并开考。

### 5.3 痛点三：防抄袭与考卷随机化机制（考核信度不足）
- **现象**：在多台集中式培训机并排考核，或班组排队考试时，后考的员工只要看一眼前面员工的屏幕，就能记住“第 1 张图点左上角、第 2 张图点右下角”，导致考核成绩虚高作弊。
- **改进建议**：
  - **题目乱序洗牌（Question Shuffling）**：同套试卷的幻灯片图片顺序在生成开考会话时由服务端随机排列。
  - **热区镜像/微扰动（可选高阶模式）**：对对称或可水平翻转的施工图纸，服务端随机以 50% 概率提供镜像翻转图和对应变换后的坐标，彻底废除记忆点击位置的作弊可能。

### 5.4 痛点四：弱网环境断点续考与离线暂存能力
- **现象**：厂区 Wi-Fi（尤其是钢结构重车间、高噪声机房、地下泵房）常有信号死角。如果学员答到第 8 题时网络抖动，客户端发送 `/click` 失败就会抛出异常，甚至引发考卷作废重来，导致工人和安环员抵触系统。
- **改进建议**：
  - 前端引入 **IndexedDB 点击事件离线队列**：网络暂时断开时，前端先本地缓存带有时间戳的点击坐标（`pending_clicks`），并在界面显示“离线暂存中”轻提示。
  - 待心跳探活恢复后，按时间戳原子批量补偿回传服务端（`POST /api/exam-sessions/:id/sync-batch`），确保考核流程平滑不中断。

### 5.5 痛点五：AI 辅助初标扩展接口（安环员效率倍增器）
- **现象**：安环员手动上传 100 张现场高清大图，每张图画 3~5 个框并选择条款，需要耗费数天时间，极大制约了题库扩充速度。
- **改进建议**：
  - 虽然产品定位保持 Local-First 不上公有云，但可预留**本地私有化视觉 AI 辅助标注插件接口**（如接入内网部署的轻量级 YOLO / Grounding DINO / Qwen-VL）。
  - 安环员点击“智能识别”，本地模型自动在图上预测候选框与推荐隐患类别，安环员只需点击“接受/微调”，制卷效率可提升 70% 以上。

---

## 6. 交互体验与人机工程学改进建议

### 6.1 LUXI 品牌设计规范深度收敛

目前系统在视觉上已确立了 LUXI CI 规范（鹿溪绿 `#0D5E42`、源启白 `#F5F7FA`、进化蓝 `#00D2FF`、琥珀色 `#F1C40F`），并在 `tailwind.config.js` 建立了 CSS 变量扩展。但经审查，各页面仍散落着大量 Tailwind 默认硬编码色（如 `bg-indigo-600`, `text-emerald-500`, `border-gray-200` 等）。

#### 收敛建议：
- 统一交互状态与组件 Token 规范：
  - **操作主按键**：一律使用 `bg-primary text-white hover:bg-primary-hover`（鹿溪绿体系）。
  - **隐患点/强调标识**：一律使用 `bg-gold text-slate-900`（琥珀金，对应警告与隐患特征）。
  - **数据高亮与链路**：一律使用 `text-cyan` 或 `border-cyan`（进化蓝）。
- 抽离全局原子组件库 `client/src/components/Ui/`：包括 `Button`, `Input`, `Select`, `Badge`, `Modal`, `Table`, `Drawer`，彻底杜绝在每个业务组件内反复复制样式。

### 6.2 现场标注中心（AnnotationEngine）人机工程学优化

安环员每天需要高强度使用标注画布，当前的交互存在以下效率卡点：
1. **连续标注属性继承**：
   当前画完一个框，必须重新在级联选择器中重新选一次场景、大类和细则。建议增加“**锁定当前条款（Pin Clause）**”开关，在同一张图上标注多个同类隐患时（如多处未戴安全帽），画框自动绑定当前条款。
2. **辅助对齐与十字标尺（Crosshair Cursor）**：
   支持全画布跟随的十字参考线与实时相对坐标百分比微调显示，提升微小构件（如仪表盘指针、继电器跳闸开关）的框选精度。
3. **图层遮挡调整**：
   当大热区包裹小热区时，支持热区 `z-index` 或上下层级置顶/置底，防止内层小隐患因外层大隐患遮挡而无法被学员点中。

### 6.3 学员端答题界面的多感官反馈与适老化/适工化设计

一线作业人员在车间使用强光平板答题时，面临屏幕反光、环境高分贝噪声等客观挑战：
1. **触觉与视觉强反馈**：
   - 当前的 800ms 涟漪特效偏弱。点中隐患建议增加显眼的靶心锁定雷达波纹与成功绿光波。
   - 误点时给予柔和的震动（若移动端支持 `navigator.vibrate`）和明确的黄色感叹号浮现。
2. **生命值/容错剩余显性化**：
   - 用直观的**3枚安环盾牌图标（Shields）**替代抽象的纯文本数字，每误点一次碎裂一枚盾牌，视觉压迫感与趣味性显著增强。

---

## 7. 安全合规、DevOps 与工程化运维

### 7.1 安全加固建议

| 威胁场景 | 现状风险 | 加固落地对策 |
| :--- | :--- | :--- |
| **暴力破解登录** | `/api/auth/login` 无频次限制 | 引入轻量级内存 Rate Limiter，同一 IP/用户名 5 分钟内连续输错 5 次口令自动锁定 15 分钟 |
| **越权调用管理接口** | 依赖 `session.gateApi`，部分路由需单独鉴权 | 在路由拆分后，将 `requireStaff` 显式挂载在整个 `/api/admin/*` 路由器入口，避免单一新接口遗漏中间件 |
| **大附件上传拒绝服务** | 上传虽然有限制，但缺乏图片尺寸/分辨率前置检查 | multer 限制单图最大 20MB，使用 `sharp` 对上传图片在入库时自动进行无损压缩与 EXIF 方向纠偏 |
| **SQL 注入与拼接** | 绝大多数使用了预编译参数，但少量动态 WHERE 存在隐患 | 严格禁止任何字符串拼接 SQL，动态条件一律采用命名参数或数组拼接参数（`...params`） |

---

### 7.2 自动化测试体系补全计划

目前仓库内测试仅覆盖了 14 个纯函数测试：
```text
server/test/
├── assetStem.test.js
├── examEngine.test.js
├── hitTest.test.js
├── parseCsv.test.js
├── scoring.test.js
└── zipStore.test.js
```

#### 测试覆盖提升矩阵：
1. **后端 API 集成测试套件**：
   - 补齐完整考核生命周期测试：创建用户 → 发布试卷 → 启动会话 → 模拟多点坐标 → 自动交卷 → 校验 `records` 与 `attempt_stats` 数据一致性。
   - 补齐权限拦截测试：未登录调用管理接口必须拒绝（401/403），访客试图携带 `userId` 必须拒绝（400）。
2. **前端组件快照与逻辑测试**：
   - 引入 Vitest + React Testing Library，对核心前端组件（`InteractionJudge` 画布相对坐标换算、`ExamLobby` 流程跳转）进行回归测试。
3. **CI 拦截强化**：
   - 在 `.github/workflows/ci.yml` 中加入代码规范检查（`eslint`）与测试覆盖率（Coverage > 80%）门禁。

---

## 8. 演进落地路线图与优先级实施矩阵

为了确保改进方案能够在不影响现有业务平稳运行的前提下有序交付，将改进工作划分为三个清晰迭代阶段（P0 / P1 / P2）：

```text
时间轴与迭代路线：
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  Phase 0: 基石加固   │ ───> │  Phase 1: 架构跃升   │ ───> │  Phase 2: 工业深化   │
│  (1~2 周 · 稳态修复)  │      │  (2~4 周 · 体验闭环) │      │  (4~8 周 · 赋能扩展) │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘
  · 数据库关键索引              · 后端上帝文件路由拆分         · 现场扫码开考体系
  · 最大余额法分值平滑          · 前端 API 请求统一收敛        · 弱网离线暂存续考
  · 僵尸依赖 lowdb 清理         · PRI/贝叶斯算法模型优化       · 异形多边形热区碰撞
  · 会话短缓存与限流            · 个人错题强化复训闭环         · 本地私有 Vision AI
```

### 8.1 实施任务分解与 DoD（Definition of Done）清单

#### Phase 0：基石加固（P0 · 立即执行 · 1~2 周）
- [ ] **T-P0-01 数据库联合索引迁移**：为 `records`, `users`, `user_profiles`, `exam_items` 追加联合索引，更新 `schema_version` 至 5。
  - *DoD*：5万条数据规模下，龙虎榜和出勤报表查询响应时间控制在 20ms 以内。
- [ ] **T-P0-02 最大余额法平滑分值计算**：重构 `scoring.js` 中的 `buildPointScoreMap`，替代原有末位堆积余数逻辑。
  - *DoD*：补充单元测试，验证任意总分与权重组合下，隐患点分差不超过 1 分且总分绝对吻合。
- [ ] **T-P0-03 依赖治理与工具链修正**：
  - 卸载 `lowdb`；
  - 评估平移 Vite 到稳定正式版本，清理冗余 `overrides`。
- [ ] **T-P0-04 内存会话缓存与登录防爆破限流**：
  - 为 `attachSession` 增加 5 秒内存 LRU 缓存；
  - 在 `/api/auth/login` 挂载登录失败频次限流。

#### Phase 1：架构与体验跃升（P1 · 建议次月落地 · 2~4 周）
- [ ] **T-P1-01 后端 `app.js` 路由域拆分**：
  - 将 1708 行的上帝文件拆分为 `routes/` 下的 8 个业务子路由（`assets`, `exams`, `knowledge`, `org`, `reports`, `analytics`, `system` 等）。
  - *DoD*：`app.js` 收敛至 120 行以内，全量现有 API 测试 100% 保持绿色通过。
- [ ] **T-P1-02 前端网络层清剿与 Zustand 引入**：
  - 彻底替换管理端各组件散落的 40+ 处原生 `fetch`，统一使用 `lib/api.js`；
  - 建立全局用户与系统配置状态 Store，减少 `App.jsx` 的状态冗余。
- [ ] **T-P1-03 核心算法模型调优**：
  - 重构 PRI 熟练度计算公式（消除误点双重惩罚，引入首中延迟时间）；
  - 贝叶斯掌握度融合 5×5 风险等级加权，优先在学情看板置顶“大险薄弱点”。
- [ ] **T-P1-04 错题本与弱项强化复训闭环**：
  - 学员端增加“错题本”入口，可一键针对个人历史错题发起“针对性复训”。

#### Phase 2：工业深化与智能化（P2 · 持续演进 · 4~8 周）
- [ ] **T-P2-01 现场扫码开考体系**：
  - 组卷中心一键生成试卷二维码，支持现场快速扫码开考。
- [ ] **T-P2-02 弱网容灾与断点续考**：
  - 客户端基于 IndexedDB 实现离线点击暂存与断网自动重试同步。
- [ ] **T-P2-03 几何多边形与带状热区支持**：
  - 标注中心支持 Polygon 拖拽顶点绘制，提升异形与狭长隐患的碰撞精度。
- [ ] **T-P2-04 本地轻量级 Vision AI 辅助标注扩展插件**：
  - 预留私有化部署视觉模型的推理接口，实现图库上传后一键生成候选标注。

---

*编制团队：鹿溪联合创新实验室（LUXI Joint Innovation Lab）· 审微（SafeSpot）架构与工程审计组*  
*真源状态：已定稿 · 供后续开发排期基线使用*
