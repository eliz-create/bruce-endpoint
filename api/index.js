// api/index.js
export const config = { runtime: 'edge' };

function json(res, status=200) {
  return new Response(JSON.stringify(res, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// --- Utils ----------------------------------------------------
function parseBody(req) {
  return req.json().catch(() => ({}));
}

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Pythagorean Life Path (very common rule)
function lifePathFromYMD({year, month, day}) {
  const sumDigits = (n) => (''+n).split('').reduce((a,b)=>a+Number(b||0),0);
  const reduce = (n) => {
    while (n > 9 && ![11,22,33].includes(n)) n = sumDigits(n);
    return n;
  };
  if (![year,month,day].every(Boolean)) return null;
  return reduce(reduce(year)+reduce(month)+reduce(day));
}

// Build clean “product blocks” Bruce can use
function buildStubs({meta={}, people={}, locale='fr'}) {
  const name = people?.a?.name || 'Client';
  return {
    natal: {
      meta: { product: 'natal', tier: meta.tier || 'classic', locale },
      people, placements: null,
      insights: { strengths: [], challenges: [], timing: [] },
      note: 'stub_natal: fournissez placements/aspects côté serveur pour la fiabilité.'
    },
    synastry: {
      meta: { product: 'synastry', tier: meta.tier || 'classic', locale },
      people, synastry: { cross_aspects: [] },
      insights: { strengths: [], challenges: [], timing: [] },
      note: 'stub_synastry: fournissez cross_aspects côté serveur pour la fiabilité.'
    },
    transits: {
      meta: { product: 'transits', tier: meta.tier || 'classic', locale },
      people, transits: { period: null, items: [] },
      insights: { strengths: [], challenges: [] },
      note: 'stub_transits: fournissez une liste datée d’aspects/notes.'
    },
    solar: {
      meta: { product: 'solar', tier: meta.tier || 'classic', locale },
      people, solar: { year: null, sun_house: null, asc_sign: null },
      insights: { strengths: [], challenges: [] },
      note: 'stub_solar: fournissez révolution solaire (maison du Soleil, Asc RS…).'
    },
    chinese: {
      meta: { product: 'chinese', tier: meta.tier || 'classic', locale },
      people, chinese: { system: 'zodiac', animal: null, element: null, yin_yang: null },
      insights: { strengths: [], challenges: [] },
      note: 'stub_chinese: fournissez BaZi complet ou au moins animal+élément.'
    },
    numerology: {
      meta: { product: 'numerology', tier: meta.tier || 'classic', locale },
      people, numerology: {},
      insights: { strengths: [], challenges: [] },
      note: 'numerology: calculs locaux OK (Life Path).'
    },
    all: { note: 'utilisez une combinaison des blocs ci-dessus' }
  };
}

// --- Prokerala OAuth (token uniquement pour l’instant) --------
async function prokeralaAuth() {
  const cid = process.env.PROKERALA_CLIENT_ID;
  const secret = process.env.PROKERALA_CLIENT_SECRET;
  if (!cid || !secret) return { ok:false, error:'Missing Prokerala credentials' };

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  const r = await fetch('https://api.prokerala.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    // basic auth in body (per Prokerala docs via Postman)
    // if needed, also include Authorization header "Basic ..." (not required in most setups)
  });

  if (!r.ok) {
    return { ok:false, status:r.status, error:'token_failed', api_raw: await r.text().catch(()=>null) };
  }
  const tok = await r.json().catch(()=>null);
  return { ok:true, token: tok?.access_token, token_type: tok?.token_type, expires_in: tok?.expires_in };
}

// --- Main handler ---------------------------------------------
export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ ok:false, error:'POST only' }, 405);
  }

  const body = await parseBody(req);
  const data = body?.data || {};
  const meta = data?.meta || {};
  const locale = (meta.locale === 'en' ? 'en' : 'fr');

  // Prepare response skeleton
  const out = {
    ok: true,
    received: data,
    numerology: null,
    horoscope: null,
    products: {},
    prokerala: null,
  };

  // 1) Try Prokerala auth (so tu sais si les clés sont OK)
  try {
    out.prokerala = await prokeralaAuth();
  } catch(e) {
    out.prokerala = { ok:false, error:'auth_exception', detail: String(e?.message||e) };
  }

  // 2) Numerology (Life Path) — calcul local si date fournie
  const y = toInt(data?.people?.a?.birth?.year);
  const m = toInt(data?.people?.a?.birth?.month);
  const d = toInt(data?.people?.a?.birth?.day);
  const lp = lifePathFromYMD({year:y, month:m, day:d});
  if (lp) {
    out.numerology = { life_path: lp };
  }

  // 3) Horoscope (désactivé proprement tant que l’URL exacte n’est pas réglée)
  if (data?.horoscope?.sign) {
    out.horoscope = {
      ok: false,
      reason: 'route_non_connectee',
      hint: 'Importe https://api.prokerala.com/spec/astrology.v2.yaml dans Postman et copie l’URL exacte de “Daily Horoscope”. Remplace ensuite HORO_PATH et les noms des paramètres.'
    };
  }

  // 4) “Produits” : renvoyer des blocs stubs propres que Bruce sait développer
  const stubs = buildStubs({ meta, people: data?.people || {}, locale });

  // Choix de produit(s)
  const wanted = (meta.product || 'all');
  const push = (k, v) => (out.products[k] = v);

  if (wanted === 'all') {
    push('natal', stubs.natal);
    push('synastry', stubs.synastry);
    push('transits', stubs.transits);
    push('solar', stubs.solar);
    push('chinese', stubs.chinese);
    push('numerology', { ...stubs.numerology, numerology: out.numerology ?? {} });
  } else {
    const allowed = ['natal','synastry','transits','solar','chinese','numerology'];
    if (allowed.includes(wanted)) {
      if (wanted === 'numerology') {
        push('numerology', { ...stubs.numerology, numerology: out.numerology ?? {} });
      } else {
        push(wanted, stubs[wanted]);
      }
    } else {
      push('info', { note: 'meta.product inconnu, utilisez all/natal/synastry/transits/solar/chinese/numerology' });
    }
  }

  return json(out);
}
