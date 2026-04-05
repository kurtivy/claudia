// Brain Viewer server — serves HTML + consolidates JSONL session files into cycles
// Usage: node serve.js [port]  (default: 18792)
//
// Consolidation logic: JSONL files with gaps < 30 min are merged into a single "cycle".
// Each cycle gets a display name like "Saturday 3/29, 2h 15m" and merged event data.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2]) || 18792;
const EVENTS_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.claudia', 'schedule', 'cycles', 'events');
const HTML_FILE = path.join(__dirname, 'index.html');

const GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — sessions closer than this merge into one cycle
const MAX_CYCLE_MS = 5 * 60 * 60 * 1000; // 5 hours — force-split cycles longer than this

// Day names for display
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getFileMeta(filepath) {
  try {
    const lines = fs.readFileSync(filepath, 'utf-8').trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    const events = [];
    for (const line of lines) {
      try { events.push(JSON.parse(line)); } catch(e) { /* skip bad lines */ }
    }
    if (events.length === 0) return null;
    events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    return {
      file: path.basename(filepath),
      firstTs: new Date(events[0].ts).getTime(),
      lastTs: new Date(events[events.length - 1].ts).getTime(),
      eventCount: events.length
    };
  } catch(e) {
    return null;
  }
}

function buildCycles() {
  let files;
  try {
    files = fs.readdirSync(EVENTS_DIR).filter(f => f.endsWith('.jsonl')).sort();
  } catch(e) {
    return [];
  }

  // Get metadata for each file
  const metas = [];
  for (const f of files) {
    const meta = getFileMeta(path.join(EVENTS_DIR, f));
    if (meta) metas.push(meta);
  }
  metas.sort((a, b) => a.firstTs - b.firstTs);

  // Merge into cycles based on gap threshold
  const cycles = [];
  let current = null;

  for (const m of metas) {
    if (!current) {
      current = { files: [m.file], firstTs: m.firstTs, lastTs: m.lastTs, eventCount: m.eventCount };
    } else if (m.firstTs - current.lastTs < GAP_THRESHOLD_MS && m.lastTs - current.firstTs < MAX_CYCLE_MS) {
      // Close enough and won't exceed max duration — merge into current cycle
      current.files.push(m.file);
      current.lastTs = Math.max(current.lastTs, m.lastTs);
      current.eventCount += m.eventCount;
    } else {
      // Gap too large — finalize current, start new
      cycles.push(current);
      current = { files: [m.file], firstTs: m.firstTs, lastTs: m.lastTs, eventCount: m.eventCount };
    }
  }
  if (current) cycles.push(current);

  // Build display info for each cycle
  return cycles.map(c => {
    const start = new Date(c.firstTs);
    const durationMs = c.lastTs - c.firstTs;
    const durationMin = Math.round(durationMs / 60000);
    const hours = Math.floor(durationMin / 60);
    const mins = durationMin % 60;

    let durationStr;
    if (hours > 0 && mins > 0) durationStr = `${hours} hour${hours > 1 ? 's' : ''} ${mins} minute${mins > 1 ? 's' : ''}`;
    else if (hours > 0) durationStr = `${hours} hour${hours > 1 ? 's' : ''}`;
    else durationStr = `${mins} minute${mins > 1 ? 's' : ''}`;

    const dayName = DAYS[start.getDay()];
    const month = start.getMonth() + 1;
    const day = start.getDate();
    const displayName = `${dayName} ${month}/${day}, ${durationStr}`;

    // Compact duration for sidebar
    let shortDuration;
    if (hours > 0 && mins > 0) shortDuration = `${hours}h ${mins}m`;
    else if (hours > 0) shortDuration = `${hours}h`;
    else shortDuration = `${mins}m`;

    const h12 = start.getHours() % 12 || 12;
    const startMM = String(start.getMinutes()).padStart(2, '0');
    const ampm = start.getHours() >= 12 ? 'pm' : 'am';
    const startTime = `${h12}:${startMM}${ampm}`;

    return {
      id: c.files[0].replace('.jsonl', ''), // use first file as ID
      displayName,
      shortDuration,
      startTime,
      dayName,
      date: `${month}/${day}`,
      files: c.files,
      eventCount: c.eventCount,
      firstTs: c.firstTs,
      lastTs: c.lastTs,
      durationMin
    };
  }).reverse(); // most recent first
}

function mergeSessionFiles(files) {
  const lines = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(EVENTS_DIR, f), 'utf-8');
      const fileLines = content.trim().split('\n').filter(Boolean);
      lines.push(...fileLines);
    } catch(e) { /* skip missing files */ }
  }
  return lines.join('\n');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(HTML_FILE));
    return;
  }

  // Consolidated cycles list
  if (req.url === '/api/cycles') {
    const cycles = buildCycles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cycles));
    return;
  }

  // Load a cycle by ID (first file's basename)
  const cycleMatch = req.url.match(/^\/api\/cycle\/(.+)$/);
  if (cycleMatch) {
    const cycleId = decodeURIComponent(cycleMatch[1]);
    const cycles = buildCycles();
    const cycle = cycles.find(c => c.id === cycleId);
    if (!cycle) {
      res.writeHead(404);
      res.end('cycle not found');
      return;
    }
    const merged = mergeSessionFiles(cycle.files);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(merged);
    return;
  }

  // Legacy: load single JSONL file
  const fileMatch = req.url.match(/^\/api\/session\/(.+\.jsonl)$/);
  if (fileMatch) {
    const file = path.join(EVENTS_DIR, path.basename(fileMatch[1]));
    try {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(fs.readFileSync(file, 'utf-8'));
    } catch(e) {
      res.writeHead(404);
      res.end('not found');
    }
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`Brain viewer: http://localhost:${PORT}`);
});
