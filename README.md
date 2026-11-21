# FirstPrompt

An interactive primer on tokenization, next-word sampling, context limits and prompt assembly. Every result comes from a deterministic local simulator. The tokenizer and bigram table are teaching fixtures, and no hosted model is contacted.

## Five lessons

1. Edit text, inspect rule-based token pieces, and calculate cost from an illustrative price you enter.
2. Change temperature and top k, inspect the resulting probabilities, and generate repeatable sentences from a seed.
3. Fill a teaching-sized context window and compare recent, bookends and fixed-summary truncation strategies.
4. Assemble a prompt from role, task, constraints and format, then copy the result.
5. Inspect uncertainty, a real temperature sweep and retained-token comparisons across the same three truncation strategies.

## Computed metrics

- `entropy` normalizes positive finite weights and computes Shannon entropy in bits.
- `entropySupport` computes `2^H`. `distributionDiagnostics` also reports inverse Simpson effective support, top probability and original input mass. An overflowing input mass is `null`; normalized metrics remain finite.
- `temperatureSweep` recomputes actual shaped distributions at each point, with a hard limit of 64 points. The UI selects 4 to 24.
- `topKSweep` is an exported, tested helper for support growth; it is not a separate chart on the page.
- `compareTruncationStrategies` reports kept and dropped messages, token usage and retained original tokens. Summary-stub tokens are not counted as retained conversation.
- System messages and the first user message receive priority only when they fit the hard token cap. Zero and undersized caps omit whole messages and stay within budget. Message identifiers must be unique.

These scores measure this small simulation. They do not measure answer quality or semantic recall.

## Run and verify

Node 18 or newer, without installing packages.

```bash
npm test
python3 -m http.server 8000
```

Open the server URL. ES module loading requires a static server rather than a file URL.

## Files

- `js/simulator.js` contains the pure engine and analytics.
- `js/app.js`, `index.html` and `styles.css` contain five lessons and their controls.
- `tests/` covers engine math, invariants, UI wiring and working-tree content.
- `devpost/` contains retrospective draft planning notes.
- `DEVPOST_UPGRADE.md` records the completed repairs.

<!-- verification -->

MIT. See `LICENSE`.
