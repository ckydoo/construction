'use client';
/** Secondary information stays available without dominating the drafting form. */
export default function AIHelp({rates=false}:{rates?:boolean}){
  return <details className="text-xs muted"><summary className="cursor-pointer py-1 font-medium">How AI works</summary><div className="mt-2 space-y-2 rounded-lg border divider p-3 leading-relaxed">
    <p>Your notes{rates?' and selected company rates':''} are sent to OpenRouter and its model provider. Avoid personal or confidential information. No other customer or project records are retrieved.</p>
    {rates&&<p>Only your selected saved template is used—not starter prices or previous client records. Check that its rates are current. Without a template, you enter prices in the quotation editor.</p>}
    <p>Your workspace shares 20 requests per UTC day across all AI modes, including provider failures.</p>
    <p>AI can make mistakes. It does not certify engineering, safety or legal compliance. Nothing is sent or saved automatically; creating project tasks requires separate approval.</p>
    <p>Drafts stay in this view only. Leaving or refreshing the page discards unsaved work.</p>
  </div></details>;
}
