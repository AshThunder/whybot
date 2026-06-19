import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Writable data directory (local disk or Vercel /tmp). */
export function getDataDir(): string {
  if (process.env.AUTOPSY_DATA_DIR) return process.env.AUTOPSY_DATA_DIR;
  if (process.env.VERCEL) return '/tmp/whybot';
  return join(process.cwd(), 'data');
}

export function getDbPath(): string {
  if (process.env.AUTOPSY_DB_PATH) return process.env.AUTOPSY_DB_PATH;
  return join(getDataDir(), 'whybot.db');
}

export function getLogsDir(): string {
  if (process.env.AUTOPSY_LOGS_DIR) return process.env.AUTOPSY_LOGS_DIR;
  if (process.env.VERCEL) return join('/tmp/whybot', 'logs');
  return join(process.cwd(), 'logs');
}

export function getApiLogPath(): string {
  if (process.env.AUTOPSY_API_LOG_PATH) return process.env.AUTOPSY_API_LOG_PATH;
  return join(getLogsDir(), 'api-call-log.json');
}

export function ensureWritableDirs(): void {
  mkdirSync(getDataDir(), { recursive: true });
  mkdirSync(getLogsDir(), { recursive: true });
}
