'use client';
/** Use-based acknowledgement; details remain available without a consent gate. */
export default function AIHelp({ask=false}:{ask?:boolean}){
  return <div className="space-y-2 pt-2 text-xs muted leading-relaxed">
    <p>By using Myla, you agree to AI processing of your input. Avoid sensitive information.</p>
    <details><summary className="cursor-pointer inline-flex py-1 font-medium hover:text-brand-700">About Myla & privacy</summary><div className="mt-2 space-y-2 rounded-xl border divider p-4">
      <p>{ask?'Only your question is sent to an external AI service, not your workspace records. Matching records are retrieved within your existing permissions.':'Your notes are processed by an external AI service to prepare a draft. No other customer or project records are retrieved.'}</p>
      <p>{ask?'Ask about recent records or overdue work. Include the record name in each question. Myla does not calculate totals or forecasts.':'Check all draft details, quantities and prices before using them. Nothing is saved or sent to a customer automatically.'}</p>
      <p>AI can make mistakes. Your workspace has a shared daily usage limit. Unsaved work is cleared when you leave or refresh.</p>
    </div></details>
  </div>;
}
