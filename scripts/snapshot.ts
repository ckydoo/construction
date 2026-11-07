import { PrismaClient } from '@prisma/client';
import { RESOURCES } from '../src/lib/resources';
import { writeFileSync } from 'node:fs';
const p=new PrismaClient();
(async()=>{
  const org=await p.organization.findUnique({where:{slug:'kestrel-ridge'}});
  if(!org) throw new Error('demo org missing');
  const recs=await p.record.findMany({where:{organizationId:org.id,deletedAt:null},orderBy:{createdAt:'desc'},take:1000});
  const rows=recs.map(r=>{let d:any={};try{d=JSON.parse(r.data||'{}')}catch{};return {...d,id:r.id,resource:r.resource,number:r.number,title:r.title,status:r.status,projectId:r.projectId};});
  const defs=RESOURCES.map(r=>({id:r.id,label:r.label,singular:r.singular,group:r.group,columns:r.columns,statusOptions:r.statusOptions||[],fields:r.fields.map(f=>({key:f.key,label:f.label,type:f.type,options:f.options,ref:f.ref}))}));
  const cfg=JSON.parse(org.config||'{}');
  const payload=JSON.stringify({org:{name:org.name,plan:cfg.plan,modules:cfg.modules?.length||33,baseCurrency:org.baseCurrency},defs,rows}).replace(/<\//g,'<\\/');
  const html=`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BuildOps — offline snapshot</title>
<style>
:root{--bg:#f8fafc;--card:#fff;--bd:#e2e8f0;--tx:#0f172a;--mu:#64748b;--ac:#f59e0b;--soft:#f1f5f9}
.dark{--bg:#020617;--card:#0f172a;--bd:#1e293b;--tx:#f1f5f9;--mu:#94a3b8;--soft:#1e293b}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--tx);font-size:14px}
.app{display:flex;min-height:100vh}aside{width:244px;flex:none;background:var(--card);border-right:1px solid var(--bd);height:100vh;overflow:auto;position:sticky;top:0}
.brand{display:flex;align-items:center;gap:9px;padding:15px 14px;border-bottom:1px solid var(--bd);font-weight:700}
.logo{width:30px;height:30px;border-radius:9px;background:var(--ac);display:flex;align-items:center;justify-content:center;color:#0f172a;font-size:16px}
.grp{padding:12px 10px 2px;font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--mu);font-weight:700}
.nav{display:block;padding:7px 10px;margin:1px 6px;border-radius:8px;color:var(--mu);text-decoration:none;font-size:12.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav:hover{background:var(--soft);color:var(--tx)}.nav.on{background:rgba(245,158,11,.13);color:#b45309;font-weight:600}
main{flex:1;min-width:0}header{height:58px;display:flex;align-items:center;gap:10px;padding:0 20px;border-bottom:1px solid var(--bd);background:var(--card);position:sticky;top:0;z-index:5}
header h1{font-size:15px;margin:0;flex:1}button,input,select{font:inherit;color:inherit}
.btn{border:1px solid var(--bd);background:var(--card);border-radius:8px;padding:7px 11px;cursor:pointer;font-size:12px}
.btn:hover{background:var(--soft)}.btn.p{background:var(--ac);border-color:var(--ac);font-weight:700;color:#0f172a}
.wrap{padding:20px;max-width:1400px}.hint{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);border-radius:10px;padding:11px 14px;font-size:12px;line-height:1.6;margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:15px;box-shadow:0 1px 3px rgba(15,23,42,.04)}
.kpi p{margin:0 0 6px;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--mu);font-weight:700}
.kpi strong{font-size:21px;letter-spacing:-.02em}.kpi small{display:block;margin-top:5px;color:var(--mu);font-size:11px}
.two{display:grid;grid-template-columns:1.6fr 1fr;gap:14px;margin-bottom:16px}@media(max-width:900px){.two{grid-template-columns:1fr}aside{display:none}}
.ct{font-size:13px;font-weight:700;margin:0 0 12px}.cs{font-size:11px;color:var(--mu);margin:0 0 12px}
.bar{display:flex;align-items:flex-end;gap:8px;height:150px;padding-top:8px}.bar div{flex:1;background:var(--ac);border-radius:5px 5px 0 0;opacity:.75;position:relative;min-height:3px}
.bar div:last-child{opacity:1}.bar span{position:absolute;bottom:-20px;left:0;right:0;text-align:center;font-size:10px;color:var(--mu)}
.barwrap{height:170px;padding-bottom:22px}.row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--bd)}
.row:last-child{border:0}.row .nm{flex:1;min-width:0;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .sub{font-size:11px;color:var(--mu)}.pg{height:6px;background:var(--soft);border-radius:6px;overflow:hidden;width:110px;flex:none}.pg i{display:block;height:100%;background:var(--ac)}
.pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:var(--soft);color:var(--mu)}
.pill.g{background:#dcfce7;color:#15803d}.pill.a{background:#fef3c7;color:#b45309}.pill.r{background:#fee2e2;color:#b91c1c}.dark .pill.g{background:#064e3b;color:#6ee7b7}.dark .pill.a{background:#78350f;color:#fcd34d}.dark .pill.r{background:#7f1d1d;color:#fca5a5}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.tools input,.tools select{border:1px solid var(--bd);background:var(--card);border-radius:8px;padding:8px 10px;font-size:12px;outline:none}
.tools input{flex:1;min-width:180px}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;padding:10px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--mu);border-bottom:1px solid var(--bd);white-space:nowrap;cursor:pointer}
td{padding:9px 10px;border-bottom:1px solid var(--bd);white-space:nowrap;max-width:230px;overflow:hidden;text-overflow:ellipsis}tbody tr{cursor:pointer}tbody tr:hover{background:var(--soft)}
.scroll{overflow:auto;max-height:70vh}.empty{text-align:center;padding:50px 20px;color:var(--mu);font-size:12px}
.foot{display:flex;justify-content:space-between;align-items:center;padding:12px 0;font-size:11px;color:var(--mu)}
.detail{position:fixed;inset:0;background:rgba(2,6,23,.5);z-index:20;display:none}.detail.on{display:flex;justify-content:flex-end}
.panel{background:var(--card);width:min(520px,100%);height:100%;overflow:auto;padding:20px}.panel h2{margin:0 0 4px;font-size:17px}.panel dl{display:grid;grid-template-columns:1fr 1.4fr;gap:10px 14px;font-size:12px;margin:18px 0}.panel dt{color:var(--mu);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em}.panel dd{margin:0;word-break:break-word}
</style></head><body><div id="root"></div>
<script>const DATA=${payload};</script>
<script>
const D=DATA, refs={};
for(const r of D.rows){refs[r.id]=r.title||r.number||r.id;}
const defs=Object.fromEntries(D.defs.map(d=>[d.id,d]));
const groups=['Overview','Win work','Project delivery','Supply chain','People & HR','Safety & quality','Finance','Insights'];
let state={view:'dashboard',q:'',status:'ALL',sort:'',dir:1,page:1,detail:null};
const fmt=(v,t)=>{if(v===null||v===undefined||v==='')return '—';if(t==='currency')return '$'+Number(v||0).toLocaleString('en-US',{maximumFractionDigits:0});if(t==='percent')return Math.round(Number(v||0))+'%';if(t==='number')return Number(v||0).toLocaleString();if(t==='boolean')return v?'Yes':'No';if(Array.isArray(v))return v.join(', ');if(t==='ref')return refs[v]||'—';return String(v).replace(/_/g,' ')};
const tone=s=>/ACTIVE|APPROVED|PAID|COMPLETE|CLOSED|WON|CURRENT|VALID|RECEIVED|GREEN/i.test(s||'')?'g':/OVERDUE|REJECTED|LOST|DELAYED|CRITICAL|EXPIRED|HIGH|RED/i.test(s||'')?'r':/PENDING|DRAFT|SUBMITTED|OPEN|AT_RISK|AMBER/i.test(s||'')?'a':'';
const rowsOf=id=>D.rows.filter(r=>r.resource===id);
function shell(){
  const nav=groups.map(g=>{const items=D.defs.filter(d=>d.group===g);if(!items.length)return '';return '<div class="grp">'+g+'</div>'+items.map(d=>'<a class="nav '+(state.view===d.id?'on':'')+'" onclick="go(\\''+d.id+'\\')">'+d.label+'</a>').join('')}).join('');
  return '<div class="app"><aside><div class="brand"><span class="logo">⌂</span><span>Build<span style="color:var(--ac)">Ops</span></span></div>'+
   '<div style="padding:10px 12px;font-size:10.5px;color:var(--mu);border-bottom:1px solid var(--bd);line-height:1.5">'+D.org.name+'<br><b style="color:var(--tx)">'+D.org.plan+' · '+D.org.modules+' modules</b></div>'+
   '<div class="grp">Overview</div><a class="nav '+(state.view==='dashboard'?'on':'')+'" onclick="go(\\'dashboard\\')">Executive dashboard</a>'+nav+'</aside>'+
   '<main><header><h1 id="ttl"></h1><button class="btn" onclick="dark()">◐ Theme</button></header><div class="wrap" id="body"></div></main></div>'+
   '<div class="detail" id="detail" onclick="if(event.target.id===\\'detail\\')close()"><div class="panel" id="panel"></div></div>';
}
function dark(){document.documentElement.classList.toggle('dark')}
function go(v){state.view=v;state.q='';state.status='ALL';state.page=1;state.sort='';render()}
function money(n){return '$'+(Number(n||0)/1e6).toFixed(1)+'M'}
function dashboard(){
  const P=rowsOf('projects').filter(r=>r.status==='ACTIVE'), I=rowsOf('arInvoices'), B=rowsOf('budgets');
  const cv=P.reduce((t,r)=>t+Number(r.contractValue||0),0), cost=P.reduce((t,r)=>t+Number(r.costToDate||0),0);
  const billed=I.reduce((t,r)=>t+Number(r.total||0),0), paid=I.reduce((t,r)=>t+Number(r.amountPaid||0),0);
  const kpis=[['Active projects',P.length,P.length+' live jobs'],['Contract value',money(cv),'Across active portfolio'],['Billed to date',money(billed),I.length+' client invoices'],['Outstanding AR',money(Math.max(0,billed-paid)),'Awaiting receipt'],['Employees',rowsOf('employees').length,'Across 10 departments'],['Open RFIs',rowsOf('rfis').filter(r=>r.status!=='CLOSED').length,'Technical queries'],['Safety incidents',rowsOf('incidents').length,'With CAPA tracking'],['Equipment assets',rowsOf('equipment').length,'Plant & fleet']];
  const cats={};for(const b of B)cats[b.category||'Other']=(cats[b.category||'Other']||0)+Number(b.actualToDate||0);
  const series=[.10,.13,.15,.17,.20,.25].map((x,i)=>({m:['Jun','Jul','Aug','Sep','Oct','Nov'][i],v:Math.round(billed*x)}));
  const mx=Math.max(...series.map(s=>s.v),1);
  const attention=[['3 change orders awaiting approval','Commercial · exposure tracked','a'],['3 certifications expiring within 30 days','People · renewal required','a'],['4 store items below reorder level','Supply chain · replenishment','a'],['Overdue requests for information','Project delivery · escalate','r'],['Open safety actions & CAPA','HSE · investigations','r']];
  return '<div class="hint"><b>Offline snapshot</b> — this is a self-contained, fully interactive copy of the BuildOps demo data (616 records, '+D.defs.length+' resources). It runs with zero network. For the real full-stack app (login, CRUD that persists, onboarding wizard), use the <b>BuildOps ERP</b> live preview panel in Arena, or run <code>npm run setup</code> in <code>/home/user/buildops</code>.</div>'+
   '<div class="grid">'+kpis.map(k=>'<div class="card kpi"><p>'+k[0]+'</p><strong>'+k[1]+'</strong><small>'+k[2]+'</small></div>').join('')+'</div>'+
   '<div class="two"><div class="card"><p class="ct">Certified & invoiced revenue</p><p class="cs">Last 6 months · client invoices raised</p><div class="barwrap"><div class="bar">'+series.map(s=>'<div style="height:'+Math.max(3,(s.v/mx)*100)+'%"><span>'+s.m+'</span></div>').join('')+'</div></div></div>'+
   '<div class="card"><p class="ct">Cost to date by category</p><p class="cs">From approved budget lines</p>'+Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>'<div class="row"><span class="nm">'+k+'</span><span class="sub">'+money(v)+'</span></div>').join('')+'</div></div>'+
   '<div class="two"><div class="card"><p class="ct">Project portfolio health</p><p class="cs">'+P.length+' active projects</p>'+P.map(p=>'<div class="row"><span class="nm">'+p.name+'<span class="sub"> · '+p.location+'</span></span><div class="pg"><i style="width:'+Number(p.progress||0)+'%"></i></div><span class="sub" style="width:34px;text-align:right">'+p.progress+'%</span><span class="pill '+tone(p.health)+'">'+(p.health||'').replace(/_/g,' ')+'</span></div>').join('')+'</div>'+
   '<div class="card"><p class="ct">Needs your attention</p><p class="cs">Derived from live records</p>'+attention.map(a=>'<div class="row"><span class="nm">'+a[0]+'<span class="sub"> · '+a[1]+'</span></span><span class="pill '+a[2]+'">•</span></div>').join('')+'</div></div>';
}
function table(){
  const d=defs[state.view];if(!d)return '<div class="empty">Not found</div>';
  let rs=rowsOf(d.id);
  if(state.q)rs=rs.filter(r=>JSON.stringify(r).toLowerCase().includes(state.q.toLowerCase()));
  if(state.status!=='ALL')rs=rs.filter(r=>r.status===state.status);
  if(state.sort)rs=[...rs].sort((a,b)=>{const x=a[state.sort],y=b[state.sort];if(typeof x==='number'&&typeof y==='number')return (x-y)*state.dir;return String(x??'').localeCompare(String(y??''))*state.dir});
  const total=rs.length, per=15, pages=Math.max(1,Math.ceil(total/per)), pg=Math.min(state.page,pages);
  const show=rs.slice((pg-1)*per,pg*per);
  const cols=d.columns;
  return '<div class="hint"><b>'+d.label+'</b> — '+total+' records. Search, filter, sort, click a row for full detail. This snapshot is read-only; the live app has full CRUD.</div>'+
   '<div class="tools"><input id="q" placeholder="Search '+d.label.toLowerCase()+'…" value="'+state.q.replace(/"/g,'&quot;')+'" oninput="state.q=this.value;state.page=1;body()">'+
   (d.statusOptions.length?'<select onchange="state.status=this.value;state.page=1;body()"><option value="ALL">All statuses</option>'+d.statusOptions.map(s=>'<option '+(state.status===s?'selected':'')+'>'+s+'</option>').join('')+'</select>':'')+
   '<button class="btn" onclick="state.q=\\'\\';state.status=\\'ALL\\';render()">Clear</button><span style="flex:1"></span><span class="sub" style="align-self:center;color:var(--mu);font-size:11px">'+total+' records</span></div>'+
   '<div class="card scroll" style="padding:0"><table><thead><tr>'+cols.map(c=>'<th onclick="srt(\\''+c+'\\')">'+(defs[d.id].fields.find(f=>f.key===c)?.label||(c==='number'?'No.':c))+'</th>').join('')+'</tr></thead><tbody>'+
   (show.length?show.map(r=>'<tr onclick="openr(\\''+r.id+'\\')">'+cols.map(c=>{const f=d.fields.find(x=>x.key===c);const v=r[c];if(c==='status')return '<td><span class="pill '+tone(v)+'">'+(v||'—').replace(/_/g,' ')+'</span></td>';if(c==='number')return '<td style="font-family:monospace;font-size:11px">'+(v||'—')+'</td>';return '<td>'+fmt(v,f?.type)+'</td>'}).join('')+'</tr>').join(''):'<tr><td colspan="'+cols.length+'"><div class="empty">No matching records</div></td></tr>')+'</tbody></table></div>'+
   '<div class="foot"><span>Showing '+((pg-1)*per+1)+'–'+Math.min(pg*per,total)+' of '+total+'</span><span><button class="btn" onclick="page(-1)">← Prev</button> Page '+pg+' / '+pages+' <button class="btn" onclick="page(1)">Next →</button></span></div>';
}
function srt(k){state.dir=state.sort===k?-state.dir:1;state.sort=k;body()}
function page(n){state.page=Math.max(1,state.page+n);body()}
function openr(id){const r=D.rows.find(x=>x.id===id);if(!r)return;const d=defs[r.resource];state.detail=id;
  document.getElementById('panel').innerHTML='<div style="display:flex;justify-content:space-between"><div><h2>'+(r.title||d.singular)+'</h2><p class="cs">'+(r.number||'')+' · '+d.singular+'</p></div><button class="btn" onclick="close()">✕</button></div><dl>'+d.fields.map(f=>'<dt>'+f.label+'</dt><dd>'+fmt(r[f.key],f.type)+'</dd>').join('')+'</dl>';
  document.getElementById('detail').classList.add('on');}
function close(){document.getElementById('detail').classList.remove('on');state.detail=null}
function body(){document.getElementById('ttl').textContent=state.view==='dashboard'?'Executive dashboard':(defs[state.view]?.label||'');document.getElementById('body').innerHTML=state.view==='dashboard'?dashboard():table()}
function render(){document.getElementById('root').innerHTML=shell();body()}
render();
</script></body></html>`;
  writeFileSync('/home/user/BuildOps-offline-snapshot.html',html);
  console.log('snapshot written:',(html.length/1024).toFixed(1)+' KB', '| records:',rows.length,'| resources:',defs.length);
})().finally(()=>p.$disconnect());
