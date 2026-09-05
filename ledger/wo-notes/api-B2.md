# WO B2 — READ ผู้ติดต่อ/สินค้า/หน่วย/กลุ่ม/merge-candidates/DBD/link-suggestions

ผู้ทำ: Sonnet (builder) · oracle: `scripts/qc-account-api-read-master.mts` (Fable) · ห้ามแก้

## ไฟล์ที่แตะ

**ใหม่**
- `src/lib/modules/account/api/ops/contacts-read.ts` — 7 op: `contacts.list`, `contacts.get`, `contacts.documents`, `contact-groups.list`, `contacts.merge-candidates`, `contacts.link-suggestions`, `contacts.lookup-tax-id`
- `src/lib/modules/account/api/ops/products-read.ts` — 8 op: `products.list`, `products.get`, `products.movements`, `products.bundle`, `products.opening-lots`, `units.list`, `categories.list`, `warehouses.list`
- `src/lib/modules/account/api/serialize-master.ts` — serializer ของ B2 ทั้งหมด (contact/product) แยกจาก `serialize.ts` ของ B1 ตามคำสั่ง

**แก้ (additive เท่านั้น — ไม่เปลี่ยนพฤติกรรมเดิม)**
- `src/lib/modules/account/api/respond.ts` — เพิ่ม `"upstream_unavailable"` ใน `API_ERROR_CODES` + คลาส `ApiError(status, code, message_th, message_en)` + `mapError` เช็ก `instanceof ApiError` ก่อนอย่างอื่นทั้งหมด
- `scripts/gen-account-api-docs.mts` — เพิ่มแถว `upstream_unavailable` ใน `ERROR_CODE_DOCS` (503 · ไม่งั้น `Record<ApiErrorCode,...>` typecheck แดง) แล้วรัน generator ใหม่
- `src/lib/modules/account/api/registry.ts` — ต่อ `CONTACTS_READ_OPS` + `PRODUCTS_READ_OPS` เข้า `ACCOUNT_OPS`
- `src/lib/modules/account/contacts-list.ts` — เพิ่มค่า `"active"` ใน `ContactGroupKey` (+ `whereForGroup` case + label) เป็นตัวกรองภายในที่ REST ใช้เป็นค่าเริ่มต้นเมื่อไม่ส่ง `group` (ไม่ใช่ค่าที่เอกสารให้ผู้เรียกพิมพ์เอง — ดูหัวข้อ "ทำไม default ≠ UI")
- `src/lib/modules/account/contact-profile.ts` — เพิ่ม `info.branchCode` (ราคาถูก ช่องมีอยู่แล้วใน DB แค่ไม่เคยส่งออก) + export ใหม่ `listContactGroupsOf(ctx, contactId)` (id+name ของกลุ่มที่ผู้ติดต่อรายนี้อยู่ — โปรไฟล์เดิมพับเป็น `chips` ที่ไม่มี id)
- `src/lib/modules/account/contact-links.ts` — export ใหม่ `getContactForLinking(ctx, contactId)` (phone/email/taxId/partyId แบบเบา 1 query แทนที่จะคำนวณโปรไฟล์เต็ม 8+ query เพื่อป้อน `suggestLinks`)
- `src/lib/modules/account/product.ts` — `productMovements` เพิ่ม `documentId` + `unitCost` ในผลลัพธ์ (คอลัมน์มีอยู่แล้วใน `AccountDocumentLine`, query เดิมไม่ต้องแก้ ไม่มี select แคบอยู่แล้ว)

## Serializer field map (สรุปย่อ — ดูโค้ดจริงใน `serialize-master.ts` เพื่อฟิลด์ครบ)

