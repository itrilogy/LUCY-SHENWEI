# SafeSpot 学情分析：完整算法分析模型

> **文档类型**：算法与产品交互专用设计  
> **版本**：v1.0  
> **适用范围**：管理端「学情分析」模块  
> **数据底座**：`records` + `attempt_stats` + `knowledge_error_facts` + 组织树 + 知识三级树  
> **最后更新**：2026-07-16

---

## 1. 问题定义与分析目标

### 1.1 业务问题

| # | 问题 | 分析切片 |
|---|------|----------|
| Q1 | 某张试卷考得怎样？ | **试卷分析** |
| Q2 | 某个部门（含下级）整体怎样？ | **部门分析** |
| Q3 | 某部门在某试卷上怎样？ | **试卷 × 部门** |
| Q4 | 错在知识哪一层？ | L1 场景 / L2 大类 / L3 细则 |
| Q5 | 是不会，还是手生乱点？ | 知识掌握 vs 识别熟练度 PRI |

### 1.2 设计原则

1. **双轨分离**：知识遗漏（`unfound`）≠ 无效点击（`miss`）。  
2. **组织可上卷**：选中部门时，默认包含其**全部子孙部门**的成绩。  
3. **小样本可解释**：掌握度使用贝叶斯平滑；结论必须带样本量。  
4. **Local-First**：全部指标本地 SQLite 可算，无需外部服务。  
5. **过滤可组合**：试卷、部门正交；空选 = 全量。

---

## 2. 数据模型与事件语义

### 2.1 原始过程日志 `session_log`（v2）

```jsonc
// 有效命中
{ "v":2, "t":..., "type":"click", "result":"hit", "clauseId":"JB-01", "itemId":"anno-..", "x":0.2, "y":0.3, "scoreDelta":33, "slideId":"a.png" }

// 容错无效点击（不进知识薄弱）
{ "v":2, "t":..., "type":"click", "result":"miss", "kind":"invalid_click", "x":0.5, "y":0.5, "missIndex":1, "slideId":"a.png" }

// 交卷遗漏（进知识薄弱 L1/L2/L3）
{ "v":2, "t":..., "type":"submit", "result":"unfound", "clauseId":"JB-09", "itemId":"anno-..", "label":"..." }
```

### 2.2 物化表

**`attempt_stats`**（一场考试一行）

| 字段 | 含义 |
|------|------|
| score_rate | \(S = score / paper\_total\) |
| hazards_hit / unfound / total | 找全结构 |
| invalid_clicks | miss 次数 |
| pri | 识别熟练度指数 |
| r_miss, waste_ratio | 点击质量中间量 |
| user_id, department_id, exam_id | 过滤维度 |
| completed_at | 时间 |

**`knowledge_error_facts`**（每个 hit/unfound 一条，**不含 miss**）

| 字段 | 含义 |
|------|------|
| clause_id | L3 |
| category_id | L2 |
| scene_id | L1 |
| outcome | `hit` \| `unfound` |
| weight | 风险/分值权重 |

### 2.3 知识层级映射

```text
knowledge_scenes (L1)
  └── knowledge_categories (L2)
        └── knowledge_items / clause_id (L3)
              └── annotations.clause_id 绑定
```

---

## 3. 过滤模型（试卷 / 部门 / 组合）

### 3.1 过滤状态机

| 用户选择 | 语义 | 记法 |
|----------|------|------|
| 试卷=空，部门=空 | 全库正式考核 | \(\mathcal{F}=\emptyset\) |
| 试卷=E，部门=空 | **试卷分析** | \(\mathcal{F}=\{exam=E\}\) |
| 试卷=空，部门=D | **部门分析**（含 D 及子孙） | \(\mathcal{F}=\{dept\in Desc(D)\}\) |
| 试卷=E，部门=D | **试卷+部门** | \(\mathcal{F}=\{exam=E,\ dept\in Desc(D)\}\) |

其中 \(Desc(D)=\{D\}\cup\) 所有以 D 为祖先的部门。

### 3.2 部门层级展开算法

**输入**：部门表 `id, parent_id`，选中节点 \(D\)。

```text
function expandDepartment(D):
  children map: parent_id → [child_ids]
  result = []
  stack = [D]
  while stack not empty:
    x = stack.pop()
    result.append(x)
    stack.push(...children[x])
  return result   // 含 D 自身
```

**SQL 过滤**（展开后）：

