"""Name + company -> LinkedIn profile scenario, templated on
scenarios/linkedin-profiles-from-names.json. Values must come from real lookups."""
import json, copy
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]


def write(slug, title, cover_how, who, single, rows, last_wait, tags, single_said, bulk_said, list_desc):
    base = json.loads((HERE / "scenarios" / "linkedin-profiles-from-names.json").read_text())
    d = copy.deepcopy(base)
    utm = f"utm_source=youtube&utm_medium=video&utm_campaign={slug}"
    n = len(rows)
    csv = HERE / "assets" / f"{slug}.csv"
    csv.write_text("name,company\n" + "\n".join(f"{nm},{co}" for nm, co, _ in rows) + "\n")
    d.update(slug=slug, title=title,
             cover=f"In this video we are going to see how to {cover_how} using LinkFinder AI.",
             payoff=f"Here is what you end up with. {n} {who} went in, and every one came back with the right LinkedIn profile. Now let's see how.",
             tags=tags)
    d["mocks"]["byInput"] = {single[0]: single[2], **{nm: url for nm, _, url in rows}}
    st = {s["id"]: s for s in d["steps"]}
    st["s04"]["narration"] = f"Fill in the full name. We type {single[0]}."
    st["s04"]["do"][0]["type"]["value"] = single[0]
    st["s05"]["narration"] = f"Fill in the company: {single[1]}. The company is what tells two people with the same name apart."
    st["s05"]["do"][0]["type"]["value"] = single[1]
    key = single[2].rstrip("/").split("/")[-1]
    st["s07"]["narration"] = single_said
    st["s07"]["do"] = [{"waitText": key}, {"hover": {"text": key}}]
    st["s09"]["narration"] = f"Click Select File and pick your CSV, with a name column and a company column. Ours has {n} {list_desc}."
    st["s09"]["do"][0]["upload"]["file"] = csv.name
    st["s11"]["narration"] = f"Click Process {n} items."
    st["s11"]["do"][0]["click"]["name"] = f"Process {n} items"
    st["s12"]["narration"] = bulk_said
    st["s12"]["do"] = [{"waitText": last_wait}]
    st["s13"]["narration"] = f"{n} people in, {n} LinkedIn profiles out, every one marked Found."
    d["description"] = (f"Find the LinkedIn profile of every person on your list, in bulk, from their name and company.\n\n"
                        f"Try LinkFinder AI free: https://linkfinderai.com/linkedin-url-finder?{utm}\n"
                        f"Get a free list of 50 leads with emails: https://linkfinderai.com/free-list?{utm}\n\n"
                        f"In this video:\n- One lookup: {single[0]} at {single[1]} (1 credit)\n- A CSV of names and companies -> LinkedIn profiles, then export\n\n"
                        "The values on screen are real LinkFinder AI results.")
    (HERE / "scenarios" / f"{slug}.json").write_text(json.dumps(d, indent=2, ensure_ascii=False))
