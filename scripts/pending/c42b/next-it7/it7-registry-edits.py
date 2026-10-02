#!/usr/bin/env python3
"""c42b it7 registry edits (re-review after run5: R4-R7, RVR-1/3/5/9/10) — applied ONLY to scripts/pending/c42b/next-it7/crm-ui-inventory.json
(itself = next-it6 + these edits). scripts/ and next/ stay frozen until the controller promotes. Idempotent.
usage: python3 it7-registry-edits.py <registry.json> [--never-pressed review/never-pressed-run5.csv --out needs-ruling-it7.csv]"""
import csv, json, sys

# ── item 9: the attach-to-contact block after C5.5-fix15 — ONE switch ──
#   "hide"     = fix15 HIDES the block for a viewer assertUnmatchedGate refuses (expected): -q/-go/-pick hiddenFor manager (+ nok/thana)
#   "disabled" = fix15 shows it DISABLED with the reason up front: -q = manager variant state disabled · -go/-pick hidden for manager
ATTACH_MODE = "hide"

p = sys.argv[1]
d = json.load(open(p))
rows = d['rows']
n = 0
def row(page, tid):
    hits = [r for r in rows if r['testid'] == tid and r['page'] == page]
    assert len(hits) == 1, (page, tid, len(hits))
    return hits[0]
def setf(r, k, v):
    global n
    if v is None:
        if k in r: r.pop(k); n += 1
    elif r.get(k) != v:
        r[k] = v; n += 1
def setexp(r, **kw):
    e = dict(r['expect'])
    for k, v in kw.items():
        if v is None: e.pop(k, None)
        else: e[k] = v
    setf(r, 'expect', e)
def setvariant(r, name, v):
    vs = [x for x in (r.get('variants') or []) if x.get('name') != name]
    if v is not None: vs.append(dict(v, name=name))
    setf(r, 'variants', vs or None)

# ── RVR-3 / R5 REQUIRED: /deals paging — the controls render only in the TABLE view (deals/page.tsx:387-392); the B2B pipeline has 55
#    deals (review needs-probe.mts) ⇒ checked precondition for the owner: ≥ 51 deals of the default pipeline
DEALS_PROBE = {"db": {"model": "CrmDeal", "where": {"systemId": "$SYS", "archivedAt": None, "pipeline": {"isDefault": True, "archivedAt": None}}, "min": 51}, "roles": ["owner"]}
for t in ['deals-next-page', 'deals-first-page']:
    r = row('/deals', t)
    setf(r, 'query', 'view=table'); setf(r, 'needsProbe', DEALS_PROBE)
# RVR-3: crm-import-to-duplicates — the chain imports the runner CSV again AFTER crm-import-submit imported it (the group restores only
#   at its end) ⇒ with duplicate mode "candidate" the row becomes a duplicate candidate and the link renders (ContactImportPanel.tsx:195).
#   Checked: ≥ 2 runner import contacts ⇒ the candidate exists ⇒ a missing link is DEAD
r = row('/contacts/import', 'crm-import-to-duplicates')
setf(r, 'opener', ['crm-import-file=qc-btn-import.csv', 'crm-import-duplicate=candidate', 'crm-import-submit'])
setf(r, 'needsProbe', {"db": {"model": "CrmContact", "where": {"systemId": "$SYS", "name": {"startsWith": "qc-btn-", "endsWith": "-import"}}, "min": 2}, "roles": ["owner", "manager"]})
# it6 fixtures — now CHECKED preconditions (fixture present ⇒ control must be found)
setf(row('/settings/objects', 'objects-archived-toggle'), 'needsProbe', {"db": {"model": "CustomObject", "where": {"systemId": "$SYS", "archivedAt": {"not": None}}}, "roles": ["owner"]})
setf(row('/settings/objects', 'object-restore-btn'), 'needsProbe', {"db": {"model": "CustomObject", "where": {"systemId": "$SYS", "archivedAt": {"not": None}}}, "roles": ["owner"]})
for t in ['object-archive-confirm-key', 'object-archive-reason']:
    setf(row('/settings/objects', t), 'needsProbe', {"db": {"model": "CustomObject", "where": {"systemId": "$SYS", "archivedAt": None, "recordCount": {"gt": 0}}}, "roles": ["owner"]})