| endpoint | จาก | ทิ้ง/เปลี่ยนชื่อ |
|---|---|---|
| `contacts.list` แถว | `ContactRow` | `receivableSatang/payableSatang` → เพิ่ม `outstandingSatang` (VENDOR→payable) · `archivedAt`→`archived` bool · `lastDoc.docId`→`lastDocument.id` |
| `contacts.list` summary | `loadContactsSidebar().counts` | `active = counts.all - counts.archived` (คำนวณที่ชั้น API ไม่ใช่ service) |
| `contacts.get` | `contactProfile(ctx,id,{tab:"links",base:""})` + `listContactGroupsOf` + `listDocumentsPaged` แยก | ตัด `avatarLetter/kindLabel/legalTypeLabel/chips/priceModeLabel/whtLabel/aging/tabs/recentDocs/docsTab/filesTab/links.hrefs` (UI ล้วน) · `documents[]` มาจาก `listDocumentsPaged({contactId,pageSize:10})` ผ่าน `docRow` ของ B1 ไม่ใช่ `recentDocs` (จำกัด 5 ใบคนละ shape) · `links{member,crm,chat}` = อ่าน `.linked` จาก `linksTab.cards` (เรียก tab="links" ไม่ใช่ "info" เพื่อให้ก้อนนี้มีค่า) |
| `contacts.merge-candidates` | `listMergeCandidates` | `key`→`pairKey` |
| `contacts.link-suggestions` | `suggestLinks` (input จาก `getContactForLinking`) | คงรูปเดิม เพิ่มความชัดเจนเรื่อง `linked` (ต้องมี partyId จริงถึงจะเป็น true) |
| `contacts.lookup-tax-id` | `lookupJuristic` | ok→data ตรง ๆ · reason `notFound`→ throw Error (ขึ้นต้น "ไม่พบ" ⇒ `mapError` ทำ 404 เอง) · reason อื่น (noKey/timeout/unavailable) → `throw new ApiError(503,"upstream_unavailable",...)` |
| `products.list` แถว | `ProductListRow` | `salePrice/buyPrice`→`*Satang` · `stock`→`onHand` · `invItemId!==null`→`trackStock` |
| `products.get` | `productModalData` + `listIncomeAccounts`/`listExpenseAccounts` (หา account ตาม id เอง เพราะ `productModalData` ไม่ join) + `listUnits` (หา unitName เอง) | เพิ่ม `incomeAccount{code,name}` / `expenseAccount{code,name}` / `unitName` ที่ชั้น API |
| `products.opening-lots` | `listOpeningLots` | ไม่มีคอลัมน์ `note` ในสคีมา (`AccountProductOpeningLot`) ⇒ คงที่ `null` เสมอ (ไม่ fabricate) — oracle ไม่ตรวจ note จึงไม่ชน |

## `products.list` แบบไม่ส่ง `type` (ทำอย่างไร)

`listProductsPaged` เดิมรับ `type` เดี่ยว (ไม่ส่ง = ปริยาย `"GOODS"` ในตัว service — ไม่ใช่ "ทุกชนิด") ตาม WO บอกให้ "เรียกต่อชนิดแล้วรวม" จึงทำที่ชั้น API (ไม่แก้ signature เดิมของ service):
1. เรียก `listProductsPaged` 3 ครั้ง (`GOODS`/`SERVICE`/`BUNDLE`) ด้วย `pageSize:100` (เพดาน clamp สูงสุดของ service) เพื่อให้ได้ทุกแถวที่ตรงตัวกรอง `q`/`category`/`sub` ของแต่ละชนิดมาก่อน
2. รวม `rows` แล้วเรียงเอง (`pinned desc, code desc, createdAt desc` — สูตรเดียวกับที่ service ใช้ต่อชนิด)
3. `total` = ผลรวม `total` ของทั้ง 3 การเรียก (แต่ละอันคือจำนวนที่ตรงตัวกรองของชนิดนั้นจริง)
4. แบ่งหน้าเอง (`clampPage`/`clampPageSize` จาก `service.ts`) จาก array ที่รวมแล้ว
5. `counts.GOODS/SERVICE/BUNDLE` เหมือนกันทั้ง 3 การเรียก (มาจาก `groupBy` ที่ไม่กรองด้วย `type` อยู่แล้วในตัว service) — ใช้ชุดแรกพอ · `active = GOODS+SERVICE+BUNDLE` (รวมทุกชนิด) · `archived` = ผลรวม `archived` ของทั้ง 3 · `stockValueSatang`/`categories` = รวม/dedupe จากทั้ง 3

**ข้อจำกัดที่รู้ตัว (จดไว้ ไม่ใช่บั๊กที่ซ่อน)**: ดึงสูงสุด 100 แถว/ชนิดมารวมก่อนแบ่งหน้า — ถ้าร้านมีสินค้าชนิดเดียวเกิน 100 รายการ `total` ยังถูกแต่หน้าท้าย ๆ ของ mixed-type list อาจขาดหายบางแถว (หน้าเดียวชนิดเดียว `?type=GOODS` ไม่กระทบ เพราะนั่นเรียก `listProductsPaged` ตรง ๆ ไม่ผ่าน merge). ข้อมูล QC (13 สินค้ารวม) ไม่ชนขีดนี้ — ถ้าจะแก้ถาวรต้องขยาย `ProductListInput.type` ให้รับ `"ALL"` ในตัว service เอง (ที่ ledger เสนอไว้เป็นทางเลือก) ซึ่งนอกสโคป READ-only ของ B2 นี้.

