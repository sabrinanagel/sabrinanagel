// Genera un SVG animado: un conejito salta de zanahoria en zanahoria
// (cada zanahoria es un día con contribuciones) y se las va comiendo.
// Uso en GitHub Actions: GITHUB_TOKEN=... GITHUB_USER=usuario node bunny.mjs
// Uso local sin token: node bunny.mjs  (genera datos de prueba al azar)

import { mkdirSync, writeFileSync } from 'node:fs';

const USER = process.env.GITHUB_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.env.OUT_DIR || 'dist';

const CELL = 14;          // distancia entre cuadraditos
const BOX = 11;           // tamaño del cuadradito
const PAD_X = 40;         // lugar a la izquierda para Lun/Mié/Vie
const PAD_TOP = 52;       // lugar arriba para los meses y los saltos
const PAD_BOTTOM = 34;

// ---------- 1. Datos de contribuciones ----------

async function fetchWeeks() {
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionCount contributionLevel weekday date}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  if (!json.data?.user) throw new Error('No pude leer las contribuciones: ' + JSON.stringify(json.errors || json));
  const levels = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  return json.data.user.contributionsCollection.contributionCalendar.weeks.map(w =>
    w.contributionDays.map(d => ({ level: levels[d.contributionLevel] ?? 0, weekday: d.weekday, date: d.date }))
  );
}

function fakeWeeks() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 364 - start.getUTCDay());
  return Array.from({ length: 53 }, (_, c) =>
    Array.from({ length: 7 }, (_, r) => {
      const busy = Math.sin(c / 6) > 0 ? 0.45 : 0.2;
      const d = new Date(start); d.setUTCDate(start.getUTCDate() + c * 7 + r);
      return { level: Math.random() < busy ? 1 + Math.floor(Math.random() * 4) : 0, weekday: r, date: d.toISOString().slice(0, 10) };
    })
  );
}

// ---------- 2. Dibujos ----------

const carrotSymbol = `
<symbol id="carrot" viewBox="-6 -8 12 16" overflow="visible">
  <path d="M0 -3 Q-1.5 -5.5 -3 -6.5 M0 -3 Q0 -6 0.2 -7.5 M0 -3 Q1.5 -5.5 3 -6.2" stroke="#4E9A25" stroke-width="1.4" stroke-linecap="round" fill="none"/>
  <path d="M-2.8 -3.2 Q0 -4.3 2.8 -3.2 L0.4 5.6 Q0 6.2 -0.4 5.6 Z" fill="#F08A24"/>
  <path d="M-1.6 -0.8 L0 -0.5 M-0.9 2.2 L0.5 2.4" stroke="#C4651A" stroke-width="0.6" stroke-linecap="round"/>
</symbol>`;

function bunnySymbol(t) {
  return `
<symbol id="bunny" viewBox="-12 -24 24 26" overflow="visible">
  <g class="ears">
    <ellipse cx="2.6" cy="-15.5" rx="1.5" ry="4.6" transform="rotate(-12 2.6 -15.5)" fill="${t.fur}" stroke="${t.line}" stroke-width="0.6"/>
    <ellipse cx="2.6" cy="-15.3" rx="0.6" ry="3.2" transform="rotate(-12 2.6 -15.3)" fill="#F4A6BE"/>
    <ellipse cx="5.6" cy="-15" rx="1.5" ry="4.6" transform="rotate(14 5.6 -15)" fill="${t.fur}" stroke="${t.line}" stroke-width="0.6"/>
    <ellipse cx="5.6" cy="-14.8" rx="0.6" ry="3.2" transform="rotate(14 5.6 -14.8)" fill="#F4A6BE"/>
  </g>
  <circle cx="-7" cy="-6" r="2.2" fill="${t.fur}" stroke="${t.line}" stroke-width="0.6"/>
  <ellipse cx="-1" cy="-5" rx="6.5" ry="4.8" fill="${t.fur}" stroke="${t.line}" stroke-width="0.6"/>
  <circle cx="4.4" cy="-9.2" r="3.9" fill="${t.fur}" stroke="${t.line}" stroke-width="0.6"/>
  <circle cx="5.7" cy="-9.9" r="0.8" fill="#2B2B2B"/>
  <circle cx="8.1" cy="-8.6" r="0.7" fill="#F28AA8"/>
  <circle cx="5.2" cy="-7.6" r="0.9" fill="#F7B8C9" opacity="0.7"/>
  <ellipse cx="1.5" cy="-0.6" rx="2.8" ry="1.1" fill="${t.fur}" stroke="${t.line}" stroke-width="0.6"/>
</symbol>`;
}

