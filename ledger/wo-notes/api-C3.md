# WO C3 — WRITE ผู้ติดต่อ/สินค้า (builder: Sonnet)

## ไฟล์

**ใหม่**
- `src/lib/modules/account/api/ops/contacts-write.ts` — 10 op: `contacts.create/update/archive/restore/merge/dismiss-merge/link` + `contact-groups.create/add-members/remove-member`
- `src/lib/modules/account/api/ops/products-write.ts` — 15 op: `products.create/update/archive/set-bundle/add-opening-lot/link-inventory/unlink-inventory` + `units.create/update/archive` + `categories.create/update/archive` + `stock-documents.create/approve`

**แก้ (additive เท่านั้น — ไม่เปลี่ยนสัญญาเดิม)**
- `src/lib/modules/account/service.ts` — เพิ่ม `restoreContact(tenantId, systemId, id)` (ตั้ง `archivedAt: null`)
- `src/lib/modules/account/contacts-list.ts` — เพิ่ม `getContactGroup(ctx, id)` (ใช้ตรวจ 404 ก่อน add-members)
- `src/lib/modules/account/product.ts` — เพิ่ม `getUnit(tenantId, systemId, id)` และ `getCategory(tenantId, systemId, id)` (ใช้ตรวจ 404 ก่อน update/archive — `updateMany`/`archiveUnit`/`archiveCategory` เดิมไม่รายงานเมื่อไม่พบ)
- `src/lib/modules/account/api/registry.ts` — ต่อ `CONTACTS_WRITE_OPS` + `PRODUCTS_WRITE_OPS` เข้า `ACCOUNT_OPS` (grep `ACCOUNT_OPS` ก่อนเพิ่มแล้ว — ไม่มี op ชื่อ/path ชนของเดิม)
- `docs/api/ACCOUNT-API.md` — regenerate (130 op รวม)

**dirty โดยไม่ได้ตั้งใจแก้ (side-effect ของการรัน QC เก่าเพื่อตรวจว่าไม่พัง — ไม่ใช่โค้ดของ C3)**
- `scripts/acc-v2-expected.json` · `scripts/fixtures/acc-v2/kbank-2026-0{8,9}.expected.json` — สคริปต์ `qc-acc-v2-contact-merge.mts`/`qc-acc-v2-products.mts` reseed tenant กลาง QC ทุกครั้งที่รัน (cuid ใหม่) แล้วเขียนไฟล์เฉลยกลับ ("♻️ คืนสภาพชุดข้อมูล QC เรียบร้อย") — ตรวจ diff แล้วเป็นแค่ id เปลี่ยน ไม่ใช่โครงสร้าง/ยอดเงินเปลี่ยน

## op → service map

### contacts-write.ts
| op | service |
|---|---|
| `contacts.create` | `checkContactDuplicates` + `createContact` (+`setContactGroups` ถ้ามี groupIds) |
| `contacts.update` | `getContact` (404) + `updateContact` (+`setContactGroups`) |
| `contacts.archive` | `getContact` (404) + `archiveContact` |
| `contacts.restore` | `getContact` (404) + `restoreContact` **(ใหม่)** |
| `contacts.merge` (danger) | `mergeContacts({primaryId:keepId, secondaryId:mergeId, actorId:null, fieldChoices})` |
| `contacts.dismiss-merge` | `dismissMergeCandidate` |
| `contacts.link` | `linkContactTo` |
| `contact-groups.create` | `createContactGroup` |
| `contact-groups.add-members` | `getContactGroup` (404) + `addContactsToGroup` |
| `contact-groups.remove-member` | `removeContactFromGroup` |

