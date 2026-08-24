// Executes each normaliser + the deduper against real API response shapes.
//   node outbound/n8n/test-multisource.js
const fs=require('fs'), path=require('path');
const wf=JSON.parse(fs.readFileSync(path.join(__dirname,'multi-source-to-instantly.json'),'utf8'));
const code=n=>wf.nodes.find(x=>x.name===n).parameters.jsCode;
const CFG=JSON.parse(new Function(code('Config'))()[0] ? JSON.stringify(new Function(code('Config'))()[0].json) : '{}');
CFG.room = 100;

function run(nodeName, inputItems, gateJson=CFG){
  const $=(n)=>({first:()=>({json: n==='Stop if no room'?gateJson:(n==='One prospect at a time'?inputItems[0].json:gateJson)})});
  const $input={ first:()=>inputItems[0], all:()=>inputItems };
  return new Function('$','$input',code(nodeName))($,$input);
}
let fails=[];
const ck=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w); if(!ok)fails.push(l);
  console.log((ok?'PASS ':'FAIL ')+l.padEnd(50)+JSON.stringify(g));};

console.log('--- Product Hunt normaliser ---');
const phBody={body:{data:{posts:{edges:[
 {node:{name:'Acme',tagline:'t',website:'https://www.acme.io/?ref=producthunt',votesCount:200,createdAt:new Date().toISOString(),topics:{edges:[{node:{name:'Sales'}}]}}},
 {node:{name:'TooBig',website:'https://big.com',votesCount:9000,createdAt:new Date().toISOString(),topics:{edges:[]}}},
 {node:{name:'TooSmall',website:'https://tiny.com',votesCount:2,createdAt:new Date().toISOString(),topics:{edges:[]}}},
 {node:{name:'Redirect',website:'https://www.producthunt.com/r/abc',votesCount:200,createdAt:new Date().toISOString(),topics:{edges:[]}}},
 {node:{name:'Old',website:'https://old.com',votesCount:200,createdAt:'2020-01-01T00:00:00Z',topics:{edges:[]}}},
 {node:{name:'Apollo',website:'https://apollo.io',votesCount:200,createdAt:new Date().toISOString(),topics:{edges:[]}}}
]}}}};
const ph=run('Normalise: Product Hunt',[{json:phBody}]);
ck('keeps only the in-band recent one', ph.length, 1);
ck('  strips www and ?ref tracking', ph[0].json.domain, 'acme.io');
ck('  topic becomes the category', ph[0].json.category, 'Sales');
ck('  votes become the signal', ph[0].json.signalValue, 200);

console.log('\n--- G2 normaliser ---');
const g2Body={body:{data:{attributes:{name:'Website Privacy Auditing'}},included:[
 {type:'products',attributes:{domain:'osano.com',name:'Osano',review_count:172}},
 {type:'products',attributes:{domain:'onetrust.com',name:'OneTrust',review_count:5000}},
 {type:'products',attributes:{domain:'stub.com',name:'Stub',review_count:2}}
]}};
const g2=run('Normalise: G2',[{json:g2Body}]);
ck('band keeps 1 of 3', g2.length, 1);
ck('  real category name kept', g2[0].json.category, 'Website Privacy Auditing');

const giants={body:{data:{attributes:{name:'CRM'}},included:[
 {type:'products',attributes:{domain:'salesforce.com',name:'SF',review_count:25878}},
 {type:'products',attributes:{domain:'hubspot.com',name:'HS',review_count:13919}}
]}};
ck('category with no reachable tail is skipped', run('Normalise: G2',[{json:giants}]).length, 0);

console.log('\n--- Hacker News normaliser ---');
const hnBody={body:{hits:[
 {title:'Show HN: Widgetly – a thing for teams',url:'https://widgetly.dev/launch',points:120},
 {title:'Show HN: Quiet',url:'https://quiet.com',points:3},
 {title:'Show HN: OnGithub',url:'https://github.com/x/y',points:300}
]}};
const hn=run('Normalise: Hacker News',[{json:hnBody}]);
ck('points floor + host exclusions', hn.length, 1);
ck('  company parsed out of the title', hn[0].json.company, 'Widgetly');
ck('  domain from the story url', hn[0].json.domain, 'widgetly.dev');

console.log('\n--- dedupe: same company from two sources ---');
const dup=[
 {json:{source:'hackernews',domain:'acme.io',company:'Acme',category:'software',signal:'hn points',signalValue:50}},
 {json:{source:'g2',domain:'acme.io',company:'Acme',category:'Event Lead Capture',signal:'reviews',signalValue:80}},
 {json:{source:'producthunt',domain:'other.io',company:'Other',category:'Sales',signal:'upvotes',signalValue:99}}
];
const ded=run('Dedupe and cap to room',dup);
ck('one row per domain', ded.length, 2);
ck('  G2 wins: most specific category', ded.find(r=>r.json.domain==='acme.io').json.category, 'Event Lead Capture');

const capped=run('Dedupe and cap to room',dup,{...CFG,room:1});
ck('never enriches more than there is room for', capped.length, 1);

console.log('\n'+(fails.length?'FAILURES: '+fails.join(', '):'all normalisers behave correctly'));
process.exit(fails.length?1:0);
