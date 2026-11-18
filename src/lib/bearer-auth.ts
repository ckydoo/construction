/** An explicitly supplied credential must never fall back to a cookie session. */
export function bearerCredential(header: string | null): {
  present: boolean;
  token: string | null;
} {
  if (header === null) return { present: false, token: null };
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(header);
  return {
    present: true,
    token: match && match[0] === header ? match[1] : null,
  };
}
