process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.SERVE_CLIENT = process.env.SERVE_CLIENT || '1';
const { startServer } = require('./app');
startServer().catch((err) => {
    console.error('[SafeSpot] 启动失败', err);
    process.exit(1);
});
