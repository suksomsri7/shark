# SHARK CRM API — ข้อกำหนด v2 (draft สำหรับสั่งทำ · 11 ก.ย. 2569)

> เอกสารนี้คือ **สัญญา API ทุกฟังก์ชันของ CRM v2** ที่ทะเบียน op (`registry.ts` (แผน · src/lib/modules/crm/api/)) ต้องทำให้ตรง — ตอนสร้างจริง generator (`gen-crm-api-docs.mts` (แผน · scripts/)) จะเขียนคู่มือเต็ม (อังกฤษ · shapes · curl · manifest) ทับไฟล์นี้จากทะเบียนจริง แบบเดียวกับ `KANBAN-API.md` / `ACCOUNT-API.md` / `MEMBER-API.md` (F13.x บังคับตรงกับ generator)
> ผู้ใช้เป้าหมาย: นักพัฒนาภายนอก · เว็บ/แอปของร้าน · n8n/Zapier · **AI agent** (Claude/GPT/Gemini) ผ่าน skill manifest — ทุก op มี summary อังกฤษ (ประหยัด token) และป้ายไทย
> พิมพ์เขียว: `docs/modules/20-crm-v2.md` · แบบ: `ledger/DESIGN-CRM.md` · แผนงาน: `ledger/CRM-RUN.md`

## 1. หลักการ (เหมือนบอร์ดงาน/บัญชี/สมาชิก)
- Base URL `https://shark.in.th/api/v1/crm` · `Authorization: Bearer <API key>` · คีย์ผูกร้าน+ระบบ CRM · bundle 3 ชุด: `crm.readonly` (read ทั้งหมด ยกเว้นอีเมล body/ไฟล์เสียง/คอมมิชชัน) · `crm.operate` (read + write ที่พนักงานทำได้: lead/บริษัท/ดีล/กิจกรรม/อีเมล/sequence enroll/records) · `crm.admin` (ทั้งหมด + ตั้งค่า + danger)
- คีย์กำหนดขอบเขตการมองเห็นได้: `asUserId` (มองเห็นเท่าผู้ใช้นั้น) หรือ `teamId` — ไม่ตั้ง = ALL ตาม bundle (เฉพาะ admin) · readonly/operate ที่ไม่ตั้ง = ALL แบบไม่มีอ่อนไหว
- Class: **read** (ไม่เขียน ไม่ audit) · **write** (ต้องมี `Idempotency-Key` · audit ทุกครั้ง) · **danger** (write + ยืนยัน 2 ขั้น/approval: ลบ · รวม · โอนข้ามทีมเกินเพดาน · อนุมัติคอมมิชชัน · ลบวัตถุ · หมุน inbound key · ถอดสิทธิ์ portal)
- รูปแบบตอบ `{ ok: true, data }` / `{ ok: false, error: { code, message(ไทย), details? } }` · แบ่งหน้า `take/cursor` · เวลาทั้งหมด ISO-8601 +07:00 · เงินสตางค์ (`*Satang`) · % เป็น basis point (`*Bp`)
- error code: `UNAUTHORIZED · FORBIDDEN · NOT_FOUND (404-not-403 รวม visibility) · VALIDATION · CONFLICT (idempotency/unique/duplicate) · LIMIT · APPROVAL_REQUIRED (คืน approvalRequestId) · RATE_LIMITED · STAGE_REQUIREMENTS (คืน missing[]) · EMAIL_BLOCKED (optOut/bounced) · CHANNEL_NOT_CONNECTED · TRACKING_DISABLED · PORTAL_ACCESS_REVOKED`
- ฟิลด์กำหนดเอง: `fields: { "<key>": value }` ของ contact/company/deal/record (key ของ MemberField objectKey นั้น) · ฟิลด์อ่อนไหวของสมาชิกไม่ออกทาง CRM API
- ช่องทาง (D19): `channel` ใช้ key จาก `GET /api/v1/member/channels`
- webhook: ทุก event §5 ส่ง `POST` พร้อม `X-Shark-Signature` (HMAC เดิม) · retry 5 ครั้ง
- rate limit 600 req/นาที/คีย์ · tracking endpoints (public) 6,000/นาที/ระบบ · payload ≤ 1 MB · import/export/ถอดเสียง = async job

## 2. ทะเบียน op (96 op · read 42 · write 46 · danger 8)

รูปแบบ: `op` — **METHOD path** — scope — class — ป้ายไทย — input หลัก → output หลัก — event

