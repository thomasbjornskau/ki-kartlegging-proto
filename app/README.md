# KI-kartlegging – prototype v0.2

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

## Kjente svakheter

- Skillet mellom alminnelig bruk og egne anvendelser settes ved tekstsøk,
  fordi kildefilen mangler en `Type`-kolonne. Skriptet skriver ut hvilke
  poster som er satt som alminnelig bruk, slik at de kan kontrolleres.
  Legges kolonnen inn, bruker skriptet den automatisk.
- Klassene for alminnelig bruk og feltet `ssb_rolle` er også satt ved tekstsøk.
- Seksjon 380 har poster, men mangler i arket «Dekning».
