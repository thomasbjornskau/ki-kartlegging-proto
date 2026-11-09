#!/usr/bin/env python3
"""
Lager én selvstendig HTML-fil (data, stil og kode lagt inn) for deling
eller forhåndsvisning uten server.

Bruk (fra repo-roten):
    python3 verktoy/bygg_samlefil.py [utfil]

Samlefilen er avledet. Endringer gjøres i index.html, style.css, app.js
og kildefilen – aldri i samlefilen.
"""
import sys
from pathlib import Path

# Rotmappa er der index.html ligger: enten skriptets egen mappe eller mappa over.
her = Path(__file__).resolve().parent
rot = her if (her / 'index.html').exists() else her.parent
html = (rot / 'index.html').read_text(encoding='utf-8')
css = (rot / 'style.css').read_text(encoding='utf-8')
js = (rot / 'app.js').read_text(encoding='utf-8')
data = (rot / 'data.json').read_text(encoding='utf-8')

# Skriftene bygges inn, slik at samlefilen kan sendes som én fil
import base64, re
def bygg_inn_font(treff):
    sti = rot / treff.group(1)
    if not sti.exists():
        return treff.group(0)
    b64 = base64.b64encode(sti.read_bytes()).decode()
    return f'url("data:font/woff2;base64,{b64}") format("woff2")'
css = re.sub(r'url\("(fonts/[^"]+\.woff2)"\)\s*format\("woff2"\)', bygg_inn_font, css)

html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>')
html = html.replace('<!--DATA-->', f'<script>window.DATA = {data};</script>')
html = html.replace('<script src="app.js"></script>', f'<script>\n{js}\n</script>')

ut = Path(sys.argv[1]) if len(sys.argv) > 1 else rot / 'samlefil.html'
ut.write_text(html, encoding='utf-8')
print(f'Skrev {ut} ({len(html) // 1024} kB)')
