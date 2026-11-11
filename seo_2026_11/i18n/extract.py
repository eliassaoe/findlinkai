"""Tokenize a page into translatable segments without reformatting anything."""
import json, re, sys
TOKEN = re.compile(r'(<!--.*?-->|<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<[^>]+>)', re.S)
ATTRS = re.compile(r'\b(alt|title|placeholder|aria-label|data-tooltip)="([^"]*)"')
META = re.compile(r'<meta\s+(?:name|property)="(description|og:title|og:description|twitter:title|twitter:description)"\s+content="([^"]*)"', re.I)
LETTERS = re.compile(r'[A-Za-z]')
def norm(s): return re.sub(r'\s+', ' ', s).strip()
def text_segments(html):
    out = []
    for part in TOKEN.split(html):
        if not part or part.startswith('<'):
            if part.startswith('<') and not part.startswith(('<script', '<style', '<!--')):
                for _, v in ATTRS.findall(part):
                    if LETTERS.search(v): out.append(norm(v))
            continue
        n = norm(part)
        if LETTERS.search(n) and not re.fullmatch(r'[\W\d_]*', n):
            out.append(n)
    for _, v in META.findall(html): out.append(norm(v))
    return out
def jsonld_strings(html):
    out = []
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try: d = json.loads(m.group(1))
        except Exception: continue
        def walk(x, k=None):
            if isinstance(x, dict): [walk(v, kk) for kk, v in x.items()]
            elif isinstance(x, list): [walk(v, k) for v in x]
            elif isinstance(x, str) and k in ('name', 'text', 'description', 'headline') and LETTERS.search(x) and not x.startswith('http'):
                out.append(norm(x))
        walk(d)
    return out
if __name__ == '__main__':
    seen, segs = set(), []
    for f in sys.argv[1:]:
        h = open(f, encoding='utf-8').read()
        for s in text_segments(h) + jsonld_strings(h):
            if s not in seen: seen.add(s); segs.append(s)
    print(len(segs), sum(len(s.split()) for s in segs))
    json.dump(segs, open('/tmp/claude-0/-home-claude/6cd27162-fd67-5098-bf7f-159961df8722/scratchpad/segs.json', 'w'), ensure_ascii=False, indent=0)