setf(row('/settings/pipelines', 'pl-restore-*'), 'needsProbe', {"db": {"model": "CrmPipeline", "where": {"systemId": "$SYS", "archivedAt": {"not": None}}}, "roles": ["owner"]})
setf(row('/activities', 'activity-row-company-link'), 'needsProbe', {"db": {"model": "CrmActivity", "where": {"systemId": "$SYS", "title": {"startsWith": "qc-btn-act-co-"}, "doneAt": None}}, "roles": ["owner", "manager"]})
setf(row('/settings/api', 'crm-api-key-revoke-*'), 'needsProbe', {"db": {"model": "ApiKey", "where": {"systemId": "$SYS", "revokedAt": None}}, "roles": ["owner"]})

# ── item 4 / R5 REQUIRED: access-granting rows must fail on a no-op (count clauses; revoke = POST_CHECK in the runner) ──
setexp(row('/settings/api', 'crm-api-key-form'), db='ApiKey +1 · ApiKey.systemId=<ระบบนี้>')
setexp(row('/settings/api', 'crm-api-key-submit'), db='ApiKey +1 · ApiKey.scopesJson=<ชุด crm.* (+ crm.filter.team:<id>)>')
setexp(row('/settings/api', 'crm-api-key-revoke-*'), db='ApiKey.revokedAt=<ไม่ว่าง> (POST_CHECK: revokedAt ตั้งหลังกด)')
for t in ['team-member-add-form', 'team-member-add-submit']:
    setexp(row('/app/settings/teams', t), db='TeamMember +1 · TeamMember.userId=<userId>')

# ── RVR-10 / item 8 + item 10: deal bulk move — target = a stage whose NAME is not the ticked deal's current stage ("=!ticked"),
#    DB: a stage-history row since the press (runner POST_CHECK), UI: the success text only with ≥ 1 deal moved
r = row('/deals', 'deal-bulk-move')
setf(r, 'opener', ['deal-row-check-*=on', 'deal-bulk-stage=!ticked'])
setexp(r, resultTarget='deal-bulk-msg', resultText='ย้ายขั้นสำเร็จ [1-9]')
# RVR-10: object-edit-key — keep the disabled assertion on the seed object AND press the enabled path on the LAST-listed empty runner object
r = row('/settings/objects', 'object-edit-key')
setvariant(r, 'empty-object-enabled', {"roles": ["owner"], "opener": ["object-edit-btn@last"], "expect": {"type": "inline-error", "target": "object-edit-key-hint", "db": ""}})
r = row('/settings/objects', 'object-edit-save')
setvariant(r, 'empty-object-rename', {"roles": ["owner"], "opener": ["object-edit-btn@last", "object-edit-key=qcbtnrenamed"],
                                      "expect": {"type": "mutation", "target": "op:objects.update", "db": "CustomObject (ชื่ออ้างอิงใหม่ qcbtnrenamed — POST_CHECK) · AuditLog crm.object.update"}})
# RVR-10: the two home AI buttons are disabled by design — ASSERT it instead of safety-skipping (runner drops them from the guard)
for t in ['crm-home-ai-draft', 'crm-home-ai-summary']:
    setexp(row('/app/sys/[id]', t), type='ui', target=t, state='disabled', db='ไม่กด — ปุ่ม disabled ตามแบบ (AI หน้าแรกยังไม่เปิด · HomeAside)')

# ── item 9: attach block ──
q, go, pick = (row('/emails/[threadKey]', t) for t in ['crm-email-attach-contact-q', 'crm-email-attach-contact-go', 'crm-email-attach-contact-pick'])
for r in (q, go, pick):
    setf(r, 'roles', ['owner'])
    setf(r, 'hiddenFor', ['nok', 'thana', 'manager'] if (ATTACH_MODE == 'hide' or r is not q) else ['nok', 'thana'])
