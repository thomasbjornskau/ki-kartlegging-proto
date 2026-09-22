/* KI-anvendelser i SSB – prototype v0.3
   All geometri og alle tall i løpende tekst beregnes fra data.json.
   Ingen koordinater ligger i datafilen. */

'use strict';

const NS = 'http://www.w3.org/2000/svg';

/* ---------- fast geometri ---------- */

const CX = 340, CY = 300;
const R_YTRE = 235;
const BAND_INN = 246, BAND_UT = 268;
const MAKS_SEKSJONSBREDDE = 7.6;   // grader
const SEKTOR_NYTTE = 42;           // grader av 45 som seksjonene kan bruke

// Sektorgrensene ligger på 0, 45, 90 ... grader, slik at den vannrette
// aksen skiller fag og forskning (over) fra støttefunksjoner (under).
const RETNING = { 500: 22.5, 400: 67.5, 300: 112.5, 200: 157.5,
                  100: 202.5, 800: 247.5, 700: 292.5, 600: 337.5 };

const SONER = { forbudt: [0, 52], hoyrisiko: [52, 112],
                begrenset: [112, 172], minimal: [172, R_YTRE] };

const FARGE = { forbudt: '#c0392b', hoyrisiko: '#e08a1e',
                begrenset: '#5c8f2a', minimal: '#9ec46a' };
const FLATE = { forbudt: .30, hoyrisiko: .26, begrenset: .15, minimal: .09 };

const SSB = { mork: '#274247', mellom: '#C3DCDC', lys: '#F0F8F9' };

const KATEGORI_KORT = { forbudt: 'Forbudt', hoyrisiko: 'Høyrisiko', begrenset: 'Begrenset',
                        minimal: 'Minimal', uavklart: 'Ikke plassert' };

/* ---------- visningsnavn for kodeverdier ---------- */

const KLASSE = { mote: 'Møte- og referatstøtte',
                 publikasjon: 'Publiseringsnært innhold',
                 analyse: 'Analysestøtte' };

const FASE = { drift: 'I drift', eksperiment: 'Eksperiment', planlagt: 'Planlagt',
               test: 'Test', ide: 'Idé', tilgjengelig: 'Tilgjengelig, bruk ukjent' };
const NYE = ['ide', 'planlagt', 'eksperiment', 'test'];

const STATUS = { foreloepig: 'Foreløpig vurdert', ikke_vurdert: 'Ikke vurdert',
                 formaal_mangler: 'Formål mangler', maa_avklares: 'Må avklares',
                 mulig_hoyrisiko: 'Mulig høyrisiko', kandidat: 'Høyrisikokandidat',
                 avklart: 'Avklart' };

const ROLLE = { idriftsetter: 'Idriftsetter', leverandoer: 'Leverandør',
                uavklart: 'Rolle ikke avklart' };

const GRUNNLAG = { runde1: 'Første innsamlingsrunde', runde2: 'Ny innsamlingsrunde' };

// Viser koden selv hvis en verdi mangler i tabellen, i stedet for «undefined»
const navn = (tabell, kode) => tabell[kode] || kode || '–';

/* ---------- hjelpefunksjoner ---------- */

const K = Math.cos(Math.PI * 22.5 / 180);
const kant = (r, g) => { const t = ((g + 22.5) % 45 + 45) % 45 - 22.5;
                         return r * K / Math.cos(Math.PI * t / 180); };
const pkt = (g, r) => [CX + r * Math.cos(Math.PI * g / 180), CY - r * Math.sin(Math.PI * g / 180)];
const f1 = v => v.toFixed(1);
const attekant = r => { const p = []; for (let i = 0; i < 8; i++) p.push(pkt(i * 45, r).map(f1).join(','));
                        return p.join(' '); };