### products-write.ts
| op | service |
|---|---|
| `products.create` | `checkProductDuplicates` (sku only) + `createProduct` |
| `products.update` | `getProduct` (404, ฐาน merge) + `updateProduct` |
| `products.archive` | `getProduct` (404) + `archiveProduct` |
| `products.set-bundle` | `setBundleItems` |
| `products.add-opening-lot` | `addOpeningLot` |
| `products.link-inventory` | `linkProductToItem` |
| `products.unlink-inventory` | `unlinkProductFromItem` |
| `units.create/update/archive` | `createUnit`/`getUnit`(404)+`renameUnit`/`getUnit`(404)+`unitUsageCount`+`archiveUnit` |
| `categories.create/update/archive` | `createCategory`/`getCategory`(404)+`updateCategory`/`getCategory`(404)+`archiveCategory` |
| `stock-documents.create` | `createGoodsMovement` (GOODS_ISSUE/RETURN) หรือ `createCostAdjustment` (COST_ADJUSTMENT) ตาม `type` |
| `stock-documents.approve` | `approveGoodsMovement` |

## นโยบายซ้ำ/คำเตือน
- **ผู้ติดต่อ**: `checkContactDuplicates` รันก่อนเขียนเสมอ — เลขภาษี+สาขาซ้ำ (`blocking` reason `taxId`) → `ApiError(409,"duplicate", …, hint=<id เดิม>)` ก่อนแม้แต่จะลอง `createContact` · เบอร์/ชื่อซ้ำ (`warnings`) → **สร้างต่อเสมอ** ไม่ดูนโยบาย §9.3 warn/block (นโยบายนั้นออกแบบคู่กับ UI ที่มีคนตัดสินใจกดต่อ — REST ไม่มีจุดนั้น) · แนบ `warnings: string[]` (ไทย) ในแถวคำตอบ
- **สินค้า**: `checkProductDuplicates` เช็คเฉพาะ **sku** เป็นตัวบล็อก (409 `duplicate` + hint=id เดิม) ตาม "## Build" ของ ACCOUNT-API-RUN.md §C3 (ย่อหน้าที่ระบุพฤติกรรมจริงกว่าตารางสรุป) — ชื่อซ้ำไม่ทำอะไร (ไม่ warn ไม่ block) เพราะ oracle ไม่ทดสอบ policy nuance ของสินค้า และตารางสรุปของ ledger พูดคลุมเครือกว่า "## Build" ส่วนละเอียด
- **เบอร์โทร**: normalize ที่ชั้น REST ก่อนส่งเข้า `createContact`/`updateContact` (`normalizePhoneTh`) เพื่อให้ `phone` ที่ตอบกลับเป็นรูปแบบเดียวเสมอ (`08-1234-5678` → `0812345678`) ตามสัญญา — ต่างจากหน้าจอเดิมที่เก็บของดิบไว้โชว์
- **ที่อยู่**: รับทั้ง string หรือ object แยกช่อง — เขียนคีย์เข้า service **เฉพาะตอนผู้เรียกแตะจริง** (`!== undefined`) เพราะ `contactAddressFields`/`contactExtraWriteFields`/`updateContact`'s `...rest` ใช้ `key in input` หรือ spread ตรงตัดสิน ใส่คีย์ว่างที่ undefined ตอน PATCH จะล้างข้อมูลเดิมโดยไม่ตั้งใจ — ระวังจุดนี้เป็นพิเศษ (คอมเมนต์หัวไฟล์เตือนไว้)
- **`products.update`/`updateProduct`**: ฟิลด์หลัก 10 ช่อง (sku/name/nameEn/type/unitId/salePrice/buyPrice/vatRateBp/incomeAccountId/expenseAccountId/imageUrl) service เขียนทับเสมอไม่ว่าส่งมาหรือไม่ — handler โหลด `getProduct` มาเป็นฐาน (`productCoreFromRow`) ก่อนทับด้วยของผู้เรียก (`toProductInput`) กัน field ที่ไม่ได้ส่งถูกล้างเป็นค่าเริ่มต้น

## คำสั่งที่รัน + บรรทัดท้าย

```
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" APP_ENV=development
```

1. `pnpm exec tsx scripts/qc-account-api-write-master.mts`
   → `ผ่าน 41/42` · `FINDINGS: CRITICAL 1 · MAJOR 0 · MINOR 0` (ดูหัวข้อ "ตีกลับ/ข้อค้นพบ" ด้านล่าง — C3-M3.8)
