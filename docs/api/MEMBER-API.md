# SHARK Member API — ข้อกำหนด v2 (draft สำหรับสั่งทำ · 10 ก.ย. 2569)

> เอกสารนี้คือ **สัญญา API ทุกฟังก์ชันของระบบสมาชิก** ที่ทะเบียน op (`registry.ts` (แผน · src/lib/modules/member/api/)) ต้องทำให้ตรง — ตอนสร้างจริง generator (`gen-member-api-docs.mts` (แผน · scripts/)) จะเขียนคู่มือฉบับสมบูรณ์ (curl · rules · ตัวอย่างตอบ) ทับไฟล์นี้ และด่าน fitness F13.5 บังคับให้เอกสาร = ทะเบียน
> ผู้ใช้เป้าหมาย: นักพัฒนาภายนอก · ระบบร้าน (เว็บ/แอป) · **AI agent** (Claude/GPT/Gemini/n8n) ผ่าน skill manifest — ทุก op มีคำอธิบายภาษาอังกฤษสำหรับโมเดล (ประหยัด token) และป้ายไทยสำหรับคน
> พิมพ์เขียว: `docs/modules/06-member-v2.md` · ตัวอย่างรูปแบบคู่มือ: `docs/api/KANBAN-API.md`

## 1. หลักการ (เหมือนบอร์ดงาน/บัญชี)
- Base URL `https://shark.in.th/api/v1/member` · `Authorization: Bearer <API key>` · คีย์ผูกร้าน+ระบบ MEMBER · ชุดสิทธิ์ 3 bundle: `member.readonly` (read ทั้งหมด ยกเว้นข้อมูลอ่อนไหว) · `member.operate` (read + write ที่พนักงานทำได้: สมัคร/แก้/ให้แต้ม/ออก voucher ≤ เพดาน/ประทับ/ใช้สิทธิ์) · `member.admin` (ทุกอย่าง รวมตั้งค่า/ระดับ/กฎ/ลบ)
- Class: **read** (ไม่เขียน ไม่ audit) · **write** (ต้องมี `Idempotency-Key` · audit ทุกครั้ง) · **danger** (write + ยืนยัน 2 ขั้น/approval: ลบ PDPA · รวมคน · ตั้งระดับมือ · ปรับแต้มเกินเพดาน · ออก voucher เกินเพดาน)
- รูปแบบตอบ `{ ok: true, data }` / `{ ok: false, error: { code, message(ไทย), details? } }` · แบ่งหน้า `take/cursor` · เวลาทั้งหมด ISO-8601 +07:00 · เงินเป็นสตางค์ (`*Satang`) · แต้มเป็นจำนวนเต็ม
- error code: `UNAUTHORIZED · FORBIDDEN · NOT_FOUND (404-not-403) · VALIDATION · CONFLICT (idempotency/unique) · LIMIT (เพดาน) · APPROVAL_REQUIRED (คืน approvalRequestId) · RATE_LIMITED · PRIVACY_BLOCKED (ฟิลด์อ่อนไหว)`
- ช่องทาง (D19): ทุกที่ที่รับ `channel` ใช้ key จาก `GET /channels` (ไม่ใช่ enum ตายตัว) · ช่องทางที่ `connected=false` รับ identity/consent ได้แต่ส่งข้อความไม่ได้ (error `CHANNEL_NOT_CONNECTED`)
- ฟิลด์กำหนดเอง: ส่ง/รับผ่าน `fields: { "<key>": value }` (key ของ MemberField · ชนิดค่าตามฟิลด์ · LOOKUP = id · FILE = fileId) · ฟิลด์อ่อนไหวไม่ออกใน readonly และไม่ออกถ้าคีย์ไม่มีสิทธิ์ตาม policy
- webhook: ทุก event §5 ส่ง `POST` พร้อม `X-Shark-Signature` (HMAC เดิม) · retry 5 ครั้ง
- rate limit 600 req/นาที/คีย์ · payload ≤ 1 MB · import/export ผ่าน op เฉพาะ (async job)

## 2. ทะเบียน op (124 op · read 55 · write 61 · danger 8)

รูปแบบ: `op` — **METHOD path** — scope — class — ป้ายไทย — input หลัก → output หลัก — event

