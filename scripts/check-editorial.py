"""Verify the speaker/illustration update preserves the rest of the website."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
baseline = json.loads((ROOT / 'scripts/editorial-baseline.json').read_text())
def preserved(html):
    html = re.sub(r'(assets/(?:css/styles\.css|js/main\.js))\?v=[a-f0-9]+', r'\1?v=VERSION', html)
    html = re.sub(r'<figure class="hazard-panel">.*?</figure>', '', html, flags=re.S)
    return re.sub(r'<section aria-labelledby="speakers-title".*?</section>', '', html, flags=re.S)
source = (ROOT / 'index.html').read_text()
assert hashlib.sha256(preserved(source).encode()).hexdigest() == baseline['preserved_html'], 'Unrelated website content changed'
assert 'Speaker photos will be added if the workshop is accepted.' in source
speakers = source.split('class="speaker-grid">')[1].split('class="speaker-note"')[0]
names = re.findall(r'<h3>(.*?)</h3>', speakers)
assert names == ['Robin R. Murphy', 'Sabine Hauert', 'Satoshi Tadokoro', 'François Pomerleau', 'KDRT representative']
assert '<img' not in speakers
assert speakers.count('Talk title to be announced') == 5
assert 'Invitation accepted' not in source
assert 'speaker-status' not in source
assert 'Texas A&amp;M University, USA' in speakers
for path, expected in baseline['files'].items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected, f'Existing asset or animation changed: {path}'
print('PASS: speaker order, status, titles and no-photos note; all other website content, navigation code, portraits, logos and fonts preserved.')
