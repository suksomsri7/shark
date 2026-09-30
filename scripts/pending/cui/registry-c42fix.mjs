// CRM C4.2-fix ▸ one-shot registry edit (ruling §15: hiddenFor = real permissions) — nok/thana (seed: contact read/create/update ·
//   deal read/create/move · activity create/complete) do NOT hold the keys that gate these controls ⇒ move them from roles to hiddenFor.
//   Idempotent · keeps the file's JSON.stringify(…, 2) + "\n" format · prints every change.
import { readFileSync, writeFileSync } from "node:fs";
const PATH = "scripts/crm-ui-inventory.json";
const src = readFileSync(PATH, "utf8");
const o = JSON.parse(src);
const STAFF = ["nok", "thana"];
const exact = new Set([
  // /contacts — B1 import/export (crm.contact.import/export) · bulk assign + its check boxes (crm.contact.assign)
  "contacts-import-btn", "contacts-import-file", "contacts-import-map", "contacts-import-duplicate", "contacts-import-submit", "contacts-import-cancel",
  "contacts-export-btn", "contacts-export-submit", "contacts-export-cancel", "contacts-*-reason", "contacts-*-confirm",
  "contacts-select-all", "contacts-row-select", "contacts-card-select",
  "contacts-bulk-assign-btn", "contacts-bulk-clear", "contacts-bulk-assign-owner", "contacts-bulk-assign-submit", "contacts-bulk-assign-cancel",
  // /contacts/[contactId] — B5 convert (crm.contact.convert) · owner sheet (crm.contact.assign) · merge sheet (crm.contact.merge)
  "contact-owner-select", "contact-merge-reason", "contact-merge-confirm", "crm-merge-choice",
  // /activities — B2 delete (crm.activity.delete)
  "activity-row-delete", "activity-row-delete-reason", "activity-row-delete-confirm", "activity-row-delete-submit",
  // /deals?view=table — B6 export (crm.deal.export) · reassign (crm.deal.reassign) · tag (crm.deal.update)
  "deal-export-btn", "deal-bulk-owner", "deal-bulk-reassign", "deal-bulk-tag-input", "deal-bulk-tag",
  // /deals/[dealId] — quote/invoice (crm.deal.quote) · fields editor (crm.deal.update) · owner (reassign) · forecast · lines · menu/delete/pipeline
  "deal-quote-btn", "deal-invoice-btn", "deal-title-input", "deal-title-save", "deal-value-input", "deal-value-save", "deal-close-input", "deal-close-save",
  "deal-owner-select", "deal-forecast-select", "deal-next-step-input", "deal-next-step-save",
  "deal-line-name-*", "deal-line-qty-*", "deal-line-price-*", "deal-line-discount-*", "deal-line-remove-*", "deal-line-add", "deal-line-vat-*", "deal-line-note-*",
  "deal-lines-discount", "deal-lines-save", "deal-menu", "deal-delete-btn", "deal-delete-reason", "deal-delete-confirm", "deal-delete-cancel", "deal-delete-submit",
  "deal-change-pipeline", "deal-change-pipeline-btn",
  "crm-ai-deal-next-step",
  // /objects/[key] — B4: for the SEEDED personas the whole /objects pages 404 (they lack crm.record.read), so the link is
  //   never visible to them; B4 itself (parent link only when the viewer can open the parent) is proven by probe-b4-parent.mts
  //   (review addendum 1, 30 Sep — reason text corrected; the row move is unchanged)
  "object-record-parent-link",
]);
const isTarget = (r) => exact.has(r.testid) || r.testid.startsWith("contact-convert-");
let changed = 0;
for (const r of o.rows) {
  if (!isTarget(r)) continue;
  const before = JSON.stringify({ roles: r.roles, hiddenFor: r.hiddenFor });
  r.roles = r.roles.filter((x) => !STAFF.includes(x));
  r.hiddenFor = [...new Set([...(r.hiddenFor ?? []), ...STAFF])].sort((a, b) => ["owner", "manager", "nok", "thana", "customer"].indexOf(a) - ["owner", "manager", "nok", "thana", "customer"].indexOf(b));
  const after = JSON.stringify({ roles: r.roles, hiddenFor: r.hiddenFor });
  if (before !== after) {
    changed++;
    console.log(`${r.page.padEnd(22)} ${r.testid.padEnd(34)} ${before} → ${after}`);
  }
}
const missing = [...exact].filter((t) => !o.rows.some((r) => r.testid === t));
if (missing.length) console.log(`(not in registry: ${missing.join(", ")})`);
writeFileSync(PATH, JSON.stringify(o, null, 2) + "\n");
console.log(`${changed} rows changed`);
