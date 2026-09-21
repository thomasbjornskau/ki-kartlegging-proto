#!/usr/bin/env python3
"""
Konverterer KI-registeret fra Excel til data.json.

Bruk (fra repo-roten):
    python3 verktoy/excel_til_json.py kilde/KI_register.xlsx

Krever: pandas, openpyxl

Excel-filen er kilden. data.json er avledet og skal ikke redigeres for hånd.

Skriptet stopper med feilmelding hvis det finner verdier det ikke kjenner.
Det er med vilje: en ny verdi i Excel skal føre til en bevisst endring her,
ikke bli stille oversatt til "uavklart".
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

# ---------- kontrollerte verdilister ----------

KATEGORI = {
    'Forbudt': 'forbudt',
    'Høyrisiko / mulig høyrisiko': 'hoyrisiko',
    'Begrenset': 'begrenset',
    'Minimal': 'minimal',
    'Uavklart': 'uavklart',
}

VURDERINGSSTATUS = {
    'Foreløpig vurdert': 'foreloepig',
    'Ikke vurdert': 'ikke_vurdert',
    'Ikke vurdert – formål mangler': 'formaal_mangler',
    'Må avklares': 'maa_avklares',
    'Mulig høyrisiko': 'mulig_hoyrisiko',
    'Høyrisikokandidat': 'kandidat',
    'Avklart': 'avklart',
}

FASE = {
    'I bruk': 'drift',
    'Produksjon': 'drift',
    'I bruk via leverandør': 'drift',
    'I bruk / delvis planlagt': 'drift',
    'I bruk / testing': 'drift',
    'I bruk / begrenset resultat': 'drift',
    'I bruk / utvikling': 'drift',
    'Produksjon/utvikling': 'drift',
    'Tilgjengelig / bruk varierer': 'tilgjengelig',
    'Tilgjengelig/i bruk': 'tilgjengelig',
    'Eksperiment': 'eksperiment',
    'Planlagt/eksperiment': 'eksperiment',
    'Planlagt': 'planlagt',
    'Under anskaffelse / planlagt': 'planlagt',
    'Test': 'test',
    'Idé': 'ide',
}

DATAGRUNNLAG = {
    'Innmeldt – første runde': 'runde1',
    'Innmeldt – ny runde': 'runde2',
}

DEKNING = {
    'Svar mottatt': 'levert',
    'Plassholder': 'ikke_levert',
    'Ikke spurt': 'ikke_forespurt',
}

AVDELINGER = {
    100: ('Avdeling 100', 'stotte'),
    200: ('Avdeling 200', 'fag'),
    300: ('Avdeling 300', 'fag'),
    400: ('Avdeling 400', 'fag'),
    500: ('Avdeling 500 – forskning', 'fag'),
    600: ('Avdeling 600', 'stotte'),
    700: ('Avdeling 700', 'stotte'),
    800: ('Avdeling 800', 'stotte'),
}

# ---------- midlertidige heuristikker ----------
# Brukes bare hvis Excel-filen mangler kolonnen "Type".
# Bør erstattes av en Type-kolonne fylt ut av den som registrerer.

GENERELL_MONSTER = re.compile(
    r'assistent|generell|copilot|chatgpt|gemini|generative funksjoner|'
    r'kodeutvikling|kodegenerering|kodeoversettelse|oversettelse|'
    r'tekst- og språkstøtte|tekstbehandling|statistisk analyse og figur',
    re.I)

# Treff på mønsteret over som likevel er egne anvendelser
SPESIFIKK_UNNTAK = {
    'KI-782-01', 'KI-811-01', 'KI-723-01', 'KI-723-02', 'KI-360-02',
    'KI-660-03', 'KI-312-03', 'KI-330-02', 'KI-851-03',
}

TREDJEPART = re.compile(
    r'copilot|chatgpt|gemini|claude|figma|flourish|ahrefs|ga4|rovo|mistral|'
    r'llama|qwen|siteimprove|vimeo|mynewsdesk|dfø', re.I)


def klasser_for_generell(tekst):
    t = tekst.lower()
    ut = []
    if re.search(r'møte|referat', t):
        ut.append('mote')
    # «intern kommunikasjon» er ikke publiseringsnært
    if re.search(r'presentasjon|(?<!intern )kommunikasjon|innholdsproduksjon|innhold til|visualisering|artikkel|rapportering', t):
        ut.append('publikasjon')
    if re.search(r'analyse', t):
        ut.append('analyse')
    return ut


def del_ansvar(tekst):
    """Skiller eierangivelse fra oppfølgingspunkter i fritekstfeltet."""
    if pd.isna(tekst):
        return None, None
    deler = [d.strip() for d in re.split(r'(?<=\.)\s+', str(tekst).strip()) if d.strip()]
    ans, avk = [], []
    for d in deler:
        if re.search(r'ikke avklart|ikke oppgitt|må avklares|bør|avklar|følg|nødvendig|skilles|delvis', d, re.I):
            avk.append(d)
        else:
            ans.append(d)
    return (' '.join(ans).rstrip('.') or None), (' '.join(avk) or None)


def slå_opp(tabell, verdi, felt, rad_id, feil):
    if verdi in tabell:
        return tabell[verdi]
    feil.append(f'{rad_id}: ukjent verdi i «{felt}»: {verdi!r}')
    return None


def main(sti, ut_sti):
    reg = pd.read_excel(sti, sheet_name='Register', header=2).dropna(how='all')
    dek = pd.read_excel(sti, sheet_name='Dekning')

    feil, advarsler = [], []

    # -- dekning per seksjon --
    dekning_seksjon, avd_status = {}, {}
    for _, r in dek.iterrows():
        status = slå_opp(DEKNING, r['Kartleggingsstatus'], 'Kartleggingsstatus',
                         f"Dekning {r['Seksjon/enhet']}", feil)
        try:
            dekning_seksjon[int(r['Seksjon/enhet'])] = (int(r['Avdeling']), status)
        except (ValueError, TypeError):
            avd_status[int(r['Avdeling'])] = status   # hel avdeling, f.eks. forskning

    # -- anvendelser --
    har_type = 'Type' in reg.columns
    plassholdere = reg['Status'].eq('Plassholder')
    anvendelser = []

    for _, r in reg[~plassholdere].iterrows():
        rid = r['ID']
        seksjon = int(r['Seksjon'])
        if seksjon not in dekning_seksjon:
            advarsler.append(f'Seksjon {seksjon} har poster, men mangler i Dekning-arket. Satt som levert.')
            dekning_seksjon[seksjon] = (int(r['Avdeling']), 'levert')

        tekst = f"{r['Anvendelse']} {r['Kort beskrivelse']}"
        if har_type and pd.notna(r.get('Type')):
            typ = str(r['Type']).strip().lower()
        else:
            typ = 'generell' if (GENERELL_MONSTER.search(str(r['Anvendelse'])) and rid not in SPESIFIKK_UNNTAK) else 'spesifikk'

        ansvarlig, avklares = del_ansvar(r['Ansvar / oppfølging'])

        rec = {
            'id': rid,
            'navn': r['Anvendelse'],
            'avdeling': int(r['Avdeling']),
            'seksjon': seksjon,
            'type': typ,
            'beskrivelse': r['Kort beskrivelse'],
            'risikokategori': slå_opp(KATEGORI, r['Kategori'], 'Kategori', rid, feil),
            'vurderingsstatus': slå_opp(VURDERINGSSTATUS, r['Vurderingsstatus'], 'Vurderingsstatus', rid, feil),
            'fase': slå_opp(FASE, r['Status'], 'Status', rid, feil),
            'datagrunnlag': slå_opp(DATAGRUNNLAG, r['Datagrunnlag'], 'Datagrunnlag', rid, feil),
            'ssb_rolle': 'idriftsetter' if TREDJEPART.search(tekst) else 'uavklart',
            'ansvarlig': ansvarlig,
            'maa_avklares': avklares,
        }
        if typ == 'generell':
            rec['generell_klasser'] = klasser_for_generell(tekst)
        anvendelser.append(rec)

    if feil:
        print('Stopper. Følgende verdier må legges inn i skriptet eller rettes i Excel:\n')
        print('\n'.join('  ' + f for f in feil))
        sys.exit(1)

    # -- seksjoner og avdelinger --
    seksjoner = [{'kode': s, 'avdeling': a, 'dekning': d}
                 for s, (a, d) in sorted(dekning_seksjon.items())]

    avdelinger = []
    for kode, (navn, gruppe) in AVDELINGER.items():
        if avd_status.get(kode) == 'ikke_forespurt':
            dekning = 'ikke_forespurt'
        else:
            egne = [s['dekning'] for s in seksjoner if s['avdeling'] == kode]
            dekning = 'ikke_forespurt' if not egne else ('levert' if all(d == 'levert' for d in egne) else 'delvis')
        avdelinger.append({'kode': kode, 'navn': navn, 'gruppe': gruppe, 'dekning': dekning})

    data = {
        'metadata': {
            'tittel': 'KI-anvendelser i SSB',
            'sist_oppdatert': date.today().isoformat(),
            'kildefil': Path(sti).name,
            'forbehold': ('Vurderingene her er prosjektets foreløpige arbeidsvurderinger, laget for å få '
                          'oversikt. De er ikke juridiske konklusjoner, og skal kvalitetssikres av jurist '
                          'og personvernombud.'),
        },
        'avdelinger': avdelinger,
        'seksjoner': seksjoner,
        'risikokategorier': [
            {'kode': 'forbudt', 'navn': 'Forbudt',
             'forklaring': 'Anvendelser som omfattes av forbudene i AI Act artikkel 5.'},
            {'kode': 'hoyrisiko', 'navn': 'Høyrisiko / mulig høyrisiko',
             'forklaring': 'Kan falle inn under høyrisikoregimet, blant annet rekruttering og arbeidstakeroppfølging.'},
            {'kode': 'begrenset', 'navn': 'Begrenset / transparensrelevant',
             'forklaring': 'Særlig generativ KI. Kan utløse krav om merking av KI-generert innhold.'},
            {'kode': 'minimal', 'navn': 'Minimal / øvrig lavrisiko',
             'forklaring': 'Arbeidsstøtte og KI/ML i statistikkproduksjonen som ikke brukes til beslutninger om enkeltpersoner.'},
            {'kode': 'uavklart', 'navn': 'Ikke plassert ennå',
             'forklaring': 'Formål eller rolle er ikke tilstrekkelig avklart til at anvendelsen kan plasseres.'},
        ],
        'anvendelser': anvendelser,
    }

    Path(ut_sti).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

    # -- oppsummering --
    n_gen = sum(a['type'] == 'generell' for a in anvendelser)
    print(f'Skrev {ut_sti}')
    print(f'  {len(anvendelser)} anvendelser ({n_gen} alminnelig bruk, {len(anvendelser) - n_gen} egne)')
    print(f'  {int(plassholdere.sum())} plassholderrader hoppet over')
    print(f'  {sum(s["dekning"] == "levert" for s in seksjoner)} seksjoner har levert, '
          f'{sum(s["dekning"] == "ikke_levert" for s in seksjoner)} har ikke levert')
    if not har_type:
        print('\n  Merk: Excel-filen mangler kolonnen «Type». Generell/spesifikk er satt med tekstsøk.')
        print('  Kontroller listen under, og vurder å legge inn kolonnen:\n')
        for a in anvendelser:
            if a['type'] == 'generell':
                print(f"    generell  {a['id']}  {a['navn']}")
    for a in advarsler:
        print('\n  Advarsel:', a)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    kilde = sys.argv[1]
    mål = sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parent.parent / 'data.json')
    main(kilde, mål)
