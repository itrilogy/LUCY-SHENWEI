# SafeEYE 核心实现与伪代码执行导引

本文档规定了前后端项目的入口方式及各模块对应的工程落地位点（即各系统文件的代码实现说明）。

## 核心逻辑落地矩阵

### 1. 标注引擎 (Visual Annotation Engine)
* **后端职责**：接收来自客户端给定的图片标识以及 `rect`/`circle` 坐标集合阵列。直接利用 Node 的 `fs.writeFile` 将数据持久化保存在 `/data/assets/meta/{imgName}.json` 中。
* **前端实现伪代码**：
  ```javascript
  // 坐标解构核心：
  function onCanvasMouseUp(e, imageRef) {
      const rect = imageRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      const x_ratio = clickX / rect.width;
      const y_ratio = clickY / rect.height;
      
      // 保存到本地 State，再通过 Axios 提交保存至后端 API
      saveAnnotation({ x: x_ratio, y: y_ratio, clauseId: 'GB2811-2019' });
  }
  ```

### 2. 交互判题器 (Interaction Judge)
* **核心职责**：在用户浏览考卷图片时，获取鼠标的隐患定位点击，计算其与预设的标注数据的重合程度进行逻辑碰撞判定。
* **前端实现伪代码**：
  ```javascript
  // 碰撞检测核心：
  function handleHitTest(e, imageRef, metaDataArray) {
      const rect = imageRef.current.getBoundingClientRect();
      const uX = (e.clientX - rect.left) / rect.width;
      const uY = (e.clientY - rect.top) / rect.height;
      
      let isHit = false;
      metaDataArray.forEach(meta => {
          // 若为方框，检测其处于 x_ratio, y_ratio 的偏差范畴内 (如宽容度 0.05 即5%)
          if (uX >= meta.x - 0.05 && uX <= meta.x + 0.05 && 
              uY >= meta.y - 0.05 && uY <= meta.y + 0.05) {
              isHit = true;
          }
      });
      return isHit ? triggerSuccessEffect() : recordFailAttempt();
  }
  ```

### 3. 数据层挂载 (Evolution to SQLite)
早期架构不建立传统的数据库表连接，完全依赖静态 JSON 文件：
* **图片源**：`/server/data/assets/raw`
* **JSON描述**：`/server/data/assets/meta/*.json`
* **条款定义字典**：`/server/data/knowledge/clauses.json`

**[Sprint 10+ 架构升级]**：
为了支撑多维度查询（如：多关键词空格并发检索、状态分拣），底层数据已统一升级至**单文件零配置的 SQLite 关系型数据库**。
* **物理主库**：`/server/data/safeeye.db`
* **解耦优势**：依然保持一定的便携性，复制整个 `data` 目录即可实现跨设备转移。包含所有的图片元数据 (`assets`、`annotations`)、题库 (`exams`)、以及多场景知识字典 (`knowledge`) 均交由 Node.js 层的 `better-sqlite3` 直接驱动。
