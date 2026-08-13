# SafeSpot 架构

> 现行实现 + 目标 Web 架构。历史 JSON sidecar / Electron 方案见 `archive/`。  
> 约束：**Local-First · 零外部数据库进程 · 相对坐标 · 条款引用 · Web 单进程交付**。

---

## 1. 形态

```text
                    厂区浏览器（Chrome / Edge）
                    #/play 学员    #/admin 管理
                              │
                              │  HTTP（开发：Vite 代理；生产：同源）
                              ▼
                    ┌─────────────────────┐
                    │  Node.js 进程        │
                    │  Express             │
                    │  · /api/*            │
                    │  · /assets/raw/*     │
                    │  · 生产：托管 dist   │
                    └─────────┬───────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
     server/data/safeeye.db          server/data/assets/raw/
     （better-sqlite3 · WAL）         现场图文件
```

开发时为两个进程（Vite `:5173` → 代理 API `:3000`），**生产必须收成一个端口**（`PLAN.md` W1-C）。

不引入 MySQL / Redis / 对象存储。会话可先放 SQLite 表，避免再加进程。

---

## 2. 代码地图（现状）

```text
SafeEYE/
├── client/src/
│   ├── App.jsx                 Hash：play | admin
│   ├── components/Admin/       标注、组卷、知识、人员、报表、学情、巡检
│   ├── components/User/        判题、龙虎榜
│   └── lib/                    hitTest · scoring · grade · *Auth
└── server/src/
    ├── app.js                  全部 HTTP（目标：拆路由）
    ├── db.js                   建表、种子、旧 JSON 迁移
    ├── auth.js                 scrypt 密码
    └── analytics.js            PRI 与学情聚合
```

前端无路由库、无全局状态库、无统一 API 封装。管理子页只在内存 `adminTab`，刷新回到图库。

---

## 3. 数据模型

核心表：

| 表 | 作用 |
|----|------|
| `assets` / `annotations` | 图与热区（0~1 坐标，`clause_id`） |
| `knowledge_scenes` / `_categories` / `_items` | 知识 L1–L3 |
| `risk_dictionary` | 可能性 × 后果 |
| `exams` / `exam_items` | 试卷；`settings` JSON：总分、规则、限时 |
| `records` | 交卷；`exam_name` 快照；`session_log` |
| `organizations` / `departments` / `users` / `user_profiles` | 组织 |
| `attempt_stats` / `knowledge_error_facts` | 学情物化 |

已知缺陷（W1/W2 修）：

- 未执行 `PRAGMA foreign_keys = ON`，声明的 CASCADE 不生效
- 无 `schema_version`，迁移靠 `ALTER` 吞错
- `exams.id` 目前等于卷名，发布用 `INSERT OR REPLACE`
- `records` 与物化表不在同一事务

目标增量：

- `sessions`：服务端登录会话
- `exam_sessions`：一次开考（卷、人、模式、开始时间、命中集合）
- `schema_version`
- `audit_log`（W3）
- `assignments`（W2）
- 发布时 `exam_items.item_meta` 冻结权重与条款

---

## 4. 请求流

### 4.1 现行（W1）

```text
登录 → Set-Cookie（httpOnly，auth_sessions）
开考 → POST /api/exam-sessions（身份取自会话或访客姓名）
每次点击 → POST 坐标 → 服务端 hit-test → 只回本点结果
交卷 → 服务端按快照计分 → records + 物化（同一事务）
```

正式考核：题目图可下发，**未揭晓前不下发热区坐标**。练习可提示题量。  
`POST /api/session/record` 仍保留给已登录培训师，学员成绩必须走开考会话。

管理接口需 `admin` / `trainer` 会话。PIN 仅开发引导，会写成管理员会话。

---

## 5. 计分

权威实现：`server/src/scoring.js`、`server/src/hitTest.js`、`server/src/examEngine.js`。前端 `lib/scoring.js` 仅作组卷预览镜像。

- **加权**：各点 `scoreWeight` 占比 × 卷面总分，最后一点吃余数，总和精确等于总分
- **均分**：总分整除到点，余数分给前面的点
- **等第**：得分率 ≥90 优 / ≥75 良 / ≥60 中 / 否则差
- **容错**：每题默认 3 次无效点击后揭晓（练习可更宽；正式揭晓仍不计未点中的分）

PRI 与学情见 [ANALYTICS.md](./ANALYTICS.md)。

---

## 6. 前端约定

- 坐标：`x,y,w,h ∈ [0,1]`，相对 `<img>` 内容盒
- 矩形 AABB；圆形按椭圆方程
- 开发代理：`vite.config.js` 把 `/api`、`/assets` 转到后端
- 生产：相对路径 `/api`，与页面同源

Hash 路由保留（`#/play`、`#/admin/...`），避免静态托管还要配置 history fallback 以外的规则；生产仍提供 `index.html` fallback 以兼容无 hash 书签。

---

## 7. 安全模型（目标）

| 层 | 做法 |
|----|------|
| 传输 | 本机 HTTP 可接受；内网跨机建议反代 HTTPS（实施文档说明，应用不强制证书） |
| 认证 | 密码 scrypt（已有）；会话随机 ID + 过期 |
| 授权 | 中间件按 `role`；学员 API 不能写题库 |
| 绑定 | 默认回环；显式 `HOST` 才听网卡 |
| 上传 | 类型白名单 + 大小限制 + 目录约束 |
| 成绩 | 服务端计算；访客无 `user_id` |
| 数据 | 库与图片在磁盘；备份即拷贝这两个位置 |

威胁假设：内网同事可能打开 DevTools。因此「藏坐标」只能提高成本，**权威分数必须在服务端**。

---

## 8. 工程边界

| 要 | 不要 |
|----|------|
| Express + better-sqlite3 + 静态 SPA | 再引入第二个数据库 |
| 一个生产进程 | 必须再跑 Vite 才能给员工用 |
| 可选 Docker | 当作桌面安装程序分发 |
| 结构化日志 + health | 无请求 ID 的裸 `console` 长期堆积 |

观测：保留 `/api/health`（db、资源目录、版本）。W3 补审计表，不引入外部 APM。
