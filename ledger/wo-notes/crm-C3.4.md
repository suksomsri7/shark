# WO C3.4 — MEETING/KB bridges · AI ในหน้า · tool ที่เหลือ (รวม 32)

> RUN "CRM v2" · worktree `/root/projects/shark-crm-c110` (ฐาน `ff2cb5fb` = C3.3 รวมแล้ว) · QC2 · 27 ก.ย. 2569 · builder: Opus 5.5
> สัญญา: CRM-RUN §2 C3.4 · `crm-brief-C3.4.md` (addendum 1–13 + Controller ruling) · COMMON · C1.10 · ข้อสอบ `scripts/qc-crm-c3.4.mts` (53 ข้อ · **ไม่ได้แก้**)
> ไม่มี migration · ไม่มี commit/push

## 1. ทำอะไร
- **facade ใหม่ 2 ตัว** (มติ (4)): `meeting/index.ts` (`postSystemMessage` ผู้เขียน `system:crm` · `listRoomOptions`) · `kb/index.ts` (`searchKb` · `getArticle`) + ALLOWED_EDGES `crm→meeting` · `crm→kb` (dynamic import ทั้งคู่)
- **`crm/ai-bridges.ts`** (re-export `aiBridges`): `runAssist` (9 ปุ่ม) · `atRiskDeals` · ประตูข้อเสนอ `confirmProposal`/`cancelProposal` (+ `*ById` · `isCrmDoorKind`) · ห้องทีม `onDealWonTeamRoom`/`onHotLeadTeamRoom`/`postStaleDigest` · `unfurlDealLink` · `renderKbTokens` · `setTeamRoom`/`teamRoomOptions`
- **tool 23 → 32**: op ใหม่ 5 ตัว (`ops/assist.ts`: `deals.atRisk.list` · `activities.taskCard.open` · `reports.get` · `quotas.progress` · `commissions.mine` — สามตัวหลังตามสัญญา id/path/key/kind ของ C3.8 · test `C3.8-S1.1`) + ติด `tool` ให้ op เดิม 4 ตัว (`deals.quote` · `sequences.stop` · `records.create` · `records.update`) · สกิล `crm` +9 ชื่อ · ผู้ช่วยได้ scope `crm.commission.view` (∩ สิทธิ์คนถาม)
- **ประตูทั่วไปปิดสาขา CRM** (มติ (2)): `ai/proposals.rejectProposal` ปฏิเสธ kind CRM ทุกตัว · `ai/actions.rejectProposalAction` + `/api/mobile/proposals/reject` ส่ง kind CRM ไป `cancelProposalById` พร้อมตัวคนกด · `executeProposal` ส่ง `crm.assist.tasks` / `crm.activity.ai_fill` / นามบัตร ไป `confirmProposalById`
- **KB**: `{{kb:<articleId>}}` เรนเดอร์ในตัวเรนเดอร์แม่แบบอีเมล (`emails.ts#renderTemplate` หลังแทนตัวแปร) + op `emails.draft` · retrieval ≤ 3 บทความ (ตัด 1,200 ตัว) ใน prompt สรุปดีล/ร่างอีเมล
- **นามบัตร**: `scanBusinessCard` จับคู่บริษัทใต้ `companyWhere` ของคนสแกน → `payload.companyId` · `acceptLeadProposal` ผูกบริษัทนั้น
- **งานรายวัน** `crm.teamroom.stale` (1440 · daily) · consumer extras ใต้ compose ของ `crm.deal.won` / `crm.score.threshold` · ธง `crm.teamroom.posted` (consumer no-op + ป้ายใน webhooks/labels.ts)
- **UI**: แผง AI บนดีล/ผู้ติดต่อ/บริษัท 360 (แทนป้าย "เร็ว ๆ นี้" เดิม) · หน้าแรก "ดีลไหนเสี่ยงเดือนนี้" (ตาราง + การ์ดข้อเสนอ อนุมัติ/แก้ไข/ยกเลิก) · ตัวเลือกห้องทีมบนหน้าตั้งค่า CRM · การ์ดลิงก์ดีลในห้องแชท + ชื่อผู้เขียน "ระบบ CRM" · inventory +23 แถว (+ แก้แถว `crm-home-ai-risk` เป็นลิงก์)

