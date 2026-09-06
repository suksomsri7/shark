# K1.9 — ไฟล์แนบ + ปก · Sonnet builder

สัญญา: `ledger/KANBAN-RUN.md` §K1.9 · oracle `scripts/qc-kanban-k1.9.mts` (**18 ข้อ** — header ไฟล์เขียนว่า "17 ข้อ" ไม่ตรง เหมือนบทเรียนเดียวกับ K1.8 ที่ header เขียน 19 แต่จริง 18 — ไม่ได้แก้ไฟล์ oracle) · ภาพ `scripts/visual-kanban.mts 1.9` (เพิ่มสเปคใหม่) · mockup `ledger/design-kanban/02-board.png` (ปกบนตัวการ์ด) + `03-card-back.png` (บล็อก "ไฟล์แนบ")

## ไฟล์ที่แตะ

**ใหม่**
- `prisma/migrations/20260925000000_kanban_v2_g/migration.sql` — CREATE TABLE `KanbanAttachment` + 2 index + FK (additive ล้วน)
- `src/lib/modules/kanban/attachments.ts` — service เต็มของไฟล์แนบ + magic-byte guard
- `src/components/kanban/Attachments.tsx` — UI client (รายการ + อัปโหลด + ตั้งปก + ลบ)

**แก้**
- `prisma/schema/kanban.prisma` — model `KanbanAttachment` + relation `KanbanCard.attachments` (คอลัมน์ `coverFileId` มีอยู่แล้วตั้งแต่ K1.1 — ไม่ต้องเพิ่ม)
- `src/lib/core/scope.ts` — ลงทะเบียน `KanbanAttachment: tenant` (ไม่มี `systemId` ในตาราง — เหตุผลเดียวกับ `KanbanComment`/`KanbanChecklist`)
- `src/lib/modules/kanban/types.ts` — เพิ่ม `KanbanAttachmentDto` · `KanbanNewAttachmentDto` (= DTO + `fileId`, ดูหัวข้อ deviation) · `CardDetailDto.attachments` · ปรับคอมเมนต์ `BoardCardDto.attachmentCount/coverUrl` (ไม่ hardcode 0/null แล้ว)
- `src/lib/modules/kanban/cards.ts` — `getCardDetail` โหลดไฟล์แนบคู่กับเช็คลิสต์/ความเห็นใน `Promise.all` เดียว
- `src/lib/modules/kanban/service.ts` — `getBoardView` ดึงจำนวนไฟล์แนบของทุกการ์ดด้วย 1 raw query (group by `cardId`, `deletedAt IS NULL`) + โหลด `FileAsset.cdnUrl` ของทุก `coverFileId` ที่ใช้ในบอร์ด (คิวรีเดียว) → ส่งเข้า `toBoardCardDto` (พารามิเตอร์ที่ 6 `attachment?:{count,coverUrl}`) ⇒ ตราคลิป + ปกบนการ์ด (`Card.tsx`) มีค่าจริง (โค้ดเดิมของ K1.5 รออยู่แล้ว ไม่ต้องแก้ `Card.tsx` เลย)
- `src/lib/modules/kanban/actions.ts` — 3 action ใหม่ (`uploadAttachmentAction` `removeAttachmentAction` `setCoverAction`) + `restoreCardAction` โหลด `attachmentBadgeOfCard` จริงแทนค่าเริ่มต้น (การ์ดที่กู้คืนอาจมีไฟล์แนบอยู่ก่อนแล้ว)
- `src/components/kanban/CardBack.tsx` — mount `<Attachments>` ระหว่างเช็คลิสต์กับความเห็น (ตรงลำดับ mockup 03) · เปิดชิป "ไฟล์แนบ" (เดิม disabled) → คลิกแล้วเปิดกล่องเลือกไฟล์ของ `<Attachments>` ผ่าน `querySelector('[data-testid="attachment-upload"]')?.click()` · `onAttachmentsChange` sync `fields.attachments` + patch `attachmentCount/coverUrl` ไปตัวการ์ดบนบอร์ดทันที (ไม่ต้องรอ reload)
- `scripts/visual-kanban.mts` — เพิ่ม `Step` ชนิด `upload` (ใช้ `elementHandle.uploadFile()`) + fixture PNG 1×1 พิกเซล + สเปค `"1.9"` (3 รายการ) + ลอจิกคืนสภาพ seed เฉพาะ WO นี้ (ลบไฟล์แนบ/FileAsset ที่สร้าง + ล้าง `coverFileId`)

