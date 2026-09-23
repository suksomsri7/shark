# CRM-MASTER-PLAN — แผนงานละเอียด "CRM v2" ตั้งแต่ปรับฐานจนขึ้น production (53 ใบ · 7 เฟส)

> เขียน 18 ก.ย. 2569 · Fable · ใช้สั่งงาน **Opus 5 (ผู้คุมงานใน Claude Code)** หรือ **Codex** ให้ทำจนครบ 100% แล้ว Fable ตรวจรอบสุดท้าย
> 🔴 ข้อตัดสินที่ทับทุกเอกสาร (ผลตรวจไขว้ สเปก↔แผน↔ใบสั่ง): `ledger/crm-briefs/crm-brief-RESOLUTIONS.md`
> ใบสั่งงานรายใบ (Fable เขียนไว้ครบ 53 ใบ พร้อมชื่อฟังก์ชัน/ไฟล์จริงที่ตรวจกับโค้ดแล้ว): `ledger/crm-briefs/` · prompt เปิดงาน: `ledger/CRM-KICKOFF-PROMPT.md`
> เอกสารนี้ **อยู่เหนือ** `ledger/CRM-RUN.md` และ `ledger/CODEX-HANDOFF-CRM.md` เมื่อขัดกัน (สองไฟล์นั้นยังเป็นแหล่งสัญญารายใบ/กติกาโค้ด) · สเปก = `docs/modules/20-crm-v2.md` (+ §15 ภาคผนวก 18 ก.ย.) · API = `docs/api/CRM-API.md` · ภาพ = `ledger/design-crm/` · เหตุผลของทุกการแก้แผน = `ledger/REVIEW-CRM-DESIGN-2026-09-18.md`
> ชื่อไฟล์ที่ **ยังไม่มี** เขียนในเครื่องหมาย «…» (ไม่ใช่ backtick) เพื่อไม่ให้ด่าน F7.1 แดง — ผู้ทำงานสร้างตามนั้น

---

## 0. วิธีใช้เอกสารนี้ (อ่านก่อน 5 นาที)

1. เจ้าของเปิด session ใหม่ → วาง prompt ใน §11.1 (Opus 5) หรือ §11.6 (Codex) → ผู้คุมงานทำตาม §5 ทีละใบตามลำดับ §6 จนถึง C6.4
2. ทุกใบต้องผ่าน **ด่าน 12 ข้อ** (§3) — ไม่มีคำว่า "เกือบผ่าน" · ข้อที่ผ่านไม่ได้ต้องลงตาราง "หนี้" พร้อมเหตุผลและใบที่จะปิด
3. สถานะสดอยู่ที่ §12 ของไฟล์นี้ (ผู้คุมงานแก้ทุกครั้งที่ปิดใบ) · เหตุการณ์/มติเทคนิคลง `ledger/CRM-RUN.md` §4
4. ติดเรื่องที่ต้องให้เจ้าของตัดสิน → เขียนลง «ledger/CRM-OWNER-QUESTIONS.md» + ส่ง Telegram (`tg`) → **ทำใบอื่นที่ไม่ขึ้นกับคำตอบต่อ** ห้ามหยุดรอ
5. งานเสร็จ = §10 "ชุดหลักฐานส่ง Fable" ครบ → หยุด รอ Fable ตรวจ

**นิยาม "เสร็จ 100%"** (ทั้ง 7 ข้อ):
(1) ทุกหน้าใน §3 ของพิมพ์เขียวมีจริง ตรงภาพ ทั้งจอใหญ่และ 390px · (2) ทุกฟังก์ชัน §5 · ทุก event §7 · ทุกเส้นเชื่อม §9 · op 96 · tool 32 มีจริงและมีข้อสอบ · (3) **ทุกปุ่ม/ลิงก์/ฟอร์ม** อยู่ในทะเบียนปุ่มและผ่านการกดจริง 4 บทบาท (§7) · (4) ข้อสอบกลุ่ม X ครบทุกใบ (§4) · (5) รอบล่าบั๊ก/ช่องโหว่ (§8) ไม่มีข้อ HIGH/MEDIUM ค้าง · (6) `pnpm qc:all` เขียว (ยกเว้นหนี้เดิมที่ระบุชื่อ) · build ผ่าน · fitness 2 โหมดผ่าน · (7) ขึ้น production หลังตัวสลับ v1→v2 · migration ครบ · ทดสอบบน prod 4 บทบาท · มีทางถอย

---

## 1. บทบาท (ห้ามควบบทบาทในใบเดียวกัน)

| บทบาท | ใคร | ทำอะไร | ห้าม |
|---|---|---|---|
| **ผู้คุมงาน** (controller) | Opus 5 session หลัก (หรือ Codex session A) | อ่านสัญญา · เขียนใบสั่ง · ปล่อยตัวแทน · **รันข้อสอบซ้ำเองบน seed ใหม่** · build · ถ่ายภาพ+เปิดดูเอง · ตัดสิน ORACLE-EDIT · commit · push · ตรวจ Vercel+migration · อัปเดต ledger/memory/Telegram | เขียนโค้ด product เอง (ยกเว้นแก้จุดเล็กตอนตรวจรับ ≤ 20 บรรทัด และต้องบันทึก) |
| **ผู้เขียนข้อสอบ** (oracle writer) | ตัวแทนแยก (Opus) | เขียน «scripts/qc-crm-<wo>.mts» จากสัญญา **ก่อนมีโค้ด** · ต้องรันแล้ว **แดงด้วยเหตุผลที่ถูก** (หรือ SKIPPED เมื่อยังไม่มีตาราง) · คืนสภาพข้อมูลใน `finally` | แตะ `src/` · เห็นโค้ดของ builder |
| **builder** | ตัวแทนแยก (Opus · งาน UI ล้วนใช้ Sonnet ได้) | ทำให้ข้อสอบเขียวด้วยการแก้ product อย่างถูกต้อง | build · commit · push · migrate นอก QC · แก้ข้อสอบ · แตะไฟล์นอกรายการเจ้าของ |
| **ผู้ตรวจ** (reviewer) | ตัวแทนแยก อ่านอย่างเดียว | อ่าน diff ของใบ เทียบสัญญา+กลุ่ม X · หา regression/ทางลัด ("special-case ข้อสอบ" · `any` · import ข้ามโมดูล · PII ใน payload) | แก้ไฟล์ |
| **นักล่า** (hunter · เฟส C5) | ตัวแทนแยก 6 เลนส์ | หาบั๊ก/ช่องโหว่จากโค้ดจริง รายงานพร้อม file:line + ฉากโจมตี | แก้ไฟล์ |
| **ผู้ตรวจรอบสุดท้าย** | Fable | §10 | — |

โหมด Codex (ไม่มี sub-agent): ใช้ 3 session แยก = A ผู้คุมงาน+builder · B ผู้เขียนข้อสอบ (เริ่มก่อน A เสมอ 1 ใบ) · C ผู้ตรวจ/นักล่า — สื่อสารผ่านไฟล์ใน `ledger/wo-notes/` เท่านั้น

---

## 2. กติกาเครื่อง · ฐานข้อมูล · ข้อห้าม (ละเมิด = ตีกลับทั้งใบ)

