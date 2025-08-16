// api/bruce.js — Vercel Serverless Function (Node.js)

export default async function handler(req, res) {
  // 1) Méthode
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'POST only' }));
    return;
  }

  // 2) Lire le corps JSON
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
    return;
  }

  // 3) Données attendues: { data: {...} }
  const { data = {} } = body || {};
  if (!data || typeof data !== 'object') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Missing { data }' }));
    return;
  }

  // 4) Démo: mini calcul numérologie (Chemin de vie) si date de naissance présente
  if (data.birth && data.birth.year && data.birth.month && data.birth.day) {
    const n = computeLifePath(data.birth.year, data.birth.month, data.birth.day);
    data.numerology = { ...(data.numerology || {}), life_path: n };
  }

  // 5) Répondre en écho "data" (c'est ce que le GPT utilisera comme Source)
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, data }));
}

// --- Helpers numérologie (garde 11/22/33) ---
function reduceKeepMaster(n) {
  const keep = new Set([11, 22, 33]);
  while (n > 9 && !keep.has(n)) {
    n = String(n).split('').reduce((a, b) => a + Number(b), 0);
  }
  return n;
}
function computeLifePath(year, month, day) {
  const toNum = (x) => reduceKeepMaster(Number(String(x).replace(/\D/g, '')));
  const y = toNum(year), m = toNum(month), d = toNum(day);
  return reduceKeepMaster(y + m + d);
}
