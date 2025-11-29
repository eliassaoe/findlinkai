import os
import re

# Le nouveau footer
NEW_FOOTER = '''

<footer class="footer">
<div class="container">
<div class="footer-grid">
<!-- Brand Section -->
<div class="footer-section">
<div class="footer-logo">
<div class="logo-icon">
<i class="fas fa-search"></i>
</div>
<span class="logo-text">LinkFinder AI</span>
</div>
<p class="footer-description">
Professional tools for extracting company data from LinkedIn. Streamline your business research and competitive intelligence.
</p>
</div>


<!-- Tools Section -->
<div class="footer-section">
<h4 class="footer-heading">Our Tools</h4>
<ul class="footer-links">
<li><a href="https://linkfinderai.com/company-url-finder" title="Find company websites and URLs">Company URL Finder</a></li>
<li><a href="https://linkfinderai.com/linkedin-url-finder" title="Find LinkedIn profile urls">LinkedIn URL Finder</a></li>
<li><a href="https://linkfinderai.com/company-phone-finder" title="Find company phone numbers">Company Phone Finder</a></li>
<li><a href="https://linkfinderai.com/company-employee-finder" title="Find company employees">Company Employee Finder</a></li>
<li><a href="https://linkfinderai.com/company-details-finder" title="Find comprehensive company details">Company Details Finder</a></li>
<li><a href="https://linkfinderai.com/find-company-employee-count" title="Find company employee count">Company Employee Count</a></li>
<li><a href="https://linkfinderai.com/linkedin-search-by-email" title="Search LinkedIn by email">LinkedIn Search by Email</a></li>
<li><a href="https://linkfinderai.com/linkedin-company-scraper" title="Extract LinkedIn company data">LinkedIn Company Scraper</a></li>
<li><a href="https://linkfinderai.com/linkedin-profile-scraper" title="Extract LinkedIn profile data">LinkedIn Profile Scraper</a></li>
<li><a href="https://linkfinderai.com/linkedin-email-finder" title="Find emails from LinkedIn profiles">LinkedIn Email Finder</a></li>
<li><a href="https://linkfinderai.com/instagram-profile-scraper" title="Extract Instagram profile data">Instagram Profile Scraper</a></li>
<li><a href="https://linkfinderai.com/instagram-profile-url-finder" title="Find Instagram profile urls">Instagram Url Finder</a></li>
<li><a href="https://linkfinderai.com/scrape-linkedIn-jobs" title="Extract Linkedin jobs data">Scrape Linkedin Jobs</a></li>
<li><a href="https://linkfinderai.com/linkedin-post-commenters-export" title="LinkedIn Post Commenters Export">LinkedIn Post Commenters Export</a></li>
<li><a href="https://linkfinderai.com/linkedin-post-date-extractor" title="LinkedIn Post Date Extractor">LinkedIn Post Date Extractor</a></li>
<li><a href="https://linkfinderai.com/linkedin-company-post-scraper" title="LinkedIn Company Post Scraper">LinkedIn Company Post Scraper</a></li>
</ul>
</div>


<!-- Compare Section -->
<div class="footer-section">
<h4 class="footer-heading">Compare</h4>
<ul class="footer-links">
<li><a href="https://linkfinderai.com/apify-alternative" title="LinkFinder AI vs Apify">Apify Alternative</a></li>
<li><a href="https://linkfinderai.com/clay-alternative" title="LinkFinder AI vs Clay">Clay Alternative</a></li>
<li><a href="https://linkfinderai.com/coresignal-alternative" title="LinkFinder AI vs Coresignal">Coresignal Alternative</a></li>
<li><a href="https://linkfinderai.com/derrick-app-alternative" title="LinkFinder AI vs Derrick App">Derrick App Alternative</a></li>
<li><a href="https://linkfinderai.com/phantombuster-alternative" title="LinkFinder AI vs PhantomBuster">PhantomBuster Alternative</a></li>
<li><a href="https://linkfinderai.com/captain-data-alternative" title="LinkFinder AI vs Captain Data">Captain Data Alternative</a></li>
<li><a href="https://linkfinderai.com/clearbit-alternative" title="LinkFinder AI vs Clearbit">Clearbit Alternative</a></li>
<li><a href="https://linkfinderai.com/scrapin-alternative" title="LinkFinder AI vs Scrapin">Scrapin Alternative</a></li>
<li><a href="https://linkfinderai.com/blog" title="Blog">Blog</a></li>
</ul>
</div>


<!-- Features Section -->
<div class="footer-section">
<h4 class="footer-heading">Features</h4>
<ul class="footer-links">
<li><a href="https://linkfinderai.com/b2b-data-enrichment" title="B2B data enrichment">B2B data enrichment</a></li>
<li><a href="https://linkfinderai.com/data-enrichment-api" title="Data enrichment API">Data enrichment API</a></li>
<li><a href="https://linkfinderai.com/data-enrichment-company" title="Data Enrichment Company">Data Enrichment Company</a></li>
<li><a href="https://linkfinderai.com/lead-enrichment-api" title="Lead Enrichment API">Lead Enrichment API</a></li>
<li><a href="https://linkfinderai.com/linkedin-scraper" title="Linkedin Scraper">Linkedin Scraper</a></li>
<li><a href="https://linkfinderai.com/b2b-data-companies" title="B2B Data Companies">B2B Data Companies</a></li>
</ul>
</div>


<!-- Support Section -->
<div class="footer-section">
<h4 class="footer-heading">Support</h4>
<ul class="footer-links">
<li><a href="mailto:support@unlimited-leads.online">support@unlimited-leads.online</a></li>
<li><a href="https://linkfinderai.com/api-documentation" title="API documentation">API documentation</a></li>
<li><a href="https://linkfinderai.com/pricing" title="Pricing">Pricing</a></li>
<li><a href="https://linkfinderai.com/privacy" title="Privacy policy">Privacy Policy</a></li>
<li><a href="https://linkfinderai.com/terms" title="Terms of service">Terms of Service</a></li>
<li><a href="https://linkfinderai.com/about-us" title="About us">About Us</a></li>
<li><a href="https://linkfinderai.com/blog" title="Blog">Blog</a></li>
<li><a href="https://calendly.com/hamoureliasse/compensated-interview-unlimited-leads-clone" title="Book a call with sales" target="_blank"><i class="fas fa-calendar-alt"></i> Book a Call</a></li>
<li><a href="https://www.linkedin.com/in/eliasse-hamour-08194821a/" title="Follow us on LinkedIn" target="_blank"><i class="fab fa-linkedin"></i> LinkedIn</a></li>
<li><a href="https://www.youtube.com/" title="Subscribe to our YouTube" target="_blank"><i class="fab fa-youtube"></i> YouTube</a></li>
<li><a href="https://trustpilot.com/review/linkfinderai.com" title="See our Trustpilot reviews" target="_blank"><i class="fab fa-trustpilot"></i> Trustpilot Reviews</a></li>
</ul>
</div>
</div>


<!-- Footer Bottom -->
<div class="footer-bottom">
<p>&copy; 2025 LinkFinderAI. All rights reserved.</p>
</div>






</div>
</footer>

'''

count = 0
updated_files = []

for file in os.listdir('.'):
    if file.endswith('.html'):
        try:
            with open(file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original = content
            
            # Pattern pour capturer le footer existant (de <footer jusqu'à </footer>)
            footer_pattern = r'<footer\s+class="footer">.*?</footer>'
            
            # Remplacer le footer
            content = re.sub(footer_pattern, NEW_FOOTER.strip(), content, flags=re.DOTALL)
            
            if content != original:
                with open(file, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"✓ {file}")
                count += 1
                updated_files.append(file)
        except Exception as e:
            print(f"✗ {file}: {e}")

print(f"\n✅ {count} fichiers mis à jour")
if updated_files:
    print(f"\nFichiers modifiés:")
    for f in updated_files:
        print(f"  - {f}")
