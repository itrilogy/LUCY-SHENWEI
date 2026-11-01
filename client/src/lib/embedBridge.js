/**
 * 审微 · ShenWei 跨平台嵌入式考试协议与套接字总线 (Embed Bridge)
 * 供第三方企业平台（LMS / 生产安监调度台 / 应急演练中台）通过 iframe 或独立窗口嵌入集成
 *
 * 协议规范: SAFESPOT_EXAM v1.0
 */

const CHANNEL_ID = 'SAFESPOT_EXAM';
const PROTOCOL_VERSION = '1.0';

/**
 * 解析当前 URL 及 Hash 中携带的嵌入参数
 */
export function parseEmbedParams() {
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash || '';
    const hashQueryIndex = hash.indexOf('?');
    const hashParams = hashQueryIndex !== -1 ? new URLSearchParams(hash.slice(hashQueryIndex)) : new URLSearchParams();

    // 优先读取 search，其次读取 hash 中的 query
    const getParam = (key) => searchParams.get(key) || hashParams.get(key);

    const isEmbedded = getParam('embedded') === '1' ||
        getParam('embedded') === 'true' ||
        getParam('embed') === '1' ||
        getParam('embed') === 'true' ||
        getParam('kiosk') === '1' ||
        window.self !== window.top; // 在 iframe 中自动触发嵌入特性

    const isKiosk = getParam('kiosk') === '1' || isEmbedded;
    const autoStart = getParam('autoStart') === '1' || getParam('autoStart') === 'true';

    // 身份与开考参数
    const userName = getParam('userName') || getParam('name') || '';
    const userId = getParam('userId') || '';
    const employeeId = getParam('employeeId') || getParam('empId') || '';
    const department = getParam('department') || getParam('dept') || '';
    const departmentId = getParam('departmentId') || '';
    const examId = getParam('examId') || '';
    const mode = (getParam('mode') === 'practice') ? 'practice' : 'exam';
    const ticket = getParam('ticket') || '';
    const targetOrigin = getParam('origin') || getParam('targetOrigin') || '*';

    return {
        isEmbedded,
        isKiosk,
        autoStart,
        userName,
        userId,
        employeeId,
        department,
        departmentId,
        examId,
        mode,
        ticket,
        targetOrigin
    };
}

class EmbedBridge {
    constructor() {
        this.targetOrigin = '*';
        this.listeners = new Map();
        this.isInitialized = false;
        this.handleMessage = this.handleMessage.bind(this);
    }

    init(targetOrigin = '*') {
        if (this.isInitialized) return;
        this.targetOrigin = targetOrigin;
        window.addEventListener('message', this.handleMessage);
        this.isInitialized = true;
    }

    destroy() {
        if (!this.isInitialized) return;
        window.removeEventListener('message', this.handleMessage);
        this.listeners.clear();
        this.isInitialized = false;
    }

    setTargetOrigin(origin) {
        if (origin) this.targetOrigin = origin;
    }

    /**
     * 向父级页面或宿主发送消息
     */
    emit(event, payload = {}) {
        if (typeof window === 'undefined') return;

        const message = {
            channel: CHANNEL_ID,
            version: PROTOCOL_VERSION,
            event,
            timestamp: Date.now(),
            payload
        };

        // 优先发送给 iframe 父窗口，其次 window.opener (若为 window.open 弹出层)
        const targets = [];
        if (window.parent && window.parent !== window) {
            targets.push(window.parent);
        }
        if (window.opener && window.opener !== window) {
            targets.push(window.opener);
        }

        targets.forEach((target) => {
            try {
                target.postMessage(message, this.targetOrigin);
            } catch (err) {
                console.warn('[ShenWei EmbedBridge] postMessage failed:', err);
            }
        });
    }

    /**
     * 注册来自宿主平台的消息监听
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * 内部接收并分发父级指令
     */
    handleMessage(event) {
        // 校验 origin（如果配置了严格 origin 且不是通配符）
        if (this.targetOrigin !== '*' && event.origin !== this.targetOrigin) {
            return;
        }

        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.channel !== CHANNEL_ID) return;

        const { event: eventName, payload } = data;
        if (!eventName) return;

        const handlers = this.listeners.get(eventName);
        if (handlers && handlers.size > 0) {
            handlers.forEach((fn) => {
                try {
                    fn(payload, event);
                } catch (err) {
                    console.error(`[ShenWei EmbedBridge] Error executing handler for ${eventName}:`, err);
                }
            });
        }
    }

    // 快捷广播方法
    emitReady(metadata = {}) {
        this.emit('SAFESPOT_READY', {
            product: 'ShenWei',
            version: '1.4.1-web',
            ...metadata
        });
    }

    emitStarted(attemptData) {
        this.emit('SAFESPOT_STARTED', attemptData);
    }

    emitProgress(progressData) {
        this.emit('SAFESPOT_PROGRESS', progressData);
    }

    emitSubmit(resultData) {
        this.emit('SAFESPOT_SUBMIT', resultData);
    }

    emitExit(reason = 'user_click') {
        this.emit('SAFESPOT_EXIT', { reason });
    }

    emitResize(dimensions) {
        this.emit('SAFESPOT_RESIZE', dimensions);
    }

    emitError(error) {
        this.emit('SAFESPOT_ERROR', {
            message: error?.message || String(error),
            code: error?.code || 'EMBED_ERROR'
        });
    }
}

export const embedBridge = new EmbedBridge();
