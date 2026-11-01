const crypto = require('crypto');

function getSecret() {
    return process.env.EMBED_SECRET || process.env.SESSION_SECRET || 'safespot_embed_default_secret_2026';
}

function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * 为外部集成平台生成防篡改开考票据 (HMAC-SHA256 Launch Ticket)
 * @param {Object} payload 考生与考卷上下文
 * @param {string} [secret] 签名密钥
 * @returns {string} 签名票据
 */
function generateLaunchTicket(payload = {}, secret = getSecret()) {
    const now = Date.now();
    const tokenPayload = {
        examId: payload.examId || '',
        userName: String(payload.userName || '').trim(),
        userId: payload.userId ? String(payload.userId).trim() : null,
        employeeId: payload.employeeId ? String(payload.employeeId).trim() : null,
        department: payload.department ? String(payload.department).trim() : null,
        departmentId: payload.departmentId || null,
        mode: payload.mode === 'practice' ? 'practice' : 'exam',
        iat: now,
        exp: payload.exp || (now + (Number(payload.expiresInSec) || 7200) * 1000), // 默认有效期 2 小时
        nonce: crypto.randomBytes(8).toString('hex')
    };

    if (!tokenPayload.userName) {
        throw new Error('Launch Ticket 必须包含考生姓名 (userName)');
    }

    const encodedData = base64UrlEncode(JSON.stringify(tokenPayload));
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(encodedData);
    const signature = hmac.digest('hex');

    return `${encodedData}.${signature}`;
}

/**
 * 校验并解析外部传入的开考票据
 * @param {string} token 票据
 * @param {string} [secret] 签名密钥
 * @returns {{ valid: boolean, payload?: Object, error?: string }}
 */
function verifyLaunchTicket(token, secret = getSecret()) {
    if (!token || typeof token !== 'string') {
        return { valid: false, error: '缺少开考票据' };
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
        return { valid: false, error: '票据格式不合法' };
    }

    const [encodedData, incomingSig] = parts;

    try {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(encodedData);
        const expectedSig = hmac.digest('hex');

        // 时序安全比对
        const sigBuf = Buffer.from(incomingSig, 'hex');
        const expBuf = Buffer.from(expectedSig, 'hex');
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return { valid: false, error: '票据签名无效或已被篡改' };
        }

        const rawJson = base64UrlDecode(encodedData);
        const payload = JSON.parse(rawJson);

        if (payload.exp && Date.now() > payload.exp) {
            return { valid: false, error: '票据已过期，请重新向培训平台申请开考' };
        }

        return { valid: true, payload };
    } catch (err) {
        return { valid: false, error: `票据解析失败: ${err.message}` };
    }
}

module.exports = {
    generateLaunchTicket,
    verifyLaunchTicket,
    getSecret
};
