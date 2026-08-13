# SafeEYE (SafeSpot-Local) 架构蓝图与反引力解耦

## 核心设计理念：本地结构化数据库 (Structured Local DB)

为了提升数据查询效率与系统稳定性，SafeEYE 已从早期的 JSON 存储迁移至**基于 SQLite 的结构化存储架构**。这在保持“数据不出本地、少网络依赖”的同时，提供了常规的事务保护。

### 1. 结构化数据底座 (SQLite 3)
系统的核心业务数据（图片元数据、标注坐标、考卷设定、用户成绩）集中存储在物理数据库文件 `/server/data/safeeye.db`。
* **物理隔离**：图片资产依然保留在 `/assets/raw/` 以方便人工直接预览。
* **逻辑统一**：数据库通过 `id` 索引物理文件，并利用核心表（assets, annotations, exams, exam_items, records）维护相关的业务关联。

### 2. 本地解耦特性
在引入 SQL 的同时，我们依然维持：
* **轻配置启动**：使用 `better-sqlite3` 后端驱动，无需安装独立的数据库后台进程。
* **便携性**：拷贝整个工程目录与数据库文件即可实现跨设备的本地运行，具备较好迁移的自包含特性。
* **业务逻辑增强**：支持三级知识图谱（场景、大类、细则）与动态风险矩阵算法。

## 3. 知识体系与风险评分机制
系统引入了动态评分拓扑，取代了陈旧的静态分值分配：
* **知识分层架构**：数据被解构为 `场景(Scene)` -> `大类(Category)` -> `细则(Item)` 的三级树状结构，通过外键进行关联。
* **风险评估矩阵**：基于 5x5 的风险源矩阵（发生概率 Likelihood × 后果严重性 Consequence）。
* **动态权重计算**：当用户在标注模态框中选定条目时，后端核心 API 会根据字典表实时计算 `L × C` 权重值并下发，确保风险等级调整能即时应用。

## 数据流处理架构

```text
[浏览器前端 - Vite React]
      |
      | - 1. Request (/api/assets): "获取图片列表与关联标注"
      | - 2. Request (/api/admin/db/query): "对账：透视物理表内容"
      v
[Node.js 高性能后端 - Express + SQLite]
      |
      | -> SQL Query -> [safeeye.db / assets 表]
      | -> SQL Query -> [safeeye.db / annotations 表]
      | -> fs.static  -> [静态目录 /data/assets/raw/*.jpg]
```

## 视图呈现控制架构

前端通过百分比记录所有坐标。`x_ratio` 和 `y_ratio`。无论是高分屏或平板预览，前端利用：
`left: img.clientWidth * x_ratio, top: img.clientHeight * y_ratio`。改善了多端设备分辨率差异的适配问题。

## Frontend 状态解耦机制 (Top-Down State Flow)

在多组件协同（如“左侧画布与右侧列表联动”、“快速拉起测试大厅”）的场景下，SafeEYE 保持**单向数据流**设计思路，未引入 Redux 等全局状态管理库。
1. **统一根节点提权 (Lifting State Up)**：
   在 `App.jsx` 顶层统一管理 `activeExamId`、`autoStartExamId` 等状态，通过 Props 跨组件向下分发。
2. **状态驱动的同源视图 (Single Source of Truth)**：
   使用唯一识别码（例如 `hoveredAnnoId`），不论是鼠标移入左侧图形气泡，还是滑过右侧属性清单面板，唯一的事件出口都会回传给父节点去修改该 ID 状态，从而驱动所关联节点的“双向联动”高亮显示效果。