2. `pnpm exec tsx scripts/gen-account-api-docs.mts` → `✅ เขียน docs/api/ACCOUNT-API.md (130 op · 95677 ไบต์)`
3. `pnpm exec tsx scripts/qc-account-api-write-docs.mts` → `ผ่าน 52/52`
4. `pnpm exec tsx scripts/qc-account-api-write-payments.mts` → `ผ่าน 32/32`
5. `pnpm exec tsx scripts/qc-account-api-read-master.mts` → `ผ่าน 38/38`
6. `pnpm exec tsx scripts/qc-account-api-core.mts` → `ผ่าน 64/64`
7. `pnpm exec tsx scripts/qc-account-api-openapi.mts` → `ผ่าน 26/26` (หลังข้อ 2 — ก่อนหน้านั้น OA-4.5/OA-4.2 แดงเพราะ docs ยัง stale)
8. `qc-acc-v2-contacts.mts` → `ผ่าน 49 · ตก 0`
9. `qc-acc-v2-contact-modal.mts` → `ผ่าน 96 · ไม่ผ่าน 0`
10. `qc-acc-v2-contact-merge.mts` → `ผ่าน 56 · ตก 0`
11. `qc-acc-v2-products.mts` → `ผ่าน 100 · ตก 0`
12. `qc-acc-v2-invitem.mts` → `ผ่าน 88 · ตก 0`
13. `qc-account-cpa.mts` → `ผ่าน 107/107`
14. `NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck` → 0 error
15. `pnpm fitness` (มี .env) → `ผ่าน 20/20`
16. `env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness` → `ผ่าน 20/20` (ยืนยัน lazy import ของไฟล์ใหม่ทั้งคู่ไม่ลาก session/env ตอนโหลด)

## ตีกลับ / ข้อค้นพบที่รายงาน Fable (ไม่ได้แก้ oracle เอง)

**C3-M3.8** (CRITICAL ตามที่ oracle กำหนด sev แต่วัดแล้วเป็นพฤติกรรมเดิมของ service ที่มีมาก่อน C3):
```
exp 900000 + JV | act 200 {"id":"...","seq":1,"amountSatang":900000} entries=0 onHand=10
```
Oracle เช็ค `prisma.accountJournalEntry.count({ where: { systemId: SYS, refId: p1Id } })` (คาดหวัง refId = **product id**) แต่ `addOpeningLot` (`src/lib/modules/account/product.ts:1601`, ของเดิมจาก WO 8.2 — ไม่ใช่โค้ดที่ C3 เขียน) เรียก `gl.postStockDocument({ docId: \`open-${lot.id}\`, ... })` ซึ่งตั้ง `AccountJournalEntry.refId = "open-<lotId>"` เสมอ (ดู `gl.ts:1174-1187` — `refId: o.docId`) ไม่เคยเท่ากับ productId เลยในทุกกรณี (ตรวจแล้ว: `grep -rn "refId:.*productId"` ในโมดูล account ไม่พบที่ไหนเลย) จำนวน `qtyOnHand`/`amountSatang` ถูกต้องครบ — เฉพาะ `refId` ของ JV เท่านั้นที่ไม่ตรงกับที่ oracle คาด
ผมไม่แก้ `addOpeningLot`/`postStockDocument` เอง เพราะ:
  1) `docId` ปัจจุบันเป็นส่วนหนึ่งของคีย์กันซ้ำ `alreadyPosted(ctx, "AccountDocument#<docId>#<event>")` — เปลี่ยนรูปแบบกระทบ idempotency ของยอดยกมาที่เคยโพสต์ไปแล้วจริงบน prod (WO นี้ "ไม่มีเอกสาร AccountDocument จริง" สำหรับยอดยกมา จึงไม่มี `doc.id` ให้ใช้แทน — ต้องคิดคีย์ใหม่ทั้งชุดถ้าจะเปลี่ยน)
  2) เป็นพฤติกรรมของ service ที่ WO อื่น (8.2) เป็นเจ้าของ ไม่ใช่ additive edit ที่ C3 ควรทำโดยลำพัง