### 2.1 contacts (ผู้ติดต่อ · 16)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `contacts.list` | GET /contacts | crm.contact.read | read | รายชื่อผู้ติดต่อ | q · stage · leadStatus · owner · team · scoreBand · sourceKind · companyId · tag · `f.<key>` · savedViewId · sort · take/cursor → items[ContactBrief+listFields] · total (ตาม visibleWhere) |
| `contacts.search` | GET /contacts/search | read | read | ค้นเร็ว (ชื่อ/เบอร์/อีเมล/บริษัท) | q ≥ 2 · take ≤ 20 → items[ContactBrief] |
| `contacts.get` | GET /contacts/{id} | read | read | ผู้ติดต่อ 360 | include=timeline,links,score,sequence → Contact360 |
| `contacts.create` | POST /contacts | crm.contact.create | write | เพิ่ม lead/ผู้ติดต่อ | {firstName, lastName?, phone?, email?, companyId?|company{name,taxId?}, jobTitle?, role?, sourceKind, sourceChannel?, sourceDetail?, fields{}, tags[], ownerUserId?|"auto", consents[]?} → {contactId, partyId, companyId?, assignedTo, duplicate?: ContactBrief} · `crm.contact.created` |
| `contacts.update` | PATCH /contacts/{id} | crm.contact.update | write | แก้ข้อมูล | patch + fields{} → Contact360 · `crm.contact.updated` |
| `contacts.setLeadStatus` · `contacts.setLifecycle` | PUT /contacts/{id}/lead-status · /lifecycle | update | write | สถานะ lead / lifecycle | {leadStatus} / {lifecycleStage, reason?} · `crm.contact.updated` |
| `contacts.assign` | PUT /contacts/{id}/owner | update (reassign ถ้าข้ามทีม) | write | มอบหมาย | {userId|teamId|"rule"} → {ownerUserId, teamId, ruleId?} · `crm.contact.assigned` |
| `contacts.convert` | POST /contacts/{id}/convert | crm.contact.convert | write | แปลง lead | {member?:{systemId?, welcome?}, company?:{id|new{…}}, deal?:{pipelineId, stageId?, title, valueSatang?, lines[]?}} → {customerId?, companyId?, dealId?} · `crm.contact.converted` |
| `contacts.setTags` · `contacts.setOptOut` · `contacts.archive` | PUT /contacts/{id}/tags · /opt-out · POST /contacts/{id}/archive | update | write | แท็ก / ยกเลิกรับ / เก็บถาวร | {add[],remove[]} / {email?, marketing?, tracking?} |
| `contacts.timeline` | GET /contacts/{id}/timeline | read | read | ไทม์ไลน์ (ทุกโมดูลผ่าน Party) | type[] · from/to · take/cursor → items[Activity] |
| `contacts.duplicates.list` · `contacts.duplicates.dismiss` | GET /contacts/duplicates · POST /contacts/duplicates/{pairId}/dismiss | crm.contact.merge | read/write | ตัวซ้ำ | → pairs[{a,b,reason,score}] |
| `contacts.merge` | POST /contacts/{keepId}/merge | merge | **danger** | รวมผู้ติดต่อ | {mergeId, fieldChoices{}, confirm:"MERGE"} → {keptId} · `crm.contact.merged` |
| `contacts.import.start` · `contacts.import.status` | POST /contacts/import · GET /contacts/import/{jobId} | crm.contact.import | write/read | นำเข้า (async) | {fileId|rows[], mapping{}, options{onDuplicate, sourceKind, assignRuleId?, companyColumn?}} → {jobId, preview} |
| `contacts.export` | POST /contacts/export | crm.contact.export | write | ส่งออก CSV (async) | {filters, columns[]} → {jobId} |
| `contacts.brief` | GET /contacts/brief?ids= | read | read | หลายคน (≤100) | → items[ContactBrief] |
| `contacts.byParty` | GET /contacts/by-party/{partyId} | read | read | ผู้ติดต่อของ Party (ให้แชท/สมาชิก/บัญชี) | → {contact?, company?, openDeals[], score} |

