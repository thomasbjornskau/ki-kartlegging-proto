# KI-kartlegging – prototype v0.4

Oversikt over kartlagte KI-anvendelser i SSB og deres foreløpige plassering
etter AI Act (forordning 2024/1689).

## Oppdatere registeret

Excel-filen i `kilde/` er kilden. `data.json` er avledet og skal ikke
redigeres for hånd.

    python3 verktoy/excel_til_json.py kilde/KI_register.xlsx
    git add kilde/ data.json
    git commit -m "Oppdatert register"

Skriptet stopper hvis det møter en verdi det ikke kjenner, for eksempel en ny
status. Det er med vilje: nye verdier skal legges inn bevisst i skriptet, ikke
oversettes stille. Krever `pandas` og `openpyxl`.

Plassholderrader i Excel (Status = «Plassholder») tas ikke med som
anvendelser. Seksjonens dekning leses fra arket «Dekning».

## Kjøre lokalt

    python3 -m http.server 8000

og åpne http://localhost:8000. Nettleseren blokkerer lesing av `data.json`
når `index.html` åpnes direkte fra disk.

For en fil som kan åpnes uten server eller sendes til noen:

    python3 verktoy/bygg_samlefil.py

## Filer

    index.html                 struktur og faste tekster
    style.css                  utseende
    app.js                     geometri, filtre, tabell, detaljpanel
    data.json                  avledet fra kildefilen
    kilde/KI_register.xlsx     kilden
    verktoy/excel_til_json.py  Excel → data.json
    verktoy/bygg_samlefil.py   lager én selvstendig HTML-fil

Tall i løpende tekst (antall anvendelser, seksjoner som ikke har levert)
beregnes fra data. Unntaket er rapportdelen, som er datert og fryst.

## Slik leses figuren

Retningen viser avdeling. Den vannrette aksen skiller fag og forskning (over)
fra støttefunksjoner (under). Avstanden fra sentrum viser AI Act-kategori.
Kategoriene er diskrete klasser, ikke trinn på en skala.

Båndet utenfor kanten viser alminnelig assistentbruk per seksjon. Skraverte
celler er seksjoner som ikke har levert. I båndet betyr avstand ingenting.

Punkter som ellers ville dekket hverandre er forskjøvet litt. Forskyvningen
har ingen faglig betydning.

## Kolonnen «Meldt inn som»

Viser hvilken kategori seksjonen selv oppga i intervjureferatet. Der den
avviker fra kolonnen «Kategori», har prosjektet omplassert anvendelsen.
Begrunnelsen hører i «Ansvar / oppfølging». Appen merker omplasserte poster
i detaljpanelet, og skriptet teller dem ved konvertering.

Per november 2026 er 24 av 73 poster omplassert.

## Kjente svakheter

- Klassene for alminnelig bruk (møte, publisering, analyse) og feltet
  `ssb_rolle` settes fortsatt ved tekstsøk i beskrivelsene.
- Risikovurderingen av KI-funksjoner i kommunikasjonsverktøyene i seksjon 660
  ble gjort med en KI-assistent og er ført inn som innmelding.
- Kategorigrensen mellom alminnelig assistentbruk som er «begrenset» og den
  som er «minimal» følger ingen nedskrevet regel. Intern tekstbruk er plassert
  begge steder.
