// api/index.js — Vercel Serverless Function (Node.js / ESM)

export default async function handler(req, res) {
  // 1) Méthode : POST uniquement
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

  const data = body.data || {};
  const meta = body.meta || {};
  const response = { ok: true, received: data };

  // 3) Mini numérologie (Chemin de vie) si date fournie
  const b = data.birth || {};
  if (b.year && b.month && b.day) {
    response.numerology = {
      life_path: computeLifePath(b.year, b.month, b.day),
    };
  } else {
    response.numerology = null;
  }

  // 4) Auth Prokerala si variables présentes
  let accessToken = null;
  const hasCreds =
    !!process.env.PROKERALA_CLIENT_ID && !!process.env.PROKERALA_CLIENT_SECRET;

  if (hasCreds) {
    try {
      const tk = await getProkeralaToken(
        process.env.PROKERALA_CLIENT_ID,
        process.env.PROKERALA_CLIENT_SECRET
      );
      accessToken = tk.access_token || null;
      response.prokerala = {
        auth_ok: !!accessToken,
        token_type: tk.token_type,
        expires_in: tk.expires_in,
      };
    } catch (e) {
      response.prokerala = {
        auth_ok: false,
        error: 'auth_failed',
        detail: String(e?.message || e),
      };
    }
  } else {
    response.prokerala = { auth_ok: false, error: 'missing_credentials' };
  }

  // 5) Produit : Horoscope du jour
  //    Requiert: meta.product === 'horoscope_daily' ET data.sign (FR ou EN)
  if (
    (meta.product === 'horoscope_daily' || meta.product === 'horoscope') &&
    data.sign
  ) {
    if (!accessToken) {
      response.horoscope = {
        ok: false,
        error: 'no_token',
        note: 'Prokerala token missing',
      };
    } else {
      try {
        const signEn = normalizeSignToEnglish(String(data.sign));
        if (!signEn) {
          response.horoscope = {
            ok: false,
            error: 'invalid_sign',
            note:
              'Provide sign in FR ou EN. Exemple FR: "balance", EN: "libra".',
          };
        } else {
          // Appel API Prokerala — daily horoscope
          const api = await fetchDailyHoroscope(accessToken, signEn);
          response.horoscope = api;
        }
      } catch (e) {
        response.horoscope = {
          ok: false,
          error: 'fetch_failed',
          detail: String(e?.message || e),
        };
      }
    }
  }

  // 6) Réponse
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(response));
}

/* --------------------- Utils: Prokerala --------------------- */

async function getProkeralaToken(clientId, clientSecret) {
  // OAuth2 client_credentials
  const form = new URLSearchParams();
  form.set('grant_type', 'client_credentials');
  form.set('client_id', clientId);
  form.set('client_secret', clientSecret);

  const r = await fetch('https://api.prokerala.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (!r.ok) {
    const txt = await safeText(r);
    throw new Error(`token_http_${r.status}: ${txt}`);
  }
  return await r.json();
}

async function fetchDailyHoroscope(accessToken, signEn) {
  // Endpoint Prokerala — daily horoscope
  // NOTE: on envoie seulement 'sign' pour rester tolérant (locale/params peuvent varier)
  const url = new URL(
    'https://api.prokerala.com/v2/astrology/horoscope/daily'
  );
  url.searchParams.set('sign', signEn);
  // Optionnel : timezone ou date si besoin
  // url.searchParams.set('timezone', 'UTC');

  const r = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const raw = await safeJson(r);

  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      api_raw: raw,
    };
  }

  // On tente d'extraire un texte lisible si dispo
  const text =
    raw?.data?.horoscope ||
    raw?.data?.prediction ||
    raw?.result?.horoscope ||
    raw?.horoscope ||
    null;

  return {
    ok: true,
    sign: signEn,
    text,
    api_raw: raw, // on renvoie brut aussi pour debug/validation
  };
}

/* --------------------- Utils: Numérologie --------------------- */

function computeLifePath(year, month, day) {
  const n = `${year}${pad2(month)}${pad2(day)}`;
  return reduceKeepMaster(sumDigits(n));
}

function sumDigits(strDigits) {
  return String(strDigits)
    .split('')
    .reduce((a, b) => a + Number(b), 0);
}

function reduceKeepMaster(n) {
  const keep = new Set([11, 22, 33]);
  while (n > 9 && !keep.has(n)) {
    n = sumDigits(String(n));
  }
  return n;
}

function pad2(n) {
  n = Number(n);
  return n < 10 ? `0${n}` : String(n);
}

/* --------------------- Utils: Signes FR -> EN --------------------- */

function normalizeSignToEnglish(input) {
  const val = String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // enlève les accents

  const map = {
    // FR (accent/variantes) -> EN
    belier: 'aries',
    taureau: 'taurus',
    gemeaux: 'gemini',
    cancer: 'cancer',
    lion: 'leo',
    vierge: 'virgo',
    balance: 'libra',
    scorpion: 'scorpio',
    sagittaire: 'sagittarius',
    capricorne: 'capricorn',
    verseau: 'aquarius',
    poissons: 'pisces',

    // EN (acceptés tels quels)
    aries: 'aries',
    taurus: 'taurus',
    gemini: 'gemini',
    leo: 'leo',
    virgo: 'virgo',
    libra: 'libra',
    scorpio: 'scorpio',
    sagittarius: 'sagittarius',
    capricorn: 'capricorn',
    aquarius: 'aquarius',
    pisces: 'pisces',
  };

  return map[val] || null;
}

/* --------------------- Utils: Safe JSON/TEXT --------------------- */

async function safeJson(r) {
  try {
    return await r.json();
  } catch {
    try {
      const t = await r.text();
      return { text: t };
    } catch {
      return null;
    }
  }
}

async function safeText(r) {
  try {
    return await r.text();
  } catch {
    return '';
  }
}
