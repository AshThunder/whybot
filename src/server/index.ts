import { createApp } from './app.js';
import { getDbPath } from '../config/paths.js';

const PORT = Number(process.env.PORT ?? 3847);
const DB_PATH = getDbPath();
const { app, storage } = createApp(DB_PATH);

app.listen(PORT, () => {
  console.log(`\n  WhyBot Dashboard`);
  console.log(`  ─────────────────────────`);
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  API:    http://localhost:${PORT}/api/decisions`);
  console.log(`  DB:     ${DB_PATH}\n`);
});

process.on('SIGINT', () => {
  storage.close();
  process.exit(0);
});

export { app, storage, createApp };
