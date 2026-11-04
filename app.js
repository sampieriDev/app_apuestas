// App de apuestas de fútbol: lee cuotas de The Odds API (https://the-odds-api.com)
// y clasifica cada apuesta como recomendada, más "segura" o más riesgosa.

const API_BASE = 'https://api.the-odds-api.com/v4';
const MIN_PROB_RECOMMENDED = 0.30;
// Para elegir la más "segura" y la más riesgosa ignoramos cuotas absurdas
// (p. ej. "más de 3.5 córners" @ 1.01), que no tiene sentido recomendar.
const MIN_ODDS = 1.20;
const MAX_ODDS = 15;

// Mercados extra (se piden partido por partido porque la API no los da en el listado general).
const EXTRA_MARKETS = ['btts', 'double_chance', 'draw_no_bet', 'corners_1x2', 'alternate_totals_corners', 'alternate_totals_cards'];
const EXTRA_REGIONS = 'eu,uk,us';

const MARKET_NAMES = {
  h2h: 'Resultado (1X2)', totals: 'Goles', btts: 'Ambos marcan', double_chance: 'Doble oportunidad',
  draw_no_bet: 'Empate no válido', corners_1x2: 'Córners 1X2', alternate_totals_corners: 'Córners',
  alternate_totals_cards: 'Tarjetas',
};

const $ = (id) => document.getElementById(id);
const pct = (p) => (p * 100).toFixed(1) + ' %';

// ---------- Carga de datos ----------

async function fetchOdds(league, apiKey) {
  const params = new URLSearchParams({
    apiKey, regions: 'eu,uk', markets: 'h2h,totals', oddsFormat: 'decimal', dateFormat: 'iso',
  });
  const res = await fetch(`${API_BASE}/sports/${league}/odds?${params}`);
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { msg += ': ' + (await res.json()).message; } catch {}
    throw new Error(msg);
  }
  const remaining = res.headers.get('x-requests-remaining');
  return { events: await res.json(), remaining };
}

async function fetchExtraOdds(league, eventId, apiKey) {
  const params = new URLSearchParams({
    apiKey, regions: EXTRA_REGIONS, markets: EXTRA_MARKETS.join(','), oddsFormat: 'decimal', dateFormat: 'iso',
  });
  const res = await fetch(`${API_BASE}/sports/${league}/events/${eventId}/odds?${params}`);
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { msg += ': ' + (await res.json()).message; } catch {}
    throw new Error(msg);
  }
  return { event: await res.json(), remaining: res.headers.get('x-requests-remaining') };
}

// Mete los mercados extra dentro de las casas del evento (o añade casas nuevas).
function mergeExtra(ev, extra) {
  for (const bm of extra.bookmakers || []) {
    const mine = ev.bookmakers.find((b) => b.title === bm.title);
    if (mine) {
      const keys = new Set(mine.markets.map((m) => m.key));
      mine.markets.push(...bm.markets.filter((m) => !keys.has(m.key)));
    } else {
      ev.bookmakers.push(bm);
    }
  }
  ev.extrasLoaded = true;
}

// Datos de ejemplo con el mismo formato que la API, para probar sin clave.
function demoEvents() {
  const fixtures = [
    ['Real Madrid', 'Getafe', [1.30, 5.50, 10.0], 2.5, [1.62, 2.30]],
    ['Barcelona', 'Atlético Madrid', [1.95, 3.70, 3.90], 2.5, [1.75, 2.10]],
    ['Sevilla', 'Real Betis', [2.60, 3.20, 2.80], 2.5, [2.20, 1.68]],
    ['Valencia', 'Villarreal', [2.90, 3.40, 2.45], 2.5, [1.95, 1.88]],
    ['Athletic Club', 'Osasuna', [1.80, 3.50, 4.80], 2.5, [2.10, 1.75]],
    ['Girona', 'Real Sociedad', [2.35, 3.40, 3.05], 2.5, [1.80, 2.02]],
  ];
  const books = ['Bet365', 'Pinnacle', 'William Hill', 'Betfair', 'Unibet'];
  const now = Date.now();
  return fixtures.map(([home, away, h2h, line, ou], i) => ({
    id: 'demo' + i,
    sport_title: 'LaLiga (demo)',
    commence_time: new Date(now + (i + 1) * 5 * 3600e3).toISOString(),
    home_team: home, away_team: away,
    bookmakers: books.map((title, b) => {
      const j = (x) => +(x * (1 + Math.sin(i * 7 + b * 3 + x) * 0.04)).toFixed(2);
      return {
        title,
        markets: [
          { key: 'h2h', outcomes: [
            { name: home, price: j(h2h[0]) }, { name: 'Draw', price: j(h2h[1]) }, { name: away, price: j(h2h[2]) },
          ] },
          { key: 'totals', outcomes: [
            { name: 'Over', point: line, price: j(ou[0]) }, { name: 'Under', point: line, price: j(ou[1]) },
          ] },
        ],
      };
    }),
  }));
}

