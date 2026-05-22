#!/usr/bin/env python3
import re, sys
from pathlib import Path

PHRASE_REPLACEMENTS = [
    (r'\bLinkedIn Profile Scraper\b', 'Professional Profile Lookup'),
    (r'\bLinkedIn Company Scraper\b', 'Company Profile Lookup'),
    (r'\bLinkedIn Post Scraper\b', 'Post Data Lookup'),
    (r'\bLinkedIn Job Scraper\b', 'Job Listings Lookup'),
    (r'\bLinkedIn Scraper\b', 'Professional Data Lookup'),
    (r'\bLinkedIn Scraping API\b', 'Professional Data API'),
    (r'\bLinkedIn Scraping\b', 'B2B Data Lookup'),
    (r'\bInstagram Profile Scraper\b', 'Instagram Profile Lookup'),
    (r'\bInstagram Scraper\b', 'Instagram Data Lookup'),
    (r'\bFree LinkedIn Sales Navigator Scraper\b', 'B2B Sales Data Lookup'),
    (r'\bSales Navigator Scraper\b', 'B2B Sales Data Lookup'),
    (r'\bScrape LinkedIn\b', 'Look up business contacts'),
    (r'\bScrape Linkedin\b', 'Look up business contacts'),
    (r'\bscrape LinkedIn\b', 'look up business contacts'),
    (r'\bscrape linkedin\b', 'look up business contacts'),
    (r'\bScrape Profile Data\b', 'Look Up Profile Data'),
    (r'\b[Ss]craper\b', 'Lookup'),
    (r'\b[Ss]craping\b', 'lookup'),
    (r'\bExtract LinkedIn profiles\b', 'Look up business contacts'),
    (r'\bExtract LinkedIn\b', 'Look up'),
    (r'\bextract LinkedIn\b', 'look up'),
    (r'\bextract LinkedIn profile data\b', 'look up business contact data'),
    (r'\bextracting company data from LinkedIn\b', 'enriching company contact data'),
    (r'\bExtract Full Profile Data\b', 'Look Up Profile Data'),
    (r'\bData Extraction\b', 'Data Lookup'),
]

META_DESC_REPLACEMENTS = [
    (r'(<meta\s+name="description"\s+content=")[^"]*?[Ss]crap[^"]*?(")',
     r'\1B2B contact data enrichment for sales, marketing, and recruitment teams. Verified business information at scale.\2'),
]

DELETE_PATTERNS = [
    re.compile(r'<[^>]*>\s*Is this LinkedIn scraping legal[^<]*?</[^>]+>\s*<[^>]*>[^<]*?LinkedIn[^<]*?terms of service[^<]*?</[^>]+>', re.DOTALL | re.IGNORECASE),
]

CLEAN_MARKER = '<!-- softened-tool-page-v1 -->'

def process_file(path):
    try: original = path.read_text(encoding='utf-8')
    except: return ('error', 'read failed')
    if CLEAN_MARKER in original: return ('already_clean', 'ok')
    triggers = ['scraper', 'scraping', 'extract LinkedIn', 'Scrape LinkedIn']
    if not any(t.lower() in original.lower() for t in triggers):
        return ('skipped', 'no scraper language')
    content = original
    for pattern, replacement in META_DESC_REPLACEMENTS:
        content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
    for pattern, replacement in PHRASE_REPLACEMENTS:
        content = re.sub(pattern, replacement, content)
    for pattern in DELETE_PATTERNS:
        content = pattern.sub('', content)
    if '</head>' in content:
        content = content.replace('</head>', f'{CLEAN_MARKER}\n</head>', 1)
    if content == original: return ('skipped', 'no changes')
    try: path.write_text(content, encoding='utf-8')
    except: return ('error', 'write failed')
    return ('changed', 'softened')

def main():
    html_files = sorted(Path('.').glob('*.html'))
    counts = {'changed': 0, 'skipped': 0, 'error': 0, 'already_clean': 0}
    for f in html_files:
        status, _ = process_file(f)
        counts[status] += 1
    print(f'Changed: {counts["changed"]} | Already clean: {counts["already_clean"]} | Skipped: {counts["skipped"]} | Errors: {counts["error"]} | Total: {len(html_files)}')

if __name__ == '__main__': main()