function el(n, a, forelder) {
  const e = document.createElementNS(NS, n);
  for (const k in (a || {})) e.setAttribute(k, a[k]);
  if (forelder) forelder.appendChild(e);
  return e;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bandsti(a1, a2) {
  const p1 = pkt(a1, BAND_INN), p2 = pkt(a2, BAND_INN), p3 = pkt(a2, BAND_UT), p4 = pkt(a1, BAND_UT);
  return `M${f1(p1[0])},${f1(p1[1])} A${BAND_INN},${BAND_INN} 0 0 0 ${f1(p2[0])},${f1(p2[1])}` +
         ` L${f1(p3[0])},${f1(p3[1])} A${BAND_UT},${BAND_UT} 0 0 1 ${f1(p4[0])},${f1(p4[1])} Z`;
}

/* ---------- tilstand ---------- */

let DATA;
const sv = {};      // seksjon -> midtvinkel
const sb = {};      // seksjon -> vinkelbredde
const pos = {};     // anvendelse -> {x, y}
let valgt = null;
const sortering = { felt: 'id', opp: true };
const filt = { sok: '', avdeling: 'alle', kategori: 'alle', fase: 'alle', generell: true };

const MND = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august',
             'september', 'oktober', 'november', 'desember'];
const dato = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d}. ${MND[m - 1]} ${y}`; };
const liste = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' og ' + xs[xs.length - 1];

/* ---------- oppstart ---------- */

if (window.DATA) {
  DATA = window.DATA; start();
} else {
  fetch('data.json')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => { DATA = d; start(); })
    .catch(() => { document.getElementById('feil').hidden = false; });
}

function start() {
  beregnVinkler();
  beregnPosisjoner();
  skrivTall();
  tegnFigur();
  tegnAkseOgSymboler();
  skrivOppsummering();
  tegnUplassert();
  fyllFiltre();
  koblingerOgLyttere();
  oppdater();
}

/* ---------- geometri ---------- */

function beregnVinkler() {
  const perAvd = {};
  DATA.seksjoner.forEach(s => { (perAvd[s.avdeling] = perAvd[s.avdeling] || []).push(s.kode); });
  Object.keys(perAvd).forEach(avd => {
    const koder = perAvd[avd].sort((a, b) => a - b);
    const n = koder.length;
    // Seksjonsbredden krymper når en avdeling har mange seksjoner,
    // slik at ingen seksjon havner i nabosektoren.
    const bredde = Math.min(MAKS_SEKSJONSBREDDE, SEKTOR_NYTTE / n);
    koder.forEach((kode, i) => {
      sv[kode] = RETNING[avd] + (i - (n - 1) / 2) * bredde;
      sb[kode] = bredde;
    });
  });
}

function beregnPosisjoner() {
  const grupper = {};
  DATA.anvendelser.forEach(a => {
    if (a.type !== 'spesifikk' || a.risikokategori === 'uavklart') return;
    const n = a.seksjon + '|' + a.risikokategori;
    (grupper[n] = grupper[n] || []).push(a);
  });
  Object.values(grupper).forEach(g => {
    const m = g.length;
    g.forEach((a, i) => {
      const grad = sv[a.seksjon] + (m === 1 ? 0 : (i / (m - 1) - .5) * sb[a.seksjon] * .8);
      const [lo, hi] = SONER[a.risikokategori];
      const rI = kant(lo, grad), rU = kant(hi, grad);
      // Trinnvis forskyvning slik at punkter ikke dekker hverandre.
      // Forskyvningen er visuell og har ingen faglig betydning.
      const andel = m === 1 ? (a.seksjon % 2 ? .40 : .60) : .30 + (i % 3) * .20;
      const [x, y] = pkt(grad, rI + (rU - rI) * andel);
      pos[a.id] = { x, y };
    });
  });
}

/* ---------- tall i løpende tekst ---------- */

function skrivTall() {
  const levert = DATA.seksjoner.filter(s => s.dekning === 'levert');
  const ikke = DATA.seksjoner.filter(s => s.dekning === 'ikke_levert');
  const uspurt = DATA.avdelinger.filter(a => a.dekning === 'ikke_forespurt');

  const meta = [
    ['Registrerte anvendelser', DATA.anvendelser.length],
    ['Seksjoner som har levert', `${levert.length} av ${DATA.seksjoner.length}`],
    ['Registeret oppdatert', dato(DATA.metadata.sist_oppdatert)],
  ];
  document.getElementById('meta').innerHTML =
    meta.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join('');
  document.getElementById('kilde-dato').textContent = 'registerversjon ' + dato(DATA.metadata.sist_oppdatert);
  document.getElementById('forbehold').textContent = DATA.metadata.forbehold;

  const deler = [];
  if (uspurt.length) deler.push(uspurt.map(a => a.navn).join(' og ') + ' er ikke forespurt.');
  if (ikke.length) deler.push(`${ikke.length} seksjoner har ikke levert: ${ikke.map(s => s.kode).join(', ')}. De er skravert i båndet.`);
  document.getElementById('dekning-tekst').textContent = deler.join(' ');

  // hovedfunn: tallene regnes ut, teksten er skrevet for hånd
  const A = DATA.anvendelser;
  const tall = {
    totalt: A.length,
    hoyrisiko: A.filter(a => a.risikokategori === 'hoyrisiko').length,
    generell: A.filter(a => a.type === 'generell').length,
    uavklart: A.filter(a => a.risikokategori === 'uavklart').length,
    levert: levert.length,
    seksjoner: DATA.seksjoner.length,
  };
  document.querySelectorAll('[data-tall]').forEach(e => { e.textContent = tall[e.dataset.tall]; });

  // Varsle hvis dataene er nyere enn tolkningen
  const tolkning = document.getElementById('funn').dataset.tolkning;
  document.getElementById('rapport-avvik').hidden = !(DATA.metadata.sist_oppdatert > tolkning);
}

/* ---------- figur ---------- */

function tegnFigur() {
  const svg = document.getElementById('figur');
  const defs = el('defs', {}, svg);
  const pat = el('pattern', { id: 'skravur', width: 7, height: 7, patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M0,7 L7,0', stroke: SSB.mork, 'stroke-width': .6, opacity: .45, fill: 'none' }, pat);

  const gS = el('g', {}, svg), gR = el('g', {}, svg), gB = el('g', {}, svg),
        gE = el('g', {}, svg), gP = el('g', { id: 'punkter' }, svg);

  // risikosoner
  ['minimal', 'begrenset', 'hoyrisiko', 'forbudt'].forEach(k => {
    const [lo, hi] = SONER[k];
    if (lo === 0) el('polygon', { points: attekant(hi), fill: FARGE[k], opacity: FLATE[k] }, gS);
    else el('path', { d: 'M' + attekant(hi).replace(/ /g, ' L') + ' Z M' + attekant(lo).replace(/ /g, ' L') + ' Z',
                      'fill-rule': 'evenodd', fill: FARGE[k], opacity: FLATE[k] }, gS);
  });

  // avdelinger som ikke er forespurt
  DATA.avdelinger.filter(a => a.dekning === 'ikke_forespurt').forEach(a => {
    const g = RETNING[a.kode];
    const p1 = pkt(g - 22.5, kant(R_YTRE, g - 22.5)), p2 = pkt(g + 22.5, kant(R_YTRE, g + 22.5));
    const d = `M${CX},${CY} L${f1(p1[0])},${f1(p1[1])} L${f1(p2[0])},${f1(p2[1])} Z`;
    el('path', { d, fill: '#ffffff', opacity: .9 }, gR);
    el('path', { d, fill: 'url(#skravur)' }, gR);
    el('path', { d: bandsti(g - 20, g + 20), fill: 'url(#skravur)', stroke: SSB.mellom, 'stroke-width': .8 }, gB);
  });

  // raster
  Object.values(SONER).forEach(([, hi]) =>
    el('polygon', { points: attekant(hi), fill: 'none', stroke: SSB.mellom, 'stroke-width': .8 }, gR));
  el('polygon', { points: attekant(R_YTRE), fill: 'none', stroke: SSB.mork, 'stroke-width': 1 }, gR);
  for (let i = 0; i < 8; i++) {
    const [x, y] = pkt(i * 45, kant(R_YTRE, i * 45));
    el('line', { x1: CX, y1: CY, x2: f1(x), y2: f1(y), stroke: SSB.mellom, 'stroke-width': .8 }, gR);
  }
  el('line', { x1: CX - 278, y1: CY, x2: CX + 372, y2: CY, stroke: SSB.mork,
               'stroke-width': .8, 'stroke-dasharray': '4 4' }, gR);

  // bandet: én celle per seksjon
  DATA.seksjoner.forEach(s => {
    const g = sv[s.kode], b = sb[s.kode];
    const ikkeLevert = s.dekning === 'ikke_levert';
    const celle = el('path', { d: bandsti(g - b / 2 + .4, g + b / 2 - .4),
                               class: 'band-celle' + (ikkeLevert ? ' ikke-levert' : ''),
                               'data-seksjon': s.kode }, gB);
    const tekst = ikkeLevert
      ? `<b>Seksjon ${s.kode}</b><br><span>Har ikke levert</span>`
      : `<b>Seksjon ${s.kode}</b><br><span>Alminnelig assistentbruk</span>`;
    celle.addEventListener('mousemove', e => visTips(e, tekst));
    celle.addEventListener('mouseleave', skjulTips);
    // Båndcellene kan også velges, slik at innholdet ikke bare finnes på hover
    celle.setAttribute('tabindex', 0);
    celle.setAttribute('role', 'button');
    celle.setAttribute('aria-label', ikkeLevert ? `Seksjon ${s.kode}, har ikke levert` : `Seksjon ${s.kode}, alminnelig assistentbruk`);
    celle.addEventListener('click', () => velgSeksjon(s.kode));
    celle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); velgSeksjon(s.kode); } });

    const [lx, ly] = pkt(g, BAND_UT + 11);
    el('text', { x: f1(lx), y: f1(ly + 3), 'text-anchor': 'middle',
                 class: 'seksjon-etikett' + (ikkeLevert ? ' ikke-levert' : '') }, gB).textContent = s.kode;

    if (ikkeLevert) return;

    // samle klasser fra alle poster med alminnelig bruk i seksjonen
    const rekkefolge = Object.keys(KLASSE);
    const kl = [...new Set(DATA.anvendelser
      .filter(a => a.seksjon === s.kode && a.type === 'generell')
      .flatMap(a => a.generell_klasser || []))]
      .sort((x, y) => rekkefolge.indexOf(x) - rekkefolge.indexOf(y));
    const avstand = Math.min(2.6, (b - 2.2) / Math.max(1, kl.length - 1));
    kl.forEach((k, j) => {
      const [sx, sy] = pkt(g + (j - (kl.length - 1) / 2) * avstand, (BAND_INN + BAND_UT) / 2);
      symbol(gB, k, sx, sy);
    });
  });

  // avdelingsetiketter utenfor båndet, slik at de ikke konkurrerer med punktene
  DATA.avdelinger.forEach(a => {
    const [x, y] = pkt(RETNING[a.kode], 326);
    el('text', { x: f1(x), y: f1(y + 5), 'text-anchor': 'middle', class: 'sektor-etikett' }, gE).textContent = 'Avd. ' + a.kode;
    if (a.dekning === 'ikke_forespurt')
      el('text', { x: f1(x), y: f1(y + 20), 'text-anchor': 'middle', class: 'akse-etikett' }, gE).textContent = 'ikke forespurt';
  });
  // aksen som skiller fag fra støtte, merket til høyre der det er ledig
  el('text', { x: CX + 372, y: CY - 7, 'text-anchor': 'end', class: 'akse-etikett' }, gE).textContent = 'fag og forskning';
  el('text', { x: CX + 372, y: CY + 16, 'text-anchor': 'end', class: 'akse-etikett' }, gE).textContent = 'støttefunksjoner';

  // punkter
  DATA.anvendelser.forEach(a => {
    const p = pos[a.id];
    if (!p) return;
    const kat = DATA.risikokategorier.find(k => k.kode === a.risikokategori);
    const g = el('g', { class: 'punkt', 'data-id': a.id, tabindex: 0, role: 'button',
                        'aria-label': `${a.navn}. ${kat.navn}. ${navn(STATUS, a.vurderingsstatus)}. Seksjon ${a.seksjon}.` }, gP);
    const avklart = a.vurderingsstatus === 'avklart';
    // usynlig, større treffområde for mus og touch
    el('circle', { cx: f1(p.x), cy: f1(p.y), r: 10, class: 'treff' }, g);
    el('circle', { cx: f1(p.x), cy: f1(p.y), r: 5.5, class: 'synlig',
                   fill: avklart ? FARGE[a.risikokategori] : '#fff',
                   stroke: FARGE[a.risikokategori], 'stroke-width': avklart ? 0 : 2.4 }, g);
    const tekst = `<b>${esc(a.navn)}</b><br><span>${esc(KATEGORI_KORT[a.risikokategori])}, ${esc(navn(STATUS, a.vurderingsstatus).toLowerCase())}, seksjon ${a.seksjon}</span>`;
    g.addEventListener('mousemove', e => visTips(e, tekst));
    g.addEventListener('mouseleave', skjulTips);
    g.addEventListener('click', () => velg(a.id));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); velg(a.id); } });
  });
}

/* Egen tooltip. SVG-elementene har bevisst ingen <title>, fordi nettleserens
   innebygde tooltip ellers legger seg over denne. */
function visTips(e, html) {
  const tips = document.getElementById('tips');
  tips.innerHTML = html;
  tips.style.display = 'block';
  const b = tips.offsetWidth || 230, hgt = tips.offsetHeight || 40;
  const x = e.clientX + 14 + b > innerWidth ? e.clientX - b - 10 : e.clientX + 14;
  const y = e.clientY + 16 + hgt > innerHeight ? e.clientY - hgt - 10 : e.clientY + 16;
  tips.style.left = x + 'px';
  tips.style.top = y + 'px';
}
function skjulTips() { document.getElementById('tips').style.display = 'none'; }

function symbol(f, k, x, y) {
  if (k === 'mote') {
    el('rect', { x: f1(x - 4), y: f1(y - 4), width: 8, height: 8, class: 'band-symbol' }, f);
  } else if (k === 'publikasjon') {
    el('polygon', { points: `${f1(x)},${f1(y - 4.8)} ${f1(x - 4.4)},${f1(y + 3.4)} ${f1(x + 4.4)},${f1(y + 3.4)}`,
                    class: 'band-symbol' }, f);
  } else {
    el('line', { x1: f1(x - 4.4), y1: f1(y), x2: f1(x + 4.4), y2: f1(y), class: 'band-symbol', 'stroke-width': 2 }, f);
    el('line', { x1: f1(x), y1: f1(y - 4.4), x2: f1(x), y2: f1(y + 4.4), class: 'band-symbol', 'stroke-width': 2 }, f);
  }
}

function tegnAkseOgSymboler() {
  // Sonene forklares som en akse fra sentrum og ut, ikke som en fargelegende
  document.getElementById('akse').innerHTML =
    ['forbudt', 'hoyrisiko', 'begrenset', 'minimal']
      .map(k => `<div class="${k}">${KATEGORI_KORT[k]}</div>`).join('') ;
  document.getElementById('akse').insertAdjacentHTML('afterend',
    '<p class="akse-tittel">Fra sentrum og ut: AI Act-kategori</p>');

  const ikon = inner => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
  const s = '#274247';
  document.getElementById('symboler').innerHTML = [
    [ikon(`<circle cx="8" cy="8" r="5" fill="#fff" stroke="${s}" stroke-width="2.2"/>`), 'Egen anvendelse, foreløpig vurdert'],
    [ikon(`<rect x="1" y="4" width="14" height="8" fill="${SSB.lys}" stroke="${SSB.mellom}"/>`), 'Seksjon med alminnelig assistentbruk'],
    [ikon(`<rect x="4" y="4" width="8" height="8" fill="none" stroke="${s}" stroke-width="1.5"/>`), 'Møte- og referatstøtte'],
    [ikon(`<polygon points="8,3 3.2,12 12.8,12" fill="none" stroke="${s}" stroke-width="1.5"/>`), 'Publiseringsnært innhold'],
    [ikon(`<line x1="3" y1="8" x2="13" y2="8" stroke="${s}" stroke-width="2"/><line x1="8" y1="3" x2="8" y2="13" stroke="${s}" stroke-width="2"/>`), 'Analysestøtte'],
    [ikon(`<defs><pattern id="skr-tf" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0,4 L4,0" stroke="${s}" stroke-width=".7" opacity=".6"/></pattern></defs><rect x="1" y="4" width="14" height="8" fill="url(#skr-tf)" stroke="${SSB.mellom}"/>`), 'Ikke levert eller ikke forespurt'],
  ].map(([i, t]) => `<span>${i}${t}</span>`).join('');
}

