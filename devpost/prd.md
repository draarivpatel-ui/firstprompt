---
doc: prd
status: draft
---

> Retrospective note: this document was produced on 2026-10-24 by running the
> Devpost Learn Skill Pack (challengepost/learn-ai-basics) against the finished
> FirstPrompt build, after the app was created from an empty folder during the
> submission period. It records the behavior the built app actually implements;
> acceptance criteria are checkable against `tests/simulator.test.js` (42 tests).

# FirstPrompt — Product Requirements

One line: a four lesson interactive primer on how language model text generation
works, for curious builders who have used prompts but never seen the machinery.
Source: `scope.md > The Core Loop`, `scope.md > Who It's For`.

## The Core Journey

1. They open the page on any device. A header states plainly that everything is
   a labeled simulation, and four numbered lessons sit on one scrolling page.
2. Lesson 1: they type or paste text and watch it split into token chips,
   color coded whole-word / subword / punctuation-and-digits, with a running
   cost estimate they can reprice by editing the per-token price.
3. Lesson 2: they drag the temperature dial (0 to 2) and the top-k slider and
   watch the next-word odds reshape live over the hand authored bigram table.
   They press Draw Three Samples and read three seeded sentences.
4. Lesson 3: they add messages to a conversation and watch the context meter
   fill by real token counts; on overflow they compare three truncation
   strategies applied to the same state, with kept and dropped messages tagged
   in place.
5. Lesson 4: they assemble a prompt from Role, Task, Constraints and Format,
   read what each part is for, and copy the labeled result with one click.
6. Success is a person who can say what temperature, tokens, context windows,
   and structured prompting actually do — having watched each one move.

## Screens and Layout

One static page, four lesson sections stacked in order, each with its heading
number oversized. Controls are native (sliders, buttons, text areas), all
keyboard operable, with a skip link and landmarks. No routing, no modal surfaces.

## Look and Feel

Friendly classroom chalkboard meets clean editorial: deep pine green canvas,
chalk ink text, one chalk gold accent, generous whitespace, system serif
display type, system sans body, system mono numerals. Source:
`scope.md > Inspiration & Identity`.

## Features and Behavior

### Words Become Tokens (Lesson 1)

Editable input drives a rule based tokenizer: common words stay whole, longer
words split into subword pieces, punctuation and digit runs become their own
tokens. Chips are color coded by kind; a cost readout multiplies token count by
an editable per-token price and shows the per-million equivalent.

- As a first-time learner, I want to see exactly how my sentence becomes tokens
  so that "token" stops being jargon.
  - [ ] Identical input always produces identical chips (deterministic rules).
  - [ ] Changing the per-token price updates both the total and per-million figures.

### One Word At A Time (Lesson 2)

A large SVG dial maps temperature 0 to 2 across Predictable, Balanced and
Adventurous zones. Softmax over scaled logits, then top-k with renormalization,
reshapes the odds over a hand authored bigram table. A caption names the current
regime. Draw Three Samples runs three seeded walks.

- As a learner, I want to watch odds reshape as I turn the dial so that
  temperature is a felt concept, not a number.
  - [ ] Same seed and settings reproduce the same three sentences exactly.
  - [ ] Temperature 0 picks the highest-odds continuation; high temperature
    flattens the distribution.

### The Context Window (Lesson 3)

A stacked meter fills as messages are added, each segment sized by its real
token count from the Lesson 1 tokenizer. When the conversation exceeds the
chosen window (64, 128 or 256 tokens), three truncation strategies compare on
the same state: Recent First, Keep The Opener (pins the first user message),
Summarize The Middle (fixed budget for a stand-in summary). Kept and dropped
messages are tagged in the transcript.

- As a learner, I want to see what actually gets dropped when a conversation
  overflows so that context limits make sense.
  - [ ] Segment sizes match the shared tokenizer's counts.
  - [ ] Keep The Opener never drops the first user message; all three
    strategies fit inside the chosen window.

### Prompt Builder (Lesson 4)

A structured composer with Role, Task, Constraints and Format fields. It
assembles a copyable prompt with each part labeled, counts its tokens, explains
each part's purpose, and offers a one-click example. Copy uses the clipboard
API with a fallback for stricter contexts.

- As a learner, I want a structured prompt I can copy so that the lesson
  carries into my real prompting.
  - [ ] The assembled prompt contains all four labeled parts.
  - [ ] Copy works, or the fallback selection path appears when the clipboard
    API is unavailable.

## States and Boundaries

- **First use** — every lesson is usable empty: samples, placeholder
  conversations, and an example prompt are one click away.
- **Empty input (Lesson 1)** — zero tokens shown honestly; no fake data.
- **Overflow (Lesson 3)** — the trigger for the strategy comparison, not an
  error; the meter shows the overflow clearly.
- **No persistence** — the page stores nothing; a refresh starts clean, and the
  footer says so.
- **Honesty boundary** — the header badge and footer note label the whole page
  as a simulation; the tokenizer and bigram table are approximations and are
  named as such.

## Product Decisions

- Simulation instead of a real model API — zero setup, reproducible numbers,
  and nothing to pay for; labeled as a simulation everywhere.
- Fixed seeds on sampling — so a learner can verify determinism themselves by
  replaying a draw; trust comes from repeatability.
- One shared tokenizer across lessons 1 and 3 — counts stay consistent and the
  lessons reinforce each other.
- Hand authored bigram table — small enough to inspect, real enough to teach
  softmax and top-k honestly.

## What We're Building

The single static page with the four lessons above, the shared tokenizer,
seeded sampler, truncation comparison, prompt builder, and the 42-test
`node:test` suite covering all of it.

## Deferred From the POC

- A real model backend — the lessons teach the mechanics; wiring an API would
  add keys, cost, and non-determinism.
- More lessons (embeddings, attention) — worth doing, not needed to prove the
  kernel.
- Saving conversations or prompts — nothing in the loop needs persistence.

## Possible Later Enhancements

A classroom mode with guided worksheets. A "real tokenizer" toggle that loads
model vocab data. More sampling parameters (frequency, presence penalties).

## Non-Goals

- No accounts, storage, or network calls of any kind.
- No claim to model-accurate outputs; every approximation is labeled.
- No mobile app; the page is responsive but stays a web page.

## Open Questions

None blocking; the retrospective run resolved the acceptance criteria against
the implemented tests.
