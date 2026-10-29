"""Verify the invited speaker update preserves the rest of the website."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
baseline = json.loads((ROOT / 'scripts/editorial-baseline.json').read_text())
def preserved(html):
    html = re.sub(r'(assets/(?:css/styles\.css|js/main\.js))\?v=[a-f0-9]+', r'\1?v=VERSION', html)
    return re.sub(r'<section aria-labelledby="speakers-title".*?</section>\n', '', html, flags=re.S)
source = (ROOT / 'index.html').read_text()
assert hashlib.sha256(preserved(source).encode()).hexdigest() == baseline['preserved_html'], 'Unrelated website content changed'
assert 'Speaker photos will be added if the workshop is accepted.' in source
speakers = source.split('class="speaker-grid">')[1].split('class="speaker-note"')[0]
names = re.findall(r'<h3>(.*?)</h3>', speakers)
assert names == ['Prof. Robin R. Murphy', 'Prof. Sabine Hauert', 'Prof. Satoshi Tadokoro', 'Prof. François Pomerleau', 'KDRT representative']
assert speakers.count('src="assets/img/speaker-placeholder.svg"') == 5
assert speakers.count('class="speaker-talk"') == 1
assert 'Tentative talk title: “Swarms in the real world: from firefighting to city logistics”' in speakers
speaker_section = source.split('id="speakers">', 1)[1].split('</section>', 1)[0]
statuses = re.findall(r'<p class="speaker-status( speaker-status-pending)?">(.*?)</p>', speakers)
assert statuses == [('', 'Confirmed')] * 4 + [(' speaker-status-pending', 'To be confirmed')], 'Four speakers are confirmed; KDRT is to be confirmed'
assert 'accepted their invitations' not in speaker_section
assert 'scheduling conflict' not in speaker_section
assert source.index('id="topics"') < source.index('id="speakers"') < source.index('id="program"')
nav = re.findall(r'<a (?:class="nav-cta" )?href="#([a-z]+)"', source.split('id="primary-nav"', 1)[1].split('</nav>', 1)[0])
sections = [s for s in re.findall(r'<section [^>]*id="([a-z-]+)"', source) if s in nav[:-1]]
assert nav[:-1] == sections, 'Header links must follow the page order'
assert 'Emerita' not in source
assert '<h2 id="speakers-title">Invited Speakers</h2>' in source
assert 'Texas A&amp;M University, USA' in speakers
for path, expected in baseline['files'].items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected, f'Existing asset or animation changed: {path}'
print('PASS: speaker order, confirmation status, titles and no-photos note; all other website content, navigation code, portraits, logos and fonts preserved.')
