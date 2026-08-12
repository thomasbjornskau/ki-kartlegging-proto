/* KI-anvendelser i SSB - prototype
   All geometri beregnes fra data.json. Ingen posisjoner er lagret i datafilen. */

'use strict';

const NS = 'http://www.w3.org/2000/svg';

/* ---------- figurens faste geometri ---------- */

const CX = 340, CY = 300;
const R_YTRE = 235;                 // ytterkant av risikoflaten
const BAND_INN = 246, BAND_UT = 268; // bandet for alminnelig assistentbruk
const SEKSJON_BREDDE = 7.6;          // fast vinkelbredde per seksjon

// Retning per avdeling. Grensene mellom sektorene ligger pa 0, 45, 90 ... grader,
// slik at den vannrette aksen deler fag/forskning fra stottefunksjoner.
const RETNING = { 500: 22.5, 400: 67.5, 300: 112.5, 200: 157.5,
                  100: 202.5, 800: 247.5, 700: 292.5, 600: 337.5 };

// Radielle soner. Rekkefolgen er diskret, ikke en skala.
const SONER = {
  forbudt:   [0, 52],
  hoyrisiko: [52, 112],
  begrenset: [112, 172],
  minimal:   [172, R_YTRE]
};

const FARGE = {
  forbudt:   '#c0392b',
  hoyrisiko: '#e08a1e',
  begrenset: '#5c8f2a',
  minimal:   '#9ec46a'
};

const SONE_FLATE = {
  forbudt:   { fill: '#c0392b', opacity: 0.30 },
  hoyrisiko: { fill: '#e08a1e', opacity: 0.26 },
  begrenset: { fill: '#5c8f2a', opacity: 0.15 },
  minimal:   { fill: '#9ec46a', opacity: 0.09 }
};

const KLASSE_NAVN = {
  mote: 'Mote- og referatstotte',
  publikasjon: 'Publiseringsnaert innhold',
  analyse: 'Analysestotte'
};

const FASE_NAVN = {
  drift: 'I drift', eksperiment: 'Eksperiment', planlagt: 'Planlagt',
  test: 'Test', ide: 'Ide', tilgjengelig: 'Tilgjengelig, bruk ukjent',
  uavklart: 'Uavklart'
};

const STATUS_NAVN = {
  foreloepig: 'Forelopig vurdert',
  maa_avklares: 'Ma avklares',
  kandidat: 'Hoyrisikokandidat',
  avklart: 'Avklart'
};

const ROLLE_NAVN = {
  idriftsetter: 'Idriftsetter', leverandoer: 'Leverandor', uavklart: 'Rolle ikke avklart'
};

/* ---------- hjelpefunksjoner ---------- */

const K = Math.cos(Math.PI * 22.5 / 180);

// Radius til attekantens kant i en gitt retning
function kant(r, grader) {
  const t = ((grader + 22.5) % 45 + 45) % 45 - 22.5;
  return r * K / Math.cos(Math.PI * t / 180);
}

function punkt(grader, radius) {
  const a = Math.PI * grader / 180;
  return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)];
}

function attekant(r) {
  const p = [];
  for (let i = 0; i < 8; i++) p.push(punkt(i * 45, r).map(v => v.toFixed(1)).join(','));
  return p.join(' ');
}

function el(navn, attributter, forelder) {
  const e = document.createElementNS(NS, navn);
  for (const [k, v] of Object.entries(attributter || {})) e.setAttribute(k, v);
  if (forelder) forelder.appendChild(e);
  return e;
}

// Deterministisk forskyvning, slik at samme post havner samme sted hver gang.
// Forskyvningen har ingen faglig betydning.
function fro(tekst) {
  let h = 0;
  for (let i = 0; i < tekst.length; i++) h = (h * 31 + tekst.charCodeAt(i)) % 1000;
  return h / 1000;
}

/* ---------- tilstand ---------- */

let DATA = null;
let seksjonsvinkel = {};   // seksjonskode -> midtvinkel
let posisjon = {};         // anvendelses-id -> {x, y}
let valgt = null;
let sortering = { felt: 'id', stigende: true };