/* Tekstlig forklaring av hva figuren viser, regnet ut fra data */
function skrivOppsummering() {
  const A = DATA.anvendelser;
  const egne = A.filter(a => a.type === 'spesifikk' && a.risikokategori !== 'uavklart');
  const tell = k => egne.filter(a => a.risikokategori === k).length;
  const hoy = egne.filter(a => a.risikokategori === 'hoyrisiko');
  const hoyAvd = [...new Set(hoy.map(a => a.avdeling))].sort();
  const iFag = hoy.filter(a => DATA.avdelinger.find(x => x.kode === a.avdeling).gruppe === 'fag').length;
  const uavkl = A.filter(a => a.risikokategori === 'uavklart').length;
  const gen = A.filter(a => a.type === 'generell').length;

  const deler = [
    `Figuren viser ${egne.length} egne anvendelser som punkter og ${gen} poster med alminnelig assistentbruk i båndet.`,
    tell('forbudt') ? `${tell('forbudt')} ligger i forbudt sone.` : 'Ingen er plassert i forbudt sone.',
    hoy.length
      ? `${hoy.length} ligger i høyrisikosonen, ${hoyAvd.length === 1 ? 'i avdeling ' + hoyAvd[0] : 'fordelt på avdeling ' + liste(hoyAvd.map(String))}` +
        (iFag ? `, hvorav ${iFag} i fag- eller forskningsavdelingene.` : ', alle i støttefunksjonene.')
      : 'Ingen ligger i høyrisikosonen.',
    `Av de øvrige egne anvendelsene er ${tell('begrenset')} plassert som begrenset risiko og ${tell('minimal')} som minimal risiko.`,
    uavkl ? `${uavkl} er ikke plassert, og står i listen ved siden av figuren.` : '',
  ];
  document.getElementById('figur-oppsummering').textContent = deler.filter(Boolean).join(' ');
}