setf(pick, 'needs', None)  # R6: an owner-side regression must not be skipped silently
# the runner presses `needs` rows LAST (qc-crm-buttons.mts rowsOfPage sort) — without `needs` -pick ran BEFORE -go in registry order,
#   attached the e-mail and the block (canAttach: !contactId) was gone for -go (dbg20 owner: -go dead) ⇒ -pick goes right after -go
ip, ig = rows.index(pick), rows.index(go)
if ip < ig:
    rows.insert(ig, rows.pop(ip)); n += 1
if ATTACH_MODE == 'disabled':
    setf(q, 'roles', ['owner', 'manager'])
    setvariant(q, 'manager-disabled-with-reason', {"roles": ["manager"], "expect": {"type": "ui", "target": "crm-email-attach-contact-q", "state": "disabled", "db": "ไม่กด — fix15: แสดงแบบ disabled พร้อมเหตุผล"}})
else:
    setvariant(q, 'manager-disabled-with-reason', None)

# ── RVR-3: every `needs` row that stays unpressed carries the reviewer's ruling (printed in skippedNeeds[].waiver) ──
W = {
  'R4-1': 'R4 ruling 1 — page-level lock-out pairs the hidden roles; functional gap waived',
  'R4-2W': 'R4 ruling 2 — WAIVE (shown transitively / service oracle)',
  'R4-2G': 'R4 ruling 2 — ACCEPTABLE GAP (LOW)',
  'R5-REC': 'R5 — RECOMMEND cheap fixture (not blocking · C4.2-fix)',
  'R5-ACC': 'R5 — ACCEPT seed / AI-data gap (C6)',
  'R5-SPLIT': 'R5 paging SPLIT — ACCEPT with C1.10-X6.2 (UI cursor not pressed)',
  'IT5': 'R5 — it5 never-pressed waiver accepted (portal account/OTP/storage)',
  'GAP-MEET': 'R5 — ACCEPTABLE GAP, C6 test debt (seed with a MEETING system)',
}
WAIVE = {
  'activity-log-notice-close': 'R5-ACC', 'activity-row-card': 'R5-REC', 'activity-row-card-board': 'R5-REC', 'activity-row-card-open': 'R5-REC',
  'activity-row-pin': 'R5-ACC', 'team-restore': 'R4-1',
  'crm-ai-proposal-deal-*': 'R4-2W', 'crm-ai-proposal-next-step-input': 'R4-2W', 'crm-home-stale-banner': 'R4-2G', 'crm-home-stale-row-*': 'R4-2G',
  'crm-home-stale-row-view-*': 'R4-2G', 'crm-hub-switch-link': 'R4-2G', 'crm-panel-deal': 'R4-2G', 'crm-panel-retry': 'R4-2G',
  'member-view-team': 'R4-2G', 'pos-deal-select': 'R4-2W',
  'portal-company-switcher': 'IT5', 'portal-home-outstanding': 'IT5', 'portal-home-quote-link': 'IT5', 'portal-quote-accept': 'IT5',
  'portal-quote-confirm-submit': 'IT5', 'portal-quote-reject': 'IT5', 'portal-reject-reason': 'IT5', 'portal-signer-name': 'IT5',
  'portal-record-change-field': 'IT5', 'portal-record-change-submit': 'IT5', 'portal-record-change-value': 'IT5', 'portal-record-file': 'IT5',
  'portal-invoice-row': 'IT5', 'portal-pay-promptpay': 'IT5', 'portal-slip-upload': 'IT5', 'portal-otp-code': 'IT5', 'portal-otp-submit': 'IT5',
  'portal-quote-row': 'IT5',
  'companies-page-next': 'R5-SPLIT', 'companies-page-prev': 'R5-SPLIT', 'object-page-next': 'R5-SPLIT', 'object-page-prev': 'R5-SPLIT',
  'company-doc-link': 'R4-1', 'company-merged-link': 'R4-1', 'company-outstanding-alert': 'R4-1', 'company-parent-link': 'R4-1', 'company-subsidiary-link': 'R4-1',
  'company-new-field-bool': 'R5-REC', 'company-new-field-input': 'R5-REC', 'company-new-field-select': 'R5-REC', 'company-new-field-textarea': 'R5-REC',
  'company-new-restore-confirm': 'R4-1', 'company-new-restore-reason': 'R4-1', 'company-new-restore-submit': 'R4-1',
  'crm-card-scan-accept': 'R5-ACC', 'crm-card-scan-reject': 'R5-ACC',
  'contact-conn-member-link': 'R5-ACC', 'contact-merged-link': 'R5-ACC', 'contact-score-explain-btn': 'R5-ACC', 'crm-book-via-booking': 'R5-ACC',
  'crm-call-ai-accept': 'R5-ACC', 'crm-call-ai-next-step': 'R5-ACC', 'crm-call-ai-reject': 'R5-ACC', 'crm-call-ai-summary': 'R5-ACC',
  'crm-call-ai-transcribe': 'R5-ACC', 'crm-call-ai-transcript': 'R5-ACC', 'crm-call-log-open-contact': 'R5-ACC',
  'crm-merge-choice': 'R4-2W', 'crm-object-tab-obj-*': 'R4-2G', 'contact-new-f-*': 'R5-REC',
  'deal-column-more-*': 'R5-ACC', 'deal-move-toast-close': 'R5-ACC', 'deal-req-cancel': 'R5-REC', 'deal-req-field-*': 'R5-REC', 'deal-req-open-link': 'R5-REC',
  'deals-empty-create-pipeline': 'R4-2G', 'deals-filter-f-*': 'R5-REC', 'deal-new-create-pipeline': 'R4-2G',
  'crm-call-recording-listen': 'R5-ACC', 'crm-call-recording-remove': 'R5-ACC',
  'crm-email-attachment': 'R4-1', 'crm-email-show-images': 'R4-1', 'objects-index-settings-link': 'R4-2G',
  'object-record-cancel': 'R4-1', 'object-record-field-*': 'R4-1', 'object-record-form': 'R4-1', 'object-record-new-btn': 'R4-1', 'object-record-save': 'R4-1',
  'object-view-delete': 'R4-1', 'crm-export-download': 'R4-1',
  'crm-settings-team-room': 'GAP-MEET', 'crm-settings-team-room-channel': 'GAP-MEET', 'crm-settings-team-room-remove-*': 'GAP-MEET',
  'crm-settings-team-room-save': 'GAP-MEET', 'crm-settings-team-room-team': 'GAP-MEET',
  'crm-assign-sim-field': 'R5-REC', 'crm-assign-sim-field-value': 'R5-REC', 'crm-email-domain-refresh': 'R4-1',
  'settings-stages-create-link': 'R4-2G',
}
PROBED = {'deals-next-page', 'deals-first-page', 'crm-import-to-duplicates', 'objects-archived-toggle', 'object-restore-btn',
          'object-archive-confirm-key', 'object-archive-reason', 'pl-restore-*', 'activity-row-company-link'}
for r in rows:
    w = WAIVE.get(r['testid'])
    if w and r.get('needs'): setf(r, 'needsWaiver', f"{w}: {W[w]}")

if '--never-pressed' in sys.argv:
    src = sys.argv[sys.argv.index('--never-pressed') + 1]; out = sys.argv[sys.argv.index('--out') + 1]
    items = [x for x in csv.DictReader(open(src)) if x['why'] == 'needs']
    with open(out, 'w', newline='') as fh:
        wr = csv.writer(fh); wr.writerow(['page', 'testid', 'visibleRolesPlanned', 'it7', 'class', 'ruling'])
        for x in items:
            t = x['testid']
            if t in PROBED: wr.writerow([x['page'], t, x['visibleRolesPlanned'], 'PRESSED (fixture/opener) + needsProbe', 'FIXED', 'R5 REQUIRE / it6 fixture'])
            else: wr.writerow([x['page'], t, x['visibleRolesPlanned'], 'needsWaiver', WAIVE.get(t, '??'), W.get(WAIVE.get(t, ''), '??')])
    print(f'needs ruling: {len(items)} items → {out}')
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False); open(p, 'a').write('\n')
print(f'it7 registry edits: {n} field changes')
