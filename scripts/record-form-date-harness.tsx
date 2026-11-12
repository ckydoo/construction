import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import RecordForm from '../src/components/RecordForm';
const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
client.setQueryData(['meta','test'],{config:{tax:{enabled:false,rate:0}}});
const def:any={id:'date-test',singular:'Date test',fields:[{key:'name',label:'Name',type:'text'},{key:'date',label:'Date',type:'date'},{key:'vatPct',label:'Tax',type:'percent'}]};
function App(){const [open,setOpen]=React.useState(true);return <QueryClientProvider client={client}><button onClick={()=>client.setQueryData(['meta','test'],{config:{tax:{enabled:true,rate:15}}})}>Update settings</button><button onClick={()=>setOpen(true)}>Reopen</button><RecordForm def={def} open={open} onClose={()=>setOpen(false)} onSubmit={()=>{}} refs={{}} org="test"/></QueryClientProvider>}
createRoot(document.getElementById('root')!).render(<App/>);
