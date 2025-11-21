import os
import re

# Part 1: Main tools & LinkedIn pages
CONTENT_LINKS_PART1 = {
    'linkedin-scraper.html': [
        ('email extraction', '<a href="https://linkfinderai.com/linkedin-email-finder">email extraction</a>'),
        ('extract emails', '<a href="https://linkfinderai.com/linkedin-email-finder">extract emails</a>'),
        ('find email addresses', '<a href="https://linkfinderai.com/linkedin-email-finder">find email addresses</a>'),
        ('profile data', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile data</a>'),
        ('scrape profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape profiles</a>'),
        ('LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profiles</a>'),
        ('company information', '<a href="https://linkfinderai.com/linkedin-company-scraper">company information</a>'),
        ('company data', '<a href="https://linkfinderai.com/linkedin-company-scraper">company data</a>'),
        ('business profiles', '<a href="https://linkfinderai.com/linkedin-company-scraper">business profiles</a>')
    ],
    'linkedin-email-finder.html': [
        ('LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profiles</a>'),
        ('profile scraping', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile scraping</a>'),
        ('profile data', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile data</a>'),
        ('find employees', '<a href="https://linkfinderai.com/company-employee-finder">find employees</a>'),
        ('employee data', '<a href="https://linkfinderai.com/company-employee-finder">employee data</a>'),
        ('employee information', '<a href="https://linkfinderai.com/company-employee-finder">employee information</a>'),
        ('profile URLs', '<a href="https://linkfinderai.com/linkedin-url-finder">profile URLs</a>'),
        ('LinkedIn URLs', '<a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn URLs</a>')
    ],
    'linkedin-profile-scraper.html': [
        ('email extraction', '<a href="https://linkfinderai.com/linkedin-email-finder">email extraction</a>'),
        ('extract emails', '<a href="https://linkfinderai.com/linkedin-email-finder">extract emails</a>'),
        ('find emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find emails</a>'),
        ('email addresses', '<a href="https://linkfinderai.com/linkedin-email-finder">email addresses</a>'),
        ('company data', '<a href="https://linkfinderai.com/linkedin-company-scraper">company data</a>'),
        ('company profiles', '<a href="https://linkfinderai.com/linkedin-company-scraper">company profiles</a>'),
        ('business data', '<a href="https://linkfinderai.com/linkedin-company-scraper">business data</a>'),
        ('LinkedIn URLs', '<a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn URLs</a>')
    ],
    'linkedin-company-scraper.html': [
        ('company details', '<a href="https://linkfinderai.com/company-details-finder">company details</a>'),
        ('business information', '<a href="https://linkfinderai.com/company-details-finder">business information</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('find employees', '<a href="https://linkfinderai.com/company-employee-finder">find employees</a>'),
        ('employee data', '<a href="https://linkfinderai.com/company-employee-finder">employee data</a>'),
        ('staff information', '<a href="https://linkfinderai.com/company-employee-finder">staff information</a>'),
        ('profile scraping', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile scraping</a>')
    ],
    'linkedin-url-finder.html': [
        ('LinkedIn scraping', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping</a>'),
        ('profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile scraper</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('find emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find emails</a>'),
        ('company information', '<a href="https://linkfinderai.com/linkedin-company-scraper">company information</a>')
    ],
    'linkedin-search-by-email.html': [
        ('LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profiles</a>'),
        ('profile data', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile data</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>')
    ],
    'linkedin-post-commenters-export.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('profile data', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile data</a>'),
        ('email addresses', '<a href="https://linkfinderai.com/linkedin-email-finder">email addresses</a>')
    ],
    'linkedin-post-date-extractor.html': [
        ('LinkedIn scraping', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping</a>'),
        ('profile information', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile information</a>'),
        ('company data', '<a href="https://linkfinderai.com/linkedin-company-scraper">company data</a>')
    ],
    'scrape-linkedIn-jobs.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('company data', '<a href="https://linkfinderai.com/linkedin-company-scraper">company data</a>'),
        ('profile information', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile information</a>'),
        ('company details', '<a href="https://linkfinderai.com/company-details-finder">company details</a>')
    ],
    'export-linkedin-group-members.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('profile data', '<a href="https://linkfinderai.com/linkedin-profile-scraper">profile data</a>'),
        ('email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">email finder</a>'),
        ('member information', '<a href="https://linkfinderai.com/company-employee-finder">member information</a>')
    ],
    'company-url-finder.html': [
        ('phone numbers', '<a href="https://linkfinderai.com/company-phone-finder">phone numbers</a>'),
        ('contact numbers', '<a href="https://linkfinderai.com/company-phone-finder">contact numbers</a>'),
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>'),
        ('business details', '<a href="https://linkfinderai.com/company-details-finder">business details</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('employee information', '<a href="https://linkfinderai.com/company-employee-finder">employee information</a>'),
        ('find employees', '<a href="https://linkfinderai.com/company-employee-finder">find employees</a>')
    ],
    'company-phone-finder.html': [
        ('company websites', '<a href="https://linkfinderai.com/company-url-finder">company websites</a>'),
        ('find URLs', '<a href="https://linkfinderai.com/company-url-finder">find URLs</a>'),
        ('website addresses', '<a href="https://linkfinderai.com/company-url-finder">website addresses</a>'),
        ('company data', '<a href="https://linkfinderai.com/company-details-finder">company data</a>'),
        ('business information', '<a href="https://linkfinderai.com/company-details-finder">business information</a>'),
        ('find employees', '<a href="https://linkfinderai.com/company-employee-finder">find employees</a>')
    ],
    'company-employee-finder.html': [
        ('company websites', '<a href="https://linkfinderai.com/company-url-finder">company websites</a>'),
        ('find company URLs', '<a href="https://linkfinderai.com/company-url-finder">find company URLs</a>'),
        ('email addresses', '<a href="https://linkfinderai.com/linkedin-email-finder">email addresses</a>'),
        ('find emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find emails</a>'),
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>'),
        ('business details', '<a href="https://linkfinderai.com/company-details-finder">business details</a>'),
        ('LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profiles</a>')
    ],
    'company-details-finder.html': [
        ('company URLs', '<a href="https://linkfinderai.com/company-url-finder">company URLs</a>'),
        ('find websites', '<a href="https://linkfinderai.com/company-url-finder">find websites</a>'),
        ('data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment</a>'),
        ('enrich data', '<a href="https://linkfinderai.com/b2b-data-enrichment">enrich data</a>'),
        ('B2B data', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B data</a>'),
        ('employee data', '<a href="https://linkfinderai.com/company-employee-finder">employee data</a>'),
        ('find employees', '<a href="https://linkfinderai.com/company-employee-finder">find employees</a>'),
        ('phone numbers', '<a href="https://linkfinderai.com/company-phone-finder">phone numbers</a>')
    ],
    'find-company-employee-count.html': [
        ('company information', '<a href="https://linkfinderai.com/company-details-finder">company information</a>'),
        ('employee data', '<a href="https://linkfinderai.com/company-employee-finder">employee data</a>'),
        ('find employees', '<a href="https://linkfinderai.com/company-employee-finder">find employees</a>'),
        ('company websites', '<a href="https://linkfinderai.com/company-url-finder">company websites</a>')
    ]
}

count = 0
total = 0
for file in os.listdir('.'):
    if file.endswith('.html') and file in CONTENT_LINKS_PART1:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()
            original = content
            links_added = 0
            for text, link_html in CONTENT_LINKS_PART1[file]:
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
print(f"\n✅ Part 1: {count} pages, {total} links")
