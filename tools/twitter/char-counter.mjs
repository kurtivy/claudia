#!/usr/bin/env node
// Twitter character counter — matches Twitter's counting rules.
// URLs = 23 chars, Unicode code points (not bytes), newlines = 1 char.

const LIMIT = 280;
const URL_WEIGHT = 23;

// Matches http/https URLs (good enough for Twitter's purposes)
const URL_RE = /https?:\/\/[^\s)}\]>]+/g;

function countChars(text) {
  // Replace all URLs with placeholders of length URL_WEIGHT
  const stripped = text.replace(URL_RE, '\x00'.repeat(URL_WEIGHT));
  // Count Unicode code points, not UTF-16 surrogates
  return [...stripped].length;
}

function run(text, checkOnly) {
  const count = countChars(text);
  const remaining = LIMIT - count;

  if (checkOnly) {
    process.exit(remaining >= 0 ? 0 : 1);
  }

  if (remaining >= 0) {
    console.log(`chars: ${count} / ${LIMIT} (${remaining} remaining)`);
  } else {
    console.log(`chars: ${count} / ${LIMIT} (${-remaining} OVER — trim needed)`);
  }
}

// --- CLI ---
const args = process.argv.slice(2);
const checkFlag = args.includes('--check');
const positional = args.filter(a => a !== '--check');

if (positional.length > 0) {
  run(positional.join(' '), checkFlag);
} else {
  // Read from stdin
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => {
    // Trim trailing newline that shells add
    run(data.replace(/\n$/, ''), checkFlag);
  });
}
