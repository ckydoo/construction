/* Declarative resource registry: one definition drives the API, list table, form,
   validation, filtering, CSV export, seed generation and command palette. */
import { MODULES, type WorkspaceConfig } from './catalog';

export type FieldType = 'text'|'textarea'|'number'|'currency'|'percent'|'date'|'datetime'|'select'|'ref'|'boolean'|'email'|'phone'|'tags'|'items';
export type Field = {
  key: string; label: string; type: FieldType; required?: boolean; options?: string[];
  ref?: string; placeholder?: string; defaultValue?: unknown; hint?: string; wide?: boolean;
  /** Derived from another module — never editable through the generic form. */ readOnly?: boolean;
  /** Stored in data but never shown in forms, detail panels, PDFs or CSV. */ hidden?: boolean;
};
export type ResourceDef = {
  id: string; label: string; singular: string; module: string; group: string; icon: string;
  prefix: string; titleKey: string; description: string; fields: Field[]; columns: string[];
  statusOptions?: string[]; projectScoped?: boolean; amountKey?: string; dateKey?: string;
};

const T=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'text',...o});
const A=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'textarea',wide:true,...o});
const N=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'number',...o});
const C=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'currency',...o});
const P=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'percent',...o});
const D=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'date',...o});
const S=(k:string,l:string,options:string[],o:Partial<Field>={}):Field=>({key:k,label:l,type:'select',options,...o});
const R=(k:string,l:string,ref:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'ref',ref,...o});
const B=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'boolean',...o});
const E=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'email',...o});
const PH=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'phone',...o});
const TG=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'tags',...o});
const IT=(k:string,l:string,o:Partial<Field>={}):Field=>({key:k,label:l,type:'items',wide:true,...o});
/* Hidden provenance written by the Convert to… flow. Declared as fields so
   createRecord()/updateRecord() preserve them across later edits. */
const CONV=():Field[]=>[
  T('sourceResource','Converted from resource',{hidden:true}),
  T('sourceId','Converted from record id',{hidden:true}),
  T('sourceNumber','Converted from number',{hidden:true}),
  T('sourceLabel','Converted from label',{hidden:true}),
];
const STS=(o:string[],d?:string)=>S('status','Status',o,{defaultValue:d||o[0]});
const PRJ=(req=false)=>R('projectId','Job / project','projects',{required:req});

export const CURRENCIES = ['USD','ZWG','ZAR','EUR','GBP'];
export const CLIENT_TYPES = ['Private developer','Parastatal / Government','Industrial','Mining','Commercial','Residential','NGO','Other'];
export const PROJECT_TYPES = ['Commercial building','Industrial plant','Civil / roads','Infrastructure','Residential estate','Fit-out / refurb','Mining','Energy','Water & utilities'];
export const PROJECT_STATUSES = ['BID','PLANNING','ACTIVE','ON_HOLD','COMPLETED','CLOSED'];
export const PRIORITIES = ['LOW','MEDIUM','HIGH','CRITICAL'];
export const APPROVAL = ['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','CLOSED'];
export const PO_STATUSES = ['DRAFT','PENDING_APPROVAL','APPROVED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'];
export const INVOICE_STATUSES = ['DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','VOID'];
export const EMPLOYEE_STATUS = ['ACTIVE','ON_LEAVE','SUSPENDED','TERMINATED'];
export const DEPARTMENTS = ['Projects','Engineering','Commercial / QS','Finance','HR & Admin','Procurement','HSE','Plant & Equipment','Site Operations','Estimating'];
export const TRADES = ['General labour','Carpentry','Masonry','Steel fixing','Electrical','Mechanical','Plumbing','HVAC','Welding','Plant operation','Surveying','Concrete','Painting','Roofing'];
export const CONTRACT_FLAVOURS = ['FIDIC Red Book','FIDIC Silver Book (EPC)','NEC4 ECC','JBCC','AIA A201','Bespoke / client standard'];

const d = (
  id:string,label:string,singular:string,module:string,group:string,icon:string,prefix:string,titleKey:string,
  description:string,fields:Field[],columns:string[],extra:Partial<ResourceDef>={}
):ResourceDef=>({id,label,singular,module,group,icon,prefix,titleKey,description,fields,columns,...extra});