function tegnUplassert() {
  const upl = DATA.anvendelser.filter(a => a.risikokategori === 'uavklart');
  const boks = document.getElementById('uplassert');
  boks.innerHTML = upl.length
    ? '<p class="notat" style="margin:0 0 12px">Formål eller rolle er ikke avklart nok til at disse kan plasseres i figuren.</p>' +
      upl.map(a => `<div style="margin-bottom:10px"><button type="button" data-id="${a.id}">${esc(a.navn)}</button>` +
                   `<div class="notat">${a.id}, seksjon ${a.seksjon}</div></div>`).join('')
    : '<p class="tom">Alle anvendelser er plassert.</p>';
  boks.querySelectorAll('button').forEach(b => b.addEventListener('click', () => velg(b.dataset.id, true)));
}

/* ---------- filtre ---------- */

function knappegruppe(id, valg, felt) {
  const boks = document.getElementById(id);
  boks.innerHTML = valg.map(([v, tekst, ekstra]) =>
    `<button type="button" data-verdi="${v}" aria-pressed="${filt[felt] === v}">${ekstra || ''}${tekst}</button>`).join('');
  boks.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    filt[felt] = b.dataset.verdi;
    boks.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    oppdater();
  }));
}

function fyllFiltre() {
  document.getElementById('f-avdeling').innerHTML = '<option value="alle">Alle avdelinger</option>' +
    DATA.avdelinger.filter(a => a.dekning !== 'ikke_forespurt')
      .map(a => `<option value="${a.kode}">${a.navn}</option>`).join('');

  const antall = k => DATA.anvendelser.filter(a => a.risikokategori === k).length;
  knappegruppe('f-kategori', [['alle', 'Alle']].concat(
    ['forbudt', 'hoyrisiko', 'begrenset', 'minimal', 'uavklart'].map(k =>
      [k, `${KATEGORI_KORT[k]} <span class="antall">${antall(k)}</span>`, `<span class="rute ${k}" aria-hidden="true"></span>`])),
    'kategori');

  knappegruppe('f-fase', [
    ['alle', 'Alle faser'],
    ['nye', 'Nye tiltak'],
    ['drift', 'I drift'],
    ['tilgjengelig', 'Tilgjengelig, bruk ukjent'],
  ], 'fase');
}

