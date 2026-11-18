import assert from "node:assert/strict";
import {
  apiOrigin,
  canCreate,
  canReceive,
  canUpdate,
  canUpload,
  minorUnits,
  priceLines,
  validDate,
  visibleSections,
  writable,
  type Meta,
} from "../src/core";
import { bearerCredential } from "../../../src/lib/bearer-auth";
import { permissionsFor, resolveWorkspace } from "../../../src/lib/catalog";
import { RESOURCES } from "../../../src/lib/resources";
const config = resolveWorkspace({
  companyType: "GENERAL_CONTRACTOR",
  size: "SMALL",
  qualifiers: [],
});
const meta: Meta = {
  org: { name: "Test", slug: "test", baseCurrency: "USD" },
  config,
  permissions: permissionsFor("OWNER", config.resources),
  user: {},
};
for (const section of visibleSections(meta)) {
  const def = RESOURCES.find((r) => r.id === section.id)!;
  assert.ok(config.modules.includes(def.module));
  assert.equal(
    visibleSections({
      ...meta,
      config: {
        ...config,
        modules: config.modules.filter((m) => m !== def.module),
      },
    }).some((s) => s.id === section.id),
    false,
  );
}
assert.equal(
  visibleSections({
    ...meta,
    permissions: { read: [], write: [], capabilities: [] },
  }).length,
  0,
);
for (const billing of [
  { access: false },
  { writable: false },
  { readOnly: true },
])
  assert.equal(writable({ ...meta, billing }, "clients"), false);
const noCaps = {
  ...meta,
  permissions: { ...meta.permissions, capabilities: [] },
};
assert.equal(canCreate(noCaps, "clients"), false);
assert.equal(canUpdate(noCaps, "projects"), false);
assert.equal(canUpload(noCaps, "projects"), false);
assert.equal(canReceive(noCaps), false);
assert.equal(apiOrigin("https://app.myla.co.zw/"), "https://app.myla.co.zw");
for (const url of [
  undefined,
  "http://localhost",
  "https://user:pass@example.com",
  "https://example.com/path",
  "https://example.com/?x=1",
  "https://example.com/#x",
])
  assert.throws(() => apiOrigin(url));
assert.equal(minorUnits("10.01"), 1001);
for (const n of ["0", "-1", "1.001", "NaN", "1e5", "99999999999999999"])
  assert.throws(() => minorUnits(n));
assert.equal(validDate("2028-02-29"), true);
assert.equal(validDate("2026-02-29"), false);
assert.equal(validDate("2026-13-01"), false);
const lines = [
  { description: "Brickwork", qty: "2", unit: "m²", rate: "10.25" },
];
assert.deepEqual(priceLines(lines, "20"), {
  items: [
    {
      description: "Brickwork",
      detail: "",
      qty: 2,
      unit: "m²",
      unitPrice: 10.25,
      total: 20.5,
    },
  ],
  subtotal: 20.5,
  markup: 20,
  total: 24.6,
});
assert.throws(() => priceLines([], "0"));
assert.throws(() => priceLines([{ ...lines[0], qty: "-1" }], "0"));
assert.throws(() => priceLines([{ ...lines[0], rate: "1e308" }], "0"));
assert.deepEqual(bearerCredential(null), { present: false, token: null });
assert.deepEqual(bearerCredential("Bearer abc.def.ghi"), {
  present: true,
  token: "abc.def.ghi",
});
for (const header of ["", "Basic abc", "Bearer ", "Bearer a b", "Bearer abc\n"])
  assert.deepEqual(bearerCredential(header), { present: true, token: null });
console.log(
  "Native core, role/module visibility, money, date and credential tests passed.",
);
