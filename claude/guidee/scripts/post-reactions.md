# Export LinkedIn Post Likers And Commenters With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `post-reactions` |
| **Target page** | `linkedin-post-likers-export.html` |
| **Enrichment** | `LinkedIn Post URL` -> `Post Reactions` |
| **Demo data** | a public LinkedIn post with 300+ reactions (pick one from a well-known SaaS founder so the names are recognizable) |
| **Length** | 24 steps, ~2 min 40 s |

## Cover

> In this video we are going to see how to export everyone who liked or
> commented on a LinkedIn post, and turn them into contactable leads, using
> LinkFinder AI.

## Click script

Rehearse this end to end before recording. Type each value in one go — do not
pause mid-field or Guidde will split it into two steps.

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | (pre-recorded end state on screen) | exported CSV open in a spreadsheet | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Copy | the post URL from the LinkedIn address bar | — |
| 05 | Click | `I have` | — |
| 06 | Select | `LinkedIn Post URL` | — |
| 07 | Click | `I want to find` | — |
| 08 | Select | `Post Reactions` | — |
| 09 | Click | `Enter LinkedIn Post URL` | — |
| 10 | Paste | the post URL | `linkedin.com/feed/update/urn:li:activity:...` |
| 11 | Click | `Enrich Data` | — |
| 12 | (wait) | results panel fills | — |
| 13 | Scroll | the results list | — |
| 14 | Click | one reactor's row | — |
| 15 | Click | `Copy` on `LinkedIn URL` | — |
| 16 | Click | `I have` | — |
| 17 | Select | `LinkedIn Profile URL` | — |
| 18 | Click | `I want to find` | — |
| 19 | Select | `Email Address` | — |
| 20 | Paste | into `Enter LinkedIn Profile URL` | the copied URL |
| 21 | Click | `Enrich Data` | — |
| 22 | Click | `Bulk` | — |
| 23 | Click | `Export CSV` | — |
| 24 | (closing card) | — | — |

## Step cards

**01 What You End Up With**
> This is a spreadsheet of everyone who engaged with a single LinkedIn post,
> each one with a verified email next to their name — that is what we are
> building in the next two minutes.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which is more than
> enough to follow along with this video.

**04 Copy The Post URL**
> Copy the URL of any public LinkedIn post straight from your address bar.
> You do not need to be connected to the author.

**05 Open The Input Dropdown**
> Click the I have dropdown to tell LinkFinder AI what you are starting from.

**06 Choose LinkedIn Post URL**
> Select LinkedIn Post URL.

**07 Open The Output Dropdown**
> Click the I want to find dropdown.

**08 Choose Post Reactions**
> Select Post Reactions. This is the only output for a post, so there is
> nothing to get wrong here.

**09 Select The URL Field**
> Click the Enter LinkedIn Post URL field.

**10 Paste The Post URL**
> Paste the post URL you copied.

**11 Run The Enrichment**
> Click Enrich Data.

**12 See Everyone Who Engaged**
> Every person who reacted to that post comes back with their name, job title
> and company — people who have already shown interest in this exact topic,
> which is a far warmer list than any filter on Sales Navigator.

**13 Scroll The Full List**
> Scroll through the results to see the full set of reactors.

**14 Open A Reactor's Profile**
> Click any row to expand that person's full profile data.

**15 Copy Their LinkedIn URL**
> Click Copy next to LinkedIn URL.

**16 Switch The Input Type**
> Click the I have dropdown again.

**17 Choose LinkedIn Profile URL**
> Select LinkedIn Profile URL.

**18 Open The Output Dropdown**
> Click the I want to find dropdown.

**19 Choose Email Address**
> Select Email Address. You can also pick Phone Number here if you would
> rather call than email.

**20 Paste The Profile URL**
> Paste the profile URL into the Enter LinkedIn Profile URL field.

**21 Get Their Verified Email**
> Click Enrich Data. That reactor is now a contactable lead with a verified
> email address, and nobody else in your market is working this list.

**22 Do It For The Whole List**
> Click Bulk to run that same email lookup across every reactor at once
> instead of one at a time.

**23 Export To CSV**
> Click Export CSV to download the finished list, ready to drop into your
> CRM or your cold email tool.

## Closing card

**24 Try It On Your Own Post**
> Find a post in your niche that did well this week and run it through
> LinkFinder AI — the link in the description gets you free credits to start.
> Next in this series: enriching a whole CSV of leads in one go.

## YouTube

**Title:** Export LinkedIn Post Likers And Commenters (Free Tool)

**Description:**
```
Full guide: https://linkfinderai.com/linkedin-post-likers-export.html

Everyone who liked or commented on a LinkedIn post has already told you they
care about that topic. This video shows how to export that whole list with
LinkFinder AI, then turn each reactor into a contactable lead with a verified
email or phone number — no LinkedIn automation, no browser extension, no risk
to your account.

00:00 What you end up with
00:12 Creating a free account
00:28 Pulling reactions from a post URL
01:05 Enriching one reactor into an email
01:48 Running the whole list in bulk
02:15 Exporting to CSV

More LinkFinder AI tutorials:
Scrape any LinkedIn profile: https://www.youtube.com/watch?v=PrU4WfSPZq4
Find an email from a LinkedIn URL: https://www.youtube.com/watch?v=FHGDdak6U3Q
Find a phone number from a LinkedIn URL: https://www.youtube.com/watch?v=P64Ba5-cHy8
Export every employee at a company: https://www.youtube.com/watch?v=otjjSBBtEQo
```

## Embed snippet

Paste into `linkedin-post-likers-export.html`, matching the existing pattern
in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">
  See it in action
</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Export LinkedIn Post Likers And Commenters - Free Tutorial"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
