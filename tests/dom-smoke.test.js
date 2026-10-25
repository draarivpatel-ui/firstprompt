import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tokenize,
  countTokens,
  tokenCost,
  generate,
  truncate,
  assemblePrompt
} from '../js/simulator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(repoRoot, 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(repoRoot, 'js/app.js'), 'utf8');

test('DOM Smoke 01: index.html starts with HTML5 doctype and lang=en', () => {
  assert.match(indexHtml.trimStart(), /^<!DOCTYPE html>/i);
  assert.match(indexHtml, /<html\s+lang="en">/i);
});

test('DOM Smoke 02: index.html contains UTF-8 charset and responsive viewport meta tags', () => {
  assert.match(indexHtml, /<meta\s+charset="UTF-8"\s*\/>/i);
  assert.match(indexHtml, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1"\s*\/>/i);
});

test('DOM Smoke 03: index.html contains non-empty title, author, and meta description', () => {
  assert.match(indexHtml, /<title>FirstPrompt,\s*An Interactive Primer For Language Models<\/title>/);
  assert.match(indexHtml, /<meta\s+name="description"\s+content="[^"]{40,}"\s*\/>/);
  assert.match(indexHtml, /<meta\s+name="author"\s+content="Aariv Patel"\s*\/>/);
});

test('DOM Smoke 04: OpenGraph and Twitter meta tags are complete', () => {
  assert.match(indexHtml, /property="og:title"\s+content="[^"]+"/);
  assert.match(indexHtml, /property="og:description"\s+content="[^"]+"/);
  assert.match(indexHtml, /property="og:type"\s+content="website"/);
  assert.match(indexHtml, /property="og:url"\s+content="https:\/\/[^"]+"/);
  assert.match(indexHtml, /name="twitter:card"\s+content="summary"/);
});

test('DOM Smoke 05: inline SVG favicon and theme-color exist in <head>', () => {
  assert.match(indexHtml, /<meta\s+name="theme-color"\s+content="#1d332b"\s*\/>/);
  assert.match(indexHtml, /<link\s+rel="icon"\s+href="data:image\/svg\+xml,/);
});

test('DOM Smoke 06: index.html contains exactly one <h1> element', () => {
  const h1Matches = indexHtml.match(/<h1\b[^>]*>/gi) || [];
  assert.equal(h1Matches.length, 1);
});

test('DOM Smoke 07: heading hierarchy in index.html never skips levels', () => {
  const levels = [...indexHtml.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  assert.equal(levels.length, 8);
  assert.equal(levels[0], 1);
  for (let i = 1; i < levels.length; i += 1) {
    assert.ok(
      levels[i] <= levels[i - 1] + 1,
      `Heading level jumped from h${levels[i - 1]} to h${levels[i]}`
    );
  }
});

test('DOM Smoke 08: all 53 id attributes in index.html are unique', () => {
  const ids = [...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 53);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length, 'Duplicate IDs found in index.html');
});

test('DOM Smoke 09: accessible skip-link points to #main and target landmark exists', () => {
  assert.match(indexHtml, /<a\s+class="skip-link"\s+href="#main">/);
  assert.match(indexHtml, /<main\s+id="main">/);
});

test('DOM Smoke 10: <noscript> fallback banner is present inside <body>', () => {
  assert.match(indexHtml, /<noscript>[\s\S]*?<\/noscript>/);
});

test('DOM Smoke 11: semantic landmarks (header, nav, main, footer) are present', () => {
  assert.match(indexHtml, /<header\b[^>]*>/);
  assert.match(indexHtml, /<nav\b[^>]*aria-label="Lessons">/);
  assert.match(indexHtml, /<main\s+id="main">/);
  assert.match(indexHtml, /<footer\s+class="site-footer">/);
});

test('DOM Smoke 12: all four interactive lesson sections (#tokens, #temperature, #window, #builder) exist', () => {
  for (const lesson of ['tokens', 'temperature', 'window', 'builder']) {
    assert.match(indexHtml, new RegExp(`<section\\s+class="lesson"\\s+id="${lesson}"\\s+aria-labelledby="${lesson}-title">`));
    assert.match(indexHtml, new RegExp(`<h2\\s+id="${lesson}-title">`));
  }
});

test('DOM Smoke 13: every aria-labelledby token in index.html resolves to an existing ID', () => {
  const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const rawRefs = [...indexHtml.matchAll(/\baria-labelledby="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(rawRefs.length >= 5);
  for (const raw of rawRefs) {
    for (const ref of raw.trim().split(/\s+/)) {
      assert.ok(htmlIds.has(ref), `aria-labelledby target #${ref} is missing in index.html`);
    }
  }
});

test('DOM Smoke 14: every label[for] attribute in index.html resolves to an existing form control ID', () => {
  const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const forIds = [...indexHtml.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(forIds.length >= 9);
  for (const id of forIds) {
    assert.ok(htmlIds.has(id), `label[for="${id}"] has no matching control ID`);
  }
});

test('DOM Smoke 15: all DOM IDs looked up via $(id) in js/app.js exist in index.html', () => {
  const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const boundIds = [...appJs.matchAll(/\$\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
  assert.ok(boundIds.length >= 30);
  for (const id of boundIds) {
    assert.ok(htmlIds.has(id), `ID #${id} looked up in js/app.js is missing from index.html`);
  }
});

test('DOM Smoke 16: context window strategy radio buttons (recent, bookends, summary) exist inside a fieldset with legend', () => {
  assert.match(indexHtml, /<fieldset\s+class="strategy-set">[\s\S]*?<legend\b[^>]*>/);
  for (const val of ['recent', 'bookends', 'summary']) {
    assert.match(indexHtml, new RegExp(`input\\s+type="radio"\\s+name="strategy"\\s+value="${val}"`));
  }
});

test('DOM Smoke 17: styles.css enforces overflow-x: clip on html and body', () => {
  assert.match(stylesCss, /overflow-x:\s*clip/);
});

test('DOM Smoke 18: styles.css provides :focus-visible outline and reduced-motion guard', () => {
  assert.match(stylesCss, /:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(stylesCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('DOM Smoke 19: styles.css enforces tabular-nums for numeric alignment', () => {
  assert.match(stylesCss, /font-variant-numeric:\s*tabular-nums/);
});

test('DOM Smoke 20: zero em-dashes or en-dashes across HTML, CSS, and UI JS', () => {
  assert.equal(/[\u2013\u2014]/.test(indexHtml), false);
  assert.equal(/[\u2013\u2014]/.test(stylesCss), false);
  assert.equal(/[\u2013\u2014]/.test(appJs), false);
});

test('DOM Smoke 21: zero emoji characters across HTML, CSS, and UI JS', () => {
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(indexHtml), false);
  assert.equal(emojiRegex.test(stylesCss), false);
  assert.equal(emojiRegex.test(appJs), false);
});

test('DOM Smoke 22: zero uppercase CSS transforms in styles.css', () => {
  assert.equal(/text-transform\s*:\s*uppercase/i.test(stylesCss), false);
});

test('DOM Smoke 23: zero Todo/Fixme/Lorem placeholders or personal email leaks in HTML, CSS, and JS', () => {
  const combined = `${indexHtml}\n${stylesCss}\n${appJs}`;
  assert.equal(/\b(?:TODO|FIXME|XXX|HACK|lorem ipsum)\b/i.test(combined), false);
  assert.equal(/[a-z0-9._%+-]+@gmail\.com/i.test(combined), false);
});

test('DOM Smoke 24: tokenizer and tokenCost compute deterministic counts for Lesson 1', () => {
  const sample = 'Language models read and write one token at a time.';
  const tokens = tokenize(sample);
  assert.ok(tokens.length >= 10);
  assert.equal(countTokens(sample), tokens.length);
  assert.ok(tokenCost(tokens, 0.0000025) > 0);
});

test('DOM Smoke 25: generate and truncate run deterministically across all three window strategies', () => {
  const genA = generate({ start: 'The', temperature: 0.8, k: 4, maxWords: 6, seed: 42 });
  const genB = generate({ start: 'The', temperature: 0.8, k: 4, maxWords: 6, seed: 42 });
  assert.deepEqual(genA, genB);
  const messages = [
    { id: 'm1', role: 'system', text: 'You are a helpful tutor.' },
    { id: 'm2', role: 'user', text: 'What is a token in a language model?' },
    { id: 'm3', role: 'assistant', text: 'A token is a short chunk of text such as a word or subword.' },
    { id: 'm4', role: 'user', text: 'How does temperature change the next word distribution?' }
  ];
  for (const strategy of ['recent', 'bookends', 'summary']) {
    const res = truncate(messages, 30, strategy);
    assert.ok(res.usedAfter <= 30);
  }
});

test('DOM Smoke 26: assemblePrompt formats all four builder fields cleanly', () => {
  const out = assemblePrompt({
    role: 'a patient teacher for beginners',
    task: 'Explain what a token is',
    constraints: ['Use everyday words', 'Keep it under 100 words'],
    format: 'A Short Paragraph'
  });
  assert.equal(out.parts.length, 4);
  assert.deepEqual(out.parts.map((p) => p.label), ['Role', 'Task', 'Constraints', 'Format']);
  assert.ok(out.text.includes('Explain what a token is'));
});