1. worktree `/root/projects/shark-crm` · branch ทำงาน `session/crm` · เริ่มทุกกะ `git pull --rebase origin main` แล้ว `pnpm install` (ถ้า lockfile เปลี่ยน) + `pnpm prisma generate`
2. **ห้ามแตะ `.env` (= production)** · ห้าม `source .env*` · ฐาน QC เท่านั้น (`QC_ENV_FILE=.env.qc` · สคริปต์โหลดเอง) · backfill prod ต้อง `ALLOW_PROD_BACKFILL=1 … --dry-run` ก่อนเสมอ และทำได้เฉพาะในใบ C6.2
3. 🔴 **คำสั่งหนักฆ่า session** (cgroup `claude-remote.service` จำกัด 5 GB · `next build` ใช้ 5.6 GB): ทุก tsx / tsc / build / qc:all ต้องรันผ่าน **`bash scripts/iso.sh <คำสั่ง>`** แบบ foreground · งานยาว (build+ภาพ+qc:all) เขียนเป็นสคริปต์แล้ว `systemd-run --unit=<ชื่อ> --collect -p MemoryMax=6G bash <สคริปต์>` แล้ว poll log · **ห้ามห่อ `scripts/acc-v2-serve.sh` ด้วย `with-gate-lock.sh`** (มันล็อกเองอยู่แล้ว)
4. 🔴 **ฐาน QC ใช้ร่วมทุก session**: ข้อสอบที่เขียนฐานต้องรัน **ทีละชุด** (ผ่าน `bash scripts/with-gate-lock.sh`) · `drainOutbox` ไม่แยกร้าน — ข้อสอบที่ drain ต้องสร้าง event ด้วย key ที่มี tag ของตัวเองและตรวจเฉพาะของตัวเอง · ห้าม kill ข้อสอบกลางคัน (cleanup อยู่ใน `finally`)
5. migration: เพิ่มอย่างเดียว · สร้างด้วย `prisma migrate dev --create-only` บน QC → **เปิดอ่าน SQL ทุกบรรทัด** (ต้องไม่มี DROP / ALTER TYPE ทำลาย / NOT NULL ไม่มี default / unique บนตารางที่มีข้อมูลซ้ำได้) → deploy บน QC · ชื่อลงท้าย `_crm_v2_a|b|c` · **มีได้เฉพาะในใบ C1.1 · C2.0 · C3.0** (ใบอื่นต้องการคอลัมน์เพิ่ม = ย้อนไปเพิ่มในใบ migration ของเฟสนั้นก่อนปิดเฟส)
6. โค้ด: ไม่มี `any` ใน `src/` · zod v4 · ข้อความ error ภาษาไทยไม่โทษผู้ใช้ · เงินเป็นสตางค์ · เวลาไทย +07:00 ห้าม `getDay()/getDate()` ดิบ · `"use server"` export ได้เฉพาะ async function · `'use client'` ห้าม import โมดูลที่ลากถึง prisma (ใช้ `*-shared.ts`) · ห้าม import ข้ามโมดูลตรง (facade `index.ts` + `ALLOWED_EDGES` ใน `scripts/fitness.mts` พร้อมเหตุผล) · อ่าน `node_modules/next/dist/docs/` ก่อนใช้ API ของ Next ที่ไม่แน่ใจ
7. event ใหม่ต้องลง 3 ทะเบียนในใบเดียวกัน (`src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts`) · payload **ห้ามมีเบอร์/อีเมล/ชื่อเต็ม** · consumer ของ CRM เป็น "ของแถม" ตามสัญญา `compose` (ล้มแล้ว WARN ไม่พางานหลักล้ม · งานหลักล้มแล้วของแถมยังวิ่ง)
8. ห้ามสร้าง engine ชุดที่สอง (มติ C13/C18): ฟิลด์ · อัตโนมัติ · ทะเบียน op · ตัวรันแอ็กชันสื่อสาร · login ลูกค้า · ตัวกัน SSRF (`webhookTargetProblem`) · ตัวจำกัดอัตรา (`checkRateLimitDb`) · CSV (`csvRow`) — อยากทำต่างต้องแย้งใน wo-notes **ก่อนทำ**
9. ห้ามแก้ข้อสอบเพื่อให้ผ่าน: ถ้าข้อสอบผิดจริง builder เขียนแย้ง → ผู้คุมงานตัดสิน → แก้โดยผู้คุมงานพร้อมบรรทัด `ORACLE-EDIT <ชุด>-<ข้อ>` + หลักฐาน ใน `ledger/CRM-RUN.md` §4
10. cron: **ไม่เพิ่ม entry ใน `vercel.json`** (มติ C16) · push main = Vercel deploy (มีค่าใช้จ่ายต่อครั้ง) → push main **เมื่อปิดใบ** เท่านั้น ไม่ push ทุก commit ย่อย
11. ห้ามลบ/กวาด `/tmp` · ห้ามแตะ worktree อื่น · ห้ามใช้ credential ข้ามโปรเจกต์ · EAS build แอปมือถือต้องรอเจ้าของสั่ง

---

## 3. ด่าน 12 ข้อที่ทุกใบต้องผ่าน (Definition of Done)

| # | ด่าน | หลักฐานใน wo-notes |
|---|---|---|
| D1 | ข้อสอบของใบถูกเขียนก่อนโค้ด โดยตัวแทนแยก และ **เคยแดง/SKIPPED** | commit `test(crm): <wo>` + บรรทัดสรุปตอนแดง |
| D2 | ข้อสอบของใบเขียวครบ **เมื่อผู้คุมงานรันซ้ำเอง** หลัง reseed | `JSON_SUMMARY` |
| D3 | **กลุ่ม X** (§4) ครบทุกหัวข้อที่ใบนั้นเกี่ยวข้อง (หัวข้อที่ไม่เกี่ยวต้องเขียนเหตุผล 1 บรรทัด) | ตาราง X1–X10 |
| D4 | regression: ข้อสอบ CRM ใบก่อนหน้าทั้งหมด + ชุดของโมดูลที่ใบนี้แตะ (รายการใน §6 ต่อใบ) | บรรทัดสรุปต่อชุด |
| D5 | `pnpm typecheck` สะอาด · `pnpm fitness` ผ่านทั้งมี env และ `env -u DATABASE_URL` | ผลลัพธ์ |
| D6 | build ผ่าน (`bash scripts/acc-v2-serve.sh` ผ่าน iso) | exit 0 |
| D7 | ภาพ: ถ่าย owner · thana (STAFF ภูเก็ต) · nok (หัวหน้าทีมกระบี่) · manager · (portal: customer) ทั้ง 1440 และ 390 · **ผู้คุมงานเปิดภาพคู่ mockup ด้วยตา** · ไม่มี overflow · เขียน `PARITY: ผ่าน/ตีกลับ + เหตุผล` | path ภาพ + คำตัดสิน |
| D8 | ทุก element ที่กดได้ในหน้าของใบนี้มี `data-testid` และมีแถวใน «scripts/crm-ui-inventory.json» (§7) | diff ของทะเบียน |
| D9 | ผู้ตรวจ (ตัวแทนแยก) อ่าน diff แล้วไม่มีข้อ BLOCKER | รายงานผู้ตรวจ |
| D10 | เอกสาร: op ใหม่มี `test:` id · docs API จาก generator ไม่ stale · สิทธิ์ใหม่มีป้ายไทย · event ใหม่ 3 ทะเบียน | ผล fitness F13.x |
| D11 | wo-notes ครบตาม `ledger/wo-notes/TEMPLATE-crm.md` + ตารางหนี้ + ข้อมูล QC ถูกคืนสภาพ (รัน `qc-member-m1.9` ยังได้ 30/15/10/5) | ไฟล์ |
| D12 | commit → push main → Vercel READY → (ถ้ามี migration) `_prisma_migrations` บน prod มีแถวใหม่ → Telegram สรุป % | hash · สถานะ |

---

## 4. กลุ่มข้อสอบ X — บังคับทุกใบ (ได้จากผลตรวจสมาชิก 37 ข้อ)

> id ในไฟล์ข้อสอบ: `C<wo>-X<n>.<ข้อ>` · ผู้เขียนข้อสอบต้องเขียนกลุ่มนี้ **ในไฟล์เดียวกับข้อสอบฟังก์ชัน** · ข้อที่พิสูจน์ด้วยการรันจริงไม่ได้ ให้เป็น `[static]` ที่ตรวจโครงสร้างแบบแม่นยำ (ใช้ให้น้อย)

| กลุ่ม | ต้องพิสูจน์อะไร | ใช้กับ |
|---|---|---|
| **X1 ขอบเขต** | ทุก list/get/mutation/REST op/AI tool/export ใหม่: ข้ามร้าน · **ข้ามระบบ CRM ในร้านเดียวกัน** · ข้ามทีม (thana เปิดของทีมกระบี่) · ข้ามบริษัท (portal) ⇒ 404 ไม่ใช่ 403 และไม่มีข้อมูลหลุดใน error | ทุกใบที่มี read/write |
| **X2 คีย์และผู้ช่วย AI** | คีย์ API ที่ไม่มี scope `crm.*` ถูกปฏิเสธทุก op/tool ของ CRM (บทเรียน H1) · bundle อ่านอย่างเดียวเขียนไม่ได้ · ตัวกรอง `ownerUserId/teamId` ของคีย์มีผลจริง · ผู้ช่วย AI รันด้วยสิทธิ์ = (scope ผู้ช่วย ∩ สิทธิ์จริงของคนถาม) และ **ทีม/สาขาของคนถาม** ห้าม `[]` (บทเรียน H3) | C1.10 · C2.11 · C3.4 · C3.8 + ทุกใบที่เพิ่ม op/tool |
| **X3 ยิงพร้อมกัน** | ตัวเลขสะสม/ตัวนับ/ตัวชี้ทุกตัว: ยิง ≥10 ทางพร้อมกันบน connection แยก → ผลรวมตรงเป๊ะ · ห้าม "อ่าน→คิดในแอป→เขียน" (ใช้ increment / UPDATE…RETURNING / conditional updateMany) — รายการขั้นต่ำ: `rrCursor` · `valueSatang` จาก lines · `paidSatang` · `wonValueSatang` · `openDealCount` · `recordCount` · คะแนน+`maxPerDay` · โควตา reached ครั้งเดียว · แถว StageHistory ที่เปิดอยู่มีได้ 1 · enrollment ACTIVE ได้ 1 · คอมมิชชัน unique · convert กดซ้ำ 2 ครั้งได้ชุดเดียว (idempotencyKey) | ทุกใบที่มีตัวเลข/สถานะ |
| **X4 ส่งซ้ำ** | consumer ทุกตัวของใบ: ประมวลผล event เดิม 2 รอบ และ 2 รอบพร้อมกัน → ผลเกิดครั้งเดียว · ลำดับ "ปักธงก่อน (advisory lock + แถวธง) แล้วค่อยบวก" (บทเรียน H5) · ขา void/reverse ลบเฉพาะที่เคยบวก (M10) | C1.8 · C2.x · C3.3 |
| **X5 จองแถวงานตามเวลา** | ทุกงาน cron ที่หยิบแถว: 2 รอบซ้อนกัน → ทำครั้งเดียว · จำลองโพรเซสตายหลังจอง → รอบหลัง lease (15 นาที) หยิบใหม่ได้ · ห้ามจองด้วยการเขียนสถานะสุดท้าย (บทเรียน M7/H6) | C2.2 · C2.5 · C2.6 · C2.8 · C2.10 · C3.1 · C3.9 |
| **X6 ข้อมูลเข้าอันตราย** | ส่งออก CSV ทุกจุดผ่าน `csvRow` (เซลล์ขึ้นต้น `= + - @` ถูกทำให้เป็นกลาง) · นำเข้ามีเพดานแถว/ขนาด · ช่อง URL รับเฉพาะ http/https · server ดึง URL ของผู้ใช้ต้องผ่าน `webhookTargetProblem` (แอ็กชัน WEBHOOK · ตรวจโดเมนอีเมล) · redirect (`/t/c` `/l`) ไปได้เฉพาะ URL ที่เก็บไว้ · HTML จากภายนอก (อีเมลขาเข้า · เทมเพลต · ข้อความ consent) ถูก sanitize และแสดงใน iframe sandbox · หัวอีเมล (subject/ชื่อผู้ส่ง) ไม่มี CR/LF · ไฟล์: mime/ขนาดตาม allowlist · ไฟล์แนบขาเข้าบังคับดาวน์โหลด | ทุกใบที่รับข้อมูล |
| **X7 endpoint สาธารณะ** | จำกัดอัตราด้วย `checkRateLimitDb` (ต่อ IP-hash + ต่อ token) · token ≥ 128 บิต เก็บเป็น hash · token ไม่รู้จัก = คำตอบเดียวกับ token ถูก (gif/302/204) · ไม่คืนข้อมูลใด ๆ · payload มีเพดานขนาด · CORS เฉพาะโดเมนที่อนุญาต | C2.5 · C2.6 · C3.5 |
| **X8 PDPA** | ตรวจความยินยอม **ตอนส่งจริง** ทุกช่องทาง (อีเมล · LINE · sequence · กฎ) · optOut/bounce บล็อกทุกเส้นทาง · payload ของ outbox · `OpsEvent` · log ไม่มีเบอร์/อีเมล/เนื้ออีเมล/transcript · ตารางใหม่ของใบนี้อยู่ในรายการ erase/export (C3.9 รวบ) · ข้อมูลอ่อนไหวของสมาชิกไม่โผล่ใน 360/AI/export ของ CRM เกินนโยบาย D8 และมีแถว `MemberAccessLog` เมื่อโผล่ | ทุกใบที่ส่ง/แสดงข้อมูลบุคคล |
| **X9 การกระทำอันตราย** | op ชนิด danger ต้อง `confirm` + เหตุผล ≥ 5 ตัวอักษร (ลบ · รวม · ส่งอีเมล/sequence เป็นกลุ่ม · โอนเป็นกลุ่ม · คำนวณคะแนนใหม่ทั้งร้าน · rotate key) · bulk มีเพดาน · เกินเพดานสิทธิ์ → approval · ทุก mutation มีแถว audit | ทุกใบที่มี mutation |
| **X10 ความลับและไฟล์** | ไฟล์ส่วนตัวเข้าถึงได้ผ่าน route ที่ตรวจสิทธิ์+หมดอายุเท่านั้น (ไม่มี URL CDN ถาวรใน DTO) · token/secret เก็บเป็น hash · ไม่มีความลับใน DTO/RSC payload ของคนที่ไม่มีสิทธิ์ (บทเรียน PIN สแตมป์) · คุกกี้ตั้ง `secure` ตาม `customer-cookie.ts` | C0.4 · C2.4 · C2.5 · C3.5 |

