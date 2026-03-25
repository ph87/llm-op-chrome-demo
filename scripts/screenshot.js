#!/usr/bin/env node

const {
  usageCommon,
  parseArgs,
  sendCode,
  printJson,
  fail
} = require('./_bridge_client');

function usage() {
  return [
    'Usage:',
    '  node scripts/screenshot.js [--max-text 4000] [--max-elements 80] [common options]',
    '',
    usageCommon()
  ].join('\n');
}

async function main() {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const { common, local } = parseArgs(process.argv.slice(2), {
    '--max-text': (argv, i, out) => {
      const raw = argv[i + 1];
      const val = Number(raw);
      if (!Number.isFinite(val) || val < 200) throw new Error(`Invalid --max-text: ${raw}`);
      out.maxText = Math.floor(val);
      return i + 1;
    },
    '--max-elements': (argv, i, out) => {
      const raw = argv[i + 1];
      const val = Number(raw);
      if (!Number.isFinite(val) || val < 1) throw new Error(`Invalid --max-elements: ${raw}`);
      out.maxElements = Math.floor(val);
      return i + 1;
    }
  });

  const maxText = local.maxText || 4000;
  const maxElements = local.maxElements || 80;

  const code = `
(() => {
  const maxText = ${maxText};
  const maxElements = ${maxElements};
  const cleanText = (s) => String(s || '').replace(/\\s+/g, ' ').trim();

  function cssPath(el) {
    if (!(el instanceof Element)) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 5) {
      const tag = cur.tagName.toLowerCase();
      const cls = cleanText(cur.className).split(' ').filter(Boolean).slice(0, 2).join('.');
      const part = cls ? tag + '.' + cls : tag;
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  const all = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role],[aria-label],[onclick],[contenteditable="true"]'))
    .slice(0, maxElements)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      selector: cssPath(el),
      id: el.id || null,
      type: el.getAttribute('type') || null,
      role: el.getAttribute('role') || null,
      name: el.getAttribute('name') || null,
      placeholder: el.getAttribute('placeholder') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      text: cleanText(el.innerText || el.textContent || '').slice(0, 200),
      value: 'value' in el ? String(el.value || '').slice(0, 200) : null,
      checked: 'checked' in el ? Boolean(el.checked) : null,
      disabled: 'disabled' in el ? Boolean(el.disabled) : null
    }));

  return {
    page: {
      url: location.href,
      title: document.title
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    },
    text: cleanText(document.body ? document.body.innerText : '').slice(0, maxText),
    elements: all
  };
})();
`.trim();

  const result = await sendCode({
    code,
    ...common
  });
  printJson(result);
}

main().catch((err) => fail(`screenshot.js failed: ${err.message}`));
