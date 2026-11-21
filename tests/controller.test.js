import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPage } from './helpers/dom.js';
import { generate } from '../js/simulator.js';

test('Mounted odds panels contain actual diagnostics, samples and three strategy rows', () => {
  const { nodes } = mountPage();
  assert.equal(nodes['insight-diag-list'].children.length, 12);
  assert.equal(nodes['sample-list'].children.length, 3);
  assert.equal(nodes['insight-compare-body'].children.length, 3);
  assert.equal((nodes['insight-sweep-svg'].innerHTML.match(/<circle/g) || []).length, 12);
});

test('Temperature input refreshes samples and diagnostics from the same settings', () => {
  const { nodes } = mountPage();
  nodes['seed-input'].value = '7'; nodes['temp-slider'].value = '1.6'; nodes['temp-slider'].emit('input');
  for (let i = 0; i < 3; i++) {
    const expected = generate('the', { temperature: 1.6, topKValue: 8, maxWords: 8, seed: 7 + i * 1000 });
    assert.equal(nodes['sample-list'].children[i].textContent, '"the ' + expected.words.join(' ') + '"');
  }
  assert.match(nodes['insight-diag-note'].textContent, /temperature 1.60/);
});

test('Top-k and sweep controls redraw actual support and enforce the visible step cap', () => {
  const { nodes } = mountPage();
  nodes['topk-slider'].value = '1'; nodes['topk-slider'].emit('input');
  assert.equal(nodes['insight-diag-list'].children[1].textContent, '1');
  assert.equal(nodes['insight-diag-list'].children[3].textContent, '0.000');
  nodes['insight-sweep-steps'].value = '100000'; nodes['insight-sweep-steps'].emit('input');
  assert.equal(nodes['insight-sweep-output'].textContent, '24');
  assert.equal((nodes['insight-sweep-svg'].innerHTML.match(/<circle/g) || []).length, 24);
});

test('Context edits recompute all strategy rows and a zero cap never reports retained tokens', () => {
  const { nodes } = mountPage();
  nodes['add-question'].emit('click');
  assert.match(nodes['insight-compare-note'].textContent, /5 messages/);
  nodes['limit-select'].value = '0'; nodes['limit-select'].emit('change');
  for (const row of nodes['insight-compare-body'].children) {
    assert.equal(row.children[2].textContent, '0');
    assert.equal(row.children[3].textContent, '0%');
  }
});

test('Prompt copying uses the assembled text and reports a completed clipboard write', async () => {
  let copied;
  const { nodes } = mountPage({ clipboard: { async writeText(text) { copied = text; } } });
  nodes['example-btn'].emit('click');
  await nodes['copy-btn'].emit('click');
  assert.match(copied, /Explain what a token is/);
  assert.equal(nodes['copy-note'].textContent, 'Copied.');
});

test('Blocked clipboard copying clears its helper and provides a recoverable message', async () => {
  const { nodes, document } = mountPage();
  nodes['example-btn'].emit('click');
  await nodes['copy-btn'].emit('click');
  assert.match(nodes['copy-note'].textContent, /select the text/);
  assert.equal(document.body.children.length, 0);
});
