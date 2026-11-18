export type RecordRow = Record<string, any> & { id: string };
export type Membership = { orgSlug: string; orgName: string; role: string };
export type Meta = {
  org: { name: string; slug: string; baseCurrency: string };
  config: {
    modules: string[];
    resources: string[];
    tax?: { enabled: boolean; rate: number };
    currency?: { enabled: string[] };
  };
  permissions: { read: string[]; write: string[]; capabilities: string[] };
  billing?: { access?: boolean; writable?: boolean; readOnly?: boolean };
  user: { temporaryPassword?: boolean };
};
export const sections = [
  {
    id: "projects",
    label: "Jobs",
    icon: "hammer-outline",
    action: "Create job",
  },
  {
    id: "estimates",
    label: "Quotations",
    icon: "document-text-outline",
    action: "Create quotation",
  },
  {
    id: "arInvoices",
    label: "Invoices",
    icon: "wallet-outline",
    action: "Create invoice",
  },
  {
    id: "clients",
    label: "Clients",
    icon: "people-outline",
    action: "Add client",
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "checkbox-outline",
    action: "Update task",
  },
  {
    id: "payments",
    label: "Payments",
    icon: "cash-outline",
    action: "Record payment",
  },
] as const;
const modules: Record<string, string> = {
  projects: "projects",
  tasks: "projects",
  estimates: "estimating",
  arInvoices: "finance",
  payments: "finance",
  clients: "crm",
};
export function enabled(meta: Meta, resource: string) {
  return (
    meta.config.resources.includes(resource) &&
    (!modules[resource] || meta.config.modules.includes(modules[resource]))
  );
}
export function visibleSections(meta: Meta) {
  return sections.filter(
    (s) => enabled(meta, s.id) && meta.permissions.read.includes(s.id),
  );
}
export function writable(meta: Meta, resource: string) {
  return (
    meta.billing?.access !== false &&
    meta.billing?.writable !== false &&
    !meta.billing?.readOnly &&
    enabled(meta, resource) &&
    meta.permissions.write.includes(resource)
  );
}
export function canReceive(meta: Meta) {
  return (
    writable(meta, "payments") &&
    writable(meta, "arInvoices") &&
    ["records.create", "records.update"].every((c) =>
      meta.permissions.capabilities.includes(c),
    )
  );
}
export function apiOrigin(raw: string | undefined) {
  if (!raw)
    throw new Error(
      "The app has no API address. Ask the build administrator to configure it.",
    );
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error("Use an HTTPS API origin without a path or credentials.");
  return url.origin;
}
export const round = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export type Line = {
  description: string;
  qty: string;
  unit: string;
  rate: string;
};
export function priceLines(lines: Line[], markup: string) {
  const pct = Number(markup || 0);
  if (!Number.isFinite(pct) || pct < 0 || pct > 1000)
    throw new Error("Enter an added-to-cost percentage between 0 and 1000.");
  if (!lines.length || lines.length > 80)
    throw new Error("Add between 1 and 80 work items.");
  const items = lines.map((l) => {
    const qty = Number(l.qty),
      unitPrice = Number(l.rate);
    if (
      !l.description.trim() ||
      !l.qty.trim() ||
      !l.rate.trim() ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    )
      throw new Error(
        "Each item needs a description, positive quantity and a valid price.",
      );
    return {
      description: l.description.trim(),
      detail: "",
      qty,
      unit: l.unit.trim(),
      unitPrice,
      total: round(qty * unitPrice),
    };
  });
  const subtotal = round(items.reduce((n, l) => n + l.total, 0));
  const total = round(subtotal * (1 + pct / 100));
  if (!Number.isSafeInteger(Math.round(total * 100)))
    throw new Error("The total exceeds the supported amount.");
  return { items, markup: pct, subtotal, total };
}
export function minorUnits(raw: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(raw.trim()))
    throw new Error("Use an amount with up to two decimal places.");
  const [whole, fraction = ""] = raw.trim().split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error("Enter a positive amount within the supported range.");
  return n;
}
export const money = (value: unknown, currency = "USD") =>
  `${currency} ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function validDate(value: string) {
  const d = new Date(value + "T00:00:00Z");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(d.valueOf()) &&
    d.toISOString().slice(0, 10) === value
  );
}

export function canCreate(meta: Meta, resource: string) {
  return (
    writable(meta, resource) &&
    meta.permissions.capabilities.includes("records.create")
  );
}
export function canUpdate(meta: Meta, resource: string) {
  return (
    writable(meta, resource) &&
    meta.permissions.capabilities.includes("records.update")
  );
}
export function canUpload(meta: Meta, resource: string) {
  return (
    writable(meta, resource) &&
    meta.permissions.capabilities.includes("files.upload")
  );
}
