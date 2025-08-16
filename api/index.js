// /api/index.js — Vercel Serverless Function (Node.js)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'POST only' }));
    return;
  }

  // Lire le JSON
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = {};
  try { body = JSON.parse(raw); }
  catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
    return;
  }

  const data = body.data || body;

  // Démo numérologie (chemin de vie) si date "YYYY-MM-DD"
  let numerology = null;
  const b = data?.people?.a?.birth || data?.birth;
  if (b?.date) {
    const [Y, M, D] = b.date.split('-').map(Number);
    numerology = { life_path: lifePath(Y, M, D) };
  }

  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, data: { received: data, numerology } }));
}

function lifePath(Y, M, D) {
  const keep = new Set([11, 22, 33]);
  const sum = (n) => String(n).split('').reduce((a, b) => a + Number(b), 0);
  let n = sum(Y) + sum(M) + sum(D);
  while (n > 9 && !keep.has(n)) n = sum(n);
  return n;
}
