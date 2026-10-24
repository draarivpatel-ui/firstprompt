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
  let a = seed >>> 0;
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

const WORD_PATTERN = /[A-Za-z]+(?:'[A-Za-z]+)*|\d+|[^\sA-Za-z\d]/g;

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

  if (rest.length >= 4) {
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
      tokens.push(...splitWord(match));
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
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
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
  if (!Number.isFinite(t) || t <= 0) {
    let best = 0;
    for (let i = 1; i < dist.length; i += 1) {
      if (dist[i].prob > dist[best].prob) best = i;
    }
    return dist.map((entry, i) => ({ ...entry, prob: i === best ? 1 : 0 }));
  }
  const logits = dist.map((entry) => Math.log(entry.prob) / t);
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
  const roll = rng();
  let cumulative = 0;
  for (const entry of dist) {
    cumulative += entry.prob;
    if (roll < cumulative || entry === dist[dist.length - 1]) {
      return entry.word;
    }
  }
  return dist[dist.length - 1].word;
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

  for (let i = 0; i < maxWords; i += 1) {
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
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  const perMessage = messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    tokens: countTokens(message.text)
  }));
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
  const cap = account.limit;
  const systemIds = messages.filter((m) => m.role === "system").map((m) => m.id);

  let keptTokens = 0;
  const fits = (extraTokens) => (keptTokens + extraTokens) <= cap;

  const keptIds = [];
  const droppedIds = [];
  let summaryStub = null;

  const keep = (id, tokens) => {
    keptIds.push(id);
    keptTokens += tokens;
  };

  if (strategy === "summary") {
    // Keep system, the first user message and the newest messages, then
    // spend a small fixed budget on a simulated summary of the dropped middle.
    const summaryTokens = countTokens(SUMMARY_TEXT);
    for (const message of messages) {
      if (message.role === "system") {
        keep(message.id, account.perMessage.find((p) => p.id === message.id).tokens);
      }
    }
    const nonSystem = messages.filter((m) => m.role !== "system");
    if (nonSystem.length > 0) {
      const first = nonSystem[0];
      keep(first.id, account.perMessage.find((p) => p.id === first.id).tokens);
    }
    const restNewestFirst = [...nonSystem.slice(1)].reverse();
    for (const message of restNewestFirst) {
      const tokens = account.perMessage.find((p) => p.id === message.id).tokens;
      if (fits(tokens)) {
        keep(message.id, tokens);
      } else {
        droppedIds.push(message.id);
        // A window slides as one block, so stop at the first message that
        // no longer fits and drop everything older with it.
        break;
      }
    }
    if (droppedIds.length > 0 && fits(summaryTokens)) {
      summaryStub = { text: SUMMARY_TEXT, tokens: summaryTokens };
      keptTokens += summaryTokens;
    } else if (droppedIds.length > 0) {
      // No room for the summary either, the drops stand.
      summaryStub = null;
    }
  } else if (strategy === "bookends") {
    const nonSystem = messages.filter((m) => m.role !== "system");
    for (const message of messages) {
      if (message.role === "system") {
        keep(message.id, account.perMessage.find((p) => p.id === message.id).tokens);
      }
    }
    if (nonSystem.length > 0) {
      const first = nonSystem[0];
      keep(first.id, account.perMessage.find((p) => p.id === first.id).tokens);
    }
    const restNewestFirst = [...nonSystem.slice(1)].reverse();
    for (const message of restNewestFirst) {
      const tokens = account.perMessage.find((p) => p.id === message.id).tokens;
      if (fits(tokens)) {
        keep(message.id, tokens);
      } else {
        droppedIds.push(message.id);
        // A window slides as one block, so stop at the first message that
        // no longer fits and drop everything older with it.
        break;
      }
    }
  } else {
    // "recent", keep system then newest first.
    for (const message of messages) {
      if (message.role === "system") {
        keep(message.id, account.perMessage.find((p) => p.id === message.id).tokens);
      }
    }
    const restNewestFirst = [...messages].filter((m) => m.role !== "system").reverse();
    for (const message of restNewestFirst) {
      const tokens = account.perMessage.find((p) => p.id === message.id).tokens;
      if (fits(tokens)) {
        keep(message.id, tokens);
      } else {
        droppedIds.push(message.id);
        // A window slides as one block, so stop at the first message that
        // no longer fits and drop everything older with it.
        break;
      }
    }
  }

  const keptSet = new Set(keptIds);
  const orderedKept = messages.filter((m) => keptSet.has(m.id)).map((m) => m.id);
  // Anything the walk never kept counts as dropped, including messages the
  // walk stopped before reaching.
  const orderedDropped = messages.filter((m) => !keptSet.has(m.id)).map((m) => m.id);

  return {
    strategy,
    limit: cap,
    keptIds: orderedKept,
    droppedIds: orderedDropped,
    summaryStub,
    usedAfter: keptTokens,
    remainingAfter: Math.max(0, cap - keptTokens)
  };
}

/* ------------------------------------------------------------------ */
/* Prompt assembly                                                     */
/* ------------------------------------------------------------------ */

/**
 * Assemble a structured prompt from its four parts.
 * Returns { text, parts } where each part is labeled for the page to annotate.
 */
export function assemblePrompt({ role = "", task = "", constraints = [], format = "" } = {}) {
  const lines = [];
  const parts = [];

  if (role.trim() !== "") {
    lines.push(`You are ${role.trim()}.`);
    parts.push({ label: "Role", text: `You are ${role.trim()}.` });
  }
  if (task.trim() !== "") {
    lines.push(task.trim());
    parts.push({ label: "Task", text: task.trim() });
  }
  const constraintList = (Array.isArray(constraints) ? constraints : String(constraints).split("\n"))
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (constraintList.length > 0) {
    const block = constraintList.map((c) => `- ${c}`).join("\n");
    lines.push(block);
    parts.push({ label: "Constraints", text: block });
  }
  if (format.trim() !== "") {
    lines.push(`Respond as ${format.trim()}.`);
    parts.push({ label: "Format", text: `Respond as ${format.trim()}.` });
  }

  return { text: lines.join("\n\n"), parts };
}
