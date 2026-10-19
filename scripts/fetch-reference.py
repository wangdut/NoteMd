"""Fetch exact upstream files from the official raw endpoint if Git transport fails."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import urllib.request

SHA = '4df6a05a978d09aee450c77ee8cbc0c07510aaf5'
FILES = ['LICENSE', 'packages/muya/src/utils/slug.ts', 'packages/muya/src/utils/colorSpan.ts',
         'packages/muya/src/utils/marked/extensions/math.ts', 'packages/muya/src/utils/marked/extensions/mark.ts',
         'packages/muya/src/utils/marked/extensions/superSubscript.ts', 'packages/muya/src/utils/marked/extensions/footnote.ts',
         'packages/muya/src/utils/marked/options.ts', 'packages/muya/src/state/stateToMarkdown.ts']

def fetch(name):
    target = Path('vendor/marktext') / name
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f'https://raw.githubusercontent.com/marktext/marktext/{SHA}/{name}', timeout=60) as response:
        target.write_bytes(response.read())
    return name

with ThreadPoolExecutor(max_workers=5) as pool:
    for name in pool.map(fetch, FILES):
        print(name)