## Schema

```sql
CREATE TABLE "KanbanAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "KanbanAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KanbanAttachment_cardId_idx" ON "KanbanAttachment"("cardId");
CREATE INDEX "KanbanAttachment_tenantId_idx" ON "KanbanAttachment"("tenantId");
-- FK cardId → KanbanCard(id) ON DELETE CASCADE
```

additive ล้วน · ตรวจ SQL ด้วยตาแล้ว: ไม่มี `DROP`/`ALTER … TYPE`/ไม่แตะตารางเดิม · `fileId` ไม่ทำ FK ไป `FileAsset` (คนละ schema file/domain — แพตเทิร์นเดียวกับ `authorUserId`/`assigneeUserId` ที่ไม่ทำ FK ไป `User`) · ลบเป็น soft (`deletedAt`) ตามสัญญา `ledger/KANBAN-RUN.md` §K1.9 ตรงตัว

## Function map (`attachments.ts`)

| ฟังก์ชัน | สิทธิ์ | หน้าที่ |
|---|---|---|
| `addAttachment(ctx, cardId, {filename,contentType,data}, deps?) → KanbanNewAttachmentDto` | EDITOR (`assertCardRole`) | ด่านเรียงลำดับ: จำนวน ≤20 → ขนาด ≤10MB → ชนิดอยู่ใน `ALLOWED_UPLOAD_TYPES` → **ไบต์จริงตรงกับชนิดที่ประกาศ** (`bytesMatchDeclaredType`) → `uploadFile()` (storage กลาง, kind `ATTACHMENT`) → บันทึกแถว |
| `setCover(ctx, cardId, attachmentId\|null)` | EDITOR | `null` = ล้างปก · ไม่ null = ต้องเป็นไฟล์ `image/*` ที่ยังไม่ถูกลบ ไม่งั้น error ไทย → เขียน `KanbanCard.coverFileId` |
| `removeAttachment(ctx, id)` | EDITOR | soft delete (`deletedAt`) · เป็นปกอยู่ → เคลียร์ `coverFileId` ใน tx เดียวกัน · ลบซ้ำไม่ error |
| `listAttachments(ctx, cardId) → KanbanAttachmentDto[]` | VIEWER | ไม่รวมที่ลบ · เรียงเก่า→ใหม่ · `isCover` เทียบกับ `card.coverFileId` สด ๆ ทุกครั้ง |
| `attachmentBadgeOfCard(ctx, cardId) → {count, coverUrl}` | VIEWER (ผ่าน listAttachments) | ใช้ตอนคืนการ์ดเดี่ยวจาก action (กู้คืน) ให้ตราบนบอร์ดถูกต้องทันที |
| `bytesMatchDeclaredType(mime, bytes)` (export) | — | ตัวตรวจ magic bytes บริสุทธิ์ (ฝั่ง oracle/เทสอื่นเรียกตรง ๆ ได้) |

**ลำดับด่านห้ามสลับ**: `assertCardRole` มาก่อนเสมอ (404 ถ้ามองไม่เห็นบอร์ด · 403 ถ้ายศไม่ถึง EDITOR) — ตามด้วยโควตา/ขนาด/ชนิด/ไบต์จริง ตามลำดับที่ oracle คาดหวัง (เช่นไฟล์เกินโควตา 20 ไฟล์ ต้องถูกปฏิเสธก่อนแม้ไฟล์นั้นจะถูกต้องทุกด้าน)

## Magic bytes — ทำไมต้องเขียนของตัวเอง

`src/lib/modules/account/attachment-shared.ts` มี `sniffAttachmentMime` อยู่แล้วแต่ครอบแค่ PDF/JPEG/PNG/WEBP/HEIC/HEIF (แคบกว่าคลังเอกสารบัญชีตั้งใจ) ส่วนบอร์ดงานแนบไฟล์ได้กว้างเท่า `ALLOWED_UPLOAD_TYPES` ของ `storage/service.ts` (ชุดเดียวกับแชท — รวม doc/docx/xlsx/txt/เสียง) จึงเขียน `bytesMatchDeclaredType` ของตัวเองใน `attachments.ts` ครอบทุกชนิดในทะเบียนนั้น:

