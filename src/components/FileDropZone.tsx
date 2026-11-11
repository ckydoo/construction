'use client';
/* A polished, keyboard-accessible file target. Native HTML5 drag events are
 * used deliberately: no extra dependency, no global drag library, and the
 * hidden input remains available on touch devices and for assistive tech. */
import { useRef, useState } from 'react';
import { Button, Icon } from './ui';

export function isExternalFileDrag(e: React.DragEvent) {
  try { return Array.from(e.dataTransfer.types || []).includes('Files'); }
  catch { return false; }
}

export default function FileDropZone({
  onFiles, uploading = false, disabled = false, compact = false,
  title = 'Drop files here', description = 'or choose files from your device · up to 12 MB each',
  className = '', multiple = true, accept,
}: {
  onFiles: (files: File[]) => void | Promise<void>;
  uploading?: boolean; disabled?: boolean; compact?: boolean;
  title?: string; description?: string; className?: string;
  multiple?: boolean; accept?: string;
}) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { depth.current = 0; setActive(false); };
  const onDragEnter = (e: React.DragEvent) => {
    if (disabled || !isExternalFileDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    depth.current += 1; setActive(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (disabled || !isExternalFileDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy'; setActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (disabled || !isExternalFileDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (disabled || !isExternalFileDrag(e)) return;
    e.preventDefault(); e.stopPropagation(); reset();
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.size > 0);
    if (files.length) void onFiles(files);
  };

  return <div
    data-testid="file-drop-zone"
    onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
    className={`relative overflow-hidden rounded-lg border-2 border-dashed transition ${active
      ? 'border-brand-500 bg-brand-50/90 shadow-panel dark:bg-brand-500/10'
      : 'border-slate-300 bg-gradient-to-br from-slate-50 to-white hover:border-brand-400 dark:border-ink-700 dark:from-ink-900 dark:to-ink-950'} ${disabled ? 'opacity-60' : ''} ${compact ? 'p-3' : 'p-6'} ${className}`}
  >
    <div className="flex flex-wrap items-center gap-3">
      <span className={`flex shrink-0 items-center justify-center rounded-lg border ${active
        ? 'border-brand-300 bg-white text-brand-600 dark:bg-ink-900 dark:text-brand-300'
        : 'divider bg-white text-brand-600 dark:bg-ink-900 dark:text-brand-300'} ${compact ? 'h-9 w-9' : 'h-12 w-12'}`}>
        {uploading ? <Icon name="Loader2" size={compact ? 17 : 21} className="animate-spin"/> : <Icon name="CloudUpload" size={compact ? 17 : 21}/>}
      </span>
      <div className="min-w-[180px] flex-1">
        <p className={`${compact ? 'text-[12px]' : 'text-sm'} font-semibold text-ink-900 dark:text-white`}>
          {uploading ? 'Uploading files…' : active ? 'Release to add these files' : title}
        </p>
        <p className="mt-0.5 text-[11px] muted">{disabled ? 'Open a job folder first, or drop files directly onto a folder below.' : description}</p>
      </div>
      <Button type="button" size="sm" variant="outline" icon="Upload" disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}>Choose files</Button>
      <input ref={inputRef} type="file" multiple={multiple} accept={accept} className="hidden"
        disabled={disabled || uploading}
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length) void onFiles(files);
          e.target.value = '';
        }}/>
    </div>
    {active && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-brand-500/5 text-[11px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">Drop to upload</div>}
  </div>;
}
