# 学情分析

> **状态：核心已实现**（`server/src/analytics.js` + 管理端「学情分析」）。  
> 文首曾写「待实现」的旧稿已归档。完整公式见 [`archive/ANALYTICS_ALGORITHM_MODEL.md`](./archive/ANALYTICS_ALGORITHM_MODEL.md)。

---

## 1. 要回答的问题

| 问题 | 切片 |
|------|------|
| 这张卷考得怎样？ | 只选试卷 |
| 这个部门怎样？ | 只选部门（默认含下级） |
| 该部门在该卷上怎样？ | 试卷 × 部门 |
| 错在哪一层知识？ | L1 场景 / L2 大类 / L3 细则 |
| 是不会，还是手生乱点？ | 遗漏 vs PRI |

都不选 = 全库正式考核。

## 2. 双轨原则（已落地）

| 事件 | 含义 | 进知识薄弱 | 进 PRI |
|------|------|------------|--------|
| `hit` | 点中热区 | 掌握度的命中 | 是 |
| `miss` | 点在空白 | **否**（避免 `unknown`） | 是 |
| `unfound` | 交卷仍未找到 | **是** | 是（找全率） |

报表「薄弱点」只统计 `unfound`。

## 3. 数据

- 原始：`records.session_log`（v2：`hit` / `miss` / `unfound`）
- 物化：`attempt_stats`（一场一行）、`knowledge_error_facts`（每个 hit/unfound 一条）
- 交卷后由 `analytics.materializeAttempt` 写入（W1 起必须与 `records` 同事务）

默认过滤：`mode = exam`。练习可在报表里单独看，不进学情主结论。

部门过滤：选中节点后展开全部子孙，`department_id IN (...)`。  
没有 `department_id` 的访客成绩：只在「全部部门」时计入。

## 4. PRI（识别熟练度）

\[
PRI = 100 \times (0.40\,M_{hit} + 0.25\,(1-W) + 0.15\,\eta' + 0.20\,(1-R_{miss}))
\]

| 符号 | 含义 |
|------|------|
| \(M_{hit}\) | 找全率 |
| \(W\) | 容错浪费（误点 / (题数×3)） |
| \(\eta'\) | 命中速度的 logistic 归一 |
| \(R_{miss}\) | 无效点击占比 |

刻度：≥85 熟练 · 70–84 良好 · 55–69 一般 · &lt;55 生疏。

知识掌握度：节点上贝叶斯平滑 \((H+1)/(E+2)\)，小样本不说满话。

## 5. 接口

| 路径 | 作用 |
|------|------|
| `GET /api/admin/analytics/filters` | 试卷列表 + 部门树 |
| `GET /api/admin/analytics/overview` | 总览 + 结论 |
| `GET /api/admin/analytics/summary` | KPI |
| `GET /api/admin/analytics/knowledge` | L1/L2/L3 |
| `GET /api/admin/analytics/org` | 部门 / 人员 |
| `GET /api/admin/analytics/proficiency` | PRI 分布 |
| `GET /api/admin/analytics/insights` | 规则引擎建议 |

查询参数：`examId`、`departmentId`、`includeChildren`、`mode`；后端已支持 `from`/`to`（**UI 尚未接**，见 `PLAN.md` W2-03）。

## 6. 未做（仍在规划里）

- 仪表盘时间窗与「本周未过」名单
- 学情专用 CSV
- 部门 × L1 热力、个人雷达、趋势
- 大模型写评语（默认不做）

结论文案由规则引擎生成，便于离线部署。