---

## 5. ขั้นตอนต่อใบ (14 ขั้น · ห้ามสลับ)

| ขั้น | ใคร | ทำอะไร |
|---|---|---|
| 1 | ผู้คุมงาน | `git pull --rebase origin main` · อ่านสัญญาใบ (`ledger/CRM-RUN.md` §2 + แถว "แก้จากเดิม" ใน §6 ของไฟล์นี้ + หัวข้อพิมพ์เขียว + ภาพ) · **เปิดโค้ดจริงที่จะแตะ** (ห้ามเชื่อชื่อฟังก์ชันในพิมพ์เขียว — ตารางชื่อจริงอยู่ใน REVIEW §3) |
| 2 | ผู้คุมงาน | เปิดใบสั่งที่ Fable เขียนไว้แล้ว `ledger/crm-briefs/crm-brief-<wo>.md` (+ `crm-brief-COMMON.md`) → **ตรวจข้อเท็จจริงในใบกับโค้ด ณ วันนั้น** (ชื่อฟังก์ชัน/บรรทัดอาจเลื่อนหลังใบก่อนหน้า) → เติมหัวข้อ `## Controller addendum <วันที่>`: ไฟล์ที่ใบก่อนหน้าสร้างจริง · ข้อตัดสินใหม่ · รายการไฟล์เจ้าของฉบับสุดท้าย — ห้ามลบเกณฑ์รับ/กลุ่ม X ของ Fable ออก (ถ้าเห็นว่าผิด ให้เขียนแย้งใน addendum พร้อมหลักฐาน แล้วทำตามที่ปลอดภัยกว่า) |
| 3 | ผู้เขียนข้อสอบ | เขียนข้อสอบ + spec ภาพใน «scripts/visual-crm.mts» → รันผ่าน iso → แดง/SKIPPED ด้วยเหตุผลที่ถูก → รายงาน |
| 4 | ผู้คุมงาน | อ่านข้อสอบ (ตรงสัญญา? คืนสภาพข้อมูล? type-safe ใต้ `next build`?) → `git commit -m "test(crm): <wo> oracle N ข้อ"` |
| 5 | builder | ทำงานตามใบสั่ง · รันข้อสอบ+regression ผ่าน iso · typecheck · รายงานต่อข้อ + คำขอ ORACLE-EDIT (ถ้ามี) |
| 6 | ผู้ตรวจ | อ่าน diff → รายงาน BLOCKER / ควรแก้ / ข้อสังเกต |
| 7 | ผู้คุมงาน | ตัดสิน ORACLE-EDIT · ส่งข้อ BLOCKER กลับ builder (วนขั้น 5–7 จนไม่เหลือ) |
| 8 | ผู้คุมงาน | reseed (`seed-member-qc` → `seed-crm-qc`) → รันข้อสอบใบ + regression **เอง** |
| 9 | ผู้คุมงาน | typecheck + fitness 2 โหมด |
| 10 | ผู้คุมงาน | build + ถ่ายภาพ 4–5 บทบาท (สคริปต์ใน unit แยก) → **เปิดภาพคู่ mockup เอง** → parity |
| 11 | ผู้คุมงาน | อัปเดตทะเบียนปุ่ม (§7) สำหรับหน้าของใบ |
| 12 | ผู้คุมงาน | wo-notes + §12 สถานะ + `ledger/CRM-RUN.md` §4 |
| 13 | ผู้คุมงาน | commit (ข้อความ: `crm <wo>: …` + ผลข้อสอบ) → push `session/crm` + `HEAD:main` → poll Vercel → ตรวจ migration บน prod ด้วย `scripts/prodmig.cjs` (ถ้ามี) |
| 14 | ผู้คุมงาน | Telegram สรุป (ใบ · % · สิ่งที่ต้องให้เจ้าของรู้) · memory `project_shark_crm_v2_design.md` |

ขนาน: ได้สูงสุด 2 builder เมื่อรายการไฟล์เจ้าของไม่ทับกัน และ **ไม่มีใบไหนแตะ `prisma/schema`** · ข้อสอบที่เขียนฐานยังต้องรันทีละชุด · ปิดเฟส (C1/C2/C3) ต้อง `qc:all` เต็ม 1 รอบ

---

## 6. เฟสและใบงาน (53 ใบ)

> คอลัมน์ "สัญญา" = หัวข้อใน `ledger/CRM-RUN.md` §2 (ใบเดิม) · "แก้จากเดิม" = ส่วนที่แผนนี้เพิ่ม/เปลี่ยน (ยึดอันนี้เมื่อขัดกัน) · "regression" = ชุดที่ต้องเขียวเพิ่มจากข้อสอบ CRM ก่อนหน้า

### เฟส C0 — ปรับฐาน (5 ใบ · ต้องเสร็จก่อนแตะ C1)

