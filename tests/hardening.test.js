import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mountPage } from "./helpers/dom.js";
import {
  mulberry32,
  tokenize,
  countTokens,
  tokenCost,
  markovDistribution,
  softmax,
  applyTemperature,
  topK,
  sampleFrom,
  generate,
  budgetAccount,
  truncate,
  assemblePrompt,
  entropy,
  distributionDiagnostics,
  temperatureSweep,
  topKSweep,
  compareTruncationStrategies,
  contextRetentionScore,
  MARKOV
} from "../js/simulator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "js", "app.js"), "utf8");
const simJs = fs.readFileSync(path.join(repoRoot, "js", "simulator.js"), "utf8");

const approx = (a, b, eps = 1e-9, msg = "") =>
  assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b} got ${a}`);

/* ---------------- tokenizer edges ---------------- */

test("tokenizer pieces always reassemble the input words", () => {
  for (const sample of [
    "unbelievable", "extraordinarily", "internationalization",
    "misunderstanding", "preview", "rework", "cases", "yes",
    "it's", "o'clock", "don't", "James", "she", "the"
  ]) {
    const joined = tokenize(sample).map((t) => t.text).join("");
    assert.equal(joined, sample, `pieces of ${sample} must reassemble`);
  }
});

test("tokenizer treats accented and non ASCII letters as boundaries", () => {
  const tokens = tokenize("café");
  assert.deepEqual(tokens.map((t) => t.text), ["caf", "é"]);
  assert.equal(tokens[1].kind, "punct");
});

test("tokenizer splits digit runs of four or more into three digit chunks", () => {
  assert.deepEqual(tokenize("1234567").map((t) => t.text), ["123", "456", "7"]);
  assert.deepEqual(tokenize("123").map((t) => t.text), ["123"]);
  assert.deepEqual(tokenize("1234").map((t) => t.text), ["123", "4"]);
});

test("tokenizer separates letter runs from digit runs", () => {
  const tokens = tokenize("abc123def");
  assert.deepEqual(tokens.map((t) => t.text), ["abc", "123", "def"]);
});

test("tokenizer splits a seven letter prefixed word", () => {
  const tokens = tokenize("preview");
  assert.deepEqual(tokens.map((t) => t.text), ["pre", "view"]);
});

test("tokenizer guards the minimum stem length before suffix splits", () => {
  assert.deepEqual(tokenize("yes").map((t) => t.text), ["yes"]);
  assert.deepEqual(tokenize("as").map((t) => t.text), ["as"]);
});

test("tokenizer ignores every non string value", () => {
  for (const bad of [undefined, null, 0, false, {}, [], () => 1]) {
    assert.deepEqual(tokenize(bad), []);
  }
});

test("tokenCost accepts a token array or raw text and rejects bad prices", () => {
  assert.equal(tokenCost("one two", 1), 2);
  assert.equal(tokenCost(tokenize("one two"), 1), 2);
  for (const price of [NaN, -0.5, -Infinity, "abc", undefined]) {
    assert.equal(tokenCost("one two", price), 0);
  }
});

/* ---------------- seeded randomness ---------------- */

test("mulberry32 normalizes negative and huge seeds", () => {
  const a = mulberry32(-1);
  const b = mulberry32(0xffffffff);
  const c = mulberry32(4294967297);
  for (let i = 0; i < 10; i += 1) {
    for (const v of [a(), b(), c()]) {
      assert.ok(v >= 0 && v < 1);
    }
  }
});

test("mulberry32 keeps an open ended distinct stream", () => {
  const rng = mulberry32(99);
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(rng());
  assert.equal(seen.size, 200);
});

/* ---------------- markov table ---------------- */

test("every markov row normalizes to a unit distribution", () => {
  for (const key of Object.keys(MARKOV)) {
    const total = markovDistribution(key).reduce((s, e) => s + e.prob, 0);
    approx(total, 1, 1e-9, `${key}:`);
  }
});

test("markovDistribution preserves raw weights alongside probabilities", () => {
  const dist = markovDistribution("the");
  const model = dist.find((e) => e.word === "model");
  assert.equal(model.weight, 24);
});

test("markovDistribution returns fresh entry objects each call", () => {
  const a = markovDistribution("the");
  a[0].prob = -99;
  const b = markovDistribution("the");
  assert.notEqual(b[0].prob, -99);
});

/* ---------------- softmax and temperature ---------------- */

test("softmax spreads mass uniformly over equal logits", () => {
  const probs = softmax([3, 3, 3]);
  for (const p of probs) approx(p, 1 / 3, 1e-12);
});

test("softmax handles infinite and minus infinite logits", () => {
  assert.deepEqual(softmax([Infinity, 0]), [1, 0]);
  assert.deepEqual(softmax([0, -Infinity]), [1, 0]);
  assert.deepEqual(softmax([-Infinity, -Infinity]), [0, 0]);
});

test("softmax stays finite on extreme finite logits", () => {
  const probs = softmax([1000, 1001, 999]);
  assert.ok(probs.every((p) => Number.isFinite(p) && p >= 0));
  approx(probs.reduce((a, b) => a + b, 0), 1, 1e-12);
  assert.ok(probs[1] > probs[0] && probs[0] > probs[2]);
});

test("temperature at or below zero and non numeric input resolve greedy", () => {
  const raw = markovDistribution("the");
  for (const t of [0, -1, -0.5, NaN, "cold", undefined]) {
    const shaped = applyTemperature(raw, t);
    assert.equal(shaped.filter((e) => e.prob > 0).length, 1, `t=${t}`);
    assert.equal(shaped.find((e) => e.prob === 1).word, "model");
  }
});

test("applyTemperature keeps entry identity fields on every row", () => {
  const shaped = applyTemperature(markovDistribution("the"), 0.7);
  for (const entry of shaped) {
    assert.equal(typeof entry.word, "string");
    assert.equal(typeof entry.weight, "number");
  }
});

/* ---------------- top k ---------------- */

test("top k floors fractional k and ignores non finite k", () => {
  const raw = markovDistribution("the");
  assert.equal(topK(raw, 2.9).filter((e) => e.prob > 0).length, 2);
  for (const k of [NaN, Infinity, -Infinity, "many", undefined]) {
    assert.deepEqual(topK(raw, k).map((e) => e.prob), raw.map((e) => e.prob));
  }
});

test("top k never mutates its input distribution", () => {
  const raw = markovDistribution("the");
  const snapshot = raw.map((e) => e.prob);
  topK(raw, 2);
  assert.deepEqual(raw.map((e) => e.prob), snapshot);
});

test("top k renormalizes to exactly one for every k in range", () => {
  const raw = markovDistribution("your");
  for (let k = 1; k < raw.length; k += 1) {
    const shaped = topK(raw, k);
    approx(shaped.reduce((s, e) => s + e.prob, 0), 1, 1e-9, `k=${k}:`);
    assert.equal(shaped.filter((e) => e.prob > 0).length, k);
  }
});

/* ---------------- sampling and generation ---------------- */

test("sampleFrom picks the last word when the roll clears the mass", () => {
  const dist = [{ word: "a", prob: 0.1 }, { word: "b", prob: 0.1 }];
  assert.equal(sampleFrom(dist, () => 0.9999), "b");
  assert.equal(sampleFrom(dist, () => 0), "a");
});

test("sampleFrom falls back to the final entry on a degenerate distribution", () => {
  const dist = [{ word: "a", prob: 0 }, { word: "b", prob: 0 }];
  assert.equal(sampleFrom(dist, () => 0.5), "b");
});

test("generate chains each step context from the previous word", () => {
  const out = generate("the", { maxWords: 12, seed: 5 });
  assert.equal(out.steps[0].context, "the");
  for (let i = 1; i < out.steps.length; i += 1) {
    assert.equal(out.steps[i].context, out.steps[i - 1].word);
  }
});

test("every generated step keeps a normalized distribution", () => {
  const out = generate("cat", { temperature: 1.3, topKValue: 4, maxWords: 10, seed: 8 });
  for (const step of out.steps) {
    approx(step.dist.reduce((s, e) => s + e.prob, 0), 1, 1e-9);
  }
});

test("generation output length is bounded by a hard work cap", () => {
  assert.equal(generate("the", { maxWords: 1000000000, seed: 1 }).words.length, 256);
  assert.equal(generate("the", { maxWords: 0, seed: 1 }).words.length, 0);
  assert.equal(generate("the", { maxWords: -5, seed: 1 }).words.length, 0);
  assert.equal(generate("the", { maxWords: "lots", seed: 1 }).words.length, 0);
  assert.equal(generate("the", { maxWords: 5.9, seed: 1 }).words.length, 5);
});

test("different seeds give different walks on a flat distribution", () => {
  const a = generate("window", { temperature: 2, maxWords: 10, seed: 1 });
  const b = generate("window", { temperature: 2, maxWords: 10, seed: 2 });
  assert.notDeepEqual(a.words, b.words);
});

/* ---------------- budget accounting ---------------- */

test("budgetAccount coerces missing and malformed limits to zero", () => {
  const messages = [{ id: "a", role: "user", text: "hello world" }];
  for (const limit of [undefined, null, "abc", NaN, -10]) {
    const account = budgetAccount(messages, limit);
    assert.equal(account.limit, 0, `limit=${limit}`);
    assert.equal(account.over, true);
    assert.equal(account.remaining, 0);
  }
});

test("budgetAccount reports zero fill for an empty conversation", () => {
  const account = budgetAccount([], 128);
  assert.equal(account.used, 0);
  assert.equal(account.fill, 0);
  assert.equal(account.over, false);
});

test("budgetAccount treats a zero limit as completely full", () => {
  const account = budgetAccount([], 0);
  assert.equal(account.fill, 1);
});

/* ---------------- truncation edges ---------------- */

test("an oversized system message is dropped instead of breaking the cap", () => {
  const messages = [
    { id: "s", role: "system", text: "a very long instruction that simply cannot fit inside this tiny budget at all" },
    { id: "u", role: "user", text: "hi" }
  ];
  const result = truncate(messages, 4, "recent");
  assert.ok(result.droppedIds.includes("s"));
  assert.ok(result.usedAfter <= 4);
});

test("zero token messages always fit inside any cap", () => {
  const messages = [
    { id: "e", role: "user", text: "" },
    { id: "s", role: "system", text: "short" }
  ];
  const result = truncate(messages, 3, "recent");
  assert.ok(result.keptIds.includes("e"));
});

test("summary stub appears only when something was dropped and it fits", () => {
  const messages = [
    { id: "s", role: "system", text: "sys" },
    { id: "a", role: "user", text: "first question words here" },
    { id: "b", role: "assistant", text: "first answer words here" },
    { id: "c", role: "user", text: "second question words here" }
  ];
  const withRoom = truncate(messages, 20, "summary");
  assert.ok(withRoom.summaryStub === null || withRoom.usedAfter <= 20);
  const generous = truncate(messages, 500, "summary");
  assert.equal(generous.summaryStub, null);
});

test("unknown strategy names fall back to recent style truncation", () => {
  const messages = [
    { id: "s", role: "system", text: "sys note" },
    { id: "a", role: "user", text: "one two three four" },
    { id: "b", role: "assistant", text: "five six seven eight" }
  ];
  const result = truncate(messages, 10, "mystery");
  assert.ok(result.usedAfter <= 10);
  assert.equal(result.strategy, "mystery");
});

test("kept identifiers preserve conversation order in every strategy", () => {
  const order = ["s", "a", "b", "c"];
  const messages = [
    { id: "s", role: "system", text: "sys" },
    { id: "a", role: "user", text: "aaa bbb ccc" },
    { id: "b", role: "assistant", text: "ddd eee fff" },
    { id: "c", role: "user", text: "ggg hhh iii" }
  ];
  for (const strategy of ["recent", "bookends", "summary"]) {
    const kept = truncate(messages, 15, strategy).keptIds;
    assert.deepEqual(kept, order.filter((id) => kept.includes(id)));
  }
});

test("a zero limit keeps nothing and spends nothing", () => {
  const messages = [
    { id: "s", role: "system", text: "sys" },
    { id: "a", role: "user", text: "hi" }
  ];
  for (const strategy of ["recent", "bookends", "summary"]) {
    const result = truncate(messages, 0, strategy);
    assert.equal(result.keptIds.length, 0);
    assert.equal(result.usedAfter, 0);
  }
});

/* ---------------- prompt assembly ---------------- */

test("assemblePrompt accepts constraints as a newline separated string", () => {
  const out = assemblePrompt({ task: "T", constraints: "rule one\nrule two\n\n  " });
  assert.ok(out.text.includes("- rule one"));
  assert.ok(out.text.includes("- rule two"));
  assert.equal(out.parts.length, 2);
});

test("assemblePrompt omits whitespace only parts", () => {
  const out = assemblePrompt({ role: "   ", task: "\n\t", format: "  " });
  assert.equal(out.parts.length, 0);
  assert.equal(out.text, "");
});

test("assemblePrompt orders parts role then task then constraints then format", () => {
  const out = assemblePrompt({
    role: "r", task: "t", constraints: ["c1", "c2"], format: "f"
  });
  assert.deepEqual(out.parts.map((p) => p.label), ["Role", "Task", "Constraints", "Format"]);
});

test("assemblePrompt separates parts with a blank line", () => {
  const out = assemblePrompt({ role: "r", task: "t" });
  assert.ok(out.text.includes(".\n\n"));
});

/* ---------------- analytics edges ---------------- */

test("temperatureSweep inverts a backwards min max window safely", () => {
  const sweep = temperatureSweep("the", { steps: 4, min: 2, max: 0.5 });
  assert.equal(sweep.points.length, 4);
  assert.ok(sweep.points[3].temperature > sweep.points[0].temperature);
});

test("temperatureSweep honours the two point floor and sixty four point cap", () => {
  assert.equal(temperatureSweep("the", { steps: 2 }).points.length, 2);
  assert.equal(temperatureSweep("the", { steps: 64 }).points.length, 64);
  assert.equal(temperatureSweep("the", { steps: 65 }).points.length, 64);
});

test("topKSweep at temperature zero reports greedy support at every k", () => {
  const sweep = topKSweep("the", { temperature: 0 });
  for (const point of sweep.points) {
    assert.equal(point.support, 1);
  }
});

test("compareTruncationStrategies on an empty conversation reports zeros", () => {
  const cmp = compareTruncationStrategies([], 40);
  assert.equal(cmp.originalTokens, 0);
  for (const row of cmp.rows) {
    assert.equal(row.keptCount, 0);
    assert.equal(row.retentionScore, 1);
  }
});

test("contextRetentionScore on an empty conversation scores one", () => {
  const account = budgetAccount([], 10);
  const plan = truncate([], 10, "recent");
  assert.equal(contextRetentionScore([], plan, account).retentionScore, 1);
});

test("entropy of a delta spike is zero and entropySupport is one", () => {
  approx(entropy([{ prob: 1 }, { prob: 0 }]), 0, 1e-12);
  approx(distributionDiagnostics([{ prob: 1 }]).entropySupport, 1, 1e-9);
});

/* ---------------- mounted page behavior ---------------- */

test("a tiny positive price renders a floor marker instead of a bare zero", () => {
  const { nodes } = mountPage();
  nodes["token-input"].value = "one two three";
  nodes["token-price"].value = "0.00000000000001";
  nodes["token-price"].emit("input");
  assert.equal(nodes["token-cost"].textContent, "<$0.000000000001");
});

test("the top k help text names the actual k when it covers the table", () => {
  const { nodes } = mountPage();
  nodes["topk-slider"].value = "7";
  nodes["topk-slider"].emit("input");
  assert.match(nodes["topk-help"].textContent, /At 7 the menu keeps every word/);
});

test("start phrase chips move the pressed state to the clicked chip", () => {
  const { nodes } = mountPage();
  const chips = nodes["start-chips"].children;
  assert.equal(chips.length, 5);
  chips[2].emit("click");
  assert.equal(chips[2].attributes["aria-pressed"], "true");
  assert.equal(chips[0].attributes["aria-pressed"], "false");
});

test("the distribution list renders a row per visible probability", () => {
  const { nodes } = mountPage();
  const rows = nodes["dist-list"].children;
  assert.ok(rows.length >= 5);
  assert.match(rows[0].children[2].textContent, /%$/);
});

test("adding questions until the window overflows reports the overage", () => {
  const { nodes } = mountPage();
  nodes["limit-select"].value = "64";
  nodes["limit-select"].emit("change");
  for (let i = 0; i < 8; i += 1) nodes["add-question"].emit("click");
  assert.match(nodes["window-status"].innerHTML, /Over budget by \d+ tokens/);
});

test("removing messages then clearing rebuilds the seeded conversation", () => {
  const { nodes } = mountPage();
  const initial = nodes["message-list"].children.length;
  nodes["remove-last"].emit("click");
  assert.equal(nodes["message-list"].children.length, initial - 1);
  nodes["clear-chat"].emit("click");
  assert.equal(nodes["message-list"].children.length, initial);
});

test("the format select marks the prompt preview with a format part", () => {
  const { nodes } = mountPage();
  nodes["task-input"].value = "Summarize this text";
  nodes["task-input"].emit("input");
  nodes["format-select"].value = "A Bullet List";
  nodes["format-select"].emit("change");
  assert.match(nodes["prompt-preview"].textContent, /Respond as A Bullet List\./);
});

test("a price of zero announces the free estimate in the helper line", () => {
  const { nodes } = mountPage();
  nodes["token-price"].value = "0";
  nodes["token-price"].emit("input");
  assert.match(nodes["cost-per-million"].textContent, /Free At A Price Of Zero/);
});

/* ---------------- hygiene and WCAG invariants ---------------- */

test("no smooth scroll behavior anywhere in shipped markup, style or script", () => {
  const combined = `${indexHtml}\n${stylesCss}\n${appJs}\n${simJs}`;
  assert.equal(/scroll-behavior\s*:\s*smooth/i.test(combined), false);
  assert.equal(/scrollIntoView\s*\([^)]*smooth/i.test(combined), false);
  assert.equal(/behavior\s*:\s*["']smooth["']/i.test(combined), false);
});

test("no single character keyboard shortcuts exist (WCAG 2.1.4)", () => {
  assert.equal(/addEventListener\s*\(\s*["'](?:keydown|keypress|keyup)["']/i.test(appJs), false);
  assert.equal(/on(?:keydown|keypress|keyup)\s*=/i.test(indexHtml), false);
});

test("no inline event handlers are present in the markup", () => {
  assert.equal(/\son[a-z]+\s*=/i.test(indexHtml), false);
});

test("the hero test numeral never exceeds the real test count", () => {
  const testsDir = path.join(repoRoot, "tests");
  let realCount = 0;
  for (const file of fs.readdirSync(testsDir)) {
    if (!/\.test\.(?:js|cjs)$/.test(file)) continue;
    const src = fs.readFileSync(path.join(testsDir, file), "utf8");
    realCount += (src.match(/\btest\s*\(/g) || []).length;
  }
  const claimed = Number(/id="hero-test-count">(\d+)/.exec(indexHtml)?.[1]);
  assert.ok(Number.isInteger(claimed) && claimed > 0);
  assert.ok(claimed <= realCount, `hero claims ${claimed} tests but only ${realCount} exist`);
});

/* ---------------- pass 2 regression: reproduced adversarial defects ---------------- */

test("tokenizer survives a very long single word without RangeError", () => {
  const huge = "a".repeat(600000);
  const tokens = tokenize(huge);
  assert.ok(tokens.length > 0);
  assert.equal(tokens.map((t) => t.text).join(""), huge);
});

test("tokenize has no array spread push on word matches", () => {
  assert.equal(/tokens\.push\(\.\.\./.test(simJs), false);
});

test("builder form blocks implicit submission so Enter never reloads", () => {
  assert.equal(/builder-form/.test(indexHtml), true);
  assert.equal(/\$\("builder-form"\)\.addEventListener\("submit"/.test(appJs), true);
  assert.equal(/preventDefault\(\)/.test(appJs), true);
  const { document } = mountPage();
  const form = document.getElementById("builder-form");
  assert.ok(form, "builder form mounted");
  assert.equal(typeof form.listeners.submit, "function");
});

test("dial zone highlight and regime sentence share one boundary set", () => {
  const regimeBlock = /function regimeText\(t\) \{([\s\S]*?)\n\}/.exec(appJs)[1];
  assert.equal(/t <= 1\.4/.test(regimeBlock), true);
  assert.equal(/t <= 1\.6/.test(regimeBlock), false);
  assert.equal(/t <= 0\.55/.test(regimeBlock), false);
  const zoneExpr = /const zone = t < 0\.6 \? "predict" : t <= 1\.4 \? "balanced" : "adventure"/.test(appJs);
  assert.equal(zoneExpr, true);
});

test("every CSS custom property referenced is defined in root", () => {
  const defined = new Set([...stylesCss.matchAll(/--[a-z0-9-]+\s*:/gi)].map((m) => m[0].trim().slice(0, -1)));
  const used = new Set([...stylesCss.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, []);
});

test("formatMoney never renders an infinite bill as zero cost", () => {
  const { document } = mountPage();
  const price = document.getElementById("token-price");
  const input = document.getElementById("token-input");
  input.value = "the cat sat";
  price.value = "1e308";
  price.emit("input");
  const cost = document.getElementById("token-cost").textContent;
  assert.notEqual(cost, "$0");
  price.value = "-5";
  price.emit("input");
  const perMillion = document.getElementById("cost-per-million").textContent;
  assert.notEqual(perMillion, "Free At A Price Of Zero");
});

test("positive infinite temperature flattens to uniform, not greedy", () => {
  const raw = markovDistribution("the");
  const shaped = applyTemperature(raw, Infinity);
  const uniform = 1 / shaped.length;
  for (const entry of shaped) {
    approx(entry.prob, uniform, 1e-12, `word=${entry.word}`);
  }
  const greedy = applyTemperature(raw, NaN);
  assert.equal(greedy.filter((e) => e.prob === 1).length, 1);
  const sweep = topKSweep("the", { temperature: Infinity });
  const last = sweep.points[sweep.points.length - 1];
  assert.equal(last.support, raw.length);
  approx(last.topProb, 1 / raw.length, 1e-6);
});

test("tokenizer keeps emoji and common short words whole", () => {
  const emoji = tokenize("😀");
  assert.equal(emoji.length, 1);
  assert.equal(emoji[0].text, "😀");
  // Flags are two code points: two tokens, never four lone surrogates.
  const flag = tokenize("🇺🇸");
  assert.equal(flag.length, 2);
  assert.equal(flag.map((t) => t.text).join(""), "🇺🇸");
  for (const t of flag) assert.equal([...t.text].length, 1);
  for (const word of ["this", "press", "class", "guess", "does", "says", "goes"]) {
    const pieces = tokenize(word);
    assert.equal(pieces.length, 1, word);
    assert.equal(pieces[0].text, word);
  }
});

test("tokenizer still splits longer words on authored suffixes", () => {
  const tokens = tokenize("predictable");
  assert.ok(tokens.length > 1);
  assert.equal(tokens.map((t) => t.text).join(""), "predictable");
});

test("assemblePrompt coerces hostile inputs instead of throwing or leaking garbage", () => {
  assert.deepEqual(assemblePrompt(null), { text: "", parts: [] });
  assert.equal(assemblePrompt({ task: 5 }).text, "5");
  const withArray = assemblePrompt({ constraints: [1, 2] });
  assert.equal(withArray.text, "- 1\n- 2");
  assert.equal(assemblePrompt({ constraints: null }).text, "");
  assert.equal(assemblePrompt({ constraints: {} }).text, "");
  assert.equal(assemblePrompt({ constraints: 0 }).text, "");
  const role = assemblePrompt({ role: { nested: true }, task: "go" });
  assert.equal(role.text, "go");
});

test("sampleFrom and budgetAccount guard degenerate inputs", () => {
  assert.equal(sampleFrom([], mulberry32(1)), null);
  assert.equal(sampleFrom([{ prob: 1 }], mulberry32(1)), null);
  for (const bad of [null, "x", [null]]) {
    const account = budgetAccount(bad, 10);
    assert.equal(account.limit, 10);
    assert.equal(account.used, 0);
  }
  const uncapped = budgetAccount([{ id: "a", role: "user", text: "hi" }], Infinity);
  assert.ok(Number.isFinite(uncapped.remaining));
  assert.notEqual(JSON.stringify(uncapped.remaining), "null");
  assert.equal(generate("the", { maxWords: null, seed: 1 }).words.length, 10);
  const zero = mulberry32(0);
  const half = mulberry32(0.5);
  assert.notDeepEqual([zero(), zero()], [half(), half()]);
});