### 2.2 companies (บริษัท · 12)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `companies.list` | GET /companies | crm.company.read | read | รายชื่อบริษัท | q · stage · owner · team · industry · size · hasOpenDeals · outstanding · `f.<key>` · sort · take/cursor |
| `companies.get` | GET /companies/{id} | read | read | บริษัท 360 | include=contacts,deals,docs,objects,timeline,portal → Company360 |
| `companies.create` | POST /companies | crm.company.create | write | เพิ่มบริษัท | {name, taxId?, branchCode?, emailDomain?, industry?, size?, website?, phone?, email?, address?, ownerUserId?, teamId?, parentCompanyId?, fields{}} → {companyId, partyId, accountContactId?, duplicate?} · `crm.company.created` |
| `companies.update` · `companies.archive` · `companies.setOwner` · `companies.setParent` | PATCH /companies/{id} · POST …/archive · PUT …/owner · PUT …/parent | crm.company.update | write | — | `crm.company.updated` |
| `companies.contacts.add` · `companies.contacts.remove` · `companies.contacts.setPrimary` · `companies.contacts.setRole` | POST /companies/{id}/contacts · DELETE …/contacts/{contactId} · PUT …/contacts/{contactId}/primary · PUT …/contacts/{contactId}/role | update | write | ผู้ติดต่อในบริษัท | {contactId|contact{…}, role, jobTitle?, isPrimary?} |
| `companies.duplicates.list` · `companies.merge` | GET /companies/duplicates · POST /companies/{keepId}/merge | crm.company.merge | read / **danger** | ตัวซ้ำ/รวม | {mergeId, confirm:"MERGE"} · `crm.company.merged` |
| `companies.import.start` · `companies.importFromAccount` | POST /companies/import · POST /companies/import-from-account | crm.company.create | write | นำเข้า / จากบัญชี | {accountContactIds[]} → {created, linked} |
| `companies.outstanding` | GET /companies/{id}/outstanding | read | read | ค้างชำระ (จากบัญชี) | → {outstandingSatang, docs[]} |

### 2.3 deals (ดีล · 16)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `deals.list` | GET /deals | crm.deal.read | read | รายการดีล | pipelineId · view · owner · team · stageId · kind · closeFrom/To · stale · forecastCategory · companyId · contactId · tag · `f.<key>` · q · savedViewId · sort · take/cursor |
| `deals.board` | GET /deals/board?pipelineId= | read | read | กระดาน | → columns[{stage, count, sumSatang, weightedSatang, deals[DealCard]}] |
| `deals.get` | GET /deals/{id} | read | read | ดีล 360 | include=lines,history,timeline,emails,docs,cards → Deal360 |
| `deals.create` | POST /deals | crm.deal.create | write | เปิดดีล | {pipelineId, stageId?, title, contactId, companyId?, valueSatang?|lines[], expectedCloseAt?, ownerUserId?, collaboratorUserIds[]?, forecastCategory?, sourceKind?, sourceDetail?, fields{}, tags[]} → {dealId} · `crm.deal.created` |
| `deals.update` | PATCH /deals/{id} | crm.deal.update | write | แก้ | patch + fields{} · `crm.deal.updated` |
| `deals.move` | PUT /deals/{id}/stage | crm.deal.move | write | ย้ายขั้น | {stageId, note?, lostReasonId?, requireFieldsValues{}?} → Deal360 · error `STAGE_REQUIREMENTS{missing[]}` · `crm.deal.stage.changed` (+won/lost) |
| `deals.reopen` · `deals.reassign` · `deals.setForecast` · `deals.setNextStep` · `deals.setCollaborators` · `deals.archive` | POST …/reopen · PUT …/owner · PUT …/forecast · PUT …/next-step · PUT …/collaborators · POST …/archive | move / reassign / forecast / update | write | — | `crm.deal.reopened` / `.reassigned` / `.updated` |
| `deals.lines.set` | PUT /deals/{id}/lines | crm.deal.lines | write | รายการสินค้า | {lines[{productId?, name, qty, unitPriceSatang, discountBp?, vatRateBp?}]} → {valueSatang, lines[]} · `APPROVAL_REQUIRED` เมื่อส่วนลด > เพดาน |
| `deals.quote` | POST /deals/{id}/quotation | crm.deal.quote | write | ออกใบเสนอราคา (บัญชี) | {validDays?, note?} → {docId, docNo, publicUrl} |
| `deals.invoice` | POST /deals/{id}/invoice | crm.deal.quote | write | ออกใบแจ้งหนี้ | {fromQuotation?:true} → {docId} |
| `deals.history` | GET /deals/{id}/history | read | read | ประวัติขั้น | → items[{from,to,by,enteredAt,leftAt,durationSec}] |
| `deals.forecast` | GET /deals/forecast | crm.report.view | read | forecast | period · groupBy=month|owner|team · pipelineId · teamId → rows[{key, pipelineSatang, bestCaseSatang, commitSatang, closedSatang, quotaSatang?}] |
| `deals.stale` | GET /deals/stale | read | read | ดีลนิ่ง (ให้ AI/หน้าแรก) | team? · owner? · take → items[DealCard+staleDays] |
| `pipelines.list` · `pipelines.create` · `pipelines.update` · `stages.upsert` · `lostReasons.list/upsert` | GET/POST /pipelines · PATCH /pipelines/{id} · PUT /pipelines/{id}/stages · GET/PUT /lost-reasons | read / crm.settings.manage | read/write | ตั้งค่า pipeline/ขั้น/เหตุผลแพ้ | stages[{id?, name, kind, probability, staleDays?, requireFields[], requireLines?, requireQuotation?, sortOrder}] |

