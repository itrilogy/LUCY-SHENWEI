# 审微 · ShenWei 跨平台嵌入式考核协议与双向套接字技术规范

> **版本**：`1.0` (对齐审微 Web v1.4.1+)  
> **通道标识**：`SAFESPOT_EXAM`  
> **生效日期**：2026-11-01  
> **适用场景**：企业培训中台 (LMS)、生产安监指挥中心大屏、应急演练系统、移动端混合应用 (Webview / Kiosk)

---

## 1. 协议设计背景与拓扑

在传统厂区安全培训中，各企业常建有自己的综合人事、EHS 安环平台或在线学习系统。若要求各系统独立开发一套热区隐患排查引擎，成本极高且法条计分标准难以统一。

为此，**审微 · ShenWei** 提供了标准化的 **跨平台嵌入与套接字考核协议 (SAFESPOT_EXAM Protocol)**。第三方系统只需通过 `<iframe>`、Webview 或独立弹出窗口嵌入审微，即可：
1. **免登与深链直通**：直接将考卷、考生身份（姓名、工号、部门、用户唯一标识）注入考核引擎；
2. **纯净沉浸式排查**：自动剥离审微外围导航、版权声明与龙虎榜侧边栏，将全部视口让渡给现场排查画布；
3. **毫秒级直接开考**：支持 `autoStart=1`，跳过大厅选卷、身份填写与规则三步确认，直接载入现场第一题；
4. **运行时双向事件套接字 (PostMessage Socket)**：宿主系统实时捕获考生的开考、换题、命中隐患、限时倒计时及交卷等第与 PRI 熟练度指标；亦可下发强制收卷、重置等远程控制指令；
5. **HMAC-SHA256 签名票据防篡改**：防止考生在前端 DevTools 中篡改身份、工号或由练习伪造考核成绩。

```text
┌────────────────────────────────────────────────────────┐
│ 宿主平台 (企业 LMS / 安监管控平台 / 指挥大屏)            │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 嵌入容器 <iframe src="/#/play?embedded=1&...">   │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │ 审微 · ShenWei 考核引擎 (InteractionJudge) │  │  │
│  │  │                                            │  │  │
│  │  │ [现场隐患画布]         [倒计时/得分/条款]   │  │  │
│  │  │                                            │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                            │                           │
│      window.postMessage    │  window.addEventListener  │
│      (SAFESPOT_EXAM 信封)  ▼  ('message')              │
│                                                        │
│  • SAFESPOT_READY (引擎加载就绪)                        │
│  • SAFESPOT_STARTED (正式开考凭据)                      │
│  • SAFESPOT_PROGRESS (每题隐患命中、扣除与进度)          │
│  • SAFESPOT_SUBMIT (权威终审分数、等第、PRI、错题集)     │
│  ◄─ SAFESPOT_FORCE_SUBMIT (宿主平台强制收卷)            │
└────────────────────────────────────────────────────────┘
```

---

## 2. 通道 A：URL 深链参数规范 (Deep-Link Parameters)

外部系统可通过在 URL query 或 hash query 中携带以下参数调起审微：

| 参数名 | 类型 | 必填 | 默认值 | 语义与作用 |
|---|---|---|---|---|
| `embedded` / `embed` | `1` \| `true` | 推荐 | `0` | **激活嵌入模式**。隐藏全局顶部导航栏、版权声明、管理端入口及侧边龙虎榜，画布自动扩充至视口 100%。 |
| `kiosk` | `1` \| `true` | 可选 | 与 embedded 联动 | **锁定考生视图**。禁止学员离开考试视图。 |
| `autoStart` | `1` \| `true` | 推荐 | `0` | **直接开考**。当身份与目标考卷齐备时，跳过大厅 3 步确认，毫秒级直接渲染第一题画布开考。 |
| `examId` | `string` | 推荐 | 最新已发布试卷 | **指定考核试卷**。支持传入试卷内部稳定 ID（如 `exam_...`）或卷名（如 `开箱示范卷`）。 |
| `userName` / `name` | `string` | 条件必选 | 无 | **考生真实姓名**。若使用直接开考则必填。 |
| `userId` | `string` | 可选 | `null` | **外部系统用户主键**。宿主平台的员工唯一 ID，交卷时权威绑定入库。 |
| `employeeId` / `empId` | `string` | 可选 | `null` | **考生工号或手机号**。 |
| `department` / `dept` | `string` | 可选 | `null` | **考生所属部门 / 车间班组**。 |
| `mode` | `'exam'` \| `'practice'` | 可选 | `'exam'` | **模式选择**。`exam` 正式考核（权威计分、隐藏未命中热区）；`practice` 练习模式（可看热区提示）。 |
| `ticket` | `string` | 生产推荐 | 无 | **服务端 HMAC-SHA256 签名票据**。携带此票据时优先以票据内的身份与考卷为准，杜绝客户端参数伪造。 |
| `targetOrigin` / `origin` | `string` | 可选 | `'*'` | **允许通信的父级源域名**（如 `https://lms.factory.com`）。增强 postMessage 跨域安全性。 |