const filter = { avdeling: 'alle', kategori: 'alle', generell: true };

/* ---------- oppstart ---------- */

fetch('data.json')
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(d => { DATA = d; start(); })
  .catch(() => { document.getElementById('feil').hidden = false; });

function start() {
  document.getElementById('app').hidden = false;
  document.getElementById('undertittel').textContent =
    DATA.anvendelser.length + ' registrerte anvendelser \u00b7 versjon ' +
    DATA.metadata.versjon + ' \u00b7 oppdatert ' + DATA.metadata.sist_oppdatert;
  document.getElementById('forbehold').textContent = DATA.metadata.forbehold;

  beregnVinkler();
  beregnPosisjoner();
  fyllFiltre();
  tegnFigur();
  tegnTegnforklaring();
  tegnUplassert();
  oppdater();

  document.getElementById('f-avdeling').addEventListener('change', e => {
    filter.avdeling = e.target.value; oppdater();
  });
  document.getElementById('f-kategori').addEventListener('change', e => {
    filter.kategori = e.target.value; oppdater();
  });
  document.getElementById('f-generell').addEventListener('change', e => {
    filter.generell = e.target.checked; oppdater();
  });
  document.getElementById('nullstill').addEventListener('click', () => {
    filter.avdeling = 'alle'; filter.kategori = 'alle'; filter.generell = true;
    document.getElementById('f-avdeling').value = 'alle';
    document.getElementById('f-kategori').value = 'alle';
    document.getElementById('f-generell').checked = true;
    velg(null); oppdater();
  });

  document.querySelectorAll('#tabell th').forEach(th => {
    th.addEventListener('click', () => {
      const f = th.dataset.felt;
      sortering.stigende = sortering.felt === f ? !sortering.stigende : true;
      sortering.felt = f;
      tegnTabell();
    });
  });
}

/* ---------- geometri fra data ---------- */

function beregnVinkler() {
  const perAvdeling = {};
  DATA.seksjoner.forEach(s => {
    (perAvdeling[s.avdeling] = perAvdeling[s.avdeling] || []).push(s.kode);
  });
  Object.entries(perAvdeling).forEach(([avd, koder]) => {
    koder.sort((a, b) => a - b);
    const n = koder.length;
    koder.forEach((kode, i) => {
      seksjonsvinkel[kode] = RETNING[avd] + (i - (n - 1) / 2) * SEKSJON_BREDDE;
    });
  });
}

function beregnPosisjoner() {
  const perGruppe = {};
  DATA.anvendelser.forEach(a => {
    if (a.type !== 'spesifikk' || a.risikokategori === 'uavklart') return;
    const n = a.seksjon + '|' + a.risikokategori;
    (perGruppe[n] = perGruppe[n] || []).push(a);
  });

  Object.values(perGruppe).forEach(gruppe => {
    const m = gruppe.length;
    gruppe.forEach((a, i) => {
      // spre punktene innenfor seksjonens egen vinkelbredde
      const spredning = SEKSJON_BREDDE * 0.8;
      const grad = seksjonsvinkel[a.seksjon] + (m === 1 ? 0 : (i / (m - 1) - 0.5) * spredning);
      const [lo, hi] = SONER[a.risikokategori];
      const rInn = kant(lo, grad), rUt = kant(hi, grad);
      // trinnvis radiell forskyvning slik at nabopunkter ikke dekker hverandre.
      // Forskyvningen er visuell og har ingen faglig betydning.
      const andel = m === 1 ? (a.seksjon % 2 ? 0.40 : 0.60) : 0.30 + (i % 3) * 0.20;
      posisjon[a.id] = { x: 0, y: 0, grad };
      const [x, y] = punkt(grad, rInn + (rUt - rInn) * andel);
      posisjon[a.id].x = x;
      posisjon[a.id].y = y;
    });
  });
}

/* ---------- figuren ---------- */

