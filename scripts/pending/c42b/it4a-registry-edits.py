#!/usr/bin/env python3
"""c42b it4-A registry edits (run2 owner triage, 1 Oct) — idempotent; applies to the registry given as argv[1] in place.
Every edit cites the product line that proves it (no expectation is weakened)."""
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
# N2 save button lives inside the "แก้ไขขั้น" block (SequenceEditor.tsx `{editSteps && (<>` … crm-seq-save)
setf(row('/settings/sequences/[sequenceId]', 'crm-seq-save'), 'opener', 'crm-seq-steps-toggle')
# N4 deal-count target column is `hidden … sm:table-cell` (QuotaManager.tsx th/td "เป้าดีล") — desktop layout only
setf(row('/settings/quotas', 'crm-quota-deals-*'), 'viewport', 'desktop')
# N6 StepFields renders the first step of a NEW sequence on /settings/sequences (SequenceListView.tsx <StepFields … />)
for t in ['crm-seq-step-kind-*', 'crm-seq-step-subject-*', 'crm-seq-step-body-*', 'crm-seq-step-wait-days-*', 'crm-seq-step-wait-hours-*', 'crm-seq-step-task-title-*', 'crm-seq-step-task-type-*']:
    r = row('/settings/sequences/[sequenceId]', t)
    also = list(r.get('alsoOn') or [])
    if '/settings/sequences' not in also:
        setf(r, 'alsoOn', also + ['/settings/sequences'])
# N7 the add form submits the chosen employee; the select is a `ui` row (never prefilled) — choose one first
for t in ['team-member-add-form', 'team-member-add-submit']:
    setf(row('/app/settings/teams', t), 'opener', 'team-member-add-select=*')
# N9 create-lead exists only for a room whose party has NO CRM contact (crm-panel-actions.ts createLead: contactState === "none")
setf(row('/app/sys/[id]', 'crm-panel-create-lead'), 'query', 'c=[unlinkedConversationId]')
# E1 (C5.4-E rows from main 288cca97): confirm/cancel live inside the sheet that `company-lifecycle-correct` opens
#    (Company360Actions.tsx CompanyLifecycleCorrect: `if (!open) return <button …company-lifecycle-correct>` · sheet holds -confirm/-cancel)
for t in ['company-lifecycle-correct-confirm', 'company-lifecycle-correct-cancel']:
    if any(r['testid'] == t for r in rows):
        setf(row('/companies/[companyId]', t), 'opener', 'company-lifecycle-correct')
# D1 (dbg2 owner 390): the chat context column (member + CRM panel) is `hidden … lg:flex` — "ซ่อนต่ำกว่า lg ตามแบบร่าง"
#    (inbox-client.tsx ~:2118-2120 aside around <ContextPanel crmPanel>) ⇒ every crm-panel-* control is desktop-only by design
for r in rows:
    if r['page'] == '/app/sys/[id]' and r['testid'].startswith('crm-panel-'):
        setf(r, 'viewport', 'desktop')
# D2 (dbg2 nok 1440): the room page shows the inbox only when canReadChat (src/app/app/sys/[id]/page.tsx:63 · chat/guard.ts:39-42
#    rbac `chat.conversation.read`) — QC1 nok/thana (STAFF, no chat key) evaluate FALSE (facts9.mts) ⇒ page shows the refusal card,
#    no CRM panel. §15 (b): the persona lacks the key that gates the control ⇒ hiddenFor (crm keys alone do not decide this page)
for r in rows:
    if r['page'] == '/app/sys/[id]' and r['testid'].startswith('crm-panel-'):
        for u in ('nok', 'thana'):
            if u in (r.get('roles') or []):
                setf(r, 'roles', [x for x in r['roles'] if x != u])
            if u not in (r.get('hiddenFor') or []):
                setf(r, 'hiddenFor', list(r.get('hiddenFor') or []) + [u])
open(p, 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
print(f'it4-A registry edits: {n} field changes')
