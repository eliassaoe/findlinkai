"""Sales Navigator cluster. Facts checked 12 Nov 2026:
- Sales Navigator has no native CSV/Excel export of leads or accounts.
- SNAP (Sales Navigator Application Platform) is partner-only and not accepting
  new partners; it covers display, CRM sync and analytics, not lead export.
- Core $119.99/mo ($89.99/mo billed yearly), Advanced $159.99/mo ($149.99/mo
  yearly), Advanced Plus on quote (LinkedIn compare-plans page, Oct 2026).
- LinkFinder: profile URL -> email 10 credits, -> phone 50, -> full profile 10;
  Lead Search 15 credits per lead with email, 5 without, no cookies.
"""

S = "https://linkfinderai.com"

PAGES = [
    dict(
        slug="export-sales-navigator-leads",
        title="Export Sales Navigator Leads to CSV or Excel (2026 Guide)",
        description="Sales Navigator has no export button. Here are the ways to get your leads out as a CSV or Excel file, and how to add verified emails and phones.",
        h1="How to Export Leads from Sales Navigator",
        crumb="Export Sales Navigator Leads",
        subtitle="Sales Navigator has no export button. This guide shows the options that work in 2026, what each one costs, and how to turn the file into a list you can actually email or call.",
        checks=[
            "The four ways to get a lead list out of Sales Navigator, with their limits",
            "How to open the result in Excel or Google Sheets without breaking the columns",
            "How to add verified work emails and direct dials to the export",
        ],
        actions=[("Enrich an export I already have", f"{S}/enrich-sales-navigator-export"),
                 ("Build a list without Sales Navigator", f"{S}/sign-up")],
        sections=[
            ("Can you export leads from Sales Navigator?", """
      <p>Not natively. LinkedIn lets you save leads and accounts into lists inside Sales Navigator, and it lets you sync them to a CRM on the Advanced Plus plan, but there is no button that downloads a lead list as a CSV or an Excel file. LinkedIn's official Sales Navigator API (SNAP) is reserved to approved partners, is not accepting new ones, and covers display, CRM sync and activity analytics rather than lead export.</p>
      <p>So every "Sales Navigator export" you see online is one of the workarounds below. They are not equal: some ask for your LinkedIn session cookie, some cap how many rows you get, and none of them give you an email address on its own.</p>"""),
            ("The four ways to export a Sales Navigator lead list", """
      <h3 class="sub">1. Copy the list by hand</h3>
      <p>Open a saved lead list, copy name, title, company and profile URL into a spreadsheet. Free and safe for your account, but realistic only for a few dozen leads.</p>
      <h3 class="sub">2. A browser extension that reads your Sales Navigator search</h3>
      <p>Tools in this category run inside your logged-in browser and page through the search for you. They are fast, but they act as your account. LinkedIn limits how many results a search shows (2,500 per search), and heavy automated paging is what gets accounts restricted. If you go this way, export in small batches.</p>
      <h3 class="sub">3. A cloud scraper using your session cookie</h3>
      <p>Same idea, run from a server. You paste your <code>li_at</code> cookie and the service browses as you. It handles larger volumes, and it carries the same account risk, because LinkedIn sees your account doing the browsing.</p>
      <h3 class="sub">4. Rebuild the list without Sales Navigator</h3>
      <p>If what you need is "VPs of Sales at 50-200 person SaaS companies in Germany", you do not have to extract it from Sales Navigator at all. LinkFinder AI's Lead Search takes job titles, locations, seniority and company size, searches LinkedIn without using your account or any cookie, and returns each person's profile and work email in a CSV. It costs 15 credits per lead with an email and 5 per lead without one.</p>"""),
            ("Exporting Sales Navigator leads to Excel", """
      <p>Whichever export you use, you end up with a CSV. Excel opens it directly, but two things go wrong often enough to check:</p>
      <ol>
        <li><strong>Accents and non-Latin names turn into symbols.</strong> Open Excel first, then use <em>Data &gt; From Text/CSV</em> and pick UTF-8 as the file origin, instead of double-clicking the file.</li>
        <li><strong>Profile URLs get cut or converted.</strong> Keep the LinkedIn URL column as text. It is the column every enrichment tool matches on, so a damaged URL means a missing email later.</li>
      </ol>
      <p>In Google Sheets, <em>File &gt; Import &gt; Upload</em> keeps UTF-8 by default. If you want the emails filled in inside the sheet itself, the <a href="https://linkfinderai.com/linkedin-email-finder-google-sheets">LinkFinder Google Sheets add-on</a> adds them row by row.</p>"""),
            ("The export has no emails. Here is the step that adds them", """
      <p>A Sales Navigator export gives you names, titles, companies and profile URLs. It does not give you a work email or a phone number. That is the step most teams pay for, and it is the one that decides whether the list is usable.</p>
      <p>Upload the file to <a href="https://linkfinderai.com/enrich-sales-navigator-export">Enrich a Sales Navigator export</a>. LinkFinder AI reads the LinkedIn URL column, so you do not reformat anything, and returns:</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Field</th><th>Cost</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td>Verified work email</td><td>10 credits</td><td>Paying users get an email back for roughly 9 profiles in 10.</td></tr>
          <tr><td>Direct dial or mobile</td><td>50 credits</td><td>Lower coverage than email. Expect a partial fill.</td></tr>
          <tr><td>Full profile (title, company, location, experience)</td><td>10 credits</td><td>Refreshes people who changed jobs since you saved them.</td></tr>
        </tbody></table></div>"""),
        ],
        faq=[
            ("Does Sales Navigator have an export button?", "No. Sales Navigator can save leads into lists and sync them to a CRM on Advanced Plus, but it has no native CSV or Excel export of leads or accounts."),
            ("Is it safe to export Sales Navigator leads with an extension?", "Extensions and cookie-based scrapers act as your LinkedIn account, and heavy automated paging is a common reason for account restrictions. Export in small batches, or build the list with a tool that does not use your account."),
            ("How many leads can I export from one Sales Navigator search?", "Sales Navigator shows at most 2,500 results per search, so exports are capped there too. Split large searches by location, seniority or company size."),
            ("How do I get emails for my Sales Navigator leads?", "Upload the export to LinkFinder AI. It matches each row on the LinkedIn profile URL and returns a verified work email for 10 credits, and a direct dial for 50 credits when one exists."),
        ],
        related=[
            ("enrich-sales-navigator-export", "Enrich a Sales Navigator export", "Upload the CSV, get emails and phones back"),
            ("sales-navigator-scraper", "Sales Navigator scrapers", "How they work and the cookie-free option"),
            ("linkedin-sales-navigator-cost", "Sales Navigator cost", "Every plan, and what you get for it"),
            ("bulk-linkedin-email-finder", "Bulk LinkedIn email finder", "Emails for a whole list of profile URLs"),
            ("export-linkedin-search-results", "Export LinkedIn search results", "Without Sales Navigator"),
            ("linkedin-sales-navigator-api", "Sales Navigator API", "What SNAP allows, and what it does not"),
        ],
        cta=("Your Sales Navigator list, with emails", "Free credits, no card. Upload a real export and check how many emails come back before you pay anything."),
    ),
    dict(
        slug="sales-navigator-scraper",
        title="Sales Navigator Scraper: How They Work and a Safer Option",
        description="What a Sales Navigator scraper does, why it puts your LinkedIn account at risk, and how to get the same lead list with emails without using your account.",
        h1="Sales Navigator Scraper: What They Do and a Safer Way",
        crumb="Sales Navigator Scraper",
        subtitle="Sales Navigator scrapers page through your searches while logged in as you. Here is how they work, where the risk is, and how to get the same leads, with emails, without handing over your account.",
        checks=[
            "LinkFinder AI does not ask for your LinkedIn login or session cookie",
            "Lead Search: describe the people you want, get profiles and work emails back",
            "Already have a scraped export? Upload it and get emails and phones added",
        ],
        actions=[("Find leads without my account", f"{S}/sign-up"),
                 ("Enrich a scraped export", f"{S}/enrich-sales-navigator-export")],
        sections=[
            ("How a Sales Navigator scraper works", """
      <p>A Sales Navigator scraper is a browser extension or a cloud service that opens your saved search, reads each page of results and writes them to a file. To do that it needs to be logged in as you: either it runs inside your browser, or you give it your <code>li_at</code> session cookie so a server can browse as you.</p>
      <p>What you get back is what the search page shows: name, headline, current title and company, location, and the profile URL. No scraper can read an email address that is not on the page, so the file still needs an enrichment step before you can contact anyone.</p>"""),
            ("The risk: LinkedIn sees your account doing it", """
      <p>Because the scraper browses as you, LinkedIn's limits apply to your account. Hundreds of profile views or result pages in a short time is the pattern its systems look for, and the usual outcome is a temporary restriction or a forced re-verification of a seat you pay for every month.</p>
      <p>Scrapers reduce this with delays and daily caps, which also makes them slow. Sales Navigator itself caps a search at 2,500 results, so large lists mean many split searches and many sessions.</p>"""),
            ("Get the leads without scraping your account", """
      <p>LinkFinder AI takes a different route, on purpose. It does not log in to LinkedIn as you and never asks for a cookie.</p>
      <ul class="plain">
        <li><strong>If you do not have the list yet:</strong> Lead Search takes job titles, keywords, locations, seniority and company size, searches LinkedIn without any account, and returns each person's profile and work email. 15 credits per lead with an email, 5 per lead without.</li>
        <li><strong>If you already exported or scraped a list:</strong> upload it. Matching on the profile URL, LinkFinder adds a verified work email (10 credits), a direct dial when one exists (50 credits) and a refreshed profile (10 credits).</li>
        <li><strong>If you want it in your own stack:</strong> the same lookups run from the <a href="https://linkfinderai.com/data-enrichment-api">API</a>, n8n, Make, Zapier or the Google Sheets add-on.</li>
      </ul>"""),
            ("Scraper versus enrichment, side by side", """
      <div class="tbl-wrap"><table>
        <thead><tr><th></th><th>Cookie-based Sales Navigator scraper</th><th>LinkFinder AI</th></tr></thead>
        <tbody>
          <tr><td>Needs your LinkedIn login</td><td>Yes</td><td>No</td></tr>
          <tr><td>Needs a Sales Navigator seat</td><td>Yes</td><td>No</td></tr>
          <tr><td>Returns work emails</td><td>No, only what is on the page</td><td>Yes, verified</td></tr>
          <tr><td>Returns phone numbers</td><td>No</td><td>Yes, when available</td></tr>
          <tr><td>Account restriction risk</td><td>Yes</td><td>None for your account</td></tr>
        </tbody></table></div>"""),
        ],
        faq=[
            ("Is scraping Sales Navigator against LinkedIn's terms?", "LinkedIn's user agreement does not allow automated access to its services, including through extensions that browse as you. That is why accounts that scrape heavily get restricted."),
            ("Does LinkFinder AI scrape Sales Navigator?", "No. It never logs in to LinkedIn as you. It finds people from criteria you give it (Lead Search) or enriches a list you already have, matched on the LinkedIn profile URL."),
            ("Can a Sales Navigator scraper get email addresses?", "Not on its own. Sales Navigator pages do not show work emails, so a scraper only gives you names, titles, companies and URLs. An enrichment step adds the emails."),
            ("What does it cost to get emails for a scraped list?", "With LinkFinder AI, 10 credits per verified work email and 50 per phone number, matched on the profile URL in your file."),
        ],
        related=[
            ("export-sales-navigator-leads", "Export Sales Navigator leads", "Every way to get a CSV out"),
            ("enrich-sales-navigator-export", "Enrich a Sales Navigator export", "Add emails and phones to the file"),
            ("linkedin-lead-extractor", "LinkedIn lead extractor", "Build a list from criteria, no cookies"),
            ("linkedin-profile-scraper", "LinkedIn profile scraper", "Full profile data from one URL"),
            ("scrape-emails-from-linkedin", "Scrape emails from LinkedIn", "What works and what does not"),
            ("linkedin-sales-navigator-api", "Sales Navigator API", "Partner-only, and what that means"),
        ],
    ),
    dict(
        slug="linkedin-sales-navigator-api",
        title="LinkedIn Sales Navigator API: What SNAP Allows in 2026",
        description="The official Sales Navigator API (SNAP) is partner-only and does not export leads. What it covers, who gets access, and the API you can use today instead.",
        h1="LinkedIn Sales Navigator API: What It Does and Who Can Use It",
        crumb="Sales Navigator API",
        subtitle="LinkedIn's official Sales Navigator API is closed to new partners and does not export lead lists. Here is what it covers, and the API teams use to get lead and contact data into their own systems.",
        checks=[
            "What SNAP's display, sync and analytics services do",
            "Why it cannot be used to pull lead lists or contact data",
            "A REST API for LinkedIn profiles, emails and phones, with a free key",
        ],
        actions=[("Get a free API key", f"{S}/api-access"), ("Read the API docs", f"{S}/api-documentation")],
        sections=[
            ("Is there a Sales Navigator API?", """
      <p>Yes, but not one you can sign up for. LinkedIn's official Sales Navigator API is called SNAP, the Sales Navigator Application Platform. Access goes through LinkedIn's partner program, and LinkedIn's documentation says the program is not currently accepting new partners.</p>
      <p>SNAP is built for CRM and sales-engagement vendors that embed Sales Navigator inside their own product. It has three families of services:</p>
      <ul class="plain">
        <li><strong>Display services:</strong> embedded Sales Navigator modules (profile and account cards, recent activity, InMail and connect buttons) shown inside a CRM.</li>
        <li><strong>Sync services:</strong> CRM Sync, which matches CRM records to LinkedIn to keep them consistent.</li>
        <li><strong>Analytics services:</strong> a bulk export of your sales team's own activity and seat data, such as Social Selling Index.</li>
      </ul>"""),
            ("What the Sales Navigator API does not do", """
      <p>It does not return search results, it does not export saved lead lists, and it does not return email addresses or phone numbers. The analytics export covers what your reps did, not who the leads are.</p>
      <p>So if your goal is "get Sales Navigator leads into our database" or "enrich contacts with LinkedIn data from code", SNAP is not the tool, even for teams that have it.</p>"""),
            ("The API teams use instead", """
      <p>The <a href="https://linkfinderai.com/data-enrichment-api">LinkFinder AI enrichment API</a> answers the questions SNAP does not. One endpoint, a <code>type</code> per lookup, a JSON answer:</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Lookup</th><th>Input</th><th>Credits</th></tr></thead>
        <tbody>
          <tr><td>Work email from a LinkedIn profile</td><td>Profile URL</td><td>10</td></tr>
          <tr><td>Phone number from a LinkedIn profile</td><td>Profile URL</td><td>50</td></tr>
          <tr><td>Full LinkedIn profile details</td><td>Profile URL</td><td>10</td></tr>
          <tr><td>LinkedIn profile from a work email</td><td>Email</td><td>5</td></tr>
          <tr><td>LinkedIn profile from name and company</td><td>Name, company</td><td>1</td></tr>
          <tr><td>Employees of a company</td><td>Domain</td><td>2 per employee</td></tr>
        </tbody></table></div>
      <p style="margin-top:1rem;">It does not use your LinkedIn account, so there is nothing to get restricted, and the same calls run from n8n, Make, Zapier, Google Sheets or an MCP client such as Claude.</p>"""),
        ],
        faq=[
            ("Can I get access to the Sales Navigator API?", "Only through LinkedIn's partner program, which LinkedIn says is not accepting new partners at the moment."),
            ("Can the Sales Navigator API export my lead lists?", "No. SNAP covers embedded display modules, CRM sync and team activity analytics. It does not return search results, saved lists or contact details."),
            ("Is there an API that returns emails for LinkedIn profiles?", "Yes. LinkFinder AI's API returns a verified work email for a LinkedIn profile URL for 10 credits, and a phone number for 50 credits."),
        ],
        related=[
            ("data-enrichment-api", "Data enrichment API", "Every lookup, one endpoint"),
            ("linkedin-email-finder-api", "LinkedIn email finder API", "Profile URL in, email out"),
            ("linkedin-phone-number-finder-api", "LinkedIn phone finder API", "Profile URL in, phone out"),
            ("export-sales-navigator-leads", "Export Sales Navigator leads", "Get your list out as a CSV"),
            ("api-documentation", "API documentation", "Requests, responses and errors"),
        ],
        cta=("Your first API call takes a minute", "Free credits and a key as soon as you sign up. No card, no partner program."),
    ),
    dict(
        slug="linkedin-sales-navigator-cost",
        title="LinkedIn Sales Navigator Cost in 2026: Every Plan Compared",
        description="Sales Navigator costs $119.99/month for Core and $159.99 for Advanced, less billed yearly. What each plan includes, what it leaves out, and cheaper options.",
        h1="How Much Does LinkedIn Sales Navigator Cost?",
        crumb="Sales Navigator Cost",
        subtitle="Prices for every Sales Navigator plan, what you get for them, and the part none of them include: email addresses and phone numbers for the leads you find.",
        checks=[
            "Core, Advanced and Advanced Plus prices, monthly and yearly",
            "What a seat includes, and what it does not",
            "When you do not need a seat at all",
        ],
        actions=[("Find leads without a seat", f"{S}/sign-up"), ("Add emails to a Sales Navigator export", f"{S}/enrich-sales-navigator-export")],
        sections=[
            ("Sales Navigator pricing in 2026", """
      <div class="tbl-wrap"><table>
        <thead><tr><th>Plan</th><th>Billed monthly</th><th>Billed yearly</th><th>Built for</th></tr></thead>
        <tbody>
          <tr><td>Core</td><td>$119.99 / month</td><td>$89.99 / month ($1,079.88 / year)</td><td>One seller prospecting on their own</td></tr>
          <tr><td>Advanced</td><td>$159.99 / month</td><td>$149.99 / month ($1,799.88 / year)</td><td>Teams sharing lists, TeamLink, seat admin</td></tr>
          <tr><td>Advanced Plus</td><td colspan="2">Custom quote</td><td>CRM sync and larger teams</td></tr>
        </tbody></table></div>
      <p style="margin-top:1rem;">Prices are LinkedIn's published starting prices in USD before tax, as listed on its compare-plans page in late 2026. They vary by country and change often, so check LinkedIn's page before you buy. Core includes 50 InMail credits a month.</p>"""),
            ("What you get for the money", """
      <ul class="plain">
        <li>Advanced lead and account search filters (seniority, function, company headcount, growth, years in role, and more).</li>
        <li>Saved searches with alerts, saved lead and account lists.</li>
        <li>InMail credits to message people outside your network.</li>
        <li>On Advanced and Advanced Plus: team features, and on Advanced Plus, CRM sync.</li>
      </ul>"""),
            ("What no Sales Navigator plan includes", """
      <p>No plan gives you a work email or a phone number for your leads, and no plan lets you export a lead list as a CSV. That surprises a lot of first-time buyers: you pay for the search, then you still need another tool to contact anyone outside InMail.</p>
      <p>That is the gap LinkFinder AI fills. Upload any list with LinkedIn profile URLs and get verified work emails back for 10 credits each and direct dials for 50. See <a href="https://linkfinderai.com/export-sales-navigator-leads">how to export Sales Navigator leads</a> first if your list is still inside Sales Navigator.</p>"""),
            ("Do you need Sales Navigator at all?", """
      <p>It depends on what you use it for. If your team lives in InMail and account alerts, a seat earns its price. If you mainly use it to build lists and then hunt for emails elsewhere, you are paying twice.</p>
      <p>LinkFinder AI's Lead Search covers the list-building part without a seat: give it job titles, keywords, locations, seniority and company size, and it returns LinkedIn profiles with work emails, 15 credits per lead with an email. A Starter plan is $49 a month for 5,000 credits.</p>"""),
        ],
        faq=[
            ("How much is LinkedIn Sales Navigator per month?", "Core is $119.99 a month billed monthly or $89.99 a month billed yearly. Advanced is $159.99 monthly or $149.99 a month yearly. Advanced Plus is quoted. Prices vary by country and before tax."),
            ("Is there a free trial of Sales Navigator?", "LinkedIn regularly offers a one-month free trial of Sales Navigator Core to eligible accounts. Check the offer shown on your own account."),
            ("Does Sales Navigator include email addresses?", "No. Sales Navigator does not show work emails or phone numbers for leads. You need an enrichment tool for that step."),
            ("What is a cheaper way to build B2B lead lists?", "If you mainly use Sales Navigator for lists, a lead search tool that returns profiles and emails together can replace that part. LinkFinder AI's Lead Search costs 15 credits per lead with a work email."),
        ],
        related=[
            ("export-sales-navigator-leads", "Export Sales Navigator leads", "CSV and Excel, step by step"),
            ("b2b-lead-lists", "B2B lead lists", "Build one from criteria, with emails"),
            ("linkedin-lead-extractor", "LinkedIn lead extractor", "Profiles and emails without a seat"),
            ("enrich-sales-navigator-export", "Enrich a Sales Navigator export", "Add emails and phones"),
            ("pricing", "LinkFinder AI pricing", "Plans and credit packs"),
        ],
    ),
]
