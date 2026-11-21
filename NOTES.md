# FirstPrompt implementation notes

## Current scope

Five browser lessons share one deterministic local simulator. The tokenizer, weighted bigram table and fixed summary stub are teaching fixtures. Editable pricing is illustrative. Entropy and retention describe this fixture rather than measured answer quality.

The page implements token inspection, seeded sampling, context truncation, structured prompt assembly and an odds lesson with distribution diagnostics, a temperature sweep and a retained-token comparison. The top-k sweep is an exported engine helper. It is not a separate page chart.

## Repairs

Temperature input refreshes the samples and diagnostics together. Extremely small positive temperatures use centered logits to avoid overflowing the scale. Display captions distinguish top-k removal from low-probability rows hidden for readability.

Every truncation strategy honors the hard token cap, including a zero cap. System messages and the first user message receive priority only when they fit. Whole-message truncation does not summarize actual conversation meaning. Summary-stub tokens are excluded from retained original tokens, and message identifiers must be unique.

## Interface

The existing pine and chalk palette, native controls, temperature dial, focus states and reduced-motion rules remain the visual system. The fifth lesson extends that system. No account, hosted endpoint or persistent storage is used. Copying a prompt is an explicit user action with a clipboard fallback.

## Verification

Run `npm test`. README.md and DEVPOST_UPGRADE.md contain the exact current test and syntax counts. Tests cover engine arithmetic, bounded work, retained-token reconstruction, mounted control changes, markup and complete working-tree text hygiene. Content probes use character codes and the content scan includes its own tests.

Local ES modules require a static server. The older four-lesson draft descriptions have been updated to the five-lesson implementation. Deployment and learner validation are not inferred from local verification.
