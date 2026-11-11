"""Lead lists and LinkedIn export cluster. Facts (docs/lead-search.md, 12 Nov 2026):
- Lead Search: search words, job titles, locations, seniority, company size;
  10/25/50/100 leads per run; no LinkedIn account or cookie used; returns name,
  title, company, location, work email, personal email, experience; CSV download;
  15 credits per lead with an email, 5 without; ~2 minutes for 25 leads.
- Post reactions: 1 credit per person returned.
- LinkedIn has no native export of search results.
"""

S = "https://linkfinderai.com"

LEAD_SEARCH = """
      <div class="tbl-wrap"><table>
        <thead><tr><th>You describe</th><th>You get back, per lead</th></tr></thead>
        <tbody>
          <tr><td>Job titles (several, comma separated)</td><td>Full name</td></tr>
          <tr><td>Keywords or skills on the profile</td><td>Current title and company</td></tr>
          <tr><td>Locations (cities or countries)</td><td>Location and LinkedIn profile URL</td></tr>
          <tr><td>Seniority (entry to C-level, owner)</td><td>Work email, and personal email when one is found</td></tr>
          <tr><td>Company size (1-10 to 5,000+)</td><td>Experience history</td></tr>
        </tbody></table></div>
      <p style="margin-top:1rem;">Runs of 10, 25, 50 or 100 leads, about two minutes for 25. 15 credits per lead with an email, 5 per lead without. No LinkedIn account, Sales Navigator seat or cookie involved.</p>"""