## 2. ไฟล์ (บรรทัดอ้างอิง ณ ตอนส่ง)
| ไฟล์ | สถานะ | จุดสำคัญ |
|---|---|---|
| `src/lib/modules/crm/ai-bridges.ts` | ใหม่ | enter (ประตู v2) ~106 · atRiskDeals 159 · runAssist 434 (ธงก่อน `claimProposal` ~382) · isCrmDoorKind 572 · loadDoorRow 614 · confirmProposal 653 · executeAssistTasks 717 · cancelProposal 744 · *ById 760/773 · postFlagged 825 · onDealWon/HotLead 872/888 · postStaleDigest 909 · setTeamRoom 953 · unfurlDealLink 1016 |
| `src/lib/modules/crm/ai-bridges-shared.ts` | ใหม่ | ค่าคงที่/ชนิดบริสุทธิ์ (kind · เหตุผลดีลเสี่ยง · `system:crm` · `crm.teamroom.posted`) |
| `src/lib/modules/crm/kb-tokens.ts` | ใหม่ | renderKbTokens · kbGrounding (facade KB · dynamic) |
| `src/lib/modules/crm/api/ops/assist.ts` | ใหม่ | 5 op |
| `src/lib/modules/meeting/index.ts` · `kb/index.ts` | ใหม่ | facade re-export ล้วน |
| `src/lib/modules/meeting/service.ts` | แก้ (~382–) | postSystemMessage(input, tx?) · listRoomOptions |
| `src/lib/modules/meeting/ui.tsx` | แก้ | ชื่อผู้เขียน `system:*` · `<CrmDealUnfurl>` ใต้ข้อความที่มี `/crm/deals/` |
| `src/app/app/sys/[id]/crm/_actions/ai.ts` | ใหม่ | "use server" (async ล้วน): runAssist · confirm/cancel · setTeamRoom · unfurlDealLinkAction |
| `src/components/crm/ai/*` | ใหม่ | CrmAiPanel · CrmAiHomeAtRisk · CrmAiProposalCard · CrmTeamRoomPicker · CrmDealUnfurl · types |
| deal/contact/company 360 `page.tsx` · `settings/page.tsx` · `crm/home.tsx` · `components/crm/home/HomeAside.tsx` | แก้ | วางแผง/ตัวเลือก (บล็อก `CRM C3.4`) · ลบ `SideSoon` ที่ไม่ใช้แล้ว |
| `crm/api/registry.ts` · `ops/{deals,sequences,objects,emails}.ts` · `api/tools.ts` · `ai/skills.ts` | แก้ | ลงทะเบียน op/tool · scope ผู้ช่วย · `renderKbTokens` ใน emails.draft |
| `crm/calls.ts` (~641) · `crm/activities.ts` (618 · 672) · `crm/emails.ts` (~1045) · `crm/index.ts` (ท้าย) | แก้ | จับคู่บริษัทนามบัตร · `logActivity(opts.ownerUserId)` · KB ในแม่แบบ · export `aiBridges` |
| `ai/proposals.ts` (340 · executeProposal) · `ai/actions.ts` · `api/mobile/proposals/reject/route.ts` | แก้ | สาขา CRM เท่านั้น |
| `outbox-consumers.ts` (~516 · crm.deal.won · crm.score.threshold · crm.teamroom.posted) · `platform/minute-jobs.ts` (385) · `webhooks/labels.ts` (66) | แก้ | extras · ธง · งานรายวัน |
| `scripts/fitness.mts` (448) · `scripts/gen-crm-api-docs.mts` (หมวด reports/quotas/commissions) · `docs/api/CRM-API.md` (106 op) · `scripts/crm-ui-inventory.json` | แก้ | |