- ภาพ (png/jpeg/gif/webp/heic/heif) + pdf + audio (wav/ogg/webm/mp4/m4a/aac/mpeg) → ตรวจ magic bytes/ftyp brand ตรง ๆ
- `.doc` (legacy) → OLE header `D0 CF 11 E0` · `.docx`/`.xlsx` → ทั้งคู่เป็น zip (`PK\x03\x04`) แยกชนิดในซองไม่ได้จากลายเซ็นอย่างเดียว จึงยอมรับ zip signature ใด ๆ ที่ประกาศเป็นสองชนิดนี้ (ไม่เปิดช่องโหว่เพิ่ม — ไฟล์ยังถูกเสิร์ฟตามนามสกุลที่ Bunny กำหนดจากตารางเดิม ไม่ใช่โค้ดที่ browser รัน)
- `text/plain` → ไม่มีลายเซ็นตายตัว เชื่อชนิดที่แจ้ง (เนื้อหาไม่ถูกเบราว์เซอร์รันเป็นโค้ดไม่ว่ากรณีใด)

`uploadFile()` ของ storage เดิมตรวจแค่ "ชนิดที่ประกาศอยู่ในทะเบียนไหม" (ไม่แตะเนื้อไฟล์) — ด่านนี้เป็นชั้นเสริมที่ไม่เคยมีมาก่อนในโมดูลนี้ oracle S2.3 ยืนยันว่าไฟล์ `.png` ปลอม (ไบต์จริงเป็น `MZ`) ถูกปฏิเสธ ทั้งที่ผ่านด่าน "ชนิดอยู่ในทะเบียน" มาแล้ว

## Actions (`actions.ts` · `*Action` เท่านั้น)

- `uploadAttachmentAction(formData: FormData)` — อ่าน `systemId/boardId/cardId` + `files` (หลายไฟล์) จากฟอร์ม → เรียก `addAttachment` ทีละไฟล์ → ไฟล์ไหนติดด่านหยุดทันที (ไฟล์ก่อนหน้าที่แนบสำเร็จแล้วยังอยู่ ไม่ rollback) → คืน `{ok, attachments}` เสมอ (แม้ `ok:false` ก็แนบ `attachments` ปัจจุบันมาด้วยให้จอวาดของที่สำเร็จไปแล้วได้ทันที)
- `removeAttachmentAction` / `setCoverAction` — object args แพตเทิร์นเดียวกับ K1.7/K1.8
- สิทธิ์ชั้นที่ 1: `assertKanbanCanAny(auth, ["kanban.card.attach", "kanban.card.update"])` (คีย์ `kanban.card.attach` มีอยู่แล้วตั้งแต่ K1.3 — ไม่ต้องเพิ่มคีย์ใหม่) · ชั้นที่ 2 (EDITOR+ ของบอร์ด) ตรวจใน service เสมอ

## UI (`Attachments.tsx` + `CardBack.tsx`)

testid: `attachment-list` (บล็อก) · `attachment-upload` (input file ซ่อน) · `attachment-item` (แถว) · `attachment-cover-toggle` (ปุ่มตั้ง/เอาออกจากปก)

- หัว: ไอคอนคลิป + "ไฟล์แนบ" + จำนวน + ปุ่ม "+ อัปโหลด" (คลิกแล้ว `inputRef.current?.click()` เปิดกล่องเลือกไฟล์จริงของเบราว์เซอร์ — `multiple`) · ระหว่างอัปโหลดปุ่ม/ช่องพิมพ์ disabled + ข้อความ "กำลังอัปโหลด…"
- แถวไฟล์: thumbnail (รูป) หรือไอคอนเอกสาร (ไฟล์อื่น) · ชื่อ · "ขนาด · อัปโดย ชื่อ · วันที่ไทย" · ปุ่ม "ตั้งเป็นปก"/"เอาออกจากปก" (เฉพาะไฟล์รูป) · ปุ่มลบ (confirm ก่อนเสมอ)
- error ทุกจุดเป็นข้อความในหน้า (`onToast`) — ไม่มี `alert()` ที่ไหนเลยในไฟล์นี้ [[feedback_validation_inline_not_alert]]
- ทุกการแก้ไข optimistic (แปะ state ก่อนยิง action) → ผิดพลาด → revert + toast (แพตเทิร์นเดียวกับ `Checklist.tsx`/`Comments.tsx`)
- `Card.tsx`/`toBoardCardDto` มีโค้ดรองรับ `coverUrl`/`attachmentCount` มาตั้งแต่ K1.5 (ส่ง 0/null ไว้ก่อน) — งานนี้แค่ทำให้ `getBoardView` ป้อนค่าจริง **ไม่ต้องแก้ `Card.tsx` แม้บรรทัดเดียว**

