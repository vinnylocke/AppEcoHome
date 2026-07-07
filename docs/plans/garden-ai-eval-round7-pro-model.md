# Garden AI — round 7: Pro-model cascade for agent-chat

Follows [round 6](garden-ai-eval-round6-mechanical-template.md). Consistency is fixed (4.05);
usability has been flat ~3.75 for four rounds. The chat currently answers via the shared
cost-first `DEFAULT_MODELS` cascade, whose top rung is **gemini-2.5-flash-lite** — the cheapest
model doing 55-tool agentic orchestration. Model quality is the last big lever.

## Change

`agent-chat/index.ts`: a dedicated quality-first cascade passed to every `callGeminiWithTools`
call (main loop, forced retry, knowledge fallback):

```
CHAT_MODELS = ["gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-2.5-flash"]
```

Both Pro ids smoke-tested live with function calling (✓ clean `add_plant_to_shed` calls). Flash
rungs remain as availability fallbacks so chat survives Pro overload. No other AI function
changes model.

## Cost / rollout note

Pro ≈ 10–20× flash-lite per token; chat is quota-capped per tier (5/25/100/9999 msgs/day).
This round is a flat swap **as an experiment**. If results justify keeping it, the production
recommendation is a per-tier cascade (Pro for Sage/Evergreen, flash rungs for Botanist) —
decided after the eval.

## Rollout

Deploy `--bump 1` → run 96 → rate (8 batches, rubric v1.1 unchanged) → 8-run report → compare
35.0015 (flash-lite) vs 35.0016 (Pro) like-for-like. Watch: usability, tool-verdict mix,
argument correctness (E23-style), latency anecdotally, tokens.
