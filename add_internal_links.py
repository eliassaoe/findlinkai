import os, re

TARGET_URL = "/best-company-research-tool-for-prospecting"
TARGET_TITLE = "Best Company Research Tool for Prospecting"
TARGET_DESC = "Find the best tools to research any company — employee count, industry, contacts, and more."
TARGET_ICON = "fa-briefcase"

PAGES = {
    "linkedin-url-finder": "linkedin-url-finder.html",
    "instagram-profile-scraper": "instagram-profile-scraper.html",
    "linkedin-post-date-extractor": "linkedin-post-date-extractor.html",
    "linkedin-profile-scraper": "linkedin-profile-scraper.html",
    "best-social-media-finder": "best-social-media-finder.html",
}

def make_card(slug):
    notes = {
        "linkedin-url-finder": "Found a LinkedIn URL? Now research the company behind it.",
        "instagram-profile-scraper": "Scraping profiles? Research their company data too.",
        "linkedin-post-date-extractor": "Analyzing posts? Get deeper company insights.",
        "linkedin-profile-scraper": "After the profile, research the company behind it.",
        "best-social-media-finder": "Found their social profiles? Now research the company.",
    }
    note = notes.get(slug, "Research any company instantly.")
    return f'\n        <div class="related-tool-card">\n          <div class="tool-icon"><i class="fas {TARGET_ICON}"></i></div>\n          <h3>{TARGET_TITLE}</h3>\n          <p>{note} {TARGET_DESC}</p>\n          <a href="{TARGET_URL}" class="tool-link">Research Companies <i class="fas fa-arrow-right"></i></a>\n        </div>'

def process_file(filepath, slug):
    if not os.path.exists(filepath):
        print(f"  WARNING: File not found: {filepath}")
        return False
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    if TARGET_URL in content:
        print(f"  SKIP: Already has link: {filepath}")
        return False
    m = re.search(r'(<div\s+class=["\']related-tools-grid["\'][^>]*>)', content, re.IGNORECASE)
    if m:
        pos = m.end()
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content[:pos] + make_card(slug) + content[pos:])
        print(f"  OK: Updated {filepath}")
        return True
    print(f"  FAILED: No insertion point found in {filepath}")
    return False

total = 0
for slug, fname in PAGES.items():
    print(f"Processing {slug}...")
    if process_file(fname, slug):
        total += 1

print(f"\nDone: {total}/{len(PAGES)} files updated")
print("Now run: git add -A && git commit -m 'seo: internal links to company research tool' && git push")