```sql
WHERE department_id IN (?, ?, ...)   -- Desc(D)
  AND exam_id = ?                    -- 若选了试卷
  AND COALESCE(mode,'exam') = 'exam'
```

**边界**：

- 成绩 `department_id` 为空：仅在「全部部门」时计入；选中具体部门时**不计入**（避免脏数据污染部门切片）。  
- 访客无 `user_id`：按 `user_name` 聚合到「访客」桶，仍可通过 `department_id` 进部门分析。  
- 已删试卷：仍可用 `exam_id` + `exam_name` 快照做试卷分析。

### 3.3 三种分析模式的输出差异

| 模式 | 主看板强调 | 对比对象 |
|------|------------|----------|
| 试卷分析 | 该卷通过率、L3 薄弱、该卷 PRI 分布 | 可对比「全库均分」 |
| 部门分析 | 部门 PRI/得分、下级部门拆解、人员名单 | 可对比「全公司」 |
| 试卷+部门 | 该部门在该卷上的专属指标与结论 | 该卷全体 / 该部门其他卷（可选） |

---

## 4. 核心算法

### 4.1 单场汇总（attempt）

从 `session_log`：

\[
\begin{aligned}
C_{hit} &= \#\{result=hit\} \\
C_{miss} &= \#\{result=miss\} \\
C_{unf} &= \#\{result=unfound\} \\
H_{tot} &= hazardsTotal\ \text{或}\ C_{hit}+C_{unf} \\
R_{miss} &= \frac{C_{miss}}{C_{miss}+C_{hit}+\varepsilon} \\
W &= \min\!\left(1,\ \frac{C_{miss}}{n_{slide}\times MAX\_MISS}\right) \\
M_{hit} &= C_{hit}/H_{tot} \\
\eta &= C_{hit}/\max(T_{sec},1) \\
\eta' &= \sigma(k(\eta-\eta_0)),\quad \sigma(z)=\frac{1}{1+e^{-z}}
\end{aligned}
\]

默认：\(MAX\_MISS=3,\ k=80,\ \eta_0=0.02,\ \varepsilon=10^{-6}\)。

### 4.2 识别熟练度 PRI

\[
PRI = 100 \times \big(
  w_1 M_{hit} + w_2 (1-W) + w_3 \eta' + w_4 (1-R_{miss})
\big)
\]

| 权重 | 默认 | 含义 |
|------|------|------|
| \(w_1\) | 0.40 | 找全率 |
| \(w_2\) | 0.25 | 容错不浪费 |
| \(w_3\) | 0.15 | 速度 |
| \(w_4\) | 0.20 | 点击纯度 |

**刻度**：≥85 熟练 / 70–84 良好 / 55–69 一般 / <55 生疏。

### 4.3 知识掌握（L3 → L2 → L1）

对节点集合 \(\mathcal{N}\)（某 clause / category / scene）：

\[
\begin{aligned}
E &= \#facts\ \text{in}\ \mathcal{N} \\
H &= \#\{outcome=hit\} \\
U &= \#\{outcome=unfound\} \\
R_u &= U/E \\
M' &= \frac{H+\alpha}{E+\alpha+\beta},\quad \alpha=\beta=1 \\
Severity &= R_u \times \overline{weight}
\end{aligned}
\]

**上卷规则**：L2/L1 对子节点 **加总 E,H,U 再算率**，禁止对子节点 \(R_u\) 做简单平均。

**排序**：默认按 \(Severity\) 降序（常错 × 高权重优先）。

### 4.4 聚合到用户 / 部门

用户 \(u\) 在过滤 \(\mathcal{F}\) 下的 \(N\) 场 attempt：

\[
\begin{aligned}
\overline{PRI}_u &= \frac{1}{N}\sum PRI_i \\
\overline{S}_u &= \frac{1}{N}\sum S_i \\
Pass_u &= \#\{S_i\ge 0.6\}/N \\
\overline{C}_{miss,u} &= \frac{1}{N}\sum C_{miss,i}
\end{aligned}
\]

部门 \(D\)（已展开 \(Desc(D)\) 内用户）：

\[
\overline{PRI}_D = \frac{1}{|U_D|}\sum_{u\in U_D}\overline{PRI}_u
\]

（人数平均；亦可用 attempt 加权，实现中默认人数平均，抗「一人刷卷」。）

### 4.5 象限（结论用）

