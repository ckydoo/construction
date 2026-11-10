import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { apiAuth } from '@/lib/auth';
import { getResource } from '@/lib/resources';
import { getRecord } from '@/lib/records';
import { readGuard, capabilityGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { money, date } from '@/lib/format';
import { normaliseCurrencyConfig, toBase, hasRate } from '@/lib/currency';
import { BRAND } from '@/lib/brand';
import { MYLA_PDF_LOGO_PNG_BASE64 } from '@/lib/brand-assets';

const A4W=595.28, A4H=841.89, M=42;
const NAVY=rgb(0.012,0.125,0.247), INK=rgb(0.012,0.125,0.247), MUTED=rgb(0.32,0.41,0.48), ORANGE=rgb(0.961,0.529,0.071), LINE=rgb(0.87,0.90,0.93);

export async function GET(_req:Request,{params}:{params:Promise<{org:string;resource:string;id:string}>}){
  const { org,resource,id } = await params;
  const a = await apiAuth(org); if(!a) return NextResponse.json({error:'Unauthorized'},{status:401});
  const def = getResource(resource);
  if(!def) return NextResponse.json({error:'Unknown or disabled resource'},{status:404});
  const g = readGuard(a.config, a.role, resource) || capabilityGuard(a.role,'exports'); if(g) return g;
  const scope = await buildScope(a);
  const row:any = await getRecord(a.orgId,resource,id,scope);
  if(!row) return NextResponse.json({error:'Record not found'},{status:404});
  const orgRow = a.org;
  const cfg = normaliseCurrencyConfig(a.config.currency, a.org.baseCurrency);
  const isCert = resource==='paymentApps';
  const isInvoice = resource==='arInvoices' || resource==='apInvoices';
  const docKind = isCert?'CERTIFICATE':isInvoice?'INVOICE':'DOCUMENT';

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${def.singular} ${row.number||''} — ${row.title||''}`);
  pdf.setAuthor(orgRow?.name||BRAND.name);
  pdf.setCreator(`${BRAND.name} ERP`);
  pdf.setSubject(`${BRAND.motto} ${BRAND.descriptor}`);
  const logoBytes = Buffer.from(MYLA_PDF_LOGO_PNG_BASE64, 'base64');
  const logo = await pdf.embedPng(logoBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([A4W,A4H]);
  let y = A4H-M;
  const wrap=(text:string,max:number,size:number,f:any)=>{
    const words=String(text).split(/\s+/);const lines:string[]=[];let cur='';
    for(const w of words){const t=cur?`${cur} ${w}`:w;if(f.widthOfTextAtSize(t,size)>max&&cur){lines.push(cur);cur=w;}else cur=t;}
    if(cur)lines.push(cur);return lines.length?lines:[''];
  };
  const text=(s:string,x:number,size:number,f:any,color=INK)=>{page.drawText(s,{x,y,size,font:f,color});};
  const newPage=()=>{page=pdf.addPage([A4W,A4H]);y=A4H-M;header(false);};
  const header=(first:boolean)=>{
    page.drawRectangle({x:0,y:A4H-78,width:A4W,height:78,color:NAVY});
    page.drawRectangle({x:0,y:A4H-81,width:A4W,height:3,color:ORANGE});
    const logoH=25, logoW=logo.width/logo.height*logoH;
    page.drawImage(logo,{x:M,y:A4H-48,width:logoW,height:logoH});
    page.drawText((orgRow?.name||'').slice(0,52),{x:M,y:A4H-65,size:8,font,color:rgb(0.76,0.81,0.86)});
    page.drawText(`ERP / ${docKind}`,{x:A4W-M-95,y:A4H-34,size:8,font:bold,color:ORANGE});
    page.drawText(BRAND.motto,{x:A4W-M-145,y:A4H-52,size:7,font,color:rgb(0.76,0.81,0.86)});
    y=A4H-104;
    if(first){
      page.drawText(isCert?'INTERIM PAYMENT CERTIFICATE':isInvoice?'TAX INVOICE':def.singular.toUpperCase(),{x:M,y,size:9,font:bold,color:MUTED});y-=22;
      for(const line of wrap(row.title||def.singular,A4W-2*M,19,bold)){page.drawText(line,{x:M,y,size:19,font:bold,color:INK});y-=24;}
      y-=6;
      page.drawText(`${row.number||'—'}`,{x:M,y,size:10,font:bold,color:MUTED});
      page.drawText(`${date(row.createdAt)}  ·  ${(row.status||'DRAFT').replace(/_/g,' ')}`,{x:M+120,y,size:10,font,color:MUTED});
      y-=18;page.drawLine({start:{x:M,y},end:{x:A4W-M,y},thickness:1,color:LINE});y-=22;
    }
  };
  header(true);

  const labelW=175, valX=M+labelW, valW=A4W-M-valX;
  for(const f of def.fields){
    const v=row[f.key];
    if(v===null||v===undefined||v==='')continue;
    let display='';
    if(f.type==='currency')display=money(v,row.currency||orgRow?.baseCurrency||'USD');
    else if(f.type==='percent')display=`${v}%`;
    else if(f.type==='number')display=Number(v).toLocaleString('en-US');
    else if(f.type==='date')display=date(v);
    else if(f.type==='boolean')display=v?'Yes':'No';
    else if(f.type==='tags')display=Array.isArray(v)?v.join(', '):String(v);
    else if(f.type==='ref')display=String(v).slice(-10);
    else display=String(v);
    const lines=wrap(display,valW,9.5,font);
    const h=Math.max(24,lines.length*13+10);
    if(y-h<M+45)newPage();
    page.drawText(f.label.toUpperCase(),{x:M,y:y-10,size:8,font:bold,color:MUTED});
    let ly=y-10;
    for(const line of lines.slice(0,8)){page.drawText(line,{x:valX,y:ly,size:9.5,font,color:INK});ly-=13;}
    y-=h;
    page.drawLine({start:{x:M,y:y+4},end:{x:A4W-M,y:y+4},thickness:.5,color:LINE});
  }
  if(def.amountKey){
    const amount=Number(row[def.amountKey]||0);
    if(amount>0){
      if(y-70<M+45)newPage();
      y-=14;
      page.drawRectangle({x:A4W-M-230,y:y-42,width:230,height:44,color:rgb(0.98,0.96,0.92)});
      page.drawText('TOTAL',{x:A4W-M-218,y:y-18,size:8,font:bold,color:MUTED});
      const docCurrency=String(row.currency||cfg.base).toUpperCase();
      page.drawText(money(amount,docCurrency),{x:A4W-M-218,y:y-35,size:14,font:bold,color:INK});
      if(docCurrency!==cfg.base&&hasRate(docCurrency,cfg)){
        page.drawText(`Reporting total: ${money(toBase(amount,docCurrency,cfg),cfg.base)} (1 ${cfg.base} = ${cfg.rates[docCurrency]} ${docCurrency})`,{x:M,y:y-35,size:8,font,color:MUTED});
      }
      y-=46;
    }
  }
  if(isCert||isInvoice){
    if(y-115<M+45)newPage();
    y-=24;
    page.drawText(isCert?'CERTIFICATION':'PAYMENT DETAILS',{x:M,y,size:9,font:bold,color:MUTED}); y-=18;
    const note = isCert
      ? `The net amount stated above is certified as due to the contractor for works executed up to ${date(row.periodEnd||new Date().toISOString())}, subject to the terms and conditions of the contract. Retention and advance recoupment have been applied as shown.`
      : `Please settle by the due date shown above. Quote the document number on all remittances. Banking details: ${orgRow?.name||''} — contact the finance department for the current account.`;
    for(const l of wrap(note,A4W-2*M,9,font)){ page.drawText(l,{x:M,y,size:9,font,color:INK}); y-=13; }
    y-=24;
    const sigY=y;
    page.drawLine({start:{x:M,y:sigY},end:{x:M+190,y:sigY},thickness:.6,color:LINE});
    page.drawLine({start:{x:A4W-M-190,y:sigY},end:{x:A4W-M,y:sigY},thickness:.6,color:LINE});
    page.drawText(isCert?'Certified by / Engineer':'Prepared by / Finance',{x:M,y:sigY-14,size:8,font,color:MUTED});
    page.drawText(isCert?'Received by / Contractor':'Authorised signatory',{x:A4W-M-190,y:sigY-14,size:8,font,color:MUTED});
    y=sigY-34;
  }
  const pages=pdf.getPageCount();
  for(let i=0;i<pages;i++){
    const p=pdf.getPage(i);
    p.drawLine({start:{x:M,y:M+24},end:{x:A4W-M,y:M+24},thickness:.5,color:LINE});
    p.drawText(`Generated by ${BRAND.name} · ${BRAND.motto} ${date(new Date().toISOString())} · ${orgRow?.name||''}`,{x:M,y:M+10,size:7.5,font,color:MUTED});
    p.drawText(`Page ${i+1} of ${pages}`,{x:A4W-M-52,y:M+10,size:7.5,font,color:MUTED});
  }
  const bytes=await pdf.save();
  return new NextResponse(new Uint8Array(bytes),{headers:{
    'Content-Type':'application/pdf',
    'Content-Disposition':`attachment; filename="${def.prefix}-${(row.number||id).replace(/[^a-zA-Z0-9-]/g,'_')}.pdf"`,
    'Cache-Control':'no-store',
  }});
}
