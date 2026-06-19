# WhyBot

**Why did the bot do that?** Post-trade explainability for AI trading agents — Bitget AI Hackathon S1, Trading Infra track.

Every trading agent fails silently. WhyBot records *why* an agent made each decision and scores decision quality retroactively.

![CI](https://github.com/AshThunder/whybot/actions/workflows/ci.yml/badge.svg)

## Thesis

AI trading agents make opaque decisions. Builders and judges can't verify whether an agent's action matched its thesis, respected risk limits, or used signals correctly. WhyBot hooks into the Agent Hub decision loop and produces a verifiable audit trail: **inputs → reasoning → action → outcome → risk score**.

## Quick Start

```bash
npm install
cp .env.example .env          # already included locally — add Bitget keys if you want
npm run dev                   # dashboard at http://localhost:3847
npm run agent:all             # fetch LIVE Bitget data for 10 coins
```

For demo/sample data only (not live):

```bash
npm run demo                  # 7 scripted decisions for UI preview
```

## Environment (`.env`)

A local `.env` file is included (gitignored). Copy from `.env.example` if missing:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3847` | Local server port |
| `AGENT_SYMBOLS` | 10 coins | Comma-separated pairs to analyze |
| `BITGET_API_KEY` | empty | Optional — public market data works without keys |
| `AGENT_ID` | `live-regime-router` | Built-in bot id (Check market) |
| `AGENT_NAME` | `Live Regime Router` | Built-in bot display name |
| `DASHBOARD_POLL_MS` | `5000` | Auto-refresh interval |

## Connect your agent

WhyBot is a **report card layer** — it does not run your trading bot. After each decision, send one payload; WhyBot scores it and shows it on the dashboard.

### Option A — HTTP (any language)

```bash
curl -X POST http://localhost:3847/api/decisions \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-bitget-bot",
    "agentName": "My Bitget Strategy Bot",
    "thesis": "BTC range-bound — no edge",
    "reasoning": "24h move flat, RSI 52, funding neutral. Waiting.",
    "confidence": 72,
    "inputs": {
      "symbol": "BTCUSDT",
      "price": 63000,
      "technical": { "rsi": 52, "trend": "neutral" },
      "sentiment": { "fundingRate": 0.0001 }
    },
    "action": { "type": "HOLD", "symbol": "BTCUSDT" },
    "mcpToolCalls": [{
      "tool": "spot_get_ticker",
      "module": "spot",
      "params": { "symbol": "BTCUSDT" },
      "responseSummary": "OK",
      "durationMs": 120
    }],
    "tags": ["LIVE"]
  }'
```

Returns `201` with the decision plus an auto **safety score** (you do not send `risk`).

Filter in the dashboard header (**All agents** dropdown) or via API:

```bash
curl "http://localhost:3847/api/decisions?agentId=my-bitget-bot"
```

See also: [`examples/post-decision.sh`](./examples/post-decision.sh)

### Option B — TypeScript / Node

```typescript
import { AutopsyStorage } from './src/core/storage.js';
import { AutopsySession } from './src/core/logger.js';

const storage = new AutopsyStorage('./data/whybot.db');
const session = new AutopsySession(storage, 'my-bitget-bot', 'My Bitget Strategy Bot');

session.logMcpCall({
  tool: 'futures_get_ticker',
  module: 'futures',
  params: { symbol: 'BTCUSDT' },
  responseSummary: 'OK',
  durationMs: 95,
});

session.record({
  thesis: '…',
  reasoning: '…',
  confidence: 75,
  inputs: { symbol: 'BTCUSDT', price: 63000 },
  action: { type: 'HOLD', symbol: 'BTCUSDT' },
  tags: ['LIVE'],
});
```

### Required fields

| Field | Description |
|-------|-------------|
| `agentId` / `agentName` | Your bot identity |
| `thesis` | One-line summary |
| `reasoning` | Full explanation |
| `confidence` | 0–100 |
| `inputs` | What the bot saw (`symbol`, `price`, optional `technical`, `sentiment`, `bitget`) |
| `action` | `BUY` / `SELL` / `HOLD` / `SKIP` + `symbol` |

Optional: `mcpToolCalls` (Bitget API proof), `outcome` (PnL if executed), `tags`.

### Built-in demo bot vs yours

| Button / endpoint | What it runs |
|-------------------|--------------|
| **Check market** (`POST /api/analyze`) | Built-in **Live Regime Router** — reads Bitget public APIs + simple rules in `src/agent/signals.ts` |
| **Your integration** (`POST /api/decisions`) | **Your** Bitget Agent Hub bot — any strategy, any language |

Rename the built-in bot in `.env`:

```env
AGENT_ID=my-team-bot
AGENT_NAME=My Team Router
```

## Tests & CI

```bash
npm test          # unit + API tests (Node built-in test runner)
npm run test:ci   # build + test (same as GitHub Actions)
```

GitHub Actions runs on every push/PR: `npm ci` → `npm run build` → `npm test`.

## Deploy on Vercel (full stack)

The app runs entirely on Vercel: static dashboard + serverless API.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/AshThunder/whybot)

### One-click deploy

1. Push this repo to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Framework preset: **Other** (uses `vercel.json`)
4. Add environment variables (optional):

| Variable | Recommended on Vercel |
|----------|----------------------|
| `AGENT_SYMBOLS` | `BTCUSDT,ETHUSDT,SOLUSDT` (fewer = faster analyze) |
| `BITGET_API_KEY` | optional |
| `BITGET_SECRET_KEY` | optional |
| `BITGET_PASSPHRASE` | optional |

5. Deploy — your site will be `https://your-project.vercel.app`

