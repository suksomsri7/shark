# WO S3a.5 — ลิงก์สาธารณะใบเสนอราคา: ลูกค้าเปิดดู + ดาวน์โหลด (ส่วน A + ส่วน B)

> RUN "เลขา AI" (SECRETARY) · เลน b `/root/projects/shark-sec-b` · สาขา `wip/sec-s3a5` (จากทิปผู้คุม f3d700ae7 → fast-forward 3bb9f0b60 ที่มีแพ็กเกจ `@react-pdf/renderer@4.3.0` c1f3924fa) · 2026-11-06 UTC
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S3a.5.md` + ข้อความผู้คุม (ส่วน B อนุมัติแล้ว) · มติเจ้าของ 7 พ.ย. 2569 แทน R-Z48
> ข้อสอบ: `scripts/qc-sec-s3a5.mts` (17 ข้อ · เลน b เขียนเองตามใบ — ผู้คุมทบทวน)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/modules/account/service.ts` | แก้ (+50) | `ensurePublicDocumentLink` (QUOTATION ที่ออกแล้ว AWAITING_ACCEPT/ACCEPTED/ISSUED · idempotent · เขียน token แบบ conditional คำสั่งเดียว) · `publicDocumentByToken` (ชนิด/สถานะ/§9.2 publicView.enabled/expiryDays) · `PUBLIC_DOCUMENT_TYPES` · ไม่แตะ `ensurePublicTaxInvoiceLink` | ไม่ |
| `src/lib/modules/account/rate-limit.ts` | แก้ (+7) | ถังใหม่ `publicDocument` 60/นาที/IP · `publicDocumentToken` 30/นาที/token + ข้อความไทย | ไม่ |
| `src/lib/modules/account/public-doc.ts` | ใหม่ | `loadPublicDocument` (มุมมองจาก getDocument/getSettings/buildPrintOptions/documentPaymentChannels/branding) · `renderPublicDocumentHtml` (HTML ทั้งหน้า มือถือก่อน · @media print ซ่อนปุ่ม · ทุกค่า escape · รูปเฉพาะ https/data) · ปิดบังเลขภาษี/ตัวเลขยาวของลูกค้า · ตัวช่วย HTTP | ไม่ |
| `src/lib/modules/account/public-doc-pdf.tsx` | ใหม่ (ส่วน B) | `renderPublicDocumentPdf` (react-pdf · `import()` ตอนใช้ · ฟอนต์ Sarabun จากไฟล์ · คำไทยยาว > 18 ตัวแบ่งด้วย Intl.Segmenter) · `pdfSafeThai` (ำ → ํา) · `pdfContentDisposition` (ASCII + RFC 5987) | ไม่ |
| `src/app/(store)/doc/[token]/route.ts` | ใหม่ | GET หน้าใบเสนอราคา (route handler) · 200/404/429 · noindex · no-referrer · no-store · CSP nonce | ไม่ |
| `src/app/(store)/doc/[token]/pdf/route.ts` | ใหม่ (ส่วน B) | GET ไฟล์ PDF · `runtime = "nodejs"` · ด่านเดียวกับหน้า · attachment `<docNo>.pdf` · สร้างไม่ได้ = 500 ไทย + logOps | ไม่ |
| `src/lib/ai/account-ops.ts` | แก้ (+27) | `approverCanIssueDocument` · `issueDocumentAsApprover` (op `documents.issue` = ทางเดียวกับปุ่ม "ออกเอกสาร" · สิทธิ์ `account.doc.issue` + audit ใน runOpAsActor · คีย์กันซ้ำ `ai-<proposalId>-issue`) | ไม่ |
| `src/lib/ai/proposals.ts` | แก้ | `latestQuoteLine` → `resolveQuoteDoc` + `quoteSendGate` (ก่อน claim) + `quoteLineForSend` (หลัง claim: ออกใบ DRAFT → ลิงก์ → "ใบเสนอราคา เลขที่ … · ยอด … บาท · ดูใบ: <origin>/doc/<token>") | **ใช่** (hunk chat.send เท่านั้น) |
| `src/proxy.ts` | แก้ (+5) | `/doc/*` ⇒ `Referrer-Policy: no-referrer` + `X-Robots-Tag: noindex, nofollow` (ไม่แตะ DB) | ไม่ (แต่เป็นไฟล์ทั้งแอป) |
| `next.config.ts` | แก้ (+2) | `outputFileTracingIncludes` ของ `/doc/[token]/pdf` ⇒ รวม `public/fonts/sarabun/**` ในฟังก์ชัน (อ่านฟอนต์ด้วย fs) | ไม่ |
| `public/fonts/sarabun/{Sarabun-Regular.ttf,Sarabun-Bold.ttf,OFL.txt}` | ใหม่ | ฟอนต์จาก `/usr/share/fonts/truetype/sarabun/` + ใบอนุญาต SIL OFL 1.1 (Copyright 2018 The Sarabun Project Authors) | ไม่ |
| `scripts/qc-sec-s3a5.mts` | ใหม่ | ข้อสอบ Q1–Q5 | – |
| `docs/modules/31-secretary.md` §1.5 · `docs/api/SECRETARY-API.md` (แถว approve) | แก้ | สัญญา chat.send quote + หน้า/ไฟล์สาธารณะ | – |