| ใบ | งาน | เกณฑ์รับหลัก | regression |
|---|---|---|---|
| **C0.1** | เครื่องมือ QC ของ CRM: ทบทวน `scripts/crm-qc-env.mts` + `scripts/seed-crm-qc.mts` + `scripts/qc-crm-c1.1.mts` ให้ตรงชื่อตารางจริง (REVIEW §3 ข้อ 4: `HotelReservation` · `PatientRecord` · `ClinicVisit` …) · สร้าง «scripts/visual-crm.mts» (ลอกโครง `scripts/visual-member.mts`: DSL ขั้นตอน · overflow · summary ต่อผู้ใช้ · `--user owner\|manager\|thana\|nok\|customer:<code>`) · สร้าง «scripts/crm-ui-inventory.json» ว่าง + ด่าน fitness ใหม่ F14.1 (ทุก `data-testid` ที่กดได้ใต้ `src/app/app/sys/[id]/crm/**` และ `src/components/crm/**` ต้องมีในทะเบียน) · `ledger/wo-notes/TEMPLATE-crm.md` เพิ่มตาราง X + ด่าน 12 ข้อ | ข้อสอบ c1.1 ยัง SKIPPED อย่างถูกต้อง · fitness เขียว 2 โหมด · visual-crm รันกับหน้า v1 3 หน้าได้ภาพ | `qc-crm` · `qc-crm-activity` |
| **C0.2** | facade ของ CRM v1: สร้าง `index.ts` ของโมดูล crm (export เท่าที่โมดูลอื่นใช้วันนี้) · ย้าย `forms` และ `account` ให้ import ผ่าน facade · ยังไม่เปลี่ยนพฤติกรรม | F2 เขียว · ไม่มีไฟล์นอก crm import `crm/service` ตรง | `qc-crm` · ชุด forms · `qc-acc-v2-party` |
| **C0.3** | facade ของโมดูลอื่นที่ CRM ต้องใช้ (additive ล้วน · ไม่แตะ tx เดิม): **บัญชี** — `createExternalQuotation` รับ `lines[]` (ของเดิมที่ส่งยอดเดียวต้องได้ผลเหมือนเดิมทุกไบต์) · `createInvoiceFromQuotation` · `setQuotationResponse` · `createPaymentRequest` · `outstandingByContacts` · `ensureAccountContact(partyId)` · `mergeContacts` ออกทาง `index.ts` · **แชท** — `sendLineToParty` · `listConversationsByParty` · **HR** — สร้าง `index.ts` (`requestAdjustment` · `employeeOfUser`) · **party** — `updateContactInfo` · **approval** — entityType `crm.discount` `crm.commission` `crm.reassign` `crm.portal_request` ลง 3 ที่ (labels · actions allowlist · `src/lib/approval-effects.ts` แบบ no-op รอใบเจ้าของ) · `ALLOWED_EDGES` เพิ่มพร้อมเหตุผล | ข้อสอบ facade ต่อฟังก์ชัน (ของเดิม byte-equal + ของใหม่) · X1 (ข้ามร้าน) · X4 (`ensureAccountContact` idempotent ยิงพร้อมกัน 10 ได้ 1 แถว) | บัญชี V2 ทั้งชุด (`qc-acc-v2-*` · `qc-account-api-*`) · `qc-pos-account` · ชุดแชท · `qc-approval-*` · ชุด HR payroll |
| **C0.4** | ไฟล์ส่วนตัว (มติ C17): route เสิร์ฟไฟล์ที่ตรวจสิทธิ์+ลิงก์หมดอายุ (HMAC · 15 นาที) · `uploadFile` โหมด private (ไม่คืน URL CDN) · ใช้ได้ทั้งพนักงานและ session ลูกค้า · ลบไฟล์จริงเมื่อ erase | X10 ครบ: ไม่มี URL ถาวรใน DTO · ลิงก์หมดอายุ → 403 · ลิงก์ของคนอื่น/ร้านอื่น → 404 · traversal | ชุด storage · ชุดแชท (ไฟล์แนบ) |
| **C0.5** | ตัวกระจายงานถี่ (มติ C16 ฉบับแก้ — ดู RESOLUTIONS R-C.6: เส้น outbox ไม่มีตัวยิงรายนาทีที่ยืนยันได้ → เพิ่มตัวรัน «scripts/crm-cron.mts» แบบเดียวกับ cron บัญชีบน VPS · ติดตั้ง crontab จริงในใบ C6.1 หลังเจ้าของอนุญาต): «src/lib/platform/minute-jobs.ts» ถูกเรียกจาก `/api/cron/outbox` หลัง drain · ทะเบียนงาน (ชื่อ · ช่วงเวลา · ฟังก์ชัน) · แต่ละงานจับ error ของตัวเอง · งบเวลา/รอบ · แถวสถานะล่าสุดให้หน้า integrations อ่าน · ยังไม่มีงานจริง (ใบ C2.x มาลงทะเบียน) | X5 ที่ระดับตัวกระจาย (2 รอบซ้อน → งานละครั้ง) · งานหนึ่งล้มไม่ทำให้ outbox drain แดง | `qc-cron` · `qc-webhook` |

### เฟส C1 — โครง (12 ใบ)

| ใบ | สัญญา | แก้จากเดิม | regression |
|---|---|---|---|
| **C1.1** | §2 C1.1 | migration `crm_v2_a` เพิ่ม **`CrmVisibilityPolicy`** · `TeamMember.acceptingLeads` · `CrmFileLink` · `CrmContactConsent` · `settings.crm.uiVersion` · partyId 5 คอลัมน์ตามชื่อจริง (`Appointment` `ShopOrder` `RentalBooking` `QueueTicket` `ClinicVisit`) + **เขียนค่าจริง 9 จุด** (รวม 4 ตารางที่มีคอลัมน์แล้วแต่ไม่มีใครเขียน) · `PosSale` ไม่เพิ่ม partyId (ไม่มีเบอร์ — ผูกผ่าน memberId) · unique ของ `MemberSection/MemberField` สลับใน migration เดียว (ตรวจแล้วไม่มีโค้ดใช้ selector `systemId_key` ของสองตารางนี้): ADD COLUMN `objectKey` default `customer` → CREATE UNIQUE ใหม่ → DROP unique เก่า (ลำดับนี้เท่านั้น) · 💰 มติ C28: คอลัมน์เงินใหม่เป็น BigInt (`paidSatang` `wonValueSatang`) · `valueSatang` เดิมคง Int + เพดาน ฿20 ล้าน/ดีล (หนี้) | `qc-member-m1.2` `m1.3` `m1.4` `m1.5` · `qc-member-fix-s1` · F1/F8 |
| **C1.2a** | §2 C1.2 ครึ่ง engine | ชื่อฟังก์ชันจริง (`checkFieldValue` `listLayout` `fieldFilterWhere` `getFieldValues` `setFieldValues` `applyTemplate`) รับ `objectKey` (default `customer` = พฤติกรรมเดิมทุกไบต์) · adapter ค่าไป `CustomRecordValue` · ฟิลด์ `sensitive` ใช้นโยบาย D8 เดิม (X8) | สมาชิก `m1.2` `m1.3` `m1.5` `m1.6` `m3.9` · `fix-s1` (H2 ต้องยังเขียว) |
| **C1.2b** | §2 C1.2 ครึ่ง objects | X3: `recordCount` · X1: วัตถุของระบบ CRM อื่นในร้านเดียวกัน → 404 | C1.2a |
| **C1.3** | §2 C1.3 | ใช้ facade จาก C0.3 (`ensureAccountContact`) · X3: cache `openDealCount/wonValueSatang` · X4: consumer `crm.company.created` | บัญชี party/contact |
| **C1.4** | §2 C1.4 | + ความยินยอมผู้ติดต่อ (C20) · convert รับ `idempotencyKey` (X3) · export ผ่าน `csvRow` + ฟิลด์อ่อนไหวของสมาชิกที่ผูกไม่หลุด (X6/X8) · import เพดาน 50,000 แถว/10 MB | สมาชิก `m1.4` `m1.6` `m1.7` |
| **C1.5** | §2 C1.5 | ถอดส่วนลากของ `src/components/kanban/BoardView.tsx` เป็น hook ใช้ร่วม (บอร์ดงานต้องทำงานเหมือนเดิม) · approval `crm.discount` (C0.3) · X3: `valueSatang` จาก lines + แถว history เปิดได้ 1 (ย้ายขั้นพร้อมกัน 2 ทาง) | `qc-kanban-k2.*` ชุดกระดาน · บัญชีใบเสนอราคา |
| **C1.6** | §2 C1.6 | + ไฟล์แนบ/โน้ตปักหมุด/คอมเมนต์ @mention (C19 · ไฟล์ผ่าน C0.4) · แจ้งเตือน @mention เคารพ visibility (ไม่แจ้งคนที่มองไม่เห็นดีล) | `qc-kanban-k3.3` |
| **C1.7** | §2 C1.7 | ตารางมีแล้วจาก C1.1 · X1 เต็มรูป: 4 บทบาท × ทุก list/get ของ C1.3–C1.6 · cache ทีมไม่ค้างหลังย้ายคน (บทเรียน "ให้สิทธิ์ห้ามใช้คำตอบแคช") | สมาชิก saved view TEAM |
| **C1.8** | §2 C1.8 | ย้าย payload `crm.deal.won` ให้ไม่มี PII โดย consumer สมาชิก `onCrmDealWon` ยังทำงาน (อ่านจาก DB แทน) · forms เปลี่ยนเป็น consumer + `FormDef.crmSystemId` · X4 ทุก consumer · สัญญา `compose` | `qc-member-m2.8` · `fix-s2` · ชุด forms · ชุดแชท · `qc-automation` · `qc-webhook` |
| **C1.9** | §2 C1.9 | — | สมาชิก `m1.3` (ตัวออกแบบฟิลด์) |
| **C1.10** | §2 C1.10 | ใช้ชั้นกลาง `src/lib/api/*` · bundle 3 ใน `src/lib/api-keys/scopes.ts` · fitness F13.10–12 · generator «scripts/gen-crm-api-docs.mts» · **X2 เต็มรูป** · X9 danger | `qc-member-m1.11` `m2.10` `m3.10` · `qc-kanban-k3.5` · `qc-account-api-*` |
| **C1.11** | §2 C1.11 | + ตัวสลับ v1→v2 (C23): ค่าเริ่มต้น 1 · หน้า v1 เดิมยังเปิดได้เมื่อค่า = 1 · ข้อสอบสลับไป-กลับข้อมูลไม่หาย | «qc-crm-v1» |
| **ปิด C1** | `qc:all` เต็ม · US2 US3 US6 US8 เดินจริงบน QC server (จดเป็นสคริปต์ใน visual-crm) · สรุปเฟสใน `ledger/CRM-RUN.md` | | |

### เฟส C2 — เครื่องยนต์ขาย (12 ใบ)

