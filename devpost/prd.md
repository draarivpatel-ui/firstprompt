---
doc: prd
status: draft
---

# FirstPrompt product requirements

## Journey

1. Inspect deterministic token pieces and a cost computed from an editable illustrative price.
2. Reshape weighted next-word probabilities with temperature and top k. Replay samples from a seed.
3. Fill a context window and compare recent, bookends and fixed-summary truncation on the same conversation.
4. Assemble role, task, constraints and format into a copyable prompt.
5. Inspect entropy, effective support, a recomputed temperature sweep and retained original token shares.

## Acceptance criteria

- Identical engine inputs produce identical outputs.
- Temperature changes refresh the visible odds, samples and diagnostics together.
- Each sampled sweep point is a fresh engine calculation and work is bounded.
- All truncation strategies stay within the hard token cap. Priority messages can be dropped when they cannot fit.
- Summary-stub tokens add usage without adding retained original conversation tokens.
- The prompt builder attempts clipboard copying and provides a recoverable fallback.
- Native controls have labels. The page has one main title, semantic landmarks, keyboard focus and reduced-motion support.
- Empty and malformed input cannot produce invented benchmark or answer-quality claims.

## Scope

One static five-lesson page, a pure simulator, mounted controller tests and working-tree content checks. The weighted table and tokenizer are teaching fixtures. There is no account, hosted model, persistent storage or semantic evaluation.

README.md and DEVPOST_UPGRADE.md record current implementation verification. This draft does not claim learner acceptance or deployment of the local repair.