### 2.4 activities · calendar (กิจกรรม · 9)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `activities.list` | GET /activities | crm.activity.read | read | รายการ | mine|owner|team · status=pending|today|week|overdue|done · type · contactId · dealId · companyId · from/to · take/cursor |
| `activities.get` | GET /activities/{id} | read | read | รายละเอียด (+transcript/summary ถ้ามีสิทธิ์) | — |
| `activities.log` | POST /activities | crm.activity.create | write | บันทึกกิจกรรม | {type, direction?, channel?, contactId?, companyId?, dealId?, customRecordId?, title, body?, startAt?, endAt?, durationSec?, outcome?, recordingFileId?, attendees?, location?, dueAt?, remindAt?, done?, nextTask?} → {activityId, aiJobId?} · `crm.activity.logged` |
| `activities.complete` · `activities.reschedule` · `activities.update` · `activities.delete` | POST …/complete · PUT …/schedule · PATCH … · DELETE … | complete / create / delete | write | — | `crm.activity.completed` |
| `activities.transcribe` | POST /activities/{id}/transcribe | create | write | ส่งไฟล์เสียงให้ AI (async · เป็น proposal) | → {jobId} → proposal เติม transcript/aiSummary/aiNextStep |
| `calendar.list` | GET /calendar | read | read | ปฏิทิน (รวมนัดจากจอง/คลินิก/โรงเรียน อ่านอย่างเดียว) | from · to · team? · mine? → items[{source, activityId?, appointmentId?, title, startAt, endAt, contact, deal?}] |
| `activities.outcomes` | GET /activities/outcomes | read | read | ทะเบียนผลสายต่อชนิด | → {CALL[], MEETING[], …} |

### 2.5 emails (อีเมล · 12)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `emails.threads` | GET /emails | crm.email.read | read | กล่องรวม/ต่อผู้ติดต่อ | contactId? · companyId? · dealId? · unmatched? · q · take/cursor → threads[{threadKey, subject, last, count, contact?, unread}] |
| `emails.thread` | GET /emails/threads/{threadKey} | read | read | thread | → messages[EmailMessage(+events)] (body เฉพาะ operate/admin) |
| `emails.send` | POST /emails | crm.email.send | write | ส่งอีเมล | {contactId, dealId?, to[], cc[], subject, bodyHtml|templateId+vars{}, attachments[fileId], scheduledAt?, replyToThreadKey?} → {emailId, messageId, routing} · error `EMAIL_BLOCKED` · `crm.email.sent` |
| `emails.attach` | POST /emails/{id}/attach | read+update | write | จับคู่มือ | {contactId|companyId|dealId} |
| `emails.templates.list/create/update/archive` | GET/POST /emails/templates · PATCH/POST …/{id} | read / crm.email.settings | read/write | เทมเพลต | {name, subject, bodyHtml, category, variables[]} |
| `emails.routing.get` · `emails.routing.set` | GET/PUT /emails/settings | crm.email.settings | read/write | ตั้งค่าเส้นทาง (C4 ระดับร้าน) | {fromMode, fromDomain?, fromName, replyToMode, replyToAddr?, copyToAddr?, copyMode, bccCaptureEnabled, strangerToLead, trackOpens, trackClicks, retentionDays, allowUserOverride} |
| `emails.routing.me.get` · `emails.routing.me.set` | GET/PUT /emails/settings/me | crm.email.send | read/write | ทับต่อผู้ใช้ | {fromName?, fromAddr?, replyToMode, replyToAddr?, copyToAddr?, copyMode, signatureHtml?} |
| `emails.routing.rotateKey` | POST /emails/settings/rotate-key | crm.email.settings | **danger** | หมุน inbound key | {confirm:"ROTATE"} → {inboundAddress} |
| `emails.sendTest` | POST /emails/settings/test | crm.email.settings | write | ส่งทดสอบ | {to} → {ok, routing} |
| `emails.domain.status` | GET /emails/settings/domain | crm.email.settings | read | สถานะ DNS โดเมนร้าน | → {domain, dkim, spf, verified, records[]} |

