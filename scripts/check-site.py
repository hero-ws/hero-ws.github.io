"""Check the static workshop's assets, anchors, and scheduling constraints."""
from html.parser import HTMLParser
from pathlib import Path
import re
import argparse
import hashlib
import struct
from urllib.parse import urlsplit, parse_qs
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = []
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))
    handle_startendtag = handle_starttag

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--refresh-assets', action='store_true', help='Update CSS/JS version links before checking')
args = parser.parse_args()
versions = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()[:12] for path in ('assets/css/styles.css', 'assets/js/main.js')}
source = (ROOT / 'index.html').read_text()
if args.refresh_assets:
    for path, version in versions.items():
        source = re.sub(r'(["\'])' + re.escape(path) + r'(?:\?v=[a-f0-9]+)?\1', lambda match: match[1] + path + '?v=' + version + match[1], source)
    (ROOT / 'index.html').write_text(source)
page = Page()
page.feed(source)
metadata = {attrs.get('property', attrs.get('name')): attrs.get('content') for tag, attrs in page.tags if tag == 'meta'}
preview = urlsplit(metadata['og:image'])
assert preview.scheme == 'https' and preview.netloc == 'hero-ws.github.io'
preview_bytes = (ROOT / preview.path.lstrip('/')).read_bytes()
assert preview_bytes[:8] == b'\x89PNG\r\n\x1a\n'
assert struct.unpack('>II', preview_bytes[16:24]) == (int(metadata['og:image:width']), int(metadata['og:image:height']))
assert metadata['og:image:type'] == 'image/png' and metadata['og:image:alt']
assert metadata['twitter:image'] == metadata['og:image'] and metadata['twitter:card'] == 'summary'
assert any(tag == 'body' and attrs.get('id') == 'top' for tag, attrs in page.tags), 'Top anchor must be on the page, not the sticky header'
ids = [attrs['id'] for _, attrs in page.tags if 'id' in attrs]
assert len(ids) == len(set(ids)), 'Duplicate element IDs'
assert len([t for t, _ in page.tags if t == 'h1']) == 1
for tag, attrs in page.tags:
    if 'aria-labelledby' in attrs:
        assert all(i in ids for i in attrs['aria-labelledby'].split())
    if tag == 'a' and attrs.get('href', '').startswith('#'):
        assert attrs['href'][1:] in ids, f"Missing anchor: {attrs['href']}"
    asset = attrs.get('src') if tag in ('img', 'script') else attrs.get('href') if tag == 'link' and attrs.get('rel') in ('stylesheet', 'icon') else None
    if asset:
        assert not asset.startswith(('http:', 'https:', '//', '/')), f'Asset must be bundled: {asset}'
        asset_url = urlsplit(asset)
        assert (ROOT / asset_url.path).is_file(), f'Missing asset: {asset}'
        if asset_url.path in versions:
            assert parse_qs(asset_url.query).get('v') == [versions[asset_url.path]], 'Run python3 scripts/check-site.py --refresh-assets before committing CSS/JS changes'
    if tag == 'img':
        assert 'alt' in attrs and 'height' in attrs and 'width' in attrs

for svg in (ROOT / 'assets/img').glob('*.svg'):
    ET.parse(svg)
    assert '<script' not in svg.read_text()
css = (ROOT / 'assets/css/styles.css').read_text()
for asset in re.findall(r'url\(["\']?([^"\')]+)', css):
    assert not asset.startswith(('http:', 'https:', '//')), f'External CSS asset: {asset}'
    assert (ROOT / 'assets/css' / asset).is_file(), f'Missing CSS asset: {asset}'
assert (ROOT / 'assets/fonts/OFL.txt').is_file(), 'Bundled font license is required'
assert 'mailto:hero-workshop@example.com' in source
assert not any(tag == 'form' for tag, _ in page.tags)
assert 'mario.malizia@' not in source
assert '—' not in source
assert 'hazard-animation' not in source and 'animation-control' not in source
assert 'theme-toggle' not in source and 'theme.js' not in source and not (ROOT / 'assets/js/theme.js').exists(), 'The site has a single light style'
assert 'data-theme' not in (ROOT / 'assets/css/styles.css').read_text()
assert 'organizer-role' not in source and 'speaker-theme' not in source
assert source.count('AI tools were used for the generation of this website preview.') == 1
assert 'Pending acceptance' in source
assert len(re.findall(r'class="speaker-card"', source)) == 5
assert 'Technical Committee on Safety, Security, and Rescue Robotics' in source and 'class="endorsement-list"' in source
assert len(re.findall(r'class="organizer-card"', source)) == 7
assert len(re.findall(r'class="institution-card"', source)) == 4
assert 'hero-ws.github.io/' in source
agenda = source.split('class="agenda"', 1)[1].split('</ol>', 1)[0]
slots = re.findall(r'<time[^>]*>(\d{2}:\d{2})–(\d{2}:\d{2})</time>', agenda)
minutes = lambda t: int(t[:2]) * 60 + int(t[3:])
assert slots[0][0] == '08:30' and slots[-1][1] == '12:30'
assert all(a[1] == b[0] for a, b in zip(slots, slots[1:])), 'Schedule has a gap or overlap'
assert sum(minutes(b) - minutes(a) for a, b in slots) == 240
assert slots[4] == ('10:00', '11:00'), 'Poster session must last one hour'
assert len(re.findall(r'<strong>Invited talk \d</strong>', agenda)) == 5
assert 'end-user discussion' not in agenda.lower() and 'panel' not in agenda.lower()
assert (ROOT / '.nojekyll').exists()
print('PASS: local assets, unique anchors, accessible image attributes, a single light style, five speaker slots, the IEEE SSRR TC endorsement, seven organisers, four institutional logos, a placeholder email, and a continuous 240-minute programme with five talks and a 60-minute poster session.')