### 2.1 members (สมาชิก · 18)
| op | METHOD path | scope | class | ไทย | input → output · event |
|---|---|---|---|---|---|
| `members.list` | GET /members | member.customer.read | read | รายชื่อสมาชิก | q · tier · unit · tag · source · status · `f.<key>` · segmentId · viewId · sort · take/cursor → items[MemberBrief+listFields] · total |
| `members.search` | GET /members/search | read | read | ค้นเร็ว (ชื่อ/เบอร์/รหัส/LINE) | q ≥ 2 · take ≤ 20 → items[MemberBrief] |
| `members.get` | GET /members/{id} | read | read | โปรไฟล์ 360 | include=wallet,history,links → Member360 (fields ตามสิทธิ์ · sensitive ตาม policy) |
| `members.create` | POST /members | member.customer.create | write | สมัครสมาชิก | {phone|email|lineUserId ≥1, firstName, lastName?, birthDate?, gender?, fields{}, consents[{channel,granted}], source, sourceDetail{campaignId?, linkCode?, staffUserId?, referralCode?}, homeUnitId?, tags[]} → {customerId, memberCode, partyId, duplicate?: MemberBrief} · `member.created` |
| `members.update` | PATCH /members/{id} | member.customer.update | write | แก้ข้อมูล | patch ฟิลด์ระบบ + fields{} → Member360 · `member.updated` |
| `members.setStatus` | PUT /members/{id}/status | update | write | ระงับ/เปิด/ปิด | {status, reason?} · `member.updated` |
| `members.setTags` | PUT /members/{id}/tags | update | write | แท็ก | {add[], remove[]} |
| `members.setOwner` | PUT /members/{id}/owner | update | write | ผู้ดูแล | {ownerUserId|null} |
| `members.addresses.set` | PUT /members/{id}/addresses | update | write | ที่อยู่ | {addresses[]} |
| `members.duplicates.list` | GET /members/duplicates | member.customer.merge | read | ตัวซ้ำ | status → pairs[{a,b,reason,score}] |
| `members.duplicates.compare` | GET /members/duplicates/{pairId} | merge | read | เปรียบเทียบ | → fields side-by-side + สรุปผลรวม |
| `members.merge` | POST /members/{keepId}/merge | merge | **danger** | รวมคน | {mergeId, fieldChoices{key: "A"|"B"}, confirm:"MERGE"} → {keptId} · `member.merged` |
| `members.duplicates.dismiss` | POST /members/duplicates/{pairId}/dismiss | merge | write | ไม่ใช่คนเดียวกัน | — |
| `members.import.start` | POST /members/import | member.customer.import | write | นำเข้า (async) | {fileId|rows[], mapping{col: fieldKey}, options{onDuplicate, source, welcomePoints, welcomeLine, tierFromColumn?}} → {jobId, preview{ok, warn, err}} |
| `members.import.status` | GET /members/import/{jobId} | import | read | สถานะนำเข้า | → {status, done, created, updated, skipped, errors[]} |
| `members.export` | POST /members/export | member.customer.export | write | ส่งออก CSV (async) | {filters, columns[]} → {jobId} (ไฟล์ผ่าน storage · audit) |
| `members.activity` | GET /members/{id}/activity | read | read | ไทม์ไลน์ | type[] · from/to · unit · take/cursor → items[Activity] |
| `members.brief` | GET /members/brief?ids= | read | read | ชื่อ/ระดับ/แต้ม หลายคน (batch ≤ 100) | → items[MemberBrief] |
| `members.identities.list` | GET /members/{id}/identities | read | read | ช่องทางที่ผูก (D18) | → items[{channel, externalId(masked), displayName, verified, linkedBy, linkedAt}] |
| `members.identities.link` | POST /members/{id}/identities | update | write | ผูกช่องทาง | {channel, externalId, displayName?, verified?} → CONFLICT ถ้า id นี้เป็นของคนอื่น · `member.identity.linked` |
| `members.identities.unlink` | DELETE /members/{id}/identities/{identityId} | update (MANAGER+) | write | ถอด | — |
| `members.resolve` | POST /members/resolve | operate | read | จับคู่ตัวตนจากช่องทาง (ให้ระบบภายนอก/แชท) | {channel, externalId, phone?, email?, displayName?} → {customerId?, matchedBy, candidates[]} |
| `channels.list` | GET /channels | read | read | ทะเบียนช่องทางกลาง (D19) | → items[{key, label, kind, canConsent, canNotify, connected}] |

