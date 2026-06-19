/**
 * Generate Agent Autopsy dashboard UI via Google Stitch.
 * Usage: STITCH_API_KEY=... npx tsx scripts/generate-ui.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { stitch } from '@google/stitch-sdk';

const PROMPT = `
Design a desktop web dashboard called "Agent Autopsy" — post-trade explainability for AI trading agents.
This is a professional fintech developer tool for the Bitget AI Hackathon (Trading Infra track).

DESIGN SYSTEM (Coinbase-inspired — follow exactly):
- Canvas: white #ffffff for main content areas
- Dark hero/header band: #0a0b0d background, white #ffffff text
- Primary accent: Coinbase Blue #0052ff — use ONLY for primary buttons and key accent moments (sparingly)
- Ink text: #0a0b0d for headings
- Body text: #5b616e
- Muted text: #7c828a
- Hairline borders: #dee1e6
- Surface soft: #f7f7f7 for alternating bands
- Surface strong: #eef0f3 for secondary buttons, badges, icon plates
- Dark elevated cards: #16181c on dark backgrounds
- Semantic up (green): #05b169 — text only for positive PnL, BUY actions
- Semantic down (red): #cf202f — text only for negative PnL, SELL actions
- Typography: Inter font. Display headlines weight 400 (not bold). Body 400/600. Numbers in JetBrains Mono.
- Border radius: pills 100px for buttons/badges, 24px for cards, 12px for inputs
- NO drop shadows except subtle 0 4px 12px rgba(0,0,0,0.04) on hover
- Editorial calm institutional aesthetic — NOT cyberpunk, NOT neon, NOT dark-mode-only

LAYOUT (1200px max width, centered):

1. TOP NAV (64px, white canvas OR dark #0a0b0d):
   - Left: "Agent Autopsy" wordmark + subtitle "Post-Trade Explainability for AI Trading Agents"
   - Right: badge pill "Bitget Hackathon S1 · Trading Infra" + secondary pill button "Refresh"

2. DARK HERO BAND (#0a0b0d, full width, 48px padding):
   - Left: headline "Every decision, explained." in display style (52px, weight 400, white)
   - Subhead in muted white (#a8acb3): "Inputs → Reasoning → Action → Risk Score"
   - Right: floating product-ui-card-dark (#16181c, 24px radius) showing a mini risk score widget: "72/100 Grade B" with a horizontal bar

3. STATS ROW (white canvas, 5 stat cards in a row):
   - Total Decisions: 7
   - Avg Risk Score: 68/100
   - Flagged: 2 (red text)
   - Agents Monitored: 2
   - Avg Confidence: 71%
   Each card: white bg, 1px hairline border, 24px radius, label in caption uppercase muted, value in mono font large

4. MAIN TWO-COLUMN LAYOUT (gap 24px):
   
   LEFT COLUMN (380px) — "Decision Timeline":
   - White card, 24px radius, hairline border
   - Header with title + dropdown "All agents"
   - Scrollable list of 5 timeline items, each showing:
     * Action type (BUY green / SELL red / HOLD gray) + symbol
     * Grade badge (A/B/C/D/F in colored pill)
     * Timestamp, agent name, risk score
     * Truncated thesis text
   - First item highlighted with subtle blue tint border

   RIGHT COLUMN — Decision Detail Panel:
   - White card, 24px radius
   - Header: thesis as title + large risk score "72" with "Risk Score (B)" label
   - Sections with uppercase blue (#0052ff) section labels:
     * REASONING CHAIN — paragraph text in surface-soft box
     * MARKET INPUTS — 2x2 grid of signal cards (Sentiment, Macro, Technical, On-Chain) with key metrics
     * ACTION TAKEN — key-value rows (Type, Symbol, Size, Price, Stop Loss, Take Profit)
     * OUTCOME — PnL in green/red, balance, executed status
     * RISK AUTOPSY — 5 dimension bars (Position Sizing, Thesis Alignment, Risk Controls, Confidence Calibration, Signal Quality) with scores and rationale
     * BITGET AGENT HUB MCP CALLS — list of tool call cards with tool name in blue mono, module, response summary, duration

Use realistic sample data for a BTCUSDT trading agent called "Regime Router Agent".
Make it look like a polished Coinbase institutional product page turned into a dashboard.
Desktop only, 1440px viewport width.
`.trim();

async function downloadUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  return res.text();
}

async function main() {
  if (!process.env.STITCH_API_KEY) {
    console.error('Set STITCH_API_KEY environment variable');
    process.exit(1);
  }

  console.log('Creating Stitch project...');
  const createResult = await stitch.callTool<{ projectId?: string; name?: string }>(
    'create_project',
    { title: 'Agent Autopsy Dashboard' }
  );
  console.log('Create result:', JSON.stringify(createResult, null, 2));

  const projectId =
    (createResult as { projectId?: string }).projectId ??
    (createResult as { id?: string }).id ??
    extractId(createResult);

  if (!projectId) {
    throw new Error('Could not extract projectId from create_project response');
  }

  console.log(`Project ID: ${projectId}`);
  console.log('Generating screen (this may take 1-2 minutes)...');

  const project = stitch.project(String(projectId));
  const screen = await project.generate(PROMPT, 'DESKTOP');

  console.log(`Screen ID: ${screen.screenId}`);
  const htmlUrl = await screen.getHtml();
  const imageUrl = await screen.getImage();

  console.log('Downloading HTML...');
  const html = await downloadUrl(htmlUrl);

  const outDir = join(process.cwd(), 'public', 'stitch');
  mkdirSync(outDir, { recursive: true });

  const htmlPath = join(outDir, 'dashboard.html');
  const metaPath = join(outDir, 'meta.json');

  writeFileSync(htmlPath, html);
  writeFileSync(metaPath, JSON.stringify({
    projectId,
    screenId: screen.screenId,
    htmlUrl,
    imageUrl,
    generatedAt: new Date().toISOString(),
  }, null, 2));

  console.log(`\nSaved: ${htmlPath}`);
  console.log(`Preview image: ${imageUrl}`);
  console.log(`\nOpen public/stitch/dashboard.html in browser to preview Stitch output.`);
}

function extractId(obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  for (const key of ['projectId', 'id', 'name']) {
    const val = o[key];
    if (typeof val === 'string') {
      const match = val.match(/\d+/);
      if (match) return match[0];
      if (key === 'projectId' || key === 'id') return val.replace(/^projects\//, '');
    }
  }
  if (o.result && typeof o.result === 'object') return extractId(o.result);
  return undefined;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
