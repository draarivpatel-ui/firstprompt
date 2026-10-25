---
doc: scope
status: draft
---

> Retrospective note: this document was produced on 2026-10-24 by running the
> Devpost Learn Skill Pack (challengepost/learn-ai-basics, skills 2-scope, 3-prd,
> 4-spec) against the finished FirstPrompt build. The app itself was created from
> an empty folder on 2026-10-24, inside the hackathon submission period, using the
> same plan-first method documented in NOTES.md. These drafts record the decisions
> that build actually made, and stay at `status: draft` because no learner
> sign-off has been given.

# FirstPrompt

One line: an interactive browser primer that teaches how language model text
generation actually works, through a transparent simulation you can replay.

## The Unique Kernel

Every number on the page is computed live, locally, and reproducibly: a labeled
simulation with fixed seeds, so turning the temperature dial reshapes the real
next-word odds in front of you and the same seed always produces the same
sentence. Nothing is faked and nothing is hidden behind an API; if a value is an
approximation (the rule based tokenizer, the hand authored bigram table), the
page says so.

## Who It's For

A curious builder who has typed plenty of prompts but has never seen why a model
produces different answers at different temperatures. Today they read an article
or take a demo's word for it; here they can watch the machinery move.

## The Core Loop

They type words and watch them split into colored token chips with a running
cost estimate. They drag the temperature dial and the next-word odds reshape in
one eased motion. They draw three seeded samples and compare sentences, then
draw again with the same seed and watch the same sentences come back. Each of
the four lessons hands them the next piece of the same machine.

## Inspiration & Identity

Friendly classroom chalkboard meets clean editorial. Deep pine green canvas,
chalk ink, one chalk gold accent, oversized numerals, system serif for display
and mono for every numeral. The signature moment is the temperature dial:
needle glides, bars reshape, one motion.

## Why This Matters to the Learner

The builder ships AI-agent-built projects and kept noticing that the step
between prompt and response is a black box for most people. FirstPrompt is the
primer they wished existed: zero accounts, zero APIs, everything computed in
front of you.

## What "Working" Looks Like

Open the page and all four lessons work with no setup: tokens split, the dial
reshapes odds, the context meter overflows and three truncation strategies
compare side by side, the prompt builder assembles and copies a labeled prompt.
Drawing three samples twice with the same seed and settings produces identical
sentences. `npm test` runs 42 passing tests in about 40 ms, offline.

## The POC Boundary

One static page, four lessons, computed entirely in the browser. No backend, no
API calls, no storage, no dependencies, no build step.

## Later

A real model backend behind the same lessons. More lessons (embeddings,
attention). A classroom mode with guided worksheets.

## Explicitly Cut

- Real tokenizer (BPE): the rule based approximation is labeled as a simulation;
  the real thing needs model data downloads and adds nothing to the lesson.
- Live API calls: they would break the zero-setup promise and make every number
  non-reproducible.
- Accounts and saved work: nothing in the lessons needs persistence.