|  | \(\overline{S}\ge 0.7\) | \(\overline{S}<0.7\) |
|--|-------------------------|----------------------|
| \(\overline{PRI}\ge 70\) | 优秀 | 熟练但知识缺口 |
| \(\overline{PRI}<70\) | 会但手生 | 双弱 |

### 4.6 规则结论引擎（摘要）

| 规则 | 条件 | 话术要点 |
|------|------|----------|
| SUMMARY | 有数据 | 次数/通过率/均分/均 PRI |
| KNOWLEDGE_GAP_L3 | \(E\ge3,\ R_u\ge0.4\) | 某细则遗漏率高，建议复训 |
| DEPT_BELOW | 部门 \(\overline{S}\) 低于整体 ≥15pt | 部门落后 |
| RUSTY_USER | 象限=会但手生 | 练扫描、减乱点 |
| DUAL_WEAK | 象限=双弱 | 先练习后考核 |
| HIGH_MISS_GLOBAL | 人均 miss ≥4 | 热区/操作规范 |

试卷模式下追加：`EXAM_FOCUS`（本卷相对全库）。  
部门模式下追加：`DEPT_CHILD_SPLIT`（若有子部门，指出最弱子部门）。

---

## 5. 三种分析模式的计算规格

### 5.1 试卷分析 \(\mathcal{F}=\{exam=E\}\)

**KPI**

- 参考人数 / 考核次数  
- 通过率、均分率、均 PRI  
- 人均无效点击  

**分布**

- 本卷 L1/L2/L3 错误分布  
- 本卷 PRI 刻度直方图  
- 本卷得分率直方图（可选）  
- 参与部门对比（哪些部门考了这卷）  

**结论焦点**：本卷最难 L3、本卷是否诱发高 miss（图质/热区）。

### 5.2 部门分析 \(\mathcal{F}=\{dept\in Desc(D)\}\)

**KPI**

- 覆盖人数、attempt 数  
- 部门均 PRI / 均分 / 通过率  
- 与全公司差值 \(\Delta S,\ \Delta PRI\)  

**分布**

- 直接子部门对比柱图（仅一层子节点，便于管理）  
- 部门内人员 PRI/得分表  
- 该部门 L1 薄弱雷达/柱图  

**结论焦点**：最弱子部门、双弱名单、知识场景短板。

### 5.3 试卷 + 部门 \(\mathcal{F}=\{exam=E,\ dept\in Desc(D)\}\)

**KPI**：同上，但样本限定双条件。

**额外对比（推荐展示）**

| 对比项 | 计算 |
|--------|------|
| 本部门·本卷 vs 本卷全体 | \(\overline{S}_{D,E} - \overline{S}_{*,E}\) |
| 本部门·本卷 vs 本部门全卷 | \(\overline{S}_{D,E} - \overline{S}_{D,*}\) |

**结论焦点**：「XX 部在《卷名》上的专属问题」。

---

## 6. UI 交互设计

### 6.1 信息架构

```text
┌─────────────────────────────────────────────────────────────┐
│ 学情分析                                                      │
├──────────────┬──────────────────────────────────────────────┤
│ 筛选面板      │  结果区                                        │
│              │  ┌──────────────────────────────────────────┐ │
│ ○ 分析范围    │  │ KPI 四宫格                                 │ │
│  [试卷列表]   │  └──────────────────────────────────────────┘ │
│  [部门树]     │  [总览|知识|组织|熟练度|图表]                    │
│  ☑ 含子部门   │  ┌──────────────────────────────────────────┐ │
│              │  │ 图表 + 表格 + 结论卡片                      │ │
│  [开始分析]   │  └──────────────────────────────────────────┘ │
│  [重置]       │                                                │
│              │                                                │
│ 当前切片摘要  │                                                │
│ 试卷：…      │                                                │
│ 部门：…+N子  │                                                │
└──────────────┴──────────────────────────────────────────────┘
```

### 6.2 筛选面板交互

| 控件 | 行为 |
|------|------|
| **试卷列表** | 单选；含「全部试卷」；已删卷标记 `[已删]` + 成绩条数 |
| **部门树** | 单选节点；缩进展示层级；「全部部门」 |
| **含子部门** | 默认勾选；取消则仅统计该节点 `department_id` 精确匹配 |
| **开始分析** | 主按钮；点击后拉取 `/overview`；loading 态 |
| **重置** | 清空试卷/部门为全部，自动刷新 |
| 快捷模式标签 | 点击「仅试卷 / 仅部门 / 组合」仅作提示，不强制 |

**空选逻辑**

