#!/usr/bin/env bash
# Example: connect an external agent to WhyBot
# Usage: ./examples/post-decision.sh [base-url]
# Default base: http://localhost:3847

BASE="${1:-http://localhost:3847}"

curl -sS -X POST "${BASE}/api/decisions" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-bitget-bot",
    "agentName": "My Bitget Strategy Bot",
    "thesis": "Flat market — wait for clearer signal",
    "reasoning": "BTCUSDT at $63000, 24h move under 1%, RSI 52. Bot chose to hold.",
    "confidence": 74,
    "inputs": {
      "symbol": "BTCUSDT",
      "price": 63000,
      "technical": { "rsi": 52, "trend": "neutral" },
      "sentiment": { "fundingRate": 0.0001, "summary": "Neutral funding" }
    },
    "action": { "type": "HOLD", "symbol": "BTCUSDT" },
    "tags": ["LIVE", "EXAMPLE"]
  }' | head -c 500

echo ""
echo "Done — open ${BASE} and select agent 'My Bitget Strategy Bot' in the header dropdown."