### 2.2 fields · layout (ฟิลด์กำหนดเอง · 11)
| op | METHOD path | scope | class | ไทย | input → output |
|---|---|---|---|---|---|
| `fields.layout` | GET /fields/layout | member.customer.read | read | ส่วน+ฟิลด์ทั้งหมด (สำหรับสร้างฟอร์ม) | audience=staff|customer → sections[{key,label,columns,sensitive,fields[FieldDef]}] |
| `fields.sections.create` | POST /fields/sections | member.settings.manage | write | เพิ่มส่วน | {key,label,columns,sensitive} |
| `fields.sections.update` | PATCH /fields/sections/{id} | settings | write | แก้ส่วน | — |
| `fields.sections.reorder` | PUT /fields/sections/order | settings | write | เรียงส่วน | {ids[]} |
| `fields.sections.delete` | DELETE /fields/sections/{id} | settings | write | ลบส่วนว่าง | — |
| `fields.create` | POST /fields | settings | write | เพิ่มฟิลด์ | {sectionId,key,label,type,options,required,defaultValue,unique,filterable,showInList,showOnCard,customerEditable,sensitive,trackHistory} → FieldDef (LIMIT ที่ 60) |
| `fields.update` | PATCH /fields/{id} | settings | write | แก้ฟิลด์ (ระบบ: label/order/showInList เท่านั้น) | — |
| `fields.reorder` | PUT /fields/order | settings | write | เรียงฟิลด์ | {sectionId, ids[]} |
| `fields.archive` | POST /fields/{id}/archive | settings | write | ซ่อนฟิลด์ (เก็บค่า) | — |
| `fields.choices.replace` | POST /fields/{id}/choices/replace | settings | write | แทนที่ตัวเลือกที่ถูกลบ | {from,to} |
| `fields.templates.apply` | POST /fields/templates/{key}/apply | settings | write | ใช้เทมเพลตกิจการ (16 ชุด) | → {added: sections, fields, tiers, stamps, journeys} |

### 2.3 consent · privacy (9)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `consents.get` | GET /members/{id}/consents | read | read | ความยินยอมทุกช่องทาง |
| `consents.set` | PUT /members/{id}/consents | update | write | {channel, granted, source, policyVersion?} · `member.consent.changed` |
| `privacy.policies.list/create/publish` | GET/POST /privacy/policies · POST /privacy/policies/{v}/publish | member.privacy.manage | read/write | นโยบาย+เวอร์ชัน |
| `privacy.sensitive.list/set` | GET/PUT /privacy/sensitive | privacy.manage | read/write | ใครดูอ่อนไหว (D8+D17) {targetType,targetId,roles[],hrPositions[],hrDepartmentIds[],sameUnitOnly,logAccess} · `GET /privacy/hr-positions` รายการตำแหน่ง/แผนกจาก HR + จำนวนพนักงานที่ยังไม่ผูกบัญชี |
| `privacy.accessLog` | GET /privacy/access-log | privacy.manage | read | บันทึกการดู |
| `privacy.requests.list` | GET /privacy/requests | privacy.manage | read | คำขอ PDPA |
| `privacy.export` | POST /members/{id}/privacy/export | privacy.manage (หรือ CUSTOMER ตนเอง) | write | รวมไฟล์ทุกโมดูล → {jobId} |
| `privacy.erase` | POST /members/{id}/privacy/erase | member.customer.delete | **danger** | ขอลบ → approval → anonymize · `member.updated` |

### 2.4 sources · attribution (6)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `sources.links.list/create/update/toggle` | /sources/links | member.settings.manage | read/write | ลิงก์/QR ที่มา {code,name,source,campaignId,target,utm,costSatang?} → {url, qrFileId} |
| `sources.report` | GET /sources/report | member.report.view | read | สมาชิกใหม่/ซื้อซ้ำ/ยอดเฉลี่ย/ต้นทุน ต่อช่องทาง · first vs last touch |
| `sources.touch` | POST /members/{id}/touch | operate | write | บันทึก touch (แคมเปญ/ลิงก์) → attribution LAST |

