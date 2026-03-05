import os, re

MODAL = '''
<div id="limitModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999; align-items:center; justify-content:center; padding:1rem;">
  <div style="background:white; border-radius:16px; padding:2.5rem; max-width:480px; width:100%; text-align:center; box-shadow:0 25px 50px rgba(0,0,0,0.3);">
    <div style="font-size:3rem; margin-bottom:1rem;">🎉</div>
    <h2 style="font-size:1.75rem; font-weight:700; color:#111827; margin-bottom:0.75rem;">You have seen what LinkFinder can do</h2>
    <p style="color:#6b7280; margin-bottom:2rem; font-size:1rem;">You have used your 10 free searches. Sign up to keep going - no credit card required.</p>
    <a href="https://linkfinderai.com/sign-up" style="display:block; background:#2563eb; color:white; padding:1rem; border-radius:8px; font-weight:600; font-size:1rem; text-decoration:none; margin-bottom:0.75rem;">Try for free</a>
    <p style="font-size:0.75rem; color:#9ca3af;">Free to start - No credit card required</p>
  </div>
</div>'''

NEW_UI = """    function updateUI() {
      const hasAccess = checkSearchLimit();
      if (!hasAccess) {
        const modal = document.getElementById('limitModal');
        if (modal) modal.style.display = 'flex';
      }
    }"""

files = [f for f in os.listdir('.') if f.endswith('.html') and 'limitWarning' in open(f, encoding='utf-8').read()]
print(f"Found {len(files)} files\n")
for filename in files:
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    content = re.sub(r'\s*<!-- Limit Warning -->\s*<div id="limitWarning"[^>]*>.*?</div>', '', content, flags=re.DOTALL)
    content = re.sub(r'\s*<div id="limitWarning"[^>]*>.*?</div>', '', content, flags=re.DOTALL)
    content = re.sub(r'function updateUI\(\)\s*\{.*?\n    \}', NEW_UI, content, flags=re.DOTALL)
    content = re.sub(r"if \(!checkSearchLimit\(\)\) \{\s*window\.location\.href = 'https://linkfinderai\.com/sign-up';\s*return;\s*\}", "if (!checkSearchLimit()) {\n        const modal = document.getElementById('limitModal');\n        if (modal) modal.style.display = 'flex';\n        return;\n      }", content, flags=re.DOTALL)
    if 'id="limitModal"' not in content:
        content = content.replace('</body>', MODAL + '\n</body>')
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✅ {filename}")
print("\nDone!")
