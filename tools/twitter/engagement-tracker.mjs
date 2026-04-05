#!/usr/bin/env node
// engagement-tracker.mjs — Parse tweet metrics from a11y tree snapshots
// Usage: node engagement-tracker.mjs <snapshot-file> [--json]
// Or:    node engagement-tracker.mjs --stdin [--json] < snapshot.txt
//
// Reads a Chrome DevTools a11y snapshot of @claudiaonchain's profile
// and extracts per-tweet metrics: views, likes, replies, reposts, timestamp, URL.
// Outputs a table sorted by views (desc) and optionally JSON.

import { readFileSync } from 'fs';

function parseSnapshot(text) {
  const tweets = [];
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Find article lines that are our tweets
    const articleMatch = line.match(/article\s+"((?:Pinned\s+)?Claudia\s+@claudiaonchain\s+.+)"/);
    if (!articleMatch) { i++; continue; }

    const articleName = articleMatch[1];
    const isPinned = articleName.startsWith('Pinned ');

    // Determine indentation of this article to know scope
    const articleIndent = line.search(/\S/);

    // Scan child lines for metrics and URL
    let replies = 0, reposts = 0, likes = 0, views = 0;
    let tweetUrl = '';
    let timestamp = 'unknown';

    // Extract timestamp from article name
    const timeMatch = articleName.match(
      /(?:Pinned\s+)?Claudia\s+@claudiaonchain\s+(.+?)(?:\s+(?:[A-Z'$"@\d]|the |building|most |ERC|x402|15 |41%|BNB|Solana|AI |Dug|Today|armor|Perplexity|MCP |ran ))/
    );
    if (timeMatch) {
      timestamp = timeMatch[1].trim();
    }

    // Scan child elements
    let j = i + 1;
    while (j < lines.length) {
      const childLine = lines[j];

      // Skip empty lines and continuation lines (no uid= prefix after whitespace)
      const trimmed = childLine.trimStart();
      if (!trimmed || !trimmed.startsWith('uid=')) { j++; continue; }

      const childIndent = childLine.search(/\S/);

      // Stop when we reach same or lower indentation (sibling/parent)
      if (childIndent <= articleIndent) break;

      // Extract metrics from buttons
      const repliesBtn = childLine.match(/button\s+"(\d+)\s+Repl(?:y|ies)\.\s+Reply"/);
      if (repliesBtn) replies = parseInt(repliesBtn[1]);

      const repostsBtn = childLine.match(/button\s+"(\d+)\s+reposts?\.\s+Repost"/);
      if (repostsBtn) reposts = parseInt(repostsBtn[1]);

      const likesBtn = childLine.match(/button\s+"(\d+)\s+Likes?\.\s+Like[d]?"/);
      if (likesBtn) likes = parseInt(likesBtn[1]);

      // Views from link
      const viewsLink = childLine.match(/link\s+"(\d+)\s+views?\.\s+View post analytics"/);
      if (viewsLink) views = parseInt(viewsLink[1]);

      // Also handle "View post analytics" without number (0 views)
      const viewsLinkNoNum = childLine.match(/link\s+"View post analytics"/);
      if (viewsLinkNoNum && !viewsLink) views = 0;

      // Tweet URL from timestamp link
      const urlMatch = childLine.match(/link\s+"(?:Mar \d+|\d+ (?:minutes?|hours?) ago|Now)".*?url="(https:\/\/x\.com\/claudiaonchain\/status\/\d+)"/);
      if (urlMatch) tweetUrl = urlMatch[1];

      j++;
    }

    // Extract tweet text from article name
    let tweetText = articleName
      .replace(/^(?:Pinned\s+)?Claudia\s+@claudiaonchain\s+/, '');

    // Remove timestamp prefix
    tweetText = tweetText
      .replace(/^(?:Mar \d+|(?:\d+ )?(?:minutes?|hours?) ago|Now)\s+/, '');

    // Remove trailing metrics if present
    tweetText = tweetText
      .replace(/\s+(?:\d+\s+repl(?:y|ies),?\s*)*(?:\d+\s+reposts?,?\s*)*(?:\d+\s+likes?,?\s*)*(?:\d+\s+bookmarks?,?\s*)*(?:\d+\s+views?\s*)*$/i, '')
      .replace(/\s*Embedded video.*$/, '')
      .trim();

    // Truncate for display
    const displayText = tweetText.length > 80 ? tweetText.substring(0, 77) + '...' : tweetText;

    tweets.push({
      text: displayText,
      full_text: tweetText,
      timestamp,
      views,
      likes,
      replies,
      reposts,
      pinned: isPinned,
      url: tweetUrl,
      engagement_rate: views > 0 ? ((likes + replies + reposts) / views * 100).toFixed(1) : '0.0',
    });

    i = j; // Skip past this article's children
  }

  return tweets;
}

function formatTable(tweets) {
  if (tweets.length === 0) return 'No tweets found in snapshot.';

  tweets.sort((a, b) => b.views - a.views);

  const lines = [];
  lines.push('');
  lines.push(`Tweet Engagement Report — ${new Date().toISOString().split('T')[0]}`);
  lines.push('='.repeat(110));
  lines.push(
    'Views'.padStart(6) + ' ' +
    'Likes'.padStart(5) + ' ' +
    'Rplys'.padStart(5) + ' ' +
    'Rpsts'.padStart(5) + ' ' +
    'Eng%'.padStart(6) + ' ' +
    'Time'.padEnd(10) + ' ' +
    'Tweet'
  );
  lines.push('-'.repeat(110));

  for (const t of tweets) {
    const pin = t.pinned ? '[PIN] ' : '';
    lines.push(
      String(t.views).padStart(6) + ' ' +
      String(t.likes).padStart(5) + ' ' +
      String(t.replies).padStart(5) + ' ' +
      String(t.reposts).padStart(5) + ' ' +
      (t.engagement_rate + '%').padStart(6) + ' ' +
      t.timestamp.substring(0, 10).padEnd(10) + ' ' +
      pin + t.text
    );
  }

  lines.push('-'.repeat(110));

  const totalViews = tweets.reduce((s, t) => s + t.views, 0);
  const totalLikes = tweets.reduce((s, t) => s + t.likes, 0);
  const totalReplies = tweets.reduce((s, t) => s + t.replies, 0);
  const avgViews = (totalViews / tweets.length).toFixed(1);
  const avgLikes = (totalLikes / tweets.length).toFixed(1);
  const avgEngRate = totalViews > 0
    ? ((totalLikes + totalReplies) / totalViews * 100).toFixed(1)
    : '0.0';

  lines.push(`${tweets.length} tweets | ${totalViews} total views | avg ${avgViews} views/tweet | avg ${avgLikes} likes/tweet | ${avgEngRate}% engagement`);

  const top = tweets[0];
  if (top) {
    lines.push(`Best: "${top.text.substring(0, 60)}..." (${top.views} views, ${top.likes} likes)`);
  }

  const bottom = tweets.filter(t => !t.pinned && t.views <= 3);
  if (bottom.length > 0) {
    lines.push(`${bottom.length} tweets at 3 views or less — consider spacing posts further apart`);
  }

  lines.push('');
  return lines.join('\n');
}

function formatJSON(tweets) {
  tweets.sort((a, b) => b.views - a.views);
  const totalViews = tweets.reduce((s, t) => s + t.views, 0);
  const totalLikes = tweets.reduce((s, t) => s + t.likes, 0);

  return JSON.stringify({
    generated: new Date().toISOString(),
    tweet_count: tweets.length,
    total_views: totalViews,
    avg_views: +(totalViews / tweets.length).toFixed(1),
    total_likes: totalLikes,
    tweets,
  }, null, 2);
}

// Main
const args = process.argv.slice(2);
const useStdin = args.includes('--stdin');
const jsonMode = args.includes('--json');
const filePath = args.find(a => !a.startsWith('--'));

let input;
if (useStdin) {
  input = readFileSync('/dev/stdin', 'utf8');
} else if (filePath) {
  input = readFileSync(filePath, 'utf8');
} else {
  console.error('Usage: node engagement-tracker.mjs <snapshot-file> [--json]');
  console.error('       node engagement-tracker.mjs --stdin [--json] < snapshot.txt');
  process.exit(2);
}

const tweets = parseSnapshot(input);

if (jsonMode) {
  console.log(formatJSON(tweets));
} else {
  console.log(formatTable(tweets));
}
