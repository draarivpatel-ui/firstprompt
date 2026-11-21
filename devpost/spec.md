---
doc: spec
status: draft
---

# FirstPrompt technical specification

## Architecture

The static page loads `js/app.js` as an ES module. It imports the pure functions in `js/simulator.js`. All five lessons share that engine. No dependency installation or build step is required.

## Calculations

The tokenizer applies explicit splitting rules. Pricing multiplies token count by the illustrative price. Centered logits and softmax shape weighted next-word odds, top k removes entries, and seeded sampling walks the same table.

Positive finite diagnostic weights are normalized before entropy and inverse Simpson support are computed. Temperature sweeps have at most 64 engine points; the page selects 4 to 24. The top-k sweep is a helper rather than a separate visible chart.

Conversation accounting uses the same tokenizer. Truncation preserves fitting priority messages and then a recent whole-message block within the cap. A fixed summary stub uses spare capacity. Retention divides retained original token count by original token count and excludes the stub.

## Files

- `index.html` and `styles.css` contain five lessons and the existing visual system.
- `js/simulator.js` contains tokenization, probability shaping, sampling, accounting and diagnostics.
- `js/app.js` renders the calculations and binds native controls.
- `tests/` contains engine, mounted controller, markup and self-scanning content tests.
- `README.md` and `DEVPOST_UPGRADE.md` record exact verification counts and limits.

## Local use

Run `npm test` with Node 18 or newer. Serve the repo with `python3 -m http.server 8000` and open the local server URL. Local module loading requires a static server.

## Failure handling

Oversized priority messages cannot override the cap. Duplicate message identifiers are rejected. Nonfinite probability entries do not become measured quality scores. Clipboard failures have a fallback and a readable manual-copy message. State is ephemeral and no deployment is inferred from local results.
