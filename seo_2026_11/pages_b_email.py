"""Email cluster. Facts (app.html creditCosts, docs/find-rate.md, 7-12 Nov 2026):
- LinkedIn profile -> email: 10 credits, found for 87-89% of subscriber lookups.
- Name + company -> LinkedIn URL: 1 credit, found 77%.
- Name + domain -> email (lead_full_name_to_email): 7 credits, found ~1-15%.
  Never sell this route as the main one; send people via the LinkedIn URL.
- Company name -> company contact email: 5 credits (NOT 1).
- Email -> LinkedIn URL: 5 credits, found ~63%.
- Company domain -> employees: 2 credits per employee returned.
- There is no email verification product. Do not offer one.
"""

S = "https://linkfinderai.com"

ROUTE_TABLE = """
      <div class="tbl-wrap"><table>
        <thead><tr><th>What you start from</th><th>Route in LinkFinder AI</th><th>Credits</th><th>How often it finds one</th></tr></thead>
        <tbody>
          <tr><td>A LinkedIn profile URL</td><td>Profile &rarr; work email</td><td>10</td><td>About 9 in 10 lookups by paying users</td></tr>
          <tr><td>A name and a company</td><td>Name + company &rarr; LinkedIn URL, then &rarr; email</td><td>1 + 10</td><td>About 3 in 4 find the profile, then 9 in 10 the email</td></tr>
          <tr><td>A name and a company domain only</td><td>Name + domain &rarr; email</td><td>7</td><td>Low, often under 15%. Use the LinkedIn route instead</td></tr>
          <tr><td>Only a company name</td><td>Company &rarr; general contact email</td><td>5</td><td>A company address, not a person</td></tr>
        </tbody></table></div>"""