## 2. พฤติกรรม
- **chat.send kind=quote** (อ้างใบด้วย `refs.documentId` หรือใบ `account.documents.create` ล่าสุดที่ EXECUTED ในบทสนทนา):
  - ก่อน claim: ไม่มีใบ ⇒ NO_APPROVED_DOC_NOTE (คง PENDING) · ใบยกเลิก/ปฏิเสธ ⇒ ไทย · ใบ DRAFT และผู้กดไม่มี `account.doc.issue` ⇒ ไทย (คง PENDING)
  - หลัง claim: ใบ DRAFT ⇒ ออกเอกสาร (AWAITING_ACCEPT + docNo · audit `account.doc.issue`) · ใบที่ออกแล้วไม่แตะ · ลิงก์ `ensurePublicDocumentLink` · ข้อความต่อท้าย `\n\nใบเสนอราคา เลขที่ <docNo> · ยอด <บาท> บาท · ดูใบ: <origin>/doc/<token>` แล้วลงชื่อ Shark ตามเดิม
  - ร้านปิดลิงก์สาธารณะ (§9.2) ⇒ ไม่มีส่วน "ดูใบ" (หน้าจะ 404) · เอกสารชนิดอื่น ⇒ ไม่มีลิงก์
- **`/doc/<token>`**: เพดานต่อ IP แล้วต่อ token (429 ไทย + Retry-After) → token ผิด/ใบ DRAFT/ชนิดอื่น/ร้านปิดลิงก์/หมดอายุ ⇒ 404 ข้อความไทยเดียวกัน (ไม่บอกใบ้) → 200 HTML: โลโก้/ชื่อร้าน/ที่อยู่/เลขภาษีร้าน · ชื่อเอกสาร (ป้ายภาษาตามตั้งค่า) · เลขที่/วันที่/ยืนราคาถึง · ผู้ซื้อ (เลขภาษี/ตัวเลข ≥ 9 หลักปิดเหลือ 4 หลัก) · ตาราง · VAT · ยอด · หมายเหตุ/เงื่อนไข/ช่องทางชำระ · ปุ่ม "ดาวน์โหลด PDF" + "พิมพ์ / บันทึกเป็น PDF"
- **`/doc/<token>/pdf`** (ส่วน B): ด่านเดียวกัน → PDF A4 (เทมเพลตเดียวกับหน้า · ไม่มีรูปโลโก้/ตรา/ลายเซ็น) · ฟอนต์ Sarabun ฝังแบบ subset (ตัวอย่าง 16 KB) · `Content-Disposition: attachment; filename="<docNo ASCII>.pdf"; filename*=UTF-8''<docNo>.pdf`

## 3. ผลด่าน
- ข้อสอบ `qc-sec-s3a5` forced ×2 (gate lock): `JSON_SUMMARY {"total":17,"passed":17,"failed":[],"skipped":[],"residue":0}` ×2 · unforced (route มีแล้ว ⇒ รันเต็ม) 17/17 residue 0
- ภาพ PDF ตรวจด้วยตา (pdftoppm): ข้อความครบทุกคำหลังแก้สระอำ · `pdffonts`: Sarabun-Regular/Bold CID TrueType emb+sub+uni
- regression (gate lock เดียวกัน):
  - `qc-sec-s1.12` 15/15 · `qc-sec-s3a.1` 16/17 + R-1 SKIP (ต้องใช้คีย์จริง ตามเดิม)
  - `qc-sec-s3a1-r2` 27/28 — **T5-2 ตกตามที่คาด** (ข้อสอบตรวจ `/r/<token>` · ตอนนี้ข้อความใช้ `/doc/<token>` ตามมติเจ้าของ) ⇒ ORACLE-EDIT ด้านล่าง
  - `qc-account-api-docs` 10/17 (F2.1–F2.7 = ไฟล์สกิล `.claude/skills/shark-account-api` ไม่อยู่ใน git ของทรีนี้) · `qc-acc-v2-doc-settings` ตกหลายข้อ (ต้องใช้ร้าน seed SIAM DIVE QC ที่ฐานเลขาไม่มี) ⇒ ฐานไม่รองรับ ไม่เกี่ยวกับการแก้นี้
- typecheck `env NODE_OPTIONS=--max-old-space-size=9000 ISO_MEM=10000M bash scripts/iso.sh pnpm exec tsc --noEmit -p tsconfig.json` ⇒ **EXIT 0** (ไฟล์สุดท้าย · sha256 ตรวจซ้ำก่อน commit)
- fitness มี env 53/53 EXIT 0 · `env -u DATABASE_URL` 53/53 EXIT 0
- next build: ไม่รัน (ผู้คุมรัน)