## Deviation จากสัญญา (+เหตุผล)

1. **`addAttachment` คืน `fileId` เพิ่ม** (สัญญาระบุ `{id,fileId,name,contentType,bytes,url}` ตรงตัวอยู่แล้ว แต่ `listAttachments`/`CardDetailDto` ไม่มี `fileId` ในสัญญา) — แยกเป็นชนิดใหม่ `KanbanNewAttachmentDto = KanbanAttachmentDto & {fileId:string}` แทนที่จะยัด `fileId` ลง `KanbanAttachmentDto` ทั่วไป (ไม่มีประโยชน์ต่อ UI และเป็นรายละเอียดภายในที่ไม่ควรรั่วไปทุกจุดที่อ่านไฟล์แนบ) — oracle S2.1 ยืนยันว่าต้องมี `fileId` ในผลลัพธ์ของ `addAttachment` โดยตรง (พบจาก `PrismaClientValidationError` ตอน oracle เรียก `prisma.fileAsset.findUnique({where:{id: a1.fileId}})` แล้ว `a1.fileId` เป็น `undefined`)
2. **โครง schema ต่างจาก `docs/modules/13-kanban-v2.md` §K1.9** (พิมพ์เขียวเขียน `KanbanAttachment` มี `systemId`/`caption`/`source` และไม่มี `name`/`contentType`/`bytes`/`deletedAt` — อ่านจาก `FileAsset` แทน) — ยึดตาม `ledger/KANBAN-RUN.md` §K1.9 (คอลัมน์ตรงตัว: `id tenantId cardId fileId name contentType bytes uploadedById createdAt deletedAt?`) เพราะ WO ระบุ "สัญญารายละเอียด … signatures pinned" และ oracle เช็ค `information_schema` ตรงกับคอลัมน์ชุดนี้เป๊ะ ๆ — พิมพ์เขียวดูล้าสมัยกว่าในจุดนี้ (Fable ตัดสินใจภายหลังได้ว่าจะอัปเดตพิมพ์เขียวหรือไม่)
3. **บรรทัด §11 ของพิมพ์เขียว** ("ไม่มี hard delete ยกเว้น … แถว `KanbanAttachment`") อ่านแล้วกำกวมว่าจะให้ hard delete ตารางนี้หรือไม่ — เลือก **soft delete เสมอ** (`deletedAt`) ตาม §K1.9 ที่ระบุชัดเจนกว่า และ oracle S3.4 บังคับ `deletedAt instanceof Date` ตรง ๆ
4. **`duplicateCardAction` ไม่คัดลอกไฟล์แนบ** (การ์ดใหม่ = `attachmentCount:0, coverUrl:null` ค่าเริ่มต้น) — สัญญา K1.9/K1.6 ไม่ได้ระบุให้คัดลอกไฟล์แนบตอนทำสำเนา (K1.6 ระบุคัดลอกเฉพาะ description/dueAt/startAt/labels/assignees) ต่างจาก `restoreCardAction` ที่โหลด `attachmentBadgeOfCard` จริง เพราะเป็น **การ์ดเดิม** ที่อาจมีไฟล์แนบอยู่ก่อนถูกเก็บเข้าคลัง
5. **`uploadAttachmentAction` ไม่ atomic ข้ามไฟล์** — อัปหลายไฟล์พร้อมกันแล้วไฟล์ที่ 3 ติดโควตา/ชนิดผิด: 2 ไฟล์แรกที่สำเร็จแล้วยังอยู่ (ไม่ rollback) เพราะแต่ละไฟล์เป็นการอัปโหลด+เขียนแถวคนละรายการ (คนละ network call ไป Bunny) — rollback ข้ามไฟล์แปลว่าต้องลบไฟล์ที่อัปสำเร็จแล้วออกจาก Bunny ด้วย (เพิ่มความซับซ้อนเกินจำเป็นสำหรับ P1) · action คืน `attachments` ปัจจุบันมาด้วยเสมอแม้ตอบ `ok:false` ให้จอ sync ได้ถูกต้อง

## Verify — ภาพจริง (เปิดดูเองทีละใบ)

`bash scripts/acc-v2-serve.sh` (production build :3215) → `pnpm exec tsx scripts/visual-kanban.mts 1.9` → เปิดภาพเทียบ mockup 02/03:

