# Firstprompt Upgrade Record

## Completed changes

- Finished the fifth lesson, its navigation link, diagnostic table, temperature curve and retained-token comparison.
- Normalized entropy and diagnostics against the same finite positive weights. Overflowing input mass is explicit.
- Bounded sweep work, corrected the shared plot scale and named the entropy-derived support metric consistently.
- The top-k sweep remains a tested engine helper. The fixed summary stub is labeled as a teaching fixture.
- Temperature changes refresh the generated examples and diagnostic panels together.
- Enforced the hard context cap for oversized system messages and openers, including a zero cap. Softmax stays finite at extremely small positive temperatures, and hidden probability rows are labeled separately from top-k removal.

## Verification

Run the full suite with `npm test`.

<!-- verification -->

The checked-in content scanner is proven with constructed probes. It scans all working-tree text, including its own tests, for prohibited punctuation, names, private fields and temporary output. Forbidden probes are assembled from character codes.

The changes are local and uncommitted. Implementation verification does not replace the pending independent code review.
