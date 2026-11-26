import { canCapability, canRead, canWrite } from './catalog';
import { resourceFullyEnabled } from './module-visibility';
import { blankQuoteDraft, type QuoteDraft } from './quote-studio';

export function canUseQuotationAI(role: string, config: {modules?: string[]; resources: string[]}) {
  return resourceFullyEnabled(config, 'estimates') && canRead(role, 'estimates') && canWrite(role, 'estimates') && canCapability(role, 'records.create');
}
export type AIRate = { id: string; description: string; unit: string; unitPrice: number };
export type AISuggestion = { name: string; scope: string; questions: string[]; assumptions: string[]; items: {description: string; unit: string; qty: number | null; rateId: string | null}[] };
const text = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
export function parseSuggestion(raw: unknown): AISuggestion {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid AI response');
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown) => Array.isArray(v) ? v.slice(0, 8).map(x=>text(x, 300)).filter(Boolean) : [];
  if (!Array.isArray(r.items) || !r.items.length || r.items.length > 30) throw new Error('AI did not return a valid work breakdown');
  const items = r.items.map((v: any) => {
    if (!v || !text(v.description, 240)) throw new Error('Invalid AI item');
    return {description:text(v.description,240), unit:text(v.unit,30), qty:typeof v.qty==='number' && Number.isFinite(v.qty) && v.qty>0 && v.qty<=1e5 ? v.qty : null, rateId:typeof v.rateId==='string'?text(v.rateId,20):null};
  });
  return {name:text(r.name,150)||'Draft quotation', scope:text(r.scope,4000), questions:strings(r.questions), assumptions:strings(r.assumptions), items};
}
export function prepareAIDraft(suggestion: AISuggestion, rates: AIRate[], currency: string): {draft: QuoteDraft; warnings: string[]} {
  const warnings = ['AI-generated draft: verify every quantity, rate, scope and exclusion before saving or sending.'];
  const items = suggestion.items.map((item,i) => {
    const rate = rates.find(r=>r.id===item.rateId);
    if (!rate) warnings.push(`Item ${i+1}: price missing. Zero is a placeholder, not a free item.`);
    if (item.qty===null) warnings.push(`Item ${i+1}: quantity missing. One is a placeholder, not a measurement.`);
    const qty=item.qty??1, unitPrice=rate?.unitPrice??0;
    return {description:item.description, detail:rate?`Rate source: ${rate.description}. Confirm this rate and unit suit the work.`:'Price required — AI has not priced this item.', unit:rate?.unit||item.unit, qty, unitPrice, total:Math.round(qty*unitPrice*100)/100, category:'materials' as const};
  });
  return {draft:{...blankQuoteDraft(),name:suggestion.name,currency,status:'DRAFT',markup:0,scope:[suggestion.scope, suggestion.assumptions.length ? 'Assumptions to verify:\n'+suggestion.assumptions.join('\n') : '', suggestion.questions.length ? 'Unresolved questions:\n'+suggestion.questions.join('\n') : ''].filter(Boolean).join('\n\n'),items},warnings};
}