เสนอ 2 ทาง: (a) แก้ oracle ให้เช็ค `refId LIKE 'open-%'` หรือ join ผ่าน `AccountProductOpeningLot.id` แทน (b) เพิ่ม `refId2`/index เสริมใน `postStockDocument` แบบ additive (ไม่กระทบคีย์กันซ้ำเดิม) — รอ Fable ตัดสิน

## สรุปผล
- `pnpm exec tsx scripts/qc-account-api-write-master.mts` → **41/42** (CRITICAL 1 = C3-M3.8 ด้านบน)
- ด่านเก่าที่ต้องเขียวทั้งหมดเขียวจริง: write-docs 52/52 · write-payments 32/32 · read-master 38/38 · core 64/64 · openapi 26/26 · contacts 49 · contact-modal 96 · contact-merge 56 · products 100 · invitem 88 · cpa 107/107
- typecheck 0 error · fitness 20/20 (ทั้งมี .env และแบบ `env -u`)
- ทะเบียนรวมหลัง C3: **130 op**

JSON_SUMMARY {"wo":"C3","opsAdded":25,"opsTotal":130,"oracle":"qc-account-api-write-master.mts","oraclePassed":41,"oracleTotal":42,"criticalFindings":["C3-M3.8"],"regressionSuitesGreen":["write-docs:52/52","write-payments:32/32","read-master:38/38","core:64/64","openapi:26/26","qc-acc-v2-contacts:49","qc-acc-v2-contact-modal:96","qc-acc-v2-contact-merge:56","qc-acc-v2-products:100","qc-acc-v2-invitem:88","qc-account-cpa:107/107"],"typecheck":0,"fitness":"20/20","fitnessNoEnv":"20/20"}


## ภาคผนวกโดย Fable (ตรวจรับ 5 ก.ย. ~19:35 UTC)
- **C3-M3.8**: builder ถูก — oracle ของ Fable สมมติผิด (refId ของ JV ยอดยกมา = `open-<lotId>` จาก `postStockDocument.docId` ไม่ใช่ productId) → แก้ oracle ให้นับ `refId: open-${lot.id}` · **ไม่แตะ** `addOpeningLot`/idempotency key เดิม
- **probe ของ Fable** (สคริปต์ชั่วคราว ลบแล้ว) เจอ 2 จุดที่ oracle ไม่ครอบ → แก้ใน `contacts-write.ts` เอง + เพิ่มข้อสอบถาวร:
  1. `PATCH /contacts/{id}` แก้ taxId/branchCode ให้ชนผู้ติดต่ออื่น → เดิม DB unique index เด้ง P2002 → ผู้เรียกได้ 422 "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง" (หลอก ลองกี่ครั้งก็ไม่ผ่าน) → ตอนนี้ตรวจ `checkContactDuplicates(excludeId)` ก่อนเขียน → 409 duplicate ชี้ตัวเดิม (C3-M1.5b)
  2. `DELETE /contact-groups/{id}/members/{contactId}` ด้วย key ของร้านอื่น → เดิมตอบ 200 ok:true ทั้งที่ไม่ได้ลบอะไร (tenantDb กันอยู่แล้ว ไม่รั่ว) → ตอนนี้ 404 (C3-M1.11b)
  - ที่ probe แล้วถูกต้องอยู่แล้ว: PATCH/approve/add-members ข้ามร้าน → 404 · merge ไม่มี scope → 403 · GOODS_ISSUE/draft status ตรง DB · เบิกเกิน → 422 ไทย · ราคาทศนิยม → 422 validation · ลบหน่วยที่ใช้อยู่ → 409
- ผลสุดท้าย: write-master **44/44** · core 64 · openapi 26 · read-master 38 · write-docs 52 · write-payments 32 · typecheck 0 · fitness 20/20 (มี env / ไม่มี env)