// Mercados extra de ejemplo para el modo demo.
function demoExtra(ev, i) {
  const home = ev.home_team, away = ev.away_team;
  const h = ev.bookmakers[0].markets[0].outcomes; // cuotas 1X2 de referencia
  const [pH, pD, pA] = h.map((o) => 1 / o.price);
  const m = 1.06; // margen de la casa
  const odd = (p) => +(1 / (p * m)).toFixed(2);
  const cornersMean = 9.5 + (i % 3);
  const cardsMean = 4 + (i % 2);
  // Probabilidad aproximada de "más de X" con una curva logística alrededor de la media.
  const over = (line, mean, k) => 1 / (1 + Math.exp((line - mean) / k));
  return {
    bookmakers: ['Bet365', 'Pinnacle', 'DraftKings'].map((title, b) => {
      const j = (x) => +(x * (1 + Math.sin(i * 5 + b * 2 + x) * 0.03)).toFixed(2);
      const pBtts = 0.5 + (i % 4) * 0.04;
      const dnbH = pH / (pH + pA);
      return {
        title,
        markets: [
          { key: 'btts', outcomes: [{ name: 'Yes', price: j(odd(pBtts)) }, { name: 'No', price: j(odd(1 - pBtts)) }] },
          { key: 'double_chance', outcomes: [
            { name: `${home} or Draw`, price: j(odd(pH + pD)) },
            { name: `${home} or ${away}`, price: j(odd(pH + pA)) },
            { name: `${away} or Draw`, price: j(odd(pA + pD)) },
          ] },
          { key: 'draw_no_bet', outcomes: [{ name: home, price: j(odd(dnbH)) }, { name: away, price: j(odd(1 - dnbH)) }] },
          { key: 'corners_1x2', outcomes: [
            { name: home, price: j(odd(0.47)) }, { name: 'Draw', price: j(odd(0.1)) }, { name: away, price: j(odd(0.43)) },
          ] },
          { key: 'alternate_totals_corners', outcomes: [7.5, 8.5, 9.5, 10.5, 11.5, 12.5].flatMap((l) => {
            const p = over(l, cornersMean, 1.4);
            return [{ name: 'Over', point: l, price: j(odd(p)) }, { name: 'Under', point: l, price: j(odd(1 - p)) }];
          }) },
          { key: 'alternate_totals_cards', outcomes: [2.5, 3.5, 4.5, 5.5, 6.5].flatMap((l) => {
            const p = over(l, cardsMean, 0.9);
            return [{ name: 'Over', point: l, price: j(odd(p)) }, { name: 'Under', point: l, price: j(odd(1 - p)) }];
          }) },
        ],
      };
    }),
  };
}

// ---------- Análisis ----------

const overUnder = (o, unit) => (o.name === 'Over' ? 'Más de ' : 'Menos de ') + o.point + ' ' + unit;

function outcomeLabel(market, o) {
  switch (market) {
    case 'h2h': return o.name === 'Draw' ? 'Empate' : 'Gana ' + o.name;
    case 'totals': return overUnder(o, 'goles');
    case 'btts': return 'Ambos marcan: ' + (o.name === 'Yes' ? 'Sí' : 'No');
    case 'double_chance': return 'Doble oportunidad: ' + o.name.replace(' or Draw', ' o empate').replace(' or ', ' o ');
    case 'draw_no_bet': return 'Gana ' + o.name + ' (empate devuelve)';
    case 'corners_1x2': return o.name === 'Draw' ? 'Mismos córners' : 'Más córners: ' + o.name;
    case 'alternate_totals_corners': return overUnder(o, 'córners');
    case 'alternate_totals_cards': return overUnder(o, 'tarjetas');
    default: return o.name;
  }
}