### 快速调起 URL 示例

#### 场景 1：最简免登直接开考
```html
<iframe 
  src="http://127.0.0.1:3000/#/play?embedded=1&autoStart=1&examId=开箱示范卷&userName=王大力&employeeId=EMP9527&department=安监一部"
  style="width: 100%; height: 100vh; border: none;"
  allow="cross-origin-isolated"
></iframe>
```

#### 场景 2：安全签名票据开考
```html
<iframe 
  src="http://127.0.0.1:3000/#/play?embedded=1&ticket=eyJhbGciOi...1234.abcdef...&autoStart=1"
  style="width: 100%; height: 100vh; border: none;"
></iframe>
```

---

## 3. 通道 B：双向事件套接字协议 (PostMessage Socket)

所有跨窗口、跨 iframe 的通信报文均采用统一信封结构：

```typescript
interface SafeSpotMessageEnvelope<T = any> {
  channel: 'SAFESPOT_EXAM';    // 协议通道固定标识
  version: '1.0';              // 协议版本
  event: string;               // 事件名
  timestamp: number;           // 时间戳（毫秒）
  payload: T;                  // 业务载荷
}
```

### 3.1 审微发往宿主平台的事件 (Outgoing Events)

#### (1) `SAFESPOT_READY`：引擎加载完毕
审微组件与考卷列表加载就绪时广播，宿主平台可据此获知审微支持的模式与已发布的考卷列表。
```json
{
  "channel": "SAFESPOT_EXAM",
  "version": "1.0",
  "event": "SAFESPOT_READY",
  "timestamp": 1793468000000,
  "payload": {
    "product": "ShenWei",
    "version": "1.4.1-web",
    "exams": [
      {
        "id": "exam_1793465373171_543pmf",
        "examName": "开箱示范卷",
        "slidesCount": 12,
        "totalScore": 100,
        "timeLimitSec": 0
      }
    ]
  }
}
```

#### (2) `SAFESPOT_STARTED`：正式开考
考生进入实际试卷并生成服务端开考会话（`exam_attempts`）后广播。
```json
{
  "channel": "SAFESPOT_EXAM",
  "version": "1.0",
  "event": "SAFESPOT_STARTED",
  "timestamp": 1793468010000,
  "payload": {
    "attemptId": "att_1793466942634_3avews",
    "examId": "exam_1793465373171_543pmf",
    "examName": "开箱示范卷",
    "mode": "exam",
    "candidate": {
      "userName": "王大力",
      "department": "安监一部",
      "employeeId": "EMP9527"
    },
    "totalQuestions": 12,
    "paperTotal": 100,
    "timeLimitSec": 600,
    "startedAt": 1793468010000
  }
}
```

#### (3) `SAFESPOT_PROGRESS`：进度与点击变动
考生在画布上点击排查隐患、题目切换、倒计时跳动时实时广播。
```json
{
  "channel": "SAFESPOT_EXAM",
  "version": "1.0",
  "event": "SAFESPOT_PROGRESS",
  "timestamp": 1793468025000,
  "payload": {
    "attemptId": "att_1793466942634_3avews",
    "currentIndex": 0,
    "totalQuestions": 12,
    "currentScore": 8,
    "timeLeft": 585,
    "foundCount": 1,
    "missCount": 0,
    "lastClickResult": "hit",
    "slideAssetId": "01_建设施工_高处坠落与物料_JB-01-03-09.jpg"
  }
}
```

