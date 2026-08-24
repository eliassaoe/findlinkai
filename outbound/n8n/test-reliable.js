// Executes the queue logic against real payload shapes.
//   node outbound/n8n/test-reliable.js
const fs=require('fs'), path=require('path');
const wf=JSON.parse(fs.readFileSync(path.join(__dirname,'reliable-outbound.json'),'utf8'));
const code=n=>wf.nodes.find(x=>x.name===n).parameters.jsCode;

let STORE;
const mk=(rowJson,gate)=>{
  const $=(n)=>({first:()=>({json:n==='One at a time'?rowJson:(n==='Usable?'?rowJson:gate)})});
  return {$, $getWorkflowStaticData:()=>STORE};
};
function classify(rows,row,gate={}){
  const {$,$getWorkflowStaticData}=mk(row,gate);
  const $input={first:()=>({json:{result:rows}})};
  return new Function('$','$input','$getWorkflowStaticData',code('Usable, retry, or done with it'))($,$input,$getWorkflowStaticData)[0].json;
}
let fails=[];
const ck=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w); if(!ok)fails.push(l);
  console.log((ok?'PASS ':'FAIL ')+l.padEnd(52)+JSON.stringify(g));};

const ROW={domain:'a.com',company:'A',category:'c',signalValue:11,attempts:0};
const MAINT=[{personId:null,name:'We are on maintenance. Check back in 48hrs'}];
const NOLEADS=[{personId:null,name:'No Leads found. Tweak your filters'}];
const BANNER=[{personId:null,name:'We improve the Actor everyday. Contact us if you are having any issue'}];
const REAL=[{personId:'p1',name:'Zach Barney',email:'z@a.com',jobTitle:'CEO'}];

console.log('--- no employees found is a normal outcome, not an error ---');
STORE={queue:[],done:{},stats:{pushed:0,dead:0,retries:0,runs:0}};
ck('empty answer -> no_person', classify(NOLEADS,ROW).status,'no_person');
ck('  marked done, never re-sourced', STORE.done['a.com'],'no_person');
ck('  NOT put back on the queue', STORE.queue.length,0);
ck('  run continues (a row is returned)', typeof classify(NOLEADS,{...ROW,domain:'b.com'}),'object');

console.log('\n--- provider sentinel is a "not now", so it comes back ---');
STORE={queue:[],done:{},stats:{pushed:0,dead:0,retries:0,runs:0}};
ck('maintenance -> requeued', classify(MAINT,ROW).status,'requeued');
ck('  back on the queue', STORE.queue.length,1);
ck('  attempt counted', STORE.queue[0].attempts,1);
ck('  not written off', STORE.done['a.com'],undefined);

console.log('\n--- a real person wins over any status row ---');
STORE={queue:[],done:{},stats:{pushed:0,dead:0,retries:0,runs:0}};
ck('person found', classify(REAL,ROW).status,'ok');
ck('  email extracted', classify(REAL,ROW).email,'z@a.com');
STORE={queue:[],done:{},stats:{pushed:0,dead:0,retries:0,runs:0}};
ck('banner + person -> ok', classify([...BANNER,...REAL],ROW).status,'ok');
ck('  not requeued', STORE.queue.length,0);

console.log('\n--- batch: gives up after maxAttempts, keeps going ---');
STORE={queue:[
  {domain:'old.com',company:'O',attempts:3},
  {domain:'fresh.com',company:'F',attempts:0}
],done:{},stats:{pushed:0,dead:0,retries:0,runs:0}};
const gate={batchSize:10,room:10,maxAttempts:3,campaignId:'c'};
const {$,$getWorkflowStaticData}=mk({},gate);
const batch=new Function('$','$input','$getWorkflowStaticData',code("Take this hour's batch"))(
  (n)=>({first:()=>({json:gate})}),{first:()=>({json:gate}),all:()=>[]},$getWorkflowStaticData);
ck('exhausted domain dropped', batch.length,1);
ck('  the fresh one still processed', batch[0].json.domain,'fresh.com');
ck('  exhausted one marked, not requeued', STORE.done['old.com'],'gave_up');

console.log('\n'+(fails.length?'FAILURES: '+fails.join(', '):'queue logic behaves correctly'));
process.exit(fails.length?1:0);
