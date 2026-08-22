import fs from 'fs';
const src = fs.readFileSync('/home/user/findlinkai/app.html','utf8');
const start = src.indexOf('function maybeShowSalesIntercept()');
const end   = src.indexOf('function closeSalesInterceptModal()');
const code  = src.slice(start, end);

function run({ subscriber=false, hovered=undefined, billing='monthly', planPicked=false, sessionShown=false }) {
  const els = { salesInterceptModal:{classList:{add(){this.on=true},remove(){this.on=false},on:false}},
                sciHeadline:{textContent:''}, sciSubtext:{innerHTML:''} };
  const store = sessionShown ? {lf_sales_intercept_shown:'1'} : {};
  let captured = null, timer = null;
  const sandbox = {
    isExistingSubscriber: subscriber,
    billingMode: billing,
    currentCredits: 5,
    plans: [{key:'starter'},{key:'professional'},{key:'enterprise'}],
    window: { __lfLastHoveredPlanIndex: hovered, __lfPlanSelectedThisSession: planPicked },
    sessionStorage: { getItem:k=>store[k]||null, setItem:(k,v)=>{store[k]=v} },
    document: { getElementById:id=>els[id]||null, body:{style:{}} },
    posthog: { capture:(n,p)=>{ captured={n,p} } },
    setTimeout: (fn)=>{ timer=fn },
  };
  const fn = new Function(...Object.keys(sandbox), code + '; return maybeShowSalesIntercept;');
  const res = fn(...Object.values(sandbox))();
  if (timer) timer();          // run the deferred body
  return { returned:res, shown:els.salesInterceptModal.classList.on, captured, els };
}

let pass = 0;
function check(label, cond, extra='') { console.log((cond?'  ok  ':'FAIL  ')+label+(extra?'  '+extra:'')); if(cond) pass++; else process.exitCode=1; }

// The whole point: the ordinary case now fires. Before this change it did not.
let r = run({ hovered: undefined, billing:'monthly' });
check('no hover at all            -> shows', r.shown && r.returned, '('+r.captured.p.variant+')');
check('  ...with the question copy', r.els.sciHeadline.textContent === 'Which part did not add up?');

r = run({ hovered: 0 });
check('hovered Starter            -> shows, question copy', r.shown && r.captured.p.variant==='question');

r = run({ hovered: 1 });
check('hovered Professional       -> shows, call copy', r.shown && r.captured.p.variant==='call');
check('  ...headline is the call one', r.els.sciHeadline.textContent === 'Want to talk it through first?');

r = run({ hovered: 2, billing:'payg' });
check('PAYG tab                   -> shows, question copy', r.shown && r.captured.p.variant==='question');

// Guards that must still hold.
r = run({ subscriber:true, hovered:1 });
check('existing subscriber        -> suppressed', !r.shown && r.returned===false);

r = run({ hovered:1, planPicked:true });
check('already picked a plan      -> suppressed (mid-checkout)', !r.shown && r.returned===false);

r = run({ hovered:1, sessionShown:true });
check('already shown this session -> suppressed', !r.shown && r.returned===false);

// Reporting must distinguish the two arms, or we cannot tell which one works.
r = run({ hovered:2 });
check('capture carries variant+billing', r.captured.p.variant==='call' && r.captured.p.billing_mode==='monthly');

console.log('\n'+pass+'/9 checks passed');