#### (4) `SAFESPOT_SUBMIT`：考核交卷完成（最核心）
交卷完成后广播，由服务端基于快照权威回放重算，宿主平台可直接持久化该最终成绩。
```json
{
  "channel": "SAFESPOT_EXAM",
  "version": "1.0",
  "event": "SAFESPOT_SUBMIT",
  "timestamp": 1793468300000,
  "payload": {
    "attemptId": "att_1793466942634_3avews",
    "examId": "exam_1793465373171_543pmf",
    "score": 92,
    "paperTotal": 100,
    "grade": {
      "key": "A",
      "label": "优",
      "color": "text-[var(--state-up)]"
    },
    "passed": true,
    "duration": 290000,
    "pri": 0.88,
    "invalidClicks": 1,
    "candidate": {
      "userName": "王大力",
      "department": "安监一部",
      "employeeId": "EMP9527"
    },
    "missedCount": 1
  }
}
```

#### (5) `SAFESPOT_EXIT`：考生退出请求
当考生在大厅点击返回或在交卷结果页点击退出时广播，宿主平台可在此事件后关闭 modal 或跳转下一课目。

#### (6) `SAFESPOT_ERROR`：异常报警
当发生考卷加载失败、开考会话超时等异常时广播。

---

### 3.2 宿主平台发往审微的指令 (Incoming Commands)

#### (1) `SAFESPOT_INIT`：远程推入学员信息与试卷
```javascript
iframeWindow.postMessage({
  channel: 'SAFESPOT_EXAM',
  version: '1.0',
  event: 'SAFESPOT_INIT',
  timestamp: Date.now(),
  payload: {
    examId: '开箱示范卷',
    userName: '张工',
    department: '维保二分厂',
    employeeId: 'WB-004',
    mode: 'exam',
    autoStart: true
  }
}, '*');
```

#### (2) `SAFESPOT_START`：远程指令开考
```javascript
iframeWindow.postMessage({
  channel: 'SAFESPOT_EXAM',
  version: '1.0',
  event: 'SAFESPOT_START',
  timestamp: Date.now(),
  payload: {
    examId: '开箱示范卷'
  }
}, '*');
```

#### (3) `SAFESPOT_FORCE_SUBMIT`：远程强制收卷
适用于宿主系统外部总控计时结束、监考人员强制收卷场景。审微接获该指令后立即触发 `submitAttempt()` 并广播 `SAFESPOT_SUBMIT`。
```javascript
iframeWindow.postMessage({
  channel: 'SAFESPOT_EXAM',
  version: '1.0',
  event: 'SAFESPOT_FORCE_SUBMIT',
  timestamp: Date.now(),
  payload: {
    reason: 'proctor_forced'
  }
}, '*');
```

---

## 4. 通道 C：HMAC-SHA256 签名安全票据规范

为杜绝客户端（浏览器 DevTools）篡改考生工号或冒名顶替，审微后端提供了基于签名密钥的 Launch Ticket 机制。

### 4.1 服务端签发接口：`POST /api/embed/launch-ticket`
企业 LMS 后端在分派学员开考时，由后端直接调用审微接口获取安全票据：

- **请求方式**：`POST /api/embed/launch-ticket`
- **请求体 (JSON)**：
  ```json
  {
    "examId": "开箱示范卷",
    "userName": "王大力",
    "userId": "LMS_USER_98765",
    "employeeId": "EMP-9527",
    "department": "生产调度中心",
    "mode": "exam",
    "expiresInSec": 7200
  }
  ```
- **响应体 (JSON)**：
  ```json
  {
    "status": "success",
    "ticket": "eyJleGFtSWQiOiLlvIDnrrHnpLrorIPljbc...f4a1.8d54c7d03...",
    "expiresInSec": 7200,
    "launchUrl": "#/play?embedded=1&kiosk=1&autoStart=1&ticket=...&examId=...",
    "fullQuery": "embedded=1&kiosk=1&autoStart=1&ticket=...&examId=..."
  }
  ```

