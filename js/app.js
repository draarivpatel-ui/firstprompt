/*
 * FirstPrompt page wiring.
 * All rendering reads from js/simulator.js, the same code the tests cover.
 * No timers, no animation loops, no network.
 */

import {
  tokenize,
  countTokens,
  tokenCost,
  markovDistribution,
  applyTemperature,
  topK,
  generate,
  budgetAccount,
  truncate,
  assemblePrompt
} from "./simulator.js";

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* Lesson 1, token table                                               */
/* ------------------------------------------------------------------ */

const tokenInput = $("token-input");
const priceInput = $("token-price");
const tokenCountEl = $("token-count");
const charCountEl = $("char-count");
const tokenCostEl = $("token-cost");
const costPerMillionEl = $("cost-per-million");
const chipsEl = $("token-chips");

const CHIP_LIMIT = 300;

function formatMoney(value) {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 0.01) return "$" + value.toFixed(2);
  const fixed = value.toFixed(12).replace(/0+$/, "");
  return "$" + fixed;
}

function renderTokens() {
  const text = tokenInput.value;
  const price = Number(priceInput.value);
  const tokens = tokenize(text);

  tokenCountEl.textContent = String(tokens.length);
  charCountEl.textContent = String(text.length);
  tokenCostEl.textContent = formatMoney(tokenCost(tokens, price));
  costPerMillionEl.textContent =
    price > 0 ? formatMoney(price * 1000000) + " per million tokens" : "Free At A Price Of Zero";

  chipsEl.textContent = "";
  const shown = tokens.slice(0, CHIP_LIMIT);
  for (const token of shown) {
    const li = document.createElement("li");
    const chip = document.createElement("span");
    chip.className =
      token.kind === "subword" ? "tok tok-subword" : token.kind === "punct" ? "tok tok-punct" : "tok";
    chip.textContent = token.text;
    chip.title =
      token.kind === "subword"
        ? "Subword piece, one token"
        : token.kind === "punct"
          ? "Punctuation, one token"
          : "Whole word, one token";
    li.appendChild(chip);
    chipsEl.appendChild(li);
  }
  if (tokens.length > shown.length) {
    const li = document.createElement("li");
    li.textContent = `+ ${tokens.length - shown.length} more`;
    li.className = "field-help";
    chipsEl.appendChild(li);
  }
}

tokenInput.addEventListener("input", renderTokens);
priceInput.addEventListener("input", renderTokens);

/* ------------------------------------------------------------------ */
/* Lesson 2, temperature dial                                          */
/* ------------------------------------------------------------------ */

const tempSlider = $("temp-slider");
const topkSlider = $("topk-slider");
const tempOutput = $("temp-output");
const topkOutput = $("topk-output");
const topkHelp = $("topk-help");
const needle = $("dial-needle");
const regimeLine = $("regime-line");
const distList = $("dist-list");
const distCaption = $("dist-caption");
const startChips = $("start-chips");
const seedInput = $("seed-input");
const drawBtn = $("draw-btn");
const sampleList = $("sample-list");

const zonePaths = {
  predict: document.querySelector(".dial-zone-predict"),
  balanced: document.querySelector(".dial-zone-balanced"),
  adventure: document.querySelector(".dial-zone-adventure")
};

const START_PHRASES = [
  ["the", "the"],
  ["the cat", "cat"],
  ["a prompt", "prompt"],
  ["every token", "token"],
  ["small steps", "steps"]
];

const tempState = { temperature: 0.8, topKValue: 8, seed: 7, lastWord: "the" };

function regimeText(t) {
  if (t <= 0.55) {
    return "<strong>Predictable.</strong> The favorite word wins almost every draw, so sentences repeat.";
  }
  if (t <= 1.25) {
    return "<strong>Balanced.</strong> The favorite still leads, but the chase words get real chances.";
  }
  if (t <= 1.6) {
    return "<strong>Curious.</strong> Rare words surface often and the writing turns colorful.";
  }
  return "<strong>Adventurous.</strong> Odds flatten toward uniform and grammar starts to wobble.";
}