function passerer(a) {
  if (filt.avdeling !== 'alle' && String(a.avdeling) !== filt.avdeling) return false;
  if (filt.kategori !== 'alle' && a.risikokategori !== filt.kategori) return false;
  if (filt.fase === 'nye') { if (!NYE.includes(a.fase)) return false; }
  else if (filt.fase !== 'alle' && a.fase !== filt.fase) return false;
  if (!filt.generell && a.type === 'generell') return false;
  if (filt.sok) {
    const t = `${a.navn} ${a.beskrivelse} ${a.ansvarlig || ''} ${a.id}`.toLowerCase();
    if (!t.includes(filt.sok.toLowerCase())) return false;
  }
  return true;
}

function koblingerOgLyttere() {
  document.getElementById('f-avdeling').addEventListener('change', e => { filt.avdeling = e.target.value; oppdater(); });
  document.getElementById('f-sok').addEventListener('input', e => { filt.sok = e.target.value.trim(); oppdater(); });
  document.getElementById('f-generell').addEventListener('change', e => { filt.generell = e.target.checked; oppdater(); });
  document.getElementById('nullstill').addEventListener('click', () => {
    Object.assign(filt, { sok: '', avdeling: 'alle', kategori: 'alle', fase: 'alle', generell: true });
    document.getElementById('f-sok').value = '';
    document.getElementById('f-avdeling').value = 'alle';
    ['f-kategori', 'f-fase'].forEach(id => document.querySelectorAll(`#${id} button`)
      .forEach(b => b.setAttribute('aria-pressed', b.dataset.verdi === 'alle')));
    document.getElementById('f-generell').checked = true;
    velg(null); oppdater();
  });
  document.querySelectorAll('#tabell th button').forEach(knapp => knapp.addEventListener('click', () => {
    const f = knapp.dataset.felt;
    sortering.opp = sortering.felt === f ? !sortering.opp : true;
    sortering.felt = f;
    tabell();
  }));
}

