import { userMessage } from './user-message';
export async function api<T=any>(path:string, init?:RequestInit):Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type':'application/json', ...(init?.headers||{}) } });
  if (!res.ok) {
    const body = await res.json().catch(()=>({ error:res.statusText }));
    const raw = typeof body.error === 'string' ? body.error
      : typeof body.error?.message === 'string' ? body.error.message
      : typeof res.statusText === 'string' ? res.statusText : '';
    const err:any = new Error(userMessage({ message: raw, status: res.status }));
    err.status = res.status;
    err.technicalMessage = raw;
    err.details = body.errors;
    err.code = body.code || body.error?.code || null;
    throw err;
  }
  return res.json();
}
export const apiGet = <T=any>(p:string)=>api<T>(p);
export const apiSend = <T=any>(p:string,method:string,body?:any)=>api<T>(p,{method,body:body===undefined?undefined:JSON.stringify(body)});
export const orgApi = (org:string,suffix:string)=>`/api/${encodeURIComponent(org)}/${suffix}`;
