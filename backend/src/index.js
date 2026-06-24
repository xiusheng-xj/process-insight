require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

const projectsRouter      = require('./routes/projects');
const eventsRouter        = require('./routes/events');
const alertsRouter        = require('./routes/alerts');
const alertsGlobalRouter  = require('./routes/alertsGlobal');
const locksRouter         = require('./routes/locks');
const templatesRouter     = require('./routes/templates');
const applyTemplateRouter = require('./routes/applyTemplate');
const eventMasterRouter   = require('./routes/eventMaster');
const saveAsPatternRouter        = require('./routes/saveAsPattern');
const projectsGanttRouter        = require('./routes/projectsGantt');
const processPatternsRouter      = require('./routes/processPatterns');
const projectProcessStepsRouter  = require('./routes/projectProcessSteps');
const applyProcessPatternRouter  = require('./routes/applyProcessPattern');
const saveProcessPatternRouter   = require('./routes/saveProcessPattern');
const milestonePatternsRouter    = require('./routes/milestonePatterns');
const locationsRouter            = require('./routes/locations');
const resourcesRouter            = require('./routes/resources');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

// x-user-name ヘッダーのデコード（フロントが encodeURIComponent で送信）
app.use((req, _res, next) => {
    const raw = req.headers['x-user-name'];
    if (raw) {
        try { req.headers['x-user-name'] = decodeURIComponent(raw); } catch { /* malformed — leave as-is */ }
    }
    next();
});

// ヘルスチェック
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ルーティング
// NOTE: /api/projects/gantt を先に登録しないと /:id に吸われる
app.use('/api/projects/gantt',                        projectsGanttRouter);
app.use('/api/projects',                              projectsRouter);
app.use('/api/projects/:project_id/events',           eventsRouter);
app.use('/api/projects/:project_id/alerts',           alertsRouter);
app.use('/api/projects/:project_id/locks',            locksRouter);
app.use('/api/projects/:id/apply-template',           applyTemplateRouter);
app.use('/api/templates',                             templatesRouter);
app.use('/api/alerts',                                alertsGlobalRouter);
app.use('/api/event-master',                          eventMasterRouter);
app.use('/api/projects/:id/save-as-pattern',          saveAsPatternRouter);
app.use('/api/process-patterns',                      processPatternsRouter);
app.use('/api/projects/:projectId/process-steps',     projectProcessStepsRouter);
app.use('/api/projects/:projectId/events/:eventId/apply-process-pattern', applyProcessPatternRouter);
app.use('/api/projects/:projectId/events/:eventId/save-process-pattern',  saveProcessPatternRouter);
app.use('/api/milestone-patterns',                                        milestonePatternsRouter);
app.use('/api/locations',                             locationsRouter);
app.use('/api/resources',                             resourcesRouter);

app.use(errorHandler);

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[ERROR] ポート ${PORT} は既に使用中です。`);
        console.error(`確認コマンド: netstat -ano | findstr :${PORT}`);
        console.error(`または: npm run check:ports`);
        process.exit(1);
    }
    throw err;
});

module.exports = app;
