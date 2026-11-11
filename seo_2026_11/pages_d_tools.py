"""Free tool (LinkedIn post formatter) and social-network pages written with an
honest angle (owner, 12 Nov 2026): LinkFinder AI has no Instagram follower
export and no YouTube, Facebook or X email finder. These pages answer the
query truthfully and point to what the product does do.
"""

S = "https://linkfinderai.com"

FORMATTER_CSS = """  <style>
    .fmt-bar { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.6rem; }
    .fmt-bar button { background: var(--gray-100); border: 1px solid var(--gray-200); border-radius: 0.375rem; padding: 0.4rem 0.7rem;
                      font: 600 0.875rem Inter, sans-serif; color: var(--gray-800); cursor: pointer; }
    .fmt-bar button:hover { background: var(--gray-200); }
    #fmtInput { width: 100%; min-height: 220px; padding: 0.85rem; border: 1px solid var(--gray-300); border-radius: 0.5rem;
                font: 0.95rem/1.55 Inter, sans-serif; resize: vertical; }
    .fmt-meta { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin: 0.6rem 0 1rem; font-size: 0.85rem; color: var(--gray-500); flex-wrap: wrap; }
    .fmt-meta .over { color: #dc2626; font-weight: 600; }
    .li-preview { border: 1px solid var(--gray-200); border-radius: 0.6rem; padding: 1rem; background: #fff; }
    .li-head { display: flex; gap: 0.6rem; align-items: center; margin-bottom: 0.75rem; }
    .li-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--gray-200); }
    .li-name { font-weight: 600; font-size: 0.9rem; color: var(--gray-900); }
    .li-sub { font-size: 0.78rem; color: var(--gray-500); }
    .li-body { white-space: pre-wrap; word-break: break-word; font-size: 0.9rem; color: rgba(0,0,0,.9); line-height: 1.45; }
    .li-more { color: var(--gray-500); cursor: pointer; }
    .pv-toggle { display: inline-flex; gap: 0.3rem; }
    .pv-toggle button { background: none; border: 1px solid var(--gray-200); border-radius: 999px; padding: 0.2rem 0.7rem; font: 500 0.8rem Inter, sans-serif; cursor: pointer; color: var(--gray-700); }
    .pv-toggle button.on { background: var(--gray-900); color: #fff; border-color: var(--gray-900); }
  </style>
"""

FORMATTER_TOOL = """  <div class="container">
    <div class="tool-card">
      <div class="fmt-bar" role="toolbar" aria-label="Formatting">
        <button type="button" data-style="bold" title="Bold the selected text"><b>B</b> Bold</button>
        <button type="button" data-style="italic" title="Italicise the selected text"><i>I</i> Italic</button>
        <button type="button" data-style="bolditalic" title="Bold italic"><b><i>B</i></b> Bold italic</button>
        <button type="button" data-style="underline" title="Underline the selected text"><u>U</u> Underline</button>
        <button type="button" data-style="strike" title="Strike through the selected text"><s>S</s> Strike</button>
        <button type="button" data-insert="bullet" title="Bullet list">&bull; Bullets</button>
        <button type="button" data-insert="numbers" title="Numbered list">1. Numbers</button>
        <button type="button" data-style="plain" title="Remove formatting from the selection">Clear</button>
      </div>
      <label for="fmtInput" class="sr-only" style="position:absolute;left:-9999px;">Your LinkedIn post</label>
      <textarea id="fmtInput" placeholder="Write or paste your LinkedIn post here. Select some words, then click Bold, Italic or another style."></textarea>
      <div class="fmt-meta">
        <span id="fmtCount">0 / 3,000 characters</span>
        <span><button type="button" class="btn" id="fmtCopy">Copy formatted post</button></span>
      </div>
      <div class="output-head"><h3>Preview</h3>
        <div class="pv-toggle"><button type="button" class="on" data-pv="desktop">Desktop</button><button type="button" data-pv="mobile">Mobile</button></div>
      </div>
      <div class="li-preview" id="liPreview">
        <div class="li-head"><div class="li-avatar"></div><div><div class="li-name">Your Name</div><div class="li-sub">Your headline &middot; 1h</div></div></div>
        <div class="li-body" id="liBody"></div>
      </div>
    </div>
  </div>
"""

