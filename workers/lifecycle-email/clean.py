import re, sys, json

RAW = """eliasseiapro23123@gmail.com|346|Pay As You Go — Medium|2026-08-21
testestes@gmail.com|93|Professional|2026-07-16
qbeqbqneneq@gmail.com|89|Pay As You Go — Small|2026-07-27
eliasseiapro12223422@gmail.com|70|Starter|2026-05-20
lilin@mailvn.biz|43|Starter|2026-08-10
cejkfcjhejh@gmail.com|42|Starter|2026-07-30
hamoureliasse@gmail.com|38|Starter|2026-08-13
testestingzrg@gmail.com|37|Professional|2026-08-10
eliasseiapro1222134@gmail.com|35|Professional|2026-05-17
gziugnzriugn@gmail.com|33|Professional|2026-06-28
tetstsgesgz@gmail.com|32|Enterprise|2026-06-19
testaffiliate@gmail.com|30|Starter|2026-08-12
mitch@buzz.ai|22|Starter|2026-08-13
borrisbdunn@gmail.com|14|Pay As You Go — Small|2026-07-31
t80635019@gmail.com|12|Starter|2026-06-30
souvicksarkarcbsa@gmail.com|12|Starter|2026-07-31
necese7947@synsky.com|8|Starter|2026-06-21
jatin.bhatnagar@vianaar.com|8|Starter|2026-08-18
gogasigua4@gmail.com|7|Enterprise|2026-07-10
slater@guidance.so|7|Starter|2026-08-12
sakiali9898@gmail.com|7|Pay As You Go — Medium|2026-07-15
h.deubner@miete24.com|5|Starter|2026-08-04
uswaarooj.codingal@gmail.com|5|Starter|2026-07-22
info@focusone.ie|5|Starter|2026-05-19
ramyareddy1432021@gmail.com|5|Pay As You Go — Medium|2026-07-20
a.kroshilin@mellow.io|4|Professional|2026-06-03
srivastava.atul@legistify.com|3|Starter|2026-05-19
jack.downs@jdemand.com|3|Starter|2026-05-22
eliasseiapro111223@gmail.com|3|Starter|2026-05-20
tatariya.ravi@gmail.com|2|Professional|2026-06-16
abdelkhbx@gmail.com|2|Professional|2026-06-27
sheilanyaata34@gmail.com|2|Starter|2026-07-15
moscowmule645@gmail.com|2|Starter|2026-05-28
informabahrain@gmail.com|2|Starter|2026-05-19
redbustu@onionmail.org|2|Professional|2026-06-03
charlesmackenzie008@gmail.com|2|Professional|2026-06-01
gagrinas.g@gmail.com|1|Starter|2026-06-05
nilimbani01@gmail.com|1|Starter|2026-08-06
atlasbuildersofficial@gmail.com|1|Starter|2026-05-18
zvhvzrjvh@gmail.com|1|Professional|2026-07-30
focen42514@dardr.com|1|Enterprise|2026-05-20
k.boiko@mobilunity.com|1|Pay As You Go — Small|2026-08-12
fredomega007@gmail.com|1|Pay As You Go — Small|2026-07-21
anishkrish05@gmail.com|1|Starter|2026-06-03
rajabhargawa3@gmail.com|1|Starter|2026-08-07
nathaniel@loopwebdesign.com.au|1|Starter|2026-05-21
leighton@rbo.team|0|Pay As You Go — Small|2026-08-20
gejkbnoBNOURN@gmail.com|0|Professional|2026-06-16
ertetr@gmail.com|0|Starter|2026-05-24
ravi.hyrezy4@gmail.com|0|Starter|2026-05-26
asfafa@gmail.com|0|Professional|2026-07-16
ramramladder@proton.me|0|Starter|2026-07-10
68jqt1dxkz@onlylicensedcasinos.com|0|Professional|2026-08-17
eliasseiapro2312312@gmail.com|0|Enterprise|2026-08-19
mandy1396williams@gmail.com|0|Professional|2026-05-22
vbqtibi@gmail.com|0|Professional|2026-06-02
testestegerb@gmail.com|0|Starter|2026-08-10
outreach@smail.iitm.ac.in|0|Pay As You Go — Small|2026-08-03
tesvebebvrrz@gmail.com|0|Professional|2026-08-11
hamoureliass13134e@gmail.com|0|Enterprise|2026-08-11
joeygeorge302@gmail.com|0|Starter|2026-07-08
ayushsrivastavfrontdesk@gmail.com|0|Pay As You Go — Small|2026-08-14
captaindata1999@gmail.com|0|Starter|2026-08-13
eliasseiapro235@gmail.com|0|Starter|2026-06-02
testrefelct@gmail.com|0|Enterprise|2026-08-08
meetbhati104@gmail.com|0|Starter|2026-08-02
arunimavianaar@gmail.com|0|Starter|2026-05-18
amityadav251091@gmail.com|0|Starter|2026-05-18
krishhura2005@gmail.com|0|Pay As You Go — Small|2026-07-31
mak.dyatlov@gmail.com|0|Starter|2026-05-29
leslelelslel@gmail.com|0|Starter|2026-08-10
amanshrivastava932@gmail.com|0|Starter|2026-05-27
zetzgz@gmail.com|0|Starter|2026-05-27
reddit12345@gmail.com|0|Pay As You Go — Large|2026-08-18"""