PAGES = [
    dict(
        slug="email-finder",
        title="Email Finder: Find Anyone's Work Email (Free to Try)",
        description="Find a person's professional email from a LinkedIn profile, or from a name and company. Verified results, bulk CSV, API and Google Sheets. Free credits to try.",
        h1="Email Finder for Work Emails",
        crumb="Email Finder",
        subtitle="Find the professional email of the person you want to reach, from their LinkedIn profile or from a name and a company. One lookup at a time, a whole CSV, or from your own code.",
        checks=[
            "Start from a LinkedIn profile URL, or from a name and a company",
            "Emails are verified before they are returned. No guessed addresses",
            "One lookup, a CSV of thousands, the API or Google Sheets",
        ],
        actions=[("Find an email free", f"{S}/linkedin-email-finder"), ("Upload a list", f"{S}/bulk-linkedin-email-finder")],
        sections=[
            ("Which email finder route to use", """
      <p>An email finder is only as good as the input you give it. The same person can be found almost every time from one input and almost never from another, so here is what the numbers look like inside LinkFinder AI:</p>""" + ROUTE_TABLE + """
      <p style="margin-top:1rem;">The short version: if you have a LinkedIn URL, use it. If you have a name and a company, turn it into a LinkedIn URL first for 1 credit. It costs one extra step and finds far more emails than guessing from a domain.</p>"""),
            ("How it works", """
      <ol>
        <li>Paste a LinkedIn profile URL into the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>, or a name and company into the <a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn profile finder</a>.</li>
        <li>LinkFinder AI looks the person up across its data providers and checks the address before returning it.</li>
        <li>You get the work email, or an empty result. We would rather return nothing than an address that bounces.</li>
      </ol>
      <p>For a list, upload a CSV with a LinkedIn URL column to the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk email finder</a>. Lists are where most of our users get their value: a file of 500 profiles comes back with emails in minutes.</p>"""),
            ("Email finder for teams and tools", """
      <ul class="plain">
        <li><strong>Google Sheets:</strong> the add-on fills an email column next to your LinkedIn URLs.</li>
        <li><strong>API:</strong> one REST endpoint with a <code>type</code> per lookup, documented in the <a href="https://linkfinderai.com/api-documentation">API docs</a>.</li>
        <li><strong>No-code:</strong> n8n, Make and Zapier modules, plus an MCP server for Claude and other AI agents.</li>
        <li><strong>CRM:</strong> HubSpot sync keeps contact emails current as people change jobs.</li>
      </ul>"""),
        ],
        faq=[
            ("Is the email finder free?", "You get free credits when you sign up, with no card, which covers a real sample of lookups. After that, a work email costs 10 credits from a LinkedIn profile."),
            ("Are the emails verified?", "Yes. Addresses are checked before they are returned, and an unverifiable address comes back empty rather than guessed."),
            ("Can I find an email with just a name?", "A name alone is ambiguous. With a name and a company, LinkFinder AI first finds the LinkedIn profile (1 credit, found about 3 times in 4), then the email from that profile. That route finds far more emails than guessing from a domain."),
        ],
        related=[
            ("linkedin-email-finder", "LinkedIn email finder", "Profile URL in, work email out"),
            ("bulk-linkedin-email-finder", "Bulk email finder", "A whole CSV at once"),
            ("find-business-email", "Find a business email", "For a specific person at a company"),
            ("company-email-finder", "Company email finder", "A company's contact address"),
            ("how-to-find-someones-email", "How to find someone's email", "Every method, ranked"),
            ("linkedin-search-by-email", "Email to LinkedIn", "The reverse lookup"),
        ],
    ),
    dict(
        slug="company-email-finder",
        title="Company Email Finder: Find a Company's Email Address",
        description="Find the contact email address of any company from its name, or the work email of a specific person there. Bulk CSV, API and Google Sheets.",
        h1="Find a Company's Email Address",
        crumb="Company Email Finder",
        subtitle="Two different searches hide behind \"company email\": the company's own contact address, and the work email of someone who works there. LinkFinder AI does both.",
        checks=[
            "Company name in, the company's contact email out (5 credits)",
            "Need a person? Company domain in, employees with work emails out",
            "Run one company or a CSV of thousands",
        ],
        actions=[("Find a company email", f"{S}/sign-up"), ("List a company's employees", f"{S}/company-employee-finder")],
        sections=[
            ("Company contact email or a person's email?", """
      <p>If you want to write to the company, a general address such as <code>contact@</code> or <code>hello@</code> is often what you need: partnerships, suppliers, press, invoices. LinkFinder AI returns it from the company name for 5 credits.</p>
      <p>If you want to sell to the company, a shared inbox is the wrong door. You want the head of the team that buys. For that, start from the company domain, list the people who work there with the <a href="https://linkfinderai.com/company-employee-finder">company employee finder</a> (2 credits per employee returned, with title and LinkedIn URL), pick the right person and get their work email.</p>"""),
            ("Company email addresses in bulk", """
      <p>Upload a CSV of company names and LinkFinder AI adds a contact email column. The same file can be enriched with the company website, main phone line, LinkedIn page and employee count in one pass, at 1 credit each, so one upload gives you a usable company list.</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>From a company name</th><th>Credits</th></tr></thead>
        <tbody>
          <tr><td>Contact email</td><td>5</td></tr>
          <tr><td>Website</td><td>1</td></tr>
          <tr><td>Main phone line</td><td>1</td></tr>
          <tr><td>LinkedIn company page</td><td>1</td></tr>
          <tr><td>Employee count</td><td>1</td></tr>
        </tbody></table></div>"""),
            ("Why not guess the address pattern?", """
      <p>Guessing <code>firstname.lastname@company.com</code> works until it does not, and every bounce hurts the reputation of the domain you send from. A found and verified address costs a few credits; a burned sending domain costs weeks. If you only want to see the possible patterns, the free <a href="https://linkfinderai.com/email-permutator">email permutator</a> lists them, but verify before you send.</p>"""),
        ],
        faq=[
            ("How do I find a company's email address?", "Enter the company name in LinkFinder AI and it returns the company's contact email for 5 credits. For a specific person, list the company's employees from its domain and get that person's work email."),
            ("Can I find the email of someone who works at a company?", "Yes. Start from the company domain to list employees with their titles and LinkedIn URLs (2 credits per employee), then get the work email from the profile (10 credits)."),
            ("Can I find company emails in bulk?", "Yes. Upload a CSV of company names and download it with a contact email column, plus website, phone, LinkedIn page and headcount if you want them."),
        ],
        related=[
            ("company-employee-finder", "Company employee finder", "Who works there, with titles"),
            ("find-business-email", "Find a business email", "One person's work email"),
            ("company-url-finder", "Company website finder", "Name in, website out"),
            ("company-phone-finder", "Company phone finder", "Main line from a company name"),
            ("find-business-owner-email", "Find a business owner's email", "Reach the decision maker"),
            ("email-finder", "Email finder", "Every way to find a work email"),
        ],
    ),
    dict(
        slug="find-business-email",
        title="Find a Business Email Address for Anyone at a Company",
        description="How to find someone's business email address: the routes that work, what each costs, and how to do it for a whole list. Verified work emails, free to try.",
        h1="How to Find a Business Email Address",
        crumb="Find a Business Email",
        subtitle="You know who you want to reach and where they work. Here is the fastest reliable way to get their business email, and why the obvious shortcut usually fails.",
        checks=[
            "Name and company in, LinkedIn profile, then verified business email out",
            "About 9 in 10 profiles return an email for paying users",
            "Works for one person or a CSV of thousands",
        ],
        actions=[("Find a business email", f"{S}/linkedin-url-finder"), ("Upload a list", f"{S}/bulk-linkedin-email-finder")],
        sections=[
            ("The route that finds the most business emails", """
      <p>Most people try to find a business email from a name and a company domain. It feels direct, but it is the weakest input there is: names are shared, nicknames differ, and many companies use patterns you cannot guess. Inside LinkFinder AI that route finds an email in a small minority of cases.</p>
      <p>The route that works goes through LinkedIn:</p>
      <ol>
        <li>Turn the name and company into a LinkedIn profile URL with the <a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn profile finder</a> (1 credit).</li>
        <li>Get the verified business email from that profile with the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> (10 credits).</li>
      </ol>
      <p>A profile URL identifies exactly one person, which is why it is the input with the best match rate.</p>""" + ROUTE_TABLE),
            ("Business email addresses for a whole list", """
      <p>Put names and companies, or LinkedIn URLs, in a CSV and upload it to the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk email finder</a>. You get the file back with a business email column, and a phone column if you ask for it. Rows without a verified address stay empty, so the list you send to is clean.</p>"""),
            ("What counts as a business email", """
      <p>A business email is the address someone uses at work, on their employer's domain: <code>jane.doe@acme.com</code>, not <code>janedoe84@gmail.com</code>. It is what B2B outreach, partnerships and recruiting run on.</p>"""),
        ],
        faq=[
            ("What is the best way to find someone's business email?", "Find their LinkedIn profile from their name and company, then get the email from the profile. It finds far more emails than guessing from the company domain."),
            ("How much does it cost to find a business email?", "1 credit to find the LinkedIn profile from a name and company, and 10 credits for the verified email from the profile."),
            ("Can I find business emails for free?", "Sign-up includes free credits with no card, enough to test real lookups before paying."),
        ],
        related=[
            ("linkedin-url-finder", "LinkedIn profile finder", "Name and company to profile URL"),
            ("linkedin-email-finder", "LinkedIn email finder", "Profile URL to work email"),
            ("company-email-finder", "Company email finder", "A company's contact address"),
            ("find-email-by-name", "Find an email by name", "When all you have is a name"),
            ("email-finder", "Email finder", "Every route compared"),
        ],
    ),
    dict(
        slug="find-business-owner-email",
        title="How to Find a Business Owner's Name and Email",
        description="Find who owns a company and their email: list the people at the company, pick the owner or founder, get their verified email. Works in bulk too.",
        h1="How to Find a Company Owner's Name and Email",
        crumb="Find a Business Owner's Email",
        subtitle="The owner is the one who says yes. This is how to find who owns or runs a company, and their direct email, without calling the front desk.",
        checks=[
            "Company domain in, the people who work there out, with titles",
            "Pick the owner, founder or CEO and get their verified email",
            "Run it for one company or a list of hundreds",
        ],
        actions=[("Find the people at a company", f"{S}/company-employee-finder"), ("Find a CEO's email", f"{S}/resources/find-ceo-email")],
        sections=[
            ("Step 1: find out who owns the company", """
      <p>For a small business the owner is usually on LinkedIn with a title such as Owner, Founder, Co-founder, Managing Director or CEO. The <a href="https://linkfinderai.com/company-employee-finder">company employee finder</a> takes the company's domain and returns the people who work there with their titles and LinkedIn URLs, 2 credits per person returned. Filter the list on those titles and you have the owner.</p>
      <p>If you already know the owner's name, skip the list: the <a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn profile finder</a> turns a name and a company into a profile URL for 1 credit.</p>
      <div class="note">Some owners of very small companies are not on LinkedIn. For those, the company's public registration (Companies House in the UK, a state's business registry in the US, Pappers in France) lists directors by name.</div>"""),
            ("Step 2: get the owner's email", """
      <p>From the owner's LinkedIn profile, the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> returns a verified email for 10 credits. Owners of small companies often use one address for everything, so you may get their work address or the address they actually read.</p>
      <p>If there is no person to find, the company's general contact address is available from the company name for 5 credits through the <a href="https://linkfinderai.com/company-email-finder">company email finder</a>.</p>"""),
            ("For a list of companies", """
      <p>Upload a CSV of company domains, keep the rows whose title matches owner, founder or CEO, and run the email lookup on those profiles. It is the fastest way to build a list of decision makers for local businesses, agencies or SaaS companies.</p>"""),
        ],
        faq=[
            ("How do I find out who owns a business?", "List the people who work at the company from its domain and look for titles such as Owner, Founder or CEO. Public company registries also list directors by name."),
            ("How do I find a company owner's email?", "Find the owner's LinkedIn profile, then get their verified email from it for 10 credits with LinkFinder AI."),
            ("What if the owner is not on LinkedIn?", "Use the company's contact email (5 credits from the company name), or the director names in the public company registry."),
        ],
        related=[
            ("resources/find-ceo-email", "Find a CEO's email", "Step-by-step for executives"),
            ("company-employee-finder", "Company employee finder", "Everyone at a company, with titles"),
            ("company-email-finder", "Company email finder", "The company's contact address"),
            ("find-business-email", "Find a business email", "Any person at a company"),
            ("b2b-lead-lists", "B2B lead lists", "Decision makers at many companies"),
        ],
    ),
    dict(
        slug="how-to-find-someones-email",
        title="How to Find Someone's Email Address (7 Methods That Work)",
        description="How to find someone's email address: 7 methods from free to automated, which ones work for work emails, and how to check an address before you send.",
        h1="How to Find Someone's Email Address",
        crumb="How to Find Someone's Email",
        subtitle="Seven ways to find a person's email address, ranked from free and manual to fast and automated, with what each one is actually good for.",
        checks=[
            "Free methods first: their website, their posts, their profile",
            "The fastest route for work emails: from a LinkedIn profile",
            "How to avoid sending to an address that bounces",
        ],
        actions=[("Find a work email now", f"{S}/linkedin-email-finder"), ("Find someone's LinkedIn", f"{S}/linkedin-url-finder")],
        sections=[
            ("Before you start: whose email, and why", """
      <p>The right method depends on who the person is. A professional you want to contact about work usually has a business email that can be found. A private individual's personal address is a different matter: it is personal data, and you should only use it if they made it public for that purpose. This guide is about professional contact: sales, recruiting, partnerships, press.</p>"""),
            ("7 ways to find someone's email address", """
      <h3 class="sub">1. Look where they publish it</h3>
      <p>Their personal site, the "About" or "Team" page of their company, a speaker bio, a GitHub profile, a newsletter footer. Free, slow, and right more often than you would expect for founders and freelancers.</p>
      <h3 class="sub">2. Check their LinkedIn contact info</h3>
      <p>Some people list an email under "Contact info" on LinkedIn. It is visible to their connections, and only a minority fill it in.</p>
      <h3 class="sub">3. Search Google with operators</h3>
      <p><code>"Jane Doe" "@acme.com"</code> finds addresses that appear on public pages. It also tells you the company's email pattern when you find a colleague's address.</p>
      <h3 class="sub">4. Guess the pattern, then verify</h3>
      <p>Most companies use one of a handful of patterns. The free <a href="https://linkfinderai.com/email-permutator">email permutator</a> lists them. Never send to a guessed address without checking it: bounces damage your sending domain.</p>
      <h3 class="sub">5. Use an email finder with their LinkedIn profile</h3>
      <p>The most reliable automated route for work emails. Paste the profile URL into the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> and get a verified address back. Paying LinkFinder AI users get one for about 9 profiles in 10, for 10 credits.</p>
      <h3 class="sub">6. Start from a name and company</h3>
      <p>No profile URL yet? The <a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn profile finder</a> turns a name and company into one for 1 credit, then method 5 does the rest.</p>
      <h3 class="sub">7. Do it for a whole list</h3>
      <p>For tens or thousands of people, upload a CSV to the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk email finder</a> instead of searching one by one.</p>"""),
            ("Which method to pick", ROUTE_TABLE),
        ],
        faq=[
            ("How can I find someone's email address for free?", "Check their website, company team page, LinkedIn contact info and public posts, and search Google for their name with the company domain. Email finders such as LinkFinder AI also include free credits at sign-up."),
            ("What is the most reliable way to find a work email?", "Start from the person's LinkedIn profile URL. It identifies exactly one person, and LinkFinder AI returns a verified email for about 9 in 10 profiles for paying users."),
            ("Is it legal to find someone's email address?", "Finding a professional's work email for a legitimate business purpose is common practice, but data protection laws such as the GDPR still apply to how you use it: have a reason to contact them, say who you are, and honour opt-outs."),
            ("How do I know an email address is real?", "Use a finder that verifies before returning, as LinkFinder AI does, and never send to a guessed pattern without checking it."),
        ],
        related=[
            ("email-finder", "Email finder", "Every route compared"),
            ("linkedin-email-finder", "LinkedIn email finder", "The most reliable route"),
            ("find-email-by-name", "Find an email by name", "Name and company only"),
            ("reverse-email-lookup", "Reverse email lookup", "Who is behind an address"),
            ("email-permutator", "Email permutator", "Every likely pattern, free"),
        ],
    ),
    dict(
        slug="find-email-by-name",
        title="Find an Email Address by Name and Company",
        description="Find someone's email address from their first name, last name and company. The route that finds the most emails, what it costs, and how to run it in bulk.",
        h1="Find Someone's Email Address by Their Name",
        crumb="Find Email by Name",
        subtitle="A first name, a last name and a company are enough to find a work email, if you take the right route. Here is the one that works, with real find rates.",
        checks=[
            "Name and company in, LinkedIn profile out (1 credit)",
            "LinkedIn profile in, verified work email out (10 credits)",
            "A CSV of names and companies works the same way",
        ],
        actions=[("Start with a name", f"{S}/linkedin-url-finder"), ("Upload names in bulk", f"{S}/bulk-linkedin-url-finder")],
        sections=[
            ("Why a name alone is not enough", """
      <p>There are thousands of people called John Smith. A name with a company narrows it to one or two, and that is enough to identify a person, but not enough to guess their email reliably. Companies use different patterns, people use nicknames, and two people with the same name at the same company get different addresses.</p>
      <p>We measured it on LinkFinder AI's own lookups: going straight from name and domain to an email finds one in a small minority of cases. Going through the LinkedIn profile finds one most of the time.</p>"""),
            ("The two-step route", """
      <ol>
        <li><strong>Name + company &rarr; LinkedIn profile.</strong> The <a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn profile finder</a> finds the right profile about 3 times in 4, for 1 credit.</li>
        <li><strong>LinkedIn profile &rarr; work email.</strong> The <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> returns a verified address about 9 times in 10 for paying users, for 10 credits.</li>
      </ol>
      <p>Two steps, 11 credits, and you can check the profile before you pay for the email, so you never pay for the wrong John Smith.</p>"""),
            ("For a list of names", """
      <p>Put first name, last name and company in a CSV and upload it to the <a href="https://linkfinderai.com/bulk-linkedin-url-finder">bulk LinkedIn URL finder</a>. Then run the profile URLs it adds through the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk email finder</a>. The Google Sheets add-on does the same thing column by column.</p>"""),
        ],
        faq=[
            ("Can I find an email with just a first and last name?", "Not reliably. Add the company, then find the person's LinkedIn profile first. From the profile, the email is found about 9 times in 10."),
            ("How much does it cost?", "1 credit to find the LinkedIn profile from a name and company, 10 credits for the verified email."),
            ("What if the person is not on LinkedIn?", "LinkFinder AI can also try the name and company domain directly for 7 credits, but expect a low find rate. Their company website or public bios are worth checking too."),
        ],
        related=[
            ("linkedin-url-finder", "LinkedIn profile finder", "Name and company to profile"),
            ("bulk-linkedin-url-finder", "Bulk LinkedIn URL finder", "A list of names at once"),
            ("linkedin-email-finder", "LinkedIn email finder", "Profile to verified email"),
            ("how-to-find-someones-email", "How to find someone's email", "7 methods compared"),
            ("find-business-email", "Find a business email", "For someone at a company"),
        ],
    ),
    dict(
        slug="scrape-emails-from-linkedin",
        title="How to Scrape Emails from LinkedIn (and What Actually Works)",
        description="LinkedIn rarely shows email addresses, so scraping pages gets you very few. Here is how to get work emails for LinkedIn profiles reliably, one or in bulk.",
        h1="How to Scrape Emails from LinkedIn",
        crumb="Scrape Emails from LinkedIn",
        subtitle="LinkedIn profiles almost never show an email, so a scraper that reads pages comes back mostly empty. Here is what works instead, without logging in as you.",
        checks=[
            "No LinkedIn login, cookie or browser extension needed",
            "Profile URLs in, verified work emails out (10 credits each)",
            "One profile, a CSV of thousands, or the API",
        ],
        upload=dict(tool="scrape_linkedin_emails", enrichType="business_email_finder"),
        card_note='Have a single profile? Use the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>.',
        sections=[
            ("Why scraping LinkedIn pages gets so few emails", """
      <p>An email address only appears on a LinkedIn profile if the person typed it into "Contact info", and even then only their connections can see it. A scraper, whether an extension or a cookie-based cloud tool, can only read what the page shows to your account. So on a list of 1,000 profiles it finds a handful of emails, and every page it reads is your account browsing at a rate LinkedIn notices.</p>
      <p>The emails that matter for outreach, people's work addresses, are not on LinkedIn at all. They have to be found elsewhere and matched to the profile.</p>"""),
            ("What works: match the profile, then find the email", """
      <p>LinkFinder AI does not read LinkedIn as you. It takes the profile URL, identifies the person and their current company, and finds their work email across its data providers, checking it before returning it. Paying users get an email for about 9 profiles in 10.</p>
      <ol>
        <li>Collect the profile URLs: from a Sales Navigator export, a search, a post's reactions, an event attendee list.</li>
        <li>Upload them as a CSV above, or paste one into the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>.</li>
        <li>Download the file with an email column. Unverifiable rows stay empty.</li>
      </ol>"""),
            ("Where the profile URLs come from", """
      <ul class="plain">
        <li><strong>A Sales Navigator list:</strong> see <a href="https://linkfinderai.com/export-sales-navigator-leads">how to export Sales Navigator leads</a>.</li>
        <li><strong>People who engaged with a post:</strong> the <a href="https://linkfinderai.com/linkedin-post-likers-export">post likers export</a> lists everyone who reacted, 1 credit per person.</li>
        <li><strong>Employees of target companies:</strong> the <a href="https://linkfinderai.com/company-employee-finder">company employee finder</a>.</li>
        <li><strong>No list yet:</strong> describe who you want and the <a href="https://linkfinderai.com/linkedin-lead-extractor">LinkedIn lead extractor</a> builds it, with emails.</li>
      </ul>"""),
        ],
        faq=[
            ("Can you scrape emails from LinkedIn?", "Very few. LinkedIn only shows an email when the person added it to their contact info, and only to connections. Work emails have to be found by matching the profile, which is what LinkFinder AI does."),
            ("Do I need to give my LinkedIn login or cookie?", "No. LinkFinder AI never logs in to LinkedIn as you, so your account is not at risk."),
            ("How much does it cost per email?", "10 credits for a verified work email from a LinkedIn profile URL."),
        ],
        related=[
            ("linkedin-email-finder", "LinkedIn email finder", "One profile at a time"),
            ("bulk-linkedin-email-finder", "Bulk LinkedIn email finder", "A whole list"),
            ("linkedin-post-likers-export", "Post likers export", "Profiles from a post's reactions"),
            ("sales-navigator-scraper", "Sales Navigator scrapers", "The risk, and the safer route"),
            ("linkedin-email-address-format", "LinkedIn email address format", "How LinkedIn and company emails look"),
        ],
    ),
    dict(
        slug="linkedin-email-address-format",
        title="LinkedIn Email Address Format: Employees and Notifications",
        description="The email format LinkedIn uses for its own employees and notifications, how to spot fake LinkedIn emails, and how to find a member's work email.",
        h1="LinkedIn Email Address Format",
        crumb="LinkedIn Email Address Format",
        subtitle="Three different questions hide behind \"LinkedIn email format\": how LinkedIn employees' addresses look, which addresses LinkedIn sends from, and how to get a member's email. Here are all three.",
        checks=[
            "The pattern LinkedIn uses for its staff",
            "The real sender domains of LinkedIn notifications",
            "How to find the work email of a LinkedIn member",
        ],
        actions=[("Find a member's work email", f"{S}/linkedin-email-finder")],
        sections=[
            ("The email format of LinkedIn employees", """
      <p>LinkedIn staff addresses are on the <code>linkedin.com</code> domain. The pattern most commonly found in public sources is the first initial followed by the last name, for example <code>jdoe@linkedin.com</code>, with variations when two employees share a name. Do not rely on the pattern to contact someone: find and verify the address instead, as you would at any company.</p>"""),
            ("Which addresses LinkedIn sends from", """
      <p>Genuine LinkedIn notifications come from addresses on <code>linkedin.com</code>, such as <code>messages-noreply@linkedin.com</code>, <code>invitations@linkedin.com</code> or <code>security-noreply@linkedin.com</code>. Phishing emails imitate these with look-alike domains such as <code>linkedin-mail.com</code> or <code>linkedln.com</code> (with an L instead of an I). If the domain after the @ is not exactly <code>linkedin.com</code>, treat it as fake and do not click.</p>"""),
            ("Finding a LinkedIn member's email", """
      <p>LinkedIn does not give out its members' email addresses. A member's contact info shows an email only if they chose to add it, and only to their connections. For professional outreach, what you usually need is their work email at their current employer, which is not on LinkedIn at all.</p>
      <p>The <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> returns it from the profile URL for 10 credits, verified before it is returned, and the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk version</a> does it for a whole list.</p>"""),
        ],
        faq=[
            ("What is LinkedIn's email format for employees?", "LinkedIn employees use the linkedin.com domain, most often first initial plus last name. Verify any address before using it."),
            ("How do I know an email from LinkedIn is real?", "Check that the domain after the @ is exactly linkedin.com. Look-alike domains are a common phishing trick."),
            ("Can I see a LinkedIn member's email address?", "Only if they added it to their contact info and you are connected. To find their work email, use an email finder with their profile URL."),
        ],
        related=[
            ("linkedin-email-finder", "LinkedIn email finder", "A member's work email"),
            ("scrape-emails-from-linkedin", "Scrape emails from LinkedIn", "What works and what does not"),
            ("email-permutator", "Email permutator", "Possible patterns for any company"),
            ("how-to-find-someones-email", "How to find someone's email", "7 methods compared"),
        ],
    ),
    dict(
        slug="reverse-email-lookup",
        title="Reverse Email Lookup: Find Who Is Behind an Email Address",
        description="Find out who owns a work email address: their name, LinkedIn profile, job title and company. Free to try, in bulk or by API.",
        h1="Reverse Email Lookup for Professional Emails",
        crumb="Reverse Email Lookup",
        subtitle="Got a work email and want to know who is behind it? A reverse lookup finds the person's LinkedIn profile, so you see their name, job title and company before you reply or reach out.",
        checks=[
            "Work email in, LinkedIn profile out (5 credits)",
            "See the person's name, title and company",
            "Run a whole CSV of emails, or call it from the API",
        ],
        actions=[("Look up an email", f"{S}/linkedin-search-by-email"), ("Look up a list", f"{S}/bulk-linkedin-search-by-email")],
        sections=[
            ("What a reverse email lookup tells you", """
      <p>A reverse email lookup starts from an address and works back to the person. For professional addresses, the most useful answer is their LinkedIn profile: it confirms who they are, what they do, where they work now and how senior they are.</p>
      <p>Common reasons to run one:</p>
      <ul class="plain">
        <li>A sign-up or demo request came in from a work address and you want to know who it is before the call.</li>
        <li>Your CRM is full of emails without names, titles or companies.</li>
        <li>You received a cold email and want to check the sender is who they claim to be.</li>
      </ul>"""),
            ("How it works in LinkFinder AI", """
      <p>Paste the address into the <a href="https://linkfinderai.com/linkedin-search-by-email">email to LinkedIn finder</a>. It returns the person's LinkedIn profile URL for 5 credits, and finds one for most work emails. From there, the <a href="https://linkfinderai.com/linkedin-profile-scraper">profile lookup</a> adds their full title, company, location and experience for 10 credits.</p>
      <p>For a list, upload a CSV of emails to the <a href="https://linkfinderai.com/bulk-linkedin-search-by-email">bulk version</a> and get a LinkedIn URL column back.</p>"""),
            ("What it does not do", """
      <p>This is a professional lookup. It is built for work addresses and business contexts, and it works best on them. It is not a people-search engine for personal addresses, and it does not return home addresses or private phone numbers. Use what you find in line with data protection law: a legitimate reason, and no more data than you need.</p>"""),
        ],
        faq=[
            ("How can I find out who owns an email address?", "For a work address, look it up with LinkFinder AI's email to LinkedIn finder. It returns the person's LinkedIn profile, with their name, title and company, for 5 credits."),
            ("Does it work for Gmail or other personal addresses?", "It is built for professional addresses. Personal addresses are found far less often, and many people never link them to a public profile."),
            ("Can I do a reverse email lookup in bulk?", "Yes. Upload a CSV of emails and download it with a LinkedIn profile column, or use the API."),
        ],
        related=[
            ("linkedin-search-by-email", "Email to LinkedIn finder", "One address at a time"),
            ("bulk-linkedin-search-by-email", "Bulk email to LinkedIn", "A list of addresses"),
            ("linkedin-profile-scraper", "LinkedIn profile lookup", "Full title, company, experience"),
            ("resources/find-linkedin-from-email", "Find LinkedIn from an email", "Step-by-step guide"),
            ("how-to-find-someones-email", "How to find someone's email", "The opposite direction"),
        ],
    ),
]
