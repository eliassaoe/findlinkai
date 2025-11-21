import os
import re

# Part 3: Remaining pages (Best-of, Sales, CRM, etc.)
CONTENT_LINKS_PART3 = {
    'best-ai-sales-enablement-for-gtm-teams.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('lead generation', '<a href="https://linkfinderai.com/best-lead-generation-tools">lead generation</a>')
    ],
    'best-crm-integration-with-linkedin.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('profile data', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile data</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>')
    ],
    'best-data-cleaning-tools.html': [
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('email verification', '<a href="https://linkfinderai.com/linkedin-email-finder">email verification</a>'),
        ('CRM cleaning', '<a href="https://linkfinderai.com/best-crm-cleaning-tools">CRM cleaning</a>')
    ],
    'best-emails-api-for-cold-outreach.html': [
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('find emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find emails</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profiles</a>'),
        ('company contacts', '<a href="https://linkfinderai.com/company-details-finder">company contacts</a>')
    ],
    'best-instagram-api-for-automations.html': [
        ('Instagram scraper', '<a href="https://linkfinderai.com/instagram-profile-scraper">Instagram scraper</a>'),
        ('Instagram URLs', '<a href="https://linkfinderai.com/instagram-profile-url-finder">Instagram URLs</a>'),
        ('profile data', '<a href="https://linkfinderai.com/instagram-profile-scraper">profile data</a>'),
        ('Instagram tools', '<a href="https://linkfinderai.com/best-instagram-scrapers">Instagram tools</a>')
    ],
    'best-integrated-sales-and-data-automation-platform.html': [
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>')
    ],
    'best-intent-data-providers.html': [
        ('B2B data', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B data</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>'),
        ('lead data', '<a href="https://linkfinderai.com/lead-enrichment-api">lead data</a>'),
        ('data providers', '<a href="https://linkfinderai.com/best-b2b-data-providers">data providers</a>')
    ],
    'best-lead-generation-api.html': [
        ('lead generation', '<a href="https://linkfinderai.com/best-lead-generation-tools">lead generation</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('lead enrichment', '<a href="https://linkfinderai.com/lead-enrichment-api">lead enrichment</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'best-lead-scoring-software.html': [
        ('lead enrichment', '<a href="https://linkfinderai.com/lead-enrichment-api">lead enrichment</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('lead generation', '<a href="https://linkfinderai.com/best-lead-generation-tools">lead generation</a>')
    ],
    'best-platforms-for-automatic-linkedin-profile-enrichment-in-crms.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('profile enrichment', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile enrichment</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('CRM integration', '<a href="https://linkfinderai.com/best-crm-integration-with-linkedin">CRM integration</a>')
    ],
    'best-price-scraping-tools.html': [
        ('data scraping', '<a href="https://linkfinderai.com/linkedin-scraper">data scraping</a>'),
        ('web scraping', '<a href="https://linkfinderai.com/best-tool-to-scrape-website">web scraping</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'best-proxy-providers.html': [
        ('web scraping', '<a href="https://linkfinderai.com/linkedin-scraper">web scraping</a>'),
        ('data extraction', '<a href="https://linkfinderai.com/linkedin-profile-scraper">data extraction</a>'),
        ('scraping tools', '<a href="https://linkfinderai.com/best-tool-to-scrape-website">scraping tools</a>')
    ],
    'best-recruitment-sofware-tools.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('candidate profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">candidate profiles</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('employee data', '<a href="https://linkfinderai.com/company-employee-finder">employee data</a>'),
        ('LinkedIn jobs', '<a href="https://linkfinderai.com/scrape-linkedIn-jobs">LinkedIn jobs</a>')
    ],
    'best-social-media-finder.html': [
        ('LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profiles</a>'),
        ('Instagram profiles', '<a href="https://linkfinderai.com/instagram-profile-scraper">Instagram profiles</a>'),
        ('profile URLs', '<a href="https://linkfinderai.com/linkedin-url-finder">profile URLs</a>'),
        ('Instagram URLs', '<a href="https://linkfinderai.com/instagram-profile-url-finder">Instagram URLs</a>')
    ],
    'best-software-for-crm.html': [
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('CRM integration', '<a href="https://linkfinderai.com/best-crm-integration-with-linkedin">CRM integration</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('lead enrichment', '<a href="https://linkfinderai.com/lead-enrichment-api">lead enrichment</a>'),
        ('CRM cleaning', '<a href="https://linkfinderai.com/best-crm-cleaning-tools">CRM cleaning</a>')
    ],
    'best-tool-to-scrape-website.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('data scraping', '<a href="https://linkfinderai.com/linkedin-profile-scraper">data scraping</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('web scraping', '<a href="https://linkfinderai.com/best-web-spider">web scraping</a>')
    ],
    'best-web-spider.html': [
        ('web scraping', '<a href="https://linkfinderai.com/best-tool-to-scrape-website">web scraping</a>'),
        ('data extraction', '<a href="https://linkfinderai.com/linkedin-scraper">data extraction</a>'),
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>')
    ],
    'top-best-marketing-automation-platforms.html': [
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('lead enrichment', '<a href="https://linkfinderai.com/lead-enrichment-api">lead enrichment</a>'),
        ('enrichment API', '<a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('sales automation', '<a href="https://linkfinderai.com/best-integrated-sales-and-data-automation-platform">sales automation</a>')
    ],
    'about-us.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('our tools', '<a href="https://linkfinderai.com/pricing">our tools</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>')
    ],
    'blog.html': [
        ('LinkedIn scraping', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('lead generation', '<a href="https://linkfinderai.com/best-lead-generation-tools">lead generation</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>')
    ]
}

count = 0
total = 0
for file in os.listdir('.'):
    if file.endswith('.html') and file in CONTENT_LINKS_PART3:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()
            original = content
            links_added = 0
            for text, link_html in CONTENT_LINKS_PART3[file]:
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
print(f"\n✅ Part 3: {count} pages, {total} links")
print(f"📊 Total coverage: ~70+ pages with internal linking")
