#!/usr/bin/env python3
"""Refresh the public static replica from the reference, with verified HTTPS.

Run explicitly, only when refreshing the reference design. Normal development,
builds, and startup use the checked-in local snapshot and need no source access.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
from urllib.request import Request, urlopen
import json
import re
import sys

ORIGIN = 'https://otsuka-air.jp'
ROOT = Path(__file__).resolve().parent.parent / 'site'
seen = set()
failed = []

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ('src', 'href', 'poster'):
            if attrs.get(key): self.links.add(attrs[key])
        if attrs.get('srcset'):
            self.links.update(x.strip().split(' ')[0] for x in attrs['srcset'].split(','))

def local_path(path):
    path = unquote(path)
    if path.endswith('/') or not Path(path).suffix: path = path.rstrip('/') + '/index.html'
    dest = (ROOT / path.lstrip('/')).resolve()
    if not dest.is_relative_to(ROOT.resolve()): raise ValueError('Invalid asset path')
    return dest

def clean_html(text):
    # Keep UI and animations; exclude production analytics and hosted font scripts.
    text = re.sub(r'<!-- Google Tag Manager.*?<!-- End Google Tag Manager(?: \(noscript\))? -->', '', text, flags=re.S)
    text = re.sub(r'<noscript>\s*<iframe[^>]*googletagmanager.*?</noscript>', '', text, flags=re.S)
    text = re.sub(r'<script[^>]*src="https://webfont\.fontplus\.jp/[^>]*></script>', '', text)
    text = re.sub(r'<link[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>', '', text)
    text = re.sub(r'<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>', '', text)
    text = re.sub(r'<meta name="robots"[^>]*>', '', text)
    text = text.replace('</head>', '<meta name="robots" content="noindex, nofollow"><link rel="stylesheet" href="/assets/fonts/local.css"></head>')
    # Keep navigation inside the clone. Canonical/social metadata stays attributed.
    text = re.sub(r'(href|action)="https://(?:www\.)?otsuka-air\.jp(/[^\"]*)"', r'\1="\2"', text)
    return text

def normalize(raw, parent):
    if not raw or raw.startswith(('data:', 'blob:', 'mailto:', 'tel:', '#', 'javascript:')): return None
    u = urlparse(urljoin(ORIGIN + parent, raw))
    if u.hostname not in ('otsuka-air.jp', 'www.otsuka-air.jp'): return None
    path = u.path or '/'
    if path.startswith('/assets/fonts/'): return None
    return path

def patch_runtime(text):
    # Stop a queued homeIntroduction RAF before Barba removes its Alpine refs.
    # Otherwise navigating away mid-scroll dereferences a detached paragraph.
    before = 'destroy(){d&&rt.off("scroll",this.onScroll),window.removeEventListener("resize",this.onResize),s?.destroy?.()}'
    after = 'destroy(){u!==null&&(cancelAnimationFrame(u),u=null),d&&rt.off("scroll",this.onScroll),window.removeEventListener("resize",this.onResize),s?.destroy?.()}'
    return text.replace(before, after)

def fetch(path):
    dest = local_path(path)
    if dest.exists() and '--refresh' not in sys.argv:
        data = dest.read_bytes()
    else:
        req = Request(ORIGIN + path, headers={'User-Agent':'Mozilla/5.0 (compatible; local-website-recreation)'})
        with urlopen(req, timeout=60) as response: data = response.read()
    refs = set()
    suffix = dest.suffix
    if suffix in ('.html', '.css', '.js', '.svg', '.json', '.gltf'):
        text = data.decode('utf-8')
        if path == '/_astro/hoisted.B1SGfLJ6.js': text = patch_runtime(text)
        if suffix == '.html':
            text = clean_html(text) if 'href="/assets/fonts/local.css"' not in text else text
            parser = Links(); parser.feed(text); refs.update(parser.links)
        if suffix in ('.css', '.js'):
            refs.update(re.findall(r'["\x27]((?:\./|\.\./|/assets/|/_astro/)[^"\x27\s`<>]+\.(?:js|css|webp|png|jpg|svg|woff2?|mp4|glb|wasm))["\x27]', text))
            refs.update(x.strip('"\x27 ') for x in re.findall(r'url\(([^)]+)\)', text))
        data = text.encode('utf-8')
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return {p for raw in refs if (p := normalize(raw, path))}

queue = {'/', '/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'}
# WebGL assets are constructed dynamically by the animation runtime.
for quality in ('low', 'medium', 'high'):
    prefix = f'/assets/images/textures/{quality}'
    queue.update(f'{prefix}/intro{i:02}.webp' for i in range(1,6))
    queue.update(f'{prefix}/chapter01/chapter{i:02}.webp' for i in range(1,16))
    queue.update(f'{prefix}/chapter02/chapter02-{i:02}.webp' for i in range(1,16))
    queue.update(f'{prefix}/chapter04/chapter04-{i:02}.webp' for i in range(1,17))
    # The source only publishes the first ten interview texture sets at high quality.
    count = 10 if quality == 'high' else 11
    queue.update(f'{prefix}/interview/interview{i*3+j+1:02}.webp' for i in range(count) for j in range(2))
    for group in ('on','off'):
        queue.update(f'{prefix}/chapter-{group}/chapter-{group}-{i:02}.webp' for i in range(1,9))
for prefix in ('/assets/models','/assets/models/mobile'):
    for model in ('kv', 'tablet_tantai', 'bag_tantai', 'main'):
        queue.add(f'{prefix}/otsuka_{model}_export.glb')
queue.update('/assets/models/draco/' + x for x in ('draco_wasm_wrapper.js','draco_decoder.wasm'))
queue.update(('/assets/images/common/zeroz-logo.webp','/assets/images/common/zeroz-logo-t.webp','/assets/images/common/disc.webp','/assets/images/icons/zeroz-logo.svg'))

with ThreadPoolExecutor(max_workers=10) as pool:
    while queue:
        batch = queue - seen
        if not batch: break
        seen.update(batch); queue = set()
        jobs = {pool.submit(fetch, path):path for path in sorted(batch)}
        for job in as_completed(jobs):
            path = jobs[job]
            try:
                queue.update(job.result() - seen)
                print('Saved', path, flush=True)
            except Exception as error:
                failed.append((path, str(error)))
                print('FAILED', path, str(error), flush=True)
print(json.dumps({'files':len(seen)-len(failed),'failures':failed},ensure_ascii=False,indent=2))
if failed: raise SystemExit(1)