## 3. มติ/เหตุผล
1. **op ร่วมกับ C3.8 ใช้ id/method/path/action/kind ของสัญญา C3.8** (`reports.get GET /reports/{tab}` · `quotas.progress GET /quotas/progress` input `ownerType/ownerId/periodKey` (ทุกช่องมีค่าปริยาย: ตัวเอง · เดือนนี้) · `commissions.mine` `status/periodKey`) และ test id `C3.8-S1.1` (ข้อสอบ C3.8 บังคับ test id ในรายการของมัน) — อาร์กิวเมนต์ของ tool ใน addendum 1 (`period/userId/teamId`, `from/to`) จึงไม่ตรงตัวอักษร (มติ C1.10 ข้อ 5: ชื่ออาร์กิวเมนต์อิสระ)
2. **คีย์ธงดิจิสต์ = `crm.teamroom#stale#<systemId>#<teamId>#<วันไทย>`** (addendum เขียน `#<teamId>#<วัน>`): ทีมเป็นระดับร้าน — ร้านที่มี CRM v2 สองระบบผูกทีมเดียวกันจะได้ดิจิสต์ระบบเดียวถ้าไม่มี systemId (ข้อสอบไม่ตรวจรูปคีย์) · won/hot ตามรูปเดิม (`#won#<eventId>` · `#hot#<eventId>`)
3. **ธง+โพสต์ใน tx เดียว** ใต้ advisory lock ต่อคีย์: ห้องปฏิเสธ = โยนภายใน tx ⇒ ไม่มีธง (X5.4) · WARN OpsEvent ids ล้วน · ไม่ throw ออกไป
4. **WARN เฉพาะร้านที่ผูกห้องไว้แล้วอย่างน้อยหนึ่งทีม** (ร้านที่ไม่ใช้ห้องทีมเลยเงียบ — ไม่สร้าง WARN ทุกดีลที่ชนะ) · ดิจิสต์ไม่โพสต์เมื่อทีมไม่มีดีลนิ่ง
5. **ประตู v2 เท่านั้นสำหรับห้องทีม** (ไม่ผูก `bridgesEnabled`) — การผูกห้องคือการเลือกเปิดของร้านอยู่แล้ว
6. **ธงก่อนของข้อเสนอ** (แบบ C2.4): `crm.assist.tasks` หนึ่งใบต่อ (ระบบ·คนกด·เดือนไทย) ผ่าน conversationId + advisory lock · payload ครบตั้งแต่จอง (ไม่ขึ้นกับคำตอบโมเดล) · `deal.nextStep` ต่อ (ดีล·คนกด) จองด้วย `WORKING#ms` แล้วเติมเมื่อโมเดลตอบ (ยืนยันระหว่างทำงาน = CONFLICT) · โมเดลล้ม = ลบธง ไม่หัก
7. **คนกด home.atRisk ที่ไม่มี `crm.activity.create`** ได้ตาราง+ข้อความแต่ไม่มีข้อเสนอ · `deal.nextStep` ต้องมี `crm.deal.update` (FORBIDDEN ก่อนเรียกโมเดล) — ไม่สร้างข้อเสนอที่คนกดเองยืนยันไม่ได้ · หน้าแรกไม่มีดีลเสี่ยง = ตอบทันที ไม่เรียก/ไม่หัก
8. **ผู้ดูแลงานติดตาม** = ผู้ดูแลดีลที่อ่านจากฐานตอนยืนยัน (ไม่ใช่จาก payload) ผ่าน `logActivity(…, { ownerUserId, sourceRef: crm.assist.tasks:<proposal>:<deal> })` — ช่องใหม่ภายใน (REST/หน้าไม่ส่ง) · sourceRef กันงานซ้ำเมื่อยืนยันซ้ำ/ลองใหม่
9. **"แก้ไข" บนการ์ด** = ลดขอบเขตเท่านั้น (ข้อความขั้นถัดไปใหม่ ≤ 300 · ติ๊กดีลออก) — เพิ่มดีลไม่ได้ ⇒ ด่านการมองเห็นของประตูครอบทุกดีลที่ถูกแตะ · ค่าที่แก้ถูกเก็บลง payload ตอนจอง EXECUTED
10. **executeProposal (แชท/แผน/มือถือ)**: เฉพาะ `crm.assist.tasks` · `crm.activity.ai_fill` · นามบัตร (`crm_create_lead` + systemId) ส่งเข้าประตู CRM — kind `crm.<op>` เดินทางเดิม (สิทธิ์คนกด + op ตรวจการมองเห็นเอง · กัน regression C1.10 S6.3/S10.2) · rejectProposal ทั่วไป **ปฏิเสธ `crm.*` ทุกตัว** รวม `crm.<op>` ที่แชทสร้าง (ผู้เรียกสองรายส่งไปประตูพร้อมตัวคนแล้ว)
11. **unfurl ไม่มีเส้น meeting→crm**: การ์ดเป็น client component ใต้ `components/crm/ai` เรียก server action ใต้โฟลเดอร์ CRM (`_actions/ai.ts#unfurlDealLinkAction`) — addendum 11 เขียนว่า "server action ในโมดูล meeting" แต่นั่นจะต้องเพิ่ม `meeting→crm` (วง crm⇄meeting) · ผลเหมือนกัน (session viewer · null ทุกกรณีที่ไม่ควรเห็น)
12. prompt: เลือกช่องเองทุกคิวรี (ไม่อ่าน phone/email/taxId/lineUserId/ฟิลด์กำหนดเอง) + `redactContactInfo` บนข้อความอิสระ (ชื่อดีล · หัวข้อกิจกรรม · ชื่อคน · บทความ KB) · ไม่ใส่เนื้อกิจกรรม (body) เลย · คำสั่งระบบเป็นอังกฤษ (ไทยกิน token)
13. `commissions.mine` ผ่านคีย์ API = แถวของผู้สร้างคีย์ (actor ของคีย์มี userId = ผู้สร้าง) — ไม่ปิดเพราะข้อสอบ C3.8 smoke ต้องการ 200 · คีย์นั้นมี `crm.commission.view` (อ่าน list ทั้งระบบได้อยู่แล้ว) · ให้ C3.8 ตัดสินอีกที (§5)

