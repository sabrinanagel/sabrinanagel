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
  const calendar = json.data.user.contributionsCollection.contributionCalendar;
  const weeks = calendar.weeks.map(w =>
    w.contributionDays.map(d => ({ level: levels[d.contributionLevel] ?? 0, weekday: d.weekday, date: d.date }))
  );
  return { weeks, total: calendar.totalContributions };
}

function fakeWeeks() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 364 - start.getUTCDay());
  const weeks = Array.from({ length: 53 }, (_, c) =>
    Array.from({ length: 7 }, (_, r) => {
      const busy = Math.sin(c / 6) > 0 ? 0.45 : 0.2;
      const d = new Date(start); d.setUTCDate(start.getUTCDate() + c * 7 + r);
      return { level: Math.random() < busy ? 1 + Math.floor(Math.random() * 4) : 0, weekday: r, date: d.toISOString().slice(0, 10) };
    })
  );
  return { weeks, total: 123 };
}

// ---------- 2. Dibujos ----------

const carrotSymbol = `
<symbol id="carrot" viewBox="-6 -8 12 16" overflow="visible">
  <path d="M0 -3 Q-1.5 -5.5 -3 -6.5 M0 -3 Q0 -6 0.2 -7.5 M0 -3 Q1.5 -5.5 3 -6.2" stroke="#4E9A25" stroke-width="1.4" stroke-linecap="round" fill="none"/>
  <path d="M-2.8 -3.2 Q0 -4.3 2.8 -3.2 L0.4 5.6 Q0 6.2 -0.4 5.6 Z" fill="#F08A24"/>
  <path d="M-1.6 -0.8 L0 -0.5 M-0.9 2.2 L0.5 2.4" stroke="#C4651A" stroke-width="0.6" stroke-linecap="round"/>
</symbol>`;

function holeSymbol(t) {
  return `
<symbol id="hole" viewBox="-6 -6 12 12" overflow="visible">
  <ellipse cx="0" cy="0.5" rx="5.5" ry="4.5" fill="${t.dirt}"/>
  <ellipse cx="0" cy="-0.3" rx="4.3" ry="3.2" fill="${t.dirtLight}"/>
  <ellipse cx="0" cy="0.2" rx="3.3" ry="2.3" fill="${t.hollow}"/>
  <circle cx="-4.9" cy="-3.1" r="0.7" fill="${t.dirt}"/>
  <circle cx="4.8" cy="-3.5" r="0.5" fill="${t.dirt}"/>
  <circle cx="5.1" cy="3.8" r="0.6" fill="${t.dirt}"/>
</symbol>`;
}

const dropSymbol = `
<symbol id="drop" viewBox="-3 -4 6 8" overflow="visible">
  <path d="M0 -3.8 Q2.7 0 2.7 1.3 A2.7 2.7 0 1 1 -2.7 1.3 Q-2.7 0 0 -3.8 Z" fill="#58B7F0"/>
</symbol>`;

function cloudSymbol(t) {
  return `
<symbol id="cloud" viewBox="-20 -12 40 24" overflow="visible">
  <circle cx="-9" cy="3" r="6" fill="${t.cloud}"/>
  <circle cx="-1" cy="-2" r="8.5" fill="${t.cloud}"/>
  <circle cx="9" cy="2" r="6.5" fill="${t.cloud}"/>
  <rect x="-15" y="2" width="30" height="7" rx="3.5" fill="${t.cloud}"/>
  <circle cx="-4" cy="0.5" r="0.9" fill="#2B2B2B"/>
  <circle cx="3" cy="0.5" r="0.9" fill="#2B2B2B"/>
  <path d="M-1.8 2.2 Q-0.5 3.4 0.8 2.2" stroke="#2B2B2B" stroke-width="0.7" stroke-linecap="round" fill="none"/>
</symbol>`;
}

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
  light: { file: 'bunny-contribution-graph.svg', empty: '#EBEDF0', fur: '#FFFFFF', line: '#9AA0A6', text: '#57606A', dirt: '#9C6B43', dirtLight: '#B98A5E', hollow: '#4A2F1C', cloud: '#CFE3F2' },
  dark: { file: 'bunny-contribution-graph-dark.svg', empty: '#161B22', fur: '#F5F5F5', line: '#F5F5F5', text: '#8B949E', dirt: '#7A5232', dirtLight: '#96694A', hollow: '#24160C', cloud: '#DCE6EF' },
};

// ---------- 3. Animación ----------

