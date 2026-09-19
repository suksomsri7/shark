# C1.11 — Mobile-responsive pass, chat side panel, 16 business templates, import/duplicates UI, v1→v2 switch
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.11". Spec: blueprint §3.17, §3.18, §10, mockups 13(a), 17 (part), decision C23.

## Deliverables
1. Every C1 page at 390 px: board = swipe per stage, tables → cards, right rail → sheet. No horizontal overflow (harness measures it).
2. Chat room side panel "CRM" next to the member panel: contact/company/open deals/score placeholder + 3 buttons (open deal · log activity · create lead from chat). Server data through a new `crm.briefFor(partyId)` facade call; edge `chat→crm` in `ALLOWED_EDGES`. Respect visibility of the viewing staff.
3. 16 business-type templates as data (`src/lib/modules/crm/templates/business/*.ts`): pipeline+stages (probability, staleDays, requireFields), lost reasons, score rules (stored for C2.8), default sequence (stored for C2.2), custom objects, extra fields for contact/company/deal; `applyBusinessTemplate(ctx, key)` idempotent; picker on first open of the module.
4. UI for import (column mapping, contacts+companies in one file, onDuplicate), duplicates, merge (field-by-field choice) for contacts and companies.
5. **Switch (C23)**: `settings.crm.uiVersion` 1|2. The module entry renders v1 (`ui.tsx` CrmHub + the three v1 pages) when 1 and the v2 shell/nav when 2; OWNER-only toggle in settings with a Thai explanation and "switch back any time"; REST/AI v2 ops answer 409 `CRM_V2_DISABLED` when 1 (keys can still call the legacy AI tool). Nav registration (follow how `MEMBER_DEEP_NAV` is registered and the nav guard test).
6. `scripts/qc-crm-v1.mts`: the three v1 pages + six v1 actions still work with uiVersion 1, and data created in v2 shows up in v1 and vice versa.

## Files you own
responsive fixes inside `src/components/crm/**` and crm pages · `src/components/chat/**` CRM panel (new file + one slot in the room layout) · `src/lib/modules/crm/templates/business/**`, `templates.ts` · import/duplicates/merge pages · the module entry/layout + nav files · `scripts/qc-crm-v1.mts`.

## Acceptance (oracle `qc-crm-c1.11` + `qc-crm-v1`)
CRM-RUN S1–S5 (18) + S6 switch both ways keeps data.
X1 chat panel shows nothing for a Party whose contact the staff cannot see · X3 `applyBusinessTemplate` twice in parallel → one set · X6 import UI: 10 MB / 50,000 rows refused politely; formula cells inert · X9 merge UI passes confirm + reason.
Parity: mockup 13(a) + all C1 pages at 390 for owner/thana.
Regressions: `qc-chat-member-autolink`, `qc-chat-v2-room`, `qc-chat-v2-context`, `qc-nav-functions`, `qc-crm`, `qc-crm-activity`, all C1 oracles. Then the controller closes phase C1 with a full `qc:all` and walks US2, US3, US6, US8 on the QC server.

## Controller addendum (19 Sep · oracle `qc-crm-c1.11` 66 checks)
The CONTRACT BLOCK (sections A–I) in the oracle header is the API. Rulings — binding:
1. **The switch is NOT visible to production shops by default** (MASTER-PLAN: uiVersion stays 1 until the owner names a pilot · C6.3). Gate every switch surface (page, action, CrmHub link) behind `isCrmV2SwitchAllowed(tenantId)` = env `CRM_V2_SWITCH_TENANTS` (comma list of tenant ids) or `CRM_V2_SWITCH=all`; unset ⇒ page 404, action FORBIDDEN, no link. QC: the oracle sets `process.env.CRM_V2_SWITCH=all` in-process (report if a server-side check needs the QC server env — `.env.qc` may get `CRM_V2_SWITCH=all`, controller adds it). Entry = an OWNER-only link on CrmHub shown only when allowed ⇒ the v1 drawer stays byte-identical (probe V2.3). The switch page is exempt from probe V2_ONLY (controller edits the probe) and linked from CrmHub for qc-nav-functions.
2. Score rules/sequences stay as template data + `settings.crm.businessTemplate` pointer; materialised into tables by C2.x WOs (C2.2 sequences · C2.8 scoring).
3. Create-lead button works with `chatToLead` off (human click) — confirmed. 4. Panel = first CRM system, only at v2 — accepted until C2.4.
5. Owned files also: the merge dialogs inside `Contact360Actions.tsx` / `Company360Actions.tsx` (fieldChoices + reason testid only, `// CRM C1.11` blocks).
6. Import `onDuplicate: "update"` = fill blanks only, never overwrite existing values.
7. `qc-member-m1.1` S3.1 conflict: controller decides at phase-C1 close (ORACLE-EDIT to exclude rows tagged by the CRM seed).
8. Accepted.
C1.11 builder starts after C1.9 and C1.10 are committed (touches the same pages).
