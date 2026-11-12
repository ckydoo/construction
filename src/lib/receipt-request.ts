/* Browser-only retry key. The stored digest does not contain receipt fields;
 * the same payload in this tab retains its key after a reload or timeout. */
export async function receiptRequestKey(org:string, action:string, payload:unknown,fallback?:string|null): Promise<{requestId:string;storageKey:string}> {
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const storageKey=`myla-receipt:${org}:${action}:${hex}`;
  let existing:string|null=null;
  try { existing=sessionStorage.getItem(storageKey); } catch { /* tab storage unavailable */ }
  const requestId=existing || fallback || crypto.randomUUID();
  try {sessionStorage.setItem(storageKey,requestId);} catch { /* same-tab retry remains best effort */ }
  return {requestId,storageKey};
}
export function clearReceiptRequest(storageKey:string){try{sessionStorage.removeItem(storageKey);}catch{/* no storage */}}
