// CRM C4.2-fix r2 ▸ registry re-derivation after the SF-3 re-ruling (30 Sep): contact assign/bulk-assign now checks
//   crm.contact.update (action = service) — nok/thana HOLD it ⇒ the assign controls are visible to them again.
//   `contacts-*-reason` / `contacts-*-confirm` are shared by the bulk-assign and export sheets ⇒ visible via bulk-assign.
//   Idempotent · keeps JSON.stringify(…, 2) + "\n".
import { readFileSync, writeFileSync } from "node:fs";
const PATH = "scripts/crm-ui-inventory.json";
const o = JSON.parse(readFileSync(PATH, "utf8"));
const ORDER = ["owner", "manager", "nok", "thana", "customer"];
const sort = (a) => [...new Set(a)].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
const back = new Set([
  "contacts-select-all", "contacts-row-select", "contacts-card-select",
  "contacts-bulk-assign-btn", "contacts-bulk-clear", "contacts-bulk-assign-owner", "contacts-bulk-assign-submit", "contacts-bulk-assign-cancel",
  "contacts-*-reason", "contacts-*-confirm", "contact-owner-select",
]);
let changed = 0;
for (const r of o.rows) {
  if (!back.has(r.testid)) continue;
  const before = JSON.stringify({ roles: r.roles, hiddenFor: r.hiddenFor });
  r.roles = sort([...r.roles, "nok", "thana"]);
  r.hiddenFor = (r.hiddenFor ?? []).filter((x) => x !== "nok" && x !== "thana");
  const after = JSON.stringify({ roles: r.roles, hiddenFor: r.hiddenFor });
  if (before !== after) { changed++; console.log(`${r.page.padEnd(22)} ${r.testid.padEnd(32)} ${before} → ${after}`); }
}
writeFileSync(PATH, JSON.stringify(o, null, 2) + "\n");
console.log(`${changed} rows changed`);
