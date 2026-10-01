#!/usr/bin/env python3
"""c42b it4-B registry edits (run3 nok/thana triage, 1 Oct) — idempotent; applies to the registry given as argv[1] in place.
Every edit cites the product line that proves it (§15 (b): hiddenFor follows the REAL permission model; no expectation weakened
for a role that holds the key)."""
import json, sys
p = sys.argv[1]
d = json.load(open(p))
rows = d['rows']
def row(page, tid):
    hits = [r for r in rows if r['testid'] == tid and r['page'] == page]
    assert len(hits) == 1, (page, tid, len(hits))
    return hits[0]
n = 0
def setf(r, k, v):
    global n
    if r.get(k) != v:
        r[k] = v; n += 1
def hide(r, users):
    for u in users:
        if u in (r.get('roles') or []):
            setf(r, 'roles', [x for x in r['roles'] if x != u])
        if u not in (r.get('hiddenFor') or []):
            setf(r, 'hiddenFor', list(r.get('hiddenFor') or []) + [u])
# B1 (run3 nok/thana /contacts · 4 dead each): the wildcard rows `contacts-*-reason/-confirm` (DangerFields — ContactListTools.tsx
#    `contacts-${kind}-reason/-confirm`, kind = bulk-assign | export) were opened ONLY through `contacts-export-btn`, which is rendered
#    only with crm.contact.export (contacts/page.tsx `exportCsv` · `{can.exportCsv && <ContactExportButton/>}`; QC1 nok/thana = false,
#    facts10.mts). Hiding the rows for nok/thana is WRONG (dbg4 contacts-nok: the same rows are what PREFILL types into the bulk-assign
#    dialog ⇒ contacts-bulk-assign-submit refused "ใส่เหตุผลอย่างน้อย 5 ตัวอักษร"). The bulk-assign dialog (crm.contact.update — all four
#    personas, `canAssign`) is the instance every role can reach ⇒ open the rows through it; the export instance stays covered by
#    PREFILL before contacts-export-submit (owner/manager).
for t in ['contacts-*-reason', 'contacts-*-confirm']:
    r = row('/contacts', t)
    setf(r, 'roles', ['owner', 'manager', 'nok', 'thana'])
    setf(r, 'hiddenFor', [])
    setf(r, 'opener', ['contacts-*-select', 'contacts-bulk-assign-btn'])
# B2 (run3 nok/thana /contacts/new · dead + wrongExpect): the company picker searches searchCompaniesAction → companyOptions →
#    companyWhere (contacts-actions.ts searchCompaniesAction · contacts.ts companyOptions) — without crm.company.read the result
#    is always empty ("ไม่พบรายการ…", fail shot run3-nok-fail/_contacts_new~contact-pick-_-q~nok~desktop.png). §15 (b): the
#    persona lacks the key that gates the control ⇒ hiddenFor. The product still RENDERS the picker for them ⇒ hiddenLeak = PRODUCT
#    finding F3 (C4.2-fix class, like F1) until the form hides it.
for t in ['contact-pick-*-q', 'contact-pick-*-select']:
    hide(row('/contacts/new', t), ['nok', 'thana'])
# B3 (dbg4 customer — run3 never reached the portal): `portal-slip-upload` sits in PortalPayActions next to `portal-pay-promptpay`
#    (PortalClientBits.tsx PortalPayActions: `if (!props.canPay) return null;` — rendered only for an OUTSTANDING invoice); QC1's
#    portal company has no account invoice (portal-invoice-row / portal-pay-promptpay already skippedNeeds) ⇒ same `needs`.
setf(row('/b/[slug]/invoices', 'portal-slip-upload'), 'needs', row('/b/[slug]/invoices', 'portal-pay-promptpay')['needs'])
# B4 (dbg5 customer, after the runner's portal [id] fix — page 200 on the portal company's record CT-2569-001): the file list renders
#    only when the record has files (documents/[id]/page.tsx `{rec.files.length > 0 && …portal-record-file}`) and the change form only
#    when a field is portalVisible + portalEditable (PortalClientBits.tsx PortalRecordChange `if (props.fields.length === 0) return null`
#    · portal.ts recordFields/portalEditable) — QC1's contract object has neither (fail shot dbg5-fail/_b_slug_documents_id_~…) ⇒ `needs`.
#    Coverage gap, not a pass: a runner-owned portal-editable field + file link would be needed to press them.
NEED_FILE = 'ไฟล์แนบ (CrmFileLink RECORD) บนระเบียนวัตถุที่เปิดพอร์ทัลของบริษัท [companyId] — ซีดไม่มี'
NEED_EDIT = 'ฟิลด์ของวัตถุที่ portalVisible + portalEditable (ไม่ใช่ FILE/LOOKUP) บนระเบียนที่เปิดพอร์ทัล — ซีดไม่มี'
setf(row('/b/[slug]/documents/[id]', 'portal-record-file'), 'needs', NEED_FILE)
for t in ['portal-record-change-field', 'portal-record-change-value', 'portal-record-change-submit']:
    setf(row('/b/[slug]/documents/[id]', t), 'needs', NEED_EDIT)
open(p, 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
print(f'it4-B registry edits: {n} field changes')