| ใบ | สัญญา | แก้จากเดิม | regression |
|---|---|---|---|
| **C2.0** | (ใหม่) migration `crm_v2_b`: ตารางของ **ทั้งเฟส C2** (Score* · Assignment · Sequence* · Email* + `EmailDomain` · Tracked* · Web* · **`CrmDealPayment`** · `CrmUserPref` · คอลัมน์ `FormDef`/`FormSubmission`) + scope registry · **มติ C29: ไม่เพิ่ม `PosSale.dealId`** (ตารางขายเป็นตารางร้อน) — บิลผูกดีลผ่านแถว `CrmDealPayment` ซึ่งเป็นธงกันนับซ้ำของ `recordPayment` ไปในตัว | SQL additive ล้วน · ซ้อมบนสำเนา prod ถ้า Q5 = ได้ | F1/F8 · สมาชิก `m1.2` `m1.3` |
| **C2.1** | §2 C2.1 | **มติ C18**: ย้ายตัวรันแอ็กชันสื่อสาร + WAIT (lease) ออกจาก `src/lib/modules/member/journeys.ts` เป็นของกลาง แล้วสมาชิก+CRM ใช้ร่วม · แอ็กชัน `WEBHOOK` ผ่าน `webhookTargetProblem` (X6) · โควตา/loop-guard แยก scope | `qc-member-m3.3` · `fix-s3` · `qc-kanban-k2.9` · `qc-automation` |
| **C2.2** | §2 C2.2 | วันหยุด (C25) · X5: `runDue` จอง lease + กู้แถวค้าง · X8: ตรวจ consent/optOut **ตอนทำขั้น** · X3: ACTIVE ได้ 1 · ลงทะเบียนงานใน C0.5 | C2.1 |
| **C2.3** | §2 C2.3 | X3: round-robin 20 ทางพร้อมกันกระจายเท่ากัน · LEAST_OPEN ไม่ over-assign เมื่อยิงพร้อมกัน | — |
| **C2.4** | §2 C2.4 | ถอดเสียง = adapter + ปุ่มปิด จนเจ้าของตอบ Q2 · ไฟล์เสียงผ่าน C0.4 (X10) · transcript ไม่ลง log/OpsEvent (X8) · สแกนนามบัตรใช้ vision ที่มีอยู่ | ชุดแชท · AI vision |
| **C2.5** | §2 C2.5 | ชั้นส่งอีเมลใหม่ (html · แนบ · headers · from · replyTo · คืน id) โดย `sendEmail` เดิมยังเรียกได้เหมือนเดิม · route webhook ของ Resend (ตรวจลายเซ็น) · `EmailDomain` · ขาเข้า `crm+<key>@` ต่อจาก route เดิม (ลอกแบบ `src/lib/modules/kanban/boards-email.ts`) · **X6 เต็มรูป** (sanitize · iframe sandbox · บล็อกรูประยะไกล · แนบบังคับดาวน์โหลด · หัวอีเมลไม่มี CR/LF) · X7 (pixel/คลิก/unsubscribe) · X5 (อีเมลตั้งเวลา) · X8 (optOut/bounce/ความยินยอมตอนส่ง) | `qc-kanban-k3.9` (อีเมลเข้าบอร์ด) · ทุกชุดที่เรียก `sendEmail` |
| **C2.6** | §2 C2.6 | กันสแปมฟอร์ม (C24) · X7 เต็มรูป (`/t/e` เพดาน payload · โดเมนอนุญาต · CORS) · redirect เฉพาะ URL ที่เก็บ (X6) · X5 purge | ชุด forms |
| **C2.7** | §2 C2.7 | ใช้ facade C0.3 · **X4 เต็มรูป**: `recordPayment` ปักธงต่อ (deal, refType, refId) ก่อนบวก `paidSatang` ด้วย increment · void ลบเฉพาะที่เคยบวก · consumer เป็นของแถมของ `pos.sale.paid` (ไม่บล็อกบัญชี/สมาชิก) | POS ทั้งชุด · บัญชี V2 ทั้งชุด · `qc-member-m2.8` · `fix-s2` · `qc-kanban-k3.3` |
| **C2.8** | §2 C2.8 | X3 `maxPerDay` ยิงพร้อมกัน · X4 · X5 decay | — |
| **C2.9** | §2 C2.9 | event ใหม่ 6 ตัว emit **ใน tx** ของโมดูลเจ้าของ (`ticket.order.paid` `rental.returned` `school.enrolled` `hotel.checked_out` `clinic.visit.done` `queue.served`) · `booking.*` `shop.order.paid` มีแล้ว — เพิ่มแค่ consumer CRM · คลินิกส่งเฉพาะ "มีการเข้ารับบริการ" (X8) | ข้อสอบของ 6 โมดูลเจ้าของทั้งชุด |
| **C2.10** | §2 C2.10 | ช่องทางรอบแรก push + อีเมล + ในแอป (LINE รอ Q3) · quiet hours ฝั่งพนักงาน · ตั้งค่ารายคน (C22) · งานถี่ลง C0.5 · X5 · ไม่แจ้งเรื่องที่ผู้รับมองไม่เห็น (X1) | `qc-kanban-notify` |
| **C2.11** | §2 C2.11 | X2 · X9 (ส่งอีเมล/ลงทะเบียน sequence เป็นกลุ่ม = danger) | C1.10 |
| **ปิด C2** | `qc:all` เต็ม · US1 US4 US5 US9 เดินจริง | | |

### เฟส C3 — ทีม · รายงาน · portal (11 ใบ)

| ใบ | สัญญา | แก้จากเดิม | regression |
|---|---|---|---|
| **C3.0** | (ใหม่) migration `crm_v2_c`: Quota · CommissionRule/Commission · PortalAccess/Request · `HrPayAdjustment.crmCommissionId` · คอลัมน์ session ลูกค้าสำหรับ portal (มติ C15) | additive ล้วน | F1/F8 · `qc-member-m2.9` `m3.11` (session ลูกค้า) |
| **C3.1** | §2 C3.1 | รายงานรวมยอดใน DB (ไม่มี `findMany` ไร้ `take` — บทเรียน M13) · กรองตาม visibility · CSV ผ่าน `csvRow` · X5 รายงานตั้งเวลา | — |
| **C3.2** | §2 C3.2 | X3 reached ครั้งเดียว | — |
| **C3.3** | §2 C3.3 | facade HR (C0.3) · event `hr.payroll.paid` ใหม่ในโมดูล HR (3 ทะเบียน) · approval `crm.commission` · X3/X4 เต็มรูป (ชำระบางส่วนซ้ำ · reverse ซ้ำ) | ชุด HR payroll · approval |
| **C3.4** | §2 C3.4 | X2 (AI เห็นตามคนถาม) · X8 (KB/prompt ไม่มี PII เกินจำเป็น) | AI ทั้งชุด |
| **C3.5** | §2 C3.5 | **มติ C15**: เส้นทาง `/b/{slug}/*` (ไม่ใช่ `/p/*`) · ใช้ `customer-session` ขยาย · OTP/LINE จำกัดอัตราใน DB · เชิญใช้ครั้งเดียว+หมดอายุ 7 วัน · ถอดสิทธิ์ = session หมดทันที · เอกสาร/สลิปผ่าน C0.4 · X1 ข้ามบริษัท · X7 · X10 | `qc-member-m2.9` `m3.11` · `fix-s1` (session) · PAGES (`/p/[slug]` ยังทำงาน) |
| **C3.6** | §2 C3.6 | หน้า integrations อ่านสถานะงานจาก C0.5 | — |
| **C3.7** | §2 C3.7 | แอปพนักงานใช้ harness `apps/mobile/qc/` เดิม · ห้าม EAS build | `qc-member-m3.9` |
| **C3.8** | §2 C3.8 | X2 ครบ 96 op + 32 tool (ตารางสิทธิ์ต่อ op จาก generator) | C1.10 · C2.11 |
| **C3.9** | §2 C3.9 | + event `member.erased` (3 ทะเบียน) · erase ของผู้ติดต่อที่ไม่ใช่สมาชิก · อายุ lead (C21) · รวบ X8 ของทุกตารางใหม่ทั้ง RUN | สมาชิก `m1.7` · `fix-s4` |
| **ปิด C3** | `qc:all` เต็ม · US7 US10 เดินจริง | | |

### เฟส C4 — ทุกปุ่มทำงาน (4 ใบ · รายละเอียด §7)
C4.1 ทะเบียนปุ่มครบ + ด่าน F14 · C4.2 กดทุกปุ่ม 5 บทบาท 2 ขนาดจอ · C4.3 ฟอร์มทุกใบ (กรอกถูก/ผิด/ว่าง/ยาวเกิน/กดซ้ำ) · C4.4 เส้นทางผู้ใช้ US1–US10 แบบกดจริงต้นจนจบ

### เฟส C5 — ล่าบั๊กและช่องโหว่ (5 ใบ · รายละเอียด §8)
C5.1 ความเร็วกับข้อมูลขนาดจริง (C26) · C5.2 นักล่า 6 เลนส์ · C5.3 ยืนยันข้อค้นพบกับโค้ด + เขียนข้อสอบให้แดง · C5.4 แก้เป็นชุด (ไฟล์เจ้าของไม่ทับ) · C5.5 รอบสองของนักล่าเฉพาะจุดที่แก้

### เฟส C6 — ปล่อยขึ้น production (4 ใบ · รายละเอียด §9)
C6.1 ซ้อม migration + ตรวจ prod · C6.2 backfill prod (dry-run → จริง) · C6.3 เปิด v2 ให้ร้านนำร่อง + ทดสอบบน prod 5 บทบาท · C6.4 ส่งมอบ (HANDOVER + ชุดหลักฐาน §10)

---

## 7. เฟส C4 — "ทุกปุ่มทำงานถูกต้อง" ทำอย่างไร

