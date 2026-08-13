# SafeSpot 部署（Web）

本文只描述 **浏览器访问的 Web 服务**。没有安装包，没有桌面托盘。

---

## 1. 环境

- Node.js **20 LTS**（推荐）。Node 26 上 `better-sqlite3` 可能编不过原生模块。
- macOS / Linux / Windows
- 浏览器：Chrome 或 Edge 近两个大版本

`better-sqlite3` 是原生模块，Node 主版本升级后若启动失败，在 `server/` 下用对应 LTS 重装依赖。

---

## 2. 开发（两个端口，仅开发者）

```bash
npm run install:all
npm run dev
```

| 进程 | 地址 | 说明 |
|------|------|------|
| 前端 Vite | http://127.0.0.1:5173 | 页面；`/api` 与 `/assets` 已代理 |
| 后端 Express | http://127.0.0.1:3000 | API 与图片 |

浏览器请开 **5173**。健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

端口占用：

```bash
PORT=3010 npm run server
```

（开发代理默认仍指向 3000，改后端端口时需同步改 `client/vite.config.js`。）

---

## 3. 生产（目标：一个端口）

```bash
npm run install:all
# 生产前请设置 SESSION_SECRET、修改 admin 密码，并设置非默认 ADMIN_PIN
npm start
```

等价于：先 `npm run build`，再以 `NODE_ENV=production` 启动 Express，托管 `client/dist`。

员工访问：**http://培训机或内网主机:3000/**

| 变量 | 默认 | 含义 |
|------|------|------|
| `PORT` | `3000` | 监听端口 |
| `HOST` | `127.0.0.1` | 只本机；内网设 `0.0.0.0` |
| `NODE_ENV` | 未设 | `production` 时托管 dist、收紧 CORS、拒绝默认口令 |
| `ADMIN_PIN` | 开发默认 `safeeye` | 仅过渡；W1 后以账号会话为准 |
| `SESSION_SECRET` | 必填（W1） | 签会话 |

**本机自用**：`HOST` 保持回环，浏览器打开 `http://127.0.0.1:3000`。  
**培训室多机**：服务器设 `HOST=0.0.0.0`，防火墙只放行该端口给厂网。

不要把服务直接暴露到公网。需要远程时走 VPN 或内网反代。

---

## 4. Docker

```bash
docker compose up -d --build
```

浏览器打开 http://服务器:3000 。数据在 named volume `safespot-data`。  
首次可用 `ALLOW_INSECURE=1`（compose 默认），上线后请改 `SESSION_SECRET`、`ADMIN_PIN` 和管理员密码。

---

## 5. 数据与备份

必须一起备份：

```text
server/data/safeeye.db
server/data/assets/raw/
```

```bash
npm run backup                 # 生成 server/data/backups/safespot-时间.zip
npm run restore -- 备份.zip    # 恢复后请重启服务
```

也可在管理端「数据巡检」生成/下载备份。WAL 模式下备份会先尝试 checkpoint。

换机器：拷贝上述路径 → 安装 Node 依赖 → 按第 3 节启动 → 浏览器打开同一端口。

不要把 `server/node_modules`、`*.db-wal`、`*.db-shm` 提交进 git。

---

## 6. 默认凭据（仅开发）

| 用途 | 值 | 生产 |
|------|-----|------|
| 当前管理 PIN | `safeeye` | W1 后废除为唯一闸，且禁止默认值 |
| 种子账号 | `admin` / `admin123` | 首次登录强制改密 |

现场图可能含厂区信息，按单位保密规定管理磁盘与备份盘。

---

## 7. 故障

| 现象 | 处理 |
|------|------|
| 页面开了但接口全失败 | 开发时确认 3000 已起；生产确认访问的是托管 dist 的那一个端口 |
| `/api/health` 为 degraded | 查 `safeeye.db` 能否打开、`assets/raw` 是否存在 |
| better-sqlite3 编译失败 | Node 版本与文档一致，在 `server` 重装 |
| 组卷没有图 | 图库里是否点了「保存标注」 |
| 内网别人打不开 | 是否仍监听 `127.0.0.1`；需 `HOST=0.0.0.0` 且防火墙放行 |
