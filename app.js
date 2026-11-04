// App de apuestas de fútbol: lee cuotas de The Odds API (https://the-odds-api.com)
// y clasifica cada apuesta como recomendada, más "segura" o más riesgosa.

const API_BASE = 'https://api.the-odds-api.com/v4';
const MIN_PROB_RECOMMENDED = 0.30;

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

// ---------- Análisis ----------

function outcomeLabel(market, o, ev) {
  if (market === 'h2h') {
    if (o.name === 'Draw') return 'Empate';
    return 'Gana ' + o.name;
  }
  if (market === 'totals') return (o.name === 'Over' ? 'Más de ' : 'Menos de ') + o.point + ' goles';
  return o.name;
}

// Devuelve la lista de apuestas posibles de un partido con probabilidad de consenso y mejor cuota.
function analyzeEvent(ev) {
  const acc = {}; // clave -> { label, probs: [], best, bestBook }
  for (const bm of ev.bookmakers || []) {
    for (const m of bm.markets || []) {
      // Para totales usamos solo la línea 2.5 (la más común) para comparar casas por igual.
      const outs = m.key === 'totals' ? m.outcomes.filter((o) => o.point === 2.5) : m.outcomes;
      if (outs.length < 2) continue;
      const overround = outs.reduce((s, o) => s + 1 / o.price, 0);
      for (const o of outs) {
        const key = m.key + '|' + o.name + '|' + (o.point ?? '');
        const a = acc[key] ||= { label: outcomeLabel(m.key, o, ev), market: m.key, probs: [], best: 0, bestBook: '' };
        a.probs.push((1 / o.price) / overround); // probabilidad sin margen
        if (o.price > a.best) { a.best = o.price; a.bestBook = bm.title; }
      }
    }
  }
  return Object.values(acc).map((a) => {
    const prob = a.probs.reduce((s, p) => s + p, 0) / a.probs.length;
    return { ...a, prob, ev: prob * a.best - 1, books: a.probs.length };
  });
}

function classify(bets) {
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
    <div><span class="label">${title}</span>${esc(b.label)}</div>
    <div class="nums">@ ${b.best.toFixed(2)}
      <small>${pct(b.prob)} · valor <span class="${evCls}">${(b.ev * 100).toFixed(1)} %</span></small>
      <small>${esc(b.bestBook)}</small></div>
  </div>`;
}

function render(events) {
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
      <details><summary>Ver todas las opciones</summary>
        <table class="all"><tr><td>Opción</td><td>Prob.</td><td>Mejor cuota</td></tr>
        ${[...bets].sort((x, y) => y.prob - x.prob).map((b) =>
          `<tr><td>${esc(b.label)}</td><td>${pct(b.prob)}</td><td>${b.best.toFixed(2)}</td></tr>`).join('')}
        </table>
      </details>
    </article>`).join('');

  // Resumen global: top 5 de cada categoría entre todos los partidos.
  const all = rows.flatMap(({ e, bets }) => bets.map((b) => ({ ...b, match: `${e.home_team} vs ${e.away_team}` })));
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
    if (!key) {
      status.textContent = 'Modo demo: datos de ejemplo. Pega tu API key para ver partidos reales.';
      render(demoEvents());
    } else {
      status.textContent = 'Cargando cuotas…';
      const { events, remaining } = await fetchOdds(league, key);
      status.textContent = `${events.length} partidos cargados.` + (remaining ? ` Te quedan ${remaining} créditos este mes.` : '');
      render(events);
    }
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
load();

