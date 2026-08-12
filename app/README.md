# KI-kartlegging - prototype

Statisk oversikt over kartlagte KI-anvendelser i SSB og deres foreløpige
vurdering opp mot AI Act (forordning 2024/1689).

## Kjøre lokalt

Siden leser data fra `data.json`. Nettleseren blokkerer den lesingen når
`index.html` åpnes direkte fra disk, så start en enkel server i mappen:

    python3 -m http.server 8000

og åpne http://localhost:8000

## Filer

    index.html   struktur og AI Act-tekstene
    style.css    utseende
    app.js       all geometri og interaksjon
    data.json    registeret

Data er skilt fra visualiseringen. En post kan endres i `data.json` uten at
`app.js` røres. Ingen koordinater ligger i datafilen - all plassering
beregnes ved innlasting.

## Slik leses figuren

Retningen viser hvilken avdeling anvendelsen hører til. Den vannrette aksen
skiller fag og forskning (over) fra støttefunksjoner (under).

Avstanden fra sentrum viser hvilken AI Act-kategori anvendelsen er plassert
i. Kategoriene er diskrete juridiske klasser, ikke trinn på en skala. Fargen
gjentar den samme inndelingen, slik at figuren også kan leses i svart-hvitt.

Punkter som ellers ville dekket hverandre er forskjøvet litt. Forskyvningen
er visuell og har ingen faglig betydning.

Båndet utenfor kanten viser alminnelig assistentbruk per seksjon. Der er det
ingen radiell akse, og avstand betyr ingenting.

## Forbehold

Vurderingene i registeret er prosjektets foreløpige arbeidsvurderinger, ikke
juridiske konklusjoner. Endelig vurdering gjøres av jurist og
personvernombud.

Klassene for alminnelig bruk (møte- og referatstøtte, publiseringsnært
innhold, analysestøtte) er utledet av korte fritekstbeskrivelser i
registeret. De er ikke et registrert felt, og bør bekreftes mot
intervjunotatene før figuren brukes utenfor prosjektet.

Feltet `ssb_rolle` er satt maskinelt: `idriftsetter` der anvendelsen bygger
på et innkjøpt verktøy, ellers `uavklart`. Grensedragningen mellom
leverandør og idriftsetter er et juridisk spørsmål som ikke er avklart.

Avdeling 100 og 500 er ikke forespurt ennå og er skravert i figuren. Tomme
sektorer betyr manglende kartlegging, ikke fravær av KI-bruk.