function tegnFigur() {
  const svg = document.getElementById('figur');

  const defs = el('defs', {}, svg);
  const m = el('pattern', { id: 'skravur', width: 7, height: 7,
                            patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M0,7 L7,0', stroke: '#767c84', 'stroke-width': 0.5,
               opacity: 0.5, fill: 'none' }, m);

  const gSoner = el('g', {}, svg);
  const gRaster = el('g', {}, svg);
  const gBand = el('g', {}, svg);
  const gEtikett = el('g', {}, svg);
  const gPunkt = el('g', { id: 'punkter' }, svg);

  // risikosoner, ytterst forst
  ['minimal', 'begrenset', 'hoyrisiko', 'forbudt'].forEach(kode => {
    const [lo, hi] = SONER[kode];
    const flate = SONE_FLATE[kode];
    if (lo === 0) {
      el('polygon', { points: attekant(hi), fill: flate.fill, opacity: flate.opacity }, gSoner);
    } else {
      el('path', {
        d: 'M' + attekant(hi).replace(/ /g, ' L') + ' Z M' + attekant(lo).replace(/ /g, ' L') + ' Z',
        'fill-rule': 'evenodd', fill: flate.fill, opacity: flate.opacity
      }, gSoner);
    }
  });

  // sektorer uten dekning
  DATA.avdelinger.filter(a => a.dekning === 'ikke_forespurt').forEach(a => {
    const g = RETNING[a.kode];
    const p1 = punkt(g - 22.5, kant(R_YTRE, g - 22.5));
    const p2 = punkt(g + 22.5, kant(R_YTRE, g + 22.5));
    const d = `M${CX},${CY} L${p1[0].toFixed(1)},${p1[1].toFixed(1)} L${p2[0].toFixed(1)},${p2[1].toFixed(1)} Z`;
    el('path', { d, fill: '#f6f7f8', opacity: 0.92 }, gRaster);
    el('path', { d, fill: 'url(#skravur)' }, gRaster);
  });

  // sonegrenser og sektorstreker
  Object.values(SONER).forEach(([, hi]) => {
    el('polygon', { points: attekant(hi), fill: 'none', stroke: '#d5d8dc', 'stroke-width': 0.6 }, gRaster);
  });
  el('polygon', { points: attekant(R_YTRE), fill: 'none', stroke: '#767c84', 'stroke-width': 0.9 }, gRaster);

  for (let i = 0; i < 8; i++) {
    const [x, y] = punkt(i * 45, kant(R_YTRE, i * 45));
    el('line', { x1: CX, y1: CY, x2: x.toFixed(1), y2: y.toFixed(1),
                 stroke: '#d5d8dc', 'stroke-width': 0.6 }, gRaster);
  }

  // den vannrette aksen: skiller fag/forskning fra stottefunksjoner
  el('line', { x1: CX - 268, y1: CY, x2: CX + 268, y2: CY,
               stroke: '#767c84', 'stroke-width': 0.7, 'stroke-dasharray': '4 4' }, gRaster);

  // bandet: en celle per seksjon
  DATA.seksjoner.forEach(s => {
    const g = seksjonsvinkel[s.kode];
    const a1 = g - SEKSJON_BREDDE / 2 + 0.5, a2 = g + SEKSJON_BREDDE / 2 - 0.5;
    const p1 = punkt(a1, BAND_INN), p2 = punkt(a2, BAND_INN);
    const p3 = punkt(a2, BAND_UT), p4 = punkt(a1, BAND_UT);
    const celle = el('path', {
      d: `M${p1[0].toFixed(1)},${p1[1].toFixed(1)} A${BAND_INN},${BAND_INN} 0 0 0 ${p2[0].toFixed(1)},${p2[1].toFixed(1)}` +
         ` L${p3[0].toFixed(1)},${p3[1].toFixed(1)} A${BAND_UT},${BAND_UT} 0 0 1 ${p4[0].toFixed(1)},${p4[1].toFixed(1)} Z`,
      class: 'band-celle', 'data-seksjon': s.kode
    }, gBand);
    celle.appendChild(el('title', {})).textContent = 'Seksjon ' + s.kode;

    const [lx, ly] = punkt(g, BAND_UT + 11);
    const t = el('text', { x: lx.toFixed(1), y: (ly + 3).toFixed(1),
                           'text-anchor': 'middle', class: 'seksjon-etikett' }, gBand);
    t.textContent = s.kode;

    // symboler for klasser av alminnelig bruk
    const gen = DATA.anvendelser.find(a => a.seksjon === s.kode && a.type === 'generell');
    const klasser = (gen && gen.generell_klasser) || [];
    klasser.forEach((k, j) => {
      const gg = g + (j - (klasser.length - 1) / 2) * 2.6;
      const [sx, sy] = punkt(gg, (BAND_INN + BAND_UT) / 2);
      tegnSymbol(gBand, k, sx, sy);
    });
  });

  DATA.avdelinger.filter(a => a.dekning === 'ikke_forespurt').forEach(a => {
    const g = RETNING[a.kode];
    const a1 = g - 20, a2 = g + 20;
    const p1 = punkt(a1, BAND_INN), p2 = punkt(a2, BAND_INN);
    const p3 = punkt(a2, BAND_UT), p4 = punkt(a1, BAND_UT);
    el('path', {
      d: `M${p1[0].toFixed(1)},${p1[1].toFixed(1)} A${BAND_INN},${BAND_INN} 0 0 0 ${p2[0].toFixed(1)},${p2[1].toFixed(1)}` +
         ` L${p3[0].toFixed(1)},${p3[1].toFixed(1)} A${BAND_UT},${BAND_UT} 0 0 1 ${p4[0].toFixed(1)},${p4[1].toFixed(1)} Z`,
      fill: 'url(#skravur)', stroke: '#d5d8dc', 'stroke-width': 0.6
    }, gBand);
  });

  // avdelingsetiketter, innenfor kanten
  DATA.avdelinger.forEach(a => {
    const [x, y] = punkt(RETNING[a.kode], 205);
    const t = el('text', { x: x.toFixed(1), y: y.toFixed(1),
                           'text-anchor': 'middle', class: 'sektor-etikett' }, gEtikett);
    t.textContent = a.kode;
    if (a.dekning === 'ikke_forespurt') {
      const u = el('text', { x: x.toFixed(1), y: (y + 14).toFixed(1),
                             'text-anchor': 'middle', class: 'akse-etikett' }, gEtikett);
      u.textContent = 'ikke forespurt';
    }
  });

  const f = el('text', { x: 62, y: CY - 8, class: 'akse-etikett' }, gEtikett);
  f.textContent = 'fag og forskning';
  const s = el('text', { x: 62, y: CY + 17, class: 'akse-etikett' }, gEtikett);
  s.textContent = 'stottefunksjoner';

  // punkter
  DATA.anvendelser.forEach(a => {
    const p = posisjon[a.id];
    if (!p) return;
    const g = el('g', { class: 'punkt', 'data-id': a.id, tabindex: 0,
                        role: 'button' }, gPunkt);
    const avklart = a.vurderingsstatus === 'avklart';
    el('circle', {
      cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5.5,
      fill: avklart ? FARGE[a.risikokategori] : '#ffffff',
      stroke: FARGE[a.risikokategori], 'stroke-width': avklart ? 0 : 2.2
    }, g);
    g.appendChild(el('title', {})).textContent = a.navn + ' (' + a.id + ')';
    g.addEventListener('click', () => velg(a.id));
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); velg(a.id); }
    });
  });
}

