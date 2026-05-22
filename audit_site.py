#!/usr/bin/env python3
import re, sys
from pathlib import Path
from collections import Counter

RED_FLAGS = [
    ('CRIT', r'<title[^>]*>[^<]*?[Ss]craper', 'scraper in title'),
    ('CRIT', r'<h1[^>]*>[^<]*?[Ss]craper', 'scraper in H1'),
    ('CRIT', r'<meta\s+name="description"\s+content="[^"]*?[Ss]crap', 'scrape in meta desc'),
    ('CRIT', r'Is this LinkedIn scraping legal', 'self-incriminating FAQ'),
    ('HIGH', r'LinkedIn Profile Scraper', 'visible "LinkedIn Profile Scraper"'),
    ('HIGH', r'LinkedIn Company Scraper', 'visible "LinkedIn Company Scraper"'),
    ('HIGH', r'Instagram Profile Scraper', 'visible "Instagram Profile Scraper"'),
    ('HIGH', r'Free LinkedIn Sales Navigator Scraper', 'Sales Nav scraper text'),
    ('HIGH', r'support@unlimited-leads', 'old support email'),
    ('HIGH', r'scraping LinkedIn without ban', 'old testimonial'),
]

def scan(path):
    try: content = path.read_text(encoding='utf-8')
    except: return []
    found = []
    for sev, pat, desc in RED_FLAGS:
        m = re.findall(pat, content)
        if m: found.append((sev, desc, len(m)))
    return found

def main():
    root = Path('.')
    files = sorted(root.glob('*.html'))
    for sd in ['pseo-pages', 'workflow', 'workflows']:
        p = root / sd
        if p.is_dir(): files.extend(sorted(p.glob('*.html')))

    totals = Counter()
    file_findings = {}
    for f in files:
        found = scan(f)
        if found:
            file_findings[str(f.relative_to(root))] = found
            for sev, _, c in found:
                totals[sev] += c

    print(f'\n=== AUDIT — {len(files)} files scanned ===')
    print(f'CRITICAL: {totals["CRIT"]}  |  HIGH: {totals["HIGH"]}')

    if totals['CRIT'] == 0 and totals['HIGH'] == 0:
        print('\n✓ READY FOR FASTSPRING (only LOW/MED remaining)')
    else:
        print('\n✗ NOT READY — top files to fix:')
        weight = {'CRIT': 1000, 'HIGH': 100}
        srt = sorted(file_findings.items(), key=lambda kv: -sum(weight.get(s, 0) * c for s, _, c in kv[1]))
        for fname, findings in srt[:15]:
            print(f'\n  {fname}')
            for sev, desc, c in findings:
                print(f'    [{sev}] {desc} ({c}x)')

if __name__ == '__main__': main()