function shapedDistribution(contextWord, temperature, topKValue) {
  const raw = markovDistribution(contextWord);
  const shaped = applyTemperature(raw, temperature);
  return topK(shaped, topKValue).sort((a, b) => b.prob - a.prob);
}

function renderDial() {
  const t = tempState.temperature;
  tempOutput.textContent = t.toFixed(2);
  needle.style.transform = `rotate(${(t - 1) * 90}deg)`;

  const zone = t < 0.6 ? "predict" : t <= 1.4 ? "balanced" : "adventure";
  for (const [name, path] of Object.entries(zonePaths)) {
    path.classList.toggle("dial-zone-active", name === zone);
  }

  regimeLine.innerHTML = regimeText(t);
}

function renderTopK() {
  const raw = markovDistribution(tempState.lastWord);
  const support = raw.length;
  const k = tempState.topKValue;
  topkOutput.textContent = k >= support ? "All" : String(k);
  topkHelp.textContent =
    k >= support
      ? "At 8 the menu keeps every word in this small table."
      : `Only the ${k} highest odds survive. The rest are removed and the menu is renormalized.`;
}

function renderDistribution() {
  const shaped = shapedDistribution(tempState.lastWord, tempState.temperature, tempState.topKValue);
  const support = markovDistribution(tempState.lastWord).length;
  const kept = shaped.filter((entry) => entry.prob > 0.0001);

  distList.textContent = "";
  kept.forEach((entry, index) => {
    const li = document.createElement("li");
    li.className = index === 0 ? "dist-row dist-row-top" : "dist-row";

    const word = document.createElement("span");
    word.className = "dist-word";
    word.textContent = entry.word;

    const track = document.createElement("span");
    track.className = "dist-track";
    const fill = document.createElement("span");
    fill.className = "dist-fill";
    fill.style.transform = `scaleX(${Math.max(0.01, entry.prob)})`;
    track.appendChild(fill);

    const pct = document.createElement("span");
    pct.className = "dist-pct";
    pct.textContent = `${(entry.prob * 100).toFixed(1)}%`;

    li.append(word, track, pct);
    distList.appendChild(li);
  });

  const removed = support - kept.length;
  distCaption.textContent =
    removed > 0
      ? `${removed} word${removed === 1 ? "" : "s"} cut by top k and the rest rescaled to 100%.`
      : "Nothing cut. Top k is wider than the table.";
}

function renderSamples() {
  sampleList.textContent = "";
  const seed = Math.floor(Number(seedInput.value) || 0);
  tempState.seed = seed;
  for (let i = 0; i < 3; i += 1) {
    const result = generate(tempState.lastWord, {
      temperature: tempState.temperature,
      topKValue: tempState.topKValue,
      maxWords: 8,
      seed: seed + i * 1000
    });
    const li = document.createElement("li");
    li.textContent = `"${tempState.lastWord} ${result.words.join(" ")}"`;
    sampleList.appendChild(li);
  }
}

function renderTemperaturePanel() {
  renderDial();
  renderTopK();
  renderDistribution();
}

tempSlider.addEventListener("input", () => {
  tempState.temperature = Number(tempSlider.value);
  renderTemperaturePanel();
});

topkSlider.addEventListener("input", () => {
  tempState.topKValue = Number(topkSlider.value);
  renderTemperaturePanel();
  renderSamples();
});

seedInput.addEventListener("input", renderSamples);

drawBtn.addEventListener("click", renderSamples);

for (const [label, contextWord] of START_PHRASES) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip-btn";
  button.textContent = label;
  button.setAttribute("aria-pressed", String(contextWord === tempState.lastWord));
  button.addEventListener("click", () => {
    tempState.lastWord = contextWord;
    for (const child of startChips.children) {
      child.setAttribute("aria-pressed", String(child === button));
    }
    renderTemperaturePanel();
    renderSamples();
  });
  startChips.appendChild(button);
}

/* ------------------------------------------------------------------ */
/* Lesson 3, context window                                            */
/* ------------------------------------------------------------------ */

const limitSelect = $("limit-select");
const meterEl = $("meter");
const meterLimitLabel = $("meter-limit-label");
const windowStatus = $("window-status");
const messageList = $("message-list");
const strategyInputs = Array.from(document.querySelectorAll('input[name="strategy"]'));

