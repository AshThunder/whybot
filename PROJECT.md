# WhyBot — Project Description

**Track:** Trading Infra · Bitget AI Hackathon S1  
**Live demo:** [whybotai.vercel.app](https://whybotai.vercel.app)  
**GitHub:** [github.com/AshThunder/whybot](https://github.com/AshThunder/whybot)

---

## Section 1: Idea

### Pain point

AI trading agents make decisions constantly, but **agent developers and operators** rarely see *why* a trade happened. Logs show fills and PnL, not whether the bot followed its thesis, respected size limits, or used signals correctly. When something goes wrong, it fails silently — there's no report card.

### What WhyBot does

WhyBot is a **post-trade explainability layer** for any trading agent. It does **not** run your strategy. After each decision, an agent sends one JSON payload; WhyBot records **inputs → reasoning → action → safety score** and shows it on a live dashboard.

### How it works

1. **Ingest** — `POST /api/decisions` from any bot (Qwen, Bitget Agent Hub, Python, etc.)
2. **Score** — Five dimensions: position sizing, thesis alignment, risk controls, confidence calibration, signal quality
3. **Display** — Per-coin reports, trends, PNG share cards, proof log of Bitget API calls

### Built-in demo

The **Live Regime Router** reads live Bitget public data (tickers, candles, order book, trade flow, open interest, funding) and makes rule-based HOLD/BUY/SKIP decisions so anyone can click **Check market** on the live demo without wiring their own agent.

### Why it matters for agent development

Other teams build smarter traders. WhyBot makes every trader **auditable** — the infra layer the ecosystem is missing.

---

## Section 2: Progress

### Challenges & solutions

| Challenge | Solution |
|-----------|----------|
| Agents all looked the same on the dashboard | Market-aware scoring so HOLD/SKIP scores vary by signal clarity |
| Vercel serverless + SQLite | Ephemeral `/tmp` DB; "Check market" repopulates live data on each visit |
| Opaque bot reasoning | Plain-English "Why" block + shareable PNG cards with full explanation |
| External agent integration | HTTP API + `AutopsySession` SDK; any language can POST decisions |

### Completed

- Live Bitget public API integration (7 endpoints per coin, 10 default pairs)
- Dashboard: coin list, safety scores, trends, agent filter, PNG export
- Risk scorer with flags (e.g. missing stop-loss, thesis mismatch, passed clear setup)
- `POST /api/decisions` for external agents
- CI, Vercel deploy, README + example script

### Not done / next steps

- Persistent DB on Vercel (Turso/Postgres)
- Optional Qwen demo agent posting to WhyBot
- Outcome-based calibration when real PnL is wired in

### Tech stack

- **Runtime:** Node 20, TypeScript, Express
- **Data:** SQLite (`better-sqlite3`)
- **Frontend:** HTML, Tailwind, vanilla JS
- **Deploy:** Vercel (static + serverless API)
- **CI:** GitHub Actions

### Bitget tools used

- **Bitget public market APIs** — spot/futures tickers, candles, depth, trades, open interest, funding (no keys required)
- **Agent Hub pattern** — MCP-style tool call logging in each decision record
- Compatible with **Agent Hub / Skill Hub** bots via `POST /api/decisions`

---

## Section 3: AI Trading Thoughts (optional)

Most projects focus on *making* agents trade. The harder problem is *trusting* them. Agentic trading needs explainability infra as much as it needs better models — especially when developers and end users can't read raw JSON or MCP logs.

Bitget's Agent Hub direction is right: standardize tools and skills. What's still missing is a **report card** that any hub agent can plug into after each decision. WhyBot is that layer: small integration, big transparency.

Suggestion: a first-class "decision audit" hook in Agent Hub (or Playbook) that auto-posts thesis, inputs, and action to a service like WhyBot would make every builder's agent more credible by default.