### 2.5 tiers (ระดับ · 12)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `tiers.list` | GET /tiers | member.tier.read | read | ระดับ+จำนวนคน+สิทธิ์ |
| `tiers.create/update/reorder/archive` | /tiers | member.tier.manage | write | {key,name,color,icon,description,isDefault,paidPlanId} · archive ต้องระบุ moveToTierId |
| `tiers.benefits.set` | PUT /tiers/{id}/benefits | manage | write | benefits[{type,config,active}] |
| `tiers.rules.get/set` | GET/PUT /tiers/{id}/rules | manage | read/write | {upgrade: RuleInput, keep: RuleInput, reviewCron, graceDays, notifyBeforeDays} |
| `tiers.rules.dryRun` | POST /tiers/rules/dry-run | manage | read | → {wouldUpgrade[{customerId,from,to,evidence}], wouldDowngrade[], keep} |
| `tiers.evaluate` | GET /members/{id}/tier | tier.read | read | สถานะระดับ+ระดับถัดไป+ยอดที่ขาด |
| `tiers.setManual` | POST /members/{id}/tier | member.tier.setManual | **danger** | {tierDefId, reason, until?} → APPROVAL_REQUIRED ตาม policy · `member.tier.changed` |
| `tiers.history` | GET /members/{id}/tier/history | tier.read | read | ประวัติ |
| `tiers.reviewNow` | POST /tiers/review | manage | write | ประเมินทั้งร้านทันที (หลังเปลี่ยนกฎ) → jobId |

### 2.6 points (แต้ม · 13)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `points.balance` | GET /members/{id}/points | member.point.read | read | คงเหลือ+ล็อต+ใกล้หมดอายุ |
| `points.ledger` | GET /members/{id}/points/ledger | point.read | read | รายการ |
| `points.quoteEarn` | POST /points/quote-earn | point.read | read | {customerId, cart} → {points, breakdown} |
| `points.quoteBurn` | POST /points/quote-burn | point.read | read | {customerId, points, cart} → {discountSatang, allowed, reason?} |
| `points.credit` | POST /members/{id}/points/credit | member.point.adjust | write | ให้แต้ม (เหตุการณ์/ชดเชย) {points, reason, expiresAt?} · เกินเพดาน → APPROVAL_REQUIRED · `point.earned` |
| `points.adjust` | POST /members/{id}/points/adjust | point.adjust | **danger** | ปรับ +/− {delta, reason} · approval ตาม settings |
| `points.transfer` | POST /members/{id}/points/transfer | member.point.transfer (CUSTOMER ตนเอง + OTP) | write | {toCustomerId, points, otp} · `point.transferred` |
| `points.reverse` | POST /points/reverse | point.adjust | write | {refType, refId} คืน/ย้อน |
| `points.expiring` | GET /points/expiring | point.read | read | ทั้งร้าน days=30 → items |
| `points.rules.list/upsert/toggle` | /points/rules | member.settings.manage | read/write | กฎได้แต้ม |
| `points.settings.get/set` | GET/PUT /points/settings | settings | read/write | หมดอายุ/ใช้/โอน/เพดาน/อนุมัติ |

### 2.7 stamps (สแตมป์ · 8)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `stamps.cards.list/create/update/toggle` | /stamps/cards | member.loyalty.manage | read/write | การ์ด+กฎ+รางวัล |
| `stamps.progress` | GET /members/{id}/stamps | member.loyalty.read | read | ทุกใบของสมาชิก |
| `stamps.add` | POST /members/{id}/stamps | member.loyalty.stamp | write | {cardId, count=1, refType?, refId?, pin?} → {stamps, completed?, rewardVoucherId?} · `stamp.added`/`stamp.completed` |
| `stamps.void` | POST /stamps/events/{id}/void | loyalty.manage | write | ยกเลิกตรา |
| `stamps.stats` | GET /stamps/cards/{id}/stats | loyalty.read | read | ใบที่ใช้อยู่/ครบ/รางวัลจ่าย |

