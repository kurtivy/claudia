#!/usr/bin/env node
// draft-planner.mjs — Generate a posting plan from all draft files
// Usage: node draft-planner.mjs [--mix 80/20] [--count 15] [--json]
//
// Reads all drafts-*.md files from grow-twitter/
// Categorizes: targeted (has URL), contextual (has topic guidance), promo
// Generates an ordered posting plan with timing and search instructions
//
// Output: a step-by-step posting plan for a reply session

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAIN = process.env.HOME?.replace(/\\/g, '/') || 'C:/Users/kurtw';
const DRAFTS_DIR = join(BRAIN, '.claudia/schedule/initiatives/grow-twitter');

function parseDraftFiles() {
  const files = readdirSync(DRAFTS_DIR)
    .filter(f => f.startsWith('drafts-') && f.endsWith('.md'))
    .sort();

  const drafts = [];

  for (const file of files) {
    const content = readFileSync(join(DRAFTS_DIR, file), 'utf8');
    const lines = content.split('\n');
    let currentUrl = null;
    let currentContext = null;
    let currentSection = null;
    let isPromo = file.includes('promo') || false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track section headers
      if (line.startsWith('## ') || line.startsWith('### ')) {
        currentSection = line.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim();
        // Detect promo sections
        if (/promo|signal|contact manager|@signalgamefun|@tgautomationbot/i.test(currentSection)) {
          isPromo = true;
        }
        // Detect "For threads about X" pattern
        const forMatch = currentSection.match(/^For threads about (.+)/i);
        if (forMatch) {
          currentContext = forMatch[1];
        }
        continue;
      }

      // Match URLs
      const urlMatch = line.match(/https:\/\/x\.com\/\S+/);
      if (urlMatch) {
        currentUrl = urlMatch[0];
        continue;
      }

      // Match blockquote
      if (line.startsWith('>')) {
        let text = line.slice(2).trim();
        let j = i + 1;
        while (j < lines.length && lines[j].startsWith('>')) {
          text += ' ' + lines[j].slice(2).trim();
          j++;
        }
        text = text.replace(/\s*\[\d+ chars\]\s*$/, '').trim();

        if (text.length > 0) {
          const hasUrl = !!currentUrl;
          const chars = [...text].length;
          const category = isPromo ? 'promo'
            : hasUrl ? 'targeted'
            : currentContext ? 'contextual'
            : 'generic';

          drafts.push({
            text,
            chars,
            valid: chars <= 280,
            url: currentUrl || null,
            context: currentContext || null,
            section: currentSection || 'untitled',
            category,
            file,
            searchHint: !hasUrl ? buildSearchHint(text, currentContext, currentSection) : null
          });

          currentUrl = null;
        }
        i = j - 1;
        continue;
      }
    }
    // Reset promo flag per file
    isPromo = file.includes('promo');
  }

  return drafts;
}

function buildSearchHint(text, context, section) {
  // Extract key terms for Twitter search
  const keywords = [];
  if (context) keywords.push(...context.split(/[,/&]/).map(s => s.trim()));

  // Extract @mentions from draft text
  const mentions = text.match(/@\w+/g) || [];
  if (mentions.length) keywords.push(...mentions);

  // Extract quoted terms
  const quoted = text.match(/"[^"]+"/g) || [];
  if (quoted.length) keywords.push(...quoted);

  return keywords.length > 0
    ? `Search Twitter for: ${keywords.slice(0, 3).join(' OR ')}`
    : `Browse trending/latest for: ${section}`;
}

function generatePlan(drafts, engagePct = 80, totalCount = 15) {
  const valid = drafts.filter(d => d.valid);
  const targeted = valid.filter(d => d.category === 'targeted');
  const contextual = valid.filter(d => d.category === 'contextual' || d.category === 'generic');
  const promo = valid.filter(d => d.category === 'promo');

  const promoCount = Math.max(1, Math.round(totalCount * (100 - engagePct) / 100));
  const engageCount = totalCount - promoCount;

  // Pick targeted first (they're ready to post), then contextual
  const engagePicks = [];
  const shuffled = [...targeted].sort(() => Math.random() - 0.5);
  engagePicks.push(...shuffled.slice(0, engageCount));
  if (engagePicks.length < engageCount) {
    const remaining = engageCount - engagePicks.length;
    const ctxShuffled = [...contextual].sort(() => Math.random() - 0.5);
    engagePicks.push(...ctxShuffled.slice(0, remaining));
  }

  const promoPicks = [...promo].sort(() => Math.random() - 0.5).slice(0, promoCount);

  // Interleave: every 4-5 engagement replies, insert a promo
  const plan = [];
  let promoIdx = 0;
  for (let i = 0; i < engagePicks.length; i++) {
    plan.push({ ...engagePicks[i], step: plan.length + 1, type: 'engage' });
    if ((i + 1) % 4 === 0 && promoIdx < promoPicks.length) {
      plan.push({ ...promoPicks[promoIdx], step: plan.length + 1, type: 'promo' });
      promoIdx++;
    }
  }
  // Append remaining promos
  while (promoIdx < promoPicks.length) {
    plan.push({ ...promoPicks[promoIdx], step: plan.length + 1, type: 'promo' });
    promoIdx++;
  }

  return { plan, stats: { total: plan.length, targeted: targeted.length, contextual: contextual.length, promo: promo.length, invalid: drafts.length - valid.length } };
}

function printPlan(result) {
  const { plan, stats } = result;

  console.log(`\n=== Reply Session Plan ===`);
  console.log(`Available: ${stats.targeted} targeted (w/ URL) | ${stats.contextual} contextual (need search) | ${stats.promo} promo`);
  if (stats.invalid > 0) console.log(`Skipped: ${stats.invalid} over 280 chars`);
  console.log(`Plan: ${plan.length} replies (${plan.filter(p => p.type === 'engage').length} engage + ${plan.filter(p => p.type === 'promo').length} promo)\n`);

  for (const step of plan) {
    const tag = step.type === 'promo' ? '[PROMO]' : '[ENGAGE]';
    const ready = step.url ? 'READY' : 'NEED SEARCH';
    console.log(`  ${step.step}. ${tag} [${step.chars}c] [${ready}]`);
    console.log(`     ${step.text.substring(0, 90)}${step.text.length > 90 ? '...' : ''}`);
    if (step.url) {
      console.log(`     URL: ${step.url}`);
    } else if (step.searchHint) {
      console.log(`     ${step.searchHint}`);
    }
    console.log(`     Source: ${step.file} / ${step.section}`);
    console.log();
  }

  // Timing recommendation
  console.log(`--- Timing ---`);
  console.log(`Post 1 reply every 2-3 minutes.`);
  console.log(`Total session: ~${plan.length * 2.5} minutes.`);
  console.log(`Best window: 9-11 AM local (peak engagement).`);
  console.log(`Post READY items first, then search for contextual targets.`);
}

// Parse args
const args = process.argv.slice(2);
const mixArg = args.find((_, i) => args[i - 1] === '--mix');
const countArg = args.find((_, i) => args[i - 1] === '--count');
const jsonMode = args.includes('--json');
const engagePct = mixArg ? parseInt(mixArg.split('/')[0]) : 80;
const totalCount = countArg ? parseInt(countArg) : 15;

const drafts = parseDraftFiles();

if (drafts.length === 0) {
  console.log('No drafts found in', DRAFTS_DIR);
  process.exit(0);
}

const result = generatePlan(drafts, engagePct, totalCount);

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printPlan(result);
}
