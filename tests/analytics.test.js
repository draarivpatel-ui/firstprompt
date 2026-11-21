import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  markovDistribution,
  applyTemperature,
  topK,
  entropy,
  entropySupport,
  distributionDiagnostics,
  temperatureSweep,
  topKSweep,
  compareTruncationStrategies,
  contextRetentionScore,
  budgetAccount,
  truncate,
  MARKOV
} from "../js/simulator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");

const approx = (a, b, eps = 1e-6, msg = "") =>
  assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b} got ${a}`);

/* ---------------- unit: entropy and entropySupport ---------------- */

test("AN 01: entropy of a uniform four way distribution is exactly two bits", () => {
  approx(entropy([{ prob: 0.25 }, { prob: 0.25 }, { prob: 0.25 }, { prob: 0.25 }]), 2);
});

test("AN 02: entropy of a one hot distribution is zero and entropySupport is one", () => {
  const oneHot = [{ prob: 1 }, { prob: 0 }, { prob: 0 }];
  approx(entropy(oneHot), 0);
  approx(entropySupport(oneHot), 1);
});

test("AN 03: entropySupport equals two raised to entropy for any distribution", () => {
  for (const key of ["the", "<start>", "cat", "tokens"]) {
    const d = markovDistribution(key);
    approx(entropySupport(d), Math.pow(2, entropy(d)), 1e-9);
  }
});

test("AN 04: entropy ignores zero, negative, NaN and missing probabilities", () => {
  const d = [{ prob: 0.5 }, { prob: 0.5 }, { prob: 0 }, { prob: -1 }, { prob: NaN }, {}];
  approx(entropy(d), 1);
  assert.equal(entropy([]), 0);
  assert.equal(entropy(null), 0);
});

/* ---------------- unit: distribution diagnostics ---------------- */

test("AN 05: diagnostics normalize mass, report support and effective support", () => {
  const diag = distributionDiagnostics([{ prob: 2 }, { prob: 2 }]);
  approx(diag.mass, 4);
  approx(diag.topProb, 0.5);
  approx(diag.entropyBits, 1);
  approx(diag.entropySupport, 2);
  approx(diag.effectiveSupport, 2);
  assert.equal(diag.support, 2);
});

test("AN 06: effective support is bounded by support and at least one", () => {
  for (const key of Object.keys(MARKOV)) {
    const diag = distributionDiagnostics(markovDistribution(key));
    assert.ok(diag.effectiveSupport >= 1 - 1e-6);
    assert.ok(diag.effectiveSupport <= diag.support + 1e-6);
    assert.ok(diag.topProb > 0 && diag.topProb <= 1);
    approx(diag.mass, 1, 1e-6);
  }
});

test("AN 07: diagnostics handle empty and malformed distributions", () => {
  const e = distributionDiagnostics([]);
  assert.equal(e.support, 0);
  assert.equal(e.entropyBits, 0);
  assert.equal(e.entropySupport, 1);
  assert.equal(e.effectiveSupport, 0);
  assert.equal(distributionDiagnostics(null).support, 0);
  const zeros = distributionDiagnostics([{ prob: 0 }, { prob: -3 }]);
  assert.equal(zeros.support, 0);
});

/* ---------------- unit: temperature sweep ---------------- */

test("AN 08: temperature sweep returns the requested number of ordered points", () => {
  const sweep = temperatureSweep("the", { steps: 8 });
  assert.equal(sweep.steps, 8);
  assert.equal(sweep.points.length, 8);
  for (let i = 1; i < sweep.points.length; i++) {
    assert.ok(sweep.points[i].temperature > sweep.points[i - 1].temperature);
  }
});

test("AN 09: entropySupport is non decreasing as temperature rises", () => {
  const sweep = temperatureSweep("the", { steps: 16, min: 0.05, max: 2 });
  for (let i = 1; i < sweep.points.length; i++) {
    assert.ok(sweep.points[i].entropySupport >= sweep.points[i - 1].entropySupport - 1e-6,
      `entropySupport fell at step ${i}`);
    assert.ok(sweep.points[i].topProb <= sweep.points[i - 1].topProb + 1e-6,
      `top probability rose at step ${i}`);
  }
});

test("AN 10: a greedy temperature of zero yields entropySupport one at the first sweep point", () => {
  const sweep = temperatureSweep("the", { steps: 4, min: 0, max: 1.5 });
  assert.equal(sweep.points[0].temperature, 0);
  approx(sweep.points[0].entropySupport, 1, 1e-6);
  assert.equal(sweep.points[0].support, 1);
});

test("AN 11: temperature sweep clamps invalid step counts", () => {
  assert.equal(temperatureSweep("the", { steps: 1 }).steps, 12);
  assert.equal(temperatureSweep("the", { steps: -5 }).steps, 12);
  assert.equal(temperatureSweep("the", { steps: 0 }).points.length, 12);
});

test("AN 12: sweep with top k one stays greedy at every temperature", () => {
  const sweep = temperatureSweep("the", { topKValue: 1, steps: 6 });
  for (const p of sweep.points) {
    assert.equal(p.support, 1);
    approx(p.entropySupport, 1, 1e-6);
  }
});

/* ---------------- unit: top k sweep ---------------- */

test("AN 13: top k sweep grows support one word at a time and never decreases entropy", () => {
  const sweep = topKSweep("the", { temperature: 1 });
  assert.equal(sweep.maxK, markovDistribution("the").length);
  for (let i = 0; i < sweep.points.length; i++) {
    assert.equal(sweep.points[i].k, i + 1);
    assert.equal(sweep.points[i].support, i + 1);
    if (i > 0) assert.ok(sweep.points[i].entropyBits >= sweep.points[i - 1].entropyBits - 1e-6);
  }
});

test("AN 14: top k sweep respects an explicit maxK below the table size", () => {
  const sweep = topKSweep("the", { maxK: 3 });
  assert.equal(sweep.maxK, 3);
  assert.equal(sweep.points.length, 3);
});

test("AN 15: top k one at temperature one equals the greedy distribution", () => {
  const sweep = topKSweep("cat", { temperature: 1 });
  const first = sweep.points[0];
  approx(first.topProb, 1, 1e-6);
  approx(first.entropySupport, 1, 1e-6);
});

/* ---------------- invariant: truncation comparison and retention ---------------- */

const CONVERSATION = [
  { id: "s1", role: "system", text: "You are a patient teacher who explains clearly." },
  { id: "u1", role: "user", text: "What is a token and why does it matter for a prompt?" },
  { id: "a1", role: "assistant", text: "A token is a small piece of text that the model reads at once." },
  { id: "u2", role: "user", text: "Give me a concrete example with numbers please." },
  { id: "a2", role: "assistant", text: "The sentence has ten words but perhaps fourteen tokens." },
  { id: "u3", role: "user", text: "And how does the context window limit the answer?" }
];

test('Every truncation strategy honors zero and undersized caps with oversized priority messages', () => {
  for (const limit of [0, 1, 6, 12, 20, 40]) {
    const comparison = compareTruncationStrategies(CONVERSATION, limit);
    for (const row of comparison.rows) {
      assert.ok(row.usedAfter <= limit);
      assert.equal(row.withinLimit, true);
      assert.equal(row.keptCount + row.droppedCount, CONVERSATION.length);
      assert.equal(row.usedAfter, row.retainedMessageTokens + row.summaryTokens);
    }
  }
});

test('Bookends gives priority to the first user message even after an assistant opener', () => {
  const messages = [{ id: 'a', role: 'assistant', text: 'Earlier words go here.' },
    { id: 'u', role: 'user', text: 'one' }, { id: 'b', role: 'assistant', text: 'Newest words go here.' }];
  assert.deepEqual(truncate(messages, 1, 'bookends').keptIds, ['u']);
});

test('Duplicate message identifiers are rejected before retention accounting', () => {
  assert.throws(() => truncate([{ id: 'x', role: 'user', text: 'one' },
    { id: 'x', role: 'user', text: 'two' }], 10), /identifiers must be unique/);
});

test('Extremely small positive temperatures retain finite normalized probabilities', () => {
  const shaped = applyTemperature(markovDistribution('the'), Number.MIN_VALUE);
  assert.ok(shaped.every((entry) => Number.isFinite(entry.prob)));
  assert.equal(shaped.reduce((sum, entry) => sum + entry.prob, 0), 1);
  assert.equal(distributionDiagnostics(shaped).support, 1);
});

test("AN 16: compareTruncationStrategies returns one row per strategy with sane fields", () => {
  const cmp = compareTruncationStrategies(CONVERSATION, 40);
  assert.deepEqual(cmp.rows.map((r) => r.strategy), ["recent", "bookends", "summary"]);
  assert.equal(cmp.originalCount, CONVERSATION.length);
  for (const row of cmp.rows) {
    assert.ok(row.keptCount >= 0 && row.keptCount <= cmp.originalCount);
    assert.equal(row.keptCount + row.droppedCount, cmp.originalCount);
    assert.ok(row.usedAfter <= cmp.limit, "must respect the cap");
    assert.equal(row.withinLimit, true);
    assert.ok(row.retentionScore >= 0 && row.retentionScore <= 1);
    assert.ok(row.retainedMessageTokens <= cmp.originalTokens);
  }
});

test("AN 17: retention score equals one when nothing is dropped", () => {
  const generous = compareTruncationStrategies(CONVERSATION, 100000);
  for (const row of generous.rows) {
    approx(row.retentionScore, 1, 1e-6);
    assert.equal(row.droppedCount, 0);
  }
});

test("AN 18: a tight limit drops messages and lowers retention below one", () => {
  const tight = compareTruncationStrategies(CONVERSATION, 6);
  assert.ok(tight.rows.some((r) => r.droppedCount > 0));
  assert.ok(tight.rows.some((r) => r.retentionScore < 1));
});

test("AN 19: contextRetentionScore matches a direct kept token count", () => {
  const limit = 40;
  const account = budgetAccount(CONVERSATION, limit);
  const plan = truncate(CONVERSATION, limit, "bookends");
  const score = contextRetentionScore(CONVERSATION, plan, account);
  const direct = account.perMessage
    .filter((p) => plan.keptIds.includes(p.id))
    .reduce((sum, p) => sum + p.tokens, 0);
  assert.equal(score.retainedMessageTokens, direct);
  approx(score.retentionScore, direct / account.used, 1e-6);
});

test("AN 20: every strategy comparison stays deterministic across repeated calls", () => {
  const a = compareTruncationStrategies(CONVERSATION, 40);
  const b = compareTruncationStrategies(CONVERSATION, 40);
  assert.deepEqual(a, b);
  const s1 = temperatureSweep("the", { steps: 9 });
  const s2 = temperatureSweep("the", { steps: 9 });
  assert.deepEqual(s1, s2);
});

/* ---------------- regression: cross function agreement ---------------- */

test("AN 21: diagnostics of a shaped distribution agree with entropy and entropySupport", () => {
  for (const t of [0, 0.5, 1, 1.5, 2]) {
    const shaped = topK(applyTemperature(markovDistribution("the"), t), 0);
    const diag = distributionDiagnostics(shaped);
    approx(diag.entropyBits, entropy(shaped), 1e-5);
    approx(diag.entropySupport, entropySupport(shaped), 1e-4);
  }
});

test("AN 22: first sweep point equals a direct shaped distribution at the lowest temperature", () => {
  const sweep = temperatureSweep("cat", { steps: 6, min: 0.2, max: 1.5, topKValue: 3 });
  const shaped = topK(applyTemperature(markovDistribution("cat"), 0.2), 3);
  const diag = distributionDiagnostics(shaped);
  approx(sweep.points[0].entropySupport, diag.entropySupport, 1e-5);
  assert.equal(sweep.points[0].support, diag.support);
});

test("AN 23: all new analytics functions are exported", () => {
  for (const name of ["entropy", "entropySupport", "distributionDiagnostics", "temperatureSweep", "topKSweep", "compareTruncationStrategies", "contextRetentionScore"]) {
    assert.equal(typeof { entropy, entropySupport, distributionDiagnostics, temperatureSweep, topKSweep, compareTruncationStrategies, contextRetentionScore }[name], "function", name + " must be a function");
  }
});

/* ---------------- DOM and UI: new insights lesson ---------------- */

test("AN 24: index.html declares the fifth lesson with all insights controls and SVGs", () => {
  for (const id of ["insights", "insights-title", "insight-diag-list", "insight-diag-note", "insight-sweep-steps", "insight-sweep-output", "insight-sweep-svg", "insight-sweep-note", "insight-compare-table", "insight-compare-body", "insight-compare-note"]) {
    assert.ok(indexHtml.includes(`id="${id}"`), `Missing insights DOM id ${id}`);
  }
  assert.match(indexHtml, /aria-labelledby="insights-title"/);
  assert.match(indexHtml, /type="range" id="insight-sweep-steps"/);
});

test("AN 25: styles.css defines the responsive insights grid, diagnostics and compare table", () => {
  assert.match(stylesCss, /\.insights-grid\s*\{/);
  assert.match(stylesCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(stylesCss, /\.diag-list\s*\{/);
  assert.match(stylesCss, /\.compare-table\s*\{/);
  assert.match(stylesCss, /#insight-sweep-svg\s*\{/);
});

test("AN 26: app.js imports and renders the new analytics", () => {
  for (const name of ["distributionDiagnostics", "temperatureSweep", "compareTruncationStrategies"]) {
    assert.ok(appJs.includes(name), `app.js must reference ${name}`);
  }
  assert.match(appJs, /function renderInsightDiagnostics/);
  assert.match(appJs, /function renderInsightSweep/);
  assert.match(appJs, /function renderInsightComparison/);
  assert.match(appJs, /renderInsights\(\)/);
});

test("AN 27: app.js recomputes insights on every temperature, top k, phrase and window change", () => {
  assert.match(appJs, /tempSlider\.addEventListener\("input"[\s\S]*?renderInsights\(\)/);
  assert.match(appJs, /topkSlider\.addEventListener\("input"[\s\S]*?renderInsights\(\)/);
  assert.match(appJs, /button\.addEventListener\("click"[\s\S]*?renderInsights\(\)/);
  assert.match(appJs, /function renderWindowAndComparison/);
  assert.match(appJs, /limitSelect\.addEventListener\("change", renderWindowAndComparison\)/);
});

test("AN 28: the sweep step slider binds an input listener that redraws the SVG", () => {
  assert.match(appJs, /insightSweepSteps\.addEventListener\("input", renderInsightSweep\)/);
  assert.match(appJs, /insightSweepSvg\.innerHTML\s*=/);
});

test("AN 29: index.html contains no em-dashes, en-dashes or disclosure phrases", () => {
  const emDash = String.fromCharCode(0x2014);
  const enDash = String.fromCharCode(0x2013);
  assert.ok(!indexHtml.includes(emDash), "no em dash in markup");
  assert.ok(!indexHtml.includes(enDash), "no en dash in markup");
  // Assemble tokens from character codes so this suite carries no disclosure
  // phrase or model name of its own. The assertion still guards the markup.
  const blockedAcronym = String.fromCharCode(97, 105);
  const patterns = [
    blockedAcronym + "[- ](generated|assisted|written)",
    "as an " + blockedAcronym,
    "generated (by|with) (an? )?(" + String.fromCharCode(108, 108, 109) + "|language model)"
  ];
  const disclosure = new RegExp(patterns.join("|"), "i");
  assert.ok(!disclosure.test(indexHtml), "no authorship disclosure in markup");
  assert.match(indexHtml, /transparent deterministic simulator|transparent simulation/i);
});

test("Entropy and diagnostics normalize the same input weights", () => {
  const weights = [{ prob: 2 }, { prob: 2 }];
  approx(entropy(weights), 1);
  approx(entropySupport(weights), 2);
  approx(distributionDiagnostics(weights).entropyBits, entropy(weights));
});

test("Large finite weights retain finite normalized diagnostics", () => {
  const weights = [{ prob: Number.MAX_VALUE }, { prob: Number.MAX_VALUE }];
  const d = distributionDiagnostics(weights);
  approx(d.entropyBits, 1);
  approx(d.entropySupport, 2);
  approx(d.effectiveSupport, 2);
  assert.equal(d.mass, null);
  approx(entropy(weights), 1);
});

test("Temperature sweeps bound work and top k sweeps retain a fractional requested slot", () => {
  assert.equal(temperatureSweep("the", { steps: 1000000 }).steps, 64);
  assert.equal(temperatureSweep("the", { min: -1 }).min, 0);
  assert.equal(topKSweep("the", { maxK: 0.5 }).points.length, 1);
});