### 2.8 rewards (รางวัล · 9)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `rewards.list/create/update/toggle` | /rewards | member.loyalty.manage (list = loyalty.read) | read/write | แคตตาล็อก {name,kind,pointsCost,stampCardId?,stampsCost?,stock,tierDefIds,perMemberMonthly,startAt,endAt,unitIds,pickupDays,imageFileId} |
| `rewards.redeem` | POST /members/{id}/rewards/redeem | member.loyalty.read (พนักงาน) / CUSTOMER ตนเอง | write | {rewardId} → {redemptionId, qrCode, expiresAt} · `reward.redeemed` |
| `rewards.redemptions.list` | GET /rewards/redemptions | loyalty.read | read | status · unit · take |
| `rewards.redemptions.lookup` | GET /rewards/redemptions/lookup?code= | loyalty.fulfil | read | สแกน QR/รหัส → รายละเอียด |
| `rewards.fulfil` | POST /rewards/redemptions/{id}/fulfil | member.loyalty.fulfil | write | ส่งมอบ {unitId} · `reward.fulfilled` |
| `rewards.cancel` | POST /rewards/redemptions/{id}/cancel | loyalty.fulfil | write | ยกเลิก (คืนแต้ม/สแตมป์) |

### 2.9 wallet (กระเป๋าสิทธิ์ · 3 — facade เดียวกับที่ POS ใช้)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `wallet.get` | GET /members/{id}/wallet | member.customer.read / CUSTOMER | read | แต้ม·voucher·คูปอง·gift card·รางวัลรอรับ·สแตมป์·สิทธิ์ระดับ·แพ็กเกจ |
| `wallet.quote` | POST /members/{id}/wallet/quote | operate | read | {cart, choices{voucherIds, points, giftCard{number,pin,satang}, couponCode}} → {order[], lines[], totalDiscount, net, pointsToEarn, conflicts[]} |
| `wallet.apply` | POST /members/{id}/wallet/apply | operate | write | ใช้จริงกับบิล/นัด {saleId|appointmentId, choices} (ปกติ POS เรียกผ่าน facade ไม่ใช่ HTTP) |

### 2.10 vouchers (11)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `vouchers.templates.list/create/update/toggle` | /vouchers/templates | member.promo.manage | read/write | แม่แบบ voucher |
| `vouchers.list` | GET /vouchers | member.promo.read | read | status · origin · customerId · take |
| `vouchers.forMember` | GET /members/{id}/vouchers | promo.read / CUSTOMER | read | — |
| `vouchers.issue` | POST /vouchers | member.promo.issue | write | {customerIds[]|segmentId, templateId|adhoc{kind,value,config,validDays}, origin, reason, notify} → {issued, vouchers[], approvalRequestId?} · เกินเพดาน = APPROVAL_REQUIRED · `voucher.issued` |
| `vouchers.validate` | POST /vouchers/validate | promo.read | read | {customerId, code|voucherId, cart} → {ok, discountSatang, reason?} |
| `vouchers.redeem` | POST /vouchers/{id}/redeem | promo.issue | write | {saleId|appointmentId} · `voucher.used` |
| `vouchers.release` | POST /vouchers/{id}/release | promo.issue | write | คืน (void) |
| `vouchers.cancel` | POST /vouchers/{id}/cancel | promo.manage | write | ยกเลิก {reason} |

### 2.11 coupons (ต่อยอดเดิม · 6)
`coupons.list/create/update/toggle` (promo.manage) · `coupons.validate` (read) · `coupons.issuePerMember` POST /coupons/{id}/per-member {customerIds[]} → โค้ดรายคน (write) · `coupons.saveToWallet` POST /members/{id}/coupons {code} (CUSTOMER/operate)

### 2.12 giftcards (8)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `giftcards.list` | GET /giftcards | member.giftcard.manage | read | status · owner · take |
| `giftcards.sell` | POST /giftcards | member.giftcard.sell | write | {satang, buyerCustomerId?, recipient{customerId|contact{line,email}|print}, message, expiresAt?, paySaleId} → {number, pin(ครั้งเดียว), giftCardId} · `giftcard.sold` |
| `giftcards.balance` | GET /giftcards/{number}/balance | giftcard.sell / CUSTOMER เจ้าของ | read | {balanceSatang, expiresAt, status} (ไม่ต้อง PIN สำหรับเจ้าของ) |
| `giftcards.use` | POST /giftcards/{number}/use | giftcard.sell | write | {pin, satang, saleId} · `giftcard.used` |
| `giftcards.reload` | POST /giftcards/{number}/reload | giftcard.sell | write | {satang, paySaleId} |
| `giftcards.transfer` | POST /giftcards/{number}/transfer | CUSTOMER เจ้าของ / giftcard.manage | write | {toCustomerId, pin} |
| `giftcards.suspend` | POST /giftcards/{number}/suspend | giftcard.manage | write | {reason} |
| `giftcards.settings.get/set` | GET/PUT /giftcards/settings | giftcard.manage | read/write | {enabled, accountingLink, expiryMonths, denominations[], transferable, reloadable} (D3) |

