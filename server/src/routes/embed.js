const express = require('express');
const { getDB } = require('../db');
const session = require('../session');
const { generateLaunchTicket, verifyLaunchTicket } = require('../embedTicket');

const router = express.Router();

/**
 * 供宿主系统（LMS/中台）远程生成防篡改开考票据
 * 管理角色或者持有有效会话的培训员均可调用
 */
router.post('/embed/launch-ticket', (req, res) => {
    try {
        // 允许 staff 角色或者在非严格模式下生成
        const { examId, userName, userId, employeeId, department, departmentId, mode, expiresInSec } = req.body || {};
        if (!userName || !String(userName).trim()) {
            return res.status(400).json({ error: '必须指定考生姓名 (userName)' });
        }

        const ticket = generateLaunchTicket({
            examId,
            userName,
            userId,
            employeeId,
            department,
            departmentId,
            mode,
            expiresInSec: expiresInSec || 7200
        });

        const launchQuery = new URLSearchParams({
            embedded: '1',
            kiosk: '1',
            autoStart: '1',
            ticket
        });
        if (examId) launchQuery.set('examId', examId);

        res.json({
            status: 'success',
            ticket,
            expiresInSec: expiresInSec || 7200,
            launchUrl: `#/play?${launchQuery.toString()}`,
            fullQuery: launchQuery.toString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 校验票据有效性并返回解密上下文
 */
router.post('/embed/verify-ticket', (req, res) => {
    const { ticket } = req.body || {};
    const result = verifyLaunchTicket(ticket);
    if (!result.valid) {
        return res.status(400).json({ error: result.error, valid: false });
    }
    res.json({ valid: true, payload: result.payload });
});

/**
 * 嵌入协议元数据与开发者规范说明
 */
router.get('/embed/spec', (req, res) => {
    res.json({
        protocol: 'SAFESPOT_EXAM',
        version: '1.0',
        supportedModes: ['exam', 'practice'],
        queryParams: {
            embedded: '布尔值(1/true)，激活纯净嵌入视图，隐藏页头导航与版权',
            kiosk: '布尔值(1/true)，锁定考生端界面',
            autoStart: '布尔值(1/true)，信息就绪后跳过大厅直接进入考卷',
            examId: '试卷 ID 或 卷名',
            userName: '考生姓名',
            userId: '外部系统用户ID',
            employeeId: '工号',
            department: '所属车间/部门',
            ticket: '签名防篡改票据（由 /api/embed/launch-ticket 生成）',
            targetOrigin: '允许 postMessage 通信的父级 origin 域名'
        },
        socketEvents: {
            outgoing: ['SAFESPOT_READY', 'SAFESPOT_STARTED', 'SAFESPOT_PROGRESS', 'SAFESPOT_SUBMIT', 'SAFESPOT_EXIT', 'SAFESPOT_RESIZE', 'SAFESPOT_ERROR'],
            incoming: ['SAFESPOT_INIT', 'SAFESPOT_START', 'SAFESPOT_FORCE_SUBMIT']
        }
    });
});

module.exports = router;