## 4. ผลข้อสอบ (QC2 · log `.qc-shots/c34/` · สรุป `.qc-shots/c34/summary.log`)
- `qc-crm-c3.4`: รอบแรก (ยังไม่มี UI) 50/53 · run2/run3 52/53 (S8.3: คำว่า `alert()` ในคอมเมนต์ถูก regex จับ → แก้คอมเมนต์) · **run4/run5 53/53 (§4b)**
- regressions (run เดียวกัน): qc-ai-tools 18/18 · qc-ai-proposals 16/16 · qc-ai-skills 23/23 · qc-ai-credit 32/32 · qc-ai-vision 6/6 · qc-kb 12/12 · qc-kb-search 7/7 · qc-kb-auto 4/4 · qc-meeting-invite 22/22 · qc-crm-c2.11 47/47 · qc-crm-c2.4 91/91 · qc-crm-c2.10 41/41 · qc-crm-c1.7 57/57 · qc-crm-v1 17/17 · qc-nav-functions 11/11 · qc-crm-c3.1 56/56 · qc-crm-c3.2 47/47 · qc-crm-c3.3 84/84
- qc-crm-c1.10 รอบแรก 65/66: **S8.1** คู่มือขาด 3 path (`/reports` `/quotas` `/commissions` ไม่มีหมวดในตัวสร้าง ⇒ หายเงียบ) → เพิ่ม 3 หมวดใน `gen-crm-api-docs.mts` + สร้างคู่มือใหม่ (106 op) → รันซ้ำ §4b
- qc-member-m1.9 (อยู่ในรายการของ addendum ไม่ใช่ของผู้คุมงาน): `M1.9-ERR` ที่บรรทัด 54 — membership ของ `member-expected.json` owner = null บน QC2 (ไฟล์ expected ของ worktree นี้ไม่ใช่ของ seed QC2) — ไม่เกี่ยวกับโค้ดใบนี้ (ข้อสอบไม่แตะ CRM ก่อนจุดล้ม)
- typecheck: สะอาด ×2 (`typecheck-1.log` · `typecheck-2.log`) · fitness 33/33 ทั้งมี env และ `env -u DATABASE_URL -u DIRECT_URL` (`fitness-env.log` · `fitness-noenv.log`) — รอบสุดท้ายหลังแก้ตัวสร้างคู่มือ: §4b

## 4b. รอบสุดท้ายบน tree สุดท้าย (หลังแก้คอมเมนต์ S8.3 + หมวดคู่มือ)
- `qc-crm-c3.4` run4 **53/53** · run5 **53/53** (DB เดิมที่ใช้แล้ว · `c34-run4.log` · `c34-run5.log`) — `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` ทั้งสองรอบ
- `qc-crm-c1.10` รันซ้ำ **66/66** (`qc-crm-c1.10-r2.log`)
- typecheck สะอาด (`typecheck-final.log` · exit 0 · 0 error) · fitness 33/33 มี env (`fitness-env-final.log`) · 33/33 `env -u DATABASE_URL -u DIRECT_URL` (`fitness-noenv-final.log`)
- regression ชุดอื่นรันบน tree ก่อนหน้า ซึ่งต่างจาก tree สุดท้ายแค่คอมเมนต์ 3 บรรทัดใน `components/crm/ai/*` + 3 หมวดใน `gen-crm-api-docs.mts` + `docs/api/CRM-API.md`

## 5. finding ให้เลนอื่น
- **(AI/สมาชิก · ซ้ำกับที่ผู้คุมงานจด)** `ai/proposals.rejectProposal` ยังปิดข้อเสนอของโมดูลอื่นได้ด้วย id อย่างเดียว (ไม่รู้ผู้กด) — ใบนี้ปิดเฉพาะ CRM
- **(C3.8)** op `reports.get` / `quotas.progress` / `commissions.mine` สร้างแล้วด้วยสัญญาของ C3.8 — C3.8 เติม `C3.8` rows อื่นเอง · `commissions.mine` ผ่านคีย์ = แถวของผู้สร้างคีย์ (มติ 13) · หมวดคู่มือ reports/quotas/commissions อยู่ใน `gen-crm-api-docs.mts` แล้ว
- **(C3.8 · CRM_INTERNAL_EVENTS)** `crm.teamroom.posted` เป็น "ธงกันซ้ำ" ที่ประกาศใน webhooks/labels (แบบ `crm.activity.reminder`) — ถ้า C3.8 ตัดสินว่า flag event ต้องอยู่ใน `CRM_INTERNAL_EVENTS` ให้ย้ายทั้งสองตัวพร้อมกัน
- **(สมาชิก/QC)** `member-expected.json` ใน worktree c110 ไม่ตรงกับ seed QC2 ⇒ m1.9 ล้มตั้งแต่ setup
- **(D7 · ผู้คุมงาน)** ภาพ parity 14 ซ้าย / 13 ค ยังไม่ได้ถ่าย (ไม่มี build ในใบ builder)

## 6. ส่งต่อผู้ตรวจอิสระ
- จุดที่ควรเจาะ: `loadDoorRow` (คีย์ของ kind + การมองเห็นทุก id — ids จาก `dealId/contactId/companyId/activityId` บนสุด + `input.*` + `items[].dealId`) · `claimProposal` (reuse ใบเดิม/ธงค้าง 15 นาที) · `postFlagged` (ธง + โพสต์ใน tx เดียว · RoomRefused rollback) · `confirmProposal` edits (ขอบเขตแคบลงเท่านั้น) · การปิด `rejectProposal` ทั่วไป
- prompt ไม่มี PII: ตรวจ `dealFacts/contactFacts/companyFacts/atRiskFacts` (select ระบุช่องเอง) · ข้อความห้องทีม/การ์ด unfurl ไม่มีเบอร์/อีเมล/เลขภาษี
- `logActivity` ได้ `opts.ownerUserId` (ภายในเท่านั้น) — ตรวจว่าไม่มีทางเข้าภายนอกส่งช่องนี้
- executeProposal สาย CRM ไม่เปลี่ยนสำหรับ `crm.<op>` (มติ 10) — ถ้าต้องการให้ทุก kind CRM ผ่านประตูเดียว ต้องรองรับยืนยัน 2 ชั้น + ข้อความผลเดิมของ C1.10
- ไม่มีข้อมูลค้าง: ข้อสอบ CLEAN ผ่านทุกรอบ · ไม่มีการแตะร้าน seed