**ทะเบียนปุ่ม** «scripts/crm-ui-inventory.json» — 1 แถวต่อ element ที่กดได้/กรอกได้:
```json
{ "page": "/deals/[id]", "testid": "deal-lost-btn", "kind": "button|link|menu|tab|toggle|drag|form",
  "roles": ["owner","manager","nok","thana"], "hiddenFor": ["thana"],
  "expect": { "type": "modal|navigate|mutation|download|toast|inline-error",
              "target": "deal-lost-modal | /deals | op:deals.move | file:csv",
              "db": "CrmDeal.kind=LOST (ตรวจด้วย query หลังกด)" },
  "wo": "C1.5", "oracle": "C4.2-deals-360-07" }
```
- ด่าน **F14.1**: `data-testid` ที่กดได้ทุกตัวใต้โฟลเดอร์ CRM ต้องมีในทะเบียน · **F14.2**: ทุกแถวในทะเบียนมี testid จริงในโค้ด (ไม่มีแถวผี) · เติมทะเบียนตั้งแต่ C1 (ด่าน D8) — C4.1 แค่ปิดช่องที่เหลือ
- แหล่งตรวจความครบ: ไฟล์ `*.body.html` ของ mockup 17 ใบ (นับปุ่ม/ลิงก์ใน mockup เทียบทะเบียน → ปุ่มใน mockup ที่ไม่มีในของจริงต้องมีเหตุผล)

**ตัวกด** «scripts/qc-crm-buttons.mts» (ต่อยอด visual-crm · puppeteer · QC server จริง):
1. ต่อบทบาท × ขนาดจอ: เปิดหน้า → สำหรับแต่ละแถว: element ต้องมองเห็น (หรือ **ไม่มี** ถ้าอยู่ใน `hiddenFor`) → กด → ตรวจ `expect` (โมดัลโผล่ / URL เปลี่ยน / คำขอ server action สำเร็จ **และ** ฐานเปลี่ยนตามที่ระบุ / ไฟล์ดาวน์โหลดมีเนื้อ / ข้อความ error ไทย inline)
2. **ตัวจับปุ่มตาย**: กดแล้วภายใน 3 วินาที ไม่มี DOM เปลี่ยน · ไม่มี navigation · ไม่มี network · ไม่มี toast = ❌
3. จับ console error · คำขอ ≥ 400 · hydration warning · overflow ทุกครั้ง
4. ทุกการกดที่เขียนฐาน ใช้ข้อมูลชั่วคราว tag `qc-btn-` และคืนสภาพ
5. ฟอร์ม (C4.3): ส่งถูก → สำเร็จ · เว้นช่องบังคับ → error inline ใต้ช่อง (ไม่ใช่ alert) · ค่ายาวเกิน/อักขระพิเศษ/`=cmd` → ไม่พัง · **กดส่ง 2 ครั้งเร็ว ๆ → ได้แถวเดียว** · ปิดโมดัลกลางทาง → ไม่มีแถวค้าง
6. เส้นทาง US1–US10 (C4.4): สคริปต์กดจริงข้ามหน้า/ข้ามบทบาท (เช่น US3: พนักงานออกใบเสนอราคา → สลับเป็น session ลูกค้า portal กดตอบรับ → กลับมาเป็นพนักงานเห็นดีลเลื่อนขั้น)

ผลลัพธ์: «.qc-shots/crm/buttons/summary.json» `{total, passed, dead[], wrongExpect[], hiddenLeak[], consoleErrors[]}` — **ต้อง passed = total** ก่อนเข้า C5

---

## 8. เฟส C5 — ล่าบั๊กและช่องโหว่

**C5.1 ความเร็ว**: «scripts/seed-crm-perf.mts» (ร้านแยก · 20,000 ดีล · 200,000 ผู้ติดต่อ · 50,000 บริษัท · 1 ล้านกิจกรรม) + ข้อสอบนับ query (prisma `$on("query")`) และเวลา p95 ตามเกณฑ์ §12 ของพิมพ์เขียว · หา N+1 · index ที่ขาด · ลบร้าน perf หลังวัด

**C5.2 นักล่า 6 เลนส์** (ตัวแทนแยก อ่านอย่างเดียว · ขนาน ≤ 3 · prompt §11.5):
| เลนส์ | ขอบเขต |
|---|---|
| L1 สิทธิ์และขอบเขต | ทุก action/op/tool/page: gate ก่อนทำงาน · `visibleWhere` ครบ · systemId/tenantId จาก session ไม่ใช่จาก client · IDOR ทุก id ที่รับเข้า · export · bulk |
| L2 เงินและตัวเลข | lines→value · paid/won · คอมมิชชัน (บางส่วน/ซ้ำ/reverse/split/ขั้นบันได) · forecast · โควตา · หน่วยสตางค์ · ปัดเศษ · Int overflow |
| L3 คิว/cron/ส่งซ้ำ/แข่งกัน | ทุก consumer/cron ตาม X3–X5 · ลำดับ event · ของแถมกับงานหลัก |
| L4 ผิวสาธารณะ | pixel · คลิก · ลิงก์ · shark.js · collect · unsubscribe · อีเมลขาเข้า · webhook ผู้ให้บริการ · portal ทั้งชุด · ฟอร์ม |
| L5 PDPA และข้อมูลรั่ว | payload/log/OpsEvent/AI prompt/DTO/RSC · consent ตอนส่ง · erase/export/purge ครบตาราง · ข้อมูลอ่อนไหวสมาชิก · ไฟล์ส่วนตัว |
| L6 UI/UX และความถูกต้องเชิงธุรกิจ | edge case §11 ของพิมพ์เขียวทุกข้อ · ข้อความ error · สถานะว่าง/โหลด/ล้ม · มือถือ · ตัวเลขบนหน้าตรงกับรายงาน |

**C5.3 ยืนยัน**: ผู้คุมงานเปิดโค้ดยืนยันทุกข้อเอง (บทเรียน "ตรวจข้อสมมติของ finding ก่อนแก้") → จัดระดับ HIGH/MEDIUM/LOW → ผู้เขียนข้อสอบเขียน «scripts/qc-crm-fix-s<n>.mts» ให้ **แดงบนโค้ดปัจจุบัน**
**C5.4 แก้**: แบ่งชุดตามไฟล์เจ้าของไม่ทับ (แบบรอบแก้สมาชิก `ledger/member-briefs/member-fix-COMMON.md`) · builder ต่อชุด · ผู้คุมงานรันซ้ำ
**C5.5 รอบสอง**: นักล่าเฉพาะ diff ของ C5.4 + สุ่ม 2 เลนส์เต็ม · เกณฑ์ออก: ไม่มี HIGH/MEDIUM ค้าง · LOW ที่ไม่แก้ลงตารางหนี้พร้อมเหตุผล

---

## 9. เฟส C6 — ขึ้น production

| ใบ | ขั้นตอน |
|---|---|
| **C6.1** | ขออนุญาตเจ้าของติดตั้ง crontab รายนาที/รายชั่วโมง/รายวันของ CRM บน VPS (แบบเดียวกับ cron บัญชี · RESOLUTIONS R-C.6) · ตรวจ `_prisma_migrations` บน prod ครบ `crm_v2_a/b/c` (`scripts/prodmig.cjs` แบบอ่านอย่างเดียว) · หน้า v1 บน prod ยังทำงาน (ค่า `uiVersion` = 1 ทุกร้าน) · ตรวจ `OpsEvent` ERROR ของ outbox 24 ชม. หลัง deploy ล่าสุด = 0 รายการใหม่จาก CRM |
| **C6.2** | backfill prod: ทุกสคริปต์ `--dry-run` ก่อน → ส่งตัวเลขให้เจ้าของทาง Telegram → เจ้าของตอบ "ทำ" → รันจริงทีละร้าน → รันซ้ำรอบสองต้องได้ 0 (idempotent) |
| **C6.3** | เปิด v2 ให้ร้านนำร่อง 1 ร้าน (เจ้าของเลือก) → ทดสอบบน prod ด้วย 5 บทบาท ตามรายการ §3 ของพิมพ์เขียวทุกหน้า (ถ่ายภาพ · ไม่เขียนข้อมูลจริงของร้าน — ใช้ผู้ติดต่อทดสอบ tag `qc-prod-` แล้วลบ) → เฝ้า 24 ชม. → เปิดร้านที่เหลือเมื่อเจ้าของสั่ง · **ทางถอย**: ตั้ง `uiVersion` กลับเป็น 1 (ข้อมูลไม่หายเพราะ additive) · ปิด consumer CRM ด้วยสวิตช์ `settings.crm.bridgesEnabled=false` |
| **C6.4** | `ledger/HANDOVER-<วันที่>-CRM.md` (ตารางใบ · บั๊กจริงที่เจอ · ORACLE-EDIT ทั้งหมด · หนี้ · เรื่องรอเจ้าของ · วิธีถอย) · ชุดหลักฐาน §10 · memory · Telegram · **หยุด รอ Fable** |

---

## 10. ชุดหลักฐานที่ต้องส่งให้ Fable ตรวจรอบสุดท้าย

1. `ledger/CRM-RUN.md` §3.1 (สถานะ+hash ทุกใบ) + §4 (ORACLE-EDIT ทุกบรรทัดพร้อมเหตุผล) + HANDOVER
2. wo-notes ครบ 53 ใบ (ตาราง X + ด่าน 12 ข้อ + `PARITY:`)
3. `git diff <hash เริ่ม RUN>..main -- scripts/qc-crm-*` — ทุก hunk ที่แก้ข้อสอบหลัง commit `test(crm):` ต้องมีบรรทัด ORACLE-EDIT คู่กัน
4. ผล `qc:all` รอบสุดท้าย (JSON_SUMMARY) + รายชื่อชุดแดงพร้อมคำอธิบาย
5. ภาพทุกหน้า 5 บทบาท 2 ขนาดจอ ใน `.qc-shots/crm/` + «buttons/summary.json» (passed = total)
6. รายงานนักล่ารอบ 1–2 + ตารางข้อค้นพบ → ข้อสอบ → commit ที่แก้
7. ผลซ้อม/ตรวจ migration บน prod + ผล backfill dry-run และจริง
8. ยืนยัน: `.env` ไม่ถูกแตะ (mtime) · ไม่มีชุดข้อสอบรันบน prod · ไม่มี EAS build