## ทำไม default ของ `contacts.list` (ไม่ส่ง `group`) ≠ ค่าเริ่มต้นของหน้าจอ

หน้าจอ `/contacts` เริ่มที่ `group=all` (รวมปิดใช้งาน → 63) แต่ oracle ข้อ B2-C1.2 ยึดว่า "ไม่ส่ง group = เฉลย **active** (58)" ตรงตามคำอธิบาย ledger "default = ใช้งานอยู่ตามหน้าจอ" อ่านว่า "ค่าเริ่มต้น = กลุ่ม 'ใช้งานอยู่'" ไม่ใช่ "ค่าเริ่มต้นแบบเดียวกับที่หน้าจอเปิดมา" — เพิ่มค่า `"active"` เป็นกลุ่มภายในใหม่ (ไม่อยู่ใน regex ที่ผู้เรียกพิมพ์เองได้ — เอกสาร/schema ประกาศแค่ `all/customer/regular/vendor/archived/custom:/source:` ตามสัญญา) แล้ว map ให้ handler ใช้เป็นค่า fallback เท่านั้น

## คำสั่งที่รันจริง + ผลลัพธ์สุดท้าย

```
pnpm exec tsx scripts/qc-account-api-read-master.mts   → ผ่าน 38/38   CRITICAL 0 MAJOR 0 MINOR 0
pnpm exec tsx scripts/gen-account-api-docs.mts          → เขียน docs/api/ACCOUNT-API.md (30 op)
pnpm exec tsx scripts/qc-account-api-read-docs.mts      → ผ่าน 50/50   CRITICAL 0 MAJOR 0 MINOR 0
pnpm exec tsx scripts/qc-account-api-core.mts           → ผ่าน 64/64   CRITICAL 0 MAJOR 0 MINOR 0
pnpm exec tsx scripts/qc-account-api-openapi.mts        → ผ่าน 26/26   CRITICAL 0 MAJOR 0 MINOR 0
QC_ENV_FILE=.env.qc pnpm exec tsx scripts/qc-acc-v2-contacts.mts  → ผ่าน 49 · ตก 0
QC_ENV_FILE=.env.qc pnpm exec tsx scripts/qc-acc-v2-products.mts  → ผ่าน 100 · ตก 0
NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck   → 0 errors
pnpm fitness                                            → ผ่าน 20/20  CRITICAL 0 MAJOR 0 MINOR 0
```

หมายเหตุรัน: ทุกคำสั่งข้างบน export `DATABASE_URL`/`DIRECT_URL` จาก `.env.qc` (ตัด `&` ผ่าน `cut`/`tr`) + guard `ep-plain-art` ในบรรทัดเดียวกันเสมอ ตามกติกา run · `gen-account-api-docs.mts` ไม่แตะ DB จริงแต่ต้องมี `SESSION_SECRET` (≥32 ตัวอักษร) ให้ `src/lib/env.ts` parse ผ่าน (import chain ลากมาจาก `session.ts`) — ใช้ค่า dummy เฉพาะรันคำสั่งนี้ ไม่เขียนลงไฟล์ใด ๆ

JSON_SUMMARY {"wo":"B2","oracle":"qc-account-api-read-master","total":38,"passed":38,"findings":[]}
JSON_SUMMARY {"wo":"B2","gate":"read-docs","total":50,"passed":50}
JSON_SUMMARY {"wo":"B2","gate":"core","total":64,"passed":64}
JSON_SUMMARY {"wo":"B2","gate":"openapi","total":26,"passed":26}
JSON_SUMMARY {"wo":"B2","gate":"acc-v2-contacts","total":49,"passed":49}
JSON_SUMMARY {"wo":"B2","gate":"acc-v2-products","total":100,"passed":100}
JSON_SUMMARY {"wo":"B2","gate":"typecheck","errors":0}
JSON_SUMMARY {"wo":"B2","gate":"fitness","total":20,"passed":20}