function oppdater() {
  document.querySelectorAll('#punkter .punkt').forEach(g => {
    g.classList.toggle('dempet', !passerer(DATA.anvendelser.find(x => x.id === g.dataset.id)));
  });
  document.querySelectorAll('.band-celle').forEach(c => {
    const s = DATA.seksjoner.find(x => x.kode === Number(c.dataset.seksjon));
    const iAvd = filt.avdeling === 'alle' || String(s.avdeling) === filt.avdeling;
    c.classList.toggle('dempet', !(iAvd && filt.generell));
  });
  const synlig = DATA.anvendelser.filter(passerer).length;
  document.getElementById('utvalg').textContent = synlig === DATA.anvendelser.length
    ? `Viser alle ${synlig} anvendelser.`
    : `Viser ${synlig} av ${DATA.anvendelser.length} anvendelser. Resten er tonet ned i figuren.`;
  tabell();
}

/* ---------- tabell ---------- */

function tabell() {
  const rader = DATA.anvendelser.filter(passerer).slice();
  const f = sortering.felt, d = sortering.opp ? 1 : -1;
  rader.sort((a, b) => {
    const x = a[f] == null ? '' : a[f], y = b[f] == null ? '' : b[f];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * d;
    return String(x).localeCompare(String(y), 'nb') * d;
  });
  document.querySelectorAll('#tabell th').forEach(th => {
    th.removeAttribute('aria-sort');
    if (th.querySelector('button').dataset.felt === f) th.setAttribute('aria-sort', sortering.opp ? 'ascending' : 'descending');
  });
  document.querySelector('#tabell tbody').innerHTML = rader.map(a => {
    const k = DATA.risikokategorier.find(x => x.kode === a.risikokategori);
    return `<tr data-id="${a.id}" tabindex="0" class="${a.id === valgt ? 'valgt' : ''}">` +
      `<td class="id">${a.id}</td><td class="navn">${esc(a.navn)}</td>` +
      `<td>${a.seksjon}</td><td>${esc(a.beskrivelse)}</td>` +
      `<td><span class="kat"><span class="rute ${a.risikokategori}" aria-hidden="true"></span>${KATEGORI_KORT[a.risikokategori]}</span></td>` +
      `<td>${navn(FASE, a.fase)}</td>` +
      `<td>${a.ansvarlig ? esc(a.ansvarlig) : '<span style="color:#767c84">ikke oppgitt</span>'}</td></tr>`;
  }).join('');
  document.querySelectorAll('#tabell tbody tr').forEach(tr => {
    tr.addEventListener('click', () => velg(tr.dataset.id, true));
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); velg(tr.dataset.id, true); } });
  });
  const alle = DATA.anvendelser.length;
  document.getElementById('tabell-antall').textContent =
    rader.length === alle ? `${alle} anvendelser.` : `${rader.length} av ${alle} anvendelser, etter utvalget i oversiktsbildet.`;
}

