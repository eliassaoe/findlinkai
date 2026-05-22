#!/usr/bin/env python3
import re, sys
from pathlib import Path

CLEAN_FOOTER = '''<footer class="footer">
    <div class="container">
        <div class="footer-grid">
            <div class="footer-section">
                <div class="footer-logo">
                    <div class="logo-icon"><i class="fas fa-search"></i></div>
                    <span class="logo-text">Linkfinder AI</span>
                </div>
                <p class="footer-description">B2B contact data enrichment for sales, marketing, and recruitment teams. Verified business intelligence at scale.</p>
            </div>
            <div class="footer-section">
                <h4 class="footer-heading">Product</h4>
                <ul class="footer-links">
                    <li><a href="https://linkfinderai.com/pricing">Pricing</a></li>
                    <li><a href="https://linkfinderai.com/api-documentation">API Documentation</a></li>
                    <li><a href="https://linkfinderai.com/b2b-data-enrichment">B2B Data Enrichment</a></li>
                    <li><a href="https://linkfinderai.com/data-enrichment-api">Data Enrichment API</a></li>
                    <li><a href="https://linkfinderai.com/blog">Blog</a></li>
                </ul>
            </div>
            <div class="footer-section">
                <h4 class="footer-heading">Company</h4>
                <ul class="footer-links">
                    <li><a href="https://linkfinderai.com/about-us">About Us</a></li>
                    <li><a href="https://linkfinderai.com/mentions-legales">Legal Information</a></li>
                    <li><a href="https://linkfinderai.com/privacy">Privacy Policy</a></li>
                    <li><a href="https://linkfinderai.com/terms">Terms of Service</a></li>
                    <li><a href="https://linkfinderai.com/refund-policy">Refund Policy</a></li>
                </ul>
            </div>
            <div class="footer-section">
                <h4 class="footer-heading">Support</h4>
                <ul class="footer-links">
                    <li><a href="mailto:support@linkfinderai.com">support@linkfinderai.com</a></li>
                    <li><a href="https://trustpilot.com/review/linkfinderai.com" target="_blank" rel="noopener"><i class="fab fa-trustpilot"></i> Trustpilot Reviews</a></li>
                    <li><a href="https://www.linkedin.com/in/eliasse-hamour-08194821a/" target="_blank" rel="noopener"><i class="fab fa-linkedin"></i> LinkedIn</a></li>
                </ul>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 Linkfinder AI &mdash; Eliasse Hamour. All rights reserved.</p>
            <p class="legal-line" style="color:#6b7280;font-size:0.78rem;margin-top:0.5rem;">SIRET 937 788 172 00016 &mdash; VAT FR02937788172 &mdash; 26 Rue de la Coopération, 93240 Stains, France</p>
        </div>
    </div>
</footer>'''

FOOTER_REGEX = re.compile(r'<footer\s+class="footer"[^>]*>.*?</footer>', re.DOTALL | re.IGNORECASE)
CLEAN_MARKER = 'SIRET 937 788 172 00016'

def process_file(path):
    try:
        original = path.read_text(encoding='utf-8')
    except: return ('error', 'read failed')
    if CLEAN_MARKER in original: return ('already_clean', 'ok')
    matches = FOOTER_REGEX.findall(original)
    if not matches: return ('skipped', 'no footer')
    if len(matches) > 1: return ('skipped', 'multiple footers')
    new_content = FOOTER_REGEX.sub(CLEAN_FOOTER, original, count=1)
    if new_content == original: return ('skipped', 'no replacement')
    try: path.write_text(new_content, encoding='utf-8')
    except: return ('error', 'write failed')
    return ('changed', 'ok')

def main():
    html_files = sorted(Path('.').glob('*.html'))
    counts = {'changed': 0, 'skipped': 0, 'error': 0, 'already_clean': 0}
    for f in html_files:
        status, _ = process_file(f)
        counts[status] += 1
    print(f'Changed: {counts["changed"]} | Already clean: {counts["already_clean"]} | Skipped: {counts["skipped"]} | Errors: {counts["error"]} | Total: {len(html_files)}')

if __name__ == '__main__': main()
