#!/usr/bin/env python3
"""c42b it5 registry edits (independent review RV-2/3/4/7/11/12 · controller rulings it5, 2 Oct) — idempotent; edits the registry
given as argv[1] in place. Every change cites the product line or the review item that proves it."""
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

# ── $fields: the new registry fields the it5 runner understands ──
F = d['$fields']
def doc(k, text):
    if F.get(k) != text: F[k] = text; globals()['n'] += 1
doc('variants', '(ไม่บังคับ · C4.2 it5) ตัวกดเดิมกดซ้ำอีกครั้งสำหรับบางบทบาทด้วยตัวเปิด/ผลที่คาดของตัวเอง — [{name, roles[], opener?, expect, note?}] · ใช้เมื่อบทบาทหนึ่งต้องได้ผลต่าง (เช่น ผู้จัดการถูกปฏิเสธเมื่อบันทึกกฎด้วยการกระทำปริยาย) · 1 testid ยังคง 1 แถว (F14.2)')
doc('onlyHiddenFor', '(ไม่บังคับ · C4.2 it5 · คู่กับ only) {testid ตรงตัว: [บทบาท]} — บทบาทที่ต้องไม่เห็นชื่อนั้นเพิ่มจาก hiddenFor ของแถว (เมนูเดียวที่แต่ละรายการมีคีย์ต่างกัน)')
doc('expect.outcome', '(ไม่บังคับ · C4.2 it5) "refusal" = ผลที่คาดคือเซิร์ฟเวอร์ปฏิเสธ (request เขียนต้องเกิด + ข้อความปฏิเสธใหม่ใน role=alert/*-error หรือ resultTarget ตรง refusalText) — นอกจากนี้ข้อความปฏิเสธใหม่ = ไม่ผ่านเสมอ (เลิกยกเว้นจากคำใน db)')
doc('expect.state', 'ui: appears (ต้องปรากฏ — ถ้ามองเห็นอยู่แล้วก่อนกดต้องเปลี่ยน) · disappears · changes · selected · count (จำนวนที่มองเห็นของ target เปลี่ยน) · disabled (มองเห็นแต่ disabled — ไม่กด)')

