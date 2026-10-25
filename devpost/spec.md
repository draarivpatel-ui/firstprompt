---
doc: spec
status: draft
---

> Retrospective note: this document was produced on 2026-10-24 by running the
> Devpost Learn Skill Pack (challengepost/learn-ai-basics) against the finished
> FirstPrompt build, after the app was created from an empty folder during the
> submission period. It records the architecture the build actually used.

# FirstPrompt: Technical Spec

## How This Works, In Plain Language

Everything is one web page with a few pieces of plain JavaScript beside it. A
tokenizer splits your text into tokens by rules you could write on a napkin. A
sampler holds a small table of "which word tends to follow which" and turns a
temperature number into different odds for the next word, then draws samples
using a seed so the same seed always gives the same sentences. A meter counts
tokens in a pretend conversation and shows what three different truncation
strategies would keep. A builder glues four labeled prompt parts into one
copyable string. There is no server and no database: the page computes
everything when you move a control, and forgets everything when you leave.

This shape rather than something more elaborate because the lesson is the
machinery itself: any backend or framework would hide the parts being taught
and break the reproducibility promise.

## The Core Journey Through the System

The user types in Lesson 1 → the tokenizer produces chips and a count → the
same tokenizer sizes the segments in Lesson 3's meter. The user moves the
temperature dial in Lesson 2 → softmax over scaled logits → top-k with
renormalization over the bigram table → the odds bars and the SVG needle update
→ Draw Three Samples walks the table with the seed and prints sentences. In
Lesson 3, overflow of the chosen window triggers the three strategies on the
same conversation state. In Lesson 4, the four fields assemble into the labeled
prompt whose token count uses the same tokenizer.
PRD ref: `prd.md > The Core Journey`.

## Stack

- Vanilla HTML, CSS, JavaScript (no framework, no build step, no dependencies)
  so every lesson stays inspectable and the page works offline. Tradeoff
  accepted: no component magic; the app is small enough not to need it.
- SVG for the temperature dial (drawn in code, no image assets).
- `node:test` (built into Node 18+) for the 42-test suite: zero packages to
  install; `npm test` is the whole setup.
- GitHub Pages for hosting (static files only).

## Where It Runs and How Someone Tries It

Runs in any modern browser. No keys, no accounts, no installs.
- Try it: open `https://aariv.me/firstprompt/` (or open `index.html` directly).
- Tests: `npm test` with Node 18 or newer.
- Demo recording: open the page, walk the four lessons top to bottom, draw
  samples twice with the same seed to show determinism.
- Deployment: GitHub Pages on the main branch (already live).

## Look and Feel

Deep pine green canvas, chalk ink text, one chalk gold accent, all declared as
CSS custom properties and referenced by name. Oversized lesson numerals and big
mono readouts. System serif display, system sans body, system mono numerals.
Spacious and calm. Reduced motion honored; the dial's eased motion is the one
signature animation. PRD ref: `prd.md > Look and Feel`.

## Components

### Tokenizer (js/simulator.js)
Rule based split into whole-word, subword, and punctuation/digit tokens with
per-token pricing math.
PRD ref: `prd.md > Words Become Tokens (Lesson 1)`.

### Sampler (js/simulator.js)
Softmax over temperature-scaled logits, top-k renormalization, and seeded walks
over the hand authored bigram table.
PRD ref: `prd.md > One Word At A Time (Lesson 2)`.

### Context meter and truncation strategies (js/app.js)
Stacked meter sized by the shared tokenizer; Recent First, Keep The Opener, and
Summarize The Middle compared on identical state.
PRD ref: `prd.md > The Context Window (Lesson 3)`.

### Prompt builder (js/app.js)
Assembles the labeled four-part prompt, counts tokens, copies with clipboard
API plus fallback.
PRD ref: `prd.md > Prompt Builder (Lesson 4)`.

### Page and accessibility (index.html, styles.css)
Skip link, single h1, landmarks, live regions, focus visibility, reduced motion.
PRD ref: `prd.md > States and Boundaries` (honesty boundary).

## Data Model

All state lives in memory per lesson: the Lesson 1 input string; the dial's
temperature, top-k, and seed; the Lesson 3 message array with chosen window
size; the Lesson 4 field values. Nothing persists between visits, by design
(labeled in the footer). No schema to migrate, nothing to sync.

## File Structure

```
firstprompt/
├── index.html          # one page, four lesson sections
├── styles.css          # chalkboard theme, custom properties, reduced motion
├── js/
│   ├── simulator.js    # tokenizer, sampler, truncation, prompt assembly (pure logic)
│   └── app.js          # DOM wiring, rendering, events
├── tests/
│   └── simulator.test.js  # 42 node:test cases over the pure logic
├── devpost/            # Devpost learning workspace (this folder)
├── video/              # demo capture and narration sources
├── package.json        # `npm test` script only
└── NOTES.md            # build notes and design direction
```

## External Services and Dependencies

None. No APIs, no fonts, no analytics, no storage, no CDNs. That absence is a
stated feature (the honesty badge), not an omission.

## Important Failure Modes

- **Clipboard API unavailable** (strict contexts) → the prompt builder shows a
  fallback selection path so the prompt can still be copied.
- **Very large inputs** in Lesson 1 or 3 → token counting stays linear; the
  meter caps its visual segments and reports counts numerically.
- **Reduced motion preference** → the dial's eased animation is skipped; all
  state changes remain visible through the bars and numerals.

## What Was Simplified and Why

- **Rule based tokenizer** instead of a real BPE tokenizer: the approximation
  teaches the same concept and is labeled as a simulation; the real tokenizer
  would require model vocab downloads.
- **Hand authored bigram table** instead of a real model: small enough to
  inspect, real enough to make softmax and top-k honest.
- **Fixed seed sampling** instead of live randomness: reproducibility is the
  proof the lessons can be trusted.

The fuller versions would each import external data or APIs and break the
zero-setup, offline promise. The kernel (watch odds reshape, replay a draw) is
never faked.

## Decisions and Open Issues

- Simulation over API: learner-level product decision (see
  `prd.md > Product Decisions`); tradeoff is realism for transparency and
  reproducibility.
- One shared tokenizer across lessons: implementation decision derived from
  the consistency requirement; accepted cost is that Lesson 3 counts match
  Lesson 1's approximation rather than any real model.
- Genuine uncertainty discussed: how to make determinism visible rather than
  claimed. Resolved with seeded sampling plus a replay path (same seed, same
  three sentences) and tests asserting exact reproducibility in
  `tests/simulator.test.js`.
- Nothing unresolved; open questions from `prd.md > Open Questions`: none.
