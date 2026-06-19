import { loadDotEnv } from '../dist/agent/env.js';
import { ensureWritableDirs } from '../dist/config/paths.js';
import { createApp } from '../dist/server/app.js';

loadDotEnv();
ensureWritableDirs();

const { app } = createApp();

export default app;
