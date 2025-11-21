import os
import re

# Part 2: Enrichment, Instagram, Alternatives & Best-of pages
CONTENT_LINKS_PART2 = {
    'b2b-data-enrichment.html': [
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('API integration', '<a href="https://linkfinderai.com/data-enrichment-api">API integration</a>'),
        ('data API', '<a href="https://linkfinderai.com/data-enrichment-api">data API</a>'),
        ('lead enrichment', '<a href="https://linkfinderai.com/lead-enrichment-api">lead enrichment</a>'),
        ('enrich leads', '<a href="https://linkfinderai.com/lead-enrichment-api">enrich leads</a>'),
        ('lead data', '<a href="https://linkfinderai.com/lead-enrichment-api">lead data</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('business information', '<a href="https://linkfinderai.com/company-details-finder">business information</a>')
    ],
    'data-enrichment-api.html': [
        ('B2B enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B enrichment</a>'),
        ('business data', '<a href="https://linkfinderai.com/b2b-data-enrichment">business data</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('lead data', '<a href="https://linkfinderai.com/lead-enrichment-api">lead data</a>'),
        ('enrich leads', '<a href="https://linkfinderai.com/lead-enrichment-api">enrich leads</a>'),
        ('email data', '<a href="https://linkfinderai.com/linkedin-email-finder">email data</a>'),
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>')
    ],
    'data-enrichment-company.html': [
        ('B2B enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B enrichment</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('lead enrichment', '<a href="https://linkfinderai.com/lead-enrichment-api">lead enrichment</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'lead-enrichment-api.html': [
        ('B2B enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B enrichment</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('email addresses', '<a href="https://linkfinderai.com/linkedin-email-finder">email addresses</a>')
    ],
    'b2b-data-companies.html': [
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('lead enrichment', '<a href="https://linkfinderai.com/lead-enrichment-api">lead enrichment</a>')
    ],
    'instagram-profile-scraper.html': [
        ('Instagram URLs', '<a href="https://linkfinderai.com/instagram-profile-url-finder">Instagram URLs</a>'),
        ('find Instagram profiles', '<a href="https://linkfinderai.com/instagram-profile-url-finder">find Instagram profiles</a>'),
        ('profile links', '<a href="https://linkfinderai.com/instagram-profile-url-finder">profile links</a>'),
        ('Instagram tools', '<a href="https://linkfinderai.com/best-instagram-scrapers">Instagram tools</a>'),
        ('scraper comparison', '<a href="https://linkfinderai.com/best-instagram-scrapers">scraper comparison</a>')
    ],
    'instagram-profile-url-finder.html': [
        ('Instagram scraping', '<a href="https://linkfinderai.com/instagram-profile-scraper">Instagram scraping</a>'),
        ('scrape Instagram', '<a href="https://linkfinderai.com/instagram-profile-scraper">scrape Instagram</a>'),
        ('profile scraper', '<a href="https://linkfinderai.com/instagram-profile-scraper">profile scraper</a>'),
        ('Instagram tools', '<a href="https://linkfinderai.com/best-instagram-scrapers">Instagram tools</a>')
    ],
    'clay-alternative.html': [
        ('LinkedIn scraping', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping</a>'),
        ('scrape LinkedIn', '<a href="https://linkfinderai.com/linkedin-scraper">scrape LinkedIn</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('B2B enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B enrichment</a>'),
        ('our pricing', '<a href="https://linkfinderai.com/pricing">our pricing</a>')
    ],
    'phantombuster-alternative.html': [
        ('LinkedIn automation', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn automation</a>'),
        ('scrape LinkedIn', '<a href="https://linkfinderai.com/linkedin-scraper">scrape LinkedIn</a>'),
        ('Instagram scraping', '<a href="https://linkfinderai.com/instagram-profile-scraper">Instagram scraping</a>'),
        ('profile data', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile data</a>')
    ],
    'apify-alternative.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'coresignal-alternative.html': [
        ('LinkedIn data', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn data</a>'),
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>'),
        ('employee data', '<a href="https://linkfinderai.com/company-employee-finder">employee data</a>')
    ],
    'derrick-app-alternative.html': [
        ('LinkedIn scraping', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>')
    ],
    'captain-data-alternative.html': [
        ('LinkedIn automation', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn automation</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'clearbit-alternative.html': [
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>')
    ],
    'scrapin-alternative.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('profile data', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile data</a>'),
        ('email extraction', '<a href="https://linkfinderai.com/linkedin-email-finder">email extraction</a>')
    ],
    'linked-helper-competitors.html': [
        ('LinkedIn automation', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn automation</a>'),
        ('profile scraping', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile scraping</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>')
    ],
    'skrapp-competitors.html': [
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>')
    ],
    'bright-data-competitors.html': [
        ('data scraping', '<a href="https://linkfinderai.com/linkedin-scraper">data scraping</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>')
    ],
    'best-lead-generation-tools.html': [
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('find emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find emails</a>'),
        ('find company websites', '<a href="https://linkfinderai.com/company-url-finder">find company websites</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('B2B data', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B data</a>')
    ],
    'best-linkedin-scrapers.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile scraper</a>'),
        ('scrape profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape profiles</a>'),
        ('company scraper', '<a href="https://linkfinderai.com/linkedin-company-scraper">company scraper</a>')
    ],
    'best-b2b-data-enrichment-tools.html': [
        ('enrichment platform', '<a href="https://linkfinderai.com/b2b-data-enrichment">enrichment platform</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'best-instagram-scrapers.html': [
        ('Instagram scraper', '<a href="https://linkfinderai.com/instagram-profile-scraper">Instagram scraper</a>'),
        ('profile data', '<a href="https://linkfinderai.com/instagram-profile-scraper">profile data</a>'),
        ('Instagram URLs', '<a href="https://linkfinderai.com/instagram-profile-url-finder">Instagram URLs</a>')
    ],
    'best-free-lead-generation-tools.html': [
        ('lead generation', '<a href="https://linkfinderai.com/best-lead-generation-tools">lead generation</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'best-email-enrichment-tools.html': [
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>')
    ],
    'best-b2b-data-providers.html': [
        ('B2B data', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B data</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'best-crm-cleaning-tools.html': [
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>')
    ],
    'best-linkedin-email-extractor.html': [
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('profile data', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile data</a>')
    ],
    'ai-tools-for-sales-teams.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'best-company-research-tool-for-prospecting.html': [
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>'),
        ('employee data', '<a href="https://linkfinderai.com/company-employee-finder">employee data</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>')
    ]
}

count = 0
total = 0
for file in os.listdir('.'):
    if file.endswith('.html') and file in CONTENT_LINKS_PART2:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()
            original = content
            links_added = 0
            for text, link_html in CONTENT_LINKS_PART2[file]:
                if links_added >= 5:
                    break
                pattern = f'(<p[^>]*>(?:(?!</p>).)*?)\\b({re.escape(text)})\\b((?:(?!</p>).)*?</p>)'
                match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
                if match and '<a href=' not in match.group(0):
                    original_text = match.group(2)
                    case_preserved = link_html.replace(text, original_text)
                    new_para = f'{match.group(1)}{case_preserved}{match.group(3)}'
                    content = content.replace(match.group(0), new_para, 1)
                    links_added += 1
            if content != original:
                with open(file, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"✓ {file} - {links_added} links")
                count += 1
                total += links_added
        except Exception as e:
            print(f"✗ {file}: {e}")
print(f"\n✅ Part 2: {count} pages, {total} links")
