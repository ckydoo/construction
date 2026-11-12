/* Company information used on customer-facing financial PDFs.
 * Stored in organizations.config.company so no database migration is required. */
export type CompanyProfile = {
  displayName: string;
  legalName: string;
  registrationNo: string;
  taxNo: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  bankDetails: string;
  quoteIntro: string;
  paymentTerms: string;
  clientMaterials: string;
  warrantyDelivery: string;
  footerNote: string;
  preparedBy: string;
  depositPct: number;
  logoDataUrl: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const clean = (v: unknown, max = 2000) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const safeLogo = (v: unknown) => {
  const s = clean(v, 400000);
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '';
};

export function normaliseCompanyProfile(raw: any, org: any = {}): CompanyProfile {
  const p = raw && typeof raw === 'object' ? raw : {};
  const deposit = Number(p.depositPct);
  return {
    displayName: clean(p.displayName, 120) || clean(org?.name, 120) || 'Your company',
    legalName: clean(p.legalName, 160) || clean(org?.legalName, 160),
    registrationNo: clean(p.registrationNo, 80) || clean(org?.regNumber, 80),
    taxNo: clean(p.taxNo, 80),
    address: clean(p.address, 500),
    email: clean(p.email, 160),
    phone: clean(p.phone, 80),
    website: clean(p.website, 160),
    bankDetails: clean(p.bankDetails, 1200),
    quoteIntro: clean(p.quoteIntro, 700) || 'We are pleased to submit this formal quotation for the following works.',
    paymentTerms: clean(p.paymentTerms, 700),
    clientMaterials: clean(p.clientMaterials, 900),
    warrantyDelivery: clean(p.warrantyDelivery, 900),
    footerNote: clean(p.footerNote, 300) || 'Thank you for your business.',
    preparedBy: clean(p.preparedBy, 120),
    depositPct: Number.isFinite(deposit) ? Math.min(100, Math.max(0, deposit)) : 0,
    logoDataUrl: safeLogo(p.logoDataUrl),
    updatedAt: p.updatedAt ? clean(p.updatedAt, 40) : null,
    updatedBy: p.updatedBy ? clean(p.updatedBy, 120) : null,
  };
}

export function companyInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'CO';
}
