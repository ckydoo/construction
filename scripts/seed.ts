import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { resolveWorkspace, QUALIFIERS } from '../src/lib/catalog';
import { DEMO_ORG, DEMO_USERS, DEMO_PASSWORD } from '../src/lib/demo';
import { seedDemo } from '../src/lib/seed-service';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding BuildOps demo workspace…');
  const existing = await prisma.organization.findUnique({ where: { slug: DEMO_ORG.slug } });
  if (existing) {
    await prisma.organization.delete({ where: { id: existing.id } });
    await prisma.user.deleteMany({ where: { email: { in: DEMO_USERS.map(u => u.email) } } });
    console.log('  cleared previous demo org');
  }
  const config = resolveWorkspace({
    companyType: 'MIXED_GROUP', size: 'ENTERPRISE', headcount: DEMO_ORG.headcount,
    qualifiers: QUALIFIERS.map(q => q.id), addons: [],
  });
  const org = await prisma.organization.create({ data: {
    ...DEMO_ORG, onboarded: true, config: JSON.stringify(config),
  }});
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of DEMO_USERS) {
    const user = await prisma.user.create({ data: {
      name:u.name, email:u.email, passwordHash:hash, avatarColor:u.color,
    }});
    await prisma.membership.create({ data: { userId:user.id, organizationId:org.id, role:u.role } });
  }
  const seeded = await seedDemo(prisma, org.id);
  console.log(`  ✓ organisation: ${org.name}`);
  console.log(`  ✓ ${seeded.records} records across ${config.resources.length} resources`);
  console.log(`  ✓ ${DEMO_USERS.length} demo users, notifications and audit trail`);
  console.log(`  ✓ ${config.modules.length} modules / ${config.resources.length} resources enabled`);
  // Sample attached documents so the Attachments panel is alive on first load
  const root = process.env.UPLOAD_ROOT || path.join(process.cwd(),'uploads');
  const dir = path.join(root, org.id);
  await mkdir(dir,{recursive:true});
  const makePdf = async (title:string,lines:string[]) => {
    const pdf = await PDFDocument.create(); const page = pdf.addPage([595,842]);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold); const body = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawRectangle({x:0,y:770,width:595,height:72,color:rgb(0.06,0.09,0.16)});
    page.drawText('BuildOps  |  Controlled document',{x:40,y:795,size:15,font:bold,color:rgb(1,1,1)});
    page.drawText(title,{x:40,y:722,size:17,font:bold,color:rgb(0.06,0.09,0.16)});
    let y=680; for(const l of lines){page.drawText(l,{x:40,y,size:10.5,font:body,color:rgb(0.2,0.25,0.35)});y-=22;}
    page.drawText('Kestrel Ridge Construction & Industrial Group (Pvt) Ltd  ·  Harare',{x:40,y:50,size:8,font:body,color:rgb(0.5,0.55,0.6)});
    return Buffer.from(await pdf.save());
  };
  const samples = [
    { rec:'doc-1', name:'KR-GA-221-A General Arrangement.pdf', title:'General Arrangement – Level 2', lines:['Project: Borrowdale Corporate Park – Phase 2','Drawing: KR-GA-221-A  Revision A','Scale 1:100 @ A1   |   Issued for construction','Issued by: Engineering department','Notes: Coordinate with structural and MEP drawings before setting out.'] },
    { rec:'doc-2', name:'Concrete cube test results C30-37.pdf', title:'Concrete Cube Test Results', lines:['Mix designation: C30/37','Sample location: Level 2 slab, Zone B','7-day result: 26.4 MPa    28-day result: 38.1 MPa','Test laboratory: SAZ-accredited materials lab','Result: PASS — complies with specification clause 4.2.'] },
    { rec:'inv-1', name:'TI-2026-4412 supporting certificate.pdf', title:'Payment Certificate Support', lines:['Tax invoice: TI-2026-4412','Period ending: October 2026','Gross certified value and measured quantities attached.','Retention held: 10% in accordance with the contract.','Certified by the Engineer; approved for payment.'] },
  ];
  for(const s of samples){
    const bytes = await makePdf(s.title,s.lines);
    const storedName = `sample-${s.rec}-${s.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    await writeFile(path.join(dir,storedName),bytes);
    await prisma.attachment.create({data:{organizationId:org.id,recordId:`${org.id}_${s.rec}`,resource:s.rec==='inv-1'?'arInvoices':'documents',fileName:s.name,storedName,mime:'application/pdf',size:bytes.length,uploadedByName:'Rutendo Chikomba',uploadedById:null}});
  }
  console.log(`  ✓ ${samples.length} sample PDF attachments`);
  console.log(`\nDemo login: owner@kestrelridge.co.zw  /  ${DEMO_PASSWORD}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