FORMATTER_JS = r"""<script>
(function () {
  // Unicode "mathematical" letters are what LinkedIn shows as bold and italic.
  var RANGES = {
    bold:       { A: 0x1D5D4, a: 0x1D5EE, d: 0x1D7EC },
    italic:     { A: 0x1D608, a: 0x1D622, d: null },
    bolditalic: { A: 0x1D63C, a: 0x1D656, d: 0x1D7EC }
  };
  var COMBINE = { underline: '̲', strike: '̶' };
  var reverse = {};
  Object.keys(RANGES).forEach(function (k) {
    var r = RANGES[k];
    for (var i = 0; i < 26; i++) {
      reverse[String.fromCodePoint(r.A + i)] = String.fromCharCode(65 + i);
      reverse[String.fromCodePoint(r.a + i)] = String.fromCharCode(97 + i);
    }
    if (r.d) for (var j = 0; j < 10; j++) reverse[String.fromCodePoint(r.d + j)] = String.fromCharCode(48 + j);
  });
  function plain(s) {
    return Array.from(s.replace(/[̶̲]/g, '')).map(function (c) { return reverse[c] || c; }).join('');
  }
  function styleText(s, style) {
    s = plain(s);
    if (style === 'plain') return s;
    if (COMBINE[style]) return Array.from(s).map(function (c) { return /\s/.test(c) ? c : c + COMBINE[style]; }).join('');
    var r = RANGES[style];
    return Array.from(s).map(function (c) {
      var n = c.charCodeAt(0);
      if (n >= 65 && n <= 90) return String.fromCodePoint(r.A + n - 65);
      if (n >= 97 && n <= 122) return String.fromCodePoint(r.a + n - 97);
      if (n >= 48 && n <= 57 && r.d) return String.fromCodePoint(r.d + n - 48);
      return c;
    }).join('');
  }
  var ta = document.getElementById('fmtInput');
  var body = document.getElementById('liBody');
  var count = document.getElementById('fmtCount');
  var mode = 'desktop';
  var LIMIT = 3000;
  function render() {
    var t = ta.value;
    var n = t.length;
    count.textContent = n.toLocaleString('en-US') + ' / 3,000 characters';
    count.className = n > LIMIT ? 'over' : '';
    // LinkedIn folds a post after roughly three lines, or about 210 characters
    // on desktop and 140 on mobile, whichever comes first.
    var cut = mode === 'desktop' ? 210 : 140;
    var lines = t.split('\n');
    var head = lines.slice(0, 3).join('\n');
    var folded = t.length > cut || lines.length > 3;
    var shown = folded ? (head.length > cut ? Array.from(head).slice(0, cut).join('') : head) : t;
    body.textContent = shown || 'Your post preview appears here.';
    if (folded) {
      var more = document.createElement('span');
      more.className = 'li-more';
      more.textContent = '…see more';
      more.onclick = function () { body.textContent = t; };
      body.appendChild(document.createTextNode(' '));
      body.appendChild(more);
    }
  }
  function apply(style) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e) { ta.focus(); return; }
    var out = styleText(ta.value.slice(s, e), style);
    ta.setRangeText(out, s, e, 'select');
    ta.focus();
    render();
    try { if (window.posthog) posthog.capture('post_formatter_style', { style: style }); } catch (x) {}
  }
  function list(kind) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    var a = ta.value.lastIndexOf('\n', s - 1) + 1;
    var b = ta.value.indexOf('\n', e); if (b < 0) b = ta.value.length;
    var i = 0;
    var out = ta.value.slice(a, b).split('\n').map(function (l) {
      l = l.replace(/^(• |\d+\. )/, '');
      return l.trim() ? (kind === 'bullet' ? '• ' : (++i) + '. ') + l : l;
    }).join('\n');
    ta.setRangeText(out, a, b, 'select');
    ta.focus();
    render();
  }
  document.querySelectorAll('.fmt-bar button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.style) apply(b.dataset.style); else list(b.dataset.insert);
    });
  });
  document.querySelectorAll('.pv-toggle button').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.dataset.pv;
      document.querySelectorAll('.pv-toggle button').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.getElementById('liPreview').style.maxWidth = mode === 'mobile' ? '380px' : '';
      render();
    });
  });
  document.getElementById('fmtCopy').addEventListener('click', function () {
    var btn = this;
    var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy formatted post'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); document.execCommand('copy'); done(); });
    else { ta.select(); document.execCommand('copy'); done(); }
    try { if (window.posthog) posthog.capture('post_formatter_copied', { chars: ta.value.length }); } catch (x) {}
  });
  ta.addEventListener('input', render);
  render();
})();
</script>"""

