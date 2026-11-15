'use client';
/* Last-resort error page — replaces the root layout, so inline styles only. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui,-apple-system,sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <p style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>MYLA · Something went wrong</p>
            <h1 style={{ fontSize: 24, margin: '12px 0', fontWeight: 600 }}>That didn’t work</h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569' }}>A technical problem stopped the page loading. Your work is saved.{error?.digest ? ` Quote reference ${error.digest} when contacting support.` : ''}</p>
            <button onClick={reset} style={{ marginTop: 20, border: 0, borderRadius: 8, background: '#c9700c', color: '#fff', padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
