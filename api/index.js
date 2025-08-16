// /api/index.js — Vercel Serverless (Node)

export default async function handler(req, res) {
  // 1) Requêtes non-POST → 405
  if (req.method !== 'POST') {
    res.status(405);
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'POST only' }));
    return;
  }

  // 2) Lire le JSON
  let body = {};
  try {
    body = req.body || {};
  } catch (e) {
    res.status(400);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
    return;
  }

  const { data } = body || {};
  if (!data) {
    res.status(400);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Missing { data }' }));
    return;
  }

  // 3) Health-check simple
  if (data.ping) {
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, pong: true, data }));
    return;
  }

  // 4) Démo : mini numérologie (chemin de vie) si on reçoit une date
  let numerology = null;
  if (data.birth && data.birth.year && data.birth.month && data.birth.day) {
    numerology = computeLifePath(data.birth.year, data.birth.month, data.birth.day);
  }

  // 5) Réponse écho + démo
  res.status(200);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, received: data, numerology }));
}

function computeLifePath(year, month, day) {
  const keep = new Set([11, 22, 33]);
  const sum = (n) => String(n).split('').reduce((a, b) => a + Number(b), 0);
  let n = sum(year) + sum(month) + sum(day);
  while (n > 9 && !keep.has(n)) n = sum(n);
  return { life_path: n };
}
