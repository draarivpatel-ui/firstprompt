import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as simulator from '../../js/simulator.js';

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {};
    this.style = {}; this.value = ''; this.checked = false; this._text = ''; this._html = '';
    this.classList = { toggle() {} };
  }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(value) { this._html = String(value); this._text = ''; this.children = []; }
  append(...children) { for (const child of children) this.appendChild(child); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  select() {}
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  emit(type) { return this.listeners[type]({ target: this }); }
}

export function mountPage({ clipboard, copyResult = false } = {}) {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const nodes = {};
  for (const match of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const element = new Element(match[1]);
    element.value = /\bvalue="([^"]*)"/.exec(match[2])?.[1] || '';
    element.checked = /\bchecked\b/.test(match[2]);
    nodes[match[3]] = element;
  }
  nodes['limit-select'].value = '128'; nodes['format-select'].value = '';
  const strategies = ['strategy-recent', 'strategy-bookends', 'strategy-summary'].map((id) => nodes[id]);
  for (const match of html.matchAll(/<input\b([^>]*\bname="strategy"[^>]*)>/g)) {
    const id = /\bid="([^"]+)"/.exec(match[1])?.[1];
    if (id && nodes[id]) nodes[id].value = /\bvalue="([^"]*)"/.exec(match[1])?.[1] || '';
  }
  const radios = strategies.every(Boolean) ? strategies : Array.from(html.matchAll(/<input\b([^>]*\bname="strategy"[^>]*)>/g), (match) => {
    const element = new Element('input');
    element.value = /\bvalue="([^"]*)"/.exec(match[1])?.[1] || '';
    element.checked = /\bchecked\b/.test(match[1]);
    return element;
  });
  const zones = new Map();
  const document = {
    body: new Element('body'),
    execCommand: () => copyResult,
    getElementById: (id) => nodes[id],
    querySelector: (selector) => { if (!zones.has(selector)) zones.set(selector, new Element()); return zones.get(selector); },
    querySelectorAll: () => radios,
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => { const node = new Element(); node.textContent = text; return node; }
  };
  const source = readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8')
    .replace(/import\s*\{([\s\S]*?)\}\s*from\s*"\.\/simulator\.js";/, 'const {$1} = simulator;');
  vm.runInNewContext(source, { document, simulator, navigator: { clipboard },
    window: { clearTimeout() {}, setTimeout() { return 1; } } }, { filename: 'app.js' });
  return { nodes, radios, document };
}
