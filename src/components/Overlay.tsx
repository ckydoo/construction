'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full-viewport overlay root.
 *
 * Portalling to document.body keeps the fixed layer out of page-level spacing
 * (for example `space-y-4`, which otherwise adds a 16px top margin) and out of
 * any transformed/filtered ancestor stacking context. The explicit zero margin
 * is a second guard so the faded backdrop always starts at viewport y=0.
 */
type OverlayProps = React.HTMLAttributes<HTMLDivElement> & { kind?: string };

export default function Overlay({ children, className = '', style, kind, ...rest }: OverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-overlay-root
      data-overlay-kind={kind}
      className={`fixed inset-0 !m-0 ${className}`}
      style={{ ...style, margin: 0 }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}
