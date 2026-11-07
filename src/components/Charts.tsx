'use client';
import { money } from '@/lib/format';
const COLORS=['#f59e0b','#0ea5e9','#10b981','#8b5cf6','#ef4444','#64748b'];

export function BarChart({data,height=180,compact=false}:{data:{label:string;value:number}[];height?:number;compact?:boolean}){
  const max=Math.max(...data.map(d=>d.value),1);
  const W=560,H=height,padL=compact?8:46,padB=28,padT=12;
  const bw=(W-padL-16)/Math.max(data.length,1);
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{height}}>
    {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={padL} x2={W-8} y1={padT+(H-padT-padB)*(1-t)} y2={padT+(H-padT-padB)*(1-t)} stroke="currentColor" strokeOpacity=".09" strokeDasharray="3 4"/>
      {!compact&&<text x={padL-8} y={padT+(H-padT-padB)*(1-t)+4} textAnchor="end" fontSize="10" fill="currentColor" opacity=".45">{money(max*t,'USD',true)}</text>}</g>)}
    {data.map((d,i)=>{ const h=(d.value/max)*(H-padT-padB); const x=padL+i*bw+bw*0.18; const w=bw*0.64; const y=H-padB-h;
      return <g key={i}><rect x={x} y={y} width={w} height={Math.max(h,2)} rx="4" fill={i===data.length-1?'#f59e0b':'#fbbf24'} opacity={i===data.length-1?1:.72}/>
        <text x={x+w/2} y={H-8} textAnchor="middle" fontSize="10" fill="currentColor" opacity=".55">{d.label}</text>
        {!compact&&h>24&&<text x={x+w/2} y={y-4} textAnchor="middle" fontSize="9" fill="currentColor" opacity=".6">{money(d.value,'USD',true)}</text>}</g>;})}
  </svg>;
}
export function DonutChart({data,size=170}:{data:{label:string;value:number}[];size?:number}){
  const total=data.reduce((t,d)=>t+d.value,0)||1;
  let acc=0; const r=62,c=2*Math.PI*r;
  return <div className="flex items-center gap-4">
    <svg viewBox="0 0 160 160" style={{width:size,height:size}} className="shrink-0 -rotate-90">
      <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeOpacity=".08" strokeWidth="18"/>
      {data.map((d,i)=>{const len=(d.value/total)*c;const el=<circle key={i} cx="80" cy="80" r={r} fill="none" stroke={COLORS[i%COLORS.length]} strokeWidth="18" strokeDasharray={`${len} ${c-len}`} strokeDashoffset={-acc} strokeLinecap="butt"/>;acc+=len;return el;})}
      <text x="80" y="76" textAnchor="middle" fontSize="18" fontWeight="600" fill="currentColor" transform="rotate(90 80 80)" opacity=".9">{money(total,'USD',true)}</text>
      <text x="80" y="94" textAnchor="middle" fontSize="10" fill="currentColor" transform="rotate(90 80 80)" opacity=".5">total cost</text>
    </svg>
    <div className="min-w-0 flex-1 space-y-2">{data.map((d,i)=><div key={d.label} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{background:COLORS[i%COLORS.length]}}/><span className="min-w-0 flex-1 truncate muted">{d.label}</span><span className="font-medium tabular-nums">{money(d.value,'USD',true)}</span></div>)}</div>
  </div>;
}
export function Sparkline({values,color='#f59e0b'}:{values:number[];color?:string}){
  const max=Math.max(...values,1),min=Math.min(...values,0);const W=100,H=30;
  const pts=values.map((v,i)=>`${(i/(values.length-1))*W},${H-((v-min)/(max-min||1))*(H-4)-2}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-20" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>;
}
export function MiniBars({values,color='#f59e0b'}:{values:number[];color?:string}){
  const max=Math.max(...values,1);
  return <div className="flex h-8 items-end gap-0.5">{values.map((v,i)=><div key={i} className="w-1.5 rounded-t-sm" style={{height:`${Math.max(8,(v/max)*100)}%`,background:color,opacity:.35+i/(values.length*2)}}/>)}</div>;
}