export const RESOURCES: ResourceDef[] = [
  // ---------------- WIN WORK ----------------
  d('clients','Clients','Client','crm','Clients & quotes','Handshake','CLI','name',
    'Client companies, their contacts, credit terms and relationship history.',
    [T('name','Company name',{required:true,placeholder:'e.g. Westgate Properties (Pvt) Ltd'}),S('type','Client type',CLIENT_TYPES),T('registrationNo','Company reg. / CR14 no.'),T('industry','Industry'),E('email','Accounts email'),PH('phone','Phone / mobile'),T('city','City / town'),T('address','Physical address',{wide:true}),R('accountManager','Account manager','employees'),C('creditLimit','Credit limit'),N('paymentTerms','Payment terms (days)',{defaultValue:30}),C('walletBalance','Wallet balance',{readOnly:true,hint:'Derived from the client wallet ledger'}),TG('tags','Tags'),STS(['ACTIVE','PROSPECT','INACTIVE','BLACKLISTED'],'ACTIVE')],
    ['number','name','type','city','creditLimit','walletBalance','status'],{statusOptions:['ACTIVE','PROSPECT','INACTIVE','BLACKLISTED'],amountKey:'creditLimit'}),

  d('contacts','Contacts','Contact','crm','Clients & quotes','Contact','CON','name',
    'People at client, consultant and authority organisations.',
    [T('name','Full name',{required:true}),R('clientId','Client','clients'),T('jobTitle','Job title'),E('email','Email'),PH('phone','Phone / mobile'),PH('mobile','Mobile'),S('category','Category',['Client','Consultant','Authority','Contractor','Other']),A('notes','Notes')],
    ['number','name','clientId','jobTitle','email','phone','category']),

  d('leads','Enquiries & leads','Enquiry','pipeline','Clients & quotes','Target','OPP','name',
    'Bid pipeline with probability, expected value and win/loss tracking.',
    [T('name','Opportunity',{required:true}),R('clientId','Client','clients'),S('stage','Stage',['IDENTIFIED','QUALIFIED','BID_PREP','SUBMITTED','NEGOTIATION','WON','LOST']),C('value','Estimated value'),P('probability','Win probability (%)'),S('workType','Work type',PROJECT_TYPES),D('dueDate','Tender / decision date'),R('owner','Opportunity owner','employees'),S('source','Source',['Tender portal','Referral','Repeat client','Direct approach','Public advert']),A('notes','Notes'),STS(['OPEN','ON_HOLD','WON','LOST'],'OPEN'),...CONV()],
    ['number','name','clientId','stage','value','probability','dueDate','status'],{statusOptions:['OPEN','ON_HOLD','WON','LOST'],amountKey:'value',dateKey:'dueDate'}),

  d('estimates','Quotes & estimates','Quote','estimating','Clients & quotes','Calculator','EST','name',
    'Cost estimates with labour, material, plant, markup and revision history.',
    [T('name','Estimate title',{required:true}),R('clientId','Client','clients'),R('leadId','Opportunity','leads'),S('workType','Work type',PROJECT_TYPES),C('labourCost','Labour cost'),C('materialCost','Material cost'),C('plantCost','Plant & equipment'),C('subcontractCost','Subcontract cost'),C('overheads','Overheads'),P('markup','Markup (%)'),C('total','Bid total'),N('revision','Revision',{defaultValue:0}),D('submittedDate','Submitted'),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),A('scope','Scope & exclusions'),IT('items','Itemised lines'),STS(['DRAFT','INTERNAL_REVIEW','SUBMITTED','AWARDED','LOST','ARCHIVED'],'DRAFT'),...CONV()],
    ['number','name','clientId','total','markup','revision','submittedDate','status'],{statusOptions:['DRAFT','INTERNAL_REVIEW','SUBMITTED','AWARDED','LOST','ARCHIVED'],amountKey:'total',dateKey:'submittedDate'}),

  d('bids','Tenders & bids','Tender','estimating','Clients & quotes','FileText','BID','name',
    'Tender submissions, addenda, bond requirements and outcomes.',
    [T('name','Tender name',{required:true}),R('clientId','Client','clients'),T('tenderNo','Tender number'),C('bidValue','Bid value'),D('closingDate','Closing date'),S('contractFlavour','Contract form',CONTRACT_FLAVOURS),C('bidBond','Bid bond / security'),S('outcome','Outcome',['PENDING','AWARDED','LOST','WITHDRAWN','DISQUALIFIED']),R('estimator','Estimator','employees'),A('notes','Notes'),IT('items','Itemised lines'),...CONV()],
    ['number','name','clientId','bidValue','closingDate','outcome'],{amountKey:'bidValue',dateKey:'closingDate'}),

  // ---------------- PROJECT DELIVERY ----------------
  d('projects','Jobs & projects','Job','projects','Jobs & sites','HardHat','PRJ','name',
    'Project portfolio: contract value, programme, budget, team and health.',
    [T('name','Project name',{required:true,placeholder:'e.g. Borrowdale Corporate Park – Phase 2'}),T('code','Project code'),R('clientId','Client','clients'),S('type','Project type',PROJECT_TYPES),S('contractFlavour','Contract form',CONTRACT_FLAVOURS),T('location','Site location'),C('contractValue','Contract value'),C('proposedEstimateCost','Proposed estimate cost',{hint:'Copied from the quote as a proposal; this is not an approved budget.'}),C('budget','Approved budget'),C('costToDate','Cost to date'),C('fundedAmount','Funded from client wallet',{readOnly:true,hint:'Sum of active wallet allocations'}),C('remainingToFund','Remaining to fund',{readOnly:true}),P('progress','Physical progress (%)'),D('startDate','Start date'),D('endDate','Planned completion'),D('actualCompletion','Actual completion'),R('manager','Project manager','employees'),S('health','Health',['ON_TRACK','AT_RISK','DELAYED','ON_HOLD']),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),A('scope','Scope of works'),STS(PROJECT_STATUSES,'ACTIVE'),...CONV()],
    ['number','name','code','clientId','type','contractValue','progress','health','status'],{statusOptions:PROJECT_STATUSES,amountKey:'contractValue',dateKey:'startDate'}),

  d('tasks','Job tasks & programme','Task','projects','Jobs & sites','ListTodo','TSK','name',
    'Work breakdown schedule items, milestones, dependencies and progress.',
    [T('name','Task / work item',{required:true}),PRJ(true),S('wbsLevel','Level',['Phase','Work package','Activity','Milestone']),T('wbsCode','Work item code'),R('parentId','Parent task','tasks'),D('plannedStart','Planned start'),D('plannedEnd','Planned finish'),D('actualStart','Actual start'),D('actualEnd','Actual finish'),N('duration','Duration (days)'),P('progress','Progress (%)'),R('assignedTo','Assigned to','employees'),T('predecessor','Predecessor'),S('priority','Priority',PRIORITIES),STS(['NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETE','CANCELLED'],'NOT_STARTED')],
    ['number','name','projectId','wbsCode','plannedEnd','progress','priority','status'],{projectScoped:true,statusOptions:['NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETE','CANCELLED'],dateKey:'plannedEnd'}),

  d('contracts','Contracts','Contract','contracts','Jobs & sites','FileSignature','CTR','name',
    'Prime contracts, subcontracts and employer agreements.',
    [T('name','Contract title',{required:true}),PRJ(true),R('clientId','Client','clients'),R('counterparty','Counterparty','subcontractors'),S('kind','Contract kind',['Prime contract','Subcontract','Consultancy','Supply agreement','Framework / call-off']),S('contractFlavour','Contract form',CONTRACT_FLAVOURS),C('value','Contract sum'),D('signedDate','Signed date'),D('completionDate','Completion date'),P('retentionPct','Retention (%)'),N('defectsPeriod','Defects period (months)'),T('insuranceRef','Insurance / bond ref'),IT('items','Itemised lines'),STS(['DRAFT','ACTIVE','VARIED','COMPLETED','TERMINATED'],'ACTIVE'),...CONV()],
    ['number','name','projectId','kind','value','signedDate','status'],{projectScoped:true,statusOptions:['DRAFT','ACTIVE','VARIED','COMPLETED','TERMINATED'],amountKey:'value',dateKey:'signedDate'}),

  d('changeOrders','Variations & extras','Variation','contracts','Jobs & sites','GitPullRequestArrow','CO','name',
    'Variations, extensions of time and their approval chain.',
    [T('name','Variation description',{required:true}),PRJ(true),T('reference','Instruction / variation ref'),S('reason','Reason',['Client change','Design change','Site condition','Statutory requirement','Scope gap','Force majeure']),C('amount','Value'),N('timeExtension','Extra time (days)'),D('submittedDate','Submitted'),D('decisionDate','Decision date'),R('requestedBy','Requested by','contacts'),R('approvedBy','Approved by','employees'),A('justification','Justification'),IT('items','Itemised lines'),STS(['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','INCLUDED_IN_CERT'],'DRAFT')],
    ['number','name','projectId','reference','amount','submittedDate','status'],{projectScoped:true,statusOptions:['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','INCLUDED_IN_CERT'],amountKey:'amount',dateKey:'submittedDate'}),

  d('rfis','Site queries','Site query','projectComms','Jobs & sites','MessageCircleQuestion','RFI','subject',
    'Questions from site, who must answer, due dates and the replies.',
    [T('subject','Subject',{required:true}),PRJ(true),T('specRef','Spec / drawing ref'),S('discipline','Discipline',['Architectural','Structural','Civil','Mechanical','Electrical','Plumbing','HVAC','Other']),S('priority','Priority',PRIORITIES),R('raisedBy','Raised by','employees'),R('addressedTo','Addressed to','contacts'),D('dueDate','Due date'),D('answeredDate','Answered date'),A('question','Question'),A('response','Response'),STS(['OPEN','ANSWERED','CLOSED','OVERDUE'],'OPEN')],
    ['number','subject','projectId','discipline','priority','dueDate','status'],{projectScoped:true,statusOptions:['OPEN','ANSWERED','CLOSED','OVERDUE'],dateKey:'dueDate'}),

  d('submittals','Drawing approvals','Approval package','projectComms','Jobs & sites','Send','SUB','name',
    'Shop drawings and material samples sent for a decision.',
    [T('name','Approval title',{required:true}),PRJ(true),T('package','Package'),S('type','Type',['Shop drawing','Material sample','Technical data','Method statement','Mock-up','Certificate']),R('submittedBy','Submitted by','subcontractors'),D('submittedDate','Submitted'),D('requiredDate','Required by'),D('returnedDate','Returned'),A('reviewNotes','Review notes'),STS(['PENDING','UNDER_REVIEW','APPROVED','APPROVE_AS_NOTED','REJECTED','RESUBMIT'],'PENDING')],
    ['number','name','projectId','type','submittedDate','status'],{projectScoped:true,statusOptions:['PENDING','UNDER_REVIEW','APPROVED','APPROVE_AS_NOTED','REJECTED','RESUBMIT'],dateKey:'submittedDate'}),

  d('documents','Document register','Drawing / document','documents','Jobs & sites','FolderOpen','DOC','name',
    'Drawing numbers, revisions and issue status. Files live in the Document library.',
    [T('name','Document / drawing title',{required:true}),PRJ(),T('drawingNo','Drawing / doc no.'),T('revision','Revision'),S('type','Type',['Drawing','Specification','Method statement','Report','Contract','Correspondence','Photo set','O&M manual','Other']),S('discipline','Discipline',['Architectural','Structural','Civil','Mechanical','Electrical','HSE','Commercial','Other']),T('fileName','File name'),D('issuedDate','Issue date'),R('issuedBy','Issued by','employees'),A('notes','Notes'),STS(['DRAFT','FOR_REVIEW','CURRENT','SUPERSEDED','VOID'],'CURRENT')],
    ['number','name','drawingNo','revision','type','projectId','issuedDate','status'],{projectScoped:true,statusOptions:['DRAFT','FOR_REVIEW','CURRENT','SUPERSEDED','VOID'],dateKey:'issuedDate'}),

  d('dailyLogs','Site diaries','Site diary','fieldOps','Jobs & sites','NotebookPen','DL','name',
    'Daily site diary: weather, manpower, plant, progress and delays.',
    [T('name','Log title',{required:true}),PRJ(true),D('date','Date',{required:true}),S('weather','Weather',['Sunny','Cloudy','Rain','Heavy rain','Windy','Hot']),N('temperature','Temp (°C)'),N('manpower','Labour on site'),N('plantCount','Plant units'),A('workDone','Work carried out'),A('delays','Delays / constraints'),A('visitors','Visitors & inspections'),R('preparedBy','Prepared by','employees'),STS(['DRAFT','SUBMITTED','APPROVED'],'SUBMITTED')],
    ['number','name','projectId','date','weather','manpower','status'],{projectScoped:true,statusOptions:['DRAFT','SUBMITTED','APPROVED'],dateKey:'date'}),

  d('meetings','Site meetings','Meeting','fieldOps','Jobs & sites','Users','MTG','name',
    'Site and progress meetings with action items.',
    [T('name','Meeting title',{required:true}),PRJ(),D('date','Date'),T('location','Location'),S('type','Type',['Site progress','Technical','Safety','Commercial','Client','Internal']),A('attendees','Attendees'),A('agenda','Agenda'),A('minutes','Minutes'),A('actions','Action items'),R('chairedBy','Chaired by','employees'),STS(['SCHEDULED','HELD','MINUTES_ISSUED','CLOSED'],'MINUTES_ISSUED')],
    ['number','name','projectId','date','type','status'],{projectScoped:true,statusOptions:['SCHEDULED','HELD','MINUTES_ISSUED','CLOSED'],dateKey:'date'}),

  d('punchLists','Snag lists','Snag item','closeout','Jobs & sites','ListChecks','PNC','name',
    'Snagging / defects items through to re-inspection and sign-off.',
    [T('name','Defect / item',{required:true}),PRJ(true),T('location','Location / unit'),S('trade','Trade',TRADES),R('assignedTo','Assigned to','subcontractors'),S('severity','Severity',['MINOR','MAJOR','CRITICAL']),D('dueDate','Due date'),D('closedDate','Closed date'),A('description','Description'),STS(['OPEN','IN_PROGRESS','REWORK','REINSPECTION','CLOSED'],'OPEN')],
    ['number','name','projectId','trade','severity','dueDate','status'],{projectScoped:true,statusOptions:['OPEN','IN_PROGRESS','REWORK','REINSPECTION','CLOSED'],dateKey:'dueDate'}),

  d('permits','Permits & inspections','Permit','closeout','Jobs & sites','Stamp','PMT','name',
    'Authority permits, statutory inspections and expiry tracking.',
    [T('name','Permit / inspection',{required:true}),PRJ(),T('authority','Authority'),S('type','Type',['Building permit','Environmental','Occupational','Road authority','Fire','Electrical','Lift','Work permit','Other']),T('referenceNo','Reference no.'),D('issuedDate','Issued'),D('expiryDate','Expiry'),D('inspectionDate','Inspection date'),S('result','Result',['PENDING','PASSED','CONDITIONAL','FAILED']),A('conditions','Conditions'),STS(['PENDING','ACTIVE','EXPIRED','CLOSED'],'ACTIVE')],
    ['number','name','projectId','authority','expiryDate','result','status'],{projectScoped:true,statusOptions:['PENDING','ACTIVE','EXPIRED','CLOSED'],dateKey:'expiryDate'}),

  // ---------------- SUPPLY CHAIN ----------------
  d('vendors','Suppliers','Supplier','vendors','Materials & suppliers','Store','VEN','name',
    'Approved suppliers with compliance documents and performance ratings.',
    [T('name','Vendor name',{required:true}),S('category','Category',['Building materials','Cement & aggregates','Steel & rebar','Electrical','Mechanical','Plant hire','Fuel','Transport','IT & office','Services','Other']),T('registrationNo','Company reg. / CR14 no.'),E('email','Email'),PH('phone','Phone / mobile'),T('city','City / town'),T('contactPerson','Contact person'),N('paymentTerms','Payment terms (days)',{defaultValue:30}),D('complianceExpiry','Compliance expiry'),N('rating','Supplier rating (1–5)'),TG('tags','Tags'),STS(['PREFERRED','ACTIVE','UNDER_REVIEW','SUSPENDED','BLACKLISTED'],'ACTIVE')],
    ['number','name','category','city','phone','rating','status'],{statusOptions:['PREFERRED','ACTIVE','UNDER_REVIEW','SUSPENDED','BLACKLISTED'],dateKey:'complianceExpiry'}),

  d('subcontractors','Subcontractors','Subcontractor','vendors','Materials & suppliers','HardHat','SC','name',
    'Trade subcontractors, prequalification and compliance tracking.',
    [T('name','Company name',{required:true}),TG('trades','Trades'),T('registrationNo','Company reg. / CR14 no.'),T('contactPerson','Contact person'),E('email','Email'),PH('phone','Phone / mobile'),D('insuranceExpiry','Insurance expiry'),D('taxClearanceExpiry','Tax clearance expiry'),N('rating','Supplier rating (1–5)'),C('creditLimit','Jobs in hand limit'),A('notes','Notes'),STS(['PREQUALIFIED','ACTIVE','SUSPENDED','BLACKLISTED'],'ACTIVE')],
    ['number','name','trades','phone','rating','insuranceExpiry','status'],{statusOptions:['PREQUALIFIED','ACTIVE','SUSPENDED','BLACKLISTED'],dateKey:'insuranceExpiry'}),

  d('requisitions','Material requests','Material request','procurement','Materials & suppliers','ClipboardList','MR','name',
    'Internal material and service requests from site.',
    [T('name','Requisition title',{required:true}),PRJ(true),R('requestedBy','Requested by','employees'),D('requiredDate','Required by date'),S('priority','Priority',PRIORITIES),C('estimatedValue','Estimated value'),IT('items','Itemised lines'),A('justification','Justification'),STS(['DRAFT','SUBMITTED','APPROVED','ORDERED','REJECTED','CANCELLED'],'DRAFT')],
    ['number','name','projectId','requiredDate','estimatedValue','status'],{projectScoped:true,statusOptions:['DRAFT','SUBMITTED','APPROVED','ORDERED','REJECTED','CANCELLED'],amountKey:'estimatedValue',dateKey:'requiredDate'}),

  d('purchaseOrders','Orders to suppliers','Order','procurement','Materials & suppliers','ShoppingCart','PO','name',
    'Purchase orders with approvals, commitments and receipt status.',
    [T('name','Order description',{required:true}),PRJ(true),R('vendorId','Supplier','vendors'),R('requisitionId','Material request','requisitions'),D('orderDate','Order date'),D('deliveryDate','Required delivery'),C('amount','Order value'),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),N('vatPct','VAT (%)',{defaultValue:0}),IT('items','Itemised lines'),R('approvedBy','Approved by','employees'),STS(PO_STATUSES,'DRAFT')],
    ['number','name','projectId','vendorId','amount','deliveryDate','status'],{projectScoped:true,statusOptions:PO_STATUSES,amountKey:'amount',dateKey:'orderDate'}),

  d('goodsReceipts','Delivery notes','Delivery note','procurement','Materials & suppliers','PackageCheck','GRN','name',
    'Delivery receipts and three-way match evidence.',
    [T('name','Delivery description',{required:true}),PRJ(),R('purchaseOrderId','Order to supplier','purchaseOrders'),R('vendorId','Supplier','vendors'),D('receivedDate','Received date'),T('deliveryNote','Delivery note no.'),IT('items','Itemised lines'),A('discrepancies','Discrepancies'),R('receivedBy','Received by','employees'),STS(['DRAFT','RECEIVED','PARTIAL','DISPUTED','ACCEPTED'],'RECEIVED')],
    ['number','name','purchaseOrderId','vendorId','receivedDate','status'],{projectScoped:true,statusOptions:['DRAFT','RECEIVED','PARTIAL','DISPUTED','ACCEPTED'],dateKey:'receivedDate'}),

  d('inventory','Stock & materials','Stock item','inventory','Materials & suppliers','Package','STK','name',
    'Stores stock on hand, reorder levels and valuation.',
    [T('name','Item / material',{required:true}),T('sku','Item code'),R('warehouseId','Warehouse','warehouses'),S('unit','Unit',['each','m','m²','m³','kg','t','litre','bag','roll','box','length']),N('quantityOnHand','Qty on hand'),N('reorderLevel','Reorder level'),C('unitCost','Unit cost'),C('stockValue','Stock value'),D('lastCountDate','Last stock count'),R('vendorId','Preferred supplier','vendors'),STS(['IN_STOCK','LOW','OUT_OF_STOCK','DISCONTINUED'],'IN_STOCK')],
    ['number','name','sku','warehouseId','quantityOnHand','reorderLevel','stockValue','status'],{statusOptions:['IN_STOCK','LOW','OUT_OF_STOCK','DISCONTINUED'],amountKey:'stockValue'}),

  d('warehouses','Stores & yards','Store / yard','inventory','Materials & suppliers','Warehouse','WH','name',
    'Storage locations and storekeepers.',
    [T('name','Warehouse / store',{required:true}),T('code','Code'),T('location','Location'),R('storekeeper','Storekeeper','employees'),PH('phone','Phone / mobile'),A('notes','Notes'),STS(['ACTIVE','CLOSED'],'ACTIVE')],
    ['number','name','code','location','storekeeper','status'],{statusOptions:['ACTIVE','CLOSED']}),

  d('equipment','Plant & equipment','Plant item','equipment','Materials & suppliers','Truck','EQ','name',
    'Plant register, utilisation, hour meters and compliance.',
    [T('name','Asset description',{required:true}),T('assetTag','Asset / QR tag'),S('category','Category',['Excavator','Loader','Tipper truck','Crane','Grader','Roller','Concrete mixer','Generator','Compressor','Pickup','Forklift','Scaffolding','Other']),T('makeModel','Make & model'),T('serialNo','Serial / registration'),PRJ(),S('ownership','Ownership',['OWNED','LEASED','RENTED_IN']),D('purchaseDate','Acquired'),C('purchaseCost','Acquisition cost'),N('hourMeter','Hour meter'),N('utilisation','Utilisation (%)'),D('serviceDue','Next service due'),D('insuranceExpiry','Insurance / licence expiry'),R('operator','Assigned operator','employees'),STS(['AVAILABLE','ON_SITE','IN_WORKSHOP','RENTED_OUT','DISPOSED'],'AVAILABLE')],
    ['number','name','assetTag','category','projectId','hourMeter','utilisation','status'],{projectScoped:true,statusOptions:['AVAILABLE','ON_SITE','IN_WORKSHOP','RENTED_OUT','DISPOSED'],amountKey:'purchaseCost',dateKey:'serviceDue'}),

  d('workOrders','Repairs & servicing','Repair job','equipment','Materials & suppliers','Wrench','WO','name',
    'Preventive and corrective maintenance jobs.',
    [T('name','Work order title',{required:true}),R('equipmentId','Asset','equipment'),PRJ(),S('type','Type',['PREVENTIVE','CORRECTIVE','BREAKDOWN','INSPECTION','CALIBRATION']),S('priority','Priority',PRIORITIES),D('openedDate','Opened'),D('dueDate','Due date'),D('closedDate','Closed'),C('cost','Cost'),A('workDescription','Work description'),R('assignedTo','Technician','employees'),STS(['OPEN','IN_PROGRESS','PARTS_PENDING','COMPLETE','CANCELLED'],'OPEN')],
    ['number','name','equipmentId','type','priority','dueDate','cost','status'],{statusOptions:['OPEN','IN_PROGRESS','PARTS_PENDING','COMPLETE','CANCELLED'],amountKey:'cost',dateKey:'dueDate'}),

  // ---------------- PEOPLE ----------------
  d('employees','Staff & workers','Staff member','hr','Staff & wages','UsersRound','EMP','name',
    'Employee master data, contracts, reporting lines and status.',
    [T('name','Full name',{required:true}),T('employeeNo','Employee number'),E('email','Work email'),PH('phone','Phone / mobile'),T('jobTitle','Job title'),S('department','Department',DEPARTMENTS),S('trade','Trade / skill',TRADES),R('reportsTo','Reports to','employees'),S('employmentType','Employment type',['PERMANENT','FIXED_TERM','CASUAL','CONTRACT','INTERN']),D('startDate','Start date'),D('contractExpiry','Contract expiry'),C('basicSalary','Basic monthly salary'),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),S('grade','Grade',['A','B','C','D','E']),T('emergencyContact','Emergency contact'),T('nationalId','National ID / passport'),STS(EMPLOYEE_STATUS,'ACTIVE')],
    ['number','name','employeeNo','jobTitle','department','employmentType','startDate','status'],{statusOptions:EMPLOYEE_STATUS,amountKey:'basicSalary',dateKey:'startDate'}),

  d('departments','Teams','Team','hr','Staff & wages','Network','DEP','name',
    'Organisational units and cost centres.',
    [T('name','Department',{required:true}),T('code','Team cost code'),R('head','Head of department','employees'),N('headcount','Headcount'),C('annualBudget','Annual budget'),A('description','Description'),STS(['ACTIVE','INACTIVE'],'ACTIVE')],
    ['number','name','code','head','headcount','annualBudget','status'],{statusOptions:['ACTIVE','INACTIVE'],amountKey:'annualBudget'}),

  d('crews','Site crews','Site crew','hr','Staff & wages','Users','CRW','name',
    'Site crews, gang composition and project assignment.',
    [T('name','Crew name',{required:true}),PRJ(),S('trade','Primary trade',TRADES),R('crewLeader','Crew leader','employees'),N('size','Crew size'),T('shift','Shift pattern'),A('members','Crew members'),STS(['ACTIVE','STANDBY','DISBANDED'],'ACTIVE')],
    ['number','name','projectId','trade','crewLeader','size','status'],{projectScoped:true,statusOptions:['ACTIVE','STANDBY','DISBANDED']}),

  d('timesheets','Time sheets','Time sheet','time','Staff & wages','Clock','TS','name',
    'Weekly timesheets feeding payroll and job costing.',
    [T('name','Timesheet reference',{required:true}),R('employeeId','Employee','employees'),PRJ(true),D('weekStart','Week starting'),D('weekEnd','Week ending'),N('regularHours','Normal hours'),N('overtimeHours','Overtime hours'),N('totalHours','Total hours'),C('labourCost','Allocated labour cost'),R('approvedBy','Approved by','employees'),A('notes','Notes'),STS(['DRAFT','SUBMITTED','APPROVED','REJECTED','POSTED'],'DRAFT')],
    ['number','name','employeeId','projectId','weekStart','totalHours','status'],{projectScoped:true,statusOptions:['DRAFT','SUBMITTED','APPROVED','REJECTED','POSTED'],amountKey:'labourCost',dateKey:'weekStart'}),

  d('leaveRequests','Leave requests','Leave request','leave','Staff & wages','Palmtree','LV','name',
    'Leave applications, balances and approvals.',
    [T('name','Request reference',{required:true}),R('employeeId','Employee','employees'),S('leaveType','Leave type',['ANNUAL','SICK','MATERNITY','PATERNITY','UNPAID','COMPASSIONATE','STUDY']),D('startDate','From'),D('endDate','To'),N('days','Days'),A('reason','Reason'),R('approvedBy','Approved by','employees'),STS(['PENDING','APPROVED','REJECTED','CANCELLED'],'PENDING')],
    ['number','name','employeeId','leaveType','startDate','days','status'],{statusOptions:['PENDING','APPROVED','REJECTED','CANCELLED'],dateKey:'startDate'}),

  d('payRuns','Payroll & payslips','Payroll period','payroll','Staff & wages','Wallet','PAY','name',
    'Monthly payroll inputs, statutory deductions and net pay.',
    [T('name','Payroll period',{required:true}),D('periodStart','Period start'),D('periodEnd','Period end'),N('headcount','Employees paid'),C('grossPay','Gross pay'),C('deductions','Deductions (PAYE/NSSA)'),C('netPay','Net pay'),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),D('paymentDate','Payment date'),R('preparedBy','Prepared by','employees'),IT('items','Itemised lines'),STS(['DRAFT','PROCESSING','APPROVED','PAID','CLOSED'],'DRAFT')],
    ['number','name','periodStart','headcount','grossPay','netPay','status'],{statusOptions:['DRAFT','PROCESSING','APPROVED','PAID','CLOSED'],amountKey:'grossPay',dateKey:'periodStart'}),

  d('expenses','Expense claims','Expense claim','payroll','Staff & wages','Receipt','EXP','name',
    'Employee reimbursements, per diem and project expenses.',
    [T('name','Claim reference',{required:true}),R('employeeId','Employee','employees'),PRJ(),S('category','Category',['Travel','Fuel','Accommodation','Meals','Materials','Petty cash','Tools','Other']),D('expenseDate','Date'),C('amount','Amount'),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),A('description','Description'),R('approvedBy','Approved by','employees'),IT('items','Itemised lines'),STS(['DRAFT','SUBMITTED','APPROVED','REIMBURSED','REJECTED'],'DRAFT')],
    ['number','name','employeeId','category','expenseDate','amount','status'],{statusOptions:['DRAFT','SUBMITTED','APPROVED','REIMBURSED','REJECTED'],amountKey:'amount',dateKey:'expenseDate'}),

  d('certifications','Trade certificates','Trade certificate','competency','Staff & wages','GraduationCap','CERT','name',
    'Competency tickets, licences, inductions and expiry alerts.',
    [T('name','Certification',{required:true}),R('employeeId','Employee','employees'),S('type','Type',['Trade test','Safety induction','First aid','Working at height','Confined space','Crane / rigging','Driver licence','Plant operator','Professional registration','Other']),T('issuingBody','Issuing body'),T('referenceNo','Certificate no.'),D('issuedDate','Issued'),D('expiryDate','Expiry'),A('notes','Notes'),STS(['VALID','EXPIRING','EXPIRED','SUSPENDED'],'VALID')],
    ['number','name','employeeId','type','expiryDate','status'],{statusOptions:['VALID','EXPIRING','EXPIRED','SUSPENDED'],dateKey:'expiryDate'}),

  d('training','Training & inductions','Training record','competency','Staff & wages','BookOpen','TRN','name',
    'Training plans, attendance and competency outcomes.',
    [T('name','Training / course',{required:true}),S('type','Type',['Induction','HSE','Technical','Supervisory','Compliance','Software','Other']),D('date','Date'),T('provider','Provider'),A('attendees','Attendees'),N('attendeeCount','Attendees count'),C('cost','Cost'),S('outcome','Outcome',['COMPLETED','PASSED','FAILED','CANCELLED']),STS(['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'],'PLANNED')],
    ['number','name','type','date','attendeeCount','outcome','status'],{statusOptions:['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'],amountKey:'cost',dateKey:'date'}),

  // ---------------- SAFETY & QUALITY ----------------
  d('toolboxTalks','Toolbox talks','Toolbox talk','safety','Safety & quality','ShieldCheck','TBT','name',
    'Toolbox talks, job safety analysis and permits-to-work.',
    [T('name','Topic',{required:true}),PRJ(true),D('date','Date'),S('type','Type',['Toolbox talk','JSA / JHA','Permit to work','LOTO','Hot work','Confined space','Work at height']),T('location','Location / area'),R('presentedBy','Presented by','employees'),N('attendance','Attendance'),A('hazards','Hazards identified'),A('controls','Control measures'),STS(['SCHEDULED','HELD','SIGNED_OFF','CLOSED'],'HELD')],
    ['number','name','projectId','date','type','attendance','status'],{projectScoped:true,statusOptions:['SCHEDULED','HELD','SIGNED_OFF','CLOSED'],dateKey:'date'}),

  d('incidents','Incidents & near misses','Incident','safety','Safety & quality','TriangleAlert','INC','name',
    'Accidents, near misses, investigations and follow-up actions.',
    [T('name','Incident title',{required:true}),PRJ(true),D('dateTime','Date'),S('type','Type',['NEAR_MISS','FIRST_AID','MEDICAL_TREATMENT','LOST_TIME','FATALITY','ENVIRONMENTAL','PROPERTY_DAMAGE']),S('severity','Severity',['LOW','MEDIUM','HIGH','CRITICAL']),T('location','Location'),A('description','What happened'),A('rootCause','Root cause'),A('correctiveAction','Corrective / preventive action'),N('lostDays','Lost time (days)'),R('reportedBy','Reported by','employees'),R('investigator','Investigator','employees'),STS(['REPORTED','UNDER_INVESTIGATION','ACTION_OPEN','CLOSED'],'REPORTED')],
    ['number','name','projectId','type','severity','dateTime','status'],{projectScoped:true,statusOptions:['REPORTED','UNDER_INVESTIGATION','ACTION_OPEN','CLOSED'],dateKey:'dateTime'}),

  d('inspections','Site checks','Site check','quality','Safety & quality','ClipboardCheck','INS','name',
    'Checklist inspections, audits and findings.',
    [T('name','Inspection title',{required:true}),PRJ(),D('date','Date'),S('type','Type',['Site safety','Housekeeping','Scaffolding','Electrical','Fire','Environmental','Quality','ISO audit']),R('inspector','Inspector','employees'),N('findings','Findings raised'),N('score','Score (%)'),A('observations','Observations'),A('actions','Required actions'),STS(['SCHEDULED','COMPLETED','ACTION_REQUIRED','CLOSED'],'COMPLETED')],
    ['number','name','projectId','date','type','score','findings','status'],{projectScoped:true,statusOptions:['SCHEDULED','COMPLETED','ACTION_REQUIRED','CLOSED'],dateKey:'date'}),

  d('ncrs','Faults & rework','Fault','quality','Safety & quality','CircleSlash','NCR','name',
    'Quality non-conformances and the CAPA loop.',
    [T('name','Fault / defect',{required:true}),PRJ(true),D('raisedDate','Raised'),S('category','Category',['Workmanship','Material','Design','Documentation','Testing','Supplier']),S('severity','Severity',['MINOR','MAJOR','CRITICAL']),R('raisedBy','Raised by','employees'),R('assignedTo','Responsible','subcontractors'),A('description','Description'),A('correctiveAction','Corrective action'),D('closeDate','Closed date'),STS(['OPEN','INVESTIGATING','REWORK','CLOSED'],'OPEN')],
    ['number','name','projectId','category','severity','raisedDate','status'],{projectScoped:true,statusOptions:['OPEN','INVESTIGATING','REWORK','CLOSED'],dateKey:'raisedDate'}),

  d('itps','Checklists & test plans','Checklist','quality','Safety & quality','BadgeCheck','ITP','name',
    'Hold/witness points, test registers and sign-offs.',
    [T('name','Checklist / test pack',{required:true}),PRJ(true),T('discipline','Discipline'),S('type','Type',['Concrete pour','Steel / weld','NDT','Pressure test','Electrical test','Commissioning','Material approval']),D('plannedDate','Planned'),D('testDate','Tested'),S('result','Result',['PENDING','PASS','FAIL','CONDITIONAL']),R('witnessedBy','Witnessed by','contacts'),A('testResults','Test results'),STS(['DRAFT','AWAITING','IN_PROGRESS','ACCEPTED','REJECTED'],'DRAFT')],
    ['number','name','projectId','type','plannedDate','result','status'],{projectScoped:true,statusOptions:['DRAFT','AWAITING','IN_PROGRESS','ACCEPTED','REJECTED'],dateKey:'plannedDate'}),

  // ---------------- FINANCE ----------------
  d('accounts','Account codes','Account code','finance','Money & invoices','Landmark','ACC','name',
    'General ledger accounts and cost-code structure.',
    [T('name','Account name',{required:true}),T('code','Account / job cost code'),S('type','Account type',['ASSET','LIABILITY','EQUITY','REVENUE','DIRECT_COST','INDIRECT_COST','EXPENSE']),S('category','Category',['Labour','Materials','Plant','Subcontract','Overhead','Sales','Debtors','Creditors','Bank','Tax','Other']),C('openingBalance','Opening balance'),C('balance','Current balance'),R('parent','Parent account','accounts'),B('isCostCode','Cost code'),IT('items','Itemised lines'),STS(['ACTIVE','DORMANT','CLOSED'],'ACTIVE')],
    ['number','name','code','type','category','balance','status'],{statusOptions:['ACTIVE','DORMANT','CLOSED'],amountKey:'balance'}),

  d('journals','Journals & adjustments','Journal','finance','Money & invoices','BookOpen','JNL','name',
    'Double-entry style journals with period control.',
    [T('name','Journal description',{required:true}),D('date','Posting date'),T('period','Month / period'),R('accountId','Account','accounts'),PRJ(),C('debit','Debit'),C('credit','Credit'),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),A('narration','Narration'),R('preparedBy','Prepared by','employees'),IT('items','Itemised lines'),STS(['DRAFT','POSTED','REVERSED'],'DRAFT')],
    ['number','name','date','period','accountId','debit','credit','status'],{statusOptions:['DRAFT','POSTED','REVERSED'],amountKey:'debit',dateKey:'date'}),

  d('budgets','Job budgets & costs','Budget line','jobCosting','Money & invoices','PieChart','BUD','name',
    'Approved budget against committed and actual cost, by job.',
    [T('name','Budget line',{required:true}),PRJ(true),T('costCode','Cost code'),S('category','Cost category',['Labour','Materials','Plant','Subcontract','Preliminaries','Overhead','Contingency']),C('originalBudget','Original budget'),C('approvedVariations','Approved variations'),C('committed','Committed'),C('actualToDate','Actual to date'),C('forecastToComplete','Forecast to complete'),P('variancePct','Variance (%)'),IT('items','Itemised lines'),STS(['DRAFT','APPROVED','REVISED','CLOSED'],'APPROVED')],
    ['number','name','projectId','costCode','originalBudget','actualToDate','variancePct','status'],{projectScoped:true,statusOptions:['DRAFT','APPROVED','REVISED','CLOSED'],amountKey:'originalBudget'}),

  d('arInvoices','Client invoices','Tax invoice','finance','Money & invoices','FileText','INV','name',
    'Accounts receivable invoices, VAT and ageing.',
    [T('name','Invoice description',{required:true}),PRJ(true),R('clientId','Client','clients'),D('invoiceDate','Invoice date'),D('dueDate','Due date'),C('amount','Net amount'),N('vatPct','VAT (%)',{defaultValue:0}),C('vatAmount','VAT'),C('total','Total incl. VAT'),C('amountPaid','Paid to date',{readOnly:true,hint:'Recorded from reconciled payments when available'}),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),T('taxInvoiceNo','Tax invoice no.'),IT('items','Itemised lines'),STS(INVOICE_STATUSES,'DRAFT'),...CONV()],
    ['number','name','clientId','projectId','invoiceDate','dueDate','total','status'],{projectScoped:true,statusOptions:INVOICE_STATUSES,amountKey:'total',dateKey:'invoiceDate'}),

  d('paymentApps','Payment certificates','Payment certificate','billing','Money & invoices','Receipt','PC','name',
    'Interim payment applications, certified value, retention and net due.',
    [T('name','Certificate reference',{required:true}),PRJ(true),R('clientId','Client','clients'),N('certificateNo','Certificate no.'),D('periodEnd','Period ending'),C('workValue','Gross work value'),C('variationsValue','Approved variations'),C('previousCertified','Previously certified'),C('grossCertified','Gross certified'),C('retentionHeld','Retention held'),C('advanceRecoupment','Advance recoupment'),C('netCertified','Net certified'),C('vatAmount','VAT'),R('certifiedBy','Certified by','contacts'),IT('items','Itemised lines'),STS(['DRAFT','SUBMITTED','CERTIFIED','PARTIALLY_PAID','PAID'],'DRAFT'),...CONV()],
    ['number','name','projectId','certificateNo','periodEnd','grossCertified','netCertified','status'],{projectScoped:true,statusOptions:['DRAFT','SUBMITTED','CERTIFIED','PARTIALLY_PAID','PAID'],amountKey:'netCertified',dateKey:'periodEnd'}),

  d('apBills','Supplier bills','Supplier bill','finance','Money & invoices','FileInput','BILL','name',
    'Supplier bills matched to orders and delivery notes.',
    [T('name','Bill description',{required:true}),PRJ(),R('vendorId','Supplier','vendors'),R('purchaseOrderId','Order to supplier','purchaseOrders'),T('vendorInvoiceNo','Supplier invoice no.'),D('billDate','Bill date'),D('dueDate','Due date'),C('amount','Net amount'),C('vatAmount','VAT'),C('total','Total'),C('amountPaid','Paid'),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),IT('items','Itemised lines'),STS(INVOICE_STATUSES,'DRAFT')],
    ['number','name','vendorId','projectId','billDate','dueDate','total','status'],{projectScoped:true,statusOptions:INVOICE_STATUSES,amountKey:'total',dateKey:'billDate'}),

  d('payments','Payments & receipts','Payment / receipt','finance','Money & invoices','Banknote','PYM','name',
    'Cash in and out against invoices and bills.',
    [T('name','Payment reference',{required:true}),S('direction','Direction',['RECEIPT','PAYMENT']),R('clientId','Client','clients'),R('vendorId','Supplier','vendors'),PRJ(),D('paymentDate','Date'),C('amount','Amount'),S('method','Method',['Bank transfer','RTGS','Mobile money','Cash','Cheque','Card','Offset']),T('bankAccount','Bank account'),T('reference','Bank reference'),S('currency','Currency',CURRENCIES,{defaultValue:'USD'}),IT('items','Itemised lines'),STS(['PENDING','CLEARED','RECONCILED','REVERSED'],'CLEARED'),...CONV()],
    ['number','name','direction','paymentDate','amount','method','status'],{statusOptions:['PENDING','CLEARED','RECONCILED','REVERSED'],amountKey:'amount',dateKey:'paymentDate'}),

  // ---------------- SPECIALISED ----------------
  d('units','Stands & unit sales','Stand / unit','unitSales','Specialist modules','KeyRound','UN','name',
    'Saleable units, reservations, buyers, handover and warranty.',
    [T('name','Stand / unit',{required:true}),PRJ(),T('block','Block / phase'),S('type','Type',['Apartment','Townhouse','Stand / plot','Office suite','Warehouse unit','Retail unit']),N('area','Area (m²)'),C('askingPrice','Asking price'),C('salePrice','Sale price'),T('buyer','Buyer'),D('reservationDate','Reserved'),D('handoverDate','Handover'),D('warrantyExpiry','Warranty expiry'),STS(['AVAILABLE','RESERVED','SOLD','HANDED_OVER','UNDER_WARRANTY'],'AVAILABLE')],
    ['number','name','projectId','type','area','salePrice','status'],{projectScoped:true,statusOptions:['AVAILABLE','RESERVED','SOLD','HANDED_OVER','UNDER_WARRANTY'],amountKey:'salePrice'}),

  d('rentalContracts','Leases & rentals','Lease','rental','Specialist modules','Truck','RNT','name',
    'Plant hire agreements, rates and utilisation billing.',
    [T('name','Rental reference',{required:true}),R('clientId','Client','clients'),R('equipmentId','Asset','equipment'),PRJ(),D('startDate','Out date'),D('endDate','Return date'),S('rateBasis','Rate basis',['PER_HOUR','PER_DAY','PER_WEEK','PER_MONTH']),C('rate','Rate'),N('hoursUsed','Hours used'),C('totalBilled','Total billed'),STS(['DRAFT','ACTIVE','RETURNED','INVOICED','CLOSED'],'ACTIVE')],
    ['number','name','clientId','equipmentId','startDate','rate','totalBilled','status'],{statusOptions:['DRAFT','ACTIVE','RETURNED','INVOICED','CLOSED'],amountKey:'totalBilled',dateKey:'startDate'}),

  d('commissioning','Handover packs','Handover pack','commissioning','Specialist modules','Gauge','COM','name',
    'Handover packs, test results and operating manuals for industrial jobs.',
    [T('name','System / package',{required:true}),PRJ(true),T('systemCode','System code'),S('discipline','Discipline',['Mechanical','Electrical','Instrumentation','Process','Civil','HVAC']),D('plannedDate','Planned'),D('achievedDate','Mechanical completion'),S('status2','Test status',['NOT_STARTED','PRE_COMMISSIONING','TESTING','READY_FOR_STARTUP','HANDED_OVER']),R('leadEngineer','Lead engineer','employees'),A('testPacks','Test packs / dossiers'),STS(['PLANNED','IN_PROGRESS','COMPLETE','HANDED_OVER'],'PLANNED')],
    ['number','name','projectId','systemCode','discipline','plannedDate','status'],{projectScoped:true,statusOptions:['PLANNED','IN_PROGRESS','COMPLETE','HANDED_OVER'],dateKey:'plannedDate'}),
];

