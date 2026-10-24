import test from "node:test";
import assert from "node:assert/strict";
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
  MARKOV
} from "../js/simulator.js";

const approx = (actual, expected, epsilon = 1e-9, message = "") =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message} expected ${expected} got ${actual}`
  );

/* ---------------- tokenizer ---------------- */

test("tokenizer splits a plain sentence into word tokens", () => {
  const tokens = tokenize("The cat sat");
  assert.equal(tokens.length, 3);
  assert.deepEqual(tokens.map((t) => t.text), ["The", "cat", "sat"]);
  assert.ok(tokens.every((t) => t.kind === "word"));
});

test("tokenizer marks pieces of split words as subwords", () => {
  const tokens = tokenize("predictable");
  assert.equal(tokens.length, 3);
  assert.deepEqual(tokens.map((t) => t.text), ["pre", "dict", "able"]);
  assert.ok(tokens.every((t) => t.kind === "subword"));
});

test("tokenizer splits prefix, stem and suffix", () => {
  const tokens = tokenize("unbelievable");
  assert.deepEqual(tokens.map((t) => t.text), ["un", "believ", "able"]);
  assert.equal(tokens.filter((t) => t.kind === "subword").length, 3);
});

test("tokenizer keeps short contractions whole", () => {
  const tokens = tokenize("it's");
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].text, "it's");
  assert.equal(tokens[0].kind, "word");
});

test("tokenizer emits punctuation as its own tokens", () => {
  const tokens = tokenize("Wait. Go!");
  assert.equal(tokens.length, 4);
  assert.equal(tokens[1].kind, "punct");
  assert.equal(tokens[1].text, ".");
  assert.equal(tokens[3].text, "!");
});

test("tokenizer groups long digit runs into three digit pieces", () => {
  const tokens = tokenize("2026");
  assert.equal(tokens.length, 2);
  assert.deepEqual(tokens.map((t) => t.text), ["202", "6"]);
  const one = tokenize("42");
  assert.equal(one.length, 1);
  assert.equal(one[0].kind, "word");
});

test("tokenizer cuts very long stems into fourish letter chunks", () => {
  const tokens = tokenize("extraordinarily"); // 15 letters, no authored affix match path
  assert.ok(tokens.length >= 2);
  // Pieces reassemble the original word with nothing lost.
  assert.equal(tokens.map((t) => t.text).join(""), "extraordinarily");
});

test("tokenizer is deterministic for repeated calls", () => {
  const a = tokenize("Language models predict one word at a time.");
  const b = tokenize("Language models predict one word at a time.");
  assert.deepEqual(a, b);
  assert.ok(a.length > 5);
});

test("tokenizer handles empty and odd input", () => {
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize("   "), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(123), []);
});

test("countTokens matches the token array length", () => {
  assert.equal(countTokens("The cat sat"), 3);
  assert.equal(countTokens(""), 0);
});

test("tokenCost multiplies count by price", () => {
  const tokens = tokenize("one two three");
  approx(tokenCost(tokens, 0.000001), 0.000003, 1e-15, "cost:");
  assert.equal(tokenCost("one two three", 0.000001), 3 * 0.000001);
  assert.equal(tokenCost(tokens, 0), 0);
  assert.equal(tokenCost(tokens, -5), 0);
  assert.equal(tokenCost(tokens, "not a number"), 0);
});

/* ---------------- seeded randomness ---------------- */

test("mulberry32 is stable for a fixed seed", () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test("mulberry32 gives different streams for different seeds", () => {
  const a = mulberry32(1)();
  const b = mulberry32(2)();
  assert.notEqual(a, b);
});

test("mulberry32 returns numbers in the unit interval", () => {
  const rng = mulberry32(42);
  for (let i = 0; i < 50; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
});

/* ---------------- markov table ---------------- */

test("markovDistribution normalizes table weights to probabilities", () => {
  const dist = markovDistribution("the");
  const total = dist.reduce((sum, e) => sum + e.prob, 0);
  approx(total, 1, 1e-12, "sum:");
  const entry = dist.find((e) => e.word === "model");
  approx(entry.prob, 24 / 88, 1e-12, "model prob:");
});

test("markovDistribution falls back to the start entry for unknown words", () => {
  const unknown = markovDistribution("zzzqqq");
  const start = markovDistribution("<start>");
  assert.deepEqual(unknown, start);
});

test("every continuation word in the table is itself a key", () => {
  const words = new Set(Object.keys(MARKOV));
  for (const [, entries] of Object.entries(MARKOV)) {
    for (const [word] of entries) {
      assert.ok(words.has(word), `${word} has no row and would end every walk`);
    }
  }
});

/* ---------------- temperature ---------------- */

test("temperature 1 leaves the distribution unchanged", () => {
  const raw = markovDistribution("cat");
  const shaped = applyTemperature(raw, 1);
  for (let i = 0; i < raw.length; i += 1) {
    approx(shaped[i].prob, raw[i].prob, 1e-12, "temp1:");
  }
});

test("temperature 0 resolves to a greedy one hot distribution", () => {
  const raw = markovDistribution("the");
  const shaped = applyTemperature(raw, 0);
  const sum = shaped.reduce((s, e) => s + e.prob, 0);
  approx(sum, 1, 1e-12, "greedy sum:");
  const top = shaped.find((e) => e.prob === 1);
  assert.equal(top.word, "model");
});

test("low temperature sharpens and high temperature flattens", () => {
  const raw = markovDistribution("a");
  const cold = applyTemperature(raw, 0.3);
  const warm = applyTemperature(raw, 2);
  const coldTop = Math.max(...cold.map((e) => e.prob));
  const warmTop = Math.max(...warm.map((e) => e.prob));
  const rawTop = Math.max(...raw.map((e) => e.prob));
  assert.ok(coldTop > rawTop);
  assert.ok(warmTop < rawTop);
});

test("every reshaped distribution still sums to one", () => {
  const raw = markovDistribution("tokens");
  for (const t of [0.2, 0.5, 0.9, 1.4, 1.9]) {
    const sum = applyTemperature(raw, t).reduce((s, e) => s + e.prob, 0);
    approx(sum, 1, 1e-9, `t=${t}:`);
  }
});

test("softmax agrees with hand computed values", () => {
  const probs = softmax([1, 0]);
  approx(probs[0], Math.E / (Math.E + 1), 1e-12, "softmax:");
  approx(probs[1], 1 / (Math.E + 1), 1e-12, "softmax:");
});

/* ---------------- top k ---------------- */

test("top k 1 leaves a single winner with all probability", () => {
  const raw = markovDistribution("the");
  const shaped = topK(applyTemperature(raw, 1), 1);
  const winner = shaped.find((e) => e.prob > 0);
  assert.equal(winner.word, "model");
  approx(winner.prob, 1, 1e-12, "top1:");
  assert.equal(shaped.filter((e) => e.prob > 0).length, 1);
});

test("top k renormalizes the kept words", () => {
  const raw = markovDistribution("the");
  const shaped = topK(applyTemperature(raw, 1), 3);
  const sum = shaped.reduce((s, e) => s + e.prob, 0);
  approx(sum, 1, 1e-12, "top3 sum:");
  assert.equal(shaped.filter((e) => e.prob > 0).length, 3);
});

test("top k at or above the support keeps everything", () => {
  const raw = markovDistribution("the");
  const all = topK(raw, raw.length);
  assert.deepEqual(all.map((e) => e.prob), raw.map((e) => e.prob));
  assert.equal(topK(raw, 0).length, raw.length);
});

test("top k keeps the highest probability words, not the first ones", () => {
  const raw = markovDistribution("next"); // word 30 dominates
  const shaped = topK(raw, 2);
  const survivors = shaped.filter((e) => e.prob > 0).map((e) => e.word).sort();
  assert.deepEqual(survivors, ["token", "word"]);
});

/* ---------------- sampling and generation ---------------- */

test("sampleFrom respects distribution mass", () => {
  const dist = [
    { word: "a", prob: 0.5 },
    { word: "b", prob: 0.5 }
  ];
  const alwaysLow = mulberry32(0);
  assert.equal(sampleFrom(dist, alwaysLow), "a");
  const rngHigh = () => 0.99;
  assert.equal(sampleFrom(dist, rngHigh), "b");
});

test("generation with the same seed is identical", () => {
  const a = generate("the", { temperature: 0.8, topKValue: 5, maxWords: 8, seed: 11 });
  const b = generate("the", { temperature: 0.8, topKValue: 5, maxWords: 8, seed: 11 });
  assert.deepEqual(a.words, b.words);
  assert.deepEqual(a.steps, b.steps);
});

test("generation respects maxWords", () => {
  const out = generate("a", { temperature: 1, maxWords: 4, seed: 3 });
  assert.equal(out.words.length, 4);
  assert.equal(out.steps.length, 4);
});

test("greedy generation starts with the table favorite", () => {
  const out = generate("the", { temperature: 0, maxWords: 3, seed: 5 });
  assert.equal(out.words[0], "model");
});

test("unknown starting context falls back to the start row", () => {
  const a = generate("mysteryword", { temperature: 0.9, maxWords: 2, seed: 9 });
  const b = generate("<start>", { temperature: 0.9, maxWords: 2, seed: 9 });
  assert.deepEqual(a.words, b.words);
});

/* ---------------- budget accounting ---------------- */

const messages = [
  { id: "m1", role: "system", text: "You are a friendly tutor for people new to AI." },
  { id: "m2", role: "user", text: "What is a token?" },
  { id: "m3", role: "assistant", text: "A token is a piece of text the model reads." },
  { id: "m4", role: "user", text: "Why do pieces matter?" },
  { id: "m5", role: "assistant", text: "Rare words split into smaller pieces, so costs rise." }
];

test("budgetAccount sums per message tokens", () => {
  const account = budgetAccount(messages, 128);
  const expected = account.perMessage.reduce((s, m) => s + m.tokens, 0);
  assert.equal(account.used, expected);
  assert.equal(account.limit, 128);
  assert.ok(account.used > 0);
});

test("budgetAccount computes remaining and fill honestly", () => {
  const account = budgetAccount(messages, 128);
  assert.equal(account.remaining, 128 - account.used);
  assert.equal(account.over, false);
  assert.ok(account.fill > 0 && account.fill <= 1);
});

test("budgetAccount flags an overfull window", () => {
  const account = budgetAccount(messages, 10);
  assert.equal(account.over, true);
  assert.equal(account.remaining, 0);
  assert.equal(account.fill, 1);
});

test("recent strategy always keeps system messages and slides the rest as one block", () => {
  const result = truncate(messages, 40, "recent");
  assert.ok(result.keptIds.includes("m1"));
  assert.ok(result.usedAfter <= 40);
  // Kept non system messages are a contiguous newest block, dropped ones are
  // exactly the oldest prefix of the conversation.
  const nonSystem = messages.filter((m) => m.role !== "system").map((m) => m.id);
  const keptNonSystem = nonSystem.filter((id) => result.keptIds.includes(id));
  assert.deepEqual(keptNonSystem, nonSystem.slice(nonSystem.length - keptNonSystem.length));
  assert.deepEqual(result.droppedIds, nonSystem.slice(0, nonSystem.length - keptNonSystem.length));
});

test("bookends strategy protects the first user message", () => {
  const result = truncate(messages, 30, "bookends");
  assert.ok(result.keptIds.includes("m1"));
  assert.ok(result.keptIds.includes("m2"));
  assert.ok(result.usedAfter <= 30);
});

test("summary strategy spends a few tokens on a simulated summary", () => {
  const result = truncate(messages, 30, "summary");
  assert.ok(result.droppedIds.length > 0);
  assert.ok(result.summaryStub);
  assert.ok(result.summaryStub.tokens > 0 && result.summaryStub.tokens < 20);
  assert.ok(result.usedAfter <= 30);
  assert.ok(result.keptIds.includes("m1"));
  assert.ok(result.keptIds.includes("m2"));
});

test("truncation with generous limits drops nothing", () => {
  const result = truncate(messages, 500, "recent");
  assert.equal(result.droppedIds.length, 0);
  assert.equal(result.keptIds.length, messages.length);
  assert.equal(result.usedAfter, budgetAccount(messages, 500).used);
});

test("token counts come from the same tokenizer as the token panel", () => {
  const text = "Rare words split into smaller pieces, so costs rise.";
  const account = budgetAccount([{ id: "x", role: "user", text }], 1000);
  assert.equal(account.perMessage[0].tokens, countTokens(text));
});

/* ---------------- prompt assembly ---------------- */

test("assemblePrompt joins the four parts with labels", () => {
  const out = assemblePrompt({
    role: "a patient teacher",
    task: "Explain tokens to a beginner",
    constraints: ["Use two sentences", "Avoid jargon"],
    format: "A Bullet List"
  });
  assert.ok(out.text.includes("You are a patient teacher."));
  assert.ok(out.text.includes("Explain tokens to a beginner"));
  assert.ok(out.text.includes("- Use two sentences"));
  assert.ok(out.text.includes("Respond as A Bullet List."));
  assert.equal(out.parts.length, 4);
  assert.deepEqual(out.parts.map((p) => p.label), ["Role", "Task", "Constraints", "Format"]);
});

test("assemblePrompt skips empty parts", () => {
  const out = assemblePrompt({ task: "Summarize this page" });
  assert.equal(out.parts.length, 1);
  assert.equal(out.parts[0].label, "Task");
  assert.ok(out.text.includes("Summarize this page"));
  assert.ok(!out.text.includes("You are"));
});

test("assembled prompt token count is measurable", () => {
  const out = assemblePrompt({ role: "an editor", task: "Shorten my draft" });
  assert.ok(countTokens(out.text) >= countTokens("Shorten my draft"));
});