### 2.13 segments · campaigns (12)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `segments.list/create/update/delete` | /segments | member.promo.manage | read/write | {name, definition[]} |
| `segments.count` | POST /segments/count | promo.read | read | {definition} → {count, sample[5], avgSpend12m} |
| `segments.members` | GET /segments/{id}/members | promo.read | read | take/cursor |
| `campaigns.list/get/create/update` | /campaigns | promo.manage | read/write | {name, segmentId, channels[], message{line,email,sms,push}, variantB?, attachVoucherTemplateId?, couponCode?, holdoutPct, scheduledAt?} |
| `campaigns.preview` | POST /campaigns/{id}/preview | promo.manage | read | → {willSend, holdout, maxCostSatang, expectedUsePct} |
| `campaigns.testSend` | POST /campaigns/{id}/test | promo.manage | write | ส่งหาตัวเอง |
| `campaigns.send` | POST /campaigns/{id}/send | promo.manage | write | ตอนนี้/ตั้งเวลา · `campaign.sent` |
| `campaigns.cancel` | POST /campaigns/{id}/cancel | promo.manage | write | — |
| `campaigns.stats` | GET /campaigns/{id}/stats | promo.read | read | ส่ง/เปิด/ใช้/ยอด/ต้นทุน/ROI ต่อ variant + holdout |

### 2.14 journeys (กฎอัตโนมัติ scope MEMBER_JOURNEY · 8 — reuse ทะเบียน automation ของบอร์ดงานเป็นแบบ)
`journeys.list/get/create/update/toggle/delete` (promo.manage · RuleInput: {name, trigger{event, params}, conditions[], actions[], holdoutPct, reentryDays}) · `journeys.dryRun` POST /journeys/dry-run (read → ใครจะเข้า/ทำอะไร) · `journeys.stats` GET /journeys/{id}/stats (ขั้น×คน · ผล 30 วัน · holdout เทียบ) · `journeys.runs` GET /journeys/{id}/runs

### 2.15 reviews (8)
| op | METHOD path | scope | class | ไทย |
|---|---|---|---|---|
| `reviews.list` | GET /reviews | member.review.read | read | rating · service · staff · unit · unreplied · take |
| `reviews.get` | GET /reviews/{id} | review.read | read | — |
| `reviews.request` | POST /members/{id}/reviews/request | operate | write | {refType, refId, channel} → ส่งลิงก์ · `review.requested` |
| `reviews.submit` | POST /reviews | CUSTOMER (token) | write | {refType, refId, rating, body, photoFileIds[]} → แต้มตาม settings · `review.received` · escalate ≤ N |
| `reviews.reply` | POST /reviews/{id}/reply | member.review.reply | write | {body} · `review.replied` |
| `reviews.hide` | POST /reviews/{id}/hide | review.reply | write | {reason} |
| `reviews.summary` | GET /reviews/summary | review.read | read | เฉลี่ย · แจกแจง · แนวโน้ม · AI สรุป (cache รายวัน) |
| `reviews.settings.get/set` | GET/PUT /reviews/settings | settings | read/write | {askAfterHours, channel, rewardPoints, escalateBelow, escalateBoardId, escalateAssigneeRole} |

### 2.16 referrals (7)
`referrals.program.get/set` (member.referral.manage · D6 {enabled, referrerReward{kind,value}, refereeReward{kind,value}, convertOn, minFirstPurchaseSatang, monthlyCap, fraudCheck, shareText}) · `referrals.codeFor` GET /members/{id}/referral (CUSTOMER/read → {code, url, qrFileId, stats}) · `referrals.list` GET /referrals (status · take) · `referrals.leaderboard` GET /referrals/leaderboard?period= · `referrals.attach` POST /members/{id}/referral/attach {code} (ตอนสมัคร/หลังสมัคร ≤ 7 วัน) · `referrals.reject` POST /referrals/{id}/reject {reason} (manage)

### 2.17 notifications (5)
`notifications.templates.list/update` (settings · 8 เหตุการณ์ × 4 ช่องทาง {enabled, body, sendMode, quietHours, respectConsent}) · `notifications.test` POST /notifications/test {event, channel} · `notifications.stats` GET · `notifications.send` POST /members/{id}/notify {channel, body} (operate · ข้อความเฉพาะกิจ · เคารพ consent)

