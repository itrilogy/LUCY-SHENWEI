# SafeSpot 学情分析与统计模块设计

> **状态**：设计稿（待实现）  
> **关联现状**：`records.session_log`、成绩报表薄弱点 Top、知识三级树、组织/用户  
> **日期**：2026-07-16

---

## 0. 先澄清：薄弱点里的 `unknown` 是什么

### 0.1 现状事件类型

答题过程写入 `session_log` 的三类事件：

| `result` | 含义 | 是否绑定知识条款 |
|----------|------|------------------|
| `hit` | 点中某隐患点 | 有 `itemId` / `clauseId` |
| **`miss`** | **空白处无效点击（容错误点）** | **无条款**（只有 `x,y`） |
| `unfound` | 交卷时仍未找出的隐患 | 有 `itemId` / `clauseId` |

当前薄弱点聚合逻辑把 `miss` / `missed` / `unfound` **混在一起**，`miss` 没有 `clauseId`，于是落入 key=`unknown`。

### 0.2 结论

- **`unknown` ≠ 知识薄弱点**  
- **`unknown` = 识别噪声 / 扫描效率问题**（乱点、目标不清晰、热区过小、不熟练）  
- 应 **从「知识薄弱 Top」中剔除 `miss`**，单独进入 **「熟练度 / 点击质量」** 指标。

### 0.3 立即修正原则（实现时）

```text
知识薄弱分析  ← 仅 unfound（+ 可选：超时未点到的点）
点击质量分析  ← 仅 miss（无效点击）
综合学情     ← 两者加权，但分开展示结论
```

---

## 1. 模块目标

在 **Local-First** 前提下，回答培训管理者三类问题：

1. **谁不行？**（用户 / 部门）  
2. **哪里不行？**（知识 L1 场景 / L2 大类 / L3 细则）  
3. **怎么不行？**（知识盲区 vs 识别不熟练 / 乱点）

输出：**分布图表 + 可解释的文字结论**（规则引擎优先，LLM 可选）。

---

## 2. 分析维度模型

### 2.1 维度树

```text
                    ┌─ 用户 (user_id / guest_name)
分析切片 ──────────┼─ 部门 (department_id，可上卷父部门)
                    └─ 知识
                         L1 场景 (knowledge_scenes)
                         L2 大类 (knowledge_categories)
                         L3 细则 (knowledge_items / clause_id)
```

### 2.2 时间与范围过滤器

| 过滤器 | 说明 |
|--------|------|
| 时间窗 | 最近 7/30/90 天 或 自定义 |
| 试卷 | 单卷 / 多卷 / 全部（含已删卷，靠 `exam_id`+`exam_name`） |
| 模式 | 仅 `exam` 默认；可选含 `practice` |
| 部门 | 本级 or 含子部门（树展开） |

### 2.3 一次答题的原子事实（建议标准化 session_log）

**现行日志需升级 schema**（兼容旧数据）：

```jsonc
// v2 事件
{
  "v": 2,
  "t": 1710000000123,          // ms
  "type": "click" | "reveal" | "submit",
  "result": "hit" | "miss" | "unfound",
  "x": 0.42, "y": 0.31,        // 仅 click
  "slideId": "xxx.png",
  "itemId": "anno-...",        // hit/unfound
  "clauseId": "JB-01",         // hit/unfound → 可 join L1/L2/L3
  "scoreDelta": 33,            // hit 时
  "missIndex": 2               // 本题第几次 miss（1..MAX_MISS）
}
```

交卷时另写 **attempt 摘要**（可冗余落库，便于查询）：

```jsonc
{
  "attemptId": 123,
  "userId": "...",
  "departmentId": "...",
  "examId": "...",
  "mode": "exam",
  "score": 67,
  "paperTotal": 100,
  "durationMs": 180000,
  "hazardsTotal": 9,
  "hazardsHit": 6,
  "hazardsUnfound": 3,
  "invalidClicks": 5,     // miss 次数
  "firstHitLatencyMs": 4200,
  "avgHitLatencyMs": 8900
}
```

> 实现策略：短期可 **查询时从 session_log 现算**；数据量上来后做 `attempt_stats` 物化表。

---

## 3. 指标体系

### 3.1 成绩层（Outcome）

