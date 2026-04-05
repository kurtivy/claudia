#!/usr/bin/env node
// engagement-log.mjs — Append tweet metrics to a JSONL log for trend tracking
// Usage: node engagement-log.mjs <snapshot-file>
//
// Reads a Chrome DevTools snapshot, extracts metrics via engagement-tracker,
// and appends a timestamped entry to engagement-log.jsonl.
// Run after each profile snapshot to build a time series.

import { readFileSync, appendFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = join(__dirname, '..', '..', 'schedule', 'initiatives', 'grow-twitter', 'engagement-log.jsonl');

// Inline the parser from engagement-tracker.mjs to avoid import issues
function parseSnapshot(text) {
  const tweets = [];
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const articleMatch = line.match(/article\s+"((?:Pinned\s+)?Claudia\s+@claudiaonchain\s+.+)"/);
    if (!articleMatch) { i++; continue; }

    const articleName = articleMatch[1];
    const isPinned = articleName.startsWith('Pinned ');
    const articleIndent = line.search(/\S/);

    let replies = 0, reposts = 0, likes = 0, views = 0;
    let tweetUrl = '';

    let j = i + 1;
    while (j < lines.length) {
      const childLine = lines[j];
      const trimmed = childLine.trimStart();
      if (!trimmed || !trimmed.startsWith('uid=')) { j++; continue; }
      const childIndent = childLine.search(/\S/);
      if (childIndent <= articleIndent) break;

      const repliesBtn = childLine.match(/button\s+"(\d+)\s+Repl(?:y|ies)\.\s+Reply"/);
      if (repliesBtn) replies = parseInt(repliesBtn[1]);

      const repostsBtn = childLine.match(/button\s+"(\d+)\s+reposts?\.\s+Repost"/);
      if (repostsBtn) reposts = parseInt(repostsBtn[1]);

      const likesBtn = childLine.match(/button\s+"(\d+)\s+Likes?\.\s+Like[d]?"/);
      if (likesBtn) likes = parseInt(likesBtn[1]);

      const viewsLink = childLine.match(/link\s+"(\d+)\s+views?\.\s+View post analytics"/);
      if (viewsLink) views = parseInt(viewsLink[1]);

      const urlMatch = childLine.match(/link\s+"(?:Mar \d+|\d+ (?:minutes?|hours?) ago|Now)".*?url="(https:\/\/x\.com\/claudiaonchain\/status\/\d+)"/);
      if (urlMatch) tweetUrl = urlMatch[1];

      j++;
    }

    // Extract short text from article name
    let text = articleName
      .replace(/^(?:Pinned\s+)?Claudia\s+@claudiaonchain\s+/, '')
      .replace(/^(?:Mar \d+|(?:\d+ )?(?:minutes?|hours?) ago|Now)\s+/, '')
      .replace(/\s+(?:\d+\s+repl(?:y|ies),?\s*)*(?:\d+\s+reposts?,?\s*)*(?:\d+\s+likes?,?\s*)*(?:\d+\s+bookmarks?,?\s*)*(?:\d+\s+views?\s*)*$/i, '')
      .replace(/\s*Embedded video.*$/, '')
      .trim();

    if (text.length > 100) text = text.substring(0, 97) + '...';

    tweets.push({ url: tweetUrl, text, views, likes, replies, reposts, pinned: isPinned });
    i = j;
  }

  return tweets;
}

// Main
const snapshotPath = process.argv[2];
if (!snapshotPath) {
  console.error('Usage: node engagement-log.mjs <snapshot-file>');
  process.exit(2);
}

const snapshot = readFileSync(snapshotPath, 'utf8');
const tweets = parseSnapshot(snapshot);

if (tweets.length === 0) {
  console.error('No tweets found in snapshot.');
  process.exit(1);
}

const totalViews = tweets.reduce((s, t) => s + t.views, 0);
const totalLikes = tweets.reduce((s, t) => s + t.likes, 0);
const totalReplies = tweets.reduce((s, t) => s + t.replies, 0);

// Detect if tweet is a reply (heuristic: no URL = couldn't parse standalone, or text context)
function detectReply(tweet) {
  // Standalone tweets show on profile; replies show on with_replies tab
  // For now, mark all as reply unless pinned (most of our content is replies)
  return !tweet.pinned;
}

const entry = {
  timestamp: new Date().toISOString(),
  tweet_count: tweets.length,
  total_views: totalViews,
  total_likes: totalLikes,
  total_replies: totalReplies,
  avg_views: +(totalViews / tweets.length).toFixed(1),
  top_tweet: tweets.sort((a, b) => b.views - a.views)[0]?.url || '',
  top_views: tweets[0]?.views || 0,
  tweets_under_3_views: tweets.filter(t => !t.pinned && t.views <= 3).length,
  tweets: tweets.map(t => ({
    text: t.text,
    views: t.views,
    likes: t.likes,
    replies: t.replies,
    retweets: t.reposts,
    url: t.url,
    isReply: detectReply(t),
  })),
};

const line = JSON.stringify(entry) + '\n';
appendFileSync(LOG_PATH, line);

console.log(`Logged: ${entry.tweet_count} tweets, ${totalViews} views, avg ${entry.avg_views}/tweet`);
console.log(`Top: ${entry.top_views} views | ${entry.tweets_under_3_views} tweets under 3 views`);
console.log(`Appended to ${LOG_PATH}`);