- 未点「开始分析」前：可显示上次结果或空态引导。  
- 实现策略：进入页自动用「全部」分析一次；改筛选后需点 **开始分析**（避免树点击频繁请求）。也可「选择即分析」——本实现采用 **显式按钮**，可控、可预期。

### 6.3 结果区 Tab

| Tab | 内容 |
|-----|------|
| 总览结论 | KPI + insights + 薄弱 Top5 |
| 知识分布 | L1/L2/L3 表 + 柱图 |
| 组织对比 | 部门/用户表 + 对比柱图 |
| 识别熟练度 | PRI 分布 + 高 miss 列表 |
| 图表看板 | 集中图表（得分率、PRI、L1、子部门） |

### 6.4 图表清单（无外部重依赖，SVG 实现）

| 图表 | 数据 | 使用场景 |
|------|------|----------|
| 水平柱图 | L1 遗漏率 Top | 试卷/组合 |
| 水平柱图 | L3 严重度 Top8 | 全模式 |
| 分组柱图 | PRI 四档人数 | 熟练度 |
| 水平柱图 | 子部门均 PRI / 均分 | 部门分析 |
| 对比条 | 本切片 vs 全库 KPI | 有过滤时 |
| 简易环形/堆叠 | 通过/未通过 | 总览 |

### 6.5 空态与错误态

- 无成绩：引导去开考。  
- 有试卷无该部门成绩：提示「该部门在此卷下无交卷记录」。  
- 加载失败：红字 + 重试。

### 6.6 交互状态

```text
[选试卷] [选部门] → 切片摘要更新（本地）
       ↓
  [开始分析] → loading → 渲染结果
       ↓
  切换 Tab 不重新请求（用缓存 data）
       ↓
  改筛选 → 结果区半透明提示「筛选已变，请重新分析」直到再次点击
```

---

## 7. API 契约

### 7.1 查询参数

| 参数 | 说明 |
|------|------|
| `examId` | 可选 |
| `departmentId` | 可选 |
| `includeChildren` | `1`/`0`，默认 `1` |
| `mode` | 默认 `exam` |
| `from` / `to` | 可选时间戳 |

### 7.2 响应 `GET /api/admin/analytics/overview`

```jsonc
{
  "filter": {
    "examId": "...",
    "examName": "...",
    "departmentId": "...",
    "departmentName": "...",
    "includeChildren": true,
    "expandedDeptIds": ["d1","d2"],
    "analysisMode": "exam" | "department" | "exam_department" | "all"
  },
  "summary": { "attempts", "passRate", "avgScoreRate", "avgPRI", ... },
  "baseline": { /* 全库或单维对照，便于 Δ */ },
  "knowledge": { "L1", "L2", "L3" },
  "org": { "users", "departments", "childDepartments" },
  "proficiency": { ... },
  "insights": [ ... ],
  "charts": {
    "priBuckets": [{ "label":"熟练", "value":3 }],
    "l1Unfound": [{ "label":"高处坠落", "value":0.42 }],
    "scoreBuckets": [{ "label":"0-60", "value":2 }],
    "childDeptPRI": [{ "label":"维修车间", "value":61 }]
  }
}
```

---

## 8. 实现映射（代码）

| 模块 | 路径 |
|------|------|
| 算法核心 | `server/src/analytics.js` |
| HTTP | `server/src/app.js` → `/api/admin/analytics/*` |
| UI | `client/src/components/Admin/AnalyticsDashboard.jsx` |
| 交卷物化 | `POST /api/session/record` → `materializeAttempt` |
| 过程日志 | `InteractionJudge` session_log v2 |

---

## 9. 验收清单

- [ ] 清空筛选 = 全量分析  
- [ ] 只选试卷 = 仅该卷 attempt  
- [ ] 只选部门 + 含子部门 = 子孙部门成绩并入  
- [ ] 只选部门 + 不含子 = 精确 department_id  
- [ ] 试卷+部门 = 双条件  
- [ ] 知识 Top 无 `unknown`、无 pure miss  
- [ ] 图表与表格数字一致  
- [ ] 结论条数 >0 当且仅当 attempts>0 或给出 NO_DATA  

---

## 10. 一句话

> **学情分析 = 在「试卷 × 部门树」过滤下，对 attempt 算成绩与 PRI，对 knowledge_facts 算 L1/L2/L3 掌握，再用规则生成可执行结论；UI 以列表筛选 + 显式分析按钮 + 多图表面板交付。**