### 2.6 sequences · assignment · scoring (อัตโนมัติ · 12)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `sequences.list/get/create/update/archive` | GET/POST /sequences · GET/PATCH/POST /sequences/{id} | crm.sequence.enroll (read) / crm.sequence.manage | read/write | sequence | {name, steps[{kind, templateId?, subject?, body?, waitDays?, waitHours?, taskTitle?, channel?}], stopOnReply, stopOnWon, stopOnLost, businessDaysOnly, sendWindow} |
| `sequences.enroll` | POST /sequences/{id}/enroll | crm.sequence.enroll | write | ลงทะเบียน | {contactId, dealId?, replace?:bool} → {enrollmentId, nextAt} · CONFLICT ถ้ามี ACTIVE · `crm.sequence.enrolled` |
| `sequences.enrollments.list` · `sequences.stop` · `sequences.pause/resume` | GET /sequences/{id}/enrollments · POST /enrollments/{id}/stop · …/pause · …/resume | enroll | read/write | — | `crm.sequence.finished` |
| `assignment.rules.list/upsert/reorder` · `assignment.simulate` | GET/PUT /assignment/rules · PUT /assignment/rules/order · POST /assignment/simulate | crm.assignment.manage | read/write | กฎมอบหมาย | rules[{name, conditions, mode, userIds[], teamId?, maxOpenPerUser?, active}] · simulate {rows[]} → assignments[] |
| `scoring.rules.list/upsert` · `scoring.explain` · `scoring.recompute` | GET/PUT /scoring/rules · GET /contacts/{id}/score · POST /scoring/recompute | crm.score.manage (read: contact.read) | read/write | กฎคะแนน / เหตุผล / คำนวณใหม่ (dry-run ก่อน) | — |
| `automation.rules.*` | (ใช้ op ของ automation เดิม scope=CRM: `/api/v1/kanban/automation` → ย้ายเป็น `/api/v1/automation/*` กลาง — ใบ C2.1 ตัดสิน) | crm.automation.manage | — | กฎอัตโนมัติ | trigger crm.* · action 14 · dry-run |

### 2.7 objects · records (วัตถุกำหนดเอง · 9)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `objects.list` · `objects.get` | GET /objects · GET /objects/{key} | crm.record.read | read | วัตถุทั้งหมด (+layout) | → items[{key, label, labelPlural, parentType, titleFieldKey, showAsTab, portalVisible, recordCount, sections[FieldDef]}] |
| `objects.create` · `objects.update` · `objects.archive` | POST /objects · PATCH /objects/{key} · POST /objects/{key}/archive | crm.object.manage | write / **danger** (archive มีรายการ) | สร้าง/แก้/เก็บถาวรวัตถุ | {key, label, labelPlural, icon?, parentType, titleFieldKey, showAsTab, portalVisible, templateKey?} |
| `objects.fields.*` | (ใช้ op `fields.*` ของสมาชิก `/api/v1/member/fields?objectKey=<key>`) | crm.object.manage | — | ฟิลด์ของวัตถุ | engine เดียวกัน |
| `records.list` | GET /objects/{key}/records | crm.record.read | read | รายการ | parentId? · q · `f.<key>` · savedViewId · sort · take/cursor |
| `records.get` · `records.create` · `records.update` · `records.archive` · `records.move` | GET/POST /objects/{key}/records · PATCH/POST /objects/{key}/records/{id} · PUT …/parent | record.read / record.create / record.update / record.delete | read/write | รายการเดี่ยว | {parentId?, title?, values{}, unitId?, ownerUserId?} · `custom.record.*` |
| `records.timeline` · `records.import` · `records.export` | GET …/{id}/timeline · POST /objects/{key}/records/import · POST …/export | read / create / read | read/write | — | — |
| `records.byParent` | GET /objects/records?parentType=&parentId= | read | read | แท็บใน 360 (ทุกวัตถุของแม่) | → objects[{key, label, count, items[≤5]}] |

