'use client';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { Button, Card, CardHead, Icon, Badge, Skeleton, EmptyState, Field, ConfirmDialog } from '@/components/ui';
import Overlay from '@/components/Overlay';
import { useToast } from '@/components/Providers';
import FileDropZone, { isExternalFileDrag } from '@/components/FileDropZone';
import { date } from '@/lib/format';
import {
  buildFolderTree, childrenOf, breadcrumbs, customKey,
  type LibraryFolder, type LibraryFile,
} from '@/lib/document-folders';

type LibData = {
  projects: { id: string; name: string }[];
  folders: { id: string; name: string; parentKey: string; projectId: string | null }[];
  files: LibraryFile[];
  canUpload: boolean; canDelete: boolean;
};

const DRAG_FILE_MIME = 'application/x-myla-library-file';
const isInternalFileDrag = (e: React.DragEvent) => {
  try { return Array.from(e.dataTransfer.types || []).includes(DRAG_FILE_MIME); }
  catch { return false; }
};

export default function LibraryPage() {
  const { org } = useParams<{ org: string }>();
  const qc = useQueryClient(); const toast = useToast();
  const uploadRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [currentKey, setCurrentKey] = useState('');
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [rename, setRename] = useState<null | { id: string; name: string }>(null);
  const [confirm, setConfirm] = useState<null | { title: string; desc: string; run: () => Promise<void> }>(null);
  const [moveFor, setMoveFor] = useState<LibraryFile | null>(null);
  const [moveKey, setMoveKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [hoverFolder, setHoverFolder] = useState<string | null>(null);
  const [hoverRevision, setHoverRevision] = useState<string | null>(null);
  const [draggingFile, setDraggingFile] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<LibData>({
    queryKey: ['library', org], queryFn: () => apiGet(orgApi(org, 'library')),
  });
  const invalidate = async () => { await qc.invalidateQueries({ queryKey: ['library', org] }); await refetch(); };

  const tree = useMemo(() => buildFolderTree(
    data?.projects || [],
    (data?.folders || []).map(f => ({ id: f.id, name: f.name, parent_key: f.parentKey, project_id: f.projectId })),
  ), [data]);
  const children = childrenOf(tree.folders, currentKey);
  const crumbs = breadcrumbs(tree.byKey, currentKey);
  const allFiles = data?.files || [];
  const folderFiles = q.trim()
    ? allFiles.filter(f => f.fileName.toLowerCase().includes(q.trim().toLowerCase()))
    : allFiles.filter(f => (f.folderKey || '') === currentKey);
  const groups = useMemo(() => {
    const m = new Map<string, LibraryFile[]>();
    for (const f of folderFiles) {
      const k = f.documentKey || f.id;
      const arr = m.get(k) || []; arr.push(f); m.set(k, arr);
    }
    return Array.from(m.values())
      .map(items => items.sort((a, b) => (b.revision || 1) - (a.revision || 1)))
      .sort((a, b) => String(b[0].createdAt).localeCompare(String(a[0].createdAt)));
  }, [folderFiles]);
  const fileCount = (key: string) => allFiles.filter(f => f.folderKey === key).length;
  const current = currentKey ? tree.byKey.get(currentKey) : null;
  const folderOptions = tree.folders.filter(f => f.key !== currentKey);

  async function run(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    try { await fn(); toast.push({ tone: 'success', title: ok }); await invalidate(); }
    catch (e: any) { toast.push({ tone: 'error', title: 'Could not save', description: e.message }); }
    finally { setBusy(false); setConfirm(null); setShowNew(false); setNewName(''); setRename(null); setMoveFor(null); }
  }

  async function uploadFiles(files: File[], folderKey = currentKey, revisionOf?: LibraryFile) {
    if (!files.length || uploading) return;
    setUploading(true);
    let ok = 0;
    const targetFolder = folderKey || revisionOf?.folderKey || currentKey;
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folderKey', targetFolder || '');
      if (revisionOf) {
        fd.append('recordId', revisionOf.recordId);
        fd.append('resource', revisionOf.resource);
        fd.append('supersedesId', revisionOf.id);
      }
      try {
        const res = await fetch(orgApi(org, 'files'), { method: 'POST', body: fd });
        if (!res.ok) { const b = await res.json().catch(() => ({ error: 'Upload failed' })); throw new Error(b.error); }
        ok++;
      } catch (e: any) { toast.push({ tone: 'error', title: `Could not upload ${file.name}`, description: e.message }); }
    }
    setUploading(false);
    if (revisionOf) setMoveFor(null);
    if (uploadRef.current) uploadRef.current.value = '';
    if (ok) { toast.push({ tone: 'success', title: `${ok} file${ok === 1 ? '' : 's'} added`, description: 'Revisions are kept together with the original.' }); await invalidate(); }
  }

  async function moveDroppedFile(fileId: string, folderKey: string, fromKey?: string) {
    if (!data?.canUpload || fromKey === folderKey) return;
    setBusy(true);
    try {
      await apiSend(orgApi(org, 'library'), 'POST', { action: 'moveFile', fileId, folderKey });
      toast.push({ tone: 'success', title: 'File moved', description: `Moved to ${tree.byKey.get(folderKey)?.name || 'folder'}.` });
      await invalidate();
    } catch (e: any) { toast.push({ tone: 'error', title: 'Could not move file', description: e.message }); }
    finally { setBusy(false); }
  }

  const resetDrag = () => { dragDepth.current = 0; setDropActive(false); setHoverFolder(null); setHoverRevision(null); };
  function pageDragEnter(e: React.DragEvent) {
    if (!data?.canUpload || uploading || !isExternalFileDrag(e)) return;
    e.preventDefault(); dragDepth.current += 1; setDropActive(true);
  }
  function pageDragOver(e: React.DragEvent) {
    if (!data?.canUpload || uploading || !isExternalFileDrag(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropActive(true);
  }
  function pageDragLeave(e: React.DragEvent) {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropActive(false);
  }
  function pageDrop(e: React.DragEvent) {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault(); resetDrag();
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length || !data?.canUpload || uploading) return;
    if (!currentKey) {
      toast.push({ tone: 'error', title: 'Choose a destination', description: 'Open a job folder, or drop the files directly onto a folder below.' });
      return;
    }
    void uploadFiles(files, currentKey);
  }
  function folderDrag(e: React.DragEvent, key: string) {
    const internal = isInternalFileDrag(e), external = isExternalFileDrag(e);
    if (!data?.canUpload || (!internal && !external)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = internal ? 'move' : 'copy';
    setHoverFolder(key); if (external) setDropActive(true);
  }
  function folderDrop(e: React.DragEvent, key: string) {
    const internal = isInternalFileDrag(e), external = isExternalFileDrag(e);
    if (!data?.canUpload || (!internal && !external)) return;
    e.preventDefault(); e.stopPropagation(); resetDrag();
    if (internal) {
      try {
        const payload = JSON.parse(e.dataTransfer.getData(DRAG_FILE_MIME) || '{}');
        if (payload.id) void moveDroppedFile(String(payload.id), key, payload.folderKey || undefined);
      } catch { toast.push({ tone: 'error', title: 'Could not move file', description: 'The drag information was incomplete.' }); }
      return;
    }
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void uploadFiles(files, key);
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/3"/><Skeleton className="h-96"/></div>;

  return <div className="relative space-y-4" data-testid="library-page"
    onDragEnter={pageDragEnter} onDragOver={pageDragOver} onDragLeave={pageDragLeave} onDrop={pageDrop}>
    {dropActive&&<Overlay kind="library-drop" className="pointer-events-none z-40 flex items-center justify-center bg-ink-950/25 p-6">
      <div className="flex items-center gap-3 rounded-xl border-2 border-brand-500 bg-white px-6 py-4 shadow-panel dark:bg-ink-900"><Icon name="CloudUpload" size={22} className="text-brand-600"/><div><p className="text-sm font-semibold">Drop files into {current?.name || 'a folder'}</p><p className="text-[11px] muted">Drop onto a folder card to upload there, or onto an existing file to create a new revision.</p></div></div>
    </Overlay>}

    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="heading">Document library</h1><p className="caption mt-1">One place for files: drag files in to upload, organise them in folders, and drop a new version onto an existing file.</p>
        <p className="mt-1 text-[11px] muted">Need just drawing numbers and revisions? <Link data-testid="library-register-link" href={`/${org}/m/documents`} className="font-medium text-brand-600 hover:underline dark:text-brand-300">Open document register</Link>.</p></div>
      <div className="flex items-center gap-2"><Badge tone="slate">{num(allFiles.length)} files</Badge><Button variant="ghost" size="icon" icon="RefreshCw" onClick={() => refetch()} aria-label="Refresh library"/></div>
    </div>

    <Card><div className="flex flex-wrap items-center gap-2 p-3">
      <button onClick={() => { setCurrentKey(''); setQ(''); }} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${!currentKey ? 'bg-slate-100 text-ink-900 dark:bg-ink-800 dark:text-white' : 'muted hover:bg-slate-50 dark:hover:bg-ink-800'}`}>All jobs</button>
      {crumbs.map(c => <span key={c.key} className="flex items-center gap-1.5"><Icon name="ChevronRight" size={13} className="text-slate-400"/>
        <button onClick={() => setCurrentKey(c.key)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${c.key === currentKey ? 'bg-slate-100 text-ink-900 dark:bg-ink-800 dark:text-white' : 'muted hover:bg-slate-50 dark:hover:bg-ink-800'}`}>{c.name}</button></span>)}
      <div className="relative ml-auto min-w-[190px] flex-1 sm:max-w-[260px]"><Icon name="Search" size={14} className="absolute left-3 top-2.5 text-slate-400"/>
        <input className="input pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Search all files…" aria-label="Search files"/></div>
    </div></Card>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold">{q.trim() ? `Search results for “${q.trim()}”` : current?.name || 'All jobs'}</p>
        <p className="mt-0.5 text-xs muted">{q.trim() ? `${folderFiles.length} matching file${folderFiles.length === 1 ? '' : 's'}` : `${children.length} folders · ${folderFiles.length} files here`}</p></div>
      {data?.canUpload && !q.trim() && <div className="flex flex-wrap gap-2">
        <Button size="sm" icon="Plus" onClick={() => setShowNew(v => !v)} disabled={!currentKey}>New folder</Button>
        <label className={`btn-primary btn-sm cursor-pointer ${!currentKey || uploading ? 'pointer-events-none opacity-60' : ''}`}><Icon name="Upload" size={14}/>{uploading ? 'Uploading…' : 'Upload files'}
          <input ref={uploadRef} type="file" multiple className="hidden" disabled={!currentKey || uploading} onChange={e => uploadFiles(Array.from(e.target.files || []))}/></label>
      </div>}
    </div>

    {data?.canUpload && !q.trim() && <FileDropZone compact title={currentKey ? 'Drop files into this folder' : 'Drop files onto a job folder below'}
      description="Or drag an existing document onto another folder to move it · up to 12 MB per file"
      disabled={!currentKey || uploading} uploading={uploading} onFiles={files => uploadFiles(files, currentKey)}/>}

    {showNew && currentKey && <Card><form className="flex flex-wrap items-end gap-3 p-4" onSubmit={e => { e.preventDefault(); run(() => apiSend(orgApi(org, 'library'), 'POST', { action: 'createFolder', name: newName, parentKey: currentKey }), 'Folder created'); }}>
      <div className="min-w-[220px] flex-1"><Field label="Folder name" required><input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Structural / Level 2" autoFocus/></Field></div>
      <Button type="submit" variant="primary" icon="Plus" loading={busy}>Create folder</Button><Button type="button" variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
    </form></Card>}

    {rename && <Card><form className="flex flex-wrap items-end gap-3 p-4" onSubmit={e => { e.preventDefault(); run(() => apiSend(orgApi(org, 'library'), 'POST', { action: 'renameFolder', id: rename.id, name: rename.name }), 'Folder renamed'); }}>
      <div className="min-w-[220px] flex-1"><Field label="New name" required><input className="input" value={rename.name} onChange={e => setRename({ ...rename, name: e.target.value })} autoFocus/></Field></div>
      <Button type="submit" variant="primary" icon="Save" loading={busy}>Save name</Button><Button type="button" variant="ghost" onClick={() => setRename(null)}>Cancel</Button>
    </form></Card>}

    {moveFor && <Card><form className="flex flex-wrap items-end gap-3 p-4" onSubmit={e => { e.preventDefault(); run(() => apiSend(orgApi(org, 'library'), 'POST', { action: 'moveFile', fileId: moveFor.id, folderKey: moveKey }), 'File moved'); }}>
      <div className="min-w-[220px] flex-1"><Field label={`Move “${moveFor.fileName}” to`} required><select className="select" value={moveKey} onChange={e => setMoveKey(e.target.value)}>
        <option value="">Choose a folder…</option>{folderOptions.map(f => <option key={f.key} value={f.key}>{breadcrumbs(tree.byKey, f.key).map(c => c.name).join(' / ') || f.name}</option>)}
      </select></Field></div><Button type="submit" variant="primary" icon="ArrowRight" loading={busy} disabled={!moveKey}>Move</Button><Button type="button" variant="ghost" onClick={() => setMoveFor(null)}>Cancel</Button>
    </form></Card>}

    {!q.trim() && children.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children.map(f => <div key={f.key}
      data-testid="library-folder-drop"
      onDragEnter={e => folderDrag(e, f.key)} onDragOver={e => folderDrag(e, f.key)}
      onDragLeave={e => { e.stopPropagation(); if (hoverFolder === f.key) setHoverFolder(null); }}
      onDrop={e => folderDrop(e, f.key)}
      className={`rounded-lg transition ${hoverFolder === f.key ? 'ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-ink-950' : ''}`}>
      <Card className="p-3.5">
        <div className="flex items-start gap-3">
          <button onClick={() => setCurrentKey(f.key)} className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-label={`Open ${f.name}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name={f.icon || 'FolderOpen'} size={17}/></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{f.name}</span><span className="mt-0.5 block text-[11px] muted">{fileCount(f.key)} file{fileCount(f.key) === 1 ? '' : 's'} · {childrenOf(tree.folders, f.key).length} subfolder{childrenOf(tree.folders, f.key).length === 1 ? '' : 's'}</span></span>
          </button>
          {f.custom && data?.canUpload && <span className="flex shrink-0 gap-0.5">
            <button className="rounded-md p-1.5 muted hover:bg-slate-100 dark:hover:bg-ink-800" title="Rename folder" aria-label={`Rename ${f.name}`} onClick={() => setRename({ id: f.key.slice(2), name: f.name })}><Icon name="Pencil" size={13}/></button>
            {data?.canDelete && <button className="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="Delete folder" aria-label={`Delete ${f.name}`} onClick={() => setConfirm({ title: `Delete ${f.name}?`, desc: 'Only empty folders can be deleted. Move the files out first.', run: async () => { await apiSend(orgApi(org, 'library'), 'POST', { action: 'deleteFolder', id: f.key.slice(2) }); } })}><Icon name="Trash2" size={13}/></button>}
          </span>}
        </div>
        {hoverFolder === f.key && <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300"><Icon name="FolderInput" size={12}/>Release to drop here</p>}
      </Card>
    </div>)}</div>}

    <Card className="overflow-hidden"><CardHead title={q.trim() ? 'Matching files' : 'Files in this folder'} subtitle="Drag a document onto a folder to move it · drop a file onto a card to create a new revision"
      action={<Badge tone="slate">{groups.length} document{groups.length === 1 ? '' : 's'}</Badge>}/>
      {!groups.length ? <div className="p-5"><EmptyState compact icon="FolderOpen" title={q.trim() ? 'No files match' : 'This folder is empty'} description={q.trim() ? 'Try a different file name.' : currentKey ? 'Drop files above, or create a subfolder to get started.' : 'Open a job to see its automatic folders.'}/></div> :
      <div className="divide-y divider">{groups.map(items => { const cur = items[0]; const older = items.slice(1);
        return <div key={cur.documentKey || cur.id}
          className={`p-3.5 transition ${hoverRevision === cur.id ? 'bg-brand-50/70 dark:bg-brand-500/10' : ''} ${draggingFile === cur.id ? 'opacity-50' : ''}`}
          onDragOver={e => { if (data?.canUpload && isExternalFileDrag(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect='copy'; setHoverRevision(cur.id); } }}
          onDragLeave={e => { if (isExternalFileDrag(e)) { e.preventDefault(); e.stopPropagation(); if (hoverRevision === cur.id) setHoverRevision(null); } }}
          onDrop={e => { if (data?.canUpload && isExternalFileDrag(e)) { e.preventDefault(); e.stopPropagation(); resetDrag(); void uploadFiles(Array.from(e.dataTransfer.files || []), cur.folderKey || currentKey, cur); } }}>
          <div className="flex flex-wrap items-center gap-3">
            {data?.canUpload&&<span draggable title="Drag to another folder" aria-label={`Drag ${cur.fileName} to a folder`}
              onDragStart={e => {
                e.dataTransfer.setData(DRAG_FILE_MIME, JSON.stringify({ id: cur.id, fileName: cur.fileName, folderKey: cur.folderKey }));
                e.dataTransfer.setData('text/plain', cur.fileName); e.dataTransfer.effectAllowed = 'move'; setDraggingFile(cur.id);
              }}
              onDragEnd={() => { setDraggingFile(null); setHoverFolder(null); }}
              className="cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-800"><Icon name="GripVertical" size={15}/></span>}
            {cur.mime?.startsWith('image/') ? <img src={orgApi(org, `files/${cur.id}`)} alt={cur.fileName} className="h-10 w-10 shrink-0 rounded-md object-cover"/>
              : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-ink-500 dark:bg-ink-800"><Icon name={cur.mime?.includes('pdf') ? 'FileText' : 'FileImage'} size={17}/></span>}
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-semibold">{cur.fileName}</p><Badge tone="green">{cur.revisionLabel || 'Rev A'}</Badge>{older.length > 0 && <Badge tone="slate">{older.length} older</Badge>}{hoverRevision === cur.id && <Badge tone="blue">Drop for new revision</Badge>}</div>
              <p className="mt-0.5 truncate text-[11px] muted">{Math.max(1, Math.round(cur.size / 1024))} KB · {cur.uploadedByName} · {date(cur.createdAt)}{cur.note ? ` · ${cur.note}` : ''}{q.trim() && cur.folderKey ? ` · ${breadcrumbs(tree.byKey, cur.folderKey).map(c => c.name).join(' / ')}` : ''}</p></div>
            <div className="flex shrink-0 gap-1">
              <a href={orgApi(org, `files/${cur.id}`)} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon="Download">Open</Button></a>
              <a href={`/${org}/m/${cur.resource}?open=${encodeURIComponent(cur.recordId)}`}><Button size="sm" variant="ghost" icon="Link2">Record</Button></a>
              {data?.canUpload && <><label className="btn-outline btn-sm cursor-pointer"><Icon name="GitBranch" size={13}/>New revision<input type="file" className="hidden" onChange={e => uploadFiles(Array.from(e.target.files || []), cur.folderKey || currentKey, cur)}/></label>
                <Button size="sm" variant="ghost" icon="ArrowRight" aria-label={`Move ${cur.fileName}`} title="Move to folder" onClick={() => { setMoveFor(cur); setMoveKey(''); }}/></>}
              {data?.canDelete && <Button size="sm" variant="ghost" className="text-red-600" icon="Trash2" aria-label={`Delete ${cur.fileName}`} onClick={() => setConfirm({ title: `Delete ${cur.fileName}?`, desc: 'The file and its revisions will be removed from storage.', run: async () => { await apiSend(orgApi(org, `files/${cur.id}`), 'DELETE'); } })}/>}
            </div>
          </div>
          {older.length > 0 && <div className="mt-2 space-y-1 border-t divider pt-2">{older.map(o => <div key={o.id} className="flex items-center gap-2 text-[11px]"><Badge tone="slate">{o.revisionLabel}</Badge><span className="min-w-0 flex-1 truncate muted">{o.note || o.fileName} · {o.uploadedByName} · {date(o.createdAt)}</span><a href={orgApi(org, `files/${o.id}`)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Open</a>{data?.canDelete && <button className="text-red-500" title="Remove revision" aria-label={`Delete ${o.revisionLabel}`} onClick={() => setConfirm({ title: `Delete ${o.revisionLabel}?`, desc: 'This older revision will be removed.', run: async () => { await apiSend(orgApi(org, `files/${o.id}`), 'DELETE'); } })}><Icon name="Trash2" size={12}/></button>}</div>)}</div>}
        </div>; })}</div>}
    </Card>

    <Card><CardHead title="How folders are arranged" subtitle="Automatic structure plus your own folders"/><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {[['FolderOpen', 'One folder per job', 'Every job gets its own space automatically — no setup needed.'], ['CloudUpload', 'Drop to upload', 'Drop one or many files into the current folder or straight onto a folder card.'], ['FolderInput', 'Drag to organise', 'Drag a document by its handle onto another folder; every revision moves together.'], ['GitBranch', 'Drop a revision', 'Drop a replacement file onto an existing document to create the next revision.']].map(([i, t, d]) => <div key={t} className="rounded-md border divider p-3"><Icon name={i} size={17} className="text-brand-600"/><p className="mt-2 text-xs font-semibold">{t}</p><p className="mt-1 text-[11px] leading-relaxed muted">{d}</p></div>)}
    </div></Card>

    <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy} title={confirm?.title || ''} description={confirm?.desc}
      onConfirm={() => confirm && run(confirm.run, 'Done')}/>
  </div>;
}

function num(v: unknown) { return Number(v || 0).toLocaleString('en-ZW'); }