## 4. ORACLE-EDIT ที่ขอ
- **qc-sec-s3a1-r2 T5-2**: `body2.includes(\`/r/qcr2tok${STAMP}\`)` → `body2.includes(\`/doc/qcr2tok${STAMP}\`)` · เหตุ: มติเจ้าของ 7 พ.ย. (S3a.5) ลิงก์ใบเสนอราคาในข้อความถึงลูกค้า = หน้า `/doc/<token>` (`/r/` เป็นหน้าขอใบกำกับภาษีของใบเสร็จ) · ใบในข้อสอบเป็น AWAITING_ACCEPT จึงไม่ถูกออกซ้ำ และ token เดิมถูกใช้ต่อ

## 5. FINDING / หมายเหตุ
- **F-S5-1 (MINOR · แก้ในใบนี้)** react-pdf ตัดตัวอักษรท้ายข้อความ 1 ตัวต่อ "ำ" 1 ตัว (ฟอนต์แตกสระอำเป็น 2 glyph · ตัวจัดบรรทัดนับเป็น 1) — เห็นจริงในภาพ: "จำนวน"→"จำนว", "0105561000099"→"010556100009" · แก้ด้วย `pdfSafeThai` (ำ → ํ + า ก่อนวาด · แสดงผลเหมือนเดิม · ข้อความที่คัดลอกจาก PDF เป็นรูปแยก)
- **F-S5-2 (MINOR · ข้อสังเกต)** ด่าน `account.doc.issue` ของผู้กดเป็นชั้นป้องกันซ้อน: ด่านผู้อนุมัติ R-Z17 ให้อนุมัติ chat.send ได้เฉพาะ OWNER/MANAGER ซึ่งมีสิทธิ์ออกเอกสารเสมอ (`evaluate`) ⇒ ทางที่ STAFF กดถูกหยุดที่ R-Z17 ก่อน (ข้อสอบ Q2-1 ตรวจผลจริง + ตัวตัดสินตรง)
- **F-S5-3 (MINOR · ข้อสังเกต)** แพ็กเกจ react-pdf เป็น ESM ล้วน (exports มีแต่ "import") ⇒ import แบบคงที่ใน `.tsx` พังเมื่อรันผ่าน tsx (CJS) ของข้อสอบ: `ERR_PACKAGE_PATH_NOT_EXPORTED '@react-pdf/hyphenate/en-us'` · ใช้ `await import()` ตอนสร้างไฟล์แทน (Next ใช้ได้ทั้งสองแบบ)
- ไฟล์ฟอนต์บน Vercel: อ่านด้วย `fs` จาก `process.cwd()/public/fonts/sarabun` + `outputFileTracingIncludes` — **ผู้คุมตรวจตอน next build/deploy ว่าไฟล์ฟอนต์อยู่ใน trace ของ `/doc/[token]/pdf`**

## 6. สิ่งที่ต่างจากใบ (ตัดสินเอง)
1. หน้า `/doc/<token>` เป็น **route handler ที่คืน HTML ทั้งหน้า** ไม่ใช่ server component page — page ของ App Router ตั้งสถานะ 429/404 จริงและ header (X-Robots-Tag/Referrer-Policy/CSP) ไม่ได้ (บันทึกเดียวกับ /r/) · แบบเดียวกับ `pos/reports/print/html/route.ts` · เนื้อหาตามเทมเพลตพิมพ์เดิมผ่าน `buildPrintOptions` แต่เป็น HTML ชุดใหม่ (ไม่ได้ใช้ JSX ของหน้าพิมพ์ร่วม — หน้าพิมพ์เดิมไม่แตะ)
2. "สถานะออกแล้ว" ของใบเสนอราคา = AWAITING_ACCEPT (ระบบไม่มี ISSUED สำหรับ QUOTATION) — อนุญาต AWAITING_ACCEPT/ACCEPTED/ISSUED · ปฏิเสธ DRAFT/CANCELLED/VOIDED/REJECTED
3. ร้านปิดลิงก์สาธารณะ ⇒ ข้อความไม่มีส่วน "ดูใบ" (ใบสั่งเขียน "ลิงก์ทุกครั้ง" — แต่ลิงก์จะ 404) · เลขที่ + ยอดยังมีทุกครั้ง
4. kind=quote ที่ระบุ `refs.documentId` ⇒ ต่อท้ายเลขที่/ยอด/ลิงก์ด้วย (เดิมต่อท้ายเฉพาะกรณีไม่ระบุ)
5. PDF ไม่มีรูป (โลโก้/ตรา/ลายเซ็น เป็น URL ภายนอก — ไม่ดึงเครือข่ายระหว่างสร้างไฟล์) · หน้า HTML แสดงรูปตามเดิม (https/data เท่านั้น)
6. ปิดบังตัวเลขยาว ≥ 9 หลักในชื่อ/ที่อยู่/หมายเหตุของลูกค้าด้วย (นอกจากเลขภาษี) — เบอร์ที่ซ่อนในที่อยู่
7. `proxy.ts` + `next.config.ts` ถูกแก้ (ไม่อยู่ในรายการไฟล์ของใบ) — เพื่อ header ของ `/doc/*` และรวมไฟล์ฟอนต์
8. ข้อสอบรันแบบ unforced 1 ครั้ง **โดยไม่ผ่าน with-gate-lock** (พลาด) — จบ 17/17 residue 0 · รอบอื่นทั้งหมดผ่าน gate lock