### 2.8 teams · visibility · quotas · commissions (ทีมขาย · 10)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `teams.list/get/create/update/archive` · `teams.members.set` | (core) GET/POST /api/v1/teams · GET/PATCH/POST /teams/{id} · PUT /teams/{id}/members | team.manage (read: ทุกคน) | read/write | ทีมกลาง | {name, leadUserId?, unitIds[], members[{userId, role, acceptingLeads}]} · `team.updated` |
| `visibility.policies.list/set` | GET/PUT /visibility | crm.visibility.manage | read/write | นโยบายการมองเห็น | policies[{role?, teamId?, pipelineId?, entity, visibility}] |
| `quotas.list/set` · `quotas.progress` | GET/PUT /quotas · GET /quotas/progress | crm.quota.manage (progress: report.view) | read/write | โควตา / ความคืบหน้า | {ownerType, ownerId, periodKey, targetSatang, targetDeals?, targetActivities?} → progress {won, paid, deals, activities, pct} |
| `commissions.rules.list/upsert` | GET/PUT /commissions/rules | crm.commission.approve | read/write | กฎคอมมิชชัน | {name, basis, kind, config, pipelineId?, teamId?, productIds[], minDealSatang?, splitCollaboratorsBp, payoutDelayDays} |
| `commissions.list` | GET /commissions | crm.commission.view | read | รายการ (ของฉัน/ทีม/ทั้งหมด ตาม visibility) | status · periodKey · userId · take/cursor |
| `commissions.approve` · `commissions.reject` | POST /commissions/{id}/approve · …/reject | crm.commission.approve | **danger** (เกินเพดาน → APPROVAL_REQUIRED) | อนุมัติ/ปฏิเสธ | {note?} · `crm.commission.approved` |
| `commissions.report` | GET /commissions/report | commission.view | read | สรุปต่อคน/งวด | periodKey · teamId → rows |

### 2.9 tracking (ติดตาม · 8)
| op | METHOD path | scope | class | ไทย | input → output |
|---|---|---|---|---|---|
| `tracking.links.list/create/update` · `tracking.links.stats` | GET/POST /tracking/links · PATCH …/{id} · GET …/{id}/stats | crm.tracking.manage (read: contact.read) | read/write | ลิงก์ติดตาม | {url, name, campaignId?, linkId?, channel?, expiresAt?} → {code, shortUrl, qrUrl} |
| `tracking.settings.get/set` | GET/PUT /tracking/settings | crm.tracking.manage | read/write | ตั้งค่า (C6) | {web{enabled, domains[], consentText, consentVersion, retentionDays}, email{trackOpens, trackClicks}} |
| `tracking.stats` | GET /tracking/stats | crm.report.view | read | สถิติ 30 วัน | → {emails{sent, openRate, clickRate, bounceRate}, web{sessions, consentRate, identified, leads}, links[]} |
| `tracking.sessions` | GET /contacts/{id}/web | crm.contact.read | read | ไทม์ไลน์เว็บของผู้ติดต่อ | → sessions[{startedAt, pageViews, events[]}] |
| public (ไม่ใช้คีย์): `GET /t/o/{token}.gif` · `GET /t/c/{token}` · `GET /l/{code}` · `GET /t/s/{systemKey}.js` · `POST /t/e` (web events) · `POST /t/consent` · `GET /u/{token}` (unsubscribe) | — | — | — | ตอบ gif/302/204 เท่านั้น |

### 2.10 portal (ลูกค้า · 10 · session ลูกค้า ไม่ใช่ API key)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `portal.invite` · `portal.access.list` · `portal.access.revoke` | POST /portal/invites · GET /companies/{id}/portal · DELETE /portal/access/{id} | crm.portal.manage | write/read/**danger** | เชิญ/ดู/ถอด (ฝั่งพนักงาน) | {companyId, contactId, role, method} → {inviteUrl} |
| `p.me` | GET /p/me | portal session | read | ตัวฉัน + บริษัทที่เข้าได้ | → {contact, companies[], role} |
| `p.quotations.list/get/respond` | GET /p/quotations · GET …/{docId} · POST …/{docId}/respond | portal APPROVE | read/write | ใบเสนอราคา | {action: ACCEPT|REJECT, reason?, name} · `crm.portal.quote.responded` |
| `p.invoices.list/get` · `p.invoices.payLink` · `p.invoices.uploadSlip` | GET /p/invoices · GET …/{docId} · GET …/{docId}/pay · POST …/{docId}/slip | portal PAY | read/write | ใบแจ้งหนี้/ชำระ | → {payUrl, qr} |
| `p.receipts.list` · `p.documents.list` | GET /p/receipts · GET /p/documents | portal VIEW | read | เอกสาร/สัญญา | → items |
| `p.requests.create/list` | POST/GET /p/requests | portal VIEW | write/read | แจ้งเรื่อง/คำขอ | {kind, payload{}} → {requestId, status} · `crm.portal.request.created` |
| `p.contacts.list` · `p.contacts.request` | GET /p/contacts · POST /p/contacts/request | portal ADMIN | read/write | ผู้ติดต่อของบริษัท | — |