// En los mercados de totales cada línea (9.5, 10.5…) es un mercado aparte de dos opciones.
function splitMarket(m) {
  if (m.key === 'totals') return [m.outcomes.filter((o) => o.point === 2.5)]; // solo la línea más común
  if (m.key.includes('totals')) {
    const byPoint = {};
    for (const o of m.outcomes) (byPoint[o.point] ||= []).push(o);
    return Object.values(byPoint);
  }
  return [m.outcomes];
}

// Devuelve la lista de apuestas posibles de un partido con probabilidad de consenso y mejor cuota.
function analyzeEvent(ev) {
  const acc = {}; // clave -> { label, probs: [], best, bestBook }
  for (const bm of ev.bookmakers || []) {
    for (const m of bm.markets || []) {
      if (!MARKET_NAMES[m.key]) continue;
      for (const outs of splitMarket(m)) {
        if (outs.length < 2) continue;
        // En doble oportunidad cada resultado aparece en dos opciones, así que suman 2 y no 1.
        const total = m.key === 'double_chance' ? 2 : 1;
        const overround = outs.reduce((s, o) => s + 1 / o.price, 0) / total;
        for (const o of outs) {
          const key = m.key + '|' + o.name + '|' + (o.point ?? '');
          const a = acc[key] ||= { label: outcomeLabel(m.key, o), market: m.key, probs: [], best: 0, bestBook: '' };
          a.probs.push((1 / o.price) / overround); // probabilidad sin margen
          if (o.price > a.best) { a.best = o.price; a.bestBook = bm.title; }
        }
      }
    }
  }
  return Object.values(acc).map((a) => {
    const prob = a.probs.reduce((s, p) => s + p, 0) / a.probs.length;
    return { ...a, prob, ev: prob * a.best - 1, books: a.probs.length };
  });
}

const sensible = (b) => b.best >= MIN_ODDS && b.best <= MAX_ODDS;

function classify(allBets) {
  const bets = allBets.filter(sensible).length ? allBets.filter(sensible) : allBets;
  if (!bets.length) return null;
  const byProb = [...bets].sort((x, y) => y.prob - x.prob);
  const candidates = bets.filter((b) => b.prob >= MIN_PROB_RECOMMENDED);
  const rec = [...(candidates.length ? candidates : bets)].sort((x, y) => y.ev - x.ev)[0];
  return { safe: byProb[0], risk: byProb[byProb.length - 1], rec };
}

// ---------- Render ----------

