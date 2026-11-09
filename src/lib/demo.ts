/* Deterministic, realistic demo data for a Zimbabwean construction & industrial group.
   Downstream records reference upstream IDs so figures reconcile across modules. */
import { RESOURCE_MAP } from './resources';

export const DEMO_ORG = {
  name: 'Kestrel Ridge Construction & Industrial Group',
  slug: 'kestrel-ridge',
  legalName: 'Kestrel Ridge Construction & Industrial Group (Pvt) Ltd',
  regNumber: '2014/089321/07', country: 'ZW', baseCurrency: 'USD', localePack: 'ZW',
  companyType: 'MIXED_GROUP', size: 'ENTERPRISE', headcount: 1180, revenueBand: '$100M+',
};
export const DEMO_PASSWORD = 'Demo@1234';
export const DEMO_USERS = [
  { name:'Tendai Muchengeti', email:'owner@kestrelridge.co.zw', role:'OWNER', color:'#b45309' },
  { name:'Rutendo Chikomba', email:'pm@kestrelridge.co.zw', role:'PROJECT_MANAGER', color:'#0f766e' },
  { name:'Farai Nyamayaro', email:'finance@kestrelridge.co.zw', role:'FINANCE_MANAGER', color:'#1d4ed8' },
  { name:'Nomsa Dube', email:'hr@kestrelridge.co.zw', role:'HR_MANAGER', color:'#be185d' },
  { name:'Bright Moyo', email:'safety@kestrelridge.co.zw', role:'SAFETY_OFFICER', color:'#dc2626' },
  { name:'Kudzai Mapfumo', email:'procurement@kestrelridge.co.zw', role:'PROCUREMENT', color:'#7c3aed' },
  { name:'Lisa Goromonzi', email:'client@westgate.co.zw', role:'CLIENT_EXTERNAL', color:'#0891b2' },
];

const BASE = new Date('2026-11-07T09:00:00Z');
const off = (days:number) => new Date(BASE.getTime()+days*86400000).toISOString().slice(0,10);
let seed = 20261107;
const rnd = () => { seed = (seed*1664525+1013904223)%4294967296; return seed/4294967296; };
const pick = <T,>(a:T[]):T => a[Math.floor(rnd()*a.length)];
const ri = (a:number,b:number) => Math.floor(a+rnd()*(b-a+1));
const money = (a:number,b:number) => Math.round((a+rnd()*(b-a))/100)*100;

