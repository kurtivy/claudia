#!/usr/bin/env node
// tweet-post.mjs — Validate and format tweet text for posting
// Usage: node tweet-post.mjs "tweet text here"
// Or:    echo "tweet text" | node tweet-post.mjs --stdin
// Flags: --reply  = this is a reply (skips standalone warning)
//        --force  = bypass reply-only strategy check
//
// Checks character count (280 limit for free tier).
// Warns if posting standalone (reply-only strategy active).
// If over limit, suggests cuts. Does NOT post — just validates.
// Exit codes: 0 = ready to post, 1 = over limit, 2 = usage error, 3 = standalone blocked

const LIMIT = 280;

function countChars(text) {
  // Twitter counts URLs as 23 chars regardless of length
  // For simplicity, count actual chars (good enough for non-URL tweets)
  return [...text].length;
}

function suggestCuts(text, overBy) {
  const suggestions = [];

  // Check for em dashes that could become periods
  const emDashCount = (text.match(/—/g) || []).length;
  if (emDashCount > 0) {
    suggestions.push(`Replace ${emDashCount} em dash(es) with periods or colons (saves ~2 chars each)`);
  }

  // Check for "that" which is often removable
  const thatCount = (text.match(/\bthat\b/gi) || []).length;
  if (thatCount > 0) {
    suggestions.push(`Remove ${thatCount} instance(s) of "that" where grammatically optional`);
  }

  // Check for double spaces
  if (text.includes('  ')) {
    suggestions.push('Remove double spaces');
  }

  // Check for wordy phrases
  const wordy = [
    ['in order to', 'to'],
    ['the fact that', 'that'],
    ['at this point in time', 'now'],
    ['due to the fact that', 'because'],
    ['a large number of', 'many'],
    ['in the event that', 'if'],
    ['is able to', 'can'],
    ['in spite of', 'despite'],
  ];
  for (const [long, short] of wordy) {
    if (text.toLowerCase().includes(long)) {
      suggestions.push(`"${long}" → "${short}" (saves ${long.length - short.length} chars)`);
    }
  }

  return suggestions;
}

async function main() {
  let text;

  const flags = ['--stdin', '--reply', '--force', '--json'];
  const args = process.argv.slice(2).filter(a => !flags.includes(a));

  if (process.argv.includes('--stdin')) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    text = Buffer.concat(chunks).toString('utf8').trim();
  } else if (args.length > 0) {
    text = args.join(' ');
  } else {
    console.error('Usage: node tweet-post.mjs "tweet text"');
    console.error('   or: echo "text" | node tweet-post.mjs --stdin');
    process.exit(2);
  }

  const isReply = process.argv.includes('--reply');
  const force = process.argv.includes('--force');

  // Reply-only strategy enforcement
  if (!isReply && !force) {
    console.error('⚠ STANDALONE TWEET BLOCKED — reply-only strategy active');
    console.error('  Data: standalone tweets avg 5.4 views. Replies to 5K+ threads get real exposure.');
    console.error('  Use --reply if this IS a reply, or --force to override.');
    process.exit(3);
  }

  const charCount = countChars(text);
  const remaining = LIMIT - charCount;

  console.log(`Characters: ${charCount}/${LIMIT}`);

  if (remaining >= 0) {
    console.log(`OK: ${remaining} characters remaining`);
    console.log(`\n--- TWEET ---`);
    console.log(text);
    console.log(`--- END ---`);
    process.exit(0);
  } else {
    const overBy = Math.abs(remaining);
    console.error(`OVER LIMIT by ${overBy} characters`);

    const suggestions = suggestCuts(text, overBy);
    if (suggestions.length > 0) {
      console.error('\nSuggested cuts:');
      for (const s of suggestions) {
        console.error(`  - ${s}`);
      }
    }

    console.error(`\n--- TWEET (TOO LONG) ---`);
    console.error(text);
    console.error(`--- END ---`);
    process.exit(1);
  }
}

main();