export const RESOURCE_MAP: Record<string, ResourceDef> = Object.fromEntries(RESOURCES.map(r => [r.id, r]));
export function getResource(id: string): ResourceDef | undefined { return RESOURCE_MAP[id]; }
export function resourcesForConfig(cfg: WorkspaceConfig): ResourceDef[] {
  const allowed = new Set(cfg.resources);
  return RESOURCES.filter(r => allowed.has(r.id));
}
export function resourcesForModules(moduleIds: string[], all: boolean = false): ResourceDef[] {
  if (all) return RESOURCES;
  const allowed = new Set(moduleIds.flatMap(id => MODULES.find(m => m.id === id)?.resources || []));
  return RESOURCES.filter(r => allowed.has(r.id));
}
export const STATUS_TONES: Record<string,string> = {
  ACTIVE:'green', APPROVED:'green', PAID:'green', COMPLETE:'green', COMPLETED:'green', CLOSED:'green', WON:'green', CURRENT:'green', VALID:'green', PASS:'green', ACCEPTED:'green', AVAILABLE:'green', IN_STOCK:'green', RECEIVED:'green', CERTIFIED:'green', HANDED_OVER:'green', PREFERRED:'green', PREQUALIFIED:'green', POSTED:'green', CLEARED:'green', RECONCILED:'green', SIGNED_OFF:'green', APPROVED_AS_NOTED:'green',
  DRAFT:'slate', PENDING:'amber', SUBMITTED:'amber', UNDER_REVIEW:'amber', IN_PROGRESS:'amber', AT_RISK:'amber', ON_HOLD:'amber', PARTIALLY_PAID:'amber', EXPIRING:'amber', LOW:'amber', OPEN:'amber', INVESTIGATING:'amber', PROCESSING:'amber', PENDING_APPROVAL:'amber', PARTIALLY_RECEIVED:'amber', RESUBMIT:'amber', REWORK:'amber', UNDER_WARRANTY:'amber', RESERVED:'amber', ON_SITE:'amber', IN_WORKSHOP:'amber', RENTED_OUT:'amber',
  OVERDUE:'red', REJECTED:'red', LOST:'red', DELAYED:'red', CRITICAL:'red', HIGH:'red', FATALITY:'red', EXPIRED:'red', BLACKLISTED:'red', SUSPENDED:'red', VOID:'red', FAILED:'red', DISPUTED:'red', OUT_OF_STOCK:'red', TERMINATED:'red', CANCELLED:'red', ACTION_REQUIRED:'red', BREACH:'red',
  PLANNING:'blue', BID:'blue', ISSUED:'blue', FOR_REVIEW:'blue', SCHEDULED:'blue', AWARDED:'blue', SOLD:'blue', INVOICED:'blue', NOT_STARTED:'slate', PROSPECT:'blue', MINOR:'blue', MAJOR:'amber',
};
export function toneFor(status?: string): string { return STATUS_TONES[status || ''] || 'slate'; }