const fmtTime = (iso) => new Date(iso).toLocaleString('es', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pickHTML(kind, title, b) {
  const evCls = b.ev > 0 ? 'pos' : 'neg';
  return `<div class="pick ${kind}">
    <div><span class="label">${title} · ${esc(MARKET_NAMES[b.market])}</span>${esc(b.label)}</div>
    <div class="nums">@ ${b.best.toFixed(2)}
      <small>${pct(b.prob)} · valor <span class="${evCls}">${(b.ev * 100).toFixed(1)} %</span></small>
      <small>${esc(b.bestBook)}</small></div>
  </div>`;
}

let state = { events: [], league: '', key: '' };

function render(events = state.events) {
  const matches = $('matches');
  const rows = events
    .filter((e) => new Date(e.commence_time) > Date.now())
    .sort((a, b) => a.commence_time.localeCompare(b.commence_time))
    .map((e) => ({ e, bets: analyzeEvent(e) }))
    .map((r) => ({ ...r, c: classify(r.bets) }))
    .filter((r) => r.c);

  if (!rows.length) {
    matches.innerHTML = '<p>No hay partidos próximos con cuotas para esta liga.</p>';
    $('summary').hidden = true;
    return;
  }

  matches.innerHTML = rows.map(({ e, bets, c }) => `
    <article class="match">
      <div class="teams">${esc(e.home_team)} vs ${esc(e.away_team)}</div>
      <div class="time">🕒 ${fmtTime(e.commence_time)} · ${esc(e.sport_title || '')}</div>
      ${pickHTML('rec', '⭐ Recomendada', c.rec)}
      ${pickHTML('safe', '🛡️ Más "segura"', c.safe)}
      ${pickHTML('risk', '🔥 Más riesgosa', c.risk)}
      ${e.extrasLoaded ? '' : `<button class="extra" data-id="${esc(e.id)}">➕ Córners, tarjetas y más</button>`}
      <details ${e.extrasLoaded ? 'open' : ''}><summary>Ver todas las opciones (${bets.length})</summary>
        ${Object.keys(MARKET_NAMES).filter((mk) => bets.some((b) => b.market === mk)).map((mk) => `
          <h4>${MARKET_NAMES[mk]}</h4>
          <table class="all"><tr><td>Opción</td><td>Prob.</td><td>Mejor cuota</td></tr>
          ${bets.filter((b) => b.market === mk).sort((x, y) => y.prob - x.prob).map((b) =>
            `<tr><td>${esc(b.label)}</td><td>${pct(b.prob)}</td><td>${b.best.toFixed(2)}</td></tr>`).join('')}
          </table>`).join('')}
      </details>
    </article>`).join('');

  // Resumen global: top 5 de cada categoría entre todos los partidos.
  const all = rows.flatMap(({ e, bets }) => bets.filter(sensible).map((b) => ({ ...b, match: `${e.home_team} vs ${e.away_team}` })));
  const li = (b, extra) => `<li>${esc(b.label)} @ ${b.best.toFixed(2)}<small>${esc(b.match)} · ${extra}</small></li>`;
  $('top-rec').innerHTML = all.filter((b) => b.prob >= MIN_PROB_RECOMMENDED)
    .sort((x, y) => y.ev - x.ev).slice(0, 5).map((b) => li(b, 'valor ' + (b.ev * 100).toFixed(1) + ' %')).join('');
  $('top-safe').innerHTML = [...all].sort((x, y) => y.prob - x.prob).slice(0, 5).map((b) => li(b, pct(b.prob))).join('');
  $('top-risk').innerHTML = [...all].sort((x, y) => x.prob - y.prob).slice(0, 5).map((b) => li(b, pct(b.prob))).join('');
  $('summary').hidden = false;
}

// ---------- Arranque ----------

async function load() {
  const key = $('apikey').value.trim();
  const league = $('league').value;
  try { localStorage.setItem('oddsApiKey', key); localStorage.setItem('league', league); } catch {}
  const status = $('status');
  status.className = 'status';
  $('load').disabled = true;
  try {
    state = { events: [], league, key };
    if (!key) {
      status.textContent = 'Modo demo: datos de ejemplo. Pega tu API key para ver partidos reales.';
      state.events = demoEvents();
    } else {
      status.textContent = 'Cargando cuotas…';
      const { events, remaining } = await fetchOdds(league, key);
      state.events = events;
      status.textContent = `${events.length} partidos cargados.` + (remaining ? ` Te quedan ${remaining} créditos este mes.` : '');
    }
    render();
  } catch (err) {
    status.className = 'status error';
    status.textContent = 'No se pudieron cargar las cuotas: ' + err.message;
  } finally {
    $('load').disabled = false;
  }
}

try {
  $('apikey').value = localStorage.getItem('oddsApiKey') || '';
  const l = localStorage.getItem('league'); if (l) $('league').value = l;
} catch {}
$('load').addEventListener('click', load);

// Botón "Córners, tarjetas y más" de cada partido.
$('matches').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button.extra');
  if (!btn) return;
  const idx = state.events.findIndex((e) => e.id === btn.dataset.id);
  const e = state.events[idx];
  const status = $('status');
  btn.disabled = true;
  btn.textContent = 'Cargando…';
  try {
    if (!state.key) {
      mergeExtra(e, demoExtra(e, idx));
    } else {
      const { event, remaining } = await fetchExtraOdds(state.league, e.id, state.key);
      mergeExtra(e, event);
      const n = (event.bookmakers || []).length;
      status.className = 'status';
      status.textContent = (n ? `Mercados extra de ${e.home_team} vs ${e.away_team} cargados.`
        : `Ninguna casa ofrece aún córners/tarjetas para ${e.home_team} vs ${e.away_team}.`)
        + (remaining ? ` Te quedan ${remaining} créditos.` : '');
    }
    render();
  } catch (err) {
    status.className = 'status error';
    status.textContent = 'No se pudieron cargar los mercados extra: ' + err.message;
    btn.disabled = false;
    btn.textContent = '➕ Córners, tarjetas y más';
  }
});
load();