const SYSTEM_TEXT = "You are a friendly tutor for people new to AI.";
const QUESTIONS = [
  "What is a token?",
  "Why do pieces matter?",
  "What happens when the window fills?",
  "How do I keep a prompt short?",
  "What does temperature change?",
  "Why did the answer forget my first question?"
];
const REPLIES = [
  "A token is a piece of text the model reads, sometimes a word, sometimes smaller.",
  "Rare words split into smaller pieces, so longer text costs more.",
  "Older messages get truncated, dropped or summarized to make room.",
  "Cut background detail and state the task first.",
  "It reshapes the odds, making the model safer or braver.",
  "The oldest turns fell out of the window, so the model never saw them."
];

const chat = {
  messages: [],
  nextId: 1,
  questionIndex: 0,
  replyIndex: 0
};

function roleLabel(role) {
  if (role === "system") return "System";
  return role === "user" ? "You" : "Assistant";
}

function addMessage(role, text) {
  chat.messages.push({ id: `m${chat.nextId}`, role, text });
  chat.nextId += 1;
}

function resetConversation() {
  chat.messages = [];
  chat.nextId = 1;
  chat.questionIndex = 0;
  chat.replyIndex = 0;
  addMessage("system", SYSTEM_TEXT);
  addMessage("user", QUESTIONS[0]);
  chat.questionIndex = 1;
  addMessage("assistant", REPLIES[0]);
  chat.replyIndex = 1;
  addMessage("user", QUESTIONS[1]);
  chat.questionIndex = 2;
}

function renderWindow() {
  const limit = Number(limitSelect.value);
  const strategy = strategyInputs.find((input) => input.checked).value;
  const account = budgetAccount(chat.messages, limit);
  const plan = truncate(chat.messages, limit, strategy);

  meterLimitLabel.textContent = String(limit);
  meterEl.textContent = "";
  meterEl.setAttribute(
    "aria-label",
    `Context window fill, ${account.used} of ${limit} tokens used`
  );
  for (const entry of account.perMessage) {
    if (entry.tokens <= 0) continue;
    const seg = document.createElement("span");
    seg.className = `meter-seg seg-${entry.role}`;
    seg.style.flexGrow = String(entry.tokens);
    seg.title = `${roleLabel(entry.role)}, ${entry.tokens} tokens`;
    meterEl.appendChild(seg);
  }
  if (account.over) {
    const over = document.createElement("span");
    over.className = "meter-seg seg-system";
    over.style.flexGrow = String(account.used - limit);
    over.title = "Overflow beyond the window";
    meterEl.appendChild(over);
  }

  const keptSet = new Set(plan.keptIds);
  const droppedSet = new Set(plan.droppedIds);

  if (!account.over) {
    windowStatus.innerHTML =
      `This conversation uses <strong>${account.used}</strong> of <strong>${limit}</strong> tokens ` +
      `and leaves <strong>${account.remaining}</strong> free.`;
  } else {
    const droppedCount = plan.droppedIds.length;
    const tail = plan.summaryStub
      ? `The summary stand in costs ${plan.summaryStub.tokens} tokens.`
      : `Strategy ${strategy === "recent" ? "Recent First" : strategy === "bookends" ? "Keep The Opener" : "Summarize The Middle"} ` +
        `keeps ${plan.usedAfter} tokens and drops ${droppedCount} message${droppedCount === 1 ? "" : "s"}.`;
    windowStatus.innerHTML =
      `<span class="over">Over budget by ${account.used - limit} tokens.</span> ` +
      `<strong>${account.used}</strong> of <strong>${limit}</strong> used. ${tail}`;
  }

  messageList.textContent = "";
  for (const entry of account.perMessage) {
    const li = document.createElement("li");
    const dropped = droppedSet.has(entry.id);
    li.className = dropped ? "message-row is-dropped" : "message-row";

    const role = document.createElement("span");
    role.className = entry.role === "system" ? "role role-system" : "role";
    role.textContent = roleLabel(entry.role);

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = entry.text;

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${entry.tokens} tokens`;

    li.append(role, text, count);

    if (account.over) {
      const fate = document.createElement("span");
      fate.className = dropped ? "fate fate-dropped" : "fate fate-kept";
      fate.textContent = dropped ? "Dropped" : "Kept";
      li.appendChild(fate);
    }
    messageList.appendChild(li);
  }

  if (account.over && plan.summaryStub) {
    const li = document.createElement("li");
    li.className = "message-row is-stub";
    const role = document.createElement("span");
    role.className = "role";
    role.textContent = "Summary";
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = plan.summaryStub.text;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${plan.summaryStub.tokens} tokens`;
    li.append(role, text, count);
    messageList.appendChild(li);
  }
}