### 2.11 reports · settings · misc (11)
| op | METHOD path | scope | class | ไทย | input → output |
|---|---|---|---|---|---|
| `reports.overview` · `reports.funnel` · `reports.reps` · `reports.activities` · `reports.lostReasons` · `reports.sources` · `reports.scores` | GET /reports/{tab} | crm.report.view (+team/all) | read | รายงาน 8 แท็บ (forecast อยู่ 2.3) | period · pipelineId · teamId · ownerUserId → rows/series |
| `reports.export` · `reports.schedule` | POST /reports/{tab}/export · PUT /reports/{tab}/schedule | report.view / settings | write | ส่งออก/ตั้งเวลา | {filters} → {jobId} · {cron, emails[]} |
| `settings.get` · `settings.set` | GET/PUT /settings | crm.settings.manage | read/write | ตั้งค่าระบบ (§4.5 ยกเว้น email/tracking ที่มี op เฉพาะ) | — |
| `settings.targets.set` | PUT /settings/targets | settings | write | ระบบปลายทาง (ภาพ 17) | {memberSystemId?, accountSystemId?, kanbanSystemId?, chatSystemId?, inventorySystemId?} |
| `settings.integrations.status` | GET /settings/integrations | settings | read | สถานะเชื่อม 24 ระบบ | → systems[{code, enabled, lastEventAt, events7d}] |
| `templates.list` · `templates.apply` | GET /templates · POST /templates/apply | settings | read/write | เทมเพลตกิจการ 16 / วัตถุ 8 | {templateKey, parts[]} |
| `savedViews.*` | (op `views.*` ของสมาชิกพร้อม objectKey=contact|company|deal|<key>) | — | — | มุมมองบันทึก | — |

## 3. Shapes (สรุป · เต็มจาก generator)
- `ContactBrief` {id, name, firstName, lastName, phone(masked ใน readonly), email(masked), companyId, companyName, jobTitle, lifecycleStage, leadStatus, score, scoreBand, ownerUserId, teamId, tags[], lastActivityAt, member?: {customerId, tierName}}
- `Contact360` = ContactBrief + {fields{}, sections[], sourceKind, sourceChannel, sourceDetail, attribution{first,last}, scoreReasons[≤3], sequence?, links{chat, account, deals[]}, consents[], optOut{}, timeline[≤50], portalAccess[]}
- `CompanyBrief` / `Company360` {…, stats{openDeals, wonDeals, wonValueSatang, outstandingSatang, lastActivityAt}, contacts[{contactId, role, jobTitle, isPrimary}], deals[], docs[], objects[], portal[], children[]}
- `DealCard` {id, title, companyName, contactName, valueSatang, weightedSatang, stageId, ownerUserId, expectedCloseAt, staleDays?, score, nextActivity?, tags[], forecastCategory}
- `Deal360` = DealCard + {lines[], history[], contacts[], collaborators[], docs{quotation?, invoice?, paidSatang}, cards[], emails[≤10], timeline[], fields{}, ai?{summary, risk, nextStep}}
- `Activity` {id, type, direction, channel, title, body?, contactId, companyId, dealId, customRecordId, startAt, endAt, durationSec, outcome, dueAt, doneAt, ownerUserId, source, hasRecording, aiSummary?}
- `EmailMessage` {id, direction, threadKey, subject, snippet, from, to[], sentAt|receivedAt, status, openCount, clickCount, attachments[], sequenceStepId?, body?(เฉพาะสิทธิ์)}
- `Record` {id, objectKey, parentType, parentId, title, values{}, unitId, ownerUserId, updatedAt}
- `Commission` {id, dealId, userId, amountSatang, basisSatang, basis, status, periodKey, refType, refId}

