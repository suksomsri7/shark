#!/usr/bin/env python3
"""c42b it6 registry edits (run5 triage, 2 Oct) — PROPOSAL, applied only to scripts/pending/c42b/next-it6/crm-ui-inventory.json
(scripts/ and next/ stay frozen until the controller rules). Idempotent. Each edit cites the run5 evidence."""
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
def setexp(r, **kw):
    e = dict(r['expect'])
    for k, v in kw.items():
        if v is None: e.pop(k, None)
        else: e[k] = v
    setf(r, 'expect', e)
def hide(r, users):
    for u in users:
        if u in (r.get('roles') or []): setf(r, 'roles', [x for x in r['roles'] if x != u])
        if u not in (r.get('hiddenFor') or []): setf(r, 'hiddenFor', list(r.get('hiddenFor') or []) + [u])

# W1 score bands (owner/manager d+m): every field typed "5" ⇒ hot == warm ⇒ VALIDATION "คะแนน 'ร้อน' ต้องมากกว่าคะแนน 'อุ่น'" (scoring.ts
#    setScoringSettings) shown in a non-alert line — the save never wrote (no AuditLog crm.score.settings). Give it a valid band.
setf(row('/settings/scoring', 'crm-score-bands-save'), 'opener', ['crm-score-band-hot=60', 'crm-score-band-warm=30'])
# W2 deal bulk move (4 roles d+m): the target select kept its first option = the ticked deal's CURRENT stage ⇒ moveCore no-op
#    (deals.ts `if (done) return { changed: false }`), UI still says "ย้ายขั้นสำเร็จ 1 ดีล". Pick another stage first.
#    dbg15: "=*" picks the first non-empty option = stage #1 = still the ticked deal's stage (select starts at "") ⇒ "=#2"
#    (new runner value form: N-th non-empty option). The first ticked row in the QC seed is a stage-1 deal for every role.
setf(row('/deals', 'deal-bulk-move'), 'opener', ['deal-row-check-*=on', 'deal-bulk-stage=#2'])
# W3 object import (owner/manager d+m): the CSV had no valid parent ⇒ "นำเข้าสัญญาแล้ว 0 รายการ · ข้าม 1 แถว — ไม่พบบริษัทที่เลือก";
#    the runner now writes title,parentId=<shared company> (fillValueFor object-import-text + qc-btn-object-import.csv)
for t in ['object-import-form', 'object-import-submit']:
    setf(row('/objects/[key]', t), 'opener', ['object-import-btn', 'object-import-text=*'])
# W4 e-mail attach-to-contact (manager d+m): the thread page offers the search + pick to every viewer (emails/[threadKey]/page.tsx
#    `canAttach: !contactId`) but attachToContact runs assertUnmatchedGate (emails.ts) ⇒ the unit-scoped manager is always refused
#    ("กล่อง 'ยังไม่จับคู่' เปิดได้เฉพาะ…"). §15(b): the role lacks the gate ⇒ hiddenFor manager (same gate as crm-emails-tab-unmatched,
#    it4a sweep) — the product still renders it ⇒ hiddenLeak = PRODUCT P-it6-1 until fixed.
for t in ['crm-email-attach-contact-q', 'crm-email-attach-contact-go', 'crm-email-attach-contact-pick']:
    hide(row('/emails/[threadKey]', t), ['manager'])
# W5 webhook delete (owner d+m): the endpoint IS deleted; "<ลบแล้ว>" was not a delete keyword for the model-written check
setexp(row('/settings/api', 'crm-api-hook-delete-*'), db='WebhookEndpoint ถูกลบ · AuditLog crm.api.manage')
# V1 (new VACUOUS object-archive-confirm-key/-reason): runner drops the it5 empty-object fixture; object-edit-key asserts the rule
#    on the seed object (ObjectsAdmin.tsx `disabled={item.recordCount > 0}` — the key is immutable while records exist)
r = row('/settings/objects', 'object-edit-key')
setexp(r, type='ui', target='object-edit-key', state='disabled', db='ไม่กด — ชื่ออ้างอิงแก้ไม่ได้เมื่อวัตถุมีระเบียน (recordCount > 0)')
if 'needs' in r: r.pop('needs'); n += 1
open(p, 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
print(f'it6 registry edits: {n} field changes')