## § รอบ 2 — แก้ตามรีวิวอิสระ (MERGEABLE AFTER SHOULD-FIX · 0 BLOCKER)
| ข้อ | แก้อย่างไร | ที่ |
|---|---|---|
| S1 ห้อง PRIVATE | `listRoomOptions(tenantId, viewerUserId)` = การมองเห็นเดียวกับ `listVisibleChannels` (PUBLIC หรือเป็นสมาชิกที่ยังไม่ออก) · `setTeamRoom` ตรวจกับชุดเดียวกันด้วย `a.userId` · ตัวเลือกบนหน้าตั้งค่าใช้ชุดเดียวกัน | `meeting/service.ts:420-445` · `ai-bridges.ts:1003` (setTeamRoom) · `:1043` (teamRoomOptions) |
| S2 ข้อเสนอจากปุ่ม AI เดินทางเดิม | `executeProposal`: ทุก `crm.*` ที่ payload มี `requestedByUserId` → `confirmProposalById` (ประตู CRM: คีย์ + การมองเห็น **ก่อน** จอง + ปฏิเสธ WORKING#) · ทุก kind ที่ `resultNote` ขึ้นต้น `WORKING#` ถูกปฏิเสธ · `crm.<op>` จากแชท (ไม่มี requestedByUserId) เดินทางเดิม · conversationId ของข้อเสนอผู้ช่วย = `<prefix>:<สุ่ม 128 บิต>` (หาใบเดิมด้วย `startsWith` ใต้ advisory lock เดิม) | `ai/proposals.ts:365-384` · `ai-bridges.ts:383-400` (claimProposal) |
| S3 ดิจิสต์ล้มทั้งรอบ | try/catch ต่อห้อง · WARN OpsEvent ids ล้วน · ไปห้อง/ร้านถัดไป · **งานเก็บตกรายชั่วโมง `crm.teamroom.stale.sweep` (60 · hourly)** ตัวงานเดียวกัน — ธงต่อ (ระบบ·ทีม·วันไทย) กันซ้ำ | `ai-bridges.ts:956-975` · `platform/minute-jobs.ts:397-409` |
| N1 | `idsOfPayload` + recordId · customRecordId · enrollmentId (บนสุด + `input.*`) · ประตูตรวจ `recordWhere` และการลงทะเบียนลำดับ (ผู้ติดต่อ + ดีลของมัน) | `ai-bridges.ts:598-625` · `loadDoorRow` |
| N2 | แทน `{{kb:}}` **ก่อน** ตัวแปรในแม่แบบอีเมล (ชื่อผู้ติดต่อ `{{kb:<id>}}` ดึงบทความไม่ได้) | `crm/emails.ts:1048-1052` |
| N3 | ยืนยันงานติดตาม: ดีลต้องยัง OPEN + ไม่เก็บ · เพดาน 200 ตัดตอนสร้างข้อเสนอและบอกในสรุป (ไม่ตัดเงียบตอนยืนยัน) · ล้มกลางทาง = คืน PENDING (กดใหม่ได้ · `sourceRef` ต่อ (ข้อเสนอ, ดีล) กันงานซ้ำ) | `ai-bridges.ts:478-486` · `:736-742` · `:755` |
| N5 | unfurl = action เดียวต่อข้อความ (`unfurlDealLinksAction(urls ≤ 3)`) | `_actions/ai.ts:89-101` · `components/crm/ai/CrmDealUnfurl.tsx:29` |

**มติของ S3 ที่ต่างจากคำสั่ง (ให้ผู้คุมงานยืนยัน):** คำสั่งให้ลงทะเบียน `crm.teamroom.stale` เป็น `everyMinutes: 60` แต่ข้อสอบ **C3.4-X5.1** ตรึง `everyMinutes 1440 · cadence daily` ของชื่อนั้น ⇒ คงงานรายวันไว้ และเพิ่มงานเก็บตก `crm.teamroom.stale.sweep` (60 · hourly) ตัวงานเดียวกัน — แบบเดียวกับคู่ `crm.reports.scheduled` / `crm.reports.sweep` ของ C3.1 · ผลเท่ากับที่สั่ง (ร้านที่ล้ม/ถูกตัดงบได้ข้อความภายในวันไทยเดียวกัน ไม่ซ้ำ) · ถ้าต้องการให้ชื่อเดิมเป็นรายชั่วโมงจริง = ORACLE-EDIT C3.4-X5.1: `Number(row?.everyMinutes) === 60 && /cadence:\s*"hourly"/` แล้วลบงาน sweep

**หนี้/finding ที่บันทึก (ไม่แก้โค้ด)**
- N4 → คำถามเจ้าของ **Q13** ใน `ledger/CRM-OWNER-QUESTIONS.md` (สวิตช์ปิด/เพดานรายวัน/จำกัดบทบาท ของปุ่ม AI ในหน้า — ค่าเริ่มต้น: เปิดทุกคนที่เห็นข้อมูล กันแค่เครดิตหมด)
- N6 ข้อความห้องทีม **ไม่ผ่านการมองเห็นของ CRM โดยเจตนา**: ทุกคนในห้องเห็นชื่อดีล/มูลค่า/ชื่อ lead ของทีมนั้น (การผูกห้อง = ร้านเลือกเปิดเผยให้ห้องนั้น) · ลิงก์ในข้อความพาไปหน้า CRM ที่ยังตรวจการมองเห็นตามปกติ · การ์ด unfurl ตรวจการมองเห็นของผู้ดูทุกครั้ง · ไม่มีเบอร์/อีเมล/เลขภาษีในข้อความ
- N7 มีการพึ่งพาทางอ้อม **meeting → crm** ผ่าน `meeting/ui.tsx` → `components/crm/ai/CrmDealUnfurl.tsx` → server action ใต้ `src/app/app/sys/[id]/crm/_actions/ai.ts` — ไม่มี import `@/lib/modules/crm` จากโมดูล meeting (F2.1 ไม่นับ) · ถ้าต้องการตัดเส้นนี้ ให้ย้ายการวางการ์ดไปเป็น slot ที่หน้า `sys/[id]` ส่งเข้า MeetingHub

**ผล (QC2 · log `.qc-shots/c34/r2-*.log` · สรุป `.qc-shots/c34/summary.log` ส่วน "round 3")**
- `qc-crm-c3.4` **53/53 ×2** (`r2-c34-a.log` · `r2-c34-b.log`)
- qc-ai-proposals 16/16 · qc-ai-tools 18/18 · qc-crm-c1.10 66/66 · qc-meeting-invite 22/22 · qc-crm-c2.4 91/91
- typecheck สะอาด (`r2-typecheck.log` · exit 0 · 0 error) · fitness **33/33** มี env (`r2-fitness-env.log`) · **33/33** `env -u DATABASE_URL -u DIRECT_URL` (`r2-fitness-noenv.log`)

## § รอบ 3 — แก้ตามรีวิวรอบ 2 (MERGEABLE AFTER SHOULD-FIX)
| ข้อ | แก้อย่างไร | ที่ |
|---|---|---|
| S-R2.1 งานเก็บตกปักธงด้วยข้อมูลเมื่อวาน | `crm.teamroom.stale.sweep` ทำงานเฉพาะเมื่อ `crm.deals.stale` จบแล้วในหน้าต่างวันไทยนี้ (`getMinuteJobStatus(["crm.deals.stale"])` → `lastOkAt` มีค่า และ `minuteJobDue(1440, lastOkAt, now) === false`) — ไม่งั้นข้ามเงียบ · งานรายวัน `crm.teamroom.stale` ยังเป็นผู้โพสต์หลัก (ไม่เปลี่ยน) | `platform/minute-jobs.ts:397-414` |
| N1 เตือนห้องใช้ไม่ได้ทุกชั่วโมง | ดิจิสต์ส่ง `warnOnceKey = warn:stale:<ระบบ>:<ทีม>:<วันไทย>` · WARN ได้ครั้งเดียวต่อ (ระบบ·ทีม·วันไทย) — กุญแจอยู่หัว `detail` ของ OpsEvent ของร้านนั้น (ไม่มีตารางธงเพิ่ม · ลบไปพร้อมร้าน) | `ai-bridges.ts:887` (postFlagged) · `:901-906` |
| N2 ตัวเลือกห้อง | `teamRoomOptions` คืน `hiddenLive` (id ห้องที่ผูกไว้ ผู้ดูมองไม่เห็น แต่ยังใช้งานอยู่ — ผ่าน facade ใหม่ `meeting.liveChannelIds`, id ล้วน) · picker แสดง "ห้องที่คุณมองไม่เห็น (ยังใช้งานอยู่)" · ค่าในช่องเลือกห้องเป็นเฉพาะห้องที่ผู้ดูเห็น (บันทึกไม่ส่ง id ที่ซ่อน) · ปุ่ม "เลิกผูก" แสดงเสมอแม้ผู้ดูเห็น 0 ห้อง | `ai-bridges.ts:1074-1090` · `meeting/service.ts:446-460` · `meeting/index.ts` · `components/crm/ai/CrmTeamRoomPicker.tsx:14-60` · `settings/page.tsx` |
| N3 | `idsOfPayload` + `parentId` · ประตูตรวจ: ถ้า parent เป็นผู้ติดต่อ/บริษัท/ดีลของระบบนี้ ต้องมองเห็น (id ที่ไม่ใช่ตาราง CRM เช่นสมาชิก ปล่อยให้ op ตรวจตอนยืนยัน) | `ai-bridges.ts:625` · `:675-686` |
| N4 | ข้อเสนอ `crm.assist.tasks` **ของคนกดเอง** ที่มีดีลซึ่งเขามองไม่เห็นแล้ว = ตัดดีลนั้นออกตอนยืนยัน/ยกเลิก (เหลือ 0 = ปฏิเสธพร้อมบอกให้กดใหม่) · ใบของ "คนอื่น" ยังต้องมองเห็นครบ (ไม่งั้น X9.1 — thana แตะใบของผู้จัดการที่มีดีลกระบี่ — จะผ่านได้) · payload ที่ตัดแล้วถูกเขียนลงแถวตอนจอง EXECUTED · `runAssist` ไม่ใช้ใบเดิมซ้ำถ้ามีดีลที่ไม่อยู่ในชุดเสี่ยงที่คนกดเห็นตอนนี้ (ปิดเป็น EXPIRED `STALE_SCOPE` แล้วออกใบใหม่) | `ai-bridges.ts:652-661` · `:387-411` (claimProposal `reusable`) · runAssist home.atRisk |
| N5 (edge) — ข้อจำกัดที่รู้แล้ว | งานติดตามซ้ำได้ในกรณีขอบ — ถ้ายืนยันใบ crm.assist.tasks ล้มกลางทางแล้วใบคืนเป็น PENDING แต่ไม่มีใครกดซ้ำจนหมดอายุ 24 ชม. การกด AI ครั้งใหม่ในเดือนเดียวกันจะออกใบใหม่ (proposalId ใหม่ ⇒ sourceRef ใหม่) ดีลที่ได้งานไปแล้วในรอบที่ล้มจึงได้งานซ้ำ 1 งาน · ยอมรับได้ (เกิดยาก · งานลบได้) · แนวแก้ถ้าจำเป็น: sourceRef ต่อ (systemId, dealId, เดือนไทย) แทน proposalId | ไม่แก้โค้ด (มติผู้คุมงาน) |

**หมายเหตุ S-R2.1:** งานรายวัน `crm.teamroom.stale` เองก็อาจถูกตัวกระจายวางไว้ก่อน `crm.deals.stale` ในคืนเดียวกัน (ลำดับของงานรายวันไม่มีการรับประกัน) — ถ้าเป็นเช่นนั้นดิจิสต์วันนั้นใช้ธงนิ่งของเมื่อวาน · ไม่ได้แก้ตามมติ ("keep the daily job as the primary poster") · ถ้าต้องการ ให้ใช้ด่านเดียวกันกับงานรายวันด้วย แล้วให้งานเก็บตกเป็นผู้โพสต์หลังงานนิ่งจบ

**ผล (QC2 · log `.qc-shots/c34/r3-*.log` · สรุป `.qc-shots/c34/summary.log` ส่วน "round 4")**
- `qc-crm-c3.4` **53/53 ×2** (`r3-c34-a.log` · `r3-c34-b.log`)
- qc-crm-c2.10 41/41 · qc-cron 4/4 · qc-ai-proposals 16/16
- typecheck สะอาด (`r3-typecheck.log` · exit 0 · 0 error) · fitness **33/33** มี env (`r3-fitness-env.log`) · **33/33** `env -u DATABASE_URL -u DIRECT_URL` (`r3-fitness-noenv.log`)

**รอบ 3 ต่อ (มติผู้คุมงาน):** งานรายวัน `crm.teamroom.stale` ใช้ด่านเดียวกับรอบเก็บตก — ทำงานเฉพาะเมื่อ `crm.deals.stale` จบแล้วในวันไทยนี้ (`getMinuteJobStatus` + `minuteJobDue(1440, lastOkAt, now) === false`) ไม่งั้นข้ามเงียบ · ทั้งสองงานใช้ธงต่อวันร่วมกัน ⇒ ตัวแรกหลังงานนิ่งจบเป็นผู้โพสต์ (`platform/minute-jobs.ts:385-398`) · N4 (ตัดดีลที่มองไม่เห็นเฉพาะใบของคนกดเอง) ผู้คุมงานรับแล้ว (X9.1 ตรึงไว้) · N5 เติมคำบรรยายในตารางด้านบนแล้ว
- ผล (`.qc-shots/c34/summary.log` ส่วน "round 5"): `qc-crm-c3.4` **53/53** (`r4-c34.log`) · qc-crm-c2.10 **41/41** (`r4-qc-crm-c2.10.log`) · typecheck สะอาด (`r4-typecheck.log` · 0 error)

## § รอบ 4 (C1.3-S0.3) — regression: อ่าน CrmCompany ตรงนอก companies*.ts / where.ts
| แก้อะไร | ที่ไหน |
|---|---|
| ทางอ่านบริษัทใหม่ในบริการบริษัท (ทุกตัวกรองด้วย `companyWhere` ของคนที่ถาม/คนสแกน · การมองเห็นเท่าเดิม · ผู้เรียกไม่มี tx จึงไม่รับ tx): `namesByIds` · `briefForAssist` (name+industry) · `factsForAssist` (ช่องเดิมของ companyFacts · ไม่อ่าน taxId/phone/email/website) · `countVisibleByIds` · `matchByExactName` (ไม่สนตัวพิมพ์ · ยังใช้งาน · ไม่ถูกรวม · สร้างก่อนมาก่อน) | `companies.ts:2297-2329` (`:2304` `:2308` `:2312` `:2319` `:2323`) |
| ai-bridges อ่านบริษัทผ่าน `companiesSvc` (เลิก import `companyWhere`): ตารางดีลเสี่ยง · dealFacts · contactFacts · companyFacts · ประตูข้อเสนอ (ids.companies) · parentId (ใช้ `countVisibleCompany(scope, null, pid)` = where `{id, tenantId, systemId}` เดิม และ `countVisibleCompany(scope, a, pid)`) · การ์ดลิงก์ดีล | `ai-bridges.ts:35` `:198` `:252` `:293` `:313` `:661` `:678-679` `:1122` |
| calls.ts จับคู่ชื่อบริษัทบนนามบัตรผ่าน `companiesSvc.matchByExactName(ctx, a, cardCompany)` (เลิก import `companyWhere` · คอมเมนต์ AUDIT-CLASS X1/X2 คงไว้) | `calls.ts:36` `:647` |

ผล (QC1 · `.qc-shots/c34fix/progress.log` · `<ชุด>.log`): qc-crm-c1.3 **89/89** · qc-crm-c1.6 79/79 · qc-crm-c3.4 **53/53** · qc-crm-c2.4 **91/91** · typecheck สะอาด (0 error) · fitness 33/33 ทั้งมี env และ `env -u DATABASE_URL -u DIRECT_URL`

## ผู้คุมงาน (Fable 5.1 · 27 ก.ย. 2569) — รับงาน
| # | ผล | หลักฐาน |
|---|---|---|
| D1 | ✅ | ข้อสอบ 53 ข้อเขียนก่อน (`7e6d60e4`) · ruling addendum 1–13 + 4 มติ · ไม่มี ORACLE-EDIT (S3 ใช้คู่ daily+sweep แทน) |
| D2 | ✅ | `qc-crm-c3.4` **53/53 ×2** QC1 seed ใหม่ (`c34-verify.log`) · 53/53 หลัง fixer (`c33fix-main.log`) · 53/53 ×2 ทุกรอบบน QC2 |
| D3 | ✅ | deviation 5 ข้อ: รับ 4 · ข้อ 4 บางส่วน → S2 (ประตูสำหรับทุก crm.* ที่มี requestedByUserId) |
| D4 | ✅ | ถอยหลัง QC1 (`c34-verify.log`): ai-tools 18 · ai-proposals 16 · ai-skills 23 · ai-credit 32 · ai-vision 6 · kb 12 · kb-search · kb-auto · meeting-invite 22 · c1.7 57 · c3.9 36 · + ชุดของ C3.9 D4 ทั้งหมด · **regression จริง 3 จุดพบในยูนิต แก้ครบ**: C0.2-S1.4 (ORACLE-EDIT namespace ทั่วไป) · C1.11 S1.6/S6.10 (min-w-[420px] · คอมเมนต์ `/**`) · C1.3-S0.3 (fixer: companies helpers) — ยืนยันซ้ำ c0.2 27 · c1.11 66 · c1.3 89 · c3.4 53 · c2.4 91 · c1.6 79 |
| D5/D6 | ✅ | typecheck 5120 exit 0 ×3 · fitness 33/33 ×2 · build ผ่าน (part B) |
| D7 | ✅ | ภาพ `.qc-shots/crm/3.4/` owner 10 ใบ + thana 4 ใบ ผู้คุมงานดูเอง: deal 360 แผง AI 4 ปุ่ม · contact 360 2 ปุ่ม · company 360 2 ปุ่ม · หน้าแรก "ดีลไหนเสี่ยงเดือนนี้ → ถามผู้ช่วย" · ตั้งค่า "ห้องแชทของทีมขาย" (สถานะว่างเพราะร้าน QC ไม่มีห้อง) · เทียบ mockup 14 ซ้าย: ตารางผล+การ์ดข้อเสนอ = ข้อสอบ S8 static (ไม่กดโมเดลตอนถ่าย) · thana: company 404/home ไม่มี = ตามสิทธิ์ (สเปคแก้) · m3.10 21/21 |
| D8–D11 | ✅ | ผู้ตรวจอิสระ 2 รอบ (SHOULD-FIX 3 + NOTE 7 → รอบ 2 SHOULD-FIX 1 + NOTE 5 → รอบ 3 ปิด + ด่านงานรายวัน) · H3 ผ่าน (thana เข้าถึงกระบี่ไม่ได้ทั้ง 32 tool + 9 kind) |
| D12 | ⏳ | รอ push |
หนี้: Q13 (เครดิต AI ใครกดได้) · หน้าแรกมีการ์ด AI 3 ปุ่มเดิม + แผง C3.4 ซ้อน (รวมใน C4) · N5 งานซ้ำกรณีขอบ · การพึ่งพาทางอ้อม meeting→crm ผ่าน components/crm/ai · rejectProposal ทั่วไปของโมดูลอื่น (เลน AI)
