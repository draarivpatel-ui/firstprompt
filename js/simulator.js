/*
 * FirstPrompt simulator.
 * Every function here is pure, deterministic and dependency free so the page
 * and the test suite compute from the same code. This is a teaching model,
 * not a real language model.
 */

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                   */
/* ------------------------------------------------------------------ */

/**
 * Mulberry32, a tiny seeded pseudo random generator.
 * Same seed always yields the same sequence of numbers in [0, 1).
 */
export function mulberry32(seed) {
  // Fold the fractional part and sign into the state so seeds like 0 and 0.5
  // do not alias to the same stream after >>> 0 truncation.
  const n = Number(seed) || 0;
  const frac = Math.round((Math.abs(n) % 1) * 4294967296) >>> 0;
  let a = ((n >>> 0) ^ frac ^ (n < 0 ? 0x80000000 : 0)) >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Tokenizer                                                           */
/* ------------------------------------------------------------------ */

const SUFFIXES = [
  "ization", "ation", "tions", "tion", "sion",
  "ment", "ness", "able", "ible", "ally", "ing", "est",
  "ed", "ly", "er", "es", "'s", "s"
];

const PREFIXES = ["under", "over", "inter", "dis", "mis", "pre", "un", "re"];

// The u flag makes the punctuation class match whole code points, so emoji
// and other non BMP characters become one token instead of lone surrogates.
const WORD_PATTERN = /[A-Za-z]+(?:'[A-Za-z]+)*|\d+|[^\sA-Za-z\d]/gu;

function chunkStem(stem) {
  const parts = Math.ceil(stem.length / 4);
  const size = Math.ceil(stem.length / parts);
  const chunks = [];
  for (let i = 0; i < stem.length; i += size) {
    chunks.push(stem.slice(i, i + size));
  }
  return chunks;
}

function chunkDigits(digits) {
  if (digits.length <= 3) return [digits];
  const chunks = [];
  for (let i = 0; i < digits.length; i += 3) {
    chunks.push(digits.slice(i, i + 3));
  }
  return chunks;
}

function splitWord(word) {
  let rest = word;
  let pieces = [];

  if (word.length >= 7) {
    for (const prefix of PREFIXES) {
      if (word.startsWith(prefix) && word.length - prefix.length >= 4) {
        pieces.push(prefix);
        rest = word.slice(prefix.length);
        break;
      }
    }
  }

  // Short words under six letters never split on a suffix: real tokenizers
  // keep frequent words like "this" or "class" whole, so the demo does too.
  if (rest.length >= 6) {
    for (const suffix of SUFFIXES) {
      const stemLength = rest.length - suffix.length;
      const stem = rest.slice(0, stemLength);
      if (rest.toLowerCase().endsWith(suffix) && stemLength >= 3 && /[A-Za-z]$/.test(stem)) {
        pieces.push(rest.slice(0, stemLength));
        pieces.push(rest.slice(stemLength));
        rest = "";
        break;
      }
    }
  }

  if (rest !== "") {
    if (pieces.length === 0) {
      pieces.push(rest);
    } else {
      // A prefix was taken but no suffix matched, the remainder is the last piece.
      pieces.push(rest);
    }
  }

  if (pieces.length === 1) {
    const only = pieces[0];
    if (only.length >= 8) {
      return chunkStem(only).map((chunk) => ({ text: chunk, kind: "subword" }));
    }
    return [{ text: only, kind: "word" }];
  }

  return pieces.map((piece) => ({ text: piece, kind: "subword" }));
}

/**
 * Split text into simulated tokens.
 * Returns an array of { text, kind } where kind is "word", "subword" or "punct".
 * Subwords model how real tokenizers cut long or rare words into pieces.
 */
export function tokenize(text) {
  if (typeof text !== "string") return [];
  const tokens = [];
  const matches = text.match(WORD_PATTERN) || [];
  for (const match of matches) {
    if (/^\d+$/.test(match)) {
      const chunks = chunkDigits(match);
      if (chunks.length === 1) {
        tokens.push({ text: chunks[0], kind: "word" });
      } else {
        for (const chunk of chunks) {
          tokens.push({ text: chunk, kind: "subword" });
        }
      }
    } else if (/^[A-Za-z]/.test(match)) {
      // A for of loop, not spread: spread pushes every chunk as a call
      // argument and crashes RangeError on very long single words.
      for (const piece of splitWord(match)) {
        tokens.push(piece);
      }
    } else {
      tokens.push({ text: match, kind: "punct" });
    }
  }
  return tokens;
}

/** Convenience count used all over the page. */
export function countTokens(text) {
  return tokenize(text).length;
}

/**
 * Cost estimate. pricePerToken is dollars per single token.
 * Returns dollars as a plain number so callers decide how to format it.
 */
export function tokenCost(tokens, pricePerToken) {
  const count = Array.isArray(tokens) ? tokens.length : countTokens(tokens);
  const price = Number(pricePerToken);
  if (!Number.isFinite(price) || price < 0) return 0;
  return count * price;
}

/* ------------------------------------------------------------------ */
/* Markov table                                                        */
/* ------------------------------------------------------------------ */

/**
 * A hand written bigram table. Keys are words, entries are [word, weight].
 * "<start>" begins a walk. A word with no entry ends the walk.
 * The table is deliberately small so every number on screen is checkable.
 */
export const MARKOV = {
  "<start>": [["the", 24], ["a", 16], ["your", 12], ["tokens", 10], ["models", 10], ["every", 8], ["small", 6]],
  "the": [["model", 24], ["next", 18], ["prompt", 12], ["window", 12], ["cat", 8], ["answer", 8], ["table", 6]],
  "a": [["prompt", 18], ["model", 14], ["small", 12], ["token", 12], ["short", 10], ["clear", 8], ["cat", 6]],
  "your": [["prompt", 20], ["tokens", 14], ["words", 12], ["model", 10], ["turn", 8], ["window", 8]],
  "tokens": [["are", 20], ["become", 16], ["cost", 12], ["fill", 10], ["carry", 8]],
  "models": [["are", 18], ["learn", 12], ["choose", 10], ["guess", 10], ["speak", 8]],
  "every": [["word", 20], ["token", 14], ["prompt", 12], ["turn", 10], ["time", 8]],
  "small": [["steps", 14], ["words", 12], ["wins", 12], ["budgets", 10], ["models", 8]],
  "model": [["predicts", 22], ["reads", 14], ["chooses", 12], ["learns", 10], ["is", 8], ["writes", 6]],
  "next": [["word", 30], ["token", 16], ["turn", 10], ["step", 8]],
  "prompt": [["is", 16], ["grows", 14], ["works", 12], ["fits", 10], ["ends", 8]],
  "window": [["fills", 18], ["closes", 12], ["holds", 12], ["overflows", 10], ["keeps", 8]],
  "cat": [["sat", 20], ["napped", 14], ["waited", 12], ["purred", 10], ["leaped", 8]],
  "answer": [["is", 20], ["arrives", 14], ["changes", 10], ["improves", 8], ["ends", 6]],
  "table": [["shows", 20], ["holds", 14], ["turns", 10], ["lists", 8], ["waits", 6]],
  "are": [["small", 16], ["made", 14], ["chosen", 12], ["counted", 10], ["predictable", 8]],
  "become": [["tokens", 22], ["pieces", 14], ["numbers", 12], ["costs", 10]],
  "cost": [["little", 16], ["tokens", 14], ["more", 12], ["nothing", 10]],
  "costs": [["little", 14], ["more", 12], ["tokens", 12], ["nothing", 8]],
  "fill": [["the", 20], ["up", 16], ["quickly", 12], ["slowly", 10]],
  "carry": [["meaning", 18], ["weight", 12], ["costs", 10], ["on", 8]],
  "learn": [["from", 24], ["patterns", 14], ["slowly", 10], ["fast", 8]],
  "learns": [["from", 16], ["the", 12], ["slowly", 10], ["and", 8]],
  "choose": [["one", 18], ["words", 12], ["wisely", 10], ["again", 8]],
  "guess": [["the", 18], ["one", 14], ["better", 10], ["again", 8]],
  "speak": [["in", 16], ["one", 14], ["softly", 10], ["plainly", 8]],
  "writes": [["the", 14], ["one", 10], ["slowly", 8], ["and", 8]],
  "word": [["at", 18], ["by", 14], ["counts", 12], ["fits", 10]],
  "token": [["at", 18], ["by", 12], ["counts", 12], ["fits", 8]],
  "turn": [["ends", 16], ["begins", 14], ["fills", 10], ["passes", 8]],
  "time": [["the", 16], ["passes", 12], ["runs", 10], ["ends", 8]],
  "steps": [["are", 16], ["add", 12], ["count", 10], ["matter", 8]],
  "words": [["are", 16], ["become", 12], ["fill", 10], ["matter", 8]],
  "wins": [["races", 12], ["hearts", 10], ["games", 8], ["often", 8]],
  "budgets": [["are", 14], ["keep", 12], ["fill", 10], ["hold", 8]],
  "predicts": [["the", 18], ["one", 12], ["words", 10], ["patterns", 8]],
  "reads": [["the", 20], ["one", 12], ["every", 10], ["slowly", 8]],
  "chooses": [["one", 20], ["the", 12], ["words", 10], ["wisely", 8]],
  "is": [["small", 14], ["a", 14], ["the", 12], ["one", 10]],
  "one": [["word", 18], ["token", 12], ["turn", 10], ["step", 8]],
  "little": [["tokens", 12], ["words", 10], ["by", 10], ["steps", 8]],
  "more": [["tokens", 16], ["words", 12], ["room", 10], ["slowly", 8]],
  "nothing": [["more", 14], ["fancy", 10], ["hidden", 8], ["left", 8]],
  "up": [["the", 14], ["one", 12], ["slowly", 10], ["fast", 8]],
  "quickly": [["and", 12], ["the", 10], ["one", 8], ["without", 8]],
  "slowly": [["and", 12], ["the", 10], ["one", 8], ["then", 8]],
  "meaning": [["is", 14], ["one", 10], ["in", 8], ["matters", 8]],
  "weight": [["is", 12], ["one", 10], ["in", 8], ["matters", 8]],
  "from": [["the", 18], ["one", 12], ["small", 10], ["every", 8]],
  "patterns": [["are", 16], ["in", 10], ["emerge", 10], ["form", 8]],
  "in": [["the", 18], ["one", 12], ["small", 10], ["plain", 8]],
  "on": [["the", 16], ["one", 12], ["and", 10]],
  "and": [["the", 16], ["one", 12], ["waits", 8], ["keeps", 8]],
  "wisely": [["and", 10], ["the", 8], ["one", 8], ["every", 6]],
  "again": [["and", 12], ["the", 10], ["one", 8], ["softly", 6]],
  "without": [["the", 12], ["one", 10], ["a", 8], ["any", 8]],
  "better": [["the", 12], ["one", 10], ["and", 8], ["every", 8]],
  "at": [["the", 16], ["a", 12], ["one", 10]],
  "by": [["the", 14], ["one", 12], ["a", 10]],
  "made": [["of", 16], ["the", 12], ["one", 10]],
  "of": [["the", 16], ["small", 12], ["one", 10]],
  "chosen": [["the", 14], ["one", 12], ["by", 10]],
  "counted": [["the", 12], ["one", 10], ["twice", 10], ["in", 8]],
  "predictable": [["the", 12], ["one", 10], ["and", 8], ["words", 8]],
  "pieces": [["are", 12], ["of", 10], ["the", 10], ["one", 8]],
  "numbers": [["are", 12], ["the", 10], ["one", 8], ["add", 8]],
  "attention": [["is", 12], ["the", 10], ["and", 8], ["one", 8]],
  "praise": [["is", 12], ["the", 10], ["and", 8], ["one", 8]],
  "races": [["are", 12], ["the", 10], ["and", 8], ["one", 8]],
  "hearts": [["are", 12], ["and", 10], ["the", 10], ["one", 8]],
  "games": [["are", 12], ["the", 10], ["and", 8], ["one", 8]],
  "often": [["the", 10], ["one", 10], ["and", 8], ["without", 8]],
  "fancy": [["words", 12], ["the", 10], ["one", 8], ["and", 8]],
  "hidden": [["in", 14], ["the", 12], ["one", 8]],
  "left": [["in", 12], ["the", 10], ["one", 8], ["and", 8]],
  "then": [["the", 14], ["one", 10], ["and", 8], ["a", 8]],
  "any": [["word", 12], ["one", 10], ["the", 8], ["token", 8]],
  "matters": [["is", 12], ["the", 10], ["one", 8], ["more", 8]],
  "matter": [["the", 12], ["one", 10], ["more", 8], ["and", 8]],
  "add": [["the", 12], ["one", 10], ["up", 10], ["and", 8]],
  "count": [["the", 12], ["one", 10], ["up", 8], ["and", 8]],
  "counts": [["the", 12], ["one", 10], ["up", 10], ["and", 8]],
  "emerge": [["the", 12], ["one", 10], ["from", 8], ["and", 8]],
  "form": [["the", 12], ["one", 10], ["from", 8], ["and", 8]],
  "plain": [["words", 12], ["and", 10], ["the", 8], ["one", 8]],
  "softly": [["the", 12], ["and", 10], ["one", 8], ["without", 8]],
  "plainly": [["the", 12], ["one", 10], ["and", 10], ["softly", 6]],
  "grows": [["the", 12], ["one", 10], ["slowly", 10], ["and", 8]],
  "works": [["the", 12], ["one", 10], ["slowly", 8], ["and", 8]],
  "fits": [["the", 12], ["one", 10], ["in", 10], ["and", 8]],
  "ends": [["the", 12], ["one", 10], ["and", 8], ["softly", 8]],
  "fills": [["the", 14], ["one", 10], ["up", 10], ["and", 8]],
  "closes": [["the", 12], ["one", 10], ["and", 8], ["softly", 8]],
  "holds": [["the", 12], ["one", 10], ["every", 8], ["and", 8]],
  "overflows": [["the", 12], ["one", 10], ["and", 8], ["quickly", 8]],
  "keeps": [["the", 12], ["one", 10], ["going", 8], ["and", 8]],
  "sat": [["on", 18], ["the", 12], ["and", 10]],
  "napped": [["in", 14], ["the", 12], ["and", 8]],
  "waited": [["for", 12], ["the", 12], ["and", 8]],
  "purred": [["in", 12], ["the", 10], ["and", 8], ["softly", 8]],
  "leaped": [["the", 12], ["over", 10], ["and", 8], ["up", 8]],
  "for": [["the", 16], ["a", 12], ["one", 10]],
  "over": [["the", 14], ["one", 12], ["a", 10]],
  "going": [["the", 10], ["one", 10], ["and", 8], ["without", 8]],
  "room": [["for", 14], ["the", 12], ["one", 10]],
  "improves": [["the", 12], ["one", 10], ["and", 8], ["slowly", 8]],
  "arrives": [["the", 12], ["one", 10], ["and", 8], ["softly", 8]],
  "changes": [["the", 12], ["one", 10], ["and", 8], ["every", 8]],
  "shows": [["the", 14], ["one", 10], ["every", 8], ["and", 8]],
  "turns": [["the", 12], ["one", 10], ["and", 8], ["slowly", 8]],
  "lists": [["the", 12], ["one", 10], ["every", 8], ["and", 8]],
  "waits": [["for", 12], ["the", 12], ["and", 8]],
  "passes": [["the", 12], ["one", 10], ["and", 8], ["slowly", 8]],
  "runs": [["the", 12], ["one", 10], ["out", 8], ["and", 8]],
  "out": [["of", 14], ["the", 12], ["one", 10]],
  "begins": [["the", 12], ["one", 10], ["and", 8], ["again", 8]],
  "fast": [["the", 10], ["one", 10], ["and", 8], ["without", 8]],
  "twice": [["the", 10], ["one", 10], ["and", 8], ["then", 8]],
  "keep": [["the", 12], ["one", 10], ["going", 8], ["and", 8]],
  "hold": [["the", 12], ["one", 10], ["every", 8], ["and", 8]],
  "step": [["the", 12], ["one", 10], ["by", 8], ["and", 8]],
  "short": [["and", 10], ["the", 10], ["one", 8], ["ends", 8]],
  "clear": [["the", 12], ["one", 10], ["and", 10], ["better", 8]]
};

const START = "<start>";

/** Distribution for one step of the chain, as plain probabilities. */
export function markovDistribution(context) {
  const key = Object.prototype.hasOwnProperty.call(MARKOV, context) ? context : START;
  const entries = MARKOV[key];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  return entries.map(([word, weight]) => ({
    word,
    weight,
    prob: weight / total
  }));
}

/* ------------------------------------------------------------------ */
/* Temperature and top k math                                          */
/* ------------------------------------------------------------------ */

/** Softmax over an array of logits. */
export function softmax(logits) {
  const infinite = logits.filter((value) => value === Infinity).length;
  if (infinite) return logits.map((value) => value === Infinity ? 1 / infinite : 0);
  const max = logits.reduce((largest, value) => Number.isFinite(value) ? Math.max(largest, value) : largest, -Infinity);
  if (max === -Infinity) return logits.map(() => 0);
  const exps = logits.map((value) => Number.isFinite(value) ? Math.exp(value - max) : 0);
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Reshape a distribution with temperature.
 * temperature 1 returns the original probabilities.
 * temperature below 1 sharpens toward the top word.
 * temperature above 1 flattens toward uniform.
 * temperature 0 or below resolves to a greedy one hot distribution.
 */
export function applyTemperature(dist, temperature) {
  const t = Number(temperature);
  const logs = dist.map((entry) => Number.isFinite(entry.prob) && entry.prob > 0 ? Math.log(entry.prob) : -Infinity);
  const maximum = logs.reduce((a, b) => Math.max(a, b), -Infinity);
  if (maximum === -Infinity) return dist.map((entry) => ({ ...entry, prob: 0 }));
  if (t === Infinity) {
    const uniform = 1 / dist.length;
    return dist.map((entry) => ({ ...entry, prob: uniform }));
  }
  if (!Number.isFinite(t) || t <= 0) {
    const best = logs.indexOf(maximum);
    return dist.map((entry, i) => ({ ...entry, prob: i === best ? 1 : 0 }));
  }
  const logits = logs.map((value) => (value - maximum) / t);
  const probs = softmax(logits);
  return dist.map((entry, i) => ({ ...entry, prob: probs[i] }));
}

/**
 * Keep only the k highest probability entries, then renormalize.
 * k of 0, negative or larger than the support keeps everything.
 */
export function topK(dist, k) {
  const kk = Math.floor(Number(k));
  if (!Number.isFinite(kk) || kk <= 0 || kk >= dist.length) {
    return dist.map((entry) => ({ ...entry }));
  }
  const order = dist
    .map((entry, i) => i)
    .sort((a, b) => dist[b].prob - dist[a].prob)
    .slice(0, kk);
  const keep = new Set(order);
  const kept = dist.filter((_, i) => keep.has(i));
  const total = kept.reduce((sum, entry) => sum + entry.prob, 0);
  return dist.map((entry, i) => ({
    ...entry,
    prob: keep.has(i) && total > 0 ? entry.prob / total : 0
  }));
}

/** Draw one word from a distribution using the given random function. */
export function sampleFrom(dist, rng) {
  if (!Array.isArray(dist) || dist.length === 0) return null;
  const roll = rng();
  let cumulative = 0;
  for (const entry of dist) {
    cumulative += entry.prob;
    if (roll < cumulative || entry === dist[dist.length - 1]) {
      return entry.word ?? null;
    }
  }
  return dist[dist.length - 1].word ?? null;
}

/**
 * Generate a continuation by walking the Markov table.
 * Same seed, same settings, same words, every time.
 */
export function generate(context, { temperature = 1, topKValue = 0, maxWords = 10, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const words = [];
  const steps = [];
  let current = context;
  // null/undefined use the default; malformed non-null values still clamp to 0.
  const limit = maxWords == null
    ? 10
    : Number.isFinite(Number(maxWords))
      ? Math.max(0, Math.min(256, Math.floor(Number(maxWords))))
      : 0;

  for (let i = 0; i < limit; i += 1) {
    const raw = markovDistribution(current);
    if (raw.length === 0) break;
    let shaped = applyTemperature(raw, temperature);
    shaped = topK(shaped, topKValue);
    const word = sampleFrom(shaped, rng);
    steps.push({
      context: current,
      word,
      dist: shaped.map((entry) => ({ word: entry.word, prob: entry.prob }))
    });
    words.push(word);
    current = word;
  }

  return { words, steps };
}

/* ------------------------------------------------------------------ */
/* Context window budget                                               */
/* ------------------------------------------------------------------ */

const SUMMARY_TEXT = "Earlier messages, summarized briefly.";

/**
 * Account every message against a window limit.
 * messages is an array of { id, role, text }.
 */
export function budgetAccount(messages, limit) {
  // Malformed limits still collapse to zero; only Infinity maps to "no real
  // cap" so remaining never serializes as null.
  const cap = Number(limit) === Infinity
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Math.floor(Number(limit) || 0));
  const list = Array.isArray(messages) ? messages : [];
  const perMessage = list.map((message, index) => {
    const text = message && typeof message.text === "string" ? message.text : "";
    return {
      id: message && message.id != null ? message.id : `m${index}`,
      role: message && typeof message.role === "string" ? message.role : "user",
      text,
      tokens: countTokens(text)
    };
  });
  const used = perMessage.reduce((sum, entry) => sum + entry.tokens, 0);
  return {
    limit: cap,
    used,
    remaining: Math.max(0, cap - used),
    over: used > cap,
    fill: cap > 0 ? Math.min(1, used / cap) : 1,
    perMessage
  };
}

/**
 * Compare truncation strategies on the same conversation.
 * Strategies:
 *   "recent"    keep system messages plus the newest messages that fit
 *   "bookends"  keep system messages, the first user message, then the newest
 *   "summary"   drop middle messages and spend 12 simulated tokens on a summary
 */
export function truncate(messages, limit, strategy = "recent") {
  const account = budgetAccount(messages, limit);
  const entries = account.perMessage;
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error("Message identifiers must be unique");
  }
  const cap = account.limit;
  const kept = new Set();
  let keptTokens = 0;
  const fits = (tokens) => keptTokens + tokens <= cap;
  const keep = (entry) => {
    if (!fits(entry.tokens)) return false;
    kept.add(entry.id);
    keptTokens += entry.tokens;
    return true;
  };

  // Priority never overrides the hard token cap. Whole messages that cannot
  // fit are omitted, including an oversized system message or opener.
  for (const entry of entries.filter((entry) => entry.role === "system")) keep(entry);
  const nonSystem = entries.filter((entry) => entry.role !== "system");
  if (strategy === "bookends" || strategy === "summary") {
    const opener = nonSystem.find((entry) => entry.role === "user");
    if (opener) keep(opener);
  }
  const newestFirst = nonSystem.filter((entry) => !kept.has(entry.id)).reverse();
  for (const entry of newestFirst) {
    if (!keep(entry)) break;
  }

  const keptIds = entries.filter((entry) => kept.has(entry.id)).map((entry) => entry.id);
  const droppedIds = entries.filter((entry) => !kept.has(entry.id)).map((entry) => entry.id);
  let summaryStub = null;
  const summaryTokens = countTokens(SUMMARY_TEXT);
  if (strategy === "summary" && droppedIds.length > 0 && fits(summaryTokens)) {
    summaryStub = { text: SUMMARY_TEXT, tokens: summaryTokens };
    keptTokens += summaryTokens;
  }
  return { strategy, limit: cap, keptIds, droppedIds, summaryStub,
    usedAfter: keptTokens, remainingAfter: cap - keptTokens };
}

/* ------------------------------------------------------------------ */
/* Prompt assembly                                                     */
/* ------------------------------------------------------------------ */

/**
 * Assemble a structured prompt from its four parts.
 * Returns { text, parts } where each part is labeled for the page to annotate.
 */
export function assemblePrompt(input) {
  const { role = "", task = "", constraints = [], format = "" } = input || {};
  // Coerce hostile input: objects and nulls become empty strings rather than
  // "- null" or "- [object Object]" bullets, and non arrays are ignored.
  const str = (v) => (v == null || typeof v === "object" ? "" : String(v));
  const lines = [];
  const parts = [];

  const roleText = str(role).trim();
  if (roleText !== "") {
    lines.push(`You are ${roleText}.`);
    parts.push({ label: "Role", text: `You are ${roleText}.` });
  }
  const taskText = str(task).trim();
  if (taskText !== "") {
    lines.push(taskText);
    parts.push({ label: "Task", text: taskText });
  }
  const constraintList = (Array.isArray(constraints)
    ? constraints.map((c) => str(c).trim())
    : typeof constraints === "string" ? constraints.split("\n").map((c) => c.trim()) : [])
    .filter((c) => c !== "");
  if (constraintList.length > 0) {
    const block = constraintList.map((c) => `- ${c}`).join("\n");
    lines.push(block);
    parts.push({ label: "Constraints", text: block });
  }
  const formatText = str(format).trim();
  if (formatText !== "") {
    lines.push(`Respond as ${formatText}.`);
    parts.push({ label: "Format", text: `Respond as ${formatText}.` });
  }

  return { text: lines.join("\n\n"), parts };
}

/* ------------------------------------------------------------------ */
/* Deepened analytics: information theory and strategy comparison      */
/* ------------------------------------------------------------------ */

/**
 * Shannon entropy in bits of a probability distribution.
 * Entries with zero probability contribute nothing. Non finite or negative
 * probabilities are ignored so a malformed distribution degrades safely.
 */
export function entropy(dist) {
  return normalizedOdds(dist).probs.reduce((sum, p) => sum - p * Math.log2(p), 0);
}

/** Entropy support, defined as 2 raised to the entropy. */
export function entropySupport(dist) {
  return Math.pow(2, entropy(dist));
}

function normalizedOdds(dist) {
  const weights = (Array.isArray(dist) ? dist : [])
    .map((entry) => Number(entry && entry.prob))
    .filter((p) => Number.isFinite(p) && p > 0);
  if (!weights.length) return { probs: [], mass: 0 };
  const largest = weights.reduce((a, b) => Math.max(a, b), 0);
  const scaled = weights.map((p) => p / largest);
  const scaleSum = scaled.reduce((a, b) => a + b, 0);
  const mass = weights.reduce((a, b) => a + b, 0);
  return { probs: scaled.map((p) => p / scaleSum).filter((p) => p > 0),
    mass: Number.isFinite(mass) ? mass : null };
}

/**
 * A compact diagnostic bundle for a next word distribution.
 * support is the count of entries with positive probability, effectiveSupport
 * is the inverse Simpson index (1 / sum of p squared), and topProb is the
 * largest probability. All values are deterministic.
 */
export function distributionDiagnostics(dist) {
  const odds = normalizedOdds(dist);
  const normalized = odds.probs;
  let entropyBits = 0;
  let simpson = 0;
  let topProb = 0;
  for (const p of normalized) {
    entropyBits += -p * Math.log2(p);
    simpson += p * p;
    if (p > topProb) topProb = p;
  }
  return {
    support: normalized.length,
    entropyBits: Number(entropyBits.toFixed(6)),
    entropySupport: Number(Math.pow(2, entropyBits).toFixed(6)),
    effectiveSupport: simpson > 0 ? Number((1 / simpson).toFixed(6)) : 0,
    topProb: Number(topProb.toFixed(6)),
    mass: odds.mass === null ? null : Number(odds.mass.toFixed(6))
  };
}

/**
 * Sweep temperature from low to high and report how the shaped distribution
 * changes. Every point is computed from the real bigram table with the given
 * top k setting, so the curve is exact rather than interpolated.
 */
export function temperatureSweep(context, { topKValue = 0, steps = 12, min = 0.05, max = 2 } = {}) {
  const count = Number.isFinite(steps) && steps >= 2 ? Math.min(64, Math.floor(steps)) : 12;
  const lo = Number.isFinite(min) ? Math.max(0, min) : 0.05;
  const hi = Number.isFinite(max) && max > lo ? max : lo + 1;
  const points = [];
  for (let i = 0; i < count; i++) {
    const temperature = lo + ((hi - lo) * i) / (count - 1);
    const raw = markovDistribution(context);
    const shaped = topK(applyTemperature(raw, temperature), topKValue);
    const diag = distributionDiagnostics(shaped);
    points.push({
      index: i,
      temperature: Number(temperature.toFixed(4)),
      entropyBits: diag.entropyBits,
      entropySupport: diag.entropySupport,
      effectiveSupport: diag.effectiveSupport,
      topProb: diag.topProb,
      support: diag.support
    });
  }
  return { context, topKValue, steps: count, min: lo, max: hi, points };
}

/**
 * Sweep top k from one to the full support and report the same diagnostics.
 * Support can only shrink or stay flat as k decreases, and entropy is
 * non decreasing as k grows.
 */
export function topKSweep(context, { temperature = 1, maxK = 0 } = {}) {
  const raw = markovDistribution(context);
  const cap = Number.isFinite(maxK) && maxK > 0 ? Math.min(Math.max(1, Math.floor(maxK)), raw.length) : raw.length;
  const points = [];
  for (let k = 1; k <= cap; k++) {
    const shaped = topK(applyTemperature(raw, temperature), k);
    const diag = distributionDiagnostics(shaped);
    points.push({ k, ...diag });
  }
  return { context, temperature, maxK: cap, points };
}

/**
 * Compare all three truncation strategies on one conversation and limit.
 * Returns an ordered comparison table with kept and dropped counts, token
 * usage, and a retention score (share of original message tokens retained).
 */
export function compareTruncationStrategies(messages, limit) {
  const account = budgetAccount(messages, limit);
  const originalTokens = account.used;
  const strategies = ["recent", "bookends", "summary"];
  const rows = strategies.map((strategy) => {
    const result = truncate(messages, limit, strategy);
    const score = contextRetentionScore(messages, result, account);
    return {
      strategy,
      keptCount: result.keptIds.length,
      droppedCount: result.droppedIds.length,
      usedAfter: result.usedAfter,
      remainingAfter: result.remainingAfter,
      summaryTokens: result.summaryStub ? result.summaryStub.tokens : 0,
      retentionScore: score.retentionScore,
      retainedMessageTokens: score.retainedMessageTokens,
      withinLimit: result.usedAfter <= account.limit
    };
  });
  return { limit: account.limit, originalTokens, originalCount: messages.length, rows };
}

/**
 * Fraction of original message tokens kept by a truncation result.
 * System messages are included. A summary stub adds tokens but is not counted
 * as retained conversation, so the score never exceeds one.
 */
export function contextRetentionScore(messages, truncateResult, account) {
  const acct = account || budgetAccount(messages, truncateResult ? truncateResult.limit : 0);
  const kept = new Set((truncateResult && truncateResult.keptIds) || []);
  let retained = 0;
  for (const entry of acct.perMessage) {
    if (kept.has(entry.id)) retained += entry.tokens;
  }
  const total = acct.used;
  return {
    retainedMessageTokens: retained,
    originalMessageTokens: total,
    retentionScore: total > 0 ? Number((retained / total).toFixed(6)) : 1
  };
}
