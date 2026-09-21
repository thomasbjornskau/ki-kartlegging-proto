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

rot = Path(__file__).resolve().parent.parent
html = (rot / 'index.html').read_text(encoding='utf-8')
css = (rot / 'style.css').read_text(encoding='utf-8')
js = (rot / 'app.js').read_text(encoding='utf-8')
data = (rot / 'data.json').read_text(encoding='utf-8')

html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>')
html = html.replace('<!--DATA-->', f'<script>window.DATA = {data};</script>')
html = html.replace('<script src="app.js"></script>', f'<script>\n{js}\n</script>')

ut = Path(sys.argv[1]) if len(sys.argv) > 1 else rot / 'samlefil.html'
ut.write_text(html, encoding='utf-8')
print(f'Skrev {ut} ({len(html) // 1024} kB)')