### 4.2 独立离线签发算法 (Node.js / Python 示例)
若第三方平台不希望调用 HTTP 接口，可直接使用双方预置的 `EMBED_SECRET` 离线签发：

#### Node.js 实现：
```javascript
const crypto = require('crypto');

function signSafeSpotTicket(payload, secret) {
  const tokenPayload = {
    ...payload,
    iat: Date.now(),
    exp: Date.now() + 7200 * 1000,
    nonce: crypto.randomBytes(8).toString('hex')
  };
  const data = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const sig = hmac.digest('hex');
  return `${data}.${sig}`;
}
```

---

## 5. 前端宿主集成代码范例

### 5.1 原生 HTML / JavaScript 宿主集成模板
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>企业培训中台 - 隐患排查考核嵌入示例</title>
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0F172A; }
    #safespot-frame { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe 
    id="safespot-frame"
    src="http://127.0.0.1:3000/#/play?embedded=1&autoStart=1&examId=开箱示范卷&userName=李晓峰&employeeId=E8821&department=高空作业组"
  ></iframe>

  <script>
    // 监听审微发出的考核套接字事件
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.channel !== 'SAFESPOT_EXAM') return;

      console.log(`[LMS 收到事件] ${data.event}:`, data.payload);

      switch (data.event) {
        case 'SAFESPOT_READY':
          console.log('审微考核引擎已就绪，当前可用考卷:', data.payload.exams);
          break;

        case 'SAFESPOT_STARTED':
          console.log(`学员 ${data.payload.candidate.userName} 已正式开考，会话ID: ${data.payload.attemptId}`);
          break;

        case 'SAFESPOT_PROGRESS':
          console.log(`进度更新: 第 ${data.payload.currentIndex + 1} 题，当前得分: ${data.payload.currentScore}`);
          break;

        case 'SAFESPOT_SUBMIT':
          alert(`考核完毕！得分: ${data.payload.score}/${data.payload.paperTotal}，等第: ${data.payload.grade.label}`);
          // 将考核结果同步给企业自身的学员台账接口
          fetch('/api/lms/sync-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data.payload)
          });
          break;

        case 'SAFESPOT_EXIT':
          window.location.href = '/lms/course-dashboard';
          break;
      }
    });
  </script>
</body>
</html>
```

### 5.2 React 宿主组件封装范例
```tsx
import React, { useEffect, useRef } from 'react';

interface SafeSpotExamProps {
  examId: string;
  candidate: {
    userName: string;
    employeeId?: string;
    department?: string;
  };
  onComplete?: (result: any) => void;
  onProgress?: (progress: any) => void;
}

export const SafeSpotExamPlayer: React.FC<SafeSpotExamProps> = ({
  examId,
  candidate,
  onComplete,
  onProgress
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data?.channel !== 'SAFESPOT_EXAM') return;

      if (data.event === 'SAFESPOT_PROGRESS' && onProgress) {
        onProgress(data.payload);
      }
      if (data.event === 'SAFESPOT_SUBMIT' && onComplete) {
        onComplete(data.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onComplete, onProgress]);

  const query = new URLSearchParams({
    embedded: '1',
    autoStart: '1',
    examId,
    userName: candidate.userName,
    employeeId: candidate.employeeId || '',
    department: candidate.department || ''
  }).toString();

  return (
    <iframe
      ref={iframeRef}
      src={`/#/play?${query}`}
      className="w-full h-full border-0"
      title="SafeSpot 现场隐患考核"
    />
  );
};
```

---

## 6. 安全防范与最佳实践

1. **同源或指定 `targetOrigin`**：生产环境建议在 query 中指定 `origin=https://lms.yourcorp.com`，审微 postMessage 将仅向该信任域广播考生成绩，防止恶意第三方 iframe 劫持成绩报文。
2. **成绩对账以服务端为准**：虽然 `SAFESPOT_SUBMIT` 包含了丰富的前端回传统计，但企业对账应当以审微服务端 `POST /api/exam-sessions/:id/submit` 入库的权威快照记录为唯一法源。
3. **启用 `ticket` 签名**：生产内网中，推荐在学员开考前由 LMS 服务端请求 `/api/embed/launch-ticket` 签发 ticket，确保工号与姓名不可被考生在 DevTools 随意篡改。