# ── RV-2: the button/tab/form inline-error rows whose target is checkable → real ui assertions ──
appears = {
    ('/companies/[companyId]', 'company-contact-remove-btn'): 'company-contact-remove-confirm',
    ('/app/settings/teams', 'teams-create-open'): 'teams-create-form',
    ('/app/sys/[id]', 'crm-panel-log-activity'): 'crm-panel-activity-form',
    ('/settings/automation', 'crm-auto-add-condition'): 'crm-auto-cond-field',
    ('/settings/automation', 'crm-auto-dry-run'): 'crm-auto-dry-result',
    ('/settings/automation', 'crm-auto-rule-delete'): 'crm-auto-delete-reason',
    ('/settings/assignment', 'crm-assign-cond-add'): 'crm-assign-cond-field-*',
    ('/settings/email', 'crm-email-rotate-key'): 'crm-email-rotate-reason',
    ('/settings/email', 'crm-email-user-edit'): 'crm-email-user-save',
    ('/settings/email', 'crm-email-template-new'): 'crm-email-template-name',
    ('/settings/email', 'crm-email-template-edit'): 'crm-email-template-name',
    ('/emails', 'crm-email-my-toggle'): 'crm-email-my-save',
    ('/companies/[companyId]', 'crm-portal-revoke-*'): 'crm-portal-revoke-confirm-*',
    ('/b/[slug]/login', 'portal-login-tab-email'): 'portal-login-email',
    ('/settings/commissions', 'crm-commission-reject-*'): 'crm-commission-reject-reason',
    ('/deals/[dealId]', 'crm-ai-deal-summary'): 'crm-ai-result',
    ('/deals/[dealId]', 'crm-ai-deal-risk'): 'crm-ai-result',
    ('/deals/[dealId]', 'crm-ai-deal-draft-email'): 'crm-ai-result',
    ('/contacts/[contactId]', 'crm-ai-contact-why-hot'): 'crm-ai-result',
    ('/contacts/[contactId]', 'crm-ai-contact-closing'): 'crm-ai-result',
    ('/companies/[companyId]', 'crm-ai-company-summary'): 'crm-ai-result',
    ('/companies/[companyId]', 'crm-ai-company-upsell'): 'crm-ai-result',
    ('/settings/objects', 'object-template-*'): 'object-add-form',
}
disappears = {
    ('/companies/[companyId]', 'company-contact-remove-cancel'): 'company-contact-remove-confirm',
    ('/settings/automation', 'crm-auto-cancel'): 'crm-auto-builder',
    ('/settings/automation', 'crm-auto-delete-cancel'): 'crm-auto-delete-reason',
    ('/settings/assignment', 'crm-assign-rule-cancel'): 'crm-assign-editor',
    ('/settings/assignment', 'crm-assign-delete-cancel'): 'crm-assign-delete-box',
    ('/settings/email', 'crm-email-rotate-cancel'): 'crm-email-rotate-reason',
    ('/settings/email', 'crm-email-user-cancel'): 'crm-email-user-save',
    ('/settings/email', 'crm-email-template-cancel'): 'crm-email-template-name',
    ('/settings/commissions', 'crm-commission-rule-cancel'): 'crm-commission-rule-save',
    ('/settings/commissions', 'crm-commission-reject-cancel'): 'crm-commission-reject-reason',
}
count = {
    ('/settings/automation', 'crm-auto-cond-remove'): 'crm-auto-cond-field',
    ('/settings/automation', 'crm-auto-action-remove'): 'crm-auto-action-type',
    ('/settings/automation', 'crm-auto-add-then'): 'crm-auto-action-type',
    ('/settings/automation', 'crm-auto-add-action'): 'crm-auto-action-type',
    ('/settings/sequences/[sequenceId]', 'crm-seq-step-add'): 'crm-seq-step-kind-*',
    ('/settings/sequences/[sequenceId]', 'crm-seq-step-remove-*'): 'crm-seq-step-kind-*',
    ('/settings/assignment', 'crm-assign-cond-remove-*'): 'crm-assign-cond-field-*',
    ('/settings/commissions', 'crm-commission-tier-add'): 'crm-commission-tier-upto-*',
    ('/settings/commissions', 'crm-commission-tier-remove-*'): 'crm-commission-tier-upto-*',
}
changes = {
    ('/settings/sequences/[sequenceId]', 'crm-seq-step-up-*'): 'crm-seq-editor',
    ('/settings/sequences/[sequenceId]', 'crm-seq-step-down-*'): 'crm-seq-editor',
    ('/app/sys/[id]', 'crm-home-stage-chip'): 'crm-home-my-deals',
    ('/app/sys/[id]', 'crm-home-stage-all'): 'crm-home-my-deals',
    ('/settings/objects', 'object-add-parent-*'): 'object-add-form',
}
for (pg, t), tgt in appears.items(): setexp(row(pg, t), type='ui', target=tgt, state='appears')
for (pg, t), tgt in disappears.items(): setexp(row(pg, t), type='ui', target=tgt, state='disappears')
for (pg, t), tgt in count.items(): setexp(row(pg, t), type='ui', target=tgt, state='count')
for (pg, t), tgt in changes.items(): setexp(row(pg, t), type='ui', target=tgt, state='changes')
setexp(row('/settings/notifications', 'crm-notify-tab-shop'), type='ui', target='crm-notify-tab-shop', state='selected')

# ── RV-3: parseable DB effects for the rows that used the refusal exemption / delete without a parseable clause ──
def prefix_db(r, pre):
    db = r['expect'].get('db') or ''
    if not db.startswith(pre): setexp(r, db=f'{pre} · {db}' if db else pre)
prefix_db(row('/contacts/[contactId]', 'crm-seq-enroll-submit'), 'CrmSequenceEnrollment +1')
prefix_db(row('/contacts', 'crm-seq-bulk-submit'), 'CrmSequenceEnrollment (ผู้ติดต่อที่เลือก) · AuditLog crm.sequence.bulk_enroll')
prefix_db(row('/settings/holidays', 'crm-seq-holiday-add'), 'AppSystem.settings (วันหยุด +1)')
setexp(row('/contacts/[contactId]', 'crm-files-remove-confirm'), db='CrmFileLink -1 · AuditLog crm.file.remove (ลิงก์ของตัวกดชี้ไฟล์ที่ไม่มีในที่เก็บ ⇒ FileAsset ไม่เปลี่ยน)')
setexp(row('/contacts/[contactId]', 'crm-call-recording-delete-go'), db='AuditLog crm.activity.recording_remove · CrmActivity.recordingFileId ว่าง (สายของตัวกดชี้ไฟล์ที่ไม่มีในที่เก็บ ⇒ ไม่เรียกที่เก็บจริง)')

