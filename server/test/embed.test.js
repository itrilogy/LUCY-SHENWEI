const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { initDB, getDB } = require('../src/db');
const { app } = require('../src/app');
const { generateLaunchTicket, verifyLaunchTicket } = require('../src/embedTicket');

describe('Embed Protocol & Ticket Integration', () => {
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

    it('Embed Ticket: 签发与时序安全验证', () => {
        const payload = {
            examId: 'exam_demo_101',
            userName: '李工',
            userId: 'U-8848',
            department: '安全环保部',
            employeeId: 'EMP-001',
            mode: 'exam'
        };

        const ticket = generateLaunchTicket(payload);
        assert.ok(ticket && typeof ticket === 'string');
        assert.equal(ticket.split('.').length, 2);

        const verified = verifyLaunchTicket(ticket);
        assert.equal(verified.valid, true);
        assert.equal(verified.payload.userName, '李工');
        assert.equal(verified.payload.userId, 'U-8848');
        assert.equal(verified.payload.department, '安全环保部');
        assert.equal(verified.payload.examId, 'exam_demo_101');
        assert.equal(verified.payload.mode, 'exam');
    });

    it('Embed Ticket: 篡改与伪造应被拒绝', () => {
        const ticket = generateLaunchTicket({ userName: '张三' });
        const [data, sig] = ticket.split('.');

        // 篡改载荷
        const tamperedData = Buffer.from(JSON.stringify({ userName: '李四' })).toString('base64url');
        const tamperedTicket = `${tamperedData}.${sig}`;
        const result1 = verifyLaunchTicket(tamperedTicket);
        assert.equal(result1.valid, false);
        assert.match(result1.error, /篡改|无效/);

        // 伪造签名
        const fakeSigTicket = `${data}.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`;
        const result2 = verifyLaunchTicket(fakeSigTicket);
        assert.equal(result2.valid, false);
    });

    it('Embed Ticket: 过期票据应被拒绝', () => {
        const expiredTicket = generateLaunchTicket({
            userName: '王五',
            exp: Date.now() - 1000 // 已经过期 1 秒
        });

        const result = verifyLaunchTicket(expiredTicket);
        assert.equal(result.valid, false);
        assert.match(result.error, /过期/);
    });

    it('Embed API: POST /api/embed/launch-ticket 生成与验证端点', async () => {
        const res = await fetch(`${baseUrl}/api/embed/launch-ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: '开箱示范卷',
                userName: '赵六',
                department: '生产调度中心',
                employeeId: 'EMP-999'
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, 'success');
        assert.ok(data.ticket);
        assert.ok(data.launchUrl.includes('embedded=1'));
        assert.ok(data.launchUrl.includes('autoStart=1'));

        // 验证接口
        const verifyRes = await fetch(`${baseUrl}/api/embed/verify-ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket: data.ticket })
        });

        assert.equal(verifyRes.status, 200);
        const verifyData = await verifyRes.json();
        assert.equal(verifyData.valid, true);
        assert.equal(verifyData.payload.userName, '赵六');
    });

    it('Embed API: GET /api/embed/spec 返回嵌入协议规范', async () => {
        const res = await fetch(`${baseUrl}/api/embed/spec`);
        assert.equal(res.status, 200);
        const data = await res.json();

        assert.equal(data.protocol, 'SAFESPOT_EXAM');
        assert.equal(data.version, '1.0');
        assert.ok(Array.isArray(data.socketEvents.outgoing));
        assert.ok(data.socketEvents.outgoing.includes('SAFESPOT_STARTED'));
        assert.ok(data.socketEvents.outgoing.includes('SAFESPOT_SUBMIT'));
    });

    it('Exam Session: 支持按卷名 (exam_name) 或试卷 ID 直接开考', async () => {
        // 1. 按卷名开考
        const resByName = await fetch(`${baseUrl}/api/exam-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: '开箱示范卷',
                userName: '测试考生A'
            })
        });

        assert.equal(resByName.status, 200);
        const bodyByName = await resByName.json();
        assert.ok(bodyByName.id);
        assert.equal(bodyByName.examName, '开箱示范卷');
        assert.ok(Array.isArray(bodyByName.slides));
        assert.ok(bodyByName.slides.length > 0);

        // 2. 按内部真实 ID 开考
        const db = getDB();
        const exam = db.prepare("SELECT id FROM exams WHERE exam_name = '开箱示范卷'").get();
        assert.ok(exam && exam.id);

        const resById = await fetch(`${baseUrl}/api/exam-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: exam.id,
                userName: '测试考生B'
            })
        });

        assert.equal(resById.status, 200);
        const bodyById = await resById.json();
        assert.ok(bodyById.id);
        assert.equal(bodyById.examId, exam.id);
    });

    it('Exam Session: 支持携带 signed ticket 开考', async () => {
        const ticket = generateLaunchTicket({
            examId: '开箱示范卷',
            userName: '外部系统学员C',
            userId: 'LMS-USER-12345',
            department: '一分厂'
        });

        const res = await fetch(`${baseUrl}/api/exam-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(data.id);
        assert.equal(data.userName, '外部系统学员C');
        assert.equal(data.department, '一分厂');
    });
});
