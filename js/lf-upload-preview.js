/* lf-upload-preview.js — "upload your list, watch a sample enrich, sign up to export".
 *
 * Why this exists: a single-lookup box qualifies nobody. Anyone will paste one
 * LinkedIn URL. Almost nobody uploads a file of 200 rows unless they have a real
 * list and a real job to do, so the upload itself is the qualification filter.
 *
 * Honesty rules this widget follows, and must keep following:
 *   - The sample rows are enriched FOR REAL against the free-tools worker. We
 *     never fabricate an email to make the preview look good.
 *   - Locked rows show a lock, never a plausible-looking fake value.
 *   - The row counts shown are the counts actually parsed from the file.
 *
 * Usage:
 *   <div id="lfUpload"></div>
 *   <script src="/js/lf-csv.js"></script>
 *   <script src="/js/lf-tools-key.js"></script>
 *   <script src="/js/lf-upload-preview.js"></script>
 *   <script>lfUploadPreview.mount({ container: '#lfUpload', tool: 'bulk_email' });</script>
 */
(function (w, d) {
  var WORKER = 'https://linkfinder-free-tools.hamoureliasse.workers.dev/';
  var PENDING_KEY = 'lf_pending_list';
  var MAX_ROWS = 25000;
  var MAX_PENDING = 5000;

  function capture(name, props) {
    try { if (w.posthog) w.posthog.capture(name, props || {}); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function injectStyle() {
    if (d.getElementById('lf-upload-preview-style')) return;
    var st = d.createElement('style');
    st.id = 'lf-upload-preview-style';
    st.textContent = [
      '.lfup{--lfup-primary:#2563eb;--lfup-ok:#10b981;--lfup-bd:#e5e7eb;--lfup-mut:#6b7280;--lfup-ink:#111827;',
      'font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--lfup-ink);}',
      '.lfup-drop{border:2px dashed #cbd5e1;border-radius:12px;padding:2rem 1.25rem;text-align:center;',
      'background:#f9fafb;cursor:pointer;transition:border-color .15s,background .15s;}',
      '.lfup-drop:hover,.lfup-drop.lfup-over{border-color:var(--lfup-primary);background:#eff6ff;}',
      '.lfup-drop:focus-visible{outline:2px solid var(--lfup-primary);outline-offset:2px;}',
      '.lfup-ico{font-size:1.9rem;color:var(--lfup-primary);margin-bottom:.6rem;}',
      '.lfup-t{font-weight:600;font-size:1.02rem;margin-bottom:.25rem;}',
      '.lfup-s{font-size:.85rem;color:var(--lfup-mut);}',
      '.lfup-err{margin-top:.85rem;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;',
      'border-radius:8px;padding:.7rem .9rem;font-size:.875rem;line-height:1.5;}',
      '.lfup-err a{color:#991b1b;}',
      '.lfup-head{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:baseline;',
      'justify-content:space-between;margin:1.1rem 0 .6rem;}',
      '.lfup-count{font-weight:600;font-size:1rem;}',
      '.lfup-prog{font-size:.83rem;color:var(--lfup-mut);}',
      '.lfup-tw{overflow-x:auto;border:1px solid var(--lfup-bd);border-radius:10px;}',
      '.lfup tbody tr:last-child td{border-bottom:0;}',
      '.lfup table{width:100%;border-collapse:collapse;font-size:.855rem;}',
      '.lfup th,.lfup td{text-align:left;padding:.6rem .8rem;border-bottom:1px solid #f1f5f9;}',
      '.lfup th{background:#f9fafb;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;',
      'color:var(--lfup-mut);font-weight:600;white-space:nowrap;}',
      '.lfup td.lfup-url{max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569;}',
      '.lfup .lfup-found{color:var(--lfup-ok);font-weight:600;}',
      '.lfup .lfup-none{color:var(--lfup-mut);}',
      '.lfup .lfup-lock{color:#94a3b8;letter-spacing:.12em;user-select:none;}',
      '.lfup-spin{display:inline-block;width:12px;height:12px;border:2px solid #cbd5e1;',
      'border-top-color:var(--lfup-primary);border-radius:50%;animation:lfup-rot .7s linear infinite;}',
      '@keyframes lfup-rot{to{transform:rotate(360deg)}}',
      '@media(prefers-reduced-motion:reduce){.lfup-spin{animation:none}}',
      '.lfup-cta{margin-top:1.1rem;padding-top:1.1rem;border-top:1px solid var(--lfup-bd);}',
      '.lfup-cta p{font-size:.9rem;color:#374151;margin:0 0 .75rem;line-height:1.6;}',
      '.lfup-btn{display:block;width:100%;text-align:center;background:var(--lfup-primary);color:#fff;',
      'text-decoration:none;font-weight:600;padding:.8rem 1.25rem;border-radius:8px;font-size:.95rem;}',
      '.lfup-btn:hover{background:#1e40af;}',
      '.lfup-btn:focus-visible{outline:2px solid #1e40af;outline-offset:2px;}',
      '.lfup-route{margin-top:.9rem;border:1px solid var(--lfup-bd);border-radius:10px;padding:1rem 1.1rem;background:#f9fafb;}',
      '.lfup-route-n{font-weight:600;font-size:1rem;margin-bottom:.3rem;}',
      '.lfup-route p{font-size:.875rem;color:#374151;line-height:1.6;margin:0 0 .85rem;}',
      '.lfup-again{display:inline-block;margin-top:.7rem;font-size:.83rem;color:var(--lfup-mut);',
      'background:none;border:0;cursor:pointer;text-decoration:underline;font-family:inherit;}'
    ].join('');
    d.head.appendChild(st);
  }

  function mount(opts) {
    opts = opts || {};
    var host = typeof opts.container === 'string'
      ? d.querySelector(opts.container) : opts.container;
    if (!host) return;
    if (!w.lfCsvRows || !w.lfFindColumn) {
      // lf-csv.js is required; fail visibly in console rather than silently.
      console.error('[lf-upload-preview] lf-csv.js must load before this script.');
      return;
    }

    injectStyle();

    var tool = opts.tool || 'upload_preview';
    var sampleSize = opts.sampleSize || 3;
    var signupUrl = opts.signupUrl || 'https://linkfinderai.com/sign-up';
    // Which worker endpoint to hit, and which key its response returns.
    var enrichType = opts.enrichType || 'business_email_finder';
    var valueKey = opts.valueKey || (enrichType === 'business_phone_finder' ? 'phone' : 'email');
    var valueLabel = opts.valueLabel || (valueKey === 'phone' ? 'Direct dial' : 'Work email');
    var notFound = 'No ' + valueLabel.toLowerCase() + ' found';

    host.classList.add('lfup');
    host.innerHTML = ''
      + '<div class="lfup-drop" id="lfupDrop" role="button" tabindex="0" '
      + 'aria-label="Upload a CSV of LinkedIn profile URLs">'
      + '<div class="lfup-ico"><i class="fas fa-cloud-upload-alt"></i></div>'
      + '<div class="lfup-t">Drop your CSV here</div>'
      + '<div class="lfup-s">A column of LinkedIn profile URLs. Nothing is stored until you choose to.</div>'
      + '</div>'
      + '<input type="file" id="lfupFile" accept=".csv,text/csv" hidden>'
      + '<div id="lfupOut"></div>';

    var drop = host.querySelector('#lfupDrop');
    var file = host.querySelector('#lfupFile');
    var out = host.querySelector('#lfupOut');

    drop.addEventListener('click', function () { file.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault(); drop.classList.add('lfup-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault(); drop.classList.remove('lfup-over');
      });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) read(f);
    });
    file.addEventListener('change', function () {
      if (file.files && file.files[0]) read(file.files[0]);
    });

    // Hand the list forward so signing up does not throw the work away.
    // The app can read lf_pending_list and pre-load these rows.
    function savePending(total, rows, column) {
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify({
          ts: Date.now(), source: tool, column: column,
          total: total, rows: (rows || []).slice(0, MAX_PENDING)
        }));
      } catch (e) { /* private mode, quota — the preview still works */ }
    }

    function fail(msg) {
      out.innerHTML = '<div class="lfup-err">' + msg + '</div>';
    }

    function read(f) {
      if (!/\.csv$/i.test(f.name)) {
        capture('preview_wrong_filetype', { tool: tool, name: f.name.slice(-12) });
        fail('That looks like <strong>' + esc(f.name) + '</strong>. Save it as a '
           + '.csv and try again &mdash; in Excel or Sheets use File, then Download as CSV.');
        return;
      }
      var r = new FileReader();
      r.onload = function () { parse(String(r.result || ''), f.name); };
      r.onerror = function () { fail('That file could not be read. Try re-saving it as a .csv.'); };
      r.readAsText(f);
    }

    function parse(text, name) {
      var parsed = w.lfCsvRows(text);
      if (!parsed.headers.length || !parsed.rows.length) {
        fail('That file has no readable rows. It needs a header row and at least one row of data.');
        return;
      }
      var col = w.lfFindColumn(parsed.headers, 'linkedin_profile');
      if (col === -1) {
        // No profile URLs, but a name/company file is still a real list and a
        // real customer. Route it instead of dead-ending on an error.
        var nameCol = w.lfFindColumn(parsed.headers, 'full_name');
        var coCol = w.lfFindColumn(parsed.headers, 'company');
        var domCol = w.lfFindColumn(parsed.headers, 'company_domain');
        capture('preview_no_url_column', {
          tool: tool, rows: parsed.rows.length,
          has_name: nameCol !== -1, has_company: coCol !== -1 || domCol !== -1
        });
        if (nameCol !== -1 && (coCol !== -1 || domCol !== -1)) {
          savePending(parsed.rows.length, [], 'name_company');
          out.innerHTML = '<div class="lfup-route">'
            + '<div class="lfup-route-n">' + parsed.rows.length
            + ' rows with names and companies</div>'
            + '<p>This file has no LinkedIn URL column, which is fine &mdash; names plus '
            + 'companies work too, they just run through a different finder.</p>'
            + '<a class="lfup-btn" href="https://linkfinderai.com/csv-email-finder">'
            + 'Enrich these ' + parsed.rows.length + ' rows</a></div>';
          return;
        }
        fail('No LinkedIn profile URL column found. The columns in this file are: <strong>'
           + esc(parsed.headers.slice(0, 8).join(', ')) + '</strong>.<br>'
           + 'A list of names and companies works too &mdash; use the '
           + '<a href="https://linkfinderai.com/csv-email-finder">CSV email finder</a>.');
        return;
      }

      var urls = [];
      for (var i = 0; i < parsed.rows.length && urls.length < MAX_ROWS; i++) {
        var v = String(parsed.rows[i][col] || '').trim();
        if (/linkedin\.com\/in\//i.test(v)) urls.push(v);
      }
      if (!urls.length) {
        fail('That column has no LinkedIn profile URLs in it. They should look like '
           + '<strong>linkedin.com/in/username</strong>.');
        return;
      }

      capture('preview_csv_uploaded', { tool: tool, rows: urls.length, file: name.slice(-12) });
      run(urls);
    }

    function render(urls, results, done) {
      var n = urls.length;
      var shown = Math.min(sampleSize, n);
      var locked = Math.max(0, n - shown);
      var found = results.filter(function (r) { return r && r.value; }).length;

      var rows = '';
      for (var i = 0; i < shown; i++) {
        var res = results[i];
        var cell;
        if (res === undefined) cell = '<span class="lfup-spin"></span>';
        else if (res && res.value) cell = '<span class="lfup-found">' + esc(res.value) + '</span>';
        else cell = '<span class="lfup-none">' + esc(notFound) + '</span>';
        rows += '<tr><td class="lfup-url">' + esc(urls[i]) + '</td><td>' + cell + '</td></tr>';
      }
      for (var j = shown; j < Math.min(n, shown + 4); j++) {
        rows += '<tr><td class="lfup-url">' + esc(urls[j])
             + '</td><td><span class="lfup-lock"><i class="fas fa-lock"></i> &bull;&bull;&bull;&bull;&bull;&bull;&bull;</span></td></tr>';
      }

      var head = done
        ? shown + ' of ' + n + ' rows enriched'
        : 'Enriching ' + shown + ' of ' + n + ' rows';
      var sub = done
        ? (found + ' of ' + shown + ' sample rows returned a result')
        : 'Running against your actual file';

      var cta = '';
      if (done) {
        cta = '<div class="lfup-cta"><p>'
            + (locked > 0
                ? 'The remaining <strong>' + locked + ' rows</strong> are ready. '
                  + 'Create a free account to run them and export the file.'
                : 'Create a free account to export this file.')
            + '</p><a class="lfup-btn" id="lfupCta" href="' + esc(signupUrl) + '">'
            + 'Unlock all ' + n + ' rows &mdash; free account</a>'
            + '<button class="lfup-again" id="lfupAgain" type="button">Use a different file</button>'
            + '</div>';
      }

      out.innerHTML = ''
        + '<div class="lfup-head"><span class="lfup-count">' + head + '</span>'
        + '<span class="lfup-prog">' + sub + '</span></div>'
        + '<div class="lfup-tw"><table><thead><tr><th>LinkedIn profile</th><th>' + esc(valueLabel) + '</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div>' + cta;

      var ctaEl = out.querySelector('#lfupCta');
      if (ctaEl) {
        ctaEl.addEventListener('click', function () {
          capture('preview_unlock_clicked', { tool: tool, rows: n, sample_found: found });
        });
      }
      var again = out.querySelector('#lfupAgain');
      if (again) {
        again.addEventListener('click', function () { out.innerHTML = ''; file.value = ''; file.click(); });
      }
    }

    function run(urls) {
      var results = [];
      var shown = Math.min(sampleSize, urls.length);
      render(urls, results, false);

      savePending(urls.length, urls, 'linkedin_url');

      var i = 0;
      (function next() {
        if (i >= shown) {
          var found = results.filter(function (r) { return r && r.value; }).length;
          capture('preview_sample_enriched', { tool: tool, rows: urls.length, sample: shown, found: found });
          render(urls, results, true);
          return;
        }
        fetch(WORKER, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Secret': w.LF_API_KEY,
            'Accept': 'application/json'
          },
          body: JSON.stringify({ type: enrichType, linkedin_url: urls[i], is_bulk: true })
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; })
          .then(function (data) {
            results[i] = { value: (data && data[valueKey]) || null };
            i++;
            render(urls, results, false);
            setTimeout(next, 150);
          });
      })();
    }
  }

  w.lfUploadPreview = { mount: mount };
})(window, document);
