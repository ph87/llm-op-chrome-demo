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
    '  node scripts/click.js --selector "<css selector>" [common options]',
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
    }
  });

  if (!local.selector) fail(`${usage()}\n\nError: --selector is required`);

  const code = `
(() => {
  const selector = ${JSON.stringify(local.selector)};
  const el = document.querySelector(selector);
  if (!el) throw new Error('Element not found for selector: ' + selector);

  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const rect = el.getBoundingClientRect();

  const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  for (const type of events) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }

  if (typeof el.click === 'function') el.click();

  return {
    selector,
    tag: el.tagName,
    id: el.id || null,
    className: el.className || null,
    text: (el.textContent || '').trim().slice(0, 200),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  };
})();
`.trim();

  const result = await sendCode({
    code,
    ...common
  });
  printJson(result);
}

main().catch((err) => fail(`click.js failed: ${err.message}`));