$("add-question").addEventListener("click", () => {
  addMessage("user", QUESTIONS[chat.questionIndex % QUESTIONS.length]);
  chat.questionIndex += 1;
  renderWindow();
});

$("add-reply").addEventListener("click", () => {
  addMessage("assistant", REPLIES[chat.replyIndex % REPLIES.length]);
  chat.replyIndex += 1;
  renderWindow();
});

$("remove-last").addEventListener("click", () => {
  chat.messages.pop();
  renderWindow();
});

$("clear-chat").addEventListener("click", () => {
  resetConversation();
  renderWindow();
});

limitSelect.addEventListener("change", renderWindow);
for (const input of strategyInputs) {
  input.addEventListener("change", renderWindow);
}

/* ------------------------------------------------------------------ */
/* Lesson 4, prompt builder                                            */
/* ------------------------------------------------------------------ */

const roleInput = $("role-input");
const taskInput = $("task-input");
const constraintsInput = $("constraints-input");
const formatSelect = $("format-select");
const promptPreview = $("prompt-preview");
const previewCount = $("preview-count");
const builderCount = $("builder-count");
const copyBtn = $("copy-btn");
const copyNote = $("copy-note");

function renderBuilder() {
  const assembled = assemblePrompt({
    role: roleInput.value,
    task: taskInput.value,
    constraints: constraintsInput.value,
    format: formatSelect.value
  });

  promptPreview.textContent = "";
  if (assembled.parts.length === 0) {
    const empty = document.createElement("span");
    empty.className = "prompt-empty";
    empty.textContent = "Start with a role or a task and the assembly appears here.";
    promptPreview.appendChild(empty);
  } else {
    assembled.parts.forEach((part, index) => {
      if (index > 0) promptPreview.appendChild(document.createTextNode("\n\n"));
      const wrap = document.createElement("span");
      wrap.className = "part";
      const tag = document.createElement("span");
      tag.className = "part-tag";
      tag.textContent = part.label;
      wrap.appendChild(tag);
      wrap.appendChild(document.createTextNode(part.text));
      promptPreview.appendChild(wrap);
    });
  }

  const tokens = countTokens(assembled.text);
  previewCount.textContent = `${tokens} tokens`;
  builderCount.textContent = String(tokens);
}

function fillExample() {
  roleInput.value = "A patient teacher for beginners";
  taskInput.value = "Explain what a token is to someone who has never used AI";
  constraintsInput.value = "Use everyday words\nKeep it under 100 words\nSkip the history";
  formatSelect.value = "A Bullet List";
  renderBuilder();
}

for (const field of [roleInput, taskInput, constraintsInput]) {
  field.addEventListener("input", renderBuilder);
}
formatSelect.addEventListener("change", renderBuilder);
$("example-btn").addEventListener("click", fillExample);

let noteTimer = 0;
copyBtn.addEventListener("click", async () => {
  const assembled = assemblePrompt({
    role: roleInput.value,
    task: taskInput.value,
    constraints: constraintsInput.value,
    format: formatSelect.value
  });
  if (assembled.text === "") {
    copyNote.textContent = "Nothing to copy yet.";
    return;
  }
  let copied = false;
  try {
    await navigator.clipboard.writeText(assembled.text);
    copied = true;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = assembled.text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    helper.remove();
  }
  copyNote.textContent = copied ? "Copied." : "Copy blocked, select the text above manually.";
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => {
    copyNote.textContent = "";
  }, 2600);
});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

resetConversation();
renderTokens();
renderTemperaturePanel();
renderSamples();
renderWindow();
renderBuilder();