- `card-back-attachment-uploaded-desktop.png` — อัปโหลด `kb-cover-fixture.png` ผ่าน `input[type=file]` (ซ่อนอยู่ คลิกผ่าน testid ตรง ๆ ไม่ผ่านปุ่ม native dialog) → บล็อก "ไฟล์แนบ 1" โผล่ทันที: thumbnail สี่เหลี่ยมดำ (ภาพ 1×1 พิกเซล) + ชื่อไฟล์ + "1 KB · อัปโดย เจ้าของร้าน (KB QC) · วันที่ไทย" + ปุ่ม "ตั้งเป็นปก" — ตรงโครง mockup 03 บล็อก "ไฟล์แนบ" ทุกจุด
- `card-back-cover-set-desktop.png` — กด "ตั้งเป็นปก" แล้วปุ่มเปลี่ยนเป็น "เอาออกจากปก" ทันที (optimistic)
- `card-back-with-cover-mobile.png` (390px) — เปิดการ์ดเดิมบนมือถือ (คนละ page/ไม่กดปุ่มซ้ำ) เห็นปกที่ตั้งไว้จาก desktop ยังอยู่ ("เอาออกจากปก") — สแต็กแนวตั้งอ่านครบไม่ล้นจอ
- `board-patong-with-cover-desktop.png` / `-mobile.png` — การ์ด #7 บนบอร์ดมีรูปปก (สี่เหลี่ยมดำ) แปะด้านบนตัวการ์ด + ตราคลิป "📎1" ที่แถวล่าง ตรงสไตล์ `Card.tsx` ของ K1.5 (โค้ดรออยู่แล้ว ไม่ต้องแก้)
- **คืนสภาพ seed หลังถ่าย**: สคริปต์ลบไฟล์แนบ 1 แถว + `FileAsset` ที่สร้าง + ล้าง `coverFileId` ของการ์ด #7 อัตโนมัติ (โค้ดในสคริปต์เอง ไม่ใช่ one-off แยก) → ยืนยันด้วย regression `qc-kanban-k1.5.mts` (นับการ์ด ACTIVE ของบอร์ดป่าตองต้องเป็น 24 เหมือนเดิม)

## เหตุการณ์ระหว่างทาง — ข้อมูลหลงเหลือจาก oracle รอบแรกที่ยังไม่ได้แก้บั๊ก

รอบแรกที่รัน `qc-kanban-k1.9.mts` (ก่อนเจอบั๊ก `fileId` หายจาก `addAttachment` — ดู deviation ข้อ 1) สคริปต์ throw กลางทางที่ S2.1 (หลังสร้างการ์ด + a1 ไปแล้ว) ทำให้ข้ามส่วน cleanup ท้ายไฟล์ไป เหลือการ์ด "QC K1.9 ไฟล์แนบ" ค้างบนบอร์ดป่าตอง 2 ใบ (นับซ้ำ 2 ครั้งก่อนแก้บั๊กเสร็จ) → regression `k1.5` (S5.1) จับได้ว่าบอร์ดมี 26 การ์ดแทนที่จะเป็น 24 → เขียน one-off ลบการ์ด/ไฟล์แนบ/FileAsset ที่ค้าง + คำนวณ `cardNoSeq` ใหม่จาก `MAX(cardNo)` จริง (ลบไฟล์ one-off ทิ้งหลังใช้แล้ว ไม่ commit) → รัน `k1.5`/`k1.9` ซ้ำเขียวทั้งคู่ก่อนเริ่ม regression ชุดเต็มรอบสุดท้าย

## คำสั่งที่รันจริง + บรรทัดสุดท้าย