function tegnSymbol(forelder, klasse, x, y) {
  if (klasse === 'mote') {
    el('rect', { x: (x - 4).toFixed(1), y: (y - 4).toFixed(1), width: 8, height: 8,
                 class: 'band-symbol' }, forelder);
  } else if (klasse === 'publikasjon') {
    el('polygon', { points: `${x.toFixed(1)},${(y - 4.8).toFixed(1)} ${(x - 4.4).toFixed(1)},${(y + 3.4).toFixed(1)} ${(x + 4.4).toFixed(1)},${(y + 3.4).toFixed(1)}`,
                    class: 'band-symbol' }, forelder);
  } else {
    el('line', { x1: (x - 4.4).toFixed(1), y1: y.toFixed(1), x2: (x + 4.4).toFixed(1), y2: y.toFixed(1),
                 class: 'band-symbol', 'stroke-width': 2 }, forelder);
    el('line', { x1: x.toFixed(1), y1: (y - 4.4).toFixed(1), x2: x.toFixed(1), y2: (y + 4.4).toFixed(1),
                 class: 'band-symbol', 'stroke-width': 2 }, forelder);
  }
}

function tegnTegnforklaring() {
  const boks = document.getElementById('tegnforklaring');
  const deler = [];

  DATA.risikokategorier.filter(k => k.kode !== 'uavklart').forEach(k => {
    deler.push(`<span class="tf-post"><span class="tf-prikk" style="background:${FARGE[k.kode]}"></span>${k.navn}</span>`);
  });
  deler.push('<span class="tf-post"><span class="tf-ring"></span>Forel\u00f8pig vurdert</span>');
  deler.push('<span class="tf-post"><svg width="14" height="14" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" fill="none" stroke="#4a5057" stroke-width="1.5"/></svg>M\u00f8te- og referatst\u00f8tte</span>');
  deler.push('<span class="tf-post"><svg width="14" height="14" aria-hidden="true"><polygon points="7,2 1.8,11.5 12.2,11.5" fill="none" stroke="#4a5057" stroke-width="1.5"/></svg>Publiseringsn\u00e6rt innhold</span>');
  deler.push('<span class="tf-post"><svg width="14" height="14" aria-hidden="true"><line x1="2" y1="7" x2="12" y2="7" stroke="#4a5057" stroke-width="2"/><line x1="7" y1="2" x2="7" y2="12" stroke="#4a5057" stroke-width="2"/></svg>Analysest\u00f8tte</span>');

  boks.innerHTML = deler.join('');
}