## 4. AI tools (32 · จาก op ที่มี `tool` · skill `crm`)
read ทันที: `crm_search` (contacts.search+companies) · `crm_contact_360` · `crm_company_360` · `crm_deal_360` · `crm_pipeline_summary` (deals.board สรุป) · `crm_forecast` · `crm_stale_deals` · `crm_activities_due` · `crm_email_thread` · `crm_records_query` · `crm_report` · `crm_score_explain` · `crm_quota_progress` · `crm_commissions_mine`
write = proposal: `crm_create_lead` · `crm_create_company` · `crm_create_deal` · `crm_update_deal` · `crm_move_deal` · `crm_log_activity` · `crm_draft_email` (ร่างเท่านั้น ไม่ส่ง) · `crm_send_email` · `crm_enroll_sequence` · `crm_stop_sequence` · `crm_assign` · `crm_convert` · `crm_issue_quotation` · `crm_set_next_step` · `crm_create_record` · `crm_update_record` · `crm_create_task_card` (บอร์ดงาน) · `crm_transcribe_call`
- manifest: `GET /api/v1/crm/manifest` (skill `crm` · tools + input schema + hint · risk read/write/danger) · เหมือน `KANBAN-API.md` §AI agents · proposal หมดอายุ 24 ชม.

## 5. Webhook events (26 + core 1)
`crm.contact.created · crm.contact.updated · crm.contact.assigned · crm.contact.converted · crm.contact.merged · crm.company.created · crm.company.updated · crm.company.merged · crm.deal.created · crm.deal.stage.changed · crm.deal.won · crm.deal.lost · crm.deal.reopened · crm.deal.reassigned · crm.deal.updated · crm.deal.stale · crm.activity.logged · crm.activity.completed · crm.activity.overdue · crm.email.sent · crm.email.received · crm.email.opened · crm.email.clicked · crm.email.replied · crm.email.bounced · crm.sequence.enrolled · crm.sequence.finished · crm.score.changed · crm.score.threshold · crm.quota.reached · crm.commission.created · crm.commission.approved · crm.commission.reversed · crm.portal.viewed · crm.portal.quote.responded · crm.portal.request.created · crm.web.identified · custom.record.created · custom.record.updated · custom.record.archived · team.updated`
(นับตามกลุ่มใน §7.1 ของพิมพ์เขียว = 26 กลุ่ม/41 ชื่อย่อย) · payload ตาม §7.1 · `X-Shark-Signature` HMAC-SHA256 · retry 5 · endpoint เลือก event ได้ (`eventsJson`)

## 6. ตัวอย่าง (curl)
```bash
# lead ใหม่จากเว็บ (n8n) — มอบหมายอัตโนมัติ
curl -X POST https://shark.in.th/api/v1/crm/contacts -H "Authorization: Bearer shk_live_…" -H "Idempotency-Key: 7c1a-…" \
  -d '{"firstName":"วรรณา","phone":"0812349988","email":"wanna@phuketsand.example.com","company":{"name":"โรงแรมภูเก็ตแซนด์ จำกัด","taxId":"0105563012345"},"sourceKind":"WEB_FORM","sourceDetail":{"utm":{"source":"facebook","campaign":"b2b_q4"}},"ownerUserId":"auto"}'
# ดีลนิ่งของทีม → สร้างงาน
curl "https://shark.in.th/api/v1/crm/deals/stale?team=tm_phuket" -H "Authorization: Bearer …"
curl -X POST https://shark.in.th/api/v1/crm/activities -H "Idempotency-Key: …" -d '{"type":"TASK","dealId":"dl_…","title":"โทรติดตามใบเสนอราคา","dueAt":"2569-09-13T10:00:00+07:00"}'
# รายการสินค้า → ใบเสนอราคา
curl -X PUT https://shark.in.th/api/v1/crm/deals/dl_…/lines -d '{"lines":[{"productId":"itm_ow","name":"คอร์ส Open Water (กลุ่ม)","qty":10,"unitPriceSatang":950000,"discountBp":500}]}'
curl -X POST https://shark.in.th/api/v1/crm/deals/dl_…/quotation -d '{"validDays":14}'
```

## 7. Glossary (ไทย ↔ อังกฤษ)
ผู้ติดต่อ=contact · ผู้สนใจ/lead=lead · บริษัท=company · ดีล=deal · ขั้น=stage · pipeline=pipeline · กิจกรรม=activity · บันทึกสาย=call log · ดีลนิ่ง=stale deal · คะแนน lead=lead score · ร้อน/อุ่น/เย็น=hot/warm/cold · มอบหมายอัตโนมัติ=auto-assignment · round-robin · sequence · การมองเห็น=visibility (OWN/TEAM/ALL) · โควตา=quota · คอมมิชชัน=commission · วัตถุกำหนดเอง=custom object · รายการ=record · portal ลูกค้า=customer portal · ลิงก์ติดตาม=tracked link · ความยินยอมคุกกี้=cookie consent · ที่มา=source/attribution · แปลง=convert · รวม=merge
