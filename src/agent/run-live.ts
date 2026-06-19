import { mkdirSync } from 'node:fs';
import { loadDotEnv } from './env.js';
import { AutopsyStorage } from '../core/storage.js';
import { BitgetHubClient } from './bitget-hub.js';
import { runForSymbol, exportApiLog } from './run-symbol.js';
import { parseSymbolList } from '../config/symbols.js';
import { getDbPath, ensureWritableDirs } from '../config/paths.js';

loadDotEnv();

const DB_PATH = getDbPath();
const SYMBOLS = parseSymbolList(process.env.AGENT_SYMBOLS ?? process.argv.find((a) => a.startsWith('--symbols='))?.split('=')[1]);
const CLEAR = process.argv.includes('--clear');
const WATCH = process.argv.includes('--watch');
const WATCH_MS = Number(process.env.AGENT_WATCH_MS ?? 60_000);

async function runOnce(storage: AutopsyStorage, hub: BitgetHubClient) {
  const results = [];
  for (const symbol of SYMBOLS) {
    console.log(`\n  → ${symbol}`);
    try {
      const recorded = await runForSymbol(storage, hub, symbol);
      console.log(`    Price:  $${recorded.inputs.price?.toLocaleString()}`);
      console.log(`    Action: ${recorded.action.type} · Risk ${recorded.risk.overall}/100 (${recorded.risk.grade})`);
      results.push(recorded);
    } catch (err) {
      console.error(`    ✗ ${err instanceof Error ? err.message : err}`);
    }
  }
  if (results.length) {
    const exportPath = exportApiLog(storage, results[results.length - 1]);
    console.log(`\n  ✓ ${results.length} decision(s) recorded → ${exportPath}`);
  }
  return results;
}

async function main() {
  console.log('\n  WhyBot — Live Agent');
  console.log('  ───────────────────────────');
  console.log(`  Symbols: ${SYMBOLS.join(', ')}`);

  const hub = new BitgetHubClient({ readOnly: true });
  console.log(hub.hasAuth ? '  Auth:    ✓ API key loaded' : '  Auth:    ○ Public market data (no key needed)');

  ensureWritableDirs();
  const storage = new AutopsyStorage(DB_PATH);
  if (CLEAR) {
    storage.clear();
    console.log('  DB:      cleared');
  }

  if (WATCH) {
    console.log(`  Mode:    watch (every ${WATCH_MS / 1000}s) — Ctrl+C to stop\n`);
    await runOnce(storage, hub);
    const interval = setInterval(() => runOnce(storage, hub).catch(console.error), WATCH_MS);
    process.on('SIGINT', () => { clearInterval(interval); storage.close(); process.exit(0); });
  } else {
    await runOnce(storage, hub);
    console.log('\n  Dashboard: npm run dev → http://localhost:3847\n');
    storage.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