### 2.18 reports (7 · member.report.view · read ทั้งหมด)
`reports.overview` · `reports.rfm` · `reports.tiers` · `reports.points` (ออก/ใช้/หมด/คงค้าง/หนี้สิน ต่อเดือน) · `reports.promotions` (ROI ต่อ journey/campaign) · `reports.sources` · `reports.cohort` · + `reports.schedule` POST (write · อีเมลรายสัปดาห์)

### 2.19 settings · api (5)
`settings.get/set` GET/PUT /settings (member.settings.manage · memberCode pattern · welcome points · default tier · unit scope rules · limits) · `apikeys.list/create/revoke` (member.api.manage · bundle) · `webhooks.list/create/delete` (api.manage · events[] · url · secret)

### 2.20 me (ฝั่งลูกค้า · session ลูกค้า LIFF/แอป · 10 — path `/me/*` · ทุก op ตรวจ customerId ของ session)
`me.get` GET /me (โปรไฟล์ + ฟิลด์ที่ร้านเปิด) · `me.update` PATCH /me (เฉพาะ `customerEditable`) · `me.card` GET /me/card (QR token หมุนได้) · `me.wallet` GET /me/wallet · `me.consents.set` PUT /me/consents · `me.points.transfer` POST /me/points/transfer (OTP) · `me.rewards.redeem` POST /me/rewards/{id}/redeem · `me.referral` GET /me/referral · `me.reviews.submit` POST /me/reviews · `me.privacy.export/erase` POST /me/privacy/{export|erase} · `join` POST /join (public · {phone|line, otp, fields, consents, src, referralCode} → สมัคร · source LIFF/APP)

## 3. Shapes หลัก
```ts
MemberBrief   = { id, memberCode, displayName, phoneMasked, tier:{id,key,name,color}, points, vouchers, spent12mSatang, visits12m, lastActivityAt, tags[], avatarUrl?, homeUnitId? }
Member360     = MemberBrief & { profile:{ ...ฟิลด์ระบบ }, addresses[], fields:{ [key]: value }, hiddenSections:[key] /* อ่อนไหวที่ไม่มีสิทธิ์ */, consents[], attribution:{first,last}, tier:{ current, next?, progress:{spent12m, visits12m, tierPoints, shortfall}, since, reviewAt, benefits[] }, counters:{points, expiringSoon, vouchers, stamps:[{cardId,name,stamps,slots}], reviewAvg, referrals}, links:{chatRooms, accountDocs, kanbanCards, crmDeals}, paidPlan? }
FieldDef      = { id, sectionId, key, label, type, options, required, defaultValue, unique, filterable, showInList, showOnCard, customerEditable, sensitive, trackHistory, isSystem, sortOrder }
Wallet        = { points:{balance, expiring:[{points,expiresAt}]}, vouchers:[Voucher & {applicable, discountSatang?}], coupons[], giftCards:[{number(masked),balanceSatang,expiresAt}], rewardsPending[], stamps:[{cardId,name,stamps,slots,cycle}], tierBenefits[], paidPlan? }
Quote         = { order:["TIER","VOUCHER","COUPON","POINTS","GIFTCARD"], lines:[{kind, ref, discountSatang, note}], totalDiscountSatang, netSatang, pointsToEarn, stampsToAdd[], conflicts:[{kind, message}] }
RuleInput     = { name, trigger:{event, params}, conditions:[{field, op, value}], actions:[{type, params}], holdoutPct?, reentryDays? }   // เหมือน automation ของบอร์ดงาน
Activity      = { id, at, module, type, summary, data, refType, refId, unitId?, actorUserId? }
```

