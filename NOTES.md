# FirstPrompt Notes

An interactive primer that teaches how language model text generation actually works, computed
entirely by a transparent deterministic simulator in the browser. Built for the Build With AI:
Basics hackathon by Aariv Patel.

## What Was Built

A static single page app in `index.html` with four hands on lessons, vanilla HTML, CSS and
JavaScript, zero dependencies, no build step, GitHub Pages ready.

**Lesson 1, Words Become Tokens.** An editable text area drives a rule based tokenizer. Common
words stay whole, longer words split into subword pieces, punctuation and digit runs become their
own tokens. Chips color code the three kinds, and a running estimate multiplies the token count
by an editable per token price, with the per million equivalent shown alongside.

**Lesson 2, One Word At A Time.** A large SVG dial with a moving needle maps temperature from 0
to 2 across Predictable, Balanced and Adventurous zones. A small hand authored bigram table holds
the odds for the next word. Sliders for temperature and top k reshape the distribution live
(softmax over scaled logits, then top k with renormalization), a caption explains the current
regime, and a Draw Three Samples button runs three seeded walks through the table so the same
seed and settings always produce the same sentences.

**Lesson 3, The Context Window.** A stacked meter fills as messages are added, each segment sized
by its real token count from the same tokenizer as Lesson 1. When the conversation overflows the
chosen window size (64, 128 or 256 tokens), three truncation strategies are compared on the same
state: Recent First slides the window forward as one block, Keep The Opener additionally pins the
first user message, and Summarize The Middle trades a small fixed token budget for a stand in
summary of what was cut. Kept and dropped messages are tagged right in the transcript.

**Lesson 4, Prompt Builder.** A structured composer with Role, Task, Constraints and Format.
It assembles a copyable prompt with each part labeled, counts its tokens, explains what each part
is for, and offers a one click example. The copy button uses the clipboard API with a fallback
for stricter contexts.

Everything is labeled as a simulation, in the header badge and the footer note. There are no API
calls, no network requests, no fonts loaded, no analytics, no storage.

## Design Direction

Friendly classroom chalkboard meets clean editorial. One canvas color (deep pine green), chalk
ink, and a single accent (chalk gold), declared as CSS custom properties and referenced by name
everywhere. Oversized numerals appear as the four lesson numbers and as the big readouts. Human
Title Case headings, generous whitespace, system serif for display, system sans for body, system
mono for every numeral in the data. The signature moment is the temperature dial, whose needle
glides and whose bars reshape in one eased motion. Reduced motion is honored, focus is always
visible, all controls are native and keyboard operable, and the page has a skip link, one h1,
landmarks and live regions where status changes matter.

## Tests

Run with `npm test` (Node 18 or newer, `node:test` is built in, no packages installed).

Exact counts from the last run:

- 42 tests, 42 passing, 0 failing, 0 skipped
- 103 assertion calls in the test file (93 direct plus 10 through an epsilon helper), more at
  runtime because a few assertions run inside loops
- full suite time is about 40 ms, offline, CPU trivial

Coverage areas: the tokenizer (word and subword splits, punctuation, digit grouping, determinism,
empty and invalid input, round trip reassembly), the seeded generator (stability, distinct
streams, range), the Markov table (normalization, fallback, every continuation word has a row),
temperature math (identity at 1, greedy at 0, sharpen and flatten behavior, sums to one, softmax
against hand computed values), top k (winner takes all, renormalization, no-op at or above
support, correct survivors), sampling and generation (seed reproducibility, max length, greedy
favorite, unknown context fallback), budget accounting (sums, remaining, overflow, fill clamp),
all three truncation strategies (system messages always survive, contiguous sliding window,
bookend protection, summary stub cost), and prompt assembly (labels, empty part skipping, token
counting).

## Honest Caveats

- The tokenizer is rule based, not learned. Real BPE tokenizers count spaces, handle rare
  Unicode differently and will produce different counts. The page says so in the lesson copy.
- The Markov table is hand written and small (123 rows). Its greedy path deliberately loops
  on "the model predicts", which doubles as the lesson about low temperature repetition.
- Context window sizes (64 to 256) are teaching sizes. Real windows run from thousands to around
  a million tokens; the page says so next to the control.
- The summary strategy uses a fixed stub text of about 10 tokens, not a real summarizer, and the
  copy labels it a stand in.
- Cost estimates are illustrative math on an editable price, not a quote for any provider.
- No real model is called anywhere; the badge and footer label the whole page as a simulation.
- Visual QA was done through code review and a headless DOM exercise of every panel, not a
  rendered browser pass, because the build environment disallows browsers. The CSS is tested by
  hand calculations for contrast (chalk on pine is about 11.3 to 1, accent about 7.7 to 1,
  muted secondary text about 5.4 to 1) rather than screenshots.

## Five Devpost Bullets

- See the machine think in real time: type any sentence and watch a transparent tokenizer split
  it into words, subwords and punctuation, with a live cost estimate on an editable per token
  price.
- Drag the temperature dial and watch the odds physically reshape: a hand authored word table
  turns predictable or adventurous before your eyes, with seeded sampling that replays exactly.
- Overflow a context window on purpose and compare three truncation strategies side by side,
  Recent First, Keep The Opener and Summarize The Middle, with every dropped message tagged in
  the transcript.
- Assemble your first prompt from Role, Task, Constraints and Format, copy it with one click,
  and learn why each part earns its place.
- One hundred percent offline: one HTML page, zero dependencies, zero API calls, 42 passing
  tests behind the math, everything computed by a simulator you could rewrite yourself.