| 指标 | 公式 | 用途 |
|------|------|------|
| 得分率 | \( S = score / paperTotal \) | 通关、排名 |
| 通过率 | \( P = \#\{S \ge 0.6\} / N \) | 部门对比 |
| 等第分布 | 优/良/中/差计数 | 结构 |

### 3.2 知识掌握层（Knowledge）— 绑定 L1/L2/L3

对每个 `clauseId`（L3）在时间窗内：

| 指标 | 公式 |
|------|------|
| 暴露次数 \(E\) | 该点出现在试卷中的答题次数（attempt 含该 hazard） |
| 命中次数 \(H\) | `result=hit` 且 clauseId 匹配 |
| 遗漏次数 \(U\) | `result=unfound` |
| **遗漏率** | \( r_u = U / E \)（\(E=0\) 则不参与） |
| **掌握度** | \( M = 1 - r_u \) 或贝叶斯平滑见下 |

**贝叶斯平滑（小样本）**：

\[
M' = \frac{H + \alpha}{E + \alpha + \beta}
\quad (\text{建议 } \alpha=1,\ \beta=1)
\]

上卷到 L2 / L1：对子节点 \(E,H,U\) **加总** 再算 \(r_u\)，不要对率做简单平均。

### 3.3 识别熟练度层（Proficiency）— 来自 `miss`

无效点击是「扫描/判断效率」信号，**不进知识薄弱榜**。

#### 3.3.1 单次 attempt 点击质量

定义：

- \(C_{miss}\)：无效点击次数  
- \(C_{hit}\)：有效命中次数  
- \(C = C_{miss} + C_{hit}\)：有效操作总点击（不含 UI 按钮）  
- \(H_{tot}\)：本题卷隐患总数  
- \(T\)：用时（秒）  
- \(MAX\_MISS\)：单题容错上限（现状 3，可配置）

**无效点击率（越低越好）**：

\[
R_{miss} = \frac{C_{miss}}{C_{miss} + C_{hit} + \varepsilon}
\quad (\varepsilon=10^{-6})
\]

**浪费容错比（相对容错额度）**：

设全卷有 \(n\) 张图，理论最大无效点击 \(C_{miss}^{max} \approx n \times MAX\_MISS\)（到上限后揭晓不再点）：

\[
W = \frac{C_{miss}}{n \times MAX\_MISS}
\quad \text{截断到 } [0,1]
\]

**命中效率（单位时间有效发现）**：

\[
\eta = \frac{C_{hit}}{\max(T, 1)}
\quad (\text{hits per second})
\]

归一到 0~1（用分位或 logistic）：

\[
\eta' = \frac{1}{1 + e^{-k(\eta - \eta_0)}}
\]

经验默认：\(\eta_0 = 0.02\)（约 50s 一个点）、\(k=80\)。亦可按本企业历史中位数标定。

#### 3.3.2 危险识别熟练度指数 PRI（Point Recognition Index）

**单次 attempt**：

\[
\begin{aligned}
PRI_{att} &= 100 \times \big(
  w_1 \cdot M_{hit}
  + w_2 \cdot (1 - W)
  + w_3 \cdot \eta'
  + w_4 \cdot (1 - R_{miss})
\big) \\
M_{hit} &= C_{hit} / H_{tot}
\end{aligned}
\]

推荐权重（可配置，和为 1）：

| 权重 | 含义 | 默认 |
|------|------|------|
| \(w_1\) | 找全率（会不会找） | 0.40 |
| \(w_2\) | 容错浪费（稳不稳） | 0.25 |
| \(w_3\) | 速度效率 | 0.15 |
| \(w_4\) | 点击纯度（少乱点） | 0.20 |

**解读刻度**：

| PRI | 标签 | 培训含义 |
|-----|------|----------|
| ≥85 | 熟练 | 识别快且准，少乱点 |
| 70–84 | 良好 | 能找全，偶有试探点击 |
| 55–69 | 一般 | 依赖容错/试探，需针对性练习 |
| <55 | 生疏 | 乱点多或大量遗漏，需带教复盘 |

#### 3.3.3 用户 / 部门聚合熟练度

对用户最近 \(N\) 次正式考核（建议 \(N=5\) 或 30 天）：

\[
PRI_{user} = \frac{\sum_i e^{-\lambda \Delta t_i} \cdot PRI_{att,i}}{\sum_i e^{-\lambda \Delta t_i}}
\]

- \(\Delta t_i\)：距今天数  
- \(\lambda \approx 0.05\)：近考权重大  

部门：对该部门用户 \(PRI_{user}\) 做 **人数加权平均**（或中位数，抗极值）。

#### 3.3.4 与「知识薄弱」解耦的矩阵

|  | 高掌握 \(M'\) | 低掌握 \(M'\) |
|--|---------------|---------------|
| **高 PRI** | 优秀员工 | 「懂但卷子没练到」或题库覆盖偏 |
| **低 PRI** | **会做但手生/紧张乱点** → 练扫描节奏 | **双弱** → 优先知识培训 + 跟练 |

这是结论引擎的核心 2×2。

---

## 4. 错误分布设计

### 4.1 知识错误分布（L1/L2/L3）

对每个层级节点输出：

```text
{
  level: "L1"|"L2"|"L3",
  id, name,
  exposure E, hits H, unfound U,
  missRate Ru, mastery M',
  riskWeightAvg,          // 可选：关联风险矩阵权重
  severityScore: Ru * riskWeightAvg
}
```

**排序默认**：`severityScore` 降序（既常错又高风险优先），而不是纯次数。

### 4.2 组织错误分布

- 部门热力：部门 × L1 场景 的 \(R_u\) 矩阵  
- 用户雷达：个人在各 L1 的 \(M'\)  
- 对比：部门 \(M'\) vs 全公司 \(M'\) 差值（百分点）

### 4.3 无效点击分布（熟练度侧）

- 按用户：平均 \(C_{miss}\)、\(R_{miss}\)、\(PRI\)  
- 按试卷/图片：哪张图诱发无效点击最多（图难/标注热区问题）  
- **不要**把 miss 归到某个 L3，除非做「最近邻隐患归因」（见 §6 可选增强）

---

## 5. 分析结论引擎（规则优先）

每条结论 = `级别` + `对象` + `证据` + `建议`。

### 5.1 模板示例

**知识类**

1. 若某 L3 的 \(E \ge 5\) 且 \(R_u \ge 0.4\)：  
   > 「细则《…》遗漏率 40%（n=…），建议组织专项复训。」

2. 若某部门在 L1「高处坠落」\(M'\) 低于公司 15pt：  
   > 「XX 部在【高处坠落】掌握度显著偏低，建议班组案例复盘。」

**熟练度类**

3. 若用户 \(PRI < 55\) 且 \(M' \ge 0.7\)：  
   > 「知识掌握尚可，但无效点击偏高（平均 x 次/卷），建议限时扫描练习，减少试探点击。」

4. 若 \(PRI < 55\) 且 \(M' < 0.5\)：  
   > 「知识与识别双弱，建议先练 1 套练习模式再考核。」

**数据质量类**

5. 若某图 \(C_{miss}\) 中位数异常高：  
   > 「图片/热区可能不清，建议检查标注框尺寸与图质。」

### 5.2 输出结构（API）

```jsonc
{
  "filters": { "from": "...", "to": "...", "deptId": null },
  "summary": {
    "attempts": 120,
    "passRate": 0.72,
    "avgScoreRate": 0.78,
    "avgPRI": 71.2
  },
  "knowledge": {
    "L1": [ /* ... */ ],
    "L2": [ /* ... */ ],
    "L3": [ /* ... */ ]
  },
  "org": {
    "departments": [ /* mastery + PRI */ ],
    "users": [ /* top risk / top excellent */ ]
  },
  "proficiency": {
    "distribution": { "熟练": 12, "良好": 30, "一般": 18, "生疏": 7 },
    "highMissUsers": [ /* ... */ ]
  },
  "insights": [
    { "level": "warn", "code": "KNOWLEDGE_GAP", "text": "...", "refs": {} }
  ]
}
```

---

## 6. 可选增强：无效点击的「邻近归因」

若希望 miss 也挂钩知识（谨慎）：

1. 点击 \((x,y)\) 与各未命中框中心距离（椭圆归一距离）  
2. 若距离 \(< \delta\)（如 0.08）记为 **near-miss → 该 clause 的「差一点」**  
3. 否则记为 **pure-miss（全局扫描噪声）**

\[
\text{nearMiss}_{clause} \text{ 可轻微降低 } M' \text{（权重低于 unfound）}
\]

**不建议**把 pure-miss 硬塞进 L3 排行。

---

## 7. 数据模型增量（实现清单）

### 7.1 表（建议）

```sql
-- 可选物化，加速报表
CREATE TABLE IF NOT EXISTS attempt_stats (
  record_id INTEGER PRIMARY KEY,
  user_id TEXT,
  department_id TEXT,
  exam_id TEXT,
  mode TEXT,
  score REAL,
  paper_total REAL,
  duration_ms INTEGER,
  hazards_total INTEGER,
  hazards_hit INTEGER,
  hazards_unfound INTEGER,
  invalid_clicks INTEGER,
  pri REAL,
  score_rate REAL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS knowledge_error_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER,
  user_id TEXT,
  department_id TEXT,
  clause_id TEXT,      -- L3
  category_id TEXT,    -- L2
  scene_id TEXT,       -- L1
  outcome TEXT,        -- hit | unfound | near_miss
  completed_at INTEGER
);
```

交卷时异步/同步写入 facts，报表只扫 facts。

### 7.2 API 草案

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/admin/analytics/summary` | 总览 KPI |
| GET | `/api/admin/analytics/knowledge` | L1/L2/L3 错误分布 |
| GET | `/api/admin/analytics/org` | 部门/用户对比 |
| GET | `/api/admin/analytics/proficiency` | PRI / miss 分布 |
| GET | `/api/admin/analytics/insights` | 文字结论列表 |
| GET | `/api/admin/analytics/export.csv` | 导出明细 |

### 7.3 前端模块信息架构

```text
管理端 → 学情分析
  ├─ 总览看板（通过率、均分、均 PRI）
  ├─ 知识薄弱（L1 图 / L2 表 / L3 Top，不含 miss）
  ├─ 组织对比（部门柱状 + 用户列表）
  ├─ 识别熟练度（PRI 分布、高无效点击名单）
  └─ 智能结论（insights 卡片）
```

与现「成绩报表」关系：  
- **成绩报表** = 流水账 + 导出  
- **学情分析** = 聚合指标 + 结论  

---

## 8. 与现网改造的最小补丁（Phase A，1–2 天）

在不动大架构前先修「unknown」与双轨统计：

1. **薄弱点 API**：只统计 `unfound`（或 unfound+near_miss）  
2. **新增「无效点击」卡片**：人均 miss、高 miss 用户  
3. **session_log 写入**补全 `clauseId` 于 hit；miss 明确 `result:"miss", kind:"invalid_click"`  
4. 报表文案：  
   - 知识薄弱 ≠ 容错点击  

---

## 9. 推荐实现分期

| 阶段 | 内容 | 产出 |
|------|------|------|
| **A** | 修正 weak-items；miss 单独指标；日志规范化 | 无 unknown 脏数据 |
| **B** | attempt 现算 PRI；学情总览 + L1/L2/L3 分布 | 可用的分析页 |
| **C** | facts 物化表；部门树聚合；insights 规则引擎 | 可对账、可导出 |
| **D** | near-miss 归因；趋势曲线；可选 LLM 润色结论 | 增强解释性 |

---

## 10. 参数默认值汇总（可配置）

| 参数 | 默认 | 说明 |
|------|------|------|
| 通过线 | 0.60 | 与等第一致 |
| \(w_1..w_4\) | 0.40 / 0.25 / 0.15 / 0.20 | PRI 权重 |
| \(\alpha,\beta\) | 1, 1 | 掌握度平滑 |
| \(\lambda\) | 0.05 | 时间衰减 |
| MAX_MISS | 3 | 单题容错 |
| near-miss \(\delta\) | 0.08 | 可选 |

---

## 11. 一句话产品定义

> **学情分析 = 知识掌握度（unfound→L1/L2/L3）× 组织切片 + 识别熟练度（miss→PRI）+ 规则化结论。**  
> 容错无效点击进入熟练度，不进入知识薄弱 Top，从而消灭 `unknown` 伪薄弱项。