## 4. AI tools (สกิล `members` · ~40 · read รันทันที · write/danger = proposal)
| tool | op | class | หมายเหตุ |
|---|---|---|---|
| member_search | members.list / segments.count | read | รับประโยคธรรมชาติ → แปลงเป็น filters/segment (prepare) |
| member_get · member_summary | members.get (+AI สรุป) | read | สรุป 12 เดือน |
| member_create | members.create | write | มีอยู่แล้ว |
| member_update · member_set_tags · member_set_owner | members.* | write | |
| member_merge | members.merge | danger | |
| member_resolve · member_link_identity | members.resolve / identities.link | read/write | ตัวตนหลายช่องทาง |
| channels_list | channels.list | read | |
| member_import_preview | members.import.start (dryRun) | read | |
| field_layout · field_create · field_update | fields.* | read/write | admin bundle |
| consent_set | consents.set | write | |
| tier_list · tier_evaluate · tier_history | tiers.* | read | |
| tier_simulate | tiers.rules.dryRun | read | "ถ้าเปลี่ยนเกณฑ์…" |
| tier_set_manual | tiers.setManual | danger | |
| points_balance · points_expiring · points_quote | points.* | read | |
| points_credit | points.credit | write | |
| points_adjust | points.adjust | danger | |
| stamp_add · stamp_progress | stamps.* | write/read | |
| reward_list · reward_redeem · reward_fulfil · reward_list_redemptions | rewards.* | read/write | 2 ตัวมีอยู่แล้ว |
| wallet_get · wallet_quote | wallet.* | read | |
| voucher_issue · voucher_list · voucher_validate | vouchers.* | write/read | |
| coupon_create (มีแล้ว) · coupon_issue_per_member | coupons.* | write | |
| giftcard_sell · giftcard_balance | giftcards.* | write/read | |
| segment_count · segment_save | segments.* | read/write | |
| campaign_draft_message | (AI · ไม่มี op) | read | ร่างข้อความ + ตัวแปร |
| campaign_create · campaign_preview · campaign_send | campaigns.* | write/read/write | send = danger? → write + ยืนยัน |
| journey_list · journey_suggest · journey_create · journey_dry_run | journeys.* (+suggest แบบ K3.6) | read/write | |
| review_list · review_summarize · review_draft_reply · review_reply | reviews.* | read/write | |
| referral_stats · referral_program_set | referrals.* | read/write | |
| report_overview · report_points_liability · report_sources · report_promotions | reports.* | read | |
| notify_member | notifications.send | write | |

## 5. Webhook events (ทั้งหมด 27)
`member.created` `member.updated` `member.merged` `member.tier.changed` `member.tier.at_risk` `member.consent.changed` `member.identity.linked` `point.earned` `point.burned` `point.expiring` `point.expired` `point.transferred` `stamp.added` `stamp.completed` `reward.redeemed` `reward.fulfilled` `voucher.issued` `voucher.used` `voucher.expiring` `voucher.expired` `giftcard.sold` `giftcard.used` `review.received` `review.replied` `referral.joined` `referral.converted` `campaign.sent`
payload มาตรฐาน `{ id, event, tenantId, systemId, at, data:{...}, customerId? }` · ไม่มีข้อมูลอ่อนไหว · เบอร์ masked

## 6. ตัวอย่างการใช้ (สำหรับคู่มือ/AI)
```bash
# สมัครสมาชิกจากเว็บร้าน (ที่มา = เว็บฟอร์ม + แคมเปญ)
curl -sS -X POST https://shark.in.th/api/v1/member/members \
  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" \
  -d '{"phone":"0812345678","firstName":"สมชาย","lastName":"ใจดี","birthDate":"1990-02-12",
       "fields":{"cert_level":"ADVANCED","dives":48},"consents":[{"channel":"LINE","granted":true}],
       "source":"WEB_FORM","sourceDetail":{"linkCode":"fb-sep"}}'
# ออก voucher ให้กลุ่ม (เกินเพดาน → ได้ approvalRequestId กลับ)
curl -sS -X POST https://shark.in.th/api/v1/member/vouchers -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"segmentId":"seg_gold_30d","templateId":"vt_300","reason":"ดึงกลับ","notify":true}'
# กระเป๋าสิทธิ์ + quote ก่อนคิดเงิน
curl -sS "https://shark.in.th/api/v1/member/members/cus_042/wallet" -H "Authorization: Bearer $SHARK_API_KEY"
```

## 7. สิ่งที่ generator ต้องผลิตตอน RUN (เหมือน KANBAN-API.md)
Who this is for · Authentication/scopes · Conventions · Error codes · Operations (read/write/danger ครบทุก op พร้อมตาราง field/rules + curl) · AI tools · AI agents (manifest + ตัวอย่าง prompt) · Webhooks · Changelog — และไฟล์ endpoints.md ของสกิล (generator สร้างใน M1.11) + OpenAPI JSON