type SeedRec = { id:string; resource:string; number:string; title:string; status:string|null; projectId:string|null; data:Record<string,any>; createdAt:Date; updatedAt:Date };
export function buildDemo(orgId:string) {
  const records: SeedRec[] = [];
  const counters: Record<string,number> = {};
  const add = (resource:string, id:string, d:Record<string,any>) => {
    const def = RESOURCE_MAP[resource]; if (!def) throw new Error('Unknown resource '+resource);
    const n = (counters[resource] = (counters[resource]||0)+1);
    const number = `${def.prefix}-${String(n).padStart(4,'0')}`;
    const status = d.status || def.statusOptions?.[0] || null;
    const projectId = d.projectId || null;
    const title = String(d[def.titleKey] || number);
    const data = { ...d, number, status, projectId };
    const createdAt = new Date(BASE.getTime() - ri(1,180)*86400000);
    records.push({ id:`${orgId}_${id}`, resource, number, title, status, projectId, data, createdAt, updatedAt:createdAt });
    return id;
  };

  // ---------- Clients ----------
  const clientNames = [
    ['Westgate Properties (Pvt) Ltd','Private developer','Harare'], ['Delta Beverages Zimbabwe','Industrial','Harare'],
    ['Ministry of Transport & Infrastructural Development','Parastatal / Government','Harare'],
    ['City of Harare','Parastatal / Government','Harare'], ['Schweppes Zimbabwe Ltd','Industrial','Harare'],
    ['Old Mutual Property Investments','Commercial','Harare'], ['Zimbabwe Power Company','Parastatal / Government','Hwange'],
    ['CBZ Bank Ltd','Commercial','Harare'], ['Innscor Africa Ltd','Industrial','Harare'],
  ];
  const clients = clientNames.map((c,i)=>add('clients',`cli-${i+1}`,{
    name:c[0], type:c[1], registrationNo:`200${i}/0${ri(1000,9999)}/07`, industry:c[1],
    email:`accounts@${c[0].split(' ')[0].toLowerCase()}.co.zw`, phone:`+263 4 ${ri(200,899)} ${ri(1000,9999)}`,
    city:c[2], address:`${ri(1,120)} ${pick(['Samora Machel Ave','Borrowdale Road','Seke Road','Churchill Ave','Nyanga Road'])}, ${c[2]}`,
    creditLimit:money(200000,2500000), paymentTerms:pick([30,45,60]), tags:[pick(['Key account','Repeat client','Tender','Watchlist'])],
    status:i===8?'PROSPECT':'ACTIVE',
  }));
  const contacts = [
    ['Lisa Goromonzi','Projects Director','cli-1'], ['Tawanda Chikwanha','Procurement Lead','cli-2'],
    ['Eng. Clever Musariri','Permanent Secretary','cli-3'], ['Misheck Zhou','City Engineer','cli-4'],
    ['Sandra Mpofu','Capital Projects','cli-5'], ['Peter Ncube','Asset Manager','cli-6'],
    ['Innocent Mlambo','Plant Manager','cli-7'], ['Chipo Mangwende','Head of Property','cli-8'],
    ['Gift Mashingaidze','Group Engineer','cli-9'], ['Dr. Nyarai Jena','Client Representative','cli-1'],
  ].map((c,i)=>add('contacts',`con-${i+1}`,{name:c[0],clientId:`${orgId}_${c[2]}`,jobTitle:c[1],email:`${c[0].split(' ')[0].toLowerCase()}@client.co.zw`,phone:`+263 7${ri(70,79)} ${ri(100000,999999)}`,category:i===9?'Consultant':'Client'}));

  // ---------- Employees ----------
  const names = [
    'Tendai Muchengeti','Rutendo Chikomba','Farai Nyamayaro','Nomsa Dube','Bright Moyo','Kudzai Mapfumo',
    'Simbarashe Gono','Tatenda Marufu','Prosper Mutasa','Yeukai Chigumira','Munyaradzi Phiri','Sibusiso Nkomo',
    'Chiedza Mavhunga','Tafadzwa Sithole','Nyasha Kwaramba','Brian Chimedza','Grace Mutonhodza','Lovemore Zimuto',
    'Sekai Madzima','Takunda Nyoni','Tsitsi Bere','Anesu Chirume','Tinashe Muzondo','Vimbai Chaza','Learnmore Dhliwayo',
    'Rudo Mashoko','Clement Gomwe','Fortune Machingura','Portia Siziba','Elvis Mabika','Memory Chitsunga',
    'Blessing Kandemiri','Shingirai Mugabe','Patience Goredema','Donald Mhlanga','Shelter Mpofu',
    'Washington Chirwa','Mildred Katsande','Edmore Jena','Machona Chitura',
  ];
  const titles = ['Project Manager','Senior Site Engineer','Quantity Surveyor','Finance Manager','HR Manager','Procurement Manager','HSE Manager','Site Agent','Foreman','General Foreman','Plant Manager','Contracts Manager','Estimator','Accountant','Storekeeper'];
  const depts = ['Projects','Engineering','Commercial / QS','Finance','HR & Admin','Procurement','HSE','Plant & Equipment','Site Operations','Estimating'];
  const trades = ['General labour','Carpentry','Masonry','Steel fixing','Electrical','Mechanical','Plumbing','Welding','Plant operation','Concrete'];
  const employeeIds = names.map((n,i)=>add('employees',`emp-${i+1}`,{
    name:n, employeeNo:`KR-${String(1001+i)}`, email:`${n.toLowerCase().replace(/[^a-z]+/g,'.')}@kestrelridge.co.zw`,
    phone:`+263 7${ri(70,79)} ${ri(100000,999999)}`, jobTitle:titles[i%titles.length], department:depts[i%depts.length],
    trade:trades[i%trades.length], reportsTo:i<6?null:`${orgId}_emp-${(i%6)+1}`,
    employmentType:i<32?'PERMANENT':pick(['FIXED_TERM','CASUAL','CONTRACT']),
    startDate:off(-ri(300,2600)), contractExpiry:i%7===0?off(ri(20,180)):null,
    basicSalary:money(450,4200), currency:pick(['USD','USD','USD','ZWG']), grade:pick(['A','B','C','D','E']),
    emergencyContact:`+263 7${ri(70,79)} ${ri(100000,999999)}`, nationalId:`${ri(10,75)}-${ri(100000,999999)}-${ri(10,99)}`,
    status:i%17===0?'ON_LEAVE':'ACTIVE',
  }));
  const empRef = () => `${orgId}_${pick(employeeIds)}`; // always points at a real employee
  const departments = depts.slice(0,8).map((d,i)=>add('departments',`dep-${i+1}`,{
    name:d, code:`CC-${String(100+i*10)}`, head:`${orgId}_emp-${i+1}`, headcount:ri(3,18),
    annualBudget:money(120000,1800000), description:`${d} function for the group`, status:'ACTIVE',
  }));

  // ---------- Projects ----------
  const projectDefs = [
    ['Borrowdale Corporate Park – Phase 2','PRJ-2025-014','cli-1','Commercial building',18400000,16600000,10230000,62,'ON_TRACK','ACTIVE','Harare – Borrowdale'],
    ['Pomona Industrial Plant Expansion','PRJ-2025-021','cli-2','Industrial plant',31200000,28900000,9810000,34,'AT_RISK','ACTIVE','Harare – Pomona'],
    ['Mutare–Nyanga Road Rehabilitation Lot 3','PRJ-2024-038','cli-3','Civil / roads',9700000,8900000,7120000,78,'ON_TRACK','ACTIVE','Manicaland'],
    ['Avondale Medical Centre Fit-out','PRJ-2024-011','cli-8','Fit-out / refurb',4100000,3900000,3740000,100,'ON_TRACK','COMPLETED','Harare – Avondale'],
    ['Graniteside Logistics Hub','PRJ-2026-002','cli-9','Commercial building',22000000,0,0,0,'ON_TRACK','BID','Harare – Graniteside'],
  ] as const;
  const projects = projectDefs.map((p,i)=>add('projects',`prj-${i+1}`,{
    name:p[0], code:p[1], clientId:`${orgId}_${p[2]}`, type:p[3], contractFlavour:pick(['FIDIC Red Book','NEC4 ECC','JBCC','FIDIC Silver Book (EPC)']),
    location:p[10], contractValue:p[4], budget:p[5], costToDate:p[6], progress:p[7],
    startDate:off(-ri(200,600)), endDate:off(ri(30,400)), actualCompletion:p[9]==='COMPLETED'?off(-45):null,
    manager:`${orgId}_emp-${i+2}`, health:p[8], currency:'USD',
    scope:`Design and construction of ${String(p[0]).toLowerCase()}, including associated site works, services and handover documentation.`,
    status:p[9],
  }));
  const crews = ['Civil gang A','Concrete crew','Steel fixing team','Electrical team A','Mechanical fitters','Finishing crew','Roadworks gang','Plant operators'].map((c,i)=>add('crews',`crw-${i+1}`,{
    name:c, projectId:`${orgId}_prj-${(i%3)+1}`, trade:trades[i], crewLeader:empRef(), size:ri(4,16),
    shift:'06:00 – 17:00 Mon–Sat', members:`${ri(4,16)} operatives`, status:i===7?'STANDBY':'ACTIVE',
  }));
  const taskNames = ['Site establishment & hoarding','Bulk earthworks','Piling and foundations','Substructure concrete','Structural steel erection','Blockwork & masonry','Roof structure','External envelope','MEP first fix','Internal partitions','Electrical containment','Plumbing rough-in','HVAC ducting','Fire protection','Plaster & screeds','Tiling & finishes','Second fix electrical','Commissioning of services','External works & paving','Landscaping','Snagging and de-snagging','Final inspection','As-built documentation','Handover & O&M manuals'];
  taskNames.forEach((t,i)=>{
    const pIdx=i%3+1;
    add('tasks',`tsk-${i+1}`,{ name:t, projectId:`${orgId}_prj-${pIdx}`, wbsLevel:pick(['Phase','Work package','Activity','Milestone']), wbsCode:`${pIdx}.${Math.floor(i/4)+1}.${(i%4)+1}`,
      plannedStart:off(-ri(60,240)), plannedEnd:off(ri(-30,220)), actualStart:off(-ri(30,200)), actualEnd:i%5===0?off(-ri(1,90)):null,
      duration:ri(3,45), progress:i%4===0?100:ri(10,95), assignedTo:empRef(), priority:pick(['LOW','MEDIUM','HIGH','CRITICAL']),
      status:i%4===0?'COMPLETE':pick(['IN_PROGRESS','NOT_STARTED','ON_HOLD']),
    });
  });

  // ---------- Vendors / subcontractors ----------
  const vendorNames = ['Lafarge Cement Zimbabwe','ZimRebar & Steel (Pvt) Ltd','PPC Zimbabwe','Willowvale Electrical Wholesale','Bradlows Building Supplies','TotalEnergies Zimbabwe','Unifreight Logistics','Dura Plastics','Steelmakers Zimbabwe','Cutrite Tools','BOC Gases','Zimglass Industries'];
  const vendors = vendorNames.map((v,i)=>add('vendors',`ven-${i+1}`,{
    name:v, category:pick(['Building materials','Cement & aggregates','Steel & rebar','Electrical','Mechanical','Fuel','Transport','Services']),
    registrationNo:`200${i}/0441${i}/07`, email:`sales@vendor${i+1}.co.zw`, phone:`+263 4 ${ri(200,899)} ${ri(1000,9999)}`,
    city:pick(['Harare','Bulawayo','Mutare','Gweru']), contactPerson:pick(names), paymentTerms:pick([30,30,45,60]),
    complianceExpiry:off(ri(-20,300)), rating:ri(3,5), tags:[pick(['Preferred','Local','Framework'])],
    status:i===1?'PREFERRED':'ACTIVE',
  }));
  const subNames = ['Mashonaland Electrical Services','Vantage Mechanical & Plumbing','Highveld Steelworks','Chimuti Civil Works','Ridgeway Fire Systems','Mazowe Aluminium & Glazing','Sunrise Paint & Finishes','Terraforce Earthmoving'];
  const subs = subNames.map((s,i)=>add('subcontractors',`sub-${i+1}`,{
    name:s, trades:[trades[(i*3)%trades.length],trades[(i*3+1)%trades.length]], registrationNo:`201${i}/7782${i}/07`,
    contactPerson:pick(names), email:`admin@sub${i+1}.co.zw`, phone:`+263 4 ${ri(400,799)} ${ri(1000,9999)}`,
    insuranceExpiry:off(ri(-15,280)), taxClearanceExpiry:off(ri(-10,250)), rating:ri(3,5), creditLimit:money(200000,1800000),
    notes:'Prequalified; current tax clearance and public liability on file.', status:i===6?'SUSPENDED':'ACTIVE',
  }));
  const warehouses = [['Borrowdale central store','WH-BOR','Borrowdale site'],['Pomona plant yard','WH-POM','Pomona industrial site']].map((w,i)=>add('warehouses',`wh-${i+1}`,{
    name:w[0], code:w[1], location:w[2], storekeeper:empRef(), phone:`+263 4 ${ri(200,899)} ${ri(1000,9999)}`, notes:'Main stores compound', status:'ACTIVE',
  }));

  // ---------- Equipment ----------
  const equipDefs = [
    ['Caterpillar 320D Excavator','Excavator','CAT'], ['CAT 950 GC Wheel Loader','Loader','CAT'], ['Bell B30E Articulated Dump Truck','Tipper truck','BELL'],
    ['Liebherr LTM 1050 Mobile Crane','Crane','LIEBHERR'], ['Caterpillar 140K Motor Grader','Grader','CAT'], ['HAMM HD+ 120 Roller','Roller','HAMM'],
    ['Zoomlion Concrete Mixer 8m³','Concrete mixer','ZOOMLION'], ['Perkins 500kVA Generator','Generator','PERKINS'], ['Atlas Copco XAS 97 Compressor','Compressor','ATLAS COPCO'],
    ['Toyota Hilux GD6 Site Pickup','Pickup','TOYOTA'], ['Hyster H3.0XT Forklift','Forklift','HYSTER'], ['Layher Scaffolding Set 500m²','Scaffolding','LAYHER'],
  ];
  for(let i=0;i<28;i++){
    const e=equipDefs[i%equipDefs.length];
    add('equipment',`eq-${i+1}`,{
      name:`${e[0]}${i>=12?' #'+(Math.floor(i/12)+1):''}`, assetTag:`KR-AS-${String(2001+i)}`, category:e[1], makeModel:e[2],
      serialNo:`${e[2].slice(0,3)}-${ri(10000,99999)}`, projectId:`${orgId}_prj-${(i%3)+1}`, ownership:i%6===0?'LEASED':'OWNED',
      purchaseDate:off(-ri(200,2200)), purchaseCost:money(18000,420000), hourMeter:ri(120,9800), utilisation:ri(35,95),
      serviceDue:off(ri(-25,120)), insuranceExpiry:off(ri(10,300)), operator:empRef(),
      status:pick(['ON_SITE','ON_SITE','AVAILABLE','IN_WORKSHOP','RENTED_OUT']),
    });
  }
  for(let i=0;i<8;i++) add('workOrders',`wo-${i+1}`,{
    name:pick(['1,000-hour service','Hydraulic hose replacement','Brake overhaul','Tyre replacement','Electrical fault diagnosis','Annual load test','Calibration of hour meter','Engine oil & filter change']),
    equipmentId:`${orgId}_eq-${i+1}`, projectId:`${orgId}_prj-${(i%3)+1}`, type:pick(['PREVENTIVE','CORRECTIVE','BREAKDOWN','INSPECTION','CALIBRATION']),
    priority:pick(['LOW','MEDIUM','HIGH']), openedDate:off(-ri(5,90)), dueDate:off(ri(-10,40)), closedDate:i%3===0?off(-ri(1,20)):null,
    cost:money(180,9800), workDescription:'Scheduled maintenance carried out by plant workshop.', assignedTo:empRef(),
    status:pick(['OPEN','IN_PROGRESS','PARTS_PENDING','COMPLETE']),
  });

  // ---------- Win work ----------
  const leadNames = ['Newlands Office Tower','ZPC Hwange Unit 7 Ash Plant','Beitbridge Border Post Upgrade','Chitungwiza Trunk Sewer','Mbare Bus Terminus Redevelopment','Kariba Floating Solar Array'];
  leadNames.forEach((l,i)=>add('leads',`lead-${i+1}`,{
    name:l, clientId:`${orgId}_cli-${(i%9)+1}`, stage:pick(['IDENTIFIED','QUALIFIED','BID_PREP','SUBMITTED','NEGOTIATION','WON','LOST']),
    value:money(1200000,28000000), probability:pick([10,25,40,60,75,90]), workType:pick(['Commercial building','Industrial plant','Infrastructure','Water & utilities','Energy']),
    dueDate:off(ri(-20,120)), owner:empRef(), source:pick(['Tender portal','Referral','Repeat client','Public advert']),
    notes:'Tender documents reviewed by commercial team.', status:pick(['OPEN','OPEN','ON_HOLD','WON','LOST']),
  }));
  for(let i=0;i<4;i++){
    const labour=money(300000,2400000), material=money(500000,4200000), plant=money(120000,900000), sub=money(200000,2100000), oh=money(80000,400000);
    const markup=pick([8,10,12,15,18]);
    add('estimates',`est-${i+1}`,{ name:`Estimate – ${leadNames[i]}`, clientId:`${orgId}_cli-${i+1}`, leadId:`${orgId}_lead-${i+1}`,
      workType:pick(['Commercial building','Industrial plant','Civil / roads']), labourCost:labour, materialCost:material, plantCost:plant, subcontractCost:sub,
      overheads:oh, markup, total:Math.round((labour+material+plant+sub+oh)*(1+markup/100)), revision:ri(0,3),
      submittedDate:off(-ri(10,150)), currency:'USD', scope:'Full build-up including preliminaries, contingencies and VAT excl.',
      status:pick(['DRAFT','INTERNAL_REVIEW','SUBMITTED','AWARDED']),
    });
    add('bids',`bid-${i+1}`,{ name:`Tender – ${leadNames[i]}`, clientId:`${orgId}_cli-${i+1}`, tenderNo:`T/${2026}/${ri(100,999)}`,
      bidValue:money(2000000,26000000), closingDate:off(ri(-60,90)), contractFlavour:pick(['FIDIC Red Book','NEC4 ECC','JBCC']),
      bidBond:money(20000,260000), outcome:pick(['PENDING','AWARDED','LOST','WITHDRAWN']), estimator:empRef(), notes:'Addenda 1–3 incorporated.',
    });
  }

  // ---------- Commercial / delivery ----------
  for(let i=0;i<6;i++) add('contracts',`ctr-${i+1}`,{
    name:`${i<3?'Main works contract':i<5?'Subcontract agreement':'Consultancy agreement'} – ${projectDefs[i%5][0].slice(0,28)}`,
    projectId:`${orgId}_prj-${(i%4)+1}`, clientId:`${orgId}_cli-${(i%9)+1}`, counterparty:`${orgId}_sub-${(i%8)+1}`,
    kind:i<3?'Prime contract':i<5?'Subcontract':'Consultancy', contractFlavour:pick(['FIDIC Red Book','NEC4 ECC','FIDIC Silver Book (EPC)','JBCC']),
    value:money(400000,18400000), signedDate:off(-ri(100,500)), completionDate:off(ri(30,420)), retentionPct:pick([5,10]),
    defectsPeriod:12, insuranceRef:`INS/${2026}/${ri(100,999)}`, status:pick(['ACTIVE','ACTIVE','VARIED','COMPLETED']),
  });
  const coReasons=['Client change','Design change','Site condition','Statutory requirement','Scope gap'];
  for(let i=0;i<12;i++) add('changeOrders',`co-${i+1}`,{
    name:`${pick(['Additional reinforced concrete to Level 3','Revised electrical containment route','Extended piling depth','Additional fire sprinkler zone','Rock excavation in cut area','Revised stormwater outfall','Additional cable trench length','Client-requested finish upgrade'])}`,
    projectId:`${orgId}_prj-${(i%3)+1}`, reference:`VO-${String(i+1).padStart(3,'0')}`, reason:pick(coReasons),
    amount:money(8000,480000), timeExtension:pick([0,0,7,14,21]), submittedDate:off(-ri(5,120)), decisionDate:i%3===0?off(-ri(1,30)):null,
    requestedBy:`${orgId}_con-${ri(1,10)}`, approvedBy:`${orgId}_emp-2`, justification:'Instruction issued by the Engineer; supported by measured quantities.',
    status:pick(['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','INCLUDED_IN_CERT']),
  });
  const rfiSubjects=['Clarification of foundation reinforcement','Confirm floor finish specification','Structural opening size at Grid C/4','Cable routing conflict with ductwork','Waterproofing membrane detail','Confirm transformer location','Fire rating of partition Type P2','Revised door schedule','Concrete cover to retaining wall','Alignment of stormwater line','Clarify weld procedure spec','Access chamber cover class'];
  for(let i=0;i<18;i++) add('rfis',`rfi-${i+1}`,{
    subject:rfiSubjects[i%rfiSubjects.length], projectId:`${orgId}_prj-${(i%3)+1}`, specRef:`DRG-${ri(100,999)} / Rev ${pick(['A','B','C'])}`,
    discipline:pick(['Architectural','Structural','Civil','Mechanical','Electrical','Plumbing']), priority:pick(['LOW','MEDIUM','HIGH','CRITICAL']),
    raisedBy:empRef(), addressedTo:`${orgId}_con-${ri(1,10)}`, dueDate:off(ri(-25,40)), answeredDate:i%3===0?off(-ri(1,20)):null,
    question:'Please confirm the detail noted on the referenced drawing before procurement is released.',
    response:i%3===0?'Confirmed – proceed as per revision C.':null, status:i%3===0?'CLOSED':pick(['OPEN','ANSWERED','OVERDUE']),
  });
  for(let i=0;i<12;i++) add('submittals',`subm-${i+1}`,{
    name:pick(['Shop drawing – structural steel Level 2','Concrete mix design C30/37','Ceramic tile sample','Chiller technical data','Fire pump datasheet','Method statement – piling','HVAC duct shop drawings','Cable tray sample']),
    projectId:`${orgId}_prj-${(i%3)+1}`, package:`PKG-${ri(1,20)}`, type:pick(['Shop drawing','Material sample','Technical data','Method statement','Certificate']),
    submittedBy:`${orgId}_sub-${(i%8)+1}`, submittedDate:off(-ri(5,100)), requiredDate:off(ri(-10,30)), returnedDate:i%2===0?off(-ri(1,25)):null,
    reviewNotes:i%2===0?'Approved subject to comments on fixing centres.':null,
    status:pick(['PENDING','UNDER_REVIEW','APPROVED','APPROVE_AS_NOTED','REJECTED','RESUBMIT']),
  });
  const docTypes=['Drawing','Specification','Method statement','Report','Contract','Correspondence','O&M manual'];
  for(let i=0;i<20;i++) add('documents',`doc-${i+1}`,{
    name:pick(['General arrangement – Level 2','Structural foundation layout','MEP coordination drawing','Site establishment plan','Concrete pour method statement','Progress report','HSE site plan','Fire strategy drawing','As-built survey','O&M manual draft'])+` (${i+1})`,
    projectId:`${orgId}_prj-${(i%4)+1}`, drawingNo:`KR-${ri(100,999)}-${pick(['A','E','S','M','C'])}`, revision:pick(['A','B','C','Rev 01','Rev 02']),
    type:pick(docTypes), discipline:pick(['Architectural','Structural','Civil','Mechanical','Electrical','HSE','Commercial']),
    fileName:`KR-${ri(1000,9999)}-${pick(['GA','STR','MEP'])}-${pick(['A','B','C'])}.pdf`, issuedDate:off(-ri(5,200)), issuedBy:empRef(),
    notes:'Controlled copy issued to site and consultant.', status:pick(['CURRENT','CURRENT','FOR_REVIEW','SUPERSEDED','DRAFT']),
  });
  const weather=['Sunny','Cloudy','Rain','Heavy rain','Windy','Hot'];
  for(let i=0;i<30;i++) add('dailyLogs',`dl-${i+1}`,{
    name:`Daily site report – ${off(-i)}`, projectId:`${orgId}_prj-${(i%3)+1}`, date:off(-i), weather:pick(weather),
    temperature:ri(14,34), manpower:ri(28,140), plantCount:ri(3,14),
    workDone:`Blinding and reinforcement fixing to Zone ${pick(['A','B','C'])}; ${ri(20,90)}m³ concrete placed; services first fix ongoing.`,
    delays:i%4===0?'Late delivery of rebar; mitigate by resequencing to Zone B.':'No delays recorded.',
    visitors:i%5===0?'Engineer’s site inspection; client progress visit.':'—', preparedBy:empRef(), status:i<2?'DRAFT':'APPROVED',
  });
  for(let i=0;i<8;i++) add('meetings',`mtg-${i+1}`,{
    name:`${pick(['Site progress meeting','Technical coordination','Safety committee','Commercial review']) } #${i+1}`,
    projectId:`${orgId}_prj-${(i%3)+1}`, date:off(-ri(2,90)), location:pick(['Site office','Client offices','MS Teams']),
    type:pick(['Site progress','Technical','Safety','Commercial','Client']), attendees:'PM, Client Rep, Engineer, QS, Site Agent, HSE Officer',
    agenda:'Progress, programme, RFIs, variations, HSE and commercial status.', minutes:'Programme reviewed; two-week lookahead issued; RFI 014 escalated.',
    actions:'QS to submit VO-007 by Friday; procurement to expedite cable trays.', chairedBy:`${orgId}_emp-2`, status:i<2?'SCHEDULED':'MINUTES_ISSUED',
  });
  for(let i=0;i<18;i++) add('punchLists',`pnc-${i+1}`,{
    name:pick(['Touch-up paint to corridor walls','Sealant missing at window frame','Loose ceiling tile','Door closer adjustment','Cracked floor tile','Incomplete fire-stopping','Signage not installed','Water stain on ceiling']),
    projectId:`${orgId}_prj-${(i%4)+1}`, location:`Level ${ri(1,5)} / ${pick(['Zone A','Zone B','Corridor','Lobby','Plant room'])}`,
    trade:pick(trades), assignedTo:`${orgId}_sub-${(i%8)+1}`, severity:pick(['MINOR','MAJOR','CRITICAL']), dueDate:off(ri(-20,45)),
    closedDate:i%3===0?off(-ri(1,20)):null, description:'Defect noted during joint inspection; rectify and notify for re-inspection.',
    status:pick(['OPEN','IN_PROGRESS','REWORK','REINSPECTION','CLOSED']),
  });
  for(let i=0;i<8;i++) add('permits',`pmt-${i+1}`,{
    name:pick(['Building permit – structural works','Environmental Impact Assessment approval','Road authority work permit','Electrical installation certificate','Fire compliance certificate','Occupation certificate']),
    projectId:`${orgId}_prj-${(i%4)+1}`, authority:pick(['City of Harare','EMA','ZINARA','ZETDC','Zimbabwe Republic Police']),
    type:pick(['Building permit','Environmental','Occupational','Road authority','Fire','Electrical']), referenceNo:`PER/${2026}/${ri(100,999)}`,
    issuedDate:off(-ri(30,300)), expiryDate:off(ri(-30,300)), inspectionDate:off(-ri(1,120)), result:pick(['PENDING','PASSED','CONDITIONAL']),
    conditions:'Conditions issued; compliance evidence to be submitted monthly.', status:pick(['ACTIVE','ACTIVE','EXPIRED','PENDING']),
  });

  // ---------- Procurement ----------
  for(let i=0;i<10;i++) add('requisitions',`mr-${i+1}`,{
    name:`${pick(['Cement 32.5R – 500 bags','Rebar Y16 – 12 tonnes','Electrical cable 4mm² – 2,000m','Concrete blocks – 8,000','Copper piping 22mm','Diesel 5,000 litres','Scaffold couplers – 600','Structural steel beams – 9t'])}`,
    projectId:`${orgId}_prj-${(i%3)+1}`, requestedBy:empRef(), requiredDate:off(ri(-30,45)), priority:pick(['LOW','MEDIUM','HIGH']),
    estimatedValue:money(1800,180000), items:'See attached BOQ extract.', justification:'Required for the current two-week lookahead.',
    status:pick(['DRAFT','SUBMITTED','APPROVED','ORDERED']),
  });
  const poIds:string[]=[];
  for(let i=0;i<16;i++){
    const amount=money(4200,420000);
    poIds.push(add('purchaseOrders',`po-${i+1}`,{
      name:`${pick(['Supply of structural steel','Cement delivery','Electrical materials','Plant hire – excavator','Diesel bulk supply','Formwork plywood','Plumbing fittings','HVAC equipment'])} – ${pick(['Batch 1','Batch 2','July call-off','Site direct'])}`,
      projectId:`${orgId}_prj-${(i%3)+1}`, vendorId:`${orgId}_ven-${(i%12)+1}`, requisitionId:`${orgId}_mr-${(i%10)+1}`,
      orderDate:off(-ri(5,180)), deliveryDate:off(ri(-40,60)), amount, currency:'USD', vatPct:15,
      items:`Qty ${ri(10,500)} @ ${Math.round(amount/ri(10,500))} USD`, approvedBy:`${orgId}_emp-2`,
      status:pick(['DRAFT','PENDING_APPROVAL','APPROVED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED']),
    }));
  }
  for(let i=0;i<10;i++) add('goodsReceipts',`grn-${i+1}`,{
    name:`Delivery against ${['PO-0001','PO-0003','PO-0005','PO-0007','PO-0009'][i%5]}`, projectId:`${orgId}_prj-${(i%3)+1}`,
    purchaseOrderId:`${orgId}_po-${(i%16)+1}`, vendorId:`${orgId}_ven-${(i%12)+1}`, receivedDate:off(-ri(2,150)),
    deliveryNote:`DN-${ri(1000,9999)}`, items:'Materials received in good order; quantities verified by storekeeper.',
    discrepancies:i%5===0?'2 bags damaged – vendor credit note requested.':'None', receivedBy:empRef(),
    status:pick(['RECEIVED','RECEIVED','PARTIAL','DISPUTED','ACCEPTED']),
  });
  const stockItems=[['Ordinary Portland Cement 32.5R','bag'],['Y16 High-yield Rebar','t'],['Y12 High-yield Rebar','t'],['Concrete blocks 200mm','each'],['Plywood formwork 18mm','m²'],['4mm² PVC cable','m'],['22mm copper pipe','m'],['Diesel','litre'],['Scaffold couplers','each'],['Structural steel IPE 300','t'],['Ceramic floor tiles 600×600','m²'],['Emulsion paint 20L','litre'],['Cable tray 300mm','m'],['Fire extinguisher 9kg','each'],['Safety helmets','each'],['Binding wire','kg'],['Gabion baskets','each'],['Bitumen AC10','t']];
  stockItems.forEach((s,i)=>{
    const qty=ri(0,3200), unit=money(2,900);
    add('inventory',`stk-${i+1}`,{ name:s[0], sku:`SKU-${String(4000+i)}`, warehouseId:`${orgId}_wh-${(i%2)+1}`, unit:s[1],
      quantityOnHand:qty, reorderLevel:ri(100,500), unitCost:unit, stockValue:qty*unit, lastCountDate:off(-ri(1,90)),
      vendorId:`${orgId}_ven-${(i%12)+1}`, status:qty===0?'OUT_OF_STOCK':qty<150?'LOW':'IN_STOCK',
    });
  });

  // ---------- HR operations ----------
  for(let i=0;i<40;i++){
    const reg=ri(38,48), ot=ri(0,12);
    add('timesheets',`ts-${i+1}`,{ name:`Week ${Math.floor(i/4)+1} – ${names[i%names.length].split(' ')[0]}`, employeeId:`${orgId}_emp-${(i%42)+1}`,
      projectId:`${orgId}_prj-${(i%3)+1}`, weekStart:off(-7*Math.floor(i/4)-7), weekEnd:off(-7*Math.floor(i/4)-1),
      regularHours:reg, overtimeHours:ot, totalHours:reg+ot, labourCost:(reg+ot)*ri(4,11), approvedBy:`${orgId}_emp-2`,
      notes:'Site hours verified by foreman.', status:pick(['APPROVED','APPROVED','SUBMITTED','POSTED']),
    });
  }
  for(let i=0;i<8;i++) add('leaveRequests',`lv-${i+1}`,{
    name:`Leave – ${names[i].split(' ')[0]} – ${off(-i*9)}`, employeeId:`${orgId}_emp-${i+1}`,
    leaveType:pick(['ANNUAL','SICK','COMPASSIONATE','UNPAID','STUDY']), startDate:off(-i*9), endDate:off(-i*9+ri(1,10)),
    days:ri(1,12), reason:'Annual leave as per roster.', approvedBy:`${orgId}_emp-4`, status:pick(['PENDING','APPROVED','APPROVED','REJECTED']),
  });
  for(let i=0;i<3;i++){
    const gross=money(280000,540000), ded=Math.round(gross*(0.28+rnd()*0.06));
    add('payRuns',`pay-${i+1}`,{ name:`${['September','October','November'][i]} 2026 payroll`, periodStart:off(-90+i*30), periodEnd:off(-61+i*30),
      headcount:ri(1050,1180), grossPay:gross, deductions:ded, netPay:gross-ded, currency:'USD', paymentDate:off(-55+i*30),
      preparedBy:`${orgId}_emp-4`, status:i===2?'DRAFT':i===1?'APPROVED':'PAID',
    });
  }
  for(let i=0;i<12;i++) add('expenses',`exp-${i+1}`,{
    name:`EXP-${2026}-${ri(100,999)} – ${names[i].split(' ')[0]}`, employeeId:`${orgId}_emp-${i+1}`, projectId:`${orgId}_prj-${(i%3)+1}`,
    category:pick(['Travel','Fuel','Accommodation','Meals','Materials','Petty cash','Tools']), expenseDate:off(-ri(1,90)),
    amount:money(20,1800), currency:'USD', description:'Site-related expense with receipt attached.', approvedBy:`${orgId}_emp-3`,
    status:pick(['DRAFT','SUBMITTED','APPROVED','REIMBURSED','REJECTED']),
  });
  const certTypes=['Trade test','Safety induction','First aid','Working at height','Confined space','Crane / rigging','Driver licence','Plant operator','Professional registration'];
  for(let i=0;i<16;i++) add('certifications',`cert-${i+1}`,{
    name:`${pick(certTypes)} – ${names[i].split(' ')[0]}`, employeeId:`${orgId}_emp-${i+1}`, type:certTypes[i%certTypes.length],
    issuingBody:pick(['NSSA','SAZ','Zimbabwe Institution of Engineers','Red Cross','Internal HSE']), referenceNo:`CERT-${ri(10000,99999)}`,
    issuedDate:off(-ri(200,1000)), expiryDate:off(ri(-40,300)), notes:'Copy on personnel file.',
    status:i<3?'EXPIRING':i===3?'EXPIRED':'VALID',
  });
  for(let i=0;i<8;i++) add('training',`trn-${i+1}`,{
    name:pick(['Site safety induction','Working at height refresher','First aid Level 1','Supervisory skills','ISO 45001 awareness','Concrete testing','Lifting & rigging','ERP system training']),
    type:pick(['Induction','HSE','Technical','Supervisory','Compliance','Software']), date:off(-ri(5,200)), provider:pick(['NSSA','Internal HSE','SAZ','External consultant']),
    attendees:`${ri(8,40)} site personnel`, attendeeCount:ri(8,40), cost:money(200,6500), outcome:pick(['COMPLETED','PASSED','FAILED']),
    status:pick(['COMPLETED','PLANNED','IN_PROGRESS']),
  });

  // ---------- HSE & quality ----------
  for(let i=0;i<10;i++) add('toolboxTalks',`tbt-${i+1}`,{
    name:pick(['Working at height','Excavation safety','Lifting operations','Electrical safety','PPE compliance','Hot work permits','Confined space entry','Housekeeping','Manual handling','Site traffic management']),
    projectId:`${orgId}_prj-${(i%3)+1}`, date:off(-ri(1,80)), type:pick(['Toolbox talk','JSA / JHA','Permit to work','LOTO','Hot work']),
    location:pick(['Zone A','Level 3','Plant yard','Road chainage 12+400']), presentedBy:`${orgId}_emp-5`, attendance:ri(8,45),
    hazards:'Overhead loads, uneven ground, moving plant, live services.', controls:'Exclusion zones, banksman, permits, pre-start checks and PPE.',
    status:pick(['HELD','SIGNED_OFF','SCHEDULED']),
  });
  const incidentTypes=['NEAR_MISS','FIRST_AID','MEDICAL_TREATMENT','LOST_TIME','ENVIRONMENTAL','PROPERTY_DAMAGE'];
  for(let i=0;i<6;i++) add('incidents',`inc-${i+1}`,{
    name:pick(['Struck by reversing plant','Minor laceration to hand','Diesel spill in plant yard','Fall from scaffold platform','Near miss – suspended load','Damage to boundary wall']),
    projectId:`${orgId}_prj-${(i%3)+1}`, dateTime:off(-ri(2,140)), type:incidentTypes[i], severity:pick(['LOW','MEDIUM','HIGH','CRITICAL']),
    location:pick(['Zone B','Access road','Plant yard','Level 2 slab']),
    description:'Incident reported immediately to site HSE; area secured and first aid / containment applied.',
    rootCause:i%2===0?'Inadequate exclusion zone and banksman coverage.':'Under investigation.',
    correctiveAction:'Toolbox talk delivered, method statement revised, additional banksman deployed.',
    lostDays:i===3?ri(3,14):0, reportedBy:`${orgId}_emp-5`, investigator:`${orgId}_emp-5`,
    status:pick(['REPORTED','UNDER_INVESTIGATION','ACTION_OPEN','CLOSED']),
  });
  for(let i=0;i<10;i++) add('inspections',`ins-${i+1}`,{
    name:pick(['Weekly site safety inspection','Scaffolding inspection','Electrical temporary supply audit','Environmental audit','Fire equipment check','Quality walkdown','ISO 45001 internal audit']),
    projectId:`${orgId}_prj-${(i%3)+1}`, date:off(-ri(1,120)), type:pick(['Site safety','Housekeeping','Scaffolding','Electrical','Fire','Environmental','Quality','ISO audit']),
    inspector:`${orgId}_emp-5`, findings:ri(0,9), score:ri(62,98), observations:'General compliance good; minor housekeeping items noted.',
    actions:'Close out findings within 7 days; re-inspect next cycle.', status:pick(['COMPLETED','ACTION_REQUIRED','CLOSED','SCHEDULED']),
  });
  for(let i=0;i<8;i++) add('ncrs',`ncr-${i+1}`,{
    name:pick(['Concrete cover below specification','Incorrect rebar spacing','Unapproved material substitution','Incomplete weld documentation','Damaged waterproofing membrane','Missing test certificate']),
    projectId:`${orgId}_prj-${(i%3)+1}`, raisedDate:off(-ri(2,100)), category:pick(['Workmanship','Material','Design','Documentation','Testing','Supplier']),
    severity:pick(['MINOR','MAJOR','CRITICAL']), raisedBy:`${orgId}_emp-2`, assignedTo:`${orgId}_sub-${(i%8)+1}`,
    description:'Non-conformance raised during inspection against approved ITP.', correctiveAction:'Rework, re-inspect and submit revised method statement.',
    closeDate:i%3===0?off(-ri(1,20)):null, status:pick(['OPEN','INVESTIGATING','REWORK','CLOSED']),
  });
  for(let i=0;i<8;i++) add('itps',`itp-${i+1}`,{
    name:pick(['Concrete pour – Level 2 slab','Structural steel weld test','HDPE pressure test','Electrical insulation test','Fire alarm commissioning','Material approval – tiles','Pile integrity test']),
    projectId:`${orgId}_prj-${(i%3)+1}`, discipline:pick(['Mechanical','Electrical','Instrumentation','Process','Civil']),
    type:pick(['Concrete pour','Steel / weld','NDT','Pressure test','Electrical test','Commissioning','Material approval']),
    plannedDate:off(ri(-30,60)), testDate:i%2===0?off(-ri(1,40)):null, result:pick(['PENDING','PASS','FAIL','CONDITIONAL']),
    witnessedBy:`${orgId}_con-${(i%10)+1}`, testResults:'Cube results and test certificates attached to quality file.',
    status:pick(['DRAFT','AWAITING','IN_PROGRESS','ACCEPTED','REJECTED']),
  });

  // ---------- Finance ----------
  const accountsDefs=[
    ['Land & buildings','1000','ASSET'],['Plant & equipment','1100','ASSET'],['Trade debtors','1200','ASSET'],['Inventory / stores','1300','ASSET'],['Bank – CBZ USD','1400','ASSET'],['Bank – ZWG operations','1410','ASSET'],
    ['Retention receivable','1500','ASSET'],['Trade creditors','2000','LIABILITY'],['VAT control','2100','LIABILITY'],['PAYE / NSSA payable','2200','LIABILITY'],['Retention payable','2300','LIABILITY'],['Share capital','3000','EQUITY'],['Retained earnings','3100','EQUITY'],
    ['Contract revenue','4000','REVENUE'],['Variation revenue','4100','REVENUE'],['Labour – direct','5000','DIRECT_COST'],['Materials – direct','5100','DIRECT_COST'],['Plant & fuel','5200','DIRECT_COST'],['Subcontract costs','5300','DIRECT_COST'],
    ['Site preliminaries','5400','INDIRECT_COST'],['Head office overheads','6000','EXPENSE'],['Salaries & wages','6100','EXPENSE'],['Insurance','6200','EXPENSE'],['Professional fees','6300','EXPENSE'],
  ];
  accountsDefs.forEach((a,i)=>add('accounts',`acc-${i+1}`,{
    name:a[0], code:a[1], type:a[2], category:pick(['Labour','Materials','Plant','Subcontract','Overhead','Sales','Debtors','Creditors','Bank','Tax','Other']),
    openingBalance:money(0,900000), balance:money(10000,4800000), isCostCode:Number(a[1])>=5000, status:i===23?'DORMANT':'ACTIVE',
  }));
  for(let i=0;i<12;i++){
    const amt=money(4000,280000);
    add('journals',`jnl-${i+1}`,{ name:pick(['Monthly cost allocation','Accrual – subcontract certificates','VAT control posting','Payroll allocation to projects','Plant hire recharge','Materials issue to WBS']),
      date:off(-ri(5,180)), period:pick(['2026-08','2026-09','2026-10','2026-11']), accountId:`${orgId}_acc-${ri(1,accountsDefs.length)}`,
      projectId:`${orgId}_prj-${(i%3)+1}`, debit:amt, credit:amt, currency:'USD', narration:'Posted by finance after supporting documents verified.',
      preparedBy:`${orgId}_emp-3`, status:pick(['POSTED','POSTED','DRAFT']),
    });
  }
  for(let i=0;i<15;i++){
    const ob=money(180000,4200000), actual=Math.round(ob*(0.25+rnd()*0.8));
    add('budgets',`bud-${i+1}`,{ name:`${pick(['Labour','Materials','Plant','Subcontract','Preliminaries','Contingency'])} – WBS ${ri(1,9)}.${ri(1,6)}`,
      projectId:`${orgId}_prj-${(i%3)+1}`, costCode:`${ri(5000,5900)}`, category:pick(['Labour','Materials','Plant','Subcontract','Preliminaries','Overhead','Contingency']),
      originalBudget:ob, approvedVariations:money(0,180000), committed:Math.round(ob*(0.6+rnd()*0.45)), actualToDate:actual,
      forecastToComplete:Math.round(ob*(0.9+rnd()*0.35)), variancePct:Math.round((actual/ob-1)*100), status:pick(['APPROVED','REVISED','DRAFT']),
    });
  }
  for(let i=0;i<14;i++){
    const net=money(45000,1450000), vat=Math.round(net*0.15);
    add('arInvoices',`inv-${i+1}`,{ name:`${pick(['Interim certificate','Materials invoice','Variation invoice','Final account installment'])} – ${projectDefs[i%4][0].slice(0,24)}`,
      projectId:`${orgId}_prj-${(i%4)+1}`, clientId:`${orgId}_cli-${(i%9)+1}`, invoiceDate:off(-ri(5,200)), dueDate:off(ri(-40,45)),
      amount:net, vatPct:15, vatAmount:vat, total:net+vat, amountPaid:i%3===0?net+vat:i%4===0?Math.round(net/2):0,
      currency:'USD', taxInvoiceNo:`TI-${2026}-${ri(1000,9999)}`, status:pick(['ISSUED','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','DRAFT']),
    });
  }
  for(let i=0;i<8;i++){
    const gross=money(300000,3200000), ret=Math.round(gross*0.1), adv=Math.round(gross*0.05);
    add('paymentApps',`pc-${i+1}`,{ name:`Payment Certificate ${String(i+1).padStart(2,'0')} – ${projectDefs[i%3][0].slice(0,22)}`,
      projectId:`${orgId}_prj-${(i%3)+1}`, clientId:`${orgId}_cli-${(i%9)+1}`, certificateNo:i+1, periodEnd:off(-ri(5,180)),
      workValue:gross, variationsValue:money(0,240000), previousCertified:i*money(200000,600000), grossCertified:gross,
      retentionHeld:ret, advanceRecoupment:adv, netCertified:gross-ret-adv, vatAmount:Math.round((gross-ret-adv)*0.15),
      certifiedBy:`${orgId}_con-${(i%10)+1}`, status:pick(['DRAFT','SUBMITTED','CERTIFIED','CERTIFIED','PARTIALLY_PAID','PAID']),
    });
  }
  for(let i=0;i<16;i++){
    const net=money(2500,320000), vat=Math.round(net*0.15);
    add('apBills',`bill-${i+1}`,{ name:`${pick(['Cement supply','Steel delivery','Plant hire','Electrical materials','Diesel','Subcontract certificate','Transport'])} – ${vendorNames[i%12].slice(0,20)}`,
      projectId:`${orgId}_prj-${(i%3)+1}`, vendorId:`${orgId}_ven-${(i%12)+1}`, purchaseOrderId:`${orgId}_po-${(i%16)+1}`,
      vendorInvoiceNo:`VI-${ri(10000,99999)}`, billDate:off(-ri(3,180)), dueDate:off(ri(-40,50)),
      amount:net, vatAmount:vat, total:net+vat, amountPaid:i%3===0?net+vat:0, currency:'USD',
      status:pick(['DRAFT','ISSUED','ISSUED','PARTIALLY_PAID','PAID','OVERDUE']),
    });
  }
  for(let i=0;i<14;i++) add('payments',`pym-${i+1}`,{
    name:`${i%2===0?'Client receipt':'Supplier payment'} ${String(i+1).padStart(3,'0')}`,
    direction:i%2===0?'RECEIPT':'PAYMENT', clientId:i%2===0?`${orgId}_cli-${(i%9)+1}`:null, vendorId:i%2===0?null:`${orgId}_ven-${(i%12)+1}`,
    projectId:`${orgId}_prj-${(i%3)+1}`, paymentDate:off(-ri(2,170)), amount:money(8000,980000),
    method:pick(['Bank transfer','RTGS','Mobile money','Cheque']), bankAccount:i%2===0?'CBZ USD 0112-445566':'CBZ ZWG 0112-778899',
    reference:`BANK-${ri(100000,999999)}`, currency:'USD', status:pick(['CLEARED','CLEARED','RECONCILED','PENDING']),
  });

  // ---------- Specialised modules ----------
  for(let i=0;i<10;i++) add('units',`un-${i+1}`,{
    name:`Unit ${String(i+1).padStart(3,'0')} – ${pick(['North Block','South Block','Garden Wing'])}`, projectId:`${orgId}_prj-1`, block:pick(['A','B','C']),
    type:pick(['Office suite','Apartment','Townhouse','Retail unit']), area:ri(48,420), askingPrice:money(85000,780000),
    salePrice:i<4?money(85000,780000):null, buyer:i<4?pick(names):null, reservationDate:i<6?off(-ri(10,200)):null,
    handoverDate:i<2?off(-ri(1,90)):null, warrantyExpiry:i<2?off(ri(100,600)):null,
    status:i<2?'HANDED_OVER':i<4?'SOLD':i<6?'RESERVED':'AVAILABLE',
  });
  for(let i=0;i<6;i++) add('rentalContracts',`rnt-${i+1}`,{
    name:`Plant hire agreement R-${2026}-${ri(100,999)}`, clientId:`${orgId}_cli-${(i%9)+1}`, equipmentId:`${orgId}_eq-${(i%28)+1}`,
    projectId:`${orgId}_prj-${(i%3)+1}`, startDate:off(-ri(10,150)), endDate:off(ri(10,120)), rateBasis:pick(['PER_HOUR','PER_DAY','PER_WEEK','PER_MONTH']),
    rate:money(80,9500), hoursUsed:ri(20,900), totalBilled:money(4000,240000), status:pick(['ACTIVE','ACTIVE','RETURNED','INVOICED','CLOSED']),
  });
  for(let i=0;i<6;i++) add('commissioning',`com-${i+1}`,{
    name:pick(['Steam boiler system','Process water loop','MV distribution board','Compressed air network','Effluent treatment plant','Fire & gas detection system']),
    projectId:`${orgId}_prj-2`, systemCode:`SYS-${ri(100,999)}`, discipline:pick(['Mechanical','Electrical','Instrumentation','Process','HVAC']),
    plannedDate:off(ri(-20,160)), achievedDate:i<2?off(-ri(1,40)):null, status2:pick(['NOT_STARTED','PRE_COMMISSIONING','TESTING','READY_FOR_STARTUP']),
    leadEngineer:empRef(), testPacks:'Test packs TP-01 to TP-14 with signed check sheets.', status:pick(['PLANNED','IN_PROGRESS','COMPLETE','HANDED_OVER']),
  });

  // ---------- Notifications / audit / comments ----------
  const notifications = [
    ['Change order awaiting approval','VO-007 submitted for Borrowdale Corporate Park – Phase 2','WARNING','/m/changeOrders'],
    ['Certification expiring','3 competency certificates expire within 30 days','WARNING','/m/certifications'],
    ['Overdue RFI','RFI-0011 passed its due date on Pomona Industrial Plant Expansion','ALERT','/m/rfis'],
    ['Low stock alert','4 store items are below reorder level','WARNING','/m/inventory'],
    ['Payment received','Client receipt cleared for TI-2026-4412','SUCCESS','/m/payments'],
    ['Incident closed','Corrective actions verified for INC-0003','SUCCESS','/m/incidents'],
    ['Timesheet approval','6 timesheets are waiting for your approval','INFO','/m/timesheets'],
    ['New bid invited','Tender documents available for Chitungwiza Trunk Sewer','INFO','/m/leads'],
    ['Service due','5 plant assets have maintenance due this month','WARNING','/m/equipment'],
    ['Toolbox talk scheduled','Working at height session at Borrowdale site tomorrow','INFO','/m/toolboxTalks'],
    ['Permit expiring','Road authority work permit expires in 14 days','WARNING','/m/permits'],
    ['Monthly report ready','October 2026 CVR report is available','INFO','/reports'],
  ].map((n,i)=>({ organizationId:orgId, title:n[0], body:n[1], kind:n[2], href:n[3], read:i>7, createdAt:new Date(BASE.getTime()-i*ri(3,14)*3600000) }));
  const auditActions = [
    ['Tendai Muchengeti','APPROVE','changeOrders','Approved change order VO-006 (USD 184,000)'],
    ['Farai Nyamayaro','CREATE','arInvoices','Issued tax invoice TI-2026-4412'],
    ['Rutendo Chikomba','UPDATE','projects','Updated progress on Pomona Industrial Plant Expansion to 34%'],
    ['Bright Moyo','CREATE','incidents','Logged near miss at Borrowdale site'],
    ['Kudzai Mapfumo','CREATE','purchaseOrders','Raised PO-0014 for structural steel'],
    ['Nomsa Dube','UPDATE','leaveRequests','Approved annual leave for Simbarashe Gono'],
    ['Farai Nyamayaro','POST','journals','Posted October 2026 cost allocation journal'],
    ['Rutendo Chikomba','CREATE','rfis','Raised RFI-0016 – structural opening at Grid C/4'],
    ['Tendai Muchengeti','UPDATE','contracts','Executed subcontract with Vantage Mechanical'],
    ['Bright Moyo','CREATE','toolboxTalks','Recorded working-at-height toolbox talk'],
    ['Kudzai Mapfumo','CREATE','goodsReceipts','Received delivery DN-4481'],
    ['Nomsa Dube','CREATE','employees','Onboarded Shelter Mpofu as Site Engineer'],
    ['Farai Nyamayaro','CREATE','paymentApps','Submitted Payment Certificate 08'],
    ['Rutendo Chikomba','UPDATE','tasks','Marked piling and foundations complete'],
    ['Bright Moyo','CREATE','inspections','Completed weekly site safety inspection (92%)'],
    ['Tendai Muchengeti','CREATE','bids','Submitted tender T/2026/441'],
  ].map((a,i)=>({ organizationId:orgId, actor:a[0], action:a[1], resource:a[2], detail:a[3], createdAt:new Date(BASE.getTime()-i*ri(2,9)*3600000) }));
  const comments = [
    ['rfi-1','Rutendo Chikomba','Escalated to the structural consultant — response needed before the pour.'],
    ['rfi-2','Farai Nyamayaro','Any cost impact must be captured in the next variation.'],
    ['co-1','Tendai Muchengeti','Approved, please include in Certificate 09.'],
    ['co-2','Rutendo Chikomba','Revised quantities attached, QS to verify.'],
    ['inc-1','Bright Moyo','Toolbox talk delivered to all crews on 14 October.'],
    ['po-1','Kudzai Mapfumo','Delivery split into two batches; GRN raised for batch 1.'],
    ['inv-1','Farai Nyamayaro','Reminder sent to client accounts on 3 November.'],
  ].map(c=>({ organizationId:orgId, recordId:`${orgId}_${c[0]}`, authorName:c[1], body:c[2], createdAt:new Date(BASE.getTime()-ri(1,80)*86400000) }));

  return { records, notifications, auditLogs:auditActions, comments };
}
