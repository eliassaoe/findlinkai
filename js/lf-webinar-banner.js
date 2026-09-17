/* lf-webinar-banner.js — one dated, dismissible bar that sends people to
 * /webinar. Included on index.html and app.html only.
 *
 * WHY IT EXISTS
 * -------------
 * This is a one-week test of whether anyone wants a live session at all,
 * before an hour a week gets spent recording one. docs/webinar-test.md has the
 * numbers, the verdict and the bar the test has to clear. If it does not
 * clear it, delete the two <script> tags and this file; nothing else changes.
 *
 * PLACEMENT
 * ---------
 * docs/next-step-routing.md: earn, then show; never interrupt. This is the
 * one shape of prompt that document does not retire — a static bar at the top
 * of the document, not a popup, not a modal, not sticky, never over content.
 * It is dismissible, remembers the dismissal, and removes itself once the
 * session is over, so nobody has to come back and take it down.
 *
 * ONE DATE
 * --------
 * WEBINAR.startISO below must equal the WEBINAR.startISO in webinar.html.
 * tests/webinar-test.test.mjs fails the build if they differ.
 */
(function () {
  'use strict';

  var WEBINAR = {
    startISO: '2026-09-25T15:00:00Z',   // 17:00 Paris · 11:00 New York
    durationMin: 45,
    slug: 'webinar_2026-09-25',
    path: '/webinar',
    when: 'Friday 25 Sept',
    title: 'Watch an outbound engine get built, live',
  };

  // Exposed for the test: 'upcoming' | 'live' | 'over'.
  function lfWebinarState(nowMs, startMs, durationMin) {
    if (isNaN(startMs)) return 'over';
    if (nowMs < startMs) return 'upcoming';
    if (nowMs <= startMs + durationMin * 60000) return 'live';
    return 'over';
  }
  window.lfWebinarState = lfWebinarState;

  // Never on the page it points at, never on auth / checkout pages.
  var path = (location.pathname || '/').replace(/\.html$/, '');
  if (/^\/webinar/.test(path)) return;
  if (/^\/(log-in|sign-up|verify-email|reset-password|update-password|upgrade-confirmation|confirmation-)/.test(path)) return;

  var startMs = new Date(WEBINAR.startISO).getTime();
  var state = lfWebinarState(Date.now(), startMs, WEBINAR.durationMin);
  if (state === 'over') return;

  var dismissKey = 'lf_webinar_banner_dismissed_' + WEBINAR.slug;
  var registeredKey = 'lf_webinar_registered_' + WEBINAR.slug;
  try {
    if (localStorage.getItem(dismissKey)) return;
    // Already registered in this browser: the bar has done its job.
    if (localStorage.getItem(registeredKey) && state !== 'live') return;
  } catch (e) {}

  var page = path === '/' || path === '/index' ? 'home' : (/^\/app/.test(path) ? 'app' : 'other');
  var daysUntil = Math.max(0, Math.ceil((startMs - Date.now()) / 864e5));
  var href = WEBINAR.path + '?src=banner_' + page;

  function ph(name, props) { try { window.posthog && posthog.capture(name, props); } catch (e) {} }

  function render() {
    if (!document.body || document.getElementById('lfWebinarBar')) return;

    var css = document.createElement('style');
    css.textContent =
      '#lfWebinarBar{background:#111827;color:#F9FAFB;font:14px/1.4 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
        'display:flex;align-items:center;justify-content:center;gap:10px 14px;flex-wrap:wrap;padding:9px 44px 9px 16px;position:relative;text-align:center}' +
      '#lfWebinarBar .lfwb-dot{width:8px;height:8px;border-radius:50%;background:#EF4444;flex:none;box-shadow:0 0 0 0 rgba(239,68,68,.7);animation:lfwbPulse 1.8s ease-out infinite}' +
      '#lfWebinarBar b{font-weight:600}' +
      '#lfWebinarBar .lfwb-title{color:#D1D5DB}' +
      '#lfWebinarBar a{color:#fff;font-weight:600;text-decoration:none;background:#2563EB;padding:5px 12px;border-radius:6px;white-space:nowrap}' +
      '#lfWebinarBar a:hover{background:#1D4ED8}' +
      '#lfWebinarBar button{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:#9CA3AF;font-size:20px;line-height:1;cursor:pointer;padding:6px 8px}' +
      '#lfWebinarBar button:hover{color:#fff}' +
      '@keyframes lfwbPulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.7)}70%{box-shadow:0 0 0 7px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}' +
      '@media (prefers-reduced-motion:reduce){#lfWebinarBar .lfwb-dot{animation:none}}' +
      '@media (max-width:640px){#lfWebinarBar{font-size:13px;gap:6px 10px}#lfWebinarBar .lfwb-title{display:none}}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'lfWebinarBar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Live session');

    var dot = document.createElement('span'); dot.className = 'lfwb-dot';
    var lead = document.createElement('b');
    lead.textContent = state === 'live' ? 'Live now' : 'Live ' + WEBINAR.when;
    var title = document.createElement('span'); title.className = 'lfwb-title'; title.textContent = WEBINAR.title;
    var link = document.createElement('a');
    link.href = href;
    link.textContent = state === 'live' ? 'Join →' : 'Save a seat →';
    link.addEventListener('click', function () { ph('webinar_banner_clicked', { page: page, state: state, days_until: daysUntil, slug: WEBINAR.slug }); });
    var close = document.createElement('button');
    close.type = 'button'; close.setAttribute('aria-label', 'Dismiss'); close.innerHTML = '&times;';
    close.addEventListener('click', function () {
      try { localStorage.setItem(dismissKey, '1'); } catch (e) {}
      ph('webinar_banner_dismissed', { page: page, state: state, days_until: daysUntil, slug: WEBINAR.slug });
      bar.parentNode && bar.parentNode.removeChild(bar);
    });

    bar.appendChild(dot); bar.appendChild(lead); bar.appendChild(title); bar.appendChild(link); bar.appendChild(close);
    document.body.insertBefore(bar, document.body.firstChild);
    ph('webinar_banner_shown', { page: page, state: state, days_until: daysUntil, slug: WEBINAR.slug });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
