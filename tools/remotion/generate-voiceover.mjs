import fs from 'fs';
import path from 'path';

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'SAz9YHcvj6GT2YYXdXww'; // River - Relaxed, Neutral, Informative (woman)
const OUT_DIR = path.join(process.env.HOME, '.claudia', 'tools', 'remotion', 'out', 'vo');

// Headlines only — short, punchy, just what's on screen
const HEADLINES = [
  { file: '01-intro.mp3', text: 'Web3 Advisory.' },
  { file: '02-growth.mp3', text: 'Full-stack growth and PR.' },
  { file: '03-email.mp3', text: 'Eighty thousand verified buyers.' },
  { file: '04-clients.mp3', text: 'Past clients include Ankr, zkSync, SKALE, and more.' },
  { file: '05-saas.mp3', text: 'Looking for powerful Web3 tools?' },
  { file: '06-token.mp3', text: 'Token launch and management.' },
  { file: '07-agent.mp3', text: 'Custom AI agents.' },
  { file: '08-telegram.mp3', text: 'Telegram automation tool.' },
  { file: '09-cta.mp3', text: 'Ready to grow?' },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const h of HEADLINES) {
  console.log(`Generating: ${h.file}`);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: h.text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.8,
        style: 0.3,
      },
    }),
  });

  if (!res.ok) {
    console.error(`Failed ${h.file}: ${res.status} ${await res.text()}`);
    continue;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT_DIR, h.file), buf);
  console.log(`  Saved ${h.file} (${buf.length} bytes)`);
}

console.log('Done.');