PAGES = [
    dict(
        slug="linkedin-post-formatter",
        title="LinkedIn Post Formatter: Bold, Italic Text and Preview",
        description="Free LinkedIn post formatter: add bold, italic, underlined text and bullets to your post, then preview where LinkedIn cuts it with see more. No sign-up.",
        h1="Free LinkedIn Post Formatter and Preview",
        crumb="LinkedIn Post Formatter",
        subtitle="Add bold, italic, underlined and struck-through text and clean bullet lists to a LinkedIn post, see where it folds behind \"see more\", then copy it into LinkedIn.",
        extra_css=FORMATTER_CSS,
        tool_html=FORMATTER_TOOL,
        script=FORMATTER_JS,
        sections=[
            ("How to use bold and italics on LinkedIn", """
      <p>LinkedIn's post editor has no formatting buttons for personal posts. The bold and italic text you see in other people's posts is made of Unicode characters that look like bold or italic letters. This formatter converts the words you select into those characters, so they keep their style when you paste the post into LinkedIn.</p>
      <ol>
        <li>Write or paste your post in the box above.</li>
        <li>Select a word or a line and click <strong>Bold</strong>, <strong>Italic</strong>, <strong>Underline</strong> or another style.</li>
        <li>Check the preview to see what shows before "see more".</li>
        <li>Click <strong>Copy formatted post</strong> and paste it into LinkedIn.</li>
      </ol>"""),
            ("Preview the \"see more\" cut before you post", """
      <p>LinkedIn shows the first lines of a post in the feed and hides the rest behind "see more": about three lines, which is roughly 210 characters on desktop and fewer on mobile. Those first lines decide whether anyone clicks. The preview shows where your post is likely to fold on each, so you can put the hook above the cut. The exact cut depends on the reader's screen, so treat it as a close guide rather than an exact rule.</p>
      <p>The counter tracks LinkedIn's 3,000-character limit for posts.</p>"""),
            ("Use formatting sparingly", """
      <p>Bold a few words that carry the point, not whole paragraphs. Screen readers can read Unicode-styled letters oddly, and LinkedIn search does not match them as normal words, so keep keywords and names in plain text. Bullets and short paragraphs do more for readability than any style.</p>"""),
            ("Turn the people who engage into leads", """
      <p>A well-formatted post gets reactions. The people who react are your warmest prospects: the <a href="https://linkfinderai.com/linkedin-post-likers-export">LinkedIn post likers export</a> lists them with their profile URLs, and the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> adds their work emails.</p>"""),
        ],
        faq=[
            ("How do I bold text in a LinkedIn post?", "LinkedIn has no bold button for posts. Write your post in a formatter like this one, select the words, click Bold, then copy and paste the post into LinkedIn."),
            ("Does bold text work on LinkedIn mobile?", "Yes. The styled characters are Unicode, so they display on desktop and mobile apps alike."),
            ("How many characters can a LinkedIn post have?", "Up to 3,000 characters. The feed shows about the first three lines before \"see more\"."),
            ("Is the formatter free?", "Yes, with no sign-up. Your text stays in your browser."),
        ],
        related=[
            ("linkedin-post-likers-export", "Post likers export", "Everyone who reacted"),
            ("linkedin-post-date-extractor", "Post date extractor", "When a post was published"),
            ("how-to-generate-leads-on-linkedin", "Generate leads on LinkedIn", "The playbook"),
            ("linkedin-post-commenters-export", "Post commenters export", "Everyone who commented"),
        ],
        cta=("Turn post engagement into leads", "Export the people who react to your posts and get their work emails. Free credits, no card."),
    ),
    dict(
        slug="instagram-follower-scraper",
        title="Instagram Follower Scraper: Options, Limits and Risks",
        description="How Instagram follower scrapers work, what Instagram allows, the risks to your account, and how to find the Instagram profiles of a list of people or brands.",
        h1="Instagram Follower Scrapers: What They Do and What to Use",
        crumb="Instagram Follower Scraper",
        subtitle="What exporting Instagram followers involves, what Instagram allows, and what LinkFinder AI does instead: find the Instagram profiles behind a list of names or brands.",
        checks=[
            "What Instagram lets you download about followers",
            "How follower scrapers work and the risk they carry",
            "Find Instagram profile URLs for a list of people or brands",
        ],
        actions=[("Find Instagram profiles", f"{S}/instagram-profile-url-finder")],
        sections=[
            ("Can you export Instagram followers?", """
      <p>Instagram lets you download your own account's data, including the list of accounts that follow you, from <em>Accounts Center &gt; Your information and permissions &gt; Download your information</em>. It does not let you download the followers of another account.</p>
      <p>Tools sold as "Instagram follower scrapers" fill that gap by browsing Instagram, usually logged in to an account you provide, and recording each follower they see. Instagram rate-limits and blocks this kind of automated access, and the account used is the one that pays for it.</p>
      <div class="note">LinkFinder AI does not scrape follower lists.</div>"""),
            ("What LinkFinder AI does with Instagram", """
      <p>If you have a list of people or brands and need their Instagram accounts, the <a href="https://linkfinderai.com/instagram-profile-url-finder">Instagram profile finder</a> returns the profile URL for each one, one at a time or from a CSV. It is useful for influencer outreach, partner research and enriching a CRM with social profiles.</p>
      <p>For the email behind a business or creator account, see the <a href="https://linkfinderai.com/instagram-email-finder">Instagram email finder</a> guide.</p>"""),
        ],
        faq=[
            ("Can I download the followers of another Instagram account?", "Not through Instagram. Its data download covers your own account only. Third-party scrapers do it by automated browsing, which Instagram restricts."),
            ("Does LinkFinder AI scrape Instagram followers?", "No. It finds Instagram profile URLs for names or brands you provide."),
        ],
        related=[
            ("instagram-profile-url-finder", "Instagram profile finder", "Name in, profile URL out"),
            ("instagram-email-finder", "Instagram email finder", "Contact for business accounts"),
            ("best-social-media-finder", "Social media finder", "All of a person's profiles"),
        ],
    ),
    dict(
        slug="youtube-email-finder",
        title="How to Find a YouTuber's Email Address (Business Contact)",
        description="Where YouTube creators publish their business email, how to see it, and how to reach the company or agency behind a channel when there is none.",
        h1="How to Find a YouTube Channel's Email Address",
        crumb="YouTube Email Finder",
        subtitle="Most creators who want sponsorships publish a business email. Here is where to find it, and how to reach the team behind a channel when they do not.",
        checks=[
            "Where the business email sits on a channel, and how to reveal it",
            "Other places creators list a contact",
            "Reaching the company or agency behind a channel",
        ],
        actions=[("Find a work email from LinkedIn", f"{S}/linkedin-email-finder")],
        sections=[
            ("Check the channel's business email", """
      <p>On a channel page, open the channel description (the "more" link next to the description, or the About section on older layouts). Creators who accept business inquiries have a <strong>View email address</strong> button there. You need to be signed in to a Google account and pass a captcha, and YouTube limits how many you can reveal per day.</p>"""),
            ("Other places creators list a contact", """
      <ul class="plain">
        <li>The links on the channel page: a website, a link-in-bio page or a media kit usually has a contact form or address.</li>
        <li>Video descriptions, often next to "for business inquiries".</li>
        <li>Their other social profiles; the <a href="https://linkfinderai.com/best-social-media-finder">social media finder</a> helps you find them.</li>
        <li>Their management or agency, when the description names one.</li>
      </ul>"""),
            ("When a company is behind the channel", """
      <p>Brand channels and larger creators are run by a company. Find the right person there on LinkedIn, then get their work email: the <a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn profile finder</a> turns a name and company into a profile, and the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> returns the verified email for 10 credits. For the company's general address, the <a href="https://linkfinderai.com/company-email-finder">company email finder</a> works from the company name.</p>
      <div class="note">LinkFinder AI does not read emails from YouTube channels; it finds work emails of people and companies.</div>"""),
        ],
        faq=[
            ("How do I find a YouTuber's email?", "Open the channel's description and click View email address if the creator added one. Otherwise check the links on the channel, video descriptions and their website."),
            ("Why can't I see the email on a YouTube channel?", "You need to be signed in, and the creator must have added a business email. YouTube also limits how many addresses you can reveal per day."),
        ],
        related=[
            ("best-social-media-finder", "Social media finder", "All of someone's profiles"),
            ("instagram-email-finder", "Instagram email finder", "Business accounts"),
            ("company-email-finder", "Company email finder", "A company's contact email"),
            ("how-to-find-someones-email", "How to find someone's email", "7 methods"),
        ],
    ),
    dict(
        slug="facebook-email-finder",
        title="How to Find an Email from a Facebook Page or Profile",
        description="Where Facebook pages and profiles show an email address, what is private, and how to find the work email of the business or person behind a page.",
        h1="How to Find an Email Address from Facebook",
        crumb="Facebook Email Finder",
        subtitle="Facebook pages often list a contact email; personal profiles rarely do. Here is where to look, and how to reach the business behind a page when it does not.",
        checks=[
            "Where a Facebook page lists its email",
            "What personal profiles show, and what stays private",
            "Finding the work email of the business or person behind a page",
        ],
        actions=[("Find a company's email", f"{S}/company-email-finder")],
        sections=[
            ("Facebook pages", """
      <p>Business pages show their contact details in the About or Intro section: email, phone, website. On mobile, open the page and tap the About or Contact info section. If no email is listed, the page's website almost always has one.</p>"""),
            ("Personal profiles", """
      <p>A personal profile shows an email only if the person chose to make it visible to you, which is rare. Facebook does not let anyone look up a member's email, and tools that claim to extract emails from Facebook profiles rely on data leaks or automated scraping. Do not use them: the data is unreliable and using it can break data protection law.</p>"""),
            ("Reaching the business behind a page", """
      <p>For a business, you usually want a person rather than the page inbox. Find the owner or the right manager on LinkedIn and get their work email: <a href="https://linkfinderai.com/find-business-owner-email">finding a business owner's email</a> walks through it. The <a href="https://linkfinderai.com/company-email-finder">company email finder</a> returns the company's contact address from its name for 5 credits.</p>
      <div class="note">LinkFinder AI does not read emails from Facebook; it finds work emails of companies and the people who work there.</div>"""),
        ],
        faq=[
            ("How do I find the email of a Facebook page?", "Open the page's About or Intro section, where businesses list their email, phone and website."),
            ("Can I find someone's email from their Facebook profile?", "Only if they made it visible to you. Facebook does not allow looking up members' emails."),
        ],
        related=[
            ("company-email-finder", "Company email finder", "A company's contact email"),
            ("find-business-owner-email", "Business owner's email", "Reach the decision maker"),
            ("best-social-media-finder", "Social media finder", "All of someone's profiles"),
        ],
    ),
    dict(
        slug="twitter-email-finder",
        title="How to Find Someone's Email from Twitter (X)",
        description="Where people on X (Twitter) publish a contact email, why profiles do not show one, and how to find a professional's work email from their name and company.",
        h1="How to Find an Email Address from Twitter (X)",
        crumb="Twitter Email Finder",
        subtitle="X profiles do not show email addresses. Here is where people publish one anyway, and how to find a professional's work email from what their profile tells you.",
        checks=[
            "Where people on X share a contact address",
            "Why X does not show emails, and what to avoid",
            "From an X bio to a verified work email",
        ],
        actions=[("Find a work email", f"{S}/find-business-email")],
        sections=[
            ("Where to look on X", """
      <ul class="plain">
        <li>The bio and pinned post, where some people write "DMs open" or an address.</li>
        <li>The website link in the profile, which usually has a contact page.</li>
        <li>Their posts: search <code>from:username email</code> or <code>from:username @</code>.</li>
      </ul>
      <p>X does not display account emails and does not let anyone look them up. Tools that claim to extract them from X rely on leaked data; avoid them.</p>"""),
            ("From an X bio to a work email", """
      <p>Most professional bios say where the person works. With their name and company, the <a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn profile finder</a> finds their LinkedIn profile for 1 credit, and the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> returns their verified work email for 10 credits. That route finds an email about 9 times in 10 once the profile is found.</p>
      <div class="note">LinkFinder AI does not read emails from X; it finds work emails from names, companies and LinkedIn profiles.</div>"""),
        ],
        faq=[
            ("Can I find someone's email from their Twitter account?", "X does not show account emails. Check their bio, website and posts, or find their work email from their name and company."),
        ],
        related=[
            ("find-business-email", "Find a business email", "Name and company to email"),
            ("linkedin-url-finder", "LinkedIn profile finder", "Name and company to profile"),
            ("best-social-media-finder", "Social media finder", "All of someone's profiles"),
            ("how-to-find-someones-email", "How to find someone's email", "7 methods"),
        ],
    ),
]