function tegnUplassert() {
  const boks = document.getElementById('uplassert');
  const liste = DATA.anvendelser.filter(a => a.risikokategori === 'uavklart');
  if (!liste.length) {
    boks.innerHTML = '<p class="detalj-tom">Alle anvendelser er plassert.</p>';
    return;
  }
  boks.innerHTML =
    '<p class="notat" style="margin:0 0 10px">Form\u00e5l eller rolle er ikke avklart nok til at disse kan plasseres i figuren.</p>' +
    liste.map(a =>
      `<div style="margin-bottom:10px"><a href="#" data-id="${a.id}" style="font-weight:500">${a.navn}</a>` +
      `<div class="notat">${a.id} \u00b7 seksjon ${a.seksjon}</div></div>`
    ).join('');
  boks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); velg(a.dataset.id); });
  });
}

/* ---------- filtrering ---------- */

function passerer(a) {
  if (filter.avdeling !== 'alle' && String(a.avdeling) !== filter.avdeling) return false;
  if (filter.kategori !== 'alle' && a.risikokategori !== filter.kategori) return false;
  if (!filter.generell && a.type === 'generell') return false;
  return true;
}

function fyllFiltre() {
  const va = document.getElementById('f-avdeling');
  va.innerHTML = '<option value="alle">Alle avdelinger</option>' +
    DATA.avdelinger.filter(a => a.dekning !== 'ikke_forespurt')
      .map(a => `<option value="${a.kode}">${a.navn}</option>`).join('');

  const vk = document.getElementById('f-kategori');
  vk.innerHTML = '<option value="alle">Alle kategorier</option>' +
    DATA.risikokategorier.map(k => `<option value="${k.kode}">${k.navn}</option>`).join('');
}

function oppdater() {
  document.querySelectorAll('#punkter .punkt').forEach(g => {
    const a = DATA.anvendelser.find(x => x.id === g.dataset.id);
    g.classList.toggle('dempet', !passerer(a));
  });
  document.querySelectorAll('.band-celle').forEach(c => {
    const kode = Number(c.dataset.seksjon);
    const avd = DATA.seksjoner.find(s => s.kode === kode).avdeling;
    const av = filter.avdeling === 'alle' || String(avd) === filter.avdeling;
    c.classList.toggle('dempet', !(av && filter.generell));
  });
  tegnTabell();
}

/* ---------- tabellen ---------- */

