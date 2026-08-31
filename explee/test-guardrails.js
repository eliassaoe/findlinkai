const fs=require('fs');
const wf=JSON.parse(fs.readFileSync('n8n-explee-reply-manager.json','utf8'));
const code=wf.nodes.find(n=>n.name==='Guardrails & Dedupe').parameters.jsCode;

const store={handled:{}};
const cfg={maxRepliesPerRun:10,model:'claude-opus-5',companyContext:'ctx'};
let INPUT=[];
const ctx={
  $:(n)=>({first:()=>({json:cfg})}),
  $getWorkflowStaticData:()=>store,
  $input:{all:()=>INPUT},
};
const run=new Function('$','$getWorkflowStaticData','$input', code);
const go=(items)=>{INPUT=items.map(j=>({json:j}));return run(ctx.$,ctx.$getWorkflowStaticData,ctx.$input);};

const base={threadId:'t1',direction:'inbound',leadEmail:'a@b.com',leadName:'A'};
const cases=[
  ['plain opt-out',      {...base,messageId:'m1',body:'Please unsubscribe me from this list.'},   'needs_human'],
  ['legal threat',       {...base,messageId:'m2',body:'Contact my attorney about this.'},          'needs_human'],
  ['GDPR',               {...base,messageId:'m3',body:'Under GDPR I request deletion.'},           'needs_human'],
  ['out of office',      {...base,messageId:'m4',body:'I am out of office until Monday.'},         'no_action'],
  ['bounce',             {...base,messageId:'m5',body:'Delivery Status Notification (Failure)'},   'no_action'],
  ['left company',       {...base,messageId:'m6',body:'John no longer with the company.'},         'no_action'],
  ['genuine interest',   {...base,messageId:'m7',body:'Sounds interesting, what does it cost?'},   undefined],
  ['meeting request',    {...base,messageId:'m8',body:'Can we do a call Thursday?'},               undefined],
];

let pass=0,fail=0;
for(const [label,msg,expected] of cases){
  const r=go([msg]);
  const got=r[0] ? r[0].json.action : '(dropped)';
  const ok = expected===undefined ? (got===undefined) : (got===expected);
  console.log((ok?'PASS':'FAIL')+'  '+label.padEnd(20)+' -> '+(got||'passes to classifier'));
  ok?pass++:fail++;
}

// dedupe: same message twice
store.handled={};
go([{...base,messageId:'dup',body:'Sounds interesting, what does it cost?'}]);
store.handled['dup']=Date.now();
const second=go([{...base,messageId:'dup',body:'Sounds interesting, what does it cost?'}]);
console.log((second.length===0?'PASS':'FAIL')+'  dedupe             -> '+second.length+' items on 2nd pass');
second.length===0?pass++:fail++;

// outbound suppression
const outb=go([{...base,messageId:'o1',direction:'outbound',body:'Hi, following up on my note.'}]);
console.log((outb.length===0?'PASS':'FAIL')+'  own sent mail      -> '+outb.length+' items');
outb.length===0?pass++:fail++;

// rate limit
store.handled={};
const many=go(Array.from({length:25},(_,i)=>({...base,messageId:'x'+i,body:'Interested, tell me more please.'})));
console.log((many.length===10?'PASS':'FAIL')+'  rate limit (10)    -> '+many.length+' items');
many.length===10?pass++:fail++;

console.log('\n'+pass+' passed, '+fail+' failed');
process.exitCode = fail?1:0;