# ── RV-4: fixtures wired through openers (placeholders resolved by the runner from its own fixtures) ──
setf(row('/settings/commissions', 'crm-commission-approve-selected'), 'opener', 'crm-commission-select-[commissionA]=on')
r = row('/settings/commissions', 'crm-commission-approve-selected')
setf(r, 'variants', [{
    'name': 'manager-over-cap',
    'roles': ['manager'],
    'opener': 'crm-commission-select-[commissionB]=on',
    'expect': {'type': 'mutation', 'target': 'op:crm.commission.approve', 'outcome': 'refusal', 'resultTarget': 'crm-commission-msg', 'refusalText': 'เกินวงเงิน',
               'db': 'CrmCommission ไม่เปลี่ยน (ยอดเกินเพดาน crm._maxCommissionApproveSatang ของผู้กด — commissions.ts approve OVER_CAP_MSG)'},
    'note': 'C4.2 it5 RV-4: ผู้จัดการมีเพดาน 1,000 บาท (fixture ของตัวกด) · ค่าคม B 500,000 บาท ผูกคำขออนุมัติหลอก ⇒ ไม่แจ้งเจ้าของร้าน',
}])
for t in ['crm-call-recording-delete', 'crm-call-recording-confirm', 'crm-call-recording-reason', 'crm-call-recording-delete-go', 'crm-call-recording-delete-cancel']:
    r = row('/contacts/[contactId]', t)
    want = ['crm-call-recording-pick=[recordingDel]'] + ([] if t == 'crm-call-recording-delete' else ['crm-call-recording-delete'])
    setf(r, 'opener', want)

# dbg11: the edit sheet saved with UNCHANGED values writes nothing (prefill only fills EMPTY fields) — the submit row now changes
#   the job title first, so "CrmContact written" is a real effect (Contact360Actions.tsx edit fields firstName…jobTitle)
setf(row('/contacts/[contactId]', 'contact-*-submit'), 'opener', ['contact-menu-btn', 'contact-menu-edit', 'contact-edit-jobTitle=qc-btn-jobtitle-it5'])

# dbg11 (RV-3 model-written check exposed hollow passes): the submit pressed with the CURRENT values wrote nothing
setf(row('/companies/[companyId]', 'company-owner-submit'), 'opener', ['company-menu-btn', 'company-menu-owner', 'company-owner-select=*'])
setf(row('/settings/commissions', 'crm-commission-settings-save'), 'opener', 'crm-commission-setting-basis=*')
setexp(row('/companies/[companyId]', 'company-contact-remove-confirm'), db='CrmCompanyContact.endedAt ตั้งค่า (now) · CrmContact.companyId คำนวณใหม่ (อาจไม่เปลี่ยน)')

# dbg11: the LINE tab is the portal login's DEFAULT — pressing it changes nothing; switch to e-mail first, then back
setf(row('/b/[slug]/login', 'portal-login-tab-line'), 'opener', 'portal-login-tab-email=click')  # =click: a plain opener step is skipped while the row's own control is visible

# dbg11: the dry run of the builder's DEFAULT draft is refused (incomplete / H55-2 for the manager) — run it on a complete
#   NOTIFY_STAFF draft so the result tag (crm-auto-dry-result) is the assertion for owner and manager
setf(row('/settings/automation', 'crm-auto-dry-run'), 'opener', ['crm-auto-new', 'crm-auto-action-type=NOTIFY_STAFF', 'crm-auto-action-text=qc-btn-dry-it5', 'crm-auto-name=qc-btn-dry-it5'])

# dbg11: object-add-cancel CLEARS the inline add form (it stays on the page) · attach-contact-go is the SEARCH (results =
#   crm-email-attach-contact-pick) — search a name every owner sees (the persona contact "วรรณา …")
setexp(row('/settings/objects', 'object-add-cancel'), type='ui', target='object-add-form', state='changes')
setf(row('/emails/[threadKey]', 'crm-email-attach-contact-go'), 'opener', 'crm-email-attach-contact-q=วรรณา')
setexp(row('/emails/[threadKey]', 'crm-email-attach-contact-go'), type='ui', target='crm-email-attach-contact-pick', state='appears')

# dbg11: bulk-assign's audit action is crm.contact.bulk_assign (contacts.ts bulkAssign) — "AuditLog reason" was not an action ·
#   deal-line-add adds a line to a deal that already HAS lines (runner fixture) ⇒ the visible line count is the assertion
setexp(row('/contacts', 'contacts-bulk-assign-submit'), db='CrmContact.ownerUserId = ผู้รับ (≤ 500) · AuditLog crm.contact.bulk_assign (เหตุผล)')
setexp(row('/deals/[dealId]', 'deal-line-add'), state='count')

# dbg12: the save writes CrmSequence (and only adds a step version when steps changed AND people are enrolled)
setexp(row('/settings/sequences/[sequenceId]', 'crm-seq-save'), db='CrmSequence (บันทึก) · CrmSequenceStep แถวใหม่ของ version+1 เมื่อขั้นเปลี่ยนและมีผู้ลงทะเบียน (แถวเวอร์ชันเก่าไม่ถูกแก้/ลบ) · AuditLog crm.sequence.update')

