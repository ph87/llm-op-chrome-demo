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
    '  node scripts/open_url.js --url <https://example.com> [common options]',
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
    '--url': (argv, i, out) => {
      const val = argv[i + 1];
      if (!val) throw new Error('Missing value for --url');
      out.url = val;
      return i + 1;
    }
  });

  if (!local.url) fail(`${usage()}\n\nError: --url is required`);

  const code = `window.open(${JSON.stringify(local.url)}, '_blank');`;
  const result = await sendCode({
    code,
    ...common
  });
  printJson(result);
}

main().catch((err) => fail(`open_url.js failed: ${err.message}`));