PAGES = [
    dict(
        slug="linkedin-lead-extractor",
        title="LinkedIn Lead Extractor: Profiles and Emails, No Cookies",
        description="Describe the people you want: titles, location, seniority, company size. Get LinkedIn profiles with work emails in a CSV, without your LinkedIn account.",
        h1="LinkedIn Lead Extractor Without Cookies",
        crumb="LinkedIn Lead Extractor",
        subtitle="Tell LinkFinder AI who you are looking for. It searches LinkedIn for you, without your account or a Sales Navigator seat, and gives back each lead's profile and work email.",
        checks=[
            "No LinkedIn login, cookie or browser extension",
            "Job titles, keywords, locations, seniority and company size",
            "Profiles and work emails together, downloadable as CSV",
        ],
        actions=[("Extract leads free", f"{S}/sign-up"), ("Already have a list? Enrich it", f"{S}/bulk-linkedin-email-finder")],
        sections=[
            ("What the lead extractor does", """
      <p>Most LinkedIn lead extractors are scrapers: they open your search in your logged-in browser and copy the results, which puts your account at risk and still gives you no email addresses. LinkFinder AI's Lead Search works the other way round. You give it criteria, it finds matching LinkedIn profiles without touching your account, and it adds the work email for each one.</p>""" + LEAD_SEARCH),
            ("How to extract a lead list", """
      <ol>
        <li>Sign up and open Lead Search in the app.</li>
        <li>Enter job titles (for example <em>Head of Sales, VP Sales</em>), locations and, if you want, seniority and company size.</li>
        <li>Pick how many leads you want and start the search. You can leave the page while it runs.</li>
        <li>Download the CSV, or send it to HubSpot, Google Sheets or your sequencer.</li>
      </ol>"""),
            ("Already extracted a list somewhere else?", """
      <p>If you have profile URLs from Sales Navigator, an event, a post or another tool, you do not need to search again. Upload them to the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk LinkedIn email finder</a> for work emails (10 credits each) or the <a href="https://linkfinderai.com/bulk-linkedin-phone-number-finder">bulk phone finder</a> for direct dials (50 credits each).</p>"""),
        ],
        faq=[
            ("Is the LinkedIn lead extractor safe for my account?", "Yes. It never logs in to LinkedIn as you and never asks for a cookie, so there is nothing on your account for LinkedIn to restrict."),
            ("Do I need Sales Navigator?", "No. Lead Search uses its own access to LinkedIn data and filters by title, keywords, location, seniority and company size."),
            ("How much does it cost per lead?", "15 credits per lead returned with an email, 5 per lead without one."),
        ],
        related=[
            ("b2b-lead-lists", "B2B lead lists", "Build one for your market"),
            ("export-linkedin-search-results", "Export LinkedIn search results", "Without copy-paste"),
            ("sales-navigator-scraper", "Sales Navigator scrapers", "The risk, and the alternative"),
            ("lead-sourcing", "Lead sourcing", "Where good leads come from"),
            ("bulk-linkedin-email-finder", "Bulk LinkedIn email finder", "Emails for a list you have"),
        ],
    ),
    dict(
        slug="export-linkedin-search-results",
        title="How to Export LinkedIn Search Results to Excel or CSV",
        description="LinkedIn has no export button for search results. Here is how to get people from a LinkedIn search into Excel or CSV, with their work emails, safely.",
        h1="How to Export LinkedIn Search Results",
        crumb="Export LinkedIn Search Results",
        subtitle="LinkedIn lets you search people but not download the results. These are the ways to get a search into Excel or a CSV, and how to do it without risking your account.",
        checks=[
            "Why LinkedIn has no export, and the limits on its search",
            "Three ways to get results into a spreadsheet",
            "How to add work emails to the list",
        ],
        actions=[("Build the list with emails", f"{S}/linkedin-lead-extractor"), ("Enrich a list I have", f"{S}/bulk-linkedin-email-finder")],
        sections=[
            ("Can you export search results from LinkedIn?", """
      <p>No. Neither free LinkedIn nor Sales Navigator has a button to download people search results. Free accounts also hit a monthly commercial use limit on searches, and every search, free or paid, shows a limited number of results (1,000 on standard LinkedIn search, 2,500 on Sales Navigator).</p>"""),
            ("Three ways to get the results into Excel", """
      <h3 class="sub">1. Copy them by hand</h3>
      <p>Open each result, copy name, title, company and profile URL into a sheet. Safe, slow, fine for 20 people.</p>
      <h3 class="sub">2. Use a browser extension</h3>
      <p>Extensions page through the search while you are logged in and save what they see. Fast, but it is your account doing the browsing, which is how accounts get restricted. And the file still has no emails.</p>
      <h3 class="sub">3. Run the search somewhere that exports</h3>
      <p>Put the same filters into the <a href="https://linkfinderai.com/linkedin-lead-extractor">LinkedIn lead extractor</a>: job titles, keywords, locations, seniority, company size. It searches without your account and gives you a CSV with profile URLs and work emails, which opens in Excel or Google Sheets directly. 15 credits per lead with an email.</p>"""),
            ("Opening the CSV in Excel without breaking it", """
      <p>Open Excel first and use <em>Data &gt; From Text/CSV</em>, choosing UTF-8, so accented names display correctly. Keep the LinkedIn URL column as text: it is the key every enrichment step matches on.</p>"""),
            ("Adding emails to an exported list", """
      <p>If you already have profile URLs from any source, upload them to the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk LinkedIn email finder</a>. You get a verified work email for about 9 profiles in 10 (paying users), at 10 credits each.</p>"""),
        ],
        faq=[
            ("How do I export LinkedIn search results to Excel?", "LinkedIn has no export. Copy results by hand, use an extension at your account's risk, or run the same search in a tool that exports to CSV, such as LinkFinder AI's lead extractor."),
            ("Can I export more than 1,000 LinkedIn search results?", "LinkedIn shows at most 1,000 results per standard search and 2,500 on Sales Navigator. Split large searches by location, seniority or company size."),
            ("Will exporting get my LinkedIn account banned?", "Tools that browse as you can trigger restrictions. A tool that does not use your account, like LinkFinder AI, carries no risk for your profile."),
        ],
        related=[
            ("linkedin-lead-extractor", "LinkedIn lead extractor", "Profiles and emails, no cookies"),
            ("export-sales-navigator-leads", "Export Sales Navigator leads", "The Sales Navigator version"),
            ("bulk-linkedin-email-finder", "Bulk LinkedIn email finder", "Emails for your URLs"),
            ("linkedin-xray-search-generator", "LinkedIn X-ray search", "Search LinkedIn through Google"),
            ("boolean-search-string-generator", "Boolean search generator", "Sharper LinkedIn searches"),
        ],
    ),
    dict(
        slug="b2b-lead-lists",
        title="B2B Lead Lists: Build Your Own with Verified Emails",
        description="Build B2B lead lists from your exact criteria: job titles, locations, seniority, company size. LinkedIn profiles with verified work emails, exported as CSV.",
        h1="Build B2B Lead Lists with Verified Emails",
        crumb="B2B Lead Lists",
        subtitle="Bought lists are stale and shared with every competitor. Build your own B2B lead list from your criteria, fresh from LinkedIn, with a verified work email for each lead.",
        checks=[
            "Your criteria: titles, keywords, locations, seniority, company size",
            "Current LinkedIn profiles, not a database last updated a year ago",
            "Verified work emails, phone numbers on request, CSV export",
        ],
        actions=[("Build a lead list", f"{S}/sign-up"), ("Enrich a list I have", f"{S}/bulk-linkedin-email-finder")],
        sections=[
            ("Why build B2B lead lists instead of buying them", """
      <p>A purchased B2B list was accurate the day it was compiled. People change jobs often, so every month a share of the list points at someone who has left. The same list is sold to everyone in your market, and nobody can tell you how the emails were collected or whether they still deliver.</p>
      <p>A list you build is current when you build it, matches your exact target, and is yours. See also <a href="https://linkfinderai.com/resources/scraped-vs-purchased-email-lists-deliverability">scraped versus purchased email lists</a> for the deliverability side.</p>"""),
            ("How to build one with LinkFinder AI", """
      <p>Two starting points, depending on what you have:</p>
      <h3 class="sub">From criteria</h3>""" + LEAD_SEARCH + """
      <h3 class="sub">From a list of target companies</h3>
      <p>Upload company domains to the <a href="https://linkfinderai.com/company-employee-finder">company employee finder</a> (2 credits per employee returned, with title and LinkedIn URL), keep the roles you sell to, then add emails with the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk email finder</a>.</p>"""),
            ("What a good B2B sales lead list contains", """
      <ul class="plain">
        <li>One row per person, with their LinkedIn URL as the unique key.</li>
        <li>Current title and company, so your message fits their job today.</li>
        <li>A verified work email, and a direct dial if you call.</li>
        <li>Company domain and size, to deduplicate against your CRM and segment.</li>
      </ul>
      <p>LinkFinder AI exports all of these as columns, and can push them to HubSpot directly.</p>"""),
        ],
        faq=[
            ("Where can I get B2B lead lists?", "You can buy them from data vendors, or build them from LinkedIn with a tool like LinkFinder AI, which gives current profiles with verified work emails for your exact criteria."),
            ("How much does a B2B lead list cost to build?", "With LinkFinder AI's Lead Search, 15 credits per lead with an email. The Starter plan is $49 a month for 5,000 credits."),
            ("Are the emails verified?", "Yes. Work emails are checked before they are returned; leads without a verified address are marked so you can leave them out."),
        ],
        related=[
            ("linkedin-lead-extractor", "LinkedIn lead extractor", "Leads from criteria"),
            ("business-contact-list", "Business contact lists", "Companies and their contacts"),
            ("lead-sourcing", "Lead sourcing", "Where good leads come from"),
            ("company-employee-finder", "Company employee finder", "People at target accounts"),
            ("for-sales-teams", "For sales teams", "The full workflow"),
        ],
    ),
    dict(
        slug="business-contact-list",
        title="Business Contact List: Companies with Emails and Phones",
        description="Turn a list of company names into a business contact list: website, contact email, phone, LinkedIn page, headcount and the people who work there.",
        h1="Build a Business Contact List with Emails",
        crumb="Business Contact List",
        subtitle="Start from a list of company names and end with a business contact list you can use: each company's website, contact email and phone, plus named people with their work emails.",
        checks=[
            "Company name in: website, contact email, phone, LinkedIn page, headcount",
            "Add named contacts at each company, with titles and work emails",
            "Upload a CSV, download it enriched",
        ],
        actions=[("Build a contact list", f"{S}/sign-up"), ("Find a company's website", f"{S}/company-url-finder")],
        sections=[
            ("Company level: one row per business", """
      <p>Upload a CSV of company names and LinkFinder AI fills in the details. Each column is a separate lookup, so you only pay for the ones you need:</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Column</th><th>Credits</th></tr></thead>
        <tbody>
          <tr><td>Website</td><td>1</td></tr>
          <tr><td>Main phone number</td><td>1</td></tr>
          <tr><td>LinkedIn company page</td><td>1</td></tr>
          <tr><td>Employee count</td><td>1</td></tr>
          <tr><td>Contact email (a company address, such as contact@)</td><td>5</td></tr>
        </tbody></table></div>"""),
            ("People level: who to contact at each business", """
      <p>A company address reaches whoever reads the shared inbox. To reach the person who decides, list the people at each company with the <a href="https://linkfinderai.com/company-employee-finder">company employee finder</a> (2 credits per employee, with title and LinkedIn URL), keep the roles you want, and add their work emails with the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk email finder</a> (10 credits each).</p>"""),
            ("Business lists with email addresses, without buying one", """
      <p>A business list with email addresses bought from a vendor is often out of date and shared with your competitors. Building it from your own company list costs a few credits per row, and you know where every value came from. If you do not have a company list yet, the <a href="https://linkfinderai.com/linkedin-lead-extractor">LinkedIn lead extractor</a> starts from criteria instead.</p>"""),
        ],
        faq=[
            ("How do I build a business contact list?", "Start from company names, add website, phone, contact email and LinkedIn page for each, then add named contacts with their work emails. LinkFinder AI does each step from a CSV."),
            ("Can I get business lists with email addresses?", "Yes. You can add a company contact email (5 credits) and the work emails of specific people (10 credits each) to any list of companies."),
        ],
        related=[
            ("company-url-finder", "Company website finder", "Name to website"),
            ("company-email-finder", "Company email finder", "A company's contact email"),
            ("company-phone-finder", "Company phone finder", "Main line from a name"),
            ("company-employee-finder", "Company employee finder", "People at each company"),
            ("b2b-lead-lists", "B2B lead lists", "From criteria"),
        ],
    ),
    dict(
        slug="lead-sourcing",
        title="Lead Sourcing: Where to Find B2B Leads That Reply",
        description="Lead sourcing explained: the best sources of B2B leads, how to qualify them, and how to turn a source into a contact list with verified emails.",
        h1="Lead Sourcing for B2B Sales",
        crumb="Lead Sourcing",
        subtitle="Lead sourcing is finding the people worth contacting and the details you need to reach them. These are the sources that work in B2B, and how to turn each one into a usable list.",
        checks=[
            "Six lead sources, from target accounts to engagement signals",
            "How to qualify a source before you spend on it",
            "Turning any source into profiles with verified emails",
        ],
        actions=[("Source leads now", f"{S}/linkedin-lead-extractor"), ("Enrich a list", f"{S}/bulk-linkedin-email-finder")],
        sections=[
            ("What lead sourcing is", """
      <p>Lead sourcing covers the work before the first message: deciding who to target, finding those people, and collecting the details you need to contact them. Lead generation is the broader job, which also includes getting people to come to you. Good sourcing means fewer, better contacts and a higher reply rate.</p>"""),
            ("Six B2B lead sources and how to use them", """
      <h3 class="sub">1. Target account lists</h3>
      <p>Start from the companies you want and find the right people inside them. The <a href="https://linkfinderai.com/company-employee-finder">company employee finder</a> lists the people at a company from its domain, with titles.</p>
      <h3 class="sub">2. Role-based search</h3>
      <p>Start from the job. "Heads of Growth at 50-200 person fintechs in the UK" is a lead source in itself. The <a href="https://linkfinderai.com/linkedin-lead-extractor">LinkedIn lead extractor</a> runs that search without your account and returns emails.</p>
      <h3 class="sub">3. Engagement signals</h3>
      <p>People who liked or commented on a post about the problem you solve are warmer than a cold list. The <a href="https://linkfinderai.com/linkedin-post-likers-export">post likers export</a> turns a post into a list of profiles.</p>
      <h3 class="sub">4. Hiring signals</h3>
      <p>A company hiring for a role often needs tools for that team. <a href="https://linkfinderai.com/linkedin-job-posts-into-enriched-sales-leads">Job posts turned into leads</a> shows the workflow.</p>
      <h3 class="sub">5. Your own inbound</h3>
      <p>Sign-ups and form fills with a work email are leads you already have. A <a href="https://linkfinderai.com/reverse-email-lookup">reverse email lookup</a> tells you who they are.</p>
      <h3 class="sub">6. Exports from other tools</h3>
      <p>Sales Navigator, Apollo, event attendee lists. They give you names and URLs, rarely verified emails. <a href="https://linkfinderai.com/export-sales-navigator-leads">Exporting Sales Navigator leads</a> covers the first.</p>"""),
            ("Sourcing leads into a usable list", """
      <p>Whatever the source, the list is only usable once each row has a current title and a working email. LinkFinder AI matches on the LinkedIn profile URL, returns a verified work email for 10 credits and a direct dial for 50, and leaves rows empty rather than guessing.</p>"""),
        ],
        faq=[
            ("What is lead sourcing?", "Finding the people worth contacting and the contact details you need to reach them, before any outreach starts."),
            ("What are the best sources of B2B leads?", "Target account lists, role-based searches, engagement on relevant posts, hiring signals, your own inbound, and exports from prospecting tools, each enriched with verified emails."),
            ("How do I get emails for sourced leads?", "Match each lead on their LinkedIn profile URL with an email finder. LinkFinder AI returns a verified work email for 10 credits."),
        ],
        related=[
            ("lead-prospecting-tools", "Lead prospecting tools", "What each type does"),
            ("b2b-lead-lists", "B2B lead lists", "Build one from criteria"),
            ("how-to-generate-leads-on-linkedin", "Generate leads on LinkedIn", "A practical playbook"),
            ("linkedin-post-likers-export", "Post likers export", "Leads from engagement"),
            ("for-sales-teams", "For sales teams", "End-to-end workflow"),
        ],
    ),
    dict(
        slug="lead-prospecting-tools",
        title="Lead Prospecting Tools: What Each Type Does (2026)",
        description="The types of lead prospecting tools, what each one is for and what it costs: lead databases, LinkedIn tools, email finders, enrichment APIs and sequencers.",
        h1="Lead Prospecting Tools: Which Type You Need",
        crumb="Lead Prospecting Tools",
        subtitle="Prospecting tools do five different jobs, and most teams pay for two that overlap. Here is what each type does, so you can buy the one you actually need.",
        checks=[
            "Five categories of prospecting tools and what each is for",
            "Where LinkFinder AI fits, and where it does not",
            "A minimal stack for a small sales team",
        ],
        actions=[("Try LinkFinder AI free", f"{S}/sign-up"), ("See pricing", f"{S}/pricing")],
        sections=[
            ("The five types of lead prospecting tools", """
      <div class="tbl-wrap"><table>
        <thead><tr><th>Type</th><th>What it does</th><th>Good for</th></tr></thead>
        <tbody>
          <tr><td>Lead databases</td><td>Search a pre-built database of contacts and companies</td><td>Fast lists in markets the database covers well</td></tr>
          <tr><td>LinkedIn prospecting tools</td><td>Find people on LinkedIn by role, company and location</td><td>Current, precise targeting</td></tr>
          <tr><td>Email and phone finders</td><td>Add verified contact details to people you already identified</td><td>Turning names and URLs into contactable leads</td></tr>
          <tr><td>Enrichment APIs</td><td>The same lookups, called from your code or CRM</td><td>Automating it inside your own systems</td></tr>
          <tr><td>Sequencers</td><td>Send and follow up at scale</td><td>Outreach once the list is ready</td></tr>
        </tbody></table></div>"""),
            ("Where LinkFinder AI fits", """
      <p>LinkFinder AI covers the middle three: finding the right people on LinkedIn without your account (Lead Search), adding verified emails and phones to any list, and doing both from an API, Google Sheets, n8n, Make, Zapier or HubSpot. It is not a sequencer: it hands your list to the one you already use.</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Job</th><th>Credits</th></tr></thead>
        <tbody>
          <tr><td>Lead from criteria, with email</td><td>15</td></tr>
          <tr><td>Work email from a LinkedIn profile</td><td>10</td></tr>
          <tr><td>Phone from a LinkedIn profile</td><td>50</td></tr>
          <tr><td>People at a company, per person</td><td>2</td></tr>
        </tbody></table></div>
      <p style="margin-top:1rem;">Plans start at $49 a month for 5,000 credits; credit packs start at $25 for 1,000.</p>"""),
            ("A minimal prospecting stack for a small team", """
      <ol>
        <li>One tool to find and enrich leads (LinkFinder AI, for example).</li>
        <li>One sequencer to send.</li>
        <li>Your CRM to keep track.</li>
      </ol>
      <p>Most teams that pay for a database, an email finder and an enrichment API separately are paying three times for the same contact.</p>"""),
        ],
        faq=[
            ("What is a lead prospecting tool?", "Software that helps you find potential customers and the details needed to contact them: databases, LinkedIn tools, email finders, enrichment APIs and sequencers."),
            ("Which prospecting tool do I need first?", "A tool that finds the right people and their verified emails. A sequencer is only useful once you have a clean list."),
            ("How much do prospecting tools cost?", "From free tiers to several hundred dollars per seat per month. LinkFinder AI starts at $49 a month for 5,000 credits, or $25 for a 1,000-credit pack."),
        ],
        related=[
            ("lead-sourcing", "Lead sourcing", "Where good leads come from"),
            ("linkedin-lead-extractor", "LinkedIn lead extractor", "Leads from criteria"),
            ("email-finder", "Email finder", "Verified work emails"),
            ("data-enrichment-api", "Enrichment API", "The same lookups from code"),
            ("pricing", "Pricing", "Plans and packs"),
        ],
    ),
    dict(
        slug="how-to-generate-leads-on-linkedin",
        title="How to Generate Leads on LinkedIn: A Practical Playbook",
        description="How to generate B2B leads on LinkedIn: define the target, find the people, warm them up, reach them by email and LinkedIn, and measure. With tools and costs.",
        h1="How to Generate Leads on LinkedIn",
        crumb="Generate Leads on LinkedIn",
        subtitle="A five-step playbook for generating B2B leads on LinkedIn, from choosing who to target to reaching them on the channel they answer.",
        checks=[
            "Define a target narrow enough to write one message for",
            "Find the people and their work emails without risking your account",
            "Use posts and engagement to warm leads up before you reach out",
        ],
        actions=[("Find your first leads", f"{S}/linkedin-lead-extractor")],
        sections=[
            ("Step 1: pick a target you can write one message for", """
      <p>"Marketing leaders" is too broad. "Heads of Demand Gen at B2B SaaS companies of 50-200 people in the US who are hiring SDRs" is a target: you can say something specific to all of them. Write it down as job titles, locations, seniority and company size, because those are the filters you will search with.</p>"""),
            ("Step 2: find the people", """
      <p>Search with those filters in the <a href="https://linkfinderai.com/linkedin-lead-extractor">LinkedIn lead extractor</a>. It returns matching profiles with work emails, without your LinkedIn account. If you prefer Sales Navigator, build the list there and <a href="https://linkfinderai.com/export-sales-navigator-leads">export it</a>.</p>"""),
            ("Step 3: warm them up on LinkedIn", """
      <p>Post about the problem you solve, once or twice a week. The people who react are your warmest leads: the <a href="https://linkfinderai.com/linkedin-post-likers-export">post likers export</a> lists them, so you can follow up with the ones who match your target. A clean, readable post helps; the free <a href="https://linkfinderai.com/linkedin-post-formatter">LinkedIn post formatter</a> adds bold, italics and bullets that LinkedIn's editor lacks.</p>"""),
            ("Step 4: reach out on two channels", """
      <p>LinkedIn messages are capped and crowded. Email is not. A short connection request plus an email to their work address reaches people who never open LinkedIn messages. LinkFinder AI returns the verified work email from a profile URL for 10 credits, and a direct dial for 50 if you call.</p>"""),
            ("Step 5: measure and narrow", """
      <p>Track replies by segment, not overall. When one title or company size replies twice as often, narrow the target to it and repeat from step 2.</p>"""),
        ],
        faq=[
            ("How do I generate leads on LinkedIn for free?", "Post consistently, engage with your target's content, and follow up with the people who react. Tools such as LinkFinder AI include free credits to find their emails."),
            ("Is LinkedIn good for B2B lead generation?", "Yes, because job titles and companies are accurate and current. Combine it with email, since LinkedIn messages are limited and many people rarely read them."),
            ("How do I find the email of a LinkedIn lead?", "Use an email finder with their profile URL. LinkFinder AI returns a verified work email for about 9 profiles in 10 for paying users."),
        ],
        related=[
            ("linkedin-lead-extractor", "LinkedIn lead extractor", "Profiles and emails"),
            ("linkedin-post-likers-export", "Post likers export", "Your warmest leads"),
            ("linkedin-post-formatter", "LinkedIn post formatter", "Bold, italics, bullets"),
            ("lead-sourcing", "Lead sourcing", "Six B2B lead sources"),
            ("linkedin-email-finder", "LinkedIn email finder", "Work email from a profile"),
        ],
    ),
    dict(
        slug="scrape-linkedin-followers",
        title="How to Scrape LinkedIn Followers (and a Safer Alternative)",
        description="LinkedIn does not let you export followers. What follower scrapers do, why they risk your account, and how to get engaged followers with emails instead.",
        h1="How to Scrape LinkedIn Followers",
        crumb="Scrape LinkedIn Followers",
        subtitle="LinkedIn shows your followers but has no export. Here is what follower scrapers do, the risk they carry, and a safer way to get the followers who actually engage, with their emails.",
        checks=[
            "What LinkedIn lets you see and export about followers",
            "Why follower scrapers put your account at risk",
            "Export the people who react to your posts, then add emails",
        ],
        actions=[("Export a post's reactions", f"{S}/linkedin-post-likers-export")],
        sections=[
            ("Can you export your LinkedIn followers?", """
      <p>No. You can scroll through your followers, and company page admins get follower analytics (job functions, seniority, locations) in aggregate, but neither personal profiles nor company pages can download a list of individual followers.</p>"""),
            ("What follower scrapers do", """
      <p>A follower scraper opens your follower list while logged in as you and records each name and profile URL as it scrolls. It works, slowly, and it is exactly the kind of automated browsing LinkedIn restricts. It also gives you the whole list, including the large share of followers who never read your posts.</p>
      <div class="note">LinkFinder AI does not scrape follower lists and never logs in to LinkedIn as you.</div>"""),
            ("The safer, more useful list: people who engage", """
      <p>For lead generation, the followers who matter are the ones who react to and comment on your posts. They are a smaller list and a much warmer one. The <a href="https://linkfinderai.com/linkedin-post-likers-export">LinkedIn post likers export</a> takes a post URL and returns everyone who reacted, with their profile URL, for 1 credit per person. Commenters are covered by the <a href="https://linkfinderai.com/linkedin-post-commenters-export">commenters export</a>.</p>
      <p>Run it on your last few posts and you have a list of engaged followers. Add their work emails with the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk email finder</a> (10 credits each).</p>"""),
        ],
        faq=[
            ("Can I download a list of my LinkedIn followers?", "No. LinkedIn shows followers and aggregate follower analytics, but offers no export of individual followers."),
            ("Is scraping LinkedIn followers safe?", "Scrapers browse as your account, which LinkedIn can restrict. Exporting the reactions on your posts with a tool that does not use your account is safer."),
            ("How do I get emails of people who engage with my posts?", "Export the post's reactions (1 credit per person), then run the profile URLs through an email finder (10 credits each)."),
        ],
        related=[
            ("linkedin-post-likers-export", "Post likers export", "Everyone who reacted"),
            ("linkedin-post-commenters-export", "Post commenters export", "Everyone who commented"),
            ("bulk-linkedin-email-finder", "Bulk email finder", "Emails for the list"),
            ("how-to-generate-leads-on-linkedin", "Generate leads on LinkedIn", "The full playbook"),
        ],
    ),
]
