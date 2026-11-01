/**
 * 轻量级内存限流中间件（用于登录端点防暴力破解）
 * 无外部依赖，定时自动清理过期窗口，不对进程退出造成阻止
 */
function createRateLimiter(options = {}) {
    const windowMs = options.windowMs || 60 * 1000; // 默认 1 分钟窗口
    const max = options.max || 10;                  // 默认 1 分钟内最多 10 次尝试
    const message = options.message || '请求过于频繁，请稍后再试';
    const statusCode = options.statusCode || 429;

    // ip -> { count: number, resetTime: number }
    const store = new Map();

    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of store.entries()) {
            if (now > entry.resetTime) {
                store.delete(ip);
            }
        }
    }, Math.min(windowMs, 60 * 1000));
    cleanupInterval.unref?.();

    function getClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const first = String(forwarded).split(',')[0].trim();
            if (first) return first;
        }
        return req.ip || req.socket?.remoteAddress || '127.0.0.1';
    }

    const middleware = (req, res, next) => {
        const ip = getClientIp(req);
        const now = Date.now();
        let record = store.get(ip);

        if (!record || now > record.resetTime) {
            record = { count: 1, resetTime: now + windowMs };
            store.set(ip, record);
        } else {
            record.count += 1;
        }

        const remaining = Math.max(0, max - record.count);
        const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

        res.setHeader('RateLimit-Limit', max);
        res.setHeader('RateLimit-Remaining', remaining);
        res.setHeader('RateLimit-Reset', resetSeconds);

        if (record.count > max) {
            res.setHeader('Retry-After', resetSeconds);
            return res.status(statusCode).json({ error: message });
        }

        next();
    };

    middleware.reset = () => {
        store.clear();
    };

    middleware.close = () => {
        clearInterval(cleanupInterval);
    };

    return middleware;
}

module.exports = { createRateLimiter };