const THEMES = {
  light: { file: 'bunny-contribution-graph.svg', empty: '#EBEDF0', fur: '#FFFFFF', line: '#9AA0A6', text: '#57606A' },
  dark: { file: 'bunny-contribution-graph-dark.svg', empty: '#161B22', fur: '#F5F5F5', line: '#F5F5F5', text: '#8B949E' },
};

// ---------- 3. Animación ----------

function build(weeks, t) {
  const cols = weeks.length;
  const W = PAD_X * 2 + cols * CELL;
  const H = PAD_TOP + 7 * CELL + PAD_BOTTOM;
  const center = (c, r) => [PAD_X + c * CELL + BOX / 2, PAD_TOP + r * CELL + BOX / 2];

  // Zanahorias en orden cronológico
  const carrots = [];
  weeks.forEach((days, c) => days.forEach(d => { if (d.level > 0) carrots.push({ c, r: d.weekday, level: d.level }); }));

  // Línea de tiempo en segundos
  const EAT = 0.32;
  const steps = []; // {t, x, y, ease}
  let time = 0;
  const groundY = (y) => y + 6; // patas apoyadas sobre la zanahoria
  let [px, py] = [-20, groundY(center(0, 6)[1])];
  steps.push({ t: 0, x: px, y: py });

  const hop = (nx, ny) => {
    const dist = Math.hypot(nx - px, ny - py);
    const dur = Math.min(0.95, 0.32 + dist * 0.004);
    const height = 10 + Math.min(18, dist * 0.12);
    const apexY = Math.min(py, ny) - height;
    steps.push({ t: time + dur / 2, x: (px + nx) / 2, y: apexY, apex: true });
    time += dur;
    steps.push({ t: time, x: nx, y: ny });
    px = nx; py = ny;
  };

  const eats = [];
  time = 0.4;
  steps.push({ t: time, x: px, y: py });
  if (carrots.length === 0) {
    for (let x = 30; x < W; x += 60) { hop(x, py); time += 0.1; steps.push({ t: time, x: px, y: py }); }
  }
  for (const k of carrots) {
    const [cx, cy] = center(k.c, k.r);
    hop(cx, groundY(cy));
    eats.push({ start: time, end: time + EAT });
    time += EAT;
    steps.push({ t: time, x: px, y: py });
  }
  hop(W + 20, py);
  const exitT = time;
  const total = exitT + 2.2; // pausa antes de repetir
  const pct = (s) => ((s / total) * 100).toFixed(3);
  const hidden = H + 60;

  // Keyframes del conejo
  let kf = steps.map(s =>
    `${pct(s.t)}%{transform:translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px);animation-timing-function:${s.apex ? 'ease-in' : 'ease-out'}}`
  ).join('');
  kf += `${pct(exitT + 0.01)}%{transform:translate(${W + 20}px,${hidden}px)}`;
  kf += `99.9%{transform:translate(-20px,${hidden}px)}`;
  kf += `100%{transform:translate(-20px,${steps[0].y.toFixed(1)}px)}`;

  // Zanahorias
  const scale = [0, 0.85, 0.98, 1.1, 1.22];
  let carrotCss = '';
  let carrotEls = '';
  carrots.forEach((k, i) => {
    const [cx, cy] = center(k.c, k.r);
    const s = scale[k.level];
    const e = eats[i];
    carrotCss += `@keyframes k${i}{0%,${pct(e.start)}%{transform:scale(1) rotate(0)}${pct(e.start + EAT * 0.4)}%{transform:scale(.7) rotate(-18deg)}${pct(e.end)}%,97%{transform:scale(0) rotate(10deg)}100%{transform:scale(1) rotate(0)}}.k${i}{animation:k${i} ${total.toFixed(2)}s linear infinite}`;
    carrotCss += `@keyframes h${i}{0%,${pct(e.end - EAT * 0.3)}%{opacity:0}${pct(e.end)}%,97%{opacity:1}100%{opacity:0}}.h${i}{animation:h${i} ${total.toFixed(2)}s linear infinite}`;
    carrotEls += `<rect x="${PAD_X + k.c * CELL}" y="${PAD_TOP + k.r * CELL}" width="${BOX}" height="${BOX}" rx="2" fill="${t.empty}" class="h${i}" opacity="0"/>`;
    carrotEls += `<g transform="translate(${cx} ${cy}) scale(${s})"><use href="#carrot" x="-6" y="-8" width="12" height="16" class="c k${i}"/></g>`;
  });

  // Fondo de cuadraditos
  let grid = '';
  weeks.forEach((days, c) => days.forEach(d => {
    if (d.level > 0) return; // los días con zanahoria no llevan cuadradito
    const x = PAD_X + c * CELL, y = PAD_TOP + d.weekday * CELL;
    grid += `<rect x="${x}" y="${y}" width="${BOX}" height="${BOX}" rx="2" fill="${t.empty}"/>`;
  }));

  const label = `${carrots.length} ${carrots.length === 1 ? 'día con zanahoria' : 'días con zanahoria'} en el último año`;
  const font = 'font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="11"';

  // Meses (y el año en el primero y en enero), como el calendario de GitHub
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  let months = '';
  let lastMonth = -1, lastX = 0;
  weeks.forEach((days, c) => {
    const first = days.find(d => d.date);
    if (!first) return;
    const dt = new Date(first.date + 'T00:00:00Z');
    const m = dt.getUTCMonth();
    if (m === lastMonth) return;
    lastMonth = m;
    if (c === 0 && dt.getUTCDate() > 14) return; // mes cortado al principio: se saltea, como GitHub
    const x = PAD_X + c * CELL;
    const txt = (m === 0 || months === '') ? `${MESES[m]} ${dt.getUTCFullYear()}` : MESES[m];
    if (x < lastX) return; // no pisar el texto anterior
    lastX = x + txt.length * 6.5 + 6;
    months += `<text x="${x}" y="${PAD_TOP - 8}" ${font} fill="${t.text}">${txt}</text>`;
  });

  // Días de la semana
  const dias = [[1, 'Lun'], [3, 'Mié'], [5, 'Vie']]
    .map(([r, n]) => `<text x="${PAD_X - 8}" y="${PAD_TOP + r * CELL + 9}" text-anchor="end" ${font} fill="${t.text}">${n}</text>`).join('');

  // Leyenda: Menos 🥕 Más
  const lx = W - PAD_X - 5 * 16 - 30;
  let legend = `<text x="${lx - 6}" y="${H - 9}" text-anchor="end" ${font} fill="${t.text}">Menos</text>`;
  [1, 2, 3, 4].forEach((lv, i) => {
    legend += `<g transform="translate(${lx + 8 + i * 16} ${H - 13}) scale(${scale[lv]})"><use href="#carrot" x="-6" y="-8" width="12" height="16"/></g>`;
  });
  legend += `<text x="${lx + 8 + 4 * 16 - 2}" y="${H - 9}" ${font} fill="${t.text}">Más</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${carrotSymbol}${bunnySymbol(t)}</defs>
<style>
.c{transform-box:fill-box;transform-origin:50% 60%}
.b{animation:hop ${total.toFixed(2)}s infinite}
@keyframes hop{${kf}}
.ears{transform-box:fill-box;transform-origin:50% 100%;animation:ear 1.6s ease-in-out infinite}
@keyframes ear{0%,80%,100%{transform:rotate(0)}88%{transform:rotate(-10deg)}94%{transform:rotate(6deg)}}
${carrotCss}
</style>
${months}
${dias}
${grid}
${carrotEls}
<g class="b"><use href="#bunny" x="-16" y="-32" width="32" height="34.7"/></g>
<text x="${PAD_X}" y="${H - 9}" ${font} fill="${t.text}">${label}</text>
${legend}
</svg>`;
}

// ---------- 4. Main ----------

const weeks = USER && TOKEN ? await fetchWeeks() : fakeWeeks();
mkdirSync(OUT, { recursive: true });
for (const t of Object.values(THEMES)) {
  writeFileSync(`${OUT}/${t.file}`, build(weeks, t));
  console.log('Generado', `${OUT}/${t.file}`);
}