/* ---------- detaljpanel ---------- */

function velg(id, visPanel) {
  valgt = id;
  document.querySelectorAll('.band-celle.valgt').forEach(c => c.classList.remove('valgt'));
  document.querySelectorAll('#punkter .punkt').forEach(g => g.classList.toggle('valgt', g.dataset.id === id));
  document.querySelectorAll('#tabell tbody tr').forEach(tr => tr.classList.toggle('valgt', tr.dataset.id === id));
  const boks = document.getElementById('detalj');
  if (!id) {
    boks.innerHTML = '<p class="tom">Velg et punkt i figuren eller en rad i registeret for å se detaljene.</p>';
    return;
  }
  const a = DATA.anvendelser.find(x => x.id === id);
  const k = DATA.risikokategorier.find(x => x.kode === a.risikokategori);
  const rad = (m, v) => v ? `<div><dt>${m}</dt><dd>${esc(v)}</dd></div>`
                          : `<div><dt>${m}</dt><dd class="mangler">ikke oppgitt</dd></div>`;
  boks.innerHTML = `<div class="detalj"><h3>${esc(a.navn)}</h3>` +
    `<div class="id">${a.id}, avdeling ${a.avdeling}, seksjon ${a.seksjon}</div>` +
    `<div class="merker"><span class="merke risiko"><span class="rute ${a.risikokategori}" aria-hidden="true"></span>${k.navn}</span>` +
    `<span class="merke">${navn(STATUS, a.vurderingsstatus)}</span>` +
    `<span class="merke">${navn(FASE, a.fase)}</span>` +
    `<span class="merke">${navn(ROLLE, a.ssb_rolle)}</span>` +
    (a.type === 'generell' ? '<span class="merke">Alminnelig assistentbruk</span>' : '') + '</div><dl>' +
    rad('Hva KI brukes til', a.beskrivelse) +
    `<div><dt>Hvorfor denne kategorien</dt><dd>${k.forklaring}</dd></div>` +
    rad('Ansvarlig', a.ansvarlig) +
    (a.maa_avklares ? `<div class="avklar"><dt>Må avklares</dt><dd>${esc(a.maa_avklares)}</dd></div>` : '') +
    (a.generell_klasser && a.generell_klasser.length
      ? `<div><dt>Klasser av alminnelig bruk</dt><dd>${a.generell_klasser.map(x => navn(KLASSE, x)).join(', ')}</dd></div>` : '') +
    `<div><dt>Datagrunnlag</dt><dd>${navn(GRUNNLAG, a.datagrunnlag)}</dd></div>` +
    '</dl></div>';

  // Fra tabellen eller listen: flytt blikket til panelet hvis det ikke er synlig
  if (visPanel) {
    const r = boks.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) {
      const rolig = matchMedia('(prefers-reduced-motion: reduce)').matches;
      boks.scrollIntoView({ behavior: rolig ? 'auto' : 'smooth', block: 'nearest' });
    }
    boks.focus({ preventScroll: true });
  }
}


