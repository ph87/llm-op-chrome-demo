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
    '  node scripts/input.js --selector "<css selector>" --text "<value>" [common options]',
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
    '--selector': (argv, i, out) => {
      const val = argv[i + 1];
      if (!val) throw new Error('Missing value for --selector');
      out.selector = val;
      return i + 1;
    },
    '--text': (argv, i, out) => {
      const val = argv[i + 1];
      if (val === undefined) throw new Error('Missing value for --text');
      out.text = val;
      return i + 1;
    }
  });

  if (!local.selector) fail(`${usage()}\n\nError: --selector is required`);
  if (local.text === undefined) fail(`${usage()}\n\nError: --text is required`);

  const code = `
(() => {
  const selector = ${JSON.stringify(local.selector)};
  const value = ${JSON.stringify(local.text)};
  const el = document.querySelector(selector);
  if (!el) throw new Error('Element not found for selector: ' + selector);

  const tag = (el.tagName || '').toLowerCase();
  const editable = el.isContentEditable === true;
  const isInputLike = tag === 'input' || tag === 'textarea' || tag === 'select';
  if (!editable && !isInputLike) {
    throw new Error('Target is not an input/textarea/select/contenteditable element');
  }

  el.focus();

  if (editable) {
    el.textContent = value;
  } else {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return {
    selector,
    tag: el.tagName,
    value: editable ? el.textContent : el.value
  };
})();
`.trim();

  const result = await sendCode({
    code,
    ...common
  });
  printJson(result);
}

main().catch((err) => fail(`input.js failed: ${err.message}`));
