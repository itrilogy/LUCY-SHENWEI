# SafeSpot 文档地图

> **产品形态（已决）**：浏览器访问的 **Web 应用**（本机或厂区内网）。  
> **不做**：桌面安装包、Electron / Tauri、托盘常驻。

对外品牌 **SafeSpot**，工程目录名 **SafeEYE**。数据默认留在本机 SQLite 与本地图片，不上传公有云。

## 读哪一份

| 文档 | 用途 | 读者 |
|------|------|------|
| [../README.md](../README.md) | 是什么、怎么启动、功能清单 | 所有人 |
| [PRODUCT.md](./PRODUCT.md) | 定位、角色、范围、明确不做 | 产品 / 实施 |
| [PLAN.md](./PLAN.md) | **规划真源**：分期、任务、验收 | 开发 |
| [PROCESS.md](./PROCESS.md) | **过程流水**：每次改了什么、哪些文件 | 开发 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 现状架构与目标 Web 架构 | 开发 |
| [DEPLOY.md](./DEPLOY.md) | 开发 / 单端口生产 / Docker / 备份 | 实施 |
| [USER_GUIDE.md](./USER_GUIDE.md) | 管理端与学员端操作步骤 | 安环员 / 学员 |
| [ANALYTICS.md](./ANALYTICS.md) | 学情指标、PRI、过滤语义 | 开发 / 培训主管 |
| [软著/00_文档索引.md](./软著/00_文档索引.md) | **软著**：产品说明、功能说明、使用说明、登记表 | 登记 / 法务 |

## 真源纪律

1. **进度与范围只认 `PLAN.md`。** 未写入的工作视为未立项。  
2. **过程只认 `PROCESS.md`。** 实现、修订、回退必须追加条目，未记账视为未交付。  
3. **对外说明以根 `README.md` 为准**，不得再写双击安装包或桌面壳。  
4. `archive/` 仅供追溯，其中的状态表、依赖版本、Electron 方案一律作废。  
5. 实现完成后回写 `PLAN.md` 任务状态，并在 `PROCESS.md` 记文件清单。

## 快速判断「做到哪了」

打开 [`PLAN.md`](./PLAN.md) 的「总览」与「任务表」。  
`archive/UPGRADE_PLAN.md` 不再用于判断进度。
