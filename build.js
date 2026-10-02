// Vercel build step (see vercel.json). Publishes ONLY the files the page
// needs into public/ — README, vercel.json, this script and anything else in
// the repository are never served — and writes config.js from the project's
// environment variables, refusing anything that isn't a publishable key.
'use strict';
const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error('Build stopped: ' + msg);
  process.exit(1);
}

const url = (process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
if (!url || !key) fail('set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the Vercel project settings.');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) fail('SUPABASE_URL must look like https://<project>.supabase.co');

// Only a publishable (or legacy anon) key may ever reach the browser.
if (key.startsWith('sb_secret_')) fail('that is a SECRET key. Use the publishable key.');
if (key.startsWith('eyJ')) {
  let role = null;
  try {
    role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
  } catch (_) {
    fail('SUPABASE_PUBLISHABLE_KEY is not a valid key.');
  }
  if (role !== 'anon') fail('that key has role "' + role + '". Use the publishable (anon) key.');
} else if (!key.startsWith('sb_publishable_')) {
  fail('SUPABASE_PUBLISHABLE_KEY must start with sb_publishable_');
}

const out = path.join(__dirname, 'public');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of ['index.html', 'app.js']) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
fs.writeFileSync(
  path.join(out, 'config.js'),
  'window.FOGO_ADMIN_CONFIG=' + JSON.stringify({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key }) + ';\n',
);
console.log('Published index.html, app.js and config.js to public/');