/* Panel for en seksjon i båndet */
function velgSeksjon(kode) {
  valgt = null;
  document.querySelectorAll('#punkter .punkt').forEach(g => g.classList.remove('valgt'));
  document.querySelectorAll('#tabell tbody tr').forEach(tr => tr.classList.remove('valgt'));
  document.querySelectorAll('.band-celle').forEach(c => c.classList.toggle('valgt', Number(c.dataset.seksjon) === kode));
  const s = DATA.seksjoner.find(x => x.kode === kode);
  const poster = DATA.anvendelser.filter(a => a.seksjon === kode && a.type === 'generell');
  const boks = document.getElementById('detalj');
  if (s.dekning === 'ikke_levert') {
    boks.innerHTML = `<div class="detalj"><h3>Seksjon ${kode}</h3><div class="id">Avdeling ${s.avdeling}</div>` +
      '<p style="margin-top:12px">Seksjonen har ikke levert svar på kartleggingen. Feltet er skravert fordi bruken er ukjent, ikke fordi det ikke finnes KI-bruk.</p></div>';
  } else {
    boks.innerHTML = `<div class="detalj"><h3>Seksjon ${kode}: alminnelig assistentbruk</h3>` +
      `<div class="id">Avdeling ${s.avdeling}, ${poster.length} ${poster.length === 1 ? 'post' : 'poster'}</div><dl style="margin-top:14px">` +
      poster.map(a => `<div><dt>${a.id}, ${KATEGORI_KORT[a.risikokategori].toLowerCase()}</dt><dd><strong>${esc(a.navn)}.</strong> ${esc(a.beskrivelse)}</dd></div>`).join('') +
      '</dl></div>';
  }
}