### How Vercel hosting works

| Part | Where it runs |
|------|----------------|
| Dashboard (`index.html`, `app.js`) | Vercel CDN (`public/`) |
| API (`/api/*`) | Serverless function (`api/index.ts`) |
| Database | SQLite in `/tmp` (ephemeral between cold starts) |

**Important for judges:** On Vercel, click **Check market now** to pull live Bitget data. History may reset after idle time — that is normal for the free serverless tier. For persistent history, run locally or add Turso/Postgres later.

### Manual deploy

```bash
npm i -g vercel
vercel          # first time — link project
vercel --prod   # production deploy
```

## UI Design

The dashboard UI was generated with **[Google Stitch](https://stitch.google.com/)** using the Coinbase design system defined in [`DESIGN-coinbase.md`](./DESIGN-coinbase.md):

- White canvas + `#0a0b0d` dark hero band
- Coinbase Blue `#0052ff` as sole accent
- Inter + JetBrains Mono typography
- 24px card radius, pill buttons

Stitch source output: `public/stitch/dashboard.html`  
Integrated live dashboard: `public/index.html` (wired to API)

## Bitget API keys

The live agent calls **real Bitget public market APIs** with no key required. API keys are **optional** — they unlock account balance snapshots.

### How to create a key

1. Log in at [bitget.com](https://www.bitget.com)
2. Click your **profile avatar** (top right) → **API Management**
3. Click **Create API Key**
4. Choose **System-generated API Key**
5. Set a **Passphrase** (you choose this — save it, Bitget won't show it again)
6. Permissions: **Read** is enough for WhyBot
7. Copy **API Key**, **Secret Key**, and **Passphrase** into `.env`

### Run the live agent

```bash
npm run agent          # append to existing DB
npm run agent:all      # all 10 default coins
npm run agent:clear    # wipe DB, then record fresh
npm run agent:watch    # repeat every 60s
```

Each run hits real Bitget endpoints, records a decision with timestamps, and exports `logs/api-call-log.json`.

## Default tokens (10)

BTC · ETH · SOL · BNB · XRP · DOGE · ADA · AVAX · LINK · ARB

Override with `AGENT_SYMBOLS=BTCUSDT,ETHUSDT,...` in `.env`.

## Architecture

```
Agent (Bitget Agent Hub MCP)
    │
    ▼
AutopsySession.record()     ← log inputs, reasoning, action, MCP calls (internal SDK class name)
    │
    ▼
Risk Scorer                 ← 5 dimensions: sizing, thesis, controls, calibration, signals
    │
    ▼
SQLite + REST API           ← /api/decisions, /api/stats
    │
    ▼
Dashboard                   ← timeline + detail + PNG cards
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/meta` | Agents list + built-in bot info |
| GET | `/api/decisions` | List decisions (`?agentId=` filter) |
| POST | `/api/decisions` | **Connect your agent** — record a decision |
| POST | `/api/analyze` | Run built-in Live Regime Router |
| GET | `/api/summary` | Latest per coin (`?agentId=` filter) |
| GET | `/api/symbols/bitget` | Online USDT pairs from Bitget |
| GET | `/api/trends` | Safety score history |
| GET | `/api/export/log` | Download proof JSON |

## Risk Scoring Dimensions

| Dimension | Weight | What it checks |
|-----------|--------|----------------|
| Position Sizing | 25% | Size vs max allocation |
| Thesis Alignment | 25% | Action matches reasoning |
| Risk Controls | 20% | Stop-loss / take-profit defined |
| Confidence Calibration | 15% | Confidence vs actual outcome |
| Signal Quality | 15% | Multi-source inputs |

## Submission Artifacts

| Artifact | Location |
|----------|----------|
| GitHub repo | This repository |
| Live demo | Vercel deploy or `npm run dev` |
| API call log | `logs/api-call-log.json` or dashboard download |
| CI | `.github/workflows/ci.yml` |

## Track

**Trading Infra** — infrastructure that helps agents perform better. WhyBot is a monitoring and explainability layer any Bitget Agent Hub builder can integrate.

## License

MIT
