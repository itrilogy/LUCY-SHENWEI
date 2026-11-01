const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { app } = require('../src/app');
const { initDB } = require('../src/db');

describe('API Routes Integration', () => {
    let server;
    let baseUrl;

    before(async () => {
        await initDB();
        await new Promise((resolve) => {
            server = http.createServer(app).listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('GET /api/ping returns pong', async () => {
        const res = await fetch(`${baseUrl}/api/ping`);
        assert.equal(res.status, 200);
        const text = await res.text();
        assert.equal(text, 'pong');
    });

    it('GET /api/health returns health info', async () => {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, 'ok');
        assert.equal(data.db, true);
        assert.ok(data.version);
    });

    it('GET /api/knowledge returns knowledgeTree structure', async () => {
        const res = await fetch(`${baseUrl}/api/knowledge`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data.knowledgeTree));
    });

    it('GET /api/exams returns published exams for anonymous user', async () => {
        const res = await fetch(`${baseUrl}/api/exams`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data));
    });

    it('POST /api/auth/login rejects invalid credentials', async () => {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'nonexistent', password: 'wrong' })
        });
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.ok(data.error);
    });
});