# Emailing your own address, a QA account, or a burner costs sending capacity and
# — for the burners — a hard bounce, which is what actually damages a domain.
OWN = re.compile(r'^(hamoureliass|eliasse|eliasseiapro)', re.I)
TESTY = re.compile(r'(test|tset|refelct|affiliate|captaindata|reddit12345)', re.I)
DISPOSABLE = {'mailvn.biz','synsky.com','dardr.com','onionmail.org','proton.me',
              'onlylicensedcasinos.com'}

def looks_mashed(local):
    """Keyboard-mash signups: long, no separators, almost no vowels."""
    if len(local) < 6 or any(c in local for c in '._-') or any(c.isdigit() for c in local):
        return False
    vowels = sum(c in 'aeiou' for c in local.lower())
    return vowels / len(local) < 0.26

FREE = {'gmail.com','yahoo.com','hotmail.com','outlook.com','proton.me','icloud.com'}

keep, drop = [], {}
for line in RAW.strip().split('\n'):
    email, lookups, plan, last = line.split('|')
    local, domain = email.split('@')
    reason = None
    if OWN.match(local):                 reason = 'your own address'
    elif TESTY.search(local):            reason = 'test account'
    elif domain.lower() in DISPOSABLE:   reason = 'disposable inbox'
    elif looks_mashed(local):            reason = 'keyboard-mash signup'
    if reason:
        drop.setdefault(reason, []).append(email)
    else:
        keep.append({'email': email, 'lookups': int(lookups), 'plan': plan,
                     'last_seen': last, 'business': domain.lower() not in FREE})

print(f"RAW SEGMENT: {len(RAW.strip().splitlines())} addresses\n")
print("REMOVED:")
for r, lst in sorted(drop.items(), key=lambda x: -len(x[1])):
    print(f"   {len(lst):>3}  {r}")
print(f"\nKEEP: {len(keep)}  (of which {sum(k['business'] for k in keep)} on a company domain)\n")
print("TOP OF THE CLEAN LIST (by usage):")
for k in sorted(keep, key=lambda x: -x['lookups'])[:14]:
    tag = 'company' if k['business'] else 'personal'
    print(f"   {k['lookups']:>3} lookups  {k['plan']:<22} {tag:<8} {k['email']}")
json.dump(keep, open('/tmp/claude-0/-home-user-findlinkai/17412ad2-df5e-5b8d-8aa4-24e7606e5c8f/scratchpad/email/segment1_clean.json','w'), indent=1)