function build(weeks, total, t) {
  const cols = weeks.length;
  const W = PAD_X * 2 + cols * CELL;
  const H = PAD_TOP + 7 * CELL + PAD_BOTTOM;
  const center = (c, r) => [PAD_X + c * CELL + BOX / 2, PAD_TOP + r * CELL + BOX / 2];

  // Zanahorias en orden cronológico
  const carrots = [];
  weeks.forEach((days, c) => days.forEach(d => { if (d.level > 0) carrots.push({ c, r: d.weekday, level: d.level }); }));

  // Línea de tiempo en segundos
  // Lo que tarda en comer: se acorta si hay muchas zanahorias, para que la vuelta no sea eterna
  const EAT = Math.max(0.3, Math.min(0.4, 90 / carrots.length - 0.45));
  const PICK = 0.09;  // lo que tarda en sacar la zanahoria de la tierra
  const CHEWS = 3;    // mordiscos por zanahoria
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
  // Apenas termina la última zanahoria entra la nube: riega cada pozo y vuelven a crecer
  const CLOUD_Y = 18;
  const CLOUD_FROM = -24;           // ya asomando por el borde, para que se vea enseguida
  const CLOUD_TO = W + 24;
  const RAIN_START = eats.length ? eats[eats.length - 1].end : exitT;
  const RAIN = 4.5;
  const loop = RAIN_START + RAIN + 2; // pausa antes de repetir
  const pct = (s) => ((s / loop) * 100).toFixed(3);
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
  let drops = '';
  carrots.forEach((k, i) => {
    const [cx, cy] = center(k.c, k.r);
    const s = scale[k.level];
    const e = eats[i];
    const release = RAIN_START + ((cx - CLOUD_FROM) / (CLOUD_TO - CLOUD_FROM)) * RAIN; // la nube pasa por esta columna
    const land = release + (cy - CLOUD_Y - 8) / 230;             // la gota llega al pozo
    const grow = land + 0.25;
    carrotCss += `@keyframes k${i}{0%,${pct(e.start)}%{transform:scale(1)}${pct(e.start + PICK)}%,${pct(grow)}%{transform:scale(0)}${pct(grow + 0.3)}%{transform:scale(1.15)}${pct(grow + 0.45)}%,100%{transform:scale(1)}}.k${i}{animation:k${i} ${loop.toFixed(2)}s linear infinite}`;
    carrotCss += `@keyframes h${i}{0%,${pct(e.start)}%{opacity:0}${pct(e.start + PICK)}%,${pct(grow + 0.2)}%{opacity:1}${pct(grow + 0.45)}%,100%{opacity:0}}.h${i}{animation:h${i} ${loop.toFixed(2)}s linear infinite}`;
    carrotCss += `@keyframes d${i}{0%,${pct(release)}%{opacity:0;transform:translate(${cx}px,${CLOUD_Y + 8}px)}${pct(release + 0.01)}%{opacity:1;transform:translate(${cx}px,${CLOUD_Y + 8}px);animation-timing-function:ease-in}${pct(land)}%{opacity:1;transform:translate(${cx}px,${cy}px)}${pct(land + 0.01)}%,100%{opacity:0;transform:translate(${cx}px,${cy}px)}}.d${i}{animation:d${i} ${loop.toFixed(2)}s linear infinite}`;
    drops += `<use href="#drop" x="-3" y="-4" width="6" height="8" class="d${i}" opacity="0"/>`;
    // Pozo de tierra que queda cuando el conejo se lleva la zanahoria
    carrotEls += `<g class="h${i}" opacity="0"><rect x="${PAD_X + k.c * CELL}" y="${PAD_TOP + k.r * CELL}" width="${BOX}" height="${BOX}" rx="2" fill="${t.empty}"/><use href="#hole" x="${cx - 6}" y="${cy - 6}" width="12" height="12"/></g>`;
    carrotEls += `<g transform="translate(${cx} ${cy}) scale(${s})"><use href="#carrot" x="-6" y="-8" width="12" height="16" class="c k${i}"/></g>`;
  });

  // Comer: la zanahoria aparece en las patas, se achica y el conejo mordisquea
  let held = '0%,100%{opacity:0}';
  let heldBite = '';
  let nom = '0%,100%{transform:none}';
  for (const e of eats) {
    held += `${pct(e.start - 0.01)}%{opacity:0}${pct(e.start)}%,${pct(e.end)}%{opacity:1}${pct(e.end + 0.01)}%{opacity:0}`;
    heldBite += `${pct(e.start)}%{transform:scale(1)}${pct(e.end)}%{transform:scale(.2)}`;
    for (let j = 0; j < CHEWS; j++) {
      const bite = EAT / CHEWS;
      nom += `${pct(e.start + j * bite)}%{transform:none}${pct(e.start + (j + 0.5) * bite)}%{transform:rotate(6deg) scaleY(.95)}`;
    }
    nom += `${pct(e.end)}%{transform:none}`;
  }
  const heldEl = `<g class="held" opacity="0"><g transform="translate(15 -11) rotate(70)"><use href="#carrot" x="-4.5" y="-6" width="9" height="12" class="heldBite"/></g><ellipse cx="11.5" cy="-7.5" rx="2.4" ry="1.7" fill="${t.fur}" stroke="${t.line}" stroke-width="0.5"/></g>`;

  // Fondo de cuadraditos
  let grid = '';
  weeks.forEach((days, c) => days.forEach(d => {
    if (d.level > 0) return; // los días con zanahoria no llevan cuadradito
    const x = PAD_X + c * CELL, y = PAD_TOP + d.weekday * CELL;
    grid += `<rect x="${x}" y="${y}" width="${BOX}" height="${BOX}" rx="2" fill="${t.empty}"/>`;
  }));

  const label = `${total} ${total === 1 ? 'contribution' : 'contributions'} in the last year`;
  const font = 'font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="11"';

  // Meses (y el año en el primero y en enero), como el calendario de GitHub
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
    const txt = (m === 0 || months === '') ? `${MONTHS[m]} ${dt.getUTCFullYear()}` : MONTHS[m];
    if (x < lastX) return; // no pisar el texto anterior
    lastX = x + txt.length * 5.8 + 4;
    months += `<text x="${x}" y="${PAD_TOP - 8}" ${font} fill="${t.text}">${txt}</text>`;
  });

  // Días de la semana
  const dias = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]
    .map(([r, n]) => `<text x="${PAD_X - 8}" y="${PAD_TOP + r * CELL + 9}" text-anchor="end" ${font} fill="${t.text}">${n}</text>`).join('');

  // Barra de progreso de la vuelta completa, entre el calendario y el texto
  const barW = cols * CELL - (CELL - BOX);
  const barY = H - PAD_BOTTOM + 4;
  const bar = `<rect x="${PAD_X}" y="${barY}" width="${barW}" height="4" rx="2" fill="${t.empty}"/><rect x="${PAD_X}" y="${barY}" width="${barW}" height="4" rx="2" fill="#F08A24" class="bar"/>`;

  // Leyenda: Menos 🥕 Más
  const lx = W - PAD_X - 5 * 16 - 30;
  let legend = `<text x="${lx - 6}" y="${H - 9}" text-anchor="end" ${font} fill="${t.text}">Less</text>`;
  [1, 2, 3, 4].forEach((lv, i) => {
    legend += `<g transform="translate(${lx + 8 + i * 16} ${H - 13}) scale(${scale[lv]})"><use href="#carrot" x="-6" y="-8" width="12" height="16"/></g>`;
  });
  legend += `<text x="${lx + 8 + 4 * 16 - 2}" y="${H - 9}" ${font} fill="${t.text}">More</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${carrotSymbol}${holeSymbol(t)}${dropSymbol}${cloudSymbol(t)}${bunnySymbol(t)}</defs>
<style>
.c{transform-box:fill-box;transform-origin:50% 60%}
.b{animation:hop ${loop.toFixed(2)}s infinite}
@keyframes hop{${kf}}
.ears{transform-box:fill-box;transform-origin:50% 100%;animation:ear 1.6s ease-in-out infinite}
@keyframes ear{0%,80%,100%{transform:rotate(0)}88%{transform:rotate(-10deg)}94%{transform:rotate(6deg)}}
.held{animation:held ${loop.toFixed(2)}s linear infinite}
@keyframes held{${held}}
.heldBite{transform-box:fill-box;transform-origin:50% 0;animation:heldBite ${loop.toFixed(2)}s linear infinite}
@keyframes heldBite{${heldBite}}
.nom{transform-box:fill-box;transform-origin:50% 100%;animation:nom ${loop.toFixed(2)}s linear infinite}
@keyframes nom{${nom}}
.bar{transform-box:fill-box;transform-origin:0 50%;animation:bar ${loop.toFixed(2)}s linear infinite}
@keyframes bar{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
.cloud{animation:cloud ${loop.toFixed(2)}s linear infinite}
@keyframes cloud{0%,${pct(RAIN_START)}%{transform:translate(${CLOUD_FROM}px,${CLOUD_Y}px)}${pct(RAIN_START + RAIN)}%,100%{transform:translate(${CLOUD_TO}px,${CLOUD_Y}px)}}
.puff{transform-box:fill-box;transform-origin:50% 50%;animation:puff 1.4s ease-in-out infinite}
@keyframes puff{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
${carrotCss}
</style>
${months}
${dias}
${grid}
${carrotEls}
${drops}
<g class="cloud"><use href="#cloud" x="-20" y="-12" width="40" height="24" class="puff"/></g>
<g class="b"><g class="nom"><use href="#bunny" x="-16" y="-32" width="32" height="34.7"/>${heldEl}</g></g>
<text x="${PAD_X}" y="${H - 9}" ${font} fill="${t.text}">${label}</text>
${legend}
${bar}
</svg>`;
}

// ---------- 4. Main ----------

const { weeks, total } = USER && TOKEN ? await fetchWeeks() : fakeWeeks();
mkdirSync(OUT, { recursive: true });
for (const t of Object.values(THEMES)) {
  writeFileSync(`${OUT}/${t.file}`, build(weeks, total, t));
  console.log('Generado', `${OUT}/${t.file}`);
}