function tegnTabell() {
  const rader = DATA.anvendelser.filter(passerer).slice();
  const f = sortering.felt, retning = sortering.stigende ? 1 : -1;
  rader.sort((a, b) => {
    const x = a[f] === null || a[f] === undefined ? '' : a[f];
    const y = b[f] === null || b[f] === undefined ? '' : b[f];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * retning;
    return String(x).localeCompare(String(y), 'nb') * retning;
  });

  document.querySelectorAll('#tabell th').forEach(th => {
    th.removeAttribute('aria-sort');
    if (th.dataset.felt === f) th.setAttribute('aria-sort', sortering.stigende ? 'ascending' : 'descending');
  });

  const kropp = document.querySelector('#tabell tbody');
  kropp.innerHTML = rader.map(a => {
    const kat = DATA.risikokategorier.find(k => k.kode === a.risikokategori);
    return `<tr data-id="${a.id}" class="${a.id === valgt ? 'valgt' : ''}">
      <td class="id">${a.id}</td>
      <td class="navn">${a.navn}</td>
      <td>${a.avdeling}</td>
      <td>${a.seksjon}</td>
      <td>${a.beskrivelse}</td>
      <td><span class="kat-punkt ${a.risikokategori}"></span>${kat.navn}</td>
      <td>${FASE_NAVN[a.fase] || a.fase}</td>
      <td>${a.ansvarlig || '<span style="color:#767c84">ikke oppgitt</span>'}</td>
    </tr>`;
  }).join('');

  kropp.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => velg(tr.dataset.id));
  });

  const alle = DATA.anvendelser.length;
  document.getElementById('tabell-antall').textContent =
    rader.length === alle ? `${alle} anvendelser` : `${rader.length} av ${alle} anvendelser`;
}

/* ---------- sidepanelet ---------- */

function velg(id) {
  valgt = id;
  document.querySelectorAll('#punkter .punkt').forEach(g => {
    g.classList.toggle('valgt', g.dataset.id === id);
  });
  document.querySelectorAll('#tabell tbody tr').forEach(tr => {
    tr.classList.toggle('valgt', tr.dataset.id === id);
  });

  const boks = document.getElementById('detalj');
  if (!id) {
    boks.innerHTML = '<p class="detalj-tom">Velg et punkt i figuren eller en rad i tabellen.</p>';
    return;
  }

  const a = DATA.anvendelser.find(x => x.id === id);
  const kat = DATA.risikokategorier.find(k => k.kode === a.risikokategori);

  const rad = (merkelapp, verdi) => verdi
    ? `<div><dt>${merkelapp}</dt><dd>${verdi}</dd></div>`
    : `<div><dt>${merkelapp}</dt><dd class="mangler">ikke oppgitt</dd></div>`;

  boks.innerHTML = `<div class="detalj">
    <h3>${a.navn}</h3>
    <div class="id">${a.id} \u00b7 avdeling ${a.avdeling}, seksjon ${a.seksjon}</div>
    <div class="merker">
      <span class="merke risiko ${a.risikokategori}">${kat.navn}</span>
      <span class="merke">${STATUS_NAVN[a.vurderingsstatus]}</span>
      <span class="merke">${FASE_NAVN[a.fase] || a.fase}</span>
      <span class="merke">${ROLLE_NAVN[a.ssb_rolle]}</span>
      ${a.type === 'generell' ? '<span class="merke">Alminnelig assistentbruk</span>' : ''}
    </div>
    <dl>
      ${rad('Hva KI brukes til', a.beskrivelse)}
      <div><dt>Hvorfor denne kategorien</dt><dd>${kat.forklaring}</dd></div>
      ${rad('Ansvarlig', a.ansvarlig)}
      ${a.maa_avklares
        ? `<div class="avklar"><dt>M\u00e5 avklares</dt><dd>${a.maa_avklares}</dd></div>`
        : ''}
      ${a.generell_klasser && a.generell_klasser.length
        ? `<div><dt>Klasser av alminnelig bruk</dt><dd>${a.generell_klasser.map(k => KLASSE_NAVN[k]).join(', ')}</dd></div>`
        : ''}
      <div><dt>Sist oppdatert</dt><dd>${a.sist_oppdatert}</dd></div>
    </dl>
  </div>`;
}
