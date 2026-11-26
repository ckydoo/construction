import {mylaResources} from '@/lib/ask-myla';
import {requireOrg} from '@/lib/auth';
import {visibleAIModes} from '@/lib/ai-assistant';
import AIAssistant from '@/components/AIAssistant';
export default async function AIPage({params}:{params:Promise<{org:string}>}){
  const {org}=await params;const a=await requireOrg(org);
  if(!visibleAIModes(a.role,a.config).length&&!mylaResources(a.role,a.config).length)return <p>Myla Assistant is not available for your current workspace permissions.</p>;
  return <AIAssistant org={org}/>;
}