```
export DATABASE_URL=… DIRECT_URL=… APP_ENV=development (grep|cut · ตรวจ host = ep-plain-art ก่อน)
pnpm exec prisma migrate deploy
  → Applying migration `20260925000000_kanban_v2_g` … All migrations have been successfully applied.
pnpm exec prisma generate → Generated Prisma Client (v7.8.0)

pnpm exec tsx scripts/qc-kanban-k1.9.mts
  → ผ่าน 18/18 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  → JSON_SUMMARY {"total":18,"passed":18,"findings":[]}

regressions (รอบสุดท้ายหลังคืนสภาพข้อมูล):
  k1.1 {"total":30,"passed":30,"findings":[]}   k1.2 {"total":25,"passed":25,"findings":[]}
  k1.3 {"total":29,"passed":29,"findings":[]}   k1.4 {"total":30,"passed":30,"findings":[]}
  k1.5 {"total":17,"passed":17,"findings":[]}   k1.6 {"total":20,"passed":20,"findings":[]}
  k1.7 {"total":21,"passed":21,"findings":[]}   k1.8 {"total":18,"passed":18,"findings":[]}
  k1.9 {"total":18,"passed":18,"findings":[]}
  qc-kanban-notify → QC Kanban Notify: 12/12 ผ่าน · ✅ เขียวหมด
  qc-ai-kanban-board → ผ่าน 3/3 · JSON_SUMMARY {"total":3,"passed":3,"findings":[]}

NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck → exit 0 (ไม่มี error)
pnpm exec tsx scripts/fitness.mts (ไม่ export env) → JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
  (F5.1 raw prisma baseline คงที่ 45 · F1.1 model ทั้งหมด 220 ลงทะเบียน scope ครบ)

bash scripts/acc-v2-serve.sh → ✅ พร้อมใช้งานที่ http://127.0.0.1:3215
pnpm exec tsx scripts/visual-kanban.mts 1.9
  → JSON_SUMMARY {"wo":"1.9","user":"owner","shots":[".qc-shots/kanban/1.9/card-back-attachment-uploaded-desktop.png",".qc-shots/kanban/1.9/card-back-cover-set-desktop.png",".qc-shots/kanban/1.9/card-back-with-cover-mobile.png",".qc-shots/kanban/1.9/board-patong-with-cover-desktop.png",".qc-shots/kanban/1.9/board-patong-with-cover-mobile.png"],"failures":0}
bash scripts/acc-v2-serve.sh stop → 🛑 ปิดเซิร์ฟเวอร์ QC แล้ว
```

## จุดที่อยากให้ Fable ลองแหย่

- **snap chromium + `/tmp`**: harness เดิมของ K1.9 (ก่อนแก้) วาง fixture PNG ไว้ที่ `/tmp/kb-qc-cover.png` แล้ว `uploadFile()` "สำเร็จ" ฝั่ง `input.files` แต่ฝั่ง client อ่านเนื้อไฟล์ไม่ได้ (เงียบ ๆ ไม่มี errorชัดเจนใน console เพียงพอจะสรุปสาเหตุ) — ย้ายไปไว้ใต้ `.qc-shots/kanban/1.9/` (อยู่ใต้ `/root/`) แล้วผ่านทันที ตรงบทเรียนที่ `visual-acc-v2.mts` เคยจดไว้ (`reference_snap_chromium_headless.md`) — ถ้าวันหน้ามี harness อื่นอัปโหลดไฟล์แล้วเงียบ ๆ ไม่ทำงาน ให้เช็คจุดนี้ก่อน
- **docx/xlsx แยกกันไม่ได้จาก magic bytes** — ทั้งคู่เป็น zip signature เดียวกัน `bytesMatchDeclaredType` เลยยอมรับทั้งคู่โดยดูแค่ signature zip ถ้าอยากตรวจลึกกว่านี้ (เปิด zip แล้วเช็ค `[Content_Types].xml`) ทำได้ใน WO ถัดไป แต่ยังไม่คุ้มความซับซ้อนตอนนี้
- **`text/plain` ไม่มี magic bytes** — ใครแนบไฟล์ไบนารีแล้วประกาศ `.txt` จะผ่านด่านนี้เสมอ (เหมือนกันทุกระบบที่รับ .txt เพราะไม่มีความเสี่ยง XSS/RCE จากมัน) — ยอมรับความเสี่ยงนี้เพราะไฟล์ไม่ถูก browser รันเป็นโค้ด
- **หลายไฟล์พร้อมกันติดโควตากลางทาง**: ไฟล์ก่อนหน้าที่อัปสำเร็จไม่ rollback (deviation ข้อ 5) — ถ้าอยากได้ all-or-nothing ต้องเพิ่มด่าน "จำลองนับทั้งชุดก่อนอัปจริง" ที่ actions.ts (นับ `attachments.length + files.length` เทียบเพดานตั้งแต่ต้น ก่อนเริ่มอัปไฟล์แรก)
- **`uploadAttachmentAction` ยังไม่ตรวจ `serverActions.bodySizeLimit`** — เช็คแล้วว่า `next.config.ts` ปัจจุบันไม่ได้ตั้งค่านี้ไว้ (ใช้ค่าเริ่มต้นของ Next.js 16) ลองอัปโหลดไฟล์ใกล้ 10MB จริงบน prod ดูว่าพอไหม ถ้าไม่พอต้องเพิ่ม `experimental.serverActions.bodySizeLimit` ใน `next.config.ts`

ความคืบหน้า P1: 9/15
