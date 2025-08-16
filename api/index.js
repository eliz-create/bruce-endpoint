// api/index.js — Bruce Endpoint (auth Prokerala + écho JSON)
// Node 18+ (fetch natif)

export default async function handler(req, res) {
  // 1) Méthode
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'POST only' }));
    return;
  }

  // 2) Lire le JSON
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
    return;
  }

  const { data = {} } = body;

  // 3) (demo) mini calcul: chemin de vie si date fournie
  let numerology = null;
  if (data.birth && data.birth.year && data.birth.month && data.birth.day) {
    numerology = { life_path: computeLifePath(data.birth) };
  }

  // 4) Prokerala: vérif auth (client credentials)
  let prokerala = { auth_ok: false };
  try {
    const id = process.env.PROKERALA_CLIENT_ID;
    const secret = process.env.PROKERALA_CLIENT_SECRET;

    if (!id || !secret) {
      prokerala = { auth_ok: false, error: 'Missing Prokerala env vars' };
    } else {
      const tokenResp = await fetch('https://api.prokerala.com/token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (!tokenResp.ok) {
        const txt = await tokenResp.text();
        prokerala = { auth_ok: false, status: tokenResp.status, detail: safeTrim(txt) };
      } else {
        const tok = await tokenResp.json();
        // Ne JAMAIS renvoyer l’access_token brut au client.
        prokerala = {
          auth_ok: true,
          token_type: tok.token_type || 'bearer',
          expires_in: tok.expires_in || null
        };
      }
    }
  } catch (e) {
    prokerala = { auth_ok: false, error: e?.message || String(e) };
  }

  // 5) Réponse
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    ok: true,
    received: data,
    numerology,
    prokerala
  }));
}

// ----- helpers -----
function computeLifePath(b) {
  // addition YYYY + MM + DD avec conservation de 11/22/33
  const keep = new Set([11, 22, 33]);
  const sumDigits = n => String(n).split('').reduce((a, d) => a + Number(d || 0), 0);
  let y = reduceKeepMaster(b.year, keep, sumDigits);
  let m = reduceKeepMaster(b.month, keep, sumDigits);
  let d = reduceKeepMaster(b.day, keep, sumDigits);
  return reduceKeepMaster(y + m + d, keep, sumDigits);
}
function reduceKeepMaster(n, keep, sumDigits) {
  while (n > 9 && !keep.has(n)) n = sumDigits(n);
  return n;
}
function safeTrim(t) {
  return (t || '').substring(0, 500);
}