Fable จะ: สุ่มรัน 5 ชุด + กลุ่ม X ทั้งหมดบน seed ใหม่ · เปิดภาพเทียบ mockup เอง · ปล่อยนักล่าของตัวเอง 4 เลนส์ · ตรวจ prod

---

## 11. Prompt พร้อมใช้ (อังกฤษ — ประหยัด token · ผู้ทำงานตอบเจ้าของเป็นไทย)

### 11.1 Kick-off — Opus 5 controller
prompt ฉบับเต็ม (ออกแบบให้วางซ้ำเพื่อทำต่อจากที่ค้างได้) อยู่ที่ `ledger/CRM-KICKOFF-PROMPT.md` — ใช้ไฟล์นั้นเป็นหลัก

### 11.2 Oracle writer
```
You are an ORACLE WRITER for SHARK CRM v2 work order <WO>. You never edit src/. Read: ledger/CRM-MASTER-PLAN.md §2 §3 §4,
the brief ledger/crm-briefs/crm-brief-<WO>.md, the contract in ledger/CRM-RUN.md §2, the blueprint sections it cites,
and two house-style oracles: scripts/qc-crm-c1.1.mts and scripts/qc-member-fix-s2.mts (races on separate connections,
flag-first idempotency, cleanup in finally, JSON_SUMMARY). Deliver ONE file scripts/qc-crm-<wo>.mts with: functional
checks `C<wo>-S<g>.<n>` exactly as listed in the contract, plus every applicable X-group from MASTER-PLAN §4 as
`C<wo>-X<k>.<n>`. Each check asserts the FIXED/FINISHED behaviour. Before any product code exists the run must be
RED for the right reason or SKIPPED via the guard; never crash. Import modules that may not exist yet with
`await import("…" as string)`; the file must type-check under next build. Leave QC data exactly as found (temp rows
tagged `qc-<wo>-`, snapshot/restore anything seeded). Run only via `bash scripts/iso.sh bash scripts/with-gate-lock.sh
pnpm exec tsx scripts/qc-crm-<wo>.mts`, then typecheck via iso. Report: check list with today's result and what each
proves; data touched and how restored; criteria you could not test and why.
```

