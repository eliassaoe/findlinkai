"""Writes a 'single lookup, then the same lookup on a CSV' scenario for a
company-name input. Used for the pilot; values must come from real lookups.

    from company_bulk import write
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]


def write(slug, title, cover_how, pick, single, single_said, bulk, cost_line, result_word,
          last_wait, page, tags, next_video, outro_headline, single_wait=None, hover_single=None):
    utm = f"utm_source=youtube&utm_medium=video&utm_campaign={slug}"
    names = list(bulk.keys())
    csv = HERE / "assets" / f"{slug}.csv"
    csv.write_text("company_name\n" + "\n".join(names) + "\n")
    n = len(names)
    steps = []
    for i, p in enumerate(pick):
        steps.append({"id": f"s0{2+i}", "narration": p["say"], "do": [{"click": p["click"]}]})
    k = 2 + len(pick)
    sid = lambda: f"s{k:02d}"
    steps.append({"id": sid(), "narration": f"Fill in the company name. We type {single[0]}.",
                  "do": [{"type": {"selector": "input[placeholder*='Tesla']", "value": single[0]}}]}); k += 1
    steps.append({"id": sid(), "narration": "Click Enrich Data.", "do": [{"click": {"role": "button", "name": "Enrich Data"}}]}); k += 1
    w = single_wait or single[1]
    steps.append({"id": sid(), "narration": single_said, "do": [{"waitText": w}, {"hover": {"text": hover_single or w}}]}); k += 1
    steps.append({"id": sid(), "narration": "Now do it for a whole list. Click Upload CSV, bulk.",
                  "do": [{"scrollBy": -400}, {"click": {"text": "Upload CSV (bulk)"}}]}); k += 1
    steps.append({"id": sid(), "narration": f"Click Select File and pick your CSV. One column of company names is enough. Ours has {n}, from {names[0]} to {names[-1]}.",
                  "do": [{"upload": {"role": "button", "name": "Select File", "file": csv.name}}]}); k += 1
    steps.append({"id": sid(), "narration": "You see the rows before anything runs, so you know exactly what you will spend.", "do": [{"pause": 0.6}]}); k += 1
    steps.append({"id": sid(), "narration": f"Click Process {n} items.", "do": [{"click": {"role": "button", "name": f"Process {n} items"}}]}); k += 1
    steps.append({"id": sid(), "narration": f"The {result_word} come in row by row while you watch.", "do": [{"waitText": last_wait}], "tail": 0.3}); k += 1
    steps.append({"id": sid(), "narration": f"{n} companies in, {n} {result_word} out, every one marked Found. {cost_line}",
                  "do": [{"scroll": {"selector": "th:has-text('Status')", "offset": 120}}]}); k += 1
    steps.append({"id": sid(), "narration": "Click Export to download the list as a CSV, ready for your CRM or your next enrichment.",
                  "do": [{"hover": {"role": "button", "name": "Export"}}]})
    by = dict(bulk); by[single[0]] = single[1]
    d = {
        "slug": slug, "title": title,
        "coverSub": f"From a list of company names to their {result_word}",
        "cover": f"In this video we are going to see how to {cover_how} using LinkFinder AI.",
        "payoff": f"Here is what you end up with. {n} company names went in, and every one came back with its {result_word[:-1] if result_word.endswith('s') else result_word}, ready to export. Now let's see how.",
        "outro": f"That's the whole flow: a list of companies in, {result_word} out. Click the first link in the description to create your free account and run your own list. Next, watch how to {next_video}.",
        "outroHeadline": outro_headline, "outroSub": "Free account, credits included. First link in the description.",
        "mocks": {"credits": 5000, "singleDelayMs": 2400, "bulkDelayMs": 650, "byInput": by,
                  "_source": "Real results from the LinkFinder AI API, 12 Nov 2026"},
        "setup": [{"click": {"text": "I just need one lookup for now"}}],
        "steps": steps,
        "payoffScrollTo": {"selector": "th:has-text('Status')"}, "payoffOffset": 250,
        "tags": tags,
        "description": (f"{title.replace(' With LinkFinder AI', '')}: from a plain list of company names, in bulk.\n\n"
                        f"Try LinkFinder AI free: https://linkfinderai.com/{page}?{utm}\n"
                        f"Get a free list of 50 leads with emails: https://linkfinderai.com/free-list?{utm}\n\n"
                        f"In this video:\n- One lookup: {single[0]} ({cost_line.strip()})\n- A whole CSV of company names, then export\n\n"
                        "The values on screen are real LinkFinder AI results."),
    }
    (HERE / "scenarios" / f"{slug}.json").write_text(json.dumps(d, indent=2, ensure_ascii=False))
    return d
