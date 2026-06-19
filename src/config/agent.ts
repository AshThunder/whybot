/** Built-in demo agent (Check market) — override via .env */
export const DEFAULT_AGENT_ID = process.env.AGENT_ID ?? 'live-regime-router';
export const DEFAULT_AGENT_NAME = process.env.AGENT_NAME ?? 'Live Regime Router';

export function getBuiltInAgent() {
  return { id: DEFAULT_AGENT_ID, name: DEFAULT_AGENT_NAME };
}