### 11.3 Builder
```
You are the BUILDER for SHARK CRM v2 work order <WO>. Read: ledger/CRM-MASTER-PLAN.md §2 (hard rules), the brief
ledger/crm-briefs/crm-brief-<WO>.md (scope, files you OWN, acceptance, decisions already made), the contract and
blueprint sections it cites, the mockups named in the brief (open the PNGs), and the oracle scripts/qc-crm-<wo>.mts
(read-only — if you think a check is wrong, finish everything else and explain precisely; never edit it).
Open the real code before using any name from the blueprint (REVIEW §3 lists names that differ).
Goal: oracle fully green + the regressions listed in the brief, by correct product code (never special-case test
markers). Edit only files you own; no build/commit/push; no migration outside the migration work orders; every
tsx/tsc through `bash scripts/iso.sh`, DB-mutating runs through with-gate-lock, foreground only.
Every clickable element gets a data-testid and a row in scripts/crm-ui-inventory.json. Add `// AUDIT-CLASS <Xn>:`
comments where you implement an X-group rule. Report per acceptance item: files/lines, how, DEFERRED + reason,
final summary line of each command, ORACLE-EDIT requests (check id, hunk, reason), decisions the controller must make.
```

### 11.4 Reviewer
```
Read-only review of SHARK CRM v2 work order <WO>. Inputs: `git diff <base>..HEAD` for the files in the brief,
the brief, the contract, MASTER-PLAN §2 and §4. Find: violations of the hard rules (any, cross-module imports,
"use server" non-async exports, client components importing prisma-reaching modules, PII in outbox payloads/logs,
events missing from the 3 registries, new engines duplicating existing ones), missing X-group behaviour
(read-modify-write, non-idempotent consumers, terminal-state claims, missing visibleWhere/systemId checks, unsanitised
HTML, open redirects, permanent file URLs), special-casing of test markers, behaviour that contradicts the blueprint.
Output: BLOCKER / SHOULD-FIX / NOTE, each with file:line and a concrete failing scenario. Do not restate the diff.
```

### 11.5 Hunter (phase C5 — one lens per agent)
```
Read-only hunt in /root/projects/shark-crm (CRM v2 is complete). Lens: <L1…L6 from MASTER-PLAN §8>.
Trace real code paths end to end; do not trust comments or wo-notes. For each finding: severity, file:line,
the exact attack/failure scenario with concrete inputs, why existing oracles miss it, minimal fix.
Mark each CONFIRMED (you traced it) or PLAUSIBLE. Also list what you checked and found sound.
Calibrate severity honestly: note mitigations that already exist.
```

### 11.6 โหมด Codex
ใช้ `ledger/CODEX-HANDOFF-CRM.md` เป็นกติกาโค้ด + เอกสารนี้เป็นแผน · เปิด 3 session: **A** วาง §11.1 (แทนคำว่า "spawn separate agents" ด้วย "session B เขียนข้อสอบล่วงหน้า 1 ใบเสมอ · session C ตรวจ/ล่า — สื่อสารผ่าน `ledger/wo-notes/` เท่านั้น") · **B** วาง §11.2 แล้ววนทุกใบตามลำดับ §6 · **C** วาง §11.4 ต่อใบที่ A แจ้งว่าเสร็จ และ §11.5 ในเฟส C5 · Codex ทำงานบน branch `session/crm-codex` และ **ไม่ push main** — ผู้คุมงาน Opus/Fable เป็นคน merge+deploy ทีละเฟส (ด่าน D12 ของโหมด Codex = push branch + รอ merge)

---

## 12A. แผนขนาน · จุดตรวจ · งบเวลา

```
C0.1 → C0.2 ∥ C0.4 ∥ C0.5 → C0.3 (แตก A–F ขนานได้ 3) → C1.1 → C1.2a → C1.2b → C1.3 → C1.4 → C1.5 → C1.6 → C1.7 → C1.8 → C1.9 ∥ C1.10 → C1.11 → ปิด C1
C2.0 → C2.1 → C2.2 ∥ C2.3 → C2.4 ∥ C2.5a → C2.5b → C2.6 ∥ C2.7 → C2.8 ∥ C2.9 → C2.10 → C2.11 → ปิด C2
C3.0 → C3.1 → C3.2 ∥ C3.3 → C3.4 ∥ C3.5 → C3.6 ∥ C3.7 → C3.8 → C3.9 → ปิด C3 → C4.1 → C4.2 → C4.3 ∥ C4.4 → C5.1 ∥ C5.2 → C5.3 → C5.4 → C5.5 → C6.1 → C6.2 → C6.3 → C6.4
```
กติกาไฟล์เจ้าของเมื่อขนาน: `ledger/crm-briefs/crm-brief-RESOLUTIONS.md` R-D (โฟลเดอร์ crm-bridges แยกไฟล์ต่อใบ · บล็อกทะเบียนต่อใบ) · ผู้เขียนข้อสอบทำงานล่วงหน้า 1 ใบเสมอ (เขียนข้อสอบใบถัดไประหว่าง builder ทำใบปัจจุบัน)

| จุดตรวจ | เมื่อ | ต้องส่ง Telegram ให้เจ้าของ |
|---|---|---|
| CP0 | จบ C0 | facade/ไฟล์ส่วนตัว/ตัวกระจายงาน พร้อม · คำถาม Q1–Q5 ที่ยังไม่ตอบ |
| CP1 | ปิด C1 | ภาพหน้าหลัก 6 หน้า · `qc:all` · เปิดให้เจ้าของลอง v2 บนร้าน QC |
| CP2 | ปิด C2 | วิดีโอ/ภาพเส้นทาง US1 US4 US5 US9 · สถานะ Q2/Q3 |
| CP3 | ปิด C3 | portal ด้วย session ลูกค้า · คอมมิชชัน→payroll |
| CP4 | จบ C4 | ทะเบียนปุ่ม passed = total |
| CP5 | จบ C5 | ตารางข้อค้นพบ→ข้อสอบ→commit |
| CP6 | จบ C6.1 | ขออนุมัติ backfill + ร้านนำร่อง |

งบเวลาเดินเครื่องโดยประมาณ: C0 0.5 วัน · C1 2 วัน · C2 2.5 วัน · C3 2 วัน · C4 0.5 วัน · C5 1 วัน · C6 0.5 วัน (+ รอเจ้าของ) ≈ 9 วันปฏิทิน

## 12B. คู่มือกู้สถานการณ์ (ผู้คุมงานเจอแน่ ๆ)

| อาการ | สาเหตุที่เจอจริงใน RUN สมาชิก | ทำอย่างไร |
|---|---|---|
| session ตาย/รีสตาร์ทกลางงาน | คำสั่งหนักรันใน cgroup 5 GB | อ่าน §12 + `ledger/CRM-RUN.md` §4 + `git status` → ทำต่อจากขั้นที่ค้าง · งานยาวต้องอยู่ใน unit แยกและมี log ให้ poll |
| ตัวแทนค้าง "stalled / no progress" | stream หลุด | `SendMessage` ไปที่ตัวแทนเดิม: บอกให้ดู `git diff --stat` แล้วทำต่อ — ห้ามปล่อยตัวใหม่ทับงานครึ่ง ๆ |
| ข้อสอบแดงเฉพาะตอนรันรวม | ฐาน QC ใช้ร่วม: การเชื่อมต่อหมดเวลา · drain แย่ง event · ข้อมูลชั่วคราวของชุดอื่น | รันเดี่ยวซ้ำหลัง reseed · ถ้าเขียว = จดเป็น flake พร้อมสาเหตุที่พิสูจน์ได้ · แดงซ้ำ 2 ครั้ง = บั๊กจริง ห้ามข้าม |
| จำนวนสมาชิก/ระดับใน seed เพี้ยน | ข้อสอบก่อนหน้าไม่คืนสภาพ | หาตัวการด้วยการรันทีละชุด + `qc-member-m1.9` คั่น → แก้ข้อสอบตัวนั้น (ORACLE-EDIT) |
| build ผ่านในเครื่องแต่ Vercel ล้ม | `scripts/*.mts` ถูก type-check ตอน build · import โมดูลที่ยังไม่มี | ข้อสอบล่วงหน้าต้อง `await import("…" as string)` · typecheck ก่อน push ทุกครั้ง |
| หน้า 500 ทั้งที่ build ผ่าน | `export type` ใน `"use server"` · client import ถึง prisma | ด่าน reviewer + grep ก่อน build |
| คิว outbox ตัน | event ใหม่ไม่มี consumer/ไม่ลงทะเบียน | ดู `OutboxEvent.lastError` ก่อนอย่างอื่น |
| builder รายงาน "ผ่าน" แต่รันซ้ำแดง | รันบนข้อมูลสกปรก/คนละลำดับ | ยึดผลของผู้คุมงานบน seed ใหม่เท่านั้น |
| Telegram ส่งไม่ได้ | ตัวจัดสิทธิ์ของ session บล็อก `tg` | เขียนลง «ledger/CRM-OWNER-QUESTIONS.md» + สรุปท้ายข้อความในแชท แล้วทำงานต่อ |

## 12. สถานะสด (ผู้คุมงานแก้ทุกครั้งที่ปิดใบ)

| เฟส | ใบ | สถานะ | commit | หมายเหตุ |
|---|---|---|---|---|
| C0 | C0.1 | ✅ | `b8fea3f` | เครื่องมือ QC ครบ · ข้อสอบ C1.1 26→50 ข้อ · F14.1/F14.2 · `visual-crm` · `wo-notes/crm-C0.1.md` |
| C0 | C0.2 | ✅ | `9ea28f1` | facade `crm/index.ts` (re-export ล้วน) + ด่าน F2.3 · ข้อสอบ 27/27 · ORACLE-EDIT 2 รอบ |
| C0 | C0.3 | ✅ | `a30a0a6` (+ WIP `99b99d3`) | facade 6 โมดูล (บัญชี·แชท·HR·คลัง·party·approval) · ข้อสอบ 88/88 · เจอบั๊กเงิน 1 (ส่วนลดเกินยอด) แก้แล้ว |
| C0 | C0.4 | ✅ | `55c7a07` | ไฟล์ส่วนตัว · ข้อสอบ 72/72 · 🔴 ปิดช่องโหว่ลบ/อ่านไฟล์ข้ามร้าน (ของเดิม · ใช้โจมตีได้จริง) |
| C0 | C0.5 | ✅ | `ad67892` | ตัวกระจายงานรายนาที + ตัวรัน VPS · ข้อสอบ 50/50 · แก้บั๊ก "ข้ามรอบครึ่งหนึ่งแบบเงียบ" · crontab ติดตั้งจริงใน C6.1 |
| **C0** | **ปิดเฟส** | ✅ | — | 5/5 ใบ · CP0 ส่งเจ้าของแล้ว |
| C1 | C1.1 | ✅ | `ab2b006` | migration แรก `crm_v2_a` (ลง prod ตอน push) · ทีม · partyId 9 ตาราง (ผูกหลัง commit) · backfill 6 · ข้อสอบ 50/50 |
| C1 | C1.2a | ✅ | `479fbd7` | engine ฟิลด์รับ objectKey · ทางลูกค้าเหมือนเดิมทุกไบต์ (G1 14/14) · ข้อสอบ 91/91 · ปิดทางเขียนคอลัมน์ที่มีกฎธุรกิจ (เช่นย้อน opt-out) |
| C1 | C1.2b | ✅ | `a7a7bce` | วัตถุกำหนดเอง + เทมเพลต 8 · ข้อสอบ 93/93 · ผู้ตรวจ: ชื่อเรคคอร์ดรั่วค่าอ่อนไหว · คีย์ API อ่านอย่างเดียวเขียนได้ → แก้แล้ว |
| C1 | C1.3 | ✅ | `4f8af9d` | บริษัท (รายการ · 360 · สร้าง · รวม/เก็บ/กู้คืน) · ข้อสอบ 89/89 · ผู้ตรวจ BLOCKER: บริษัทผูกตัวตนของ "คน" → แก้แล้ว · ภาพ 18 ใบ PARITY ผ่าน |
| C1 | C1.4 | ✅ | `919e7d6` | ผู้ติดต่อ + แปลง lead ในธุรกรรมเดียว + ความยินยอม · ข้อสอบ 110/110 · ผู้ตรวจ BLOCKER (PDPA: ยกเลิกรับข่าวหายตอนแปลง/รวม) → แก้ · แก้บั๊กเดิม: แจ้งเตือนสมาชิกหยุดทั้งร้านเมื่อมีสมาชิกถูกลบ |
| C1 | C1.5 | ✅ | `a7312fb` | ดีล + pipelines + ขั้น + เหตุผลแพ้ · ข้อสอบ 103/103 · ผู้ตรวจ SHOULD-FIX 12 (won ยิงซ้ำ · ใบแจ้งหนี้ซ้ำ · VAT หาย) → แก้ · 🔴 **แก้เหตุการณ์หน้า v2 หลุดถึงร้านจริง** (ประตู uiVersion) |
| C1 | C1.6 | ✅ | `9b971e3` | กิจกรรม + ปฏิทิน + โน้ต/ไฟล์/mention + การ์ดบอร์ดงาน · 79/79 · ผู้ตรวจ BLOCKER (ชื่อบอร์ดส่วนตัวรั่ว) → แก้ |
| C1 | C1.7 | ✅ | `90d3043` | สิทธิ์ 51 คีย์ + มองเห็น OWN/TEAM/ALL + ทีมขาย · 57/57 · ผู้ตรวจ BLOCKER (ลิงก์บอร์ดงานร้าน v1) → แก้ · 🔴 กติกาใหม่: ข้อสอบทุกใบต้องมีกรณีระบบ uiVersion 1 |
| C1 | C1.8 | ✅ | `526895b` | เหตุการณ์ + สะพาน (ฟอร์ม/แชท/บัญชี/สมาชิก/อนุมัติ) · 81/81 · ผู้ตรวจ: lead หาย/ซ้ำเมื่อระบบสะดุด (ร้าน v1) → แก้ให้ retry · payload ดีลชนะเหลือแต่รหัส (Q6) |
| C1 | C1.9 | ✅ | (ใบนี้) | UI วัตถุกำหนดเอง (ตั้งค่า+ตัวออกแบบฟิลด์ · สารบัญ · รายการ · เรคคอร์ด · แท็บ 360) · 45/45 · ผู้ตรวจ BLOCKER (เขียนค่าฟิลด์อ่อนไหวไม่ได้) → แก้ · ACCEPTANCE-FIX วันที่/เงินแสดงผล |
| C1 | C1.10 | ✅ | (ใบนี้) | REST 63 op + AI 14 tools + หน้าตั้งค่า API · 66/66 · ผู้ตรวจ BLOCKER (ผู้ช่วย AI เห็นค่าอ่อนไหว) → แก้ที่ engine · เครื่องมือ lead รุ่นเดิมของร้าน v1 คงเดิม |
| C1 | C1.11 | ✅ | (ใบนี้) | มือถือ 390 · แผง CRM ในแชท · เทมเพลต 16 · นำเข้า/ซ้ำ/รวม · สวิตช์ v1↔v2 (ซ่อนจากร้านจริง) · 66/66 + v1 17/17 · ผู้ตรวจไม่มี BLOCKER · **ปิดเฟส C1** (qc:all 305/345 → ที่เหลือ = ภาพที่ถูกลบ) |
| C2 | C2.0 | ✅ | (ใบนี้) | migration `crm_v2_b` (604 บรรทัด · sha `33e25d71…`) ตารางทั้งเฟส C2 + `ai_credit_crm_assist` (`CRM_ASSIST`) · scope 19 โมเดล · ป้ายช่องเครดิตไทย · additive ล้วน (ไม่มีคำสั่งที่ล้มได้กับแถว prod) · ข้อสอบ 73/73 · `wo-notes/crm-C2.0.md` |
| C2 | C2.1–C2.11 | ⏸️ | — | C2.1 เสร็จฝั่ง builder (commit local `827ecbdb`) รอรวม · C2.2/C2.3 builder กำลังทำ |
| C3 | C3.0–C3.9 | ⏸️ | — | |
| C4 | C4.1–C4.4 | ⏸️ | — | |
| C5 | C5.1–C5.5 | ⏸️ | — | |
| C6 | C6.1–C6.4 | ⏸️ | — | |

รวม 53 ใบ: C0 5 · C1 12 · C2 12 · C3 11 (รวมปิดเฟส) · C4 4 · C5 5 · C6 4 · ประมาณเวลาเดินเครื่อง 6–8 วัน (เทียบ RUN สมาชิก 34 ใบ ≈ 3 วัน + รอบแก้ 1 วัน) · migration 3 ใบ · ข้อสอบ ≈ 780 (เดิม) + ≈ 350 (กลุ่ม X) + ทะเบียนปุ่ม ≈ 600–800 แถว
