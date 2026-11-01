const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../src/rateLimit');
const session = require('../src/session');

describe('createRateLimiter', () => {
    it('allows requests within limit and blocks when exceeded', () => {
        const limiter = createRateLimiter({ windowMs: 10000, max: 3, message: 'Too many requests' });

        const mockReq = { headers: {}, ip: '192.168.1.100' };
        let status = 200;
        let jsonBody = null;
        const headers = {};
        const mockRes = {
            setHeader: (k, v) => { headers[k] = v; },
            status: (code) => { status = code; return { json: (b) => { jsonBody = b; } }; }
        };

        let nextCalled = 0;
        const next = () => { nextCalled++; };

        // 1st request -> allow
        limiter(mockReq, mockRes, next);
        assert.equal(nextCalled, 1);
        assert.equal(headers['RateLimit-Remaining'], 2);

        // 2nd request -> allow
        limiter(mockReq, mockRes, next);
        assert.equal(nextCalled, 2);
        assert.equal(headers['RateLimit-Remaining'], 1);

        // 3rd request -> allow
        limiter(mockReq, mockRes, next);
        assert.equal(nextCalled, 3);
        assert.equal(headers['RateLimit-Remaining'], 0);

        // 4th request -> blocked (429)
        limiter(mockReq, mockRes, next);
        assert.equal(nextCalled, 3, 'next should not be called when rate limited');
        assert.equal(status, 429);
        assert.equal(jsonBody.error, 'Too many requests');
        assert.ok(headers['Retry-After'] > 0);

        limiter.close();
    });
});

describe('session cache & signing', () => {
    it('exports session cache controls', () => {
        assert.equal(typeof session.invalidateSession, 'function');
        assert.equal(typeof session.invalidateUserSessions, 'function');
        assert.equal(typeof session.clearAllSessionCache, 'function');
    });

    it('identifies staff and admin roles correctly', () => {
        assert.equal(session.isAdmin({ role: 'admin' }), true);
        assert.equal(session.isAdmin({ role: 'trainer' }), false);
        assert.equal(session.isStaff({ role: 'admin' }), true);
        assert.equal(session.isStaff({ role: 'trainer' }), true);
        assert.equal(session.isStaff({ role: 'trainee' }), false);
    });
});
