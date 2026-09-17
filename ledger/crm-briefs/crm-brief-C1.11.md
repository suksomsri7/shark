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