# dbg13: the LINE login button is rendered on BOTH tabs; switching to the LINE tab removes the e-mail form
setexp(row('/b/[slug]/login', 'portal-login-tab-line'), type='ui', target='portal-login-email', state='disappears')

# ── RV-7: keep B5 (NOTIFY_STAFF save) + assert the unit-scoped manager's refusal on the builder's DEFAULT action ──
setf(row('/settings/automation', 'crm-auto-save'), 'variants', [{
    'name': 'manager-default-action-refusal',
    'roles': ['manager'],
    'opener': 'crm-auto-new',
    'expect': {'type': 'mutation', 'target': 'action:createCrmRuleAction', 'outcome': 'refusal', 'refusalText': 'มองเห็นเฉพาะบางส่วน',
               'db': 'AutomationRule ไม่เพิ่ม (C5.5-fix1 H55-2 automation.ts handNeedOf: CREATE_ACTIVITY ต้องเห็นผู้ติดต่อ/ดีลทั้งร้าน — ผู้จัดการ QC1 ถูกจำกัดสาขา/ทีม)'},
    'note': 'C4.2 it5 RV-7 — ผลิตภัณฑ์: finding C6 (ผู้จัดการมีคีย์ automation แต่บันทึกได้เฉพาะ แจ้งพนักงาน/push/รอ)',
}])

# ── RV-11 ──
for t in ['deal-reopen-btn', 'deal-reopen-reason', 'deal-reopen-confirm', 'deal-reopen-cancel', 'deal-reopen-submit']:
    hide(row('/deals/[dealId]', t), ['nok'])  # (a) canReopen={canManage} (deals/[dealId]/page.tsx)
for t in ['contact-*-reason', 'contact-*-confirm']:
    hide(row('/contacts/[contactId]', t), ['nok', 'thana'])  # (b) reason/confirm exist only in merge/archive (crm.contact.merge/.delete)
r = row('/contacts/[contactId]', 'contact-menu-*')  # (c) one pattern, six items with different keys (Contact360Actions.tsx ITEMS)
setf(r, 'only', ['contact-menu-edit', 'contact-menu-owner', 'contact-menu-status', 'contact-menu-tags', 'contact-menu-merge', 'contact-menu-archive'])
setf(r, 'onlyHiddenFor', {'contact-menu-merge': ['nok', 'thana'], 'contact-menu-archive': ['nok', 'thana']})
r = row('/contacts/[contactId]', 'contact-phone-tel')  # (d) shown only WITHOUT crm.activity.create — no seeded persona lacks it
setf(r, 'hiddenFor', [])
setf(r, 'needs', 'ผู้ใช้พนักงานที่ไม่มีคีย์ crm.activity.create (ลิงก์ tel: แทนฟอร์มบันทึกสาย — contacts/[contactId]/page.tsx) — ซีดไม่มีบุคคลแบบนี้ ⇒ ตรวจไม่ได้ (รอคำวินิจฉัย)')
r = row('/settings/commissions', 'crm-commission-rule-row-*')  # (e) rendered for the manager but disabled={!data.canManage} (settings.manage)
setf(r, 'variants', [{'name': 'manager-disabled', 'roles': ['manager'], 'expect': {'type': 'ui', 'target': 'crm-commission-rule-row-*', 'state': 'disabled', 'db': 'ไม่กด — มองเห็นแต่ disabled (canManage = crm.settings.manage · ผู้จัดการไม่มีคีย์ตั้งค่า)'}}])

# ── RV-12: stale needs texts of the sequence rows (the component renders; the pick lists ACTIVE sequences only) ──
SEQ_NEED = 'ลำดับติดตามที่เปิดใช้ (active) ≥1 — ตัวกดสร้างให้เอง (qc-btn-seq-, ขั้นแรกรอ 30 วัน) · sequences.ts sequenceOptions แสดงเฉพาะ active:true'
for r in rows:
    if r['testid'].startswith(('crm-seq-enroll', 'crm-seq-bulk')) and r.get('needs'): setf(r, 'needs', SEQ_NEED)
ENR_NEED = 'ผู้อยู่ในลำดับ (CrmSequenceEnrollment ACTIVE/PAUSED) — ตัวกดสร้างให้ 2 คน (ไม่มีอีเมล · nextAt +30 วัน)'
for r in rows:
    if r['testid'].startswith('crm-seq-enr-') and r.get('needs'): setf(r, 'needs', ENR_NEED)

open(p, 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
print(f'it5 registry edits: {n} field changes')
