"""UI strings inside inline scripts: '...' or "..." literals that read like prose."""
import re, sys, json
LIT = re.compile(r"""(?<![\w$])(['"])((?:\\.|(?!\1).){3,400}?)\1""", re.S)
def ui_strings(html):
    out = []
    for m in re.finditer(r'<script(?![^>]*(?:src=|application/ld\+json))[^>]*>(.*?)</script>', html, re.S):
        js = m.group(1)
        for q, s in LIT.findall(js):
            t = re.sub(r'<[^>]+>', ' ', s)
            if not re.search(r'[A-Za-z]{2,}\s+[A-Za-z]{2,}', t): continue
            if re.search(r'(https?:|\.js\b|\.html\b|querySelector|function|=>|\$\{|application/|text/|Content-Type|Bearer|posthog|lf_|^[\w-]+(\s[\w-]+)*$(?<=[a-z]))', s) and not re.search(r'[A-Z][a-z]+ [a-z]', t):
                continue
            if re.fullmatch(r'[\w\s.#\-\[\]=:>*,()]+', s) and not re.search(r'[A-Z]', s): continue
            out.append(s)
    return out
if __name__ == '__main__':
    seen=[]; 
    for f in sys.argv[1:]:
        for s in ui_strings(open(f, encoding='utf-8').read()):
            if s not in seen: seen.append(s)
    print(len(seen))
    for s in seen: print(repr(s)[:160])
