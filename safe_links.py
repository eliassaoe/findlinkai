import os
import re

# Simple targeted links - only where they make sense
SMART_LINKS = {
    'linkedin-scraper.html': [
        ('LinkedIn email finder', 'linkedin-email-finder.html'),
        ('LinkedIn company data', 'linkedin-company-scraper.html')
    ],
    'linkedin-email-finder.html': [
        ('LinkedIn profile scraper', 'linkedin-profile-scraper.html'),
        ('find company employees', 'company-employee-finder.html')
    ],
    'linkedin-profile-scraper.html': [
        ('extract email addresses', 'linkedin-email-finder.html'),
        ('company information', 'linkedin-company-scraper.html')
    ],
    'linkedin-company-scraper.html': [
        ('company details', 'company-details-finder.html'),
        ('employee data', 'company-employee-finder.html')
    ],
    'company-url-finder.html': [
        ('company phone numbers', 'company-phone-finder.html'),
        ('employee information', 'company-employee-finder.html')
    ],
    'company-phone-finder.html': [
        ('company websites', 'company-url-finder.html'),
        ('company data', 'company-details-finder.html')
    ],
    'company-employee-finder.html': [
        ('company URLs', 'company-url-finder.html'),
        ('email addresses', 'linkedin-email-finder.html')
    ],
    'company-details-finder.html': [
        ('find websites', 'company-url-finder.html'),
        ('B2B data enrichment', 'b2b-data-enrichment.html')
    ],
    'b2b-data-enrichment.html': [
        ('enrichment API', 'data-enrichment-api.html'),
        ('lead enrichment', 'lead-enrichment-api.html')
    ],
    'instagram-profile-scraper.html': [
        ('Instagram URLs', 'instagram-profile-url-finder.html')
    ],
    'clay-alternative.html': [
        ('LinkedIn scraping', 'linkedin-scraper.html'),
        ('data enrichment', 'b2b-data-enrichment.html')
    ],
    'phantombuster-alternative.html': [
        ('LinkedIn automation', 'linkedin-scraper.html')
    ],
    'best-lead-generation-tools.html': [
        ('email finder', 'linkedin-email-finder.html'),
        ('company websites', 'company-url-finder.html')
    ]
}

def add_link_to_paragraph(content, filename):
    """Add ONE natural link in existing paragraph"""
    if filename not in SMART_LINKS:
        return content
    
    # Check if already modified
    if 'internal-link-added' in content:
        return content
    
    links = SMART_LINKS[filename]
    
    # Find all paragraphs with substantial text (50+ chars)
    paragraphs = re.finditer(r'<p(?![^>]*class="internal-link)[^>]*>(.{50,500}?)</p>', content, re.DOTALL)
    para_list = list(paragraphs)
    
    if len(para_list) < 2:
        return content
    
    # Choose middle paragraph
    target_para = para_list[len(para_list) // 2]
    para_text = target_para.group(1)
    
    # Try to insert first link naturally
    anchor_text, target_url = links[0]
    
    # Create natural sentence variations
    templates = [
        f' You can also use our <a href="{target_url}" class="internal-link-added">{anchor_text}</a> tool.',
        f' Our <a href="{target_url}" class="internal-link-added">{anchor_text}</a> feature works great with this.',
        f' Learn more about <a href="{target_url}" class="internal-link-added">{anchor_text}</a>.',
        f' Check out our <a href="{target_url}" class="internal-link-added">{anchor_text}</a> solution.'
    ]
    
    # Add link at the end of paragraph
    new_para_text = para_text.rstrip() + templates[0]
    new_paragraph = target_para.group(0).replace(para_text, new_para_text)
    
    # Replace in content
    content = content.replace(target_para.group(0), new_paragraph, 1)
    
    return content

def add_mini_related_section(content, filename):
    """Add tiny related tools box before footer"""
    if filename not in SMART_LINKS:
        return content
    
    if 'mini-related-box' in content or '<footer' not in content:
        return content
    
    links = SMART_LINKS[filename][:2]  # Max 2 links
    
    box = '\n<!-- Related Tools -->\n'
    box += '<div class="mini-related-box" style="max-width:600px;margin:40px auto;padding:20px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">\n'
    box += '<p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#374151;">Related Tools:</p>\n'
    box += '<div style="display:flex;gap:10px;flex-wrap:wrap;">\n'
    
    for anchor_text, url in links:
        title = anchor_text.title()
        box += f'<a href="{url}" style="padding:8px 14px;background:white;border:1px solid #d1d5db;border-radius:6px;text-decoration:none;color:#2563eb;font-size:13px;">{title}</a>\n'
    
    box += '</div></div>\n\n'
    
    # Insert before footer
    content = content.replace('<footer', box + '<footer', 1)
    
    return content

# Process files
count = 0
skip = ['index.html', 'log-in.html', 'sign-up.html', 'account.html', 'pricing.html', 
        'privacy.html', 'terms.html', 'app.html', 'api-documentation.html']

for file in os.listdir('.'):
    if file.endswith('.html') and file not in skip:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original = content
            
            # Add 1 contextual link in content
            content = add_link_to_paragraph(content, file)
            
            # Add small related box before footer
            content = add_mini_related_section(content, file)
            
            if content != original:
                with open(file, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"✓ {file}")
                count += 1
                
        except Exception as e:
            print(f"✗ {file}: {e}")

print(f"\n✅ {count} pages updated with safe internal links")
print("📊 Strategy: 1 contextual link + 2 related tools = 3 links max per page")
