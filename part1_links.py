import os
import re

# Part 1: Main tools & LinkedIn pages
CONTENT_LINKS_PART1 = {
    'linkedin-scraper.html': [
        ('scrape LinkedIn', '<a href="https://linkfinderai.com/linkedin-email-finder">scrape LinkedIn</a>'),
        ('LinkedIn email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>'),
        ('LinkedIn email extraction', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email extraction</a>'),
        ('find LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find LinkedIn emails</a>'),
        ('LinkedIn contact finder', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn contact finder</a>'),
        ('scraping LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scraping LinkedIn profiles</a>'),
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>'),
        ('extract LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">extract LinkedIn profiles</a>'),
        ('LinkedIn profile extraction', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile extraction</a>'),
        ('LinkedIn company scraper', '<a href="https://linkfinderai.com/linkedin-company-scraper">LinkedIn company scraper</a>'),
        ('scrape LinkedIn companies', '<a href="https://linkfinderai.com/linkedin-company-scraper">scrape LinkedIn companies</a>'),
        ('LinkedIn company extraction', '<a href="https://linkfinderai.com/linkedin-company-scraper">LinkedIn company extraction</a>'),
        ('extract LinkedIn companies', '<a href="https://linkfinderai.com/linkedin-company-scraper">extract LinkedIn companies</a>'),
        ('scraping LinkedIn company', '<a href="https://linkfinderai.com/linkedin-company-scraper">scraping LinkedIn company</a>')
    ],
    'linkedin-email-finder.html': [
        ('scraping LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scraping LinkedIn profiles</a>'),
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>'),
        ('LinkedIn profile extraction', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile extraction</a>'),
        ('extract LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">extract LinkedIn profiles</a>'),
        ('company employee finder', '<a href="https://linkfinderai.com/company-employee-finder">company employee finder</a>'),
        ('find company employees', '<a href="https://linkfinderai.com/company-employee-finder">find company employees</a>'),
        ('company employee search', '<a href="https://linkfinderai.com/company-employee-finder">company employee search</a>'),
        ('employee finder tool', '<a href="https://linkfinderai.com/company-employee-finder">employee finder tool</a>'),
        ('search company employees', '<a href="https://linkfinderai.com/company-employee-finder">search company employees</a>'),
        ('LinkedIn URL finder', '<a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn URL finder</a>'),
        ('find LinkedIn URLs', '<a href="https://linkfinderai.com/linkedin-url-finder">find LinkedIn URLs</a>'),
        ('LinkedIn URL search', '<a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn URL search</a>')
    ],
    'linkedin-profile-scraper.html': [
        ('LinkedIn email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>'),
        ('find LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find LinkedIn emails</a>'),
        ('LinkedIn email extraction', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email extraction</a>'),
        ('extract LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">extract LinkedIn emails</a>'),
        ('LinkedIn email search', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email search</a>'),
        ('scrape LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">scrape LinkedIn emails</a>'),
        ('LinkedIn company scraper', '<a href="https://linkfinderai.com/linkedin-company-scraper">LinkedIn company scraper</a>'),
        ('scrape LinkedIn companies', '<a href="https://linkfinderai.com/linkedin-company-scraper">scrape LinkedIn companies</a>'),
        ('LinkedIn company extraction', '<a href="https://linkfinderai.com/linkedin-company-scraper">LinkedIn company extraction</a>'),
        ('scraping LinkedIn companies', '<a href="https://linkfinderai.com/linkedin-company-scraper">scraping LinkedIn companies</a>'),
        ('LinkedIn URL finder', '<a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn URL finder</a>'),
        ('find LinkedIn URLs', '<a href="https://linkfinderai.com/linkedin-url-finder">find LinkedIn URLs</a>')
    ],
    'linkedin-company-scraper.html': [
        ('company details finder', '<a href="https://linkfinderai.com/company-details-finder">company details finder</a>'),
        ('find company details', '<a href="https://linkfinderai.com/company-details-finder">find company details</a>'),
        ('company details search', '<a href="https://linkfinderai.com/company-details-finder">company details search</a>'),
        ('search company details', '<a href="https://linkfinderai.com/company-details-finder">search company details</a>'),
        ('company details extraction', '<a href="https://linkfinderai.com/company-details-finder">company details extraction</a>'),
        ('company employee finder', '<a href="https://linkfinderai.com/company-employee-finder">company employee finder</a>'),
        ('find company employees', '<a href="https://linkfinderai.com/company-employee-finder">find company employees</a>'),
        ('company employee search', '<a href="https://linkfinderai.com/company-employee-finder">company employee search</a>'),
        ('search company employees', '<a href="https://linkfinderai.com/company-employee-finder">search company employees</a>'),
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>')
    ],
    'linkedin-url-finder.html': [
        ('LinkedIn scraper tool', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper tool</a>'),
        ('LinkedIn scraping tool', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping tool</a>'),
        ('scrape LinkedIn data', '<a href="https://linkfinderai.com/linkedin-scraper">scrape LinkedIn data</a>'),
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>'),
        ('LinkedIn profile extraction', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile extraction</a>'),
        ('LinkedIn email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>'),
        ('find LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find LinkedIn emails</a>'),
        ('LinkedIn email search', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email search</a>'),
        ('LinkedIn company scraper', '<a href="https://linkfinderai.com/linkedin-company-scraper">LinkedIn company scraper</a>'),
        ('scrape LinkedIn companies', '<a href="https://linkfinderai.com/linkedin-company-scraper">scrape LinkedIn companies</a>')
    ],
    'linkedin-search-by-email.html': [
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>'),
        ('LinkedIn profile extraction', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile extraction</a>'),
        ('extract LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">extract LinkedIn profiles</a>'),
        ('scraping LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scraping LinkedIn profiles</a>'),
        ('LinkedIn email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>'),
        ('find LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find LinkedIn emails</a>'),
        ('LinkedIn scraper tool', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper tool</a>'),
        ('LinkedIn scraping', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping</a>')
    ],
    'linkedin-post-commenters-export.html': [
        ('LinkedIn scraper tool', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper tool</a>'),
        ('LinkedIn scraping tool', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping tool</a>'),
        ('scrape LinkedIn', '<a href="https://linkfinderai.com/linkedin-scraper">scrape LinkedIn</a>'),
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>'),
        ('LinkedIn email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>'),
        ('find LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find LinkedIn emails</a>'),
        ('extract LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">extract LinkedIn emails</a>')
    ],
    'linkedin-post-date-extractor.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('LinkedIn scraping tool', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping tool</a>'),
        ('scrape LinkedIn', '<a href="https://linkfinderai.com/linkedin-scraper">scrape LinkedIn</a>'),
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>'),
        ('LinkedIn company scraper', '<a href="https://linkfinderai.com/linkedin-company-scraper">LinkedIn company scraper</a>'),
        ('scrape LinkedIn companies', '<a href="https://linkfinderai.com/linkedin-company-scraper">scrape LinkedIn companies</a>')
    ],
    'scrape-linkedIn-jobs.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('LinkedIn scraping tool', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping tool</a>'),
        ('scrape LinkedIn', '<a href="https://linkfinderai.com/linkedin-scraper">scrape LinkedIn</a>'),
        ('LinkedIn company scraper', '<a href="https://linkfinderai.com/linkedin-company-scraper">LinkedIn company scraper</a>'),
        ('scrape LinkedIn companies', '<a href="https://linkfinderai.com/linkedin-company-scraper">scrape LinkedIn companies</a>'),
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>'),
        ('company details finder', '<a href="https://linkfinderai.com/company-details-finder">company details finder</a>'),
        ('find company details', '<a href="https://linkfinderai.com/company-details-finder">find company details</a>')
    ],
    'export-linkedin-group-members.html': [
        ('LinkedIn scraper', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraper</a>'),
        ('LinkedIn scraping tool', '<a href="https://linkfinderai.com/linkedin-scraper">LinkedIn scraping tool</a>'),
        ('scrape LinkedIn', '<a href="https://linkfinderai.com/linkedin-scraper">scrape LinkedIn</a>'),
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>'),
        ('LinkedIn email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>'),
        ('find LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find LinkedIn emails</a>'),
        ('company employee finder', '<a href="https://linkfinderai.com/company-employee-finder">company employee finder</a>'),
        ('find company employees', '<a href="https://linkfinderai.com/company-employee-finder">find company employees</a>')
    ],
    'company-url-finder.html': [
        ('company phone finder', '<a href="https://linkfinderai.com/company-phone-finder">company phone finder</a>'),
        ('find company phone', '<a href="https://linkfinderai.com/company-phone-finder">find company phone</a>'),
        ('company phone search', '<a href="https://linkfinderai.com/company-phone-finder">company phone search</a>'),
        ('search company phone', '<a href="https://linkfinderai.com/company-phone-finder">search company phone</a>'),
        ('company details finder', '<a href="https://linkfinderai.com/company-details-finder">company details finder</a>'),
        ('find company details', '<a href="https://linkfinderai.com/company-details-finder">find company details</a>'),
        ('company details search', '<a href="https://linkfinderai.com/company-details-finder">company details search</a>'),
        ('search company details', '<a href="https://linkfinderai.com/company-details-finder">search company details</a>'),
        ('company employee finder', '<a href="https://linkfinderai.com/company-employee-finder">company employee finder</a>'),
        ('find company employees', '<a href="https://linkfinderai.com/company-employee-finder">find company employees</a>'),
        ('search company employees', '<a href="https://linkfinderai.com/company-employee-finder">search company employees</a>')
    ],
    'company-phone-finder.html': [
        ('company URL finder', '<a href="https://linkfinderai.com/company-url-finder">company URL finder</a>'),
        ('find company URL', '<a href="https://linkfinderai.com/company-url-finder">find company URL</a>'),
        ('company URL search', '<a href="https://linkfinderai.com/company-url-finder">company URL search</a>'),
        ('search company URL', '<a href="https://linkfinderai.com/company-url-finder">search company URL</a>'),
        ('find company URLs', '<a href="https://linkfinderai.com/company-url-finder">find company URLs</a>'),
        ('company details finder', '<a href="https://linkfinderai.com/company-details-finder">company details finder</a>'),
        ('find company details', '<a href="https://linkfinderai.com/company-details-finder">find company details</a>'),
        ('company details search', '<a href="https://linkfinderai.com/company-details-finder">company details search</a>'),
        ('company employee finder', '<a href="https://linkfinderai.com/company-employee-finder">company employee finder</a>'),
        ('find company employees', '<a href="https://linkfinderai.com/company-employee-finder">find company employees</a>')
    ],
    'company-employee-finder.html': [
        ('company URL finder', '<a href="https://linkfinderai.com/company-url-finder">company URL finder</a>'),
        ('find company URL', '<a href="https://linkfinderai.com/company-url-finder">find company URL</a>'),
        ('find company URLs', '<a href="https://linkfinderai.com/company-url-finder">find company URLs</a>'),
        ('company URL search', '<a href="https://linkfinderai.com/company-url-finder">company URL search</a>'),
        ('LinkedIn email finder', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>'),
        ('find LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">find LinkedIn emails</a>'),
        ('LinkedIn email search', '<a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email search</a>'),
        ('extract LinkedIn emails', '<a href="https://linkfinderai.com/linkedin-email-finder">extract LinkedIn emails</a>'),
        ('company details finder', '<a href="https://linkfinderai.com/company-details-finder">company details finder</a>'),
        ('find company details', '<a href="https://linkfinderai.com/company-details-finder">find company details</a>'),
        ('company details search', '<a href="https://linkfinderai.com/company-details-finder">company details search</a>'),
        ('LinkedIn profile scraper', '<a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn profile scraper</a>'),
        ('scrape LinkedIn profiles', '<a href="https://linkfinderai.com/linkedin-profile-scraper">scrape LinkedIn profiles</a>')
    ],
    'company-details-finder.html': [
        ('company URL finder', '<a href="https://linkfinderai.com/company-url-finder">company URL finder</a>'),
        ('find company URL', '<a href="https://linkfinderai.com/company-url-finder">find company URL</a>'),
        ('find company URLs', '<a href="https://linkfinderai.com/company-url-finder">find company URLs</a>'),
        ('company URL search', '<a href="https://linkfinderai.com/company-url-finder">company URL search</a>'),
        ('B2B data enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B data enrichment</a>'),
        ('data enrichment tool', '<a href="https://linkfinderai.com/b2b-data-enrichment">data enrichment tool</a>'),
        ('enrich B2B data', '<a href="https://linkfinderai.com/b2b-data-enrichment">enrich B2B data</a>'),
        ('B2B enrichment', '<a href="https://linkfinderai.com/b2b-data-enrichment">B2B enrichment</a>'),
        ('company employee finder', '<a href="https://linkfinderai.com/company-employee-finder">company employee finder</a>'),
        ('find company employees', '<a href="https://linkfinderai.com/company-employee-finder">find company employees</a>'),
        ('search company employees', '<a href="https://linkfinderai.com/company-employee-finder">search company employees</a>'),
        ('company phone finder', '<a href="https://linkfinderai.com/company-phone-finder">company phone finder</a>'),
        ('find company phone', '<a href="https://linkfinderai.com/company-phone-finder">find company phone</a>')
    ],
    'find-company-employee-count.html': [
        ('company details finder', '<a href="https://linkfinderai.com/company-details-finder">company details finder</a>'),
        ('find company details', '<a href="https://linkfinderai.com/company-details-finder">find company details</a>'),
        ('company details search', '<a href="https://linkfinderai.com/company-details-finder">company details search</a>'),
        ('company employee finder', '<a href="https://linkfinderai.com/company-employee-finder">company employee finder</a>'),
        ('find company employees', '<a href="https://linkfinderai.com/company-employee-finder">find company employees</a>'),
        ('search company employees', '<a href="https://linkfinderai.com/company-employee-finder">search company employees</a>'),
        ('employee count finder', '<a href="https://linkfinderai.com/company-employee-finder">employee count finder</a>'),
        ('company URL finder', '<a href="https://linkfinderai.com/company-url-finder">company URL finder</a>'),
        ('find company URL', '<a href="https://linkfinderai.com/company-url-finder">find company URL</a>')
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
