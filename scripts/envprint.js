const fs = require('fs');

function loadEnv(path = '.env') {
  const txt = fs.readFileSync(path, 'utf8');
  for (const line of txt.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('=');
    if (eq === -1) continue;
    const key = l.slice(0, eq).trim();
    let val = l.slice(eq + 1).trim();
    // strip optional surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv('.env');

const keys = [
  'STRIPE_SECRET_KEY',
  'PAY_LINK_TTL_SECONDS',
  'SMTP_ENCRYPTION_KEY_BASE64',
  'REMINDER_FROM_EMAIL'
];

for (const k of keys) {
  const v = process.env[k];
  const shown =
    v == null ? 'undefined' :
    k.includes('KEY') ? (v ? `${v.slice(0,6)}…${v.slice(-4)} (len ${v.length})` : 'empty') :
    v;
  console.log(k, '=>', shown);
}

const b = Buffer.from(process.env.SMTP_ENCRYPTION_KEY_BASE64 || '', 'base64');
console.log('SMTP_ENCRYPTION_KEY bytes =>', b.length);
