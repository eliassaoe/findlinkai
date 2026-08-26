/* lf-csv.js — shared CSV header intelligence for the standalone tool pages.
 *
 * The main app (app.html) carries its own richer copy with a column-mapper UI.
 * These pages have small single-purpose widgets, so this gives them the part
 * that actually caused rejections: knowing what a column is called.
 *
 * Exposes: lfFindColumn(headers, kind), lfCsvRows(text), lfCsvNormalizeName(s)
 */
(function (w) {
  var SYN = {
    full_name:['lead_full_name','full name','fullname','name','lead name','contact name','lead','contact','person','person name','prospect','prospect name','display name','nom complet','nom et prenom','candidate'],
    first_name:['first name','firstname','first','given name','givenname','forename','fname','prenom','prénom','nombre','vorname','nome'],
    last_name:['last name','lastname','last','surname','family name','familyname','lname','nom','nom de famille','apellido','nachname','cognome'],
    company:['company','company name','companyname','organization','organisation','org','employer','employer name','firm','business','account','account name','current company','workplace','entreprise','société','societe','compagnie','empresa','unternehmen','azienda','bedrijf'],
    company_domain:['company domain','domain','website','url','web','site','website url','company website','homepage','site web','domaine','company url'],
    linkedin_profile:['linkedin profile','linkedin profile url','profile url','linkedin url','linkedin','profile','li url','linkedin link','person linkedin url','profile link','lien linkedin'],
    linkedin_company:['linkedin company','company linkedin url','company linkedin','linkedin company url','linkedin url','linkedin'],
    linkedin_post:['linkedin post','post url','linkedin post url','post','post link','activity url','post id','post_id'],
    job_search_url:['job search url','job_search_url','search url','jobs url','url','linkedin url','search'],
    email:['email','email address','emailaddress','e-mail','mail','emails','work email','business email','professional email','primary email','email1','courriel','correo'],
    location:['location','city','loc','country','region','ville','pays','based in','area','town','state'],
    job_title:['job title','jobtitle','title','position','role','headline','poste','fonction','designation']
  };
  function norm(h){ return String(h == null ? '' : h).toLowerCase().replace(/^﻿/, '').replace(/[\s_\-.]/g, '').trim(); }
  // Substring only counts for synonyms of 5+ chars, so "firstName" is never
  // mistaken for a full "name" column.
  function score(header, kind){
    var h = norm(header); if (!h) return 0;
    var list = SYN[kind] || [], best = 0;
    for (var i = 0; i < list.length; i++){
      var n = norm(list[i]);
      if (h === n) return 3;
      if (n.length >= 5 && (h.indexOf(n) !== -1 || n.indexOf(h) !== -1)) best = Math.max(best, 1);
    }
    return best;
  }
  function lfFindColumn(headers, kind, exclude){
    var skip = {}; (exclude || []).forEach(function (i){ skip[i] = 1; });
    var bi = -1, bs = 0;
    (headers || []).forEach(function (h, i){
      if (skip[i]) return;
      var s = score(h, kind);
      if (s > bs){ bs = s; bi = i; }
    });
    return bs > 0 ? bi : -1;
  }
  function detectDelim(line){
    var c = { ',':0, ';':0, '\t':0, '|':0 }, q = false;
    for (var i = 0; i < line.length; i++){
      var ch = line[i];
      if (ch === '"') q = !q;
      else if (!q && c.hasOwnProperty(ch)) c[ch]++;
    }
    return Object.keys(c).reduce(function (a, b){ return c[b] > c[a] ? b : a; }, ',');
  }
  function splitLine(line, d){
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++){
      var ch = line[i];
      if (q){
        if (ch === '"'){ if (line[i+1] === '"'){ cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d){ out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (v){ return v.trim(); });
  }
  // Returns {headers: [...], rows: [[...]]} — BOM-safe, delimiter-sniffing,
  // quote-aware, and skips title rows above the real header.
  function lfCsvRows(text){
    var lines = String(text || '').replace(/^﻿/, '').split(/\r\n|\r|\n/).filter(function (l){ return l.trim(); });
    if (lines.length < 2) return { headers: [], rows: [] };
    var hIdx = 0;
    for (var i = 0; i < Math.min(lines.length - 1, 5); i++){
      var d0 = detectDelim(lines[i]);
      var a = splitLine(lines[i], d0).length, b = splitLine(lines[i+1], d0).length;
      if (a > 1 && a === b){ hIdx = i; break; }
    }
    var d = detectDelim(lines[hIdx]);
    var headers = splitLine(lines[hIdx], d).map(function (h){ return h.replace(/^"|"$/g, ''); });
    var rows = [];
    for (var j = hIdx + 1; j < lines.length; j++){
      var v = splitLine(lines[j], d);
      if (v.some(function (x){ return x !== ''; })) rows.push(v);
    }
    return { headers: headers, rows: rows };
  }
  // "Doe, John" -> "John Doe"
  function lfCsvNormalizeName(s){
    var m = String(s || '').match(/^\s*([^,]{1,60}?)\s*,\s*([^,]{1,60}?)\s*$/);
    return m ? m[2] + ' ' + m[1] : String(s || '');
  }
  w.lfFindColumn = lfFindColumn;
  w.lfCsvRows = lfCsvRows;
  w.lfCsvNormalizeName = lfCsvNormalizeName;
  w.lfCsvSynonyms = SYN;
})(window);
