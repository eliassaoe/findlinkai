import os
import re

# Category mappings for related pages
RELATED_PAGES = {
    # Alternative/Competitor pages
    'clay-alternative.html': [
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative'),
        ('Apollo alternative', 'https://linkfinderai.com/apollo-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    'phantombuster-alternative.html': [
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative'),
        ('Apify alternative', 'https://linkfinderai.com/apify-alternative'),
        ('Bright Data competitors', 'https://linkfinderai.com/bright-data-competitors')
    ],
    'apify-alternative.html': [
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative'),
        ('Scrapin alternative', 'https://linkfinderai.com/scrapin-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    'captain-data-alternative.html': [
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative'),
        ('Clearbit alternative', 'https://linkfinderai.com/clearbit-alternative'),
        ('Derrick App alternative', 'https://linkfinderai.com/derrick-app-alternative')
    ],
    'clearbit-alternative.html': [
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative'),
        ('Coresignal alternative', 'https://linkfinderai.com/coresignal-alternative'),
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative')
    ],
    'coresignal-alternative.html': [
        ('Clearbit alternative', 'https://linkfinderai.com/clearbit-alternative'),
        ('Derrick App alternative', 'https://linkfinderai.com/derrick-app-alternative'),
        ('Bright Data competitors', 'https://linkfinderai.com/bright-data-competitors')
    ],
    'derrick-app-alternative.html': [
        ('Coresignal alternative', 'https://linkfinderai.com/coresignal-alternative'),
        ('Scrapin alternative', 'https://linkfinderai.com/scrapin-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    'scrapin-alternative.html': [
        ('Apify alternative', 'https://linkfinderai.com/apify-alternative'),
        ('Derrick App alternative', 'https://linkfinderai.com/derrick-app-alternative'),
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative')
    ],
    'bright-data-competitors.html': [
        ('Coresignal alternative', 'https://linkfinderai.com/coresignal-alternative'),
        ('Apify alternative', 'https://linkfinderai.com/apify-alternative'),
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative')
    ],
    'linked-helper-competitors.html': [
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative'),
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    'skrapp-competitors.html': [
        ('Clearbit alternative', 'https://linkfinderai.com/clearbit-alternative'),
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    
    # Best-of comparison pages
    'best-lead-generation-tools.html': [
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best email enrichment', 'https://linkfinderai.com/best-email-enrichment-tools')
    ],
    'best-linkedin-scrapers.html': [
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('Best LinkedIn email extractor', 'https://linkfinderai.com/best-linkedin-email-extractor'),
        ('Best web spider', 'https://linkfinderai.com/best-web-spider')
    ],
    'best-b2b-data-enrichment-tools.html': [
        ('Best data cleaning tools', 'https://linkfinderai.com/best-data-cleaning-tools'),
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers'),
        ('Best lead enrichment API', 'https://linkfinderai.com/lead-enrichment-api')
    ],
    'best-instagram-scrapers.html': [
        ('Best social media finder', 'https://linkfinderai.com/best-social-media-finder'),
        ('Best Instagram API', 'https://linkfinderai.com/best-instagram-api-for-automations'),
        ('Best web spider', 'https://linkfinderai.com/best-web-spider')
    ],
    'best-b2b-data-providers.html': [
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best intent data providers', 'https://linkfinderai.com/best-intent-data-providers'),
        ('B2B data companies', 'https://linkfinderai.com/b2b-data-companies')
    ],
    'best-crm-cleaning-tools.html': [
        ('Best data cleaning tools', 'https://linkfinderai.com/best-data-cleaning-tools'),
        ('Best CRM software', 'https://linkfinderai.com/best-software-for-crm'),
        ('Best CRM integration', 'https://linkfinderai.com/best-crm-integration-with-linkedin')
    ],
    'best-linkedin-email-extractor.html': [
        ('Best email enrichment tools', 'https://linkfinderai.com/best-email-enrichment-tools'),
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers'),
        ('Best emails API', 'https://linkfinderai.com/best-emails-api-for-cold-outreach')
    ],
    'best-ai-sales-enablement-for-gtm-teams.html': [
        ('Best sales automation', 'https://linkfinderai.com/best-integrated-sales-and-data-automation-platform'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('AI tools for sales', 'https://linkfinderai.com/ai-tools-for-sales-teams')
    ],
    'best-crm-integration-with-linkedin.html': [
        ('Best CRM cleaning tools', 'https://linkfinderai.com/best-crm-cleaning-tools'),
        ('Best CRM software', 'https://linkfinderai.com/best-software-for-crm'),
        ('Best LinkedIn enrichment', 'https://linkfinderai.com/best-platforms-for-automatic-linkedin-profile-enrichment-in-crms')
    ],
    'best-data-cleaning-tools.html': [
        ('Best CRM cleaning', 'https://linkfinderai.com/best-crm-cleaning-tools'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Data enrichment API', 'https://linkfinderai.com/data-enrichment-api')
    ],
    'best-emails-api-for-cold-outreach.html': [
        ('Best email enrichment', 'https://linkfinderai.com/best-email-enrichment-tools'),
        ('Best LinkedIn email extractor', 'https://linkfinderai.com/best-linkedin-email-extractor'),
        ('Best lead generation API', 'https://linkfinderai.com/best-lead-generation-api')
    ],
    'best-instagram-api-for-automations.html': [
        ('Best Instagram scrapers', 'https://linkfinderai.com/best-instagram-scrapers'),
        ('Best social media finder', 'https://linkfinderai.com/best-social-media-finder'),
        ('Best web spider', 'https://linkfinderai.com/best-web-spider')
    ],
    'best-integrated-sales-and-data-automation-platform.html': [
        ('Best AI sales enablement', 'https://linkfinderai.com/best-ai-sales-enablement-for-gtm-teams'),
        ('Best marketing automation', 'https://linkfinderai.com/top-best-marketing-automation-platforms'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools')
    ],
    'best-intent-data-providers.html': [
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best lead scoring', 'https://linkfinderai.com/best-lead-scoring-software')
    ],
    'best-lead-generation-api.html': [
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('Best emails API', 'https://linkfinderai.com/best-emails-api-for-cold-outreach'),
        ('Data enrichment API', 'https://linkfinderai.com/data-enrichment-api')
    ],
    'best-lead-scoring-software.html': [
        ('Best intent data providers', 'https://linkfinderai.com/best-intent-data-providers'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('Best AI sales enablement', 'https://linkfinderai.com/best-ai-sales-enablement-for-gtm-teams')
    ],
    'best-platforms-for-automatic-linkedin-profile-enrichment-in-crms.html': [
        ('Best CRM integration', 'https://linkfinderai.com/best-crm-integration-with-linkedin'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers')
    ],
    'best-price-scraping-tools.html': [
        ('Best web spider', 'https://linkfinderai.com/best-web-spider'),
        ('Best tool to scrape website', 'https://linkfinderai.com/best-tool-to-scrape-website'),
        ('Best proxy providers', 'https://linkfinderai.com/best-proxy-providers')
    ],
    'best-proxy-providers.html': [
        ('Best price scraping tools', 'https://linkfinderai.com/best-price-scraping-tools'),
        ('Best web spider', 'https://linkfinderai.com/best-web-spider'),
        ('Best tool to scrape website', 'https://linkfinderai.com/best-tool-to-scrape-website')
    ],
    'best-recruitment-sofware-tools.html': [
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers'),
        ('Best company research tool', 'https://linkfinderai.com/best-company-research-tool-for-prospecting'),
        ('Best email enrichment', 'https://linkfinderai.com/best-email-enrichment-tools')
    ],
    'best-social-media-finder.html': [
        ('Best Instagram scrapers', 'https://linkfinderai.com/best-instagram-scrapers'),
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers'),
        ('Best Instagram API', 'https://linkfinderai.com/best-instagram-api-for-automations')
    ],
    'best-software-for-crm.html': [
        ('Best CRM integration', 'https://linkfinderai.com/best-crm-integration-with-linkedin'),
        ('Best CRM cleaning', 'https://linkfinderai.com/best-crm-cleaning-tools'),
        ('Best data cleaning', 'https://linkfinderai.com/best-data-cleaning-tools')
    ],
    'best-tool-to-scrape-website.html': [
        ('Best web spider', 'https://linkfinderai.com/best-web-spider'),
        ('Best price scraping', 'https://linkfinderai.com/best-price-scraping-tools'),
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers')
    ],
    'best-web-spider.html': [
        ('Best tool to scrape website', 'https://linkfinderai.com/best-tool-to-scrape-website'),
        ('Best price scraping', 'https://linkfinderai.com/best-price-scraping-tools'),
        ('Best proxy providers', 'https://linkfinderai.com/best-proxy-providers')
    ],
    'best-email-enrichment-tools.html': [
        ('Best LinkedIn email extractor', 'https://linkfinderai.com/best-linkedin-email-extractor'),
        ('Best emails API', 'https://linkfinderai.com/best-emails-api-for-cold-outreach'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools')
    ],
    'best-free-lead-generation-tools.html': [
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('Best lead generation API', 'https://linkfinderai.com/best-lead-generation-api'),
        ('Best email enrichment', 'https://linkfinderai.com/best-email-enrichment-tools')
    ],
    'best-company-research-tool-for-prospecting.html': [
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers'),
        ('Best intent data providers', 'https://linkfinderai.com/best-intent-data-providers'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools')
    ],
    'top-best-marketing-automation-platforms.html': [
        ('Best sales automation', 'https://linkfinderai.com/best-integrated-sales-and-data-automation-platform'),
        ('Best AI sales enablement', 'https://linkfinderai.com/best-ai-sales-enablement-for-gtm-teams'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools')
    ],
    'ai-tools-for-sales-teams.html': [
        ('Best AI sales enablement', 'https://linkfinderai.com/best-ai-sales-enablement-for-gtm-teams'),
        ('Best sales automation', 'https://linkfinderai.com/best-integrated-sales-and-data-automation-platform'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools')
    ],
    'b2b-data-companies.html': [
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Data enrichment company', 'https://linkfinderai.com/data-enrichment-company')
    ],
    'data-enrichment-company.html': [
        ('B2B data companies', 'https://linkfinderai.com/b2b-data-companies'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers')
    ]
}

def add_related_box(content, filename):
    """Add related pages box before footer"""
    if filename not in RELATED_PAGES:
        return content
    
    if 'related-pages-box' in content or '<footer' not in content:
        return content
    
    related = RELATED_PAGES[filename]
    
    box = '\n<div class="related-pages-box" style="max-width:700px;margin:40px auto;padding:24px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;">\n'
    box += '<p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#78350f;">🔗 Related Comparisons:</p>\n'
    box += '<div style="display:flex;flex-direction:column;gap:10px;">\n'
    
    for title, url in related:
        box += f'<a href="{url}" style="padding:12px 16px;background:white;border:1px solid #fde68a;border-radius:6px;text-decoration:none;color:#b45309;font-size:14px;transition:all 0.2s;display:block;">→ {title}</a>\n'
    
    box += '</div></div>\n\n'
    
    return content.replace('<footer', box + '<footer', 1)

# Process pages
count = 0
total = 0

for filename in RELATED_PAGES.keys():
    total += 1
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        content = add_related_box(content, filename)
        
        if content != original:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(content)
            count += 1
            print(f"✓ {filename}")
    except Exception as e:
        print(f"✗ {filename}: {e}")

print(f"\n{'='*70}")
print(f"✅ Added related pages boxes to {count}/{total} pages")
print(f"🔗 Alternative pages → Similar alternatives")
print(f"🔗 Best-of pages → Similar comparisons")
print(f"📦 Box style: Yellow with related comparisons")
print(f"{'='*70}")
EOFcat > add_related_pages.py << 'EOF'
import os
import re

# Category mappings for related pages
RELATED_PAGES = {
    # Alternative/Competitor pages
    'clay-alternative.html': [
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative'),
        ('Apollo alternative', 'https://linkfinderai.com/apollo-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    'phantombuster-alternative.html': [
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative'),
        ('Apify alternative', 'https://linkfinderai.com/apify-alternative'),
        ('Bright Data competitors', 'https://linkfinderai.com/bright-data-competitors')
    ],
    'apify-alternative.html': [
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative'),
        ('Scrapin alternative', 'https://linkfinderai.com/scrapin-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    'captain-data-alternative.html': [
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative'),
        ('Clearbit alternative', 'https://linkfinderai.com/clearbit-alternative'),
        ('Derrick App alternative', 'https://linkfinderai.com/derrick-app-alternative')
    ],
    'clearbit-alternative.html': [
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative'),
        ('Coresignal alternative', 'https://linkfinderai.com/coresignal-alternative'),
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative')
    ],
    'coresignal-alternative.html': [
        ('Clearbit alternative', 'https://linkfinderai.com/clearbit-alternative'),
        ('Derrick App alternative', 'https://linkfinderai.com/derrick-app-alternative'),
        ('Bright Data competitors', 'https://linkfinderai.com/bright-data-competitors')
    ],
    'derrick-app-alternative.html': [
        ('Coresignal alternative', 'https://linkfinderai.com/coresignal-alternative'),
        ('Scrapin alternative', 'https://linkfinderai.com/scrapin-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    'scrapin-alternative.html': [
        ('Apify alternative', 'https://linkfinderai.com/apify-alternative'),
        ('Derrick App alternative', 'https://linkfinderai.com/derrick-app-alternative'),
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative')
    ],
    'bright-data-competitors.html': [
        ('Coresignal alternative', 'https://linkfinderai.com/coresignal-alternative'),
        ('Apify alternative', 'https://linkfinderai.com/apify-alternative'),
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative')
    ],
    'linked-helper-competitors.html': [
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative'),
        ('Phantombuster alternative', 'https://linkfinderai.com/phantombuster-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    'skrapp-competitors.html': [
        ('Clearbit alternative', 'https://linkfinderai.com/clearbit-alternative'),
        ('Clay alternative', 'https://linkfinderai.com/clay-alternative'),
        ('Captain Data alternative', 'https://linkfinderai.com/captain-data-alternative')
    ],
    
    # Best-of comparison pages
    'best-lead-generation-tools.html': [
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best email enrichment', 'https://linkfinderai.com/best-email-enrichment-tools')
    ],
    'best-linkedin-scrapers.html': [
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('Best LinkedIn email extractor', 'https://linkfinderai.com/best-linkedin-email-extractor'),
        ('Best web spider', 'https://linkfinderai.com/best-web-spider')
    ],
    'best-b2b-data-enrichment-tools.html': [
        ('Best data cleaning tools', 'https://linkfinderai.com/best-data-cleaning-tools'),
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers'),
        ('Best lead enrichment API', 'https://linkfinderai.com/lead-enrichment-api')
    ],
    'best-instagram-scrapers.html': [
        ('Best social media finder', 'https://linkfinderai.com/best-social-media-finder'),
        ('Best Instagram API', 'https://linkfinderai.com/best-instagram-api-for-automations'),
        ('Best web spider', 'https://linkfinderai.com/best-web-spider')
    ],
    'best-b2b-data-providers.html': [
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best intent data providers', 'https://linkfinderai.com/best-intent-data-providers'),
        ('B2B data companies', 'https://linkfinderai.com/b2b-data-companies')
    ],
    'best-crm-cleaning-tools.html': [
        ('Best data cleaning tools', 'https://linkfinderai.com/best-data-cleaning-tools'),
        ('Best CRM software', 'https://linkfinderai.com/best-software-for-crm'),
        ('Best CRM integration', 'https://linkfinderai.com/best-crm-integration-with-linkedin')
    ],
    'best-linkedin-email-extractor.html': [
        ('Best email enrichment tools', 'https://linkfinderai.com/best-email-enrichment-tools'),
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers'),
        ('Best emails API', 'https://linkfinderai.com/best-emails-api-for-cold-outreach')
    ],
    'best-ai-sales-enablement-for-gtm-teams.html': [
        ('Best sales automation', 'https://linkfinderai.com/best-integrated-sales-and-data-automation-platform'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('AI tools for sales', 'https://linkfinderai.com/ai-tools-for-sales-teams')
    ],
    'best-crm-integration-with-linkedin.html': [
        ('Best CRM cleaning tools', 'https://linkfinderai.com/best-crm-cleaning-tools'),
        ('Best CRM software', 'https://linkfinderai.com/best-software-for-crm'),
        ('Best LinkedIn enrichment', 'https://linkfinderai.com/best-platforms-for-automatic-linkedin-profile-enrichment-in-crms')
    ],
    'best-data-cleaning-tools.html': [
        ('Best CRM cleaning', 'https://linkfinderai.com/best-crm-cleaning-tools'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Data enrichment API', 'https://linkfinderai.com/data-enrichment-api')
    ],
    'best-emails-api-for-cold-outreach.html': [
        ('Best email enrichment', 'https://linkfinderai.com/best-email-enrichment-tools'),
        ('Best LinkedIn email extractor', 'https://linkfinderai.com/best-linkedin-email-extractor'),
        ('Best lead generation API', 'https://linkfinderai.com/best-lead-generation-api')
    ],
    'best-instagram-api-for-automations.html': [
        ('Best Instagram scrapers', 'https://linkfinderai.com/best-instagram-scrapers'),
        ('Best social media finder', 'https://linkfinderai.com/best-social-media-finder'),
        ('Best web spider', 'https://linkfinderai.com/best-web-spider')
    ],
    'best-integrated-sales-and-data-automation-platform.html': [
        ('Best AI sales enablement', 'https://linkfinderai.com/best-ai-sales-enablement-for-gtm-teams'),
        ('Best marketing automation', 'https://linkfinderai.com/top-best-marketing-automation-platforms'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools')
    ],
    'best-intent-data-providers.html': [
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best lead scoring', 'https://linkfinderai.com/best-lead-scoring-software')
    ],
    'best-lead-generation-api.html': [
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('Best emails API', 'https://linkfinderai.com/best-emails-api-for-cold-outreach'),
        ('Data enrichment API', 'https://linkfinderai.com/data-enrichment-api')
    ],
    'best-lead-scoring-software.html': [
        ('Best intent data providers', 'https://linkfinderai.com/best-intent-data-providers'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('Best AI sales enablement', 'https://linkfinderai.com/best-ai-sales-enablement-for-gtm-teams')
    ],
    'best-platforms-for-automatic-linkedin-profile-enrichment-in-crms.html': [
        ('Best CRM integration', 'https://linkfinderai.com/best-crm-integration-with-linkedin'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers')
    ],
    'best-price-scraping-tools.html': [
        ('Best web spider', 'https://linkfinderai.com/best-web-spider'),
        ('Best tool to scrape website', 'https://linkfinderai.com/best-tool-to-scrape-website'),
        ('Best proxy providers', 'https://linkfinderai.com/best-proxy-providers')
    ],
    'best-proxy-providers.html': [
        ('Best price scraping tools', 'https://linkfinderai.com/best-price-scraping-tools'),
        ('Best web spider', 'https://linkfinderai.com/best-web-spider'),
        ('Best tool to scrape website', 'https://linkfinderai.com/best-tool-to-scrape-website')
    ],
    'best-recruitment-sofware-tools.html': [
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers'),
        ('Best company research tool', 'https://linkfinderai.com/best-company-research-tool-for-prospecting'),
        ('Best email enrichment', 'https://linkfinderai.com/best-email-enrichment-tools')
    ],
    'best-social-media-finder.html': [
        ('Best Instagram scrapers', 'https://linkfinderai.com/best-instagram-scrapers'),
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers'),
        ('Best Instagram API', 'https://linkfinderai.com/best-instagram-api-for-automations')
    ],
    'best-software-for-crm.html': [
        ('Best CRM integration', 'https://linkfinderai.com/best-crm-integration-with-linkedin'),
        ('Best CRM cleaning', 'https://linkfinderai.com/best-crm-cleaning-tools'),
        ('Best data cleaning', 'https://linkfinderai.com/best-data-cleaning-tools')
    ],
    'best-tool-to-scrape-website.html': [
        ('Best web spider', 'https://linkfinderai.com/best-web-spider'),
        ('Best price scraping', 'https://linkfinderai.com/best-price-scraping-tools'),
        ('Best LinkedIn scrapers', 'https://linkfinderai.com/best-linkedin-scrapers')
    ],
    'best-web-spider.html': [
        ('Best tool to scrape website', 'https://linkfinderai.com/best-tool-to-scrape-website'),
        ('Best price scraping', 'https://linkfinderai.com/best-price-scraping-tools'),
        ('Best proxy providers', 'https://linkfinderai.com/best-proxy-providers')
    ],
    'best-email-enrichment-tools.html': [
        ('Best LinkedIn email extractor', 'https://linkfinderai.com/best-linkedin-email-extractor'),
        ('Best emails API', 'https://linkfinderai.com/best-emails-api-for-cold-outreach'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools')
    ],
    'best-free-lead-generation-tools.html': [
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools'),
        ('Best lead generation API', 'https://linkfinderai.com/best-lead-generation-api'),
        ('Best email enrichment', 'https://linkfinderai.com/best-email-enrichment-tools')
    ],
    'best-company-research-tool-for-prospecting.html': [
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers'),
        ('Best intent data providers', 'https://linkfinderai.com/best-intent-data-providers'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools')
    ],
    'top-best-marketing-automation-platforms.html': [
        ('Best sales automation', 'https://linkfinderai.com/best-integrated-sales-and-data-automation-platform'),
        ('Best AI sales enablement', 'https://linkfinderai.com/best-ai-sales-enablement-for-gtm-teams'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools')
    ],
    'ai-tools-for-sales-teams.html': [
        ('Best AI sales enablement', 'https://linkfinderai.com/best-ai-sales-enablement-for-gtm-teams'),
        ('Best sales automation', 'https://linkfinderai.com/best-integrated-sales-and-data-automation-platform'),
        ('Best lead generation tools', 'https://linkfinderai.com/best-lead-generation-tools')
    ],
    'b2b-data-companies.html': [
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Data enrichment company', 'https://linkfinderai.com/data-enrichment-company')
    ],
    'data-enrichment-company.html': [
        ('B2B data companies', 'https://linkfinderai.com/b2b-data-companies'),
        ('Best B2B data enrichment', 'https://linkfinderai.com/best-b2b-data-enrichment-tools'),
        ('Best B2B data providers', 'https://linkfinderai.com/best-b2b-data-providers')
    ]
}

def add_related_box(content, filename):
    """Add related pages box before footer"""
    if filename not in RELATED_PAGES:
        return content
    
    if 'related-pages-box' in content or '<footer' not in content:
        return content
    
    related = RELATED_PAGES[filename]
    
    box = '\n<div class="related-pages-box" style="max-width:700px;margin:40px auto;padding:24px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;">\n'
    box += '<p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#78350f;">🔗 Related Comparisons:</p>\n'
    box += '<div style="display:flex;flex-direction:column;gap:10px;">\n'
    
    for title, url in related:
        box += f'<a href="{url}" style="padding:12px 16px;background:white;border:1px solid #fde68a;border-radius:6px;text-decoration:none;color:#b45309;font-size:14px;transition:all 0.2s;display:block;">→ {title}</a>\n'
    
    box += '</div></div>\n\n'
    
    return content.replace('<footer', box + '<footer', 1)

# Process pages
count = 0
total = 0

for filename in RELATED_PAGES.keys():
    total += 1
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        content = add_related_box(content, filename)
        
        if content != original:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(content)
            count += 1
            print(f"✓ {filename}")
    except Exception as e:
        print(f"✗ {filename}: {e}")

print(f"\n{'='*70}")
print(f"✅ Added related pages boxes to {count}/{total} pages")
print(f"🔗 Alternative pages → Similar alternatives")
print(f"🔗 Best-of pages → Similar comparisons")
print(f"📦 Box style: Yellow with related comparisons")
print(f"{'='*70}")
