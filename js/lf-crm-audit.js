/*
 * LinkFinder AI — CRM data health audit engine.
 *
 * Runs ENTIRELY in the browser. A CRM export is the most sensitive file a sales
 * team owns, so none of it is uploaded: the file is parsed here, only aggregate
 * counts ever leave the page, and the recommendation is computed locally. That
 * is also why the audit is free to offer — there is no OAuth app, no stored
 * connection, and no Nango seat behind it. Persistent write-back sync is the
 * paid feature; a one-shot read is not.
 *
 * Source-agnostic on purpose. It reads a flat table of contact rows, so a
 * HubSpot export, a Salesforce report, a Pipedrive dump or a hand-made
 * spreadsheet all work identically. The HubSpot-specific path (private app
 * token) feeds the same analyse() with rows fetched server-side.
 */
(function (global) {
    'use strict';

    /* ---------------------------------------------------------------------
     * Pricing — mirrors pricing.html. Kept in one place so a pricing change
     * is a single edit here rather than a hunt through the UI.
     * ------------------------------------------------------------------- */

    var PLANS = [
        { id: 'starter',      name: 'Starter',      price: 49,  credits: 5000  },
        { id: 'professional', name: 'Professional', price: 89,  credits: 20000 },
        { id: 'enterprise',   name: 'Enterprise',   price: 149, credits: 50000 }
    ];

    var PACKS = [
        { credits: 1000,  price: 25  },
        { credits: 3500,  price: 75  },
        { credits: 10000, price: 200 }
    ];

    /*
     * Credit cost to FILL one missing field, by field type.
     *
     * These mirror the live per-operation costs in app.html, which is the table
     * that actually debits the account. They are NOT flat: a phone lookup costs
     * 50x what a company lookup does, because phone data costs that much more to
     * source. Quoting a flat rate here would under-quote every audit involving
     * phones by a factor of 50.
     *
     * Keep this in sync with app.html. Everything the product quotes — the gap
     * table, the pack maths, the plan recommendation — derives from these five
     * numbers, so a pricing change is a single edit here.
     */
    var CREDIT_COST = {
        email:    10,   // linkedin_profile_to_email
        phone:    50,   // linkedin_profile_to_phone
        linkedin: 5,    // email_to_linkedin_url
        title:    10,   // linkedin_profile_to_linkedin_info (full profile enrich)
        company:  1     // company_name_to_website / company_domain_to_employees
    };

    /*
     * Order matters: this is the order gaps are presented to the user, cheapest
     * and most commercially useful first.
     */
    var FIELDS = [
        { key: 'email',    label: 'Missing email address',   fix: 'Find business email' },
        { key: 'phone',    label: 'Missing phone number',    fix: 'Find business phone' },
        { key: 'linkedin', label: 'Missing LinkedIn URL',    fix: 'Find LinkedIn profile' },
        { key: 'title',    label: 'Missing job title',       fix: 'Enrich profile' },
        { key: 'company',  label: 'Missing company',         fix: 'Enrich company record' }
    ];

    /* ---------------------------------------------------------------------
     * CSV parsing
     * ------------------------------------------------------------------- */

    /*
     * RFC4180-style parser. Written by hand rather than pulled from a library
     * because this file is loaded directly by a static page with no build step,
     * and CRM exports reliably contain quoted commas ("Acme, Inc") and embedded
     * newlines in note fields — a naive split(',') corrupts real exports.
     */
    function parseCSV(text) {
        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        var i = 0;

        // Strip a UTF-8 BOM: Excel adds one and it silently breaks the first header.
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        while (i < text.length) {
            var c = text[i];

            if (inQuotes) {
                if (c === '"') {
                    if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                    inQuotes = false; i++; continue;
                }
                field += c; i++; continue;
            }

            if (c === '"') { inQuotes = true; i++; continue; }
            if (c === ',') { row.push(field); field = ''; i++; continue; }
            if (c === '\r') { i++; continue; }
            if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }

            field += c; i++;
        }

        // Trailing field/row when the file does not end in a newline.
        if (field.length || row.length) { row.push(field); rows.push(row); }

        // Drop fully-empty rows — exports commonly end with several.
        return rows.filter(function (r) {
            return r.some(function (cell) { return String(cell).trim() !== ''; });
        });
    }

    /* ---------------------------------------------------------------------
     * Column detection
     * ------------------------------------------------------------------- */

    /*
     * Header aliases per field. Every CRM names these differently and users
     * rename them again, so match on a normalised header against a list of
     * known spellings, then fall back to substring matching.
     */
    var HEADER_ALIASES = {
        email:    ['email', 'emailaddress', 'workemail', 'businessemail', 'primaryemail', 'contactemail', 'mail'],
        phone:    ['phone', 'phonenumber', 'mobile', 'mobilephone', 'workphone', 'businessphone', 'telephone', 'tel', 'cell', 'directphone'],
        linkedin: ['linkedin', 'linkedinurl', 'linkedinprofile', 'linkedinprofileurl', 'lipurl', 'linkedinlink'],
        title:    ['jobtitle', 'title', 'position', 'role', 'jobposition', 'designation'],
        company:  ['company', 'companyname', 'organization', 'organisation', 'employer', 'account', 'accountname', 'associatedcompany'],
        name:     ['fullname', 'name', 'contactname', 'firstname', 'lastname', 'givenname', 'surname', 'familyname']
    };

    function normaliseHeader(h) {
        return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /*
     * Returns { field -> columnIndex }. Exact alias matches win over substring
     * matches so that "Company Name" maps to company and not, say, name.
     */
    function detectColumns(headers) {
        var normalised = headers.map(normaliseHeader);
        var map = {};

        Object.keys(HEADER_ALIASES).forEach(function (field) {
            var aliases = HEADER_ALIASES[field];
            var idx = -1;

            for (var a = 0; a < aliases.length && idx === -1; a++) {
                idx = normalised.indexOf(aliases[a]);
            }

            if (idx === -1) {
                for (var h = 0; h < normalised.length && idx === -1; h++) {
                    if (map._used && map._used.indexOf(h) !== -1) continue;
                    for (var b = 0; b < aliases.length; b++) {
                        if (normalised[h].indexOf(aliases[b]) !== -1) { idx = h; break; }
                    }
                }
            }

            if (idx !== -1) map[field] = idx;
        });

        delete map._used;
        return map;
    }

    /* ---------------------------------------------------------------------
     * Value validation
     * ------------------------------------------------------------------- */

    /*
     * CRMs are full of placeholder junk that is technically non-empty. Treating
     * these as "present" would under-report gaps and make the audit look wrong
     * to anyone who knows their own data.
     */
    var JUNK = ['n/a', 'na', 'none', 'null', 'unknown', '-', '--', 'tbd', 'no email', 'not available', 'nil', '#n/a'];

    function isBlank(v) {
        if (v === null || v === undefined) return true;
        var s = String(v).trim();
        if (!s) return true;
        return JUNK.indexOf(s.toLowerCase()) !== -1;
    }

    /*
     * Deliberately permissive. The audit reports what is MISSING — a hard fact
     * the user can verify. It does not claim data is "wrong", because proving
     * an address is stale requires verification the audit has not performed,
     * and telling someone their data is wrong without proof invites an argument
     * that kills the conversation. Only structurally impossible values count.
     */
    function isValidEmail(v) {
        if (isBlank(v)) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim());
    }

    function isValidPhone(v) {
        if (isBlank(v)) return false;
        var digits = String(v).replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15;
    }

    function isValidLinkedIn(v) {
        if (isBlank(v)) return false;
        return /linkedin\.com\/(in|pub)\//i.test(String(v));
    }

    function fieldPresent(field, value) {
        if (field === 'email')    return isValidEmail(value);
        if (field === 'phone')    return isValidPhone(value);
        if (field === 'linkedin') return isValidLinkedIn(value);
        return !isBlank(value);
    }

    /* ---------------------------------------------------------------------
     * Pricing maths
     * ------------------------------------------------------------------- */

    /*
     * Cheapest combination of packs covering `credits`.
     *
     * Greedy largest-first is wrong here: needing 11,000 credits, greedy buys
     * 10,000 + 3,500 = $275, when 10,000 + 1,000 = $225 covers it. The pack
     * list is tiny, so search exhaustively over a bounded count instead.
     */
    function cheapestPacks(credits) {
        if (credits <= 0) return { price: 0, packs: [], credits: 0 };

        var best = null;
        var largest = PACKS[PACKS.length - 1];
        var maxLargest = Math.ceil(credits / largest.credits) + 1;

        for (var a = 0; a <= maxLargest; a++) {
            for (var b = 0; b <= 4; b++) {
                for (var c = 0; c <= 4; c++) {
                    var total = a * PACKS[2].credits + b * PACKS[1].credits + c * PACKS[0].credits;
                    if (total < credits) continue;
                    var price = a * PACKS[2].price + b * PACKS[1].price + c * PACKS[0].price;
                    if (!best || price < best.price || (price === best.price && total < best.credits)) {
                        var packs = [];
                        if (a) packs.push({ count: a, credits: PACKS[2].credits, price: PACKS[2].price });
                        if (b) packs.push({ count: b, credits: PACKS[1].credits, price: PACKS[1].price });
                        if (c) packs.push({ count: c, credits: PACKS[0].credits, price: PACKS[0].price });
                        best = { price: price, packs: packs, credits: total };
                    }
                }
            }
        }

        return best || { price: 0, packs: [], credits: 0 };
    }

    /* Smallest plan whose monthly allocation covers `credits` in one month. */
    function planCovering(credits) {
        for (var i = 0; i < PLANS.length; i++) {
            if (PLANS[i].credits >= credits) return PLANS[i];
        }
        return null;
    }

    /* ---------------------------------------------------------------------
     * Analysis
     * ------------------------------------------------------------------- */

    /*
     * rows: array of plain objects OR { headers: [...], rows: [[...]] }.
     * Returns the full audit result consumed by the UI.
     */
    function analyse(input, options) {
        options = options || {};

        var headers, records;

        if (input && input.headers && input.rows) {
            headers = input.headers;
            records = input.rows;
        } else if (Array.isArray(input) && input.length && !Array.isArray(input[0])) {
            // Array of objects (HubSpot API path) — synthesise a header row.
            headers = Object.keys(input[0]);
            records = input.map(function (o) {
                return headers.map(function (h) { return o[h]; });
            });
        } else {
            headers = [];
            records = [];
        }

        var columns = detectColumns(headers);
        var totalContacts = records.length;

        var gaps = {};
        FIELDS.forEach(function (f) { gaps[f.key] = 0; });

        var seenEmail = Object.create(null);
        var seenIdentity = Object.create(null);   // key -> email seen for that identity
        var duplicateEmails = 0;
        var duplicateIdentities = 0;

        records.forEach(function (row) {
            FIELDS.forEach(function (f) {
                // A column the export does not contain is a gap for every row:
                // the CRM genuinely has no value for any of them.
                if (!(f.key in columns)) { gaps[f.key]++; return; }
                if (!fieldPresent(f.key, row[columns[f.key]])) gaps[f.key]++;
            });

            if ('email' in columns) {
                var email = String(row[columns.email] || '').trim().toLowerCase();
                if (isValidEmail(email)) {
                    if (seenEmail[email]) duplicateEmails++;
                    else seenEmail[email] = true;
                }
            }

            /*
             * Name+company matching alone over-reports badly: common names inside
             * one large employer collide constantly, and two genuinely different
             * people get merged. Only flag a POSSIBLE duplicate when the emails do
             * not contradict each other - i.e. at least one row has no email, or
             * both carry the same one. A pair with two different valid emails is
             * two different people, however alike the names look.
             */
            if ('name' in columns && 'company' in columns) {
                var name = String(row[columns.name] || '').trim().toLowerCase();
                var comp = String(row[columns.company] || '').trim().toLowerCase();
                if (name && comp) {
                    var key = name + '|' + comp;
                    var rowEmail = 'email' in columns
                        ? String(row[columns.email] || '').trim().toLowerCase() : '';
                    var prior = seenIdentity[key];
                    if (prior === undefined) {
                        seenIdentity[key] = rowEmail;
                    } else if (!prior || !rowEmail || prior === rowEmail) {
                        duplicateIdentities++;
                    }
                }
            }
        });

        // Only count each field the user actually wants filled. Defaults to all
        // detected gap types; the UI lets them deselect (they may not want phones).
        var selected = options.fields || FIELDS.map(function (f) { return f.key; });

        var breakdown = FIELDS.filter(function (f) {
            return selected.indexOf(f.key) !== -1 && gaps[f.key] > 0;
        }).map(function (f) {
            return {
                key: f.key,
                label: f.label,
                fix: f.fix,
                count: gaps[f.key],
                costPer: CREDIT_COST[f.key],
                credits: gaps[f.key] * CREDIT_COST[f.key],
                columnFound: f.key in columns
            };
        });

        var creditsNeeded = breakdown.reduce(function (sum, b) { return sum + b.credits; }, 0);

        // Completeness is a property of the DATA, not of what enriching it costs.
        // Deriving it from creditsNeeded made it depend on the price of a phone
        // lookup, which is unrelated: a CRM missing 100 phones is not "less
        // complete" than one missing 100 emails just because phones cost 5x more.
        var missingFieldCount = breakdown.reduce(function (sum, b) { return sum + b.count; }, 0);
        var selectedFieldCount = FIELDS.filter(function (f) { return selected.indexOf(f.key) !== -1; }).length;
        var totalSlots = totalContacts * selectedFieldCount;
        var completeness = totalSlots > 0
            ? Math.round(((totalSlots - missingFieldCount) / totalSlots) * 100)
            : 100;

        return {
            totalContacts: totalContacts,
            columnsDetected: columns,
            unmappedFields: FIELDS.filter(function (f) { return !(f.key in columns); }).map(function (f) { return f.key; }),
            breakdown: breakdown,
            creditsNeeded: creditsNeeded,
            duplicates: { byEmail: duplicateEmails, byNameCompany: duplicateIdentities },
            completeness: Math.max(0, Math.min(100, completeness)),
            recommendation: recommend(creditsNeeded, options)
        };
    }

    /*
     * The commercial core.
     *
     * A pack is the obvious thing to sell against a one-off cleanup, but packs
     * cost 2-5x more per credit than a subscription, so for any CRM of real
     * size the subscription is both cheaper for the customer AND recurring for
     * us. Rather than hide that, surface both numbers and let the arithmetic
     * make the argument — it is honest, and it converts a one-time pack sale
     * into a subscription the customer chose on the merits.
     *
     * The second half matters as much: a CRM decays. New rows arrive every
     * month with the same gaps, so a one-off clean is temporary by definition.
     * That is the real reason to be on a plan, and it is a fact about their
     * data rather than a sales line.
     */
    function recommend(creditsNeeded, options) {
        options = options || {};

        var packOption = cheapestPacks(creditsNeeded);
        var plan = planCovering(creditsNeeded);

        // Monthly maintenance: how many credits keeping the CRM clean costs once
        // the backlog is done. Callers can pass a measured figure; otherwise
        // assume monthly new-contact growth of 3% of the base, which is a
        // deliberately conservative mid-market number.
        var monthlyNew = options.monthlyNewContacts;
        if (monthlyNew === undefined || monthlyNew === null) {
            monthlyNew = Math.round((options.totalContacts || 0) * 0.03);
        }
        var maintenanceCredits = monthlyNew * (options.fieldsPerContact || 2);

        var result = {
            creditsNeeded: creditsNeeded,
            pack: packOption,
            plan: plan,
            maintenanceCredits: maintenanceCredits,
            monthlyNewContacts: monthlyNew
        };

        if (creditsNeeded === 0) {
            result.verdict = 'clean';
            result.headline = 'No gaps found in the fields you selected.';
            return result;
        }

        if (!plan) {
            // Bigger than Enterprise's monthly allocation — a real conversation,
            // not a checkout. This is the audit doing its other job: routing.
            result.verdict = 'contact';
            result.headline = 'Your CRM needs more than ' + fmt(PLANS[PLANS.length - 1].credits) +
                ' credits — bigger than any standard plan covers in one month.';
            return result;
        }

        result.savingVsPacks = packOption.price - plan.price;

        if (plan.price < packOption.price) {
            result.verdict = 'plan';
            result.headline = plan.name + ' at $' + plan.price + '/mo covers this immediately and costs $' +
                result.savingVsPacks + ' less than buying ' + fmt(packOption.credits) + ' credits as packs.';
        } else {
            // Small backlog: a pack is genuinely cheaper. Say so — recommending
            // the plan here would be a worse deal and the customer can see it.
            result.verdict = 'pack';
            result.headline = 'A one-time ' + fmt(packOption.credits) + '-credit pack at $' +
                packOption.price + ' covers this backlog.';
        }

        return result;
    }

    function fmt(n) {
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /* ---------------------------------------------------------------------
     * Public API
     * ------------------------------------------------------------------- */

    var api = {
        parseCSV: parseCSV,
        detectColumns: detectColumns,
        analyse: analyse,
        recommend: recommend,
        cheapestPacks: cheapestPacks,
        planCovering: planCovering,
        fmt: fmt,
        PLANS: PLANS,
        PACKS: PACKS,
        FIELDS: FIELDS,
        CREDIT_COST: CREDIT_COST,

        /* Convenience: raw CSV text -> full audit result. */
        auditCSV: function (text, options) {
            var rows = parseCSV(text);
            if (!rows.length) return analyse({ headers: [], rows: [] }, options);
            var headers = rows[0];
            var body = rows.slice(1);
            var opts = Object.assign({}, options || {}, { totalContacts: body.length });
            return analyse({ headers: headers, rows: body }, opts);
        }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LFCrmAudit = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
