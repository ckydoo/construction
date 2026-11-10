'use client';
/* Server-backed combobox for reference fields and filters.
 * It never loads a whole register: each keystroke asks Postgres for 25 matches.
 * The list is portalled to <body> so it is not clipped by drawers or tables. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import { apiGet, orgApi } from '@/lib/client';

type Opt = { value:string; label:string };

export default function SearchSelect({
  org, resource, value, onChange, placeholder='Type to search…', label,
  disabled=false, allowClear=true, initialLabel, className='', pageSize=25,
}:{
  org:string; resource:string; value?:string|null; onChange:(v:string)=>void;
  placeholder?:string; label?:string; disabled?:boolean; allowClear?:boolean;
  initialLabel?:string; className?:string; pageSize?:number;
}){
  const [open,setOpen]=useState(false);
  const [term,setTerm]=useState('');
  const [debounced,setDebounced]=useState('');
  const [active,setActive]=useState(0);
  const [chosen,setChosen]=useState<{value:string;label:string}|null>(null);
  const [rect,setRect]=useState<{top:number;left:number;width:number;below:number;above:number}|null>(null);
  const [mounted,setMounted]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  const wrapRef=useRef<HTMLDivElement>(null);
  const listRef=useRef<HTMLDivElement>(null);
  const listId=useId().replace(/:/g,'');

  useEffect(()=>setMounted(true),[]);
  useEffect(()=>{ const t=setTimeout(()=>setDebounced(term.trim()),250); return()=>clearTimeout(t); },[term]);
  useEffect(()=>{ setActive(0); },[debounced,open]);

  const {data:searchData,isFetching}=useQuery<{options:Opt[]}>({
    queryKey:['refSearch',org,resource,debounced,pageSize],
    queryFn:()=>apiGet(orgApi(org,`records/${resource}?mode=refs&limit=${pageSize}&q=${encodeURIComponent(debounced)}`)),
    enabled:mounted&&open,
    staleTime:30_000,
  });
  const {data:valueData}=useQuery<{options:Opt[]}>({
    queryKey:['refValue',org,resource,value],
    queryFn:()=>apiGet(orgApi(org,`records/${resource}?mode=refs&ids=${encodeURIComponent(String(value))}`)),
    enabled:mounted&&!!value,
    staleTime:60_000,
  });
  const resolved=valueData?.options?.find(o=>o.value===value)?.label;
  const selectedLabel=(chosen&&chosen.value===value?chosen.label:null)||initialLabel||resolved||(value?String(value).slice(-8):'');

  const options:Opt[]=useMemo(()=>{
    const list=searchData?.options||[];
    if(value && !list.some(o=>o.value===value) && selectedLabel) return [{value:String(value),label:selectedLabel},...list];
    return list;
  },[searchData,value,selectedLabel]);

  const place=()=>{
    const el=inputRef.current; if(!el)return;
    const r=el.getBoundingClientRect();
    const below=window.innerHeight-r.bottom-10;
    const above=r.top-10;
    setRect({top:below>=170?r.bottom+4:Math.max(8,r.top-Math.min(248,above)-4),left:r.left,width:r.width,below,above});
  };
  useEffect(()=>{
    if(!open)return;
    place();
    const onScroll=()=>place();
    window.addEventListener('resize',onScroll); window.addEventListener('scroll',onScroll,true);
    return()=>{window.removeEventListener('resize',onScroll);window.removeEventListener('scroll',onScroll,true);};
  },[open]); // eslint-disable-line

  useEffect(()=>{
    if(!open)return;
    const onDown=(e:MouseEvent)=>{
      const t=e.target as Node;
      if(wrapRef.current?.contains(t)||listRef.current?.contains(t))return;
      setOpen(false); setTerm(''); setDebounced('');
    };
    document.addEventListener('mousedown',onDown);
    return()=>document.removeEventListener('mousedown',onDown);
  },[open]);

  const choose=(o:Opt)=>{ setChosen({value:String(o.value),label:o.label}); onChange(o.value); setOpen(false); setTerm(''); setDebounced(''); inputRef.current?.blur(); };
  const onKey=(e:React.KeyboardEvent<HTMLInputElement>)=>{
    if(e.key==='ArrowDown'){e.preventDefault();if(!open)setOpen(true);setActive(i=>Math.min(options.length-1,i+1));}
    else if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,i-1));}
    else if(e.key==='Enter'){e.preventDefault();if(open&&options[active])choose(options[active]);else setOpen(true);}
    else if(e.key==='Escape'){e.preventDefault();setOpen(false);setTerm('');setDebounced('');}
    else if(e.key==='Tab'){setOpen(false);setTerm('');setDebounced('');}
  };

  const dropdown=mounted&&open&&rect?createPortal(
    <div ref={listRef}
      style={{position:'fixed',top:rect.top,left:rect.left,width:rect.width,zIndex:100,maxHeight:Math.min(248,rect.below>=170?rect.below:rect.above)}}
      className="overflow-y-auto rounded-md border border-slate-200 bg-white shadow-panel dark:border-ink-700 dark:bg-ink-900">
      <div className="flex items-center justify-between gap-2 border-b divider px-3 py-1.5 text-[10px] muted">
        <span>{debounced?`Matches for “${debounced}”`:`Start typing to search ${resource}`}</span>
        {isFetching&&<Lucide.Loader2 size={12} className="animate-spin text-brand-500"/>}
      </div>
      <ul role="listbox" id={listId} aria-label={label||`Search ${resource}`}>
        {options.length===0&&<li className="px-3 py-3 text-[12px] muted">{isFetching?'Searching…':'No matches — try a different word.'}</li>}
        {options.map((o,i)=><li key={o.value} id={`${listId}-${i}`} role="option" aria-selected={o.value===value}
          onMouseDown={e=>{e.preventDefault();choose(o);}}
          onMouseEnter={()=>setActive(i)}
          className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-[12px] ${i===active?'bg-brand-50 text-ink-900 dark:bg-brand-500/10 dark:text-white':'text-ink-700 dark:text-slate-200'}`}>
          <Lucide.Check size={13} className={o.value===value?'text-brand-600 dark:text-brand-300':'invisible'}/>
          <span className="min-w-0 flex-1 truncate">{o.label}</span>
          {o.value===value&&<span className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Selected</span>}
        </li>)}
      </ul>
      <div className="border-t divider px-3 py-1.5 text-[10px] muted">↑ ↓ to move · Enter to choose · Esc to close</div>
    </div>, document.body):null;

  return <div ref={wrapRef} className={`relative ${className}`}>
    <div className="relative">
      <Lucide.Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-slate-400"/>
      <input ref={inputRef} type="text" role="combobox" aria-label={label||`Search ${resource}`}
        aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open&&options[active]?`${listId}-${active}`:undefined}
        disabled={disabled}
        className={`input pl-9 pr-16 ${open?'border-brand-400 focus:ring-brand-500/20':''}`}
        value={open?term:selectedLabel}
        placeholder={placeholder}
        onFocus={()=>{setOpen(true);setTerm('');setDebounced('');}}
        onChange={e=>{setTerm(e.target.value);setOpen(true);}}
        onKeyDown={onKey}/>
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
        {allowClear&&!!value&&<button type="button" aria-label="Clear selection" title="Clear"
          onClick={()=>{onChange('');setTerm('');setDebounced('');setOpen(false);}}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-700 dark:hover:bg-ink-800"><Lucide.X size={13}/></button>}
        <button type="button" aria-label={open?'Close list':'Open list'} tabIndex={-1}
          onClick={()=>{setOpen(o=>!o);setTerm('');setDebounced('');if(!open)inputRef.current?.focus();}}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-700 dark:hover:bg-ink-800"><Lucide.ChevronDown size={14}/></button>
      </div>
    </div>
    {dropdown}
  </div>;
}
