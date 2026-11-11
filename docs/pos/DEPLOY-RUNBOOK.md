# POS V2 — คู่มือขึ้น production (DEPLOY RUNBOOK)

> สถานะ: **ฉบับแก้รอบ 2 (P6.1 fix2 · 24 ต.ค. 2026)** — แก้ตามผู้ตรวจ R1 (F1–F16 + รอบ 2 R2-F1…F7 · ledger/wo-notes/pos-P6.1-prep-review.md (ทรีผู้คุม)) และมติผู้คุม CD-P61-R1…R6 · O1 · P4 · แทน `ledger/pos-briefs/pos-runbook-P6.1-DRAFT.md` (3 ต.ค. · แช่แข็งแล้ว) ตามมติ P6 §10-2.
> ฐานที่ตรวจ: branch `wip/pos-p6.1-fix1` = `session/pos` @ `5e5b0675` + งานเตรียม P6.1 (merge c91d8735) เทียบ `origin/main` @ `a84bca2b`. ทุกข้อที่อ้างโค้ด = `ไฟล์:บรรทัด` ของฐานนี้ — ตรวจซ้ำที่ SHA หัวของ PR (`qc-pos-p6.1` P1 ช่วยตรวจว่าไฟล์/บรรทัดยังมี).
> 🔴 เอกสารนี้ **ไม่อนุญาต** ให้ใครแตะ production. ทุกขั้นที่มี ⛔ = เจ้าของสั่งเอง ทีละขั้น (W32 · มติ P6 §10-1). ผู้คุมงานไม่ push `main` ไม่ deploy ไม่ต่อ prod.
> หัวข้อภาษาไทย · คำสั่งภาษาอังกฤษ (คัดลอกวางได้ทั้งบรรทัด) · ไม่มี URL/รหัสผ่านในไฟล์นี้ — URL ของ prod อยู่ในตัวแปร shell `PROD_DIRECT_URL` ที่เจ้าของพิมพ์เองตอนเริ่ม (§4.0) · ค่าที่ต้องแทนเอง: `<PR_HEAD_SHA>` (SHA เต็ม 40 ตัวของหัว PR จากหน้า GitHub) · `<tenant-id>` (id หรือ slug ของร้าน).

## 0. ขอบเขตและกติกา

- ขอบเขต: migration ของ POS V2 **37 ไฟล์** (36 ของ RUN + `20261220100000_pos_p61_hand_indexes` = index มือในรูป migration แบบ no-op · CD-P61-P4) · index มือ (CONCURRENTLY) · backfill · env · งานตั้งเวลา · พฤติกรรมที่เปลี่ยนโดยไม่มีธง (§1A) · เปิดใช้ทีละร้าน · การถอยกลับ · การตรวจหลัง deploy.
- 🔴 **ข้อเท็จจริงที่บังคับลำดับ (R1 F1 · CD-P61-R1)**: `vercel.json` ตั้ง `"buildCommand": "bash scripts/vercel-build.sh"` และ `scripts/vercel-build.sh:21-25` รัน `pnpm exec prisma migrate deploy` แล้ว `pnpm exec prisma migrate status` ทุกครั้งที่ build ด้วย `VERCEL_ENV=production` **ก่อน** `tsc`/`next build` (เพิ่มหลังแชทดับ 1 ก.ย. 2026 · commit 8c9a2a68) · `prisma.config.ts` ให้ migrate ใช้ `DIRECT_URL` ของ Vercel.
  ⇒ **กด merge = Vercel migrate ทุกไฟล์ที่ยังค้างเองทันที** — ไม่มี pre-flight §3.4 · ไม่มีกลยุทธ์ index §3.2 · ไม่มีจุดย้อน Neon · ไม่มี `lock_timeout` · และถ้าไฟล์ใดล้ม `_prisma_migrations` ค้างสถานะ P3009 ⇒ build production **ทุกครั้งหลังจากนั้น** (รวม hotfix อื่น) แดงจนกว่าจะมีคน resolve (§4.4).
- **ลำดับใหญ่ (CD-P61-R1 · แทนลำดับ "merge ก่อน migrate" ของฉบับเตรียม)**:
  1. ⛔ GO-1 ตั้ง env บน Vercel production: `POS_DEVICE_KEY` (+ `POS_CREDENTIALS_KEY` ถ้ายังไม่ตั้ง) — **ก่อนขั้น 2** (CD-P61-R2 · §6).
  2. ⛔ GO-5…GO-9 เจ้าของรัน `prisma migrate deploy` **จาก VPS · worktree สะอาดที่ `<PR_HEAD_SHA>`** (F10 · §4.0) ผ่าน direct URL ที่มี `lock_timeout` 5s ใน URL (§3.3) — หลัง pre-flight §3.4 + `verify-prod-pos.mts --counts` + จุดย้อน Neon + เลือกทางของ index ตาม §3.2.
  3. ⛔ GO-10 **ด่านแข็ง**: `prisma migrate status` ต้องพิมพ์ `Database schema is up to date` และ `verify-prod-pos.mts` ข้อ M1 M2 T1 C1 E1 I1 เขียว — ไม่เขียว **ห้าม merge**.
  3b. ⛔ GO-11b ถ้า K2 > 0 (ระบบที่ `registerV2 = true` อยู่แล้ว · §1A ข้อ f): backfill §8.1–8.5 ของร้านเหล่านั้น **ก่อน merge** (หรือปิดธงก่อน — เจ้าของเลือก).
  4. ⛔ GO-12 ด่านแช่แข็ง `verify-prod-pos.mts --pr-freeze <PR_HEAD_SHA> --main-at "$MAIN_AT_GO10"` FAIL 0 (R2-F1) → merge PR → Vercel รัน `scripts/vercel-build.sh` → `migrate deploy` ต้องพิมพ์ `No pending migrations to apply.` → `migrate status` → `tsc` → build → promote อัตโนมัติ (§4.3).
  5. ⛔ GO-13…GO-15 หลัง merge: เลื่อน checkout ของ crontab บน VPS ให้ตาม main (§7 · CD-P61-R6) · index partial `one_open_session_per_table` (§5.2) · จับคู่เบราว์เซอร์ทุกเครื่องขายก่อนขายบิลแรก (§9 · CD-P61-R2).
  6. ⛔ GO-16…GO-19 backfill (§8: catalog → `--verify` = 0 → `backfillWebPrices` → ข้อมูล P1.9) — ทุกตัว `--dry-run` ก่อน.
  7. ⛔ GO-21 เปิดธงทีละร้าน (§9).
- **ทำไม migrate ก่อน merge ปลอดภัย**: ทั้ง 37 ไฟล์เพิ่มอย่างเดียว (§2) ⇒ โค้ด `main` เดิมรันบน schema ใหม่ได้ — กติกาเดียวกับ `scripts/vercel-build.sh:12-14` (ระหว่าง build ของ Vercel โค้ดเก่าก็เสิร์ฟบน DB ที่ migrate แล้วอยู่ดี) · Prisma client ของ main ระบุคอลัมน์ของตัวเองทุกครั้ง ไม่อ่านคอลัมน์/ตารางที่ไม่รู้จัก.
- **ทำไมขั้น 3 ต้องเขียวก่อน merge**: ถ้ายังมีไฟล์ค้าง ตอน merge Vercel จะ migrate เองโดยไม่มีด่านใดข้างบน และไฟล์ที่ล้มขวาง build production ทุกครั้งถัดไป.
- ถอยกลับ = **ปิดธง/สวิตช์ของร้าน** (§9) · SQL ถอยกลับ (ภาคผนวก ก) เฉพาะไฟล์ที่ **ล้มกลางทาง** (มติ P6 §10-5) · promote build เก่าบน Vercel ได้ **เฉพาะก่อนเขียนข้อมูล V2 ครั้งแรก** (F8 · §9).
- `prisma migrate deploy` ผ่าน **direct URL เท่านั้น** (ห้าม `-pooler`: `SET` ระดับ session รั่วข้าม client บน PgBouncer).
- ห้ามรันชุดข้อสอบกับ prod · ห้ามแก้ `.env` · ไม่มี EAS · ไม่มี reseed (กติกา P6 §8).
- คำสั่ง node ทุกตัวบน VPS ผ่าน `scripts/iso.sh` (cgroup ของเซสชัน 5G) · `iso.sh` ไม่ส่ง env ของผู้เรียก ⇒ ตั้งตัวแปรด้วย `env A=… B=…` **หลัง** `iso.sh` · URL ส่งผ่านตัวแปร shell (`"$PROD_DIRECT_URL"` · `"$PROD_MIGRATE_URL"`) ที่ตั้งด้วย `read -rs` (ไม่ลงประวัติ shell) — ค่าจะโผล่ในบรรทัดคำสั่งของ unit systemd ชั่วคราวระหว่างรัน (เครื่อง VPS root คนเดียว · ยอมรับ).
- สคริปต์เขียน prod ทุกตัว (§8) ใช้ด่านเดียว `scripts/lib/pos-prod-writer-guard.mts` (CD-P61-R3): URL ต้องส่งมาเอง (ไม่โหลด `.env` ใด ๆ) · host ต้องอยู่ใน allowlist · prod ต้อง `ALLOW_PROD_BACKFILL=1` + `--tenant`/`--all` + `--dry-run` ก่อน (24 ชม.) · พิมพ์ `[target] … role=prod host=<ป้าย>…` ให้เจ้าของเห็นก่อนตอบ "ทำ".
- เวลาในบันทึก = `date -u` · ทุกขั้นจดลง ledger/wo-notes/pos-P6.1.md (สร้างตอนซ้อม) พร้อม `JSON_SUMMARY` ของแต่ละคำสั่ง.
- สัญลักษณ์: **⛔ GO-n** = จุดที่เจ้าของต้องสั่งเองทีละขั้น (รายการเรียงลำดับ §11) · **⚠️ สมมติฐาน** = ยังไม่พิสูจน์บน prod — ต้องพิสูจน์ตอนซ้อม W31 (§4.5) ก่อนใช้กับ prod.

## 1. เงื่อนไขก่อนเริ่ม (ตรวจกับโค้ดวันนี้)

| # | เงื่อนไข / รายการ merge checklist | วันนี้ (fix1) | ยังต้องทำไหม | หลักฐาน |
|---|---|---|---|---|
| 1.1 | CRM อยู่บน `main` ก่อน · migration POS เรียงหลังของ main ทั้งหมด | ✅ main มี `20261101000000_crm_v2_b` · `20261102000000_crm_v2_c` · ล่าสุด `20261104000003_account_journal_no_alloc_lock_v2` · POS 37 ไฟล์ เริ่ม `20261120000000_pos_v2_a` จบ `20261220100000_pos_p61_hand_indexes` | ตรวจซ้ำที่ `<PR_HEAD_SHA>` (คำสั่งข้างล่าง) | `git ls-tree origin/main prisma/migrations/` |
| 1.2 | hotfix RC อยู่บน main (`hotfix/inventory-atomic` · `hotfix/pos-page-authz` · `rc/hotfixes-2026-10-01`) | ✅ ทั้ง 3 เป็น ancestor ของ `origin/main` | ไม่ใช่ตัวบล็อกแล้ว — ตรวจซ้ำด้วยคำสั่งข้างล่าง | `git merge-base --is-ancestor` |
| 1.3 | `checkCatalogWrite` ≡ `posCanSetTenantPrice` (กติกาเดียว) | อยู่ในทรีเดียวกันแล้ว: `src/lib/modules/pos/catalog.ts:322` (ตัวตัดสินรายแถวทุก action) · `src/lib/modules/pos/access.ts:69` (ราคาทุกสาขา = ทุกสาขาที่ผูกต้องมี `pos.product.setPrice`) | **ยังใช้** — ผู้ตรวจ R1 ยืนยันว่ากรณีราคาทุกสาขาให้ผลเท่ากัน (ใช้ที่ `src/lib/actions/pos.ts:536` · `src/app/app/sys/[id]/pos/products/page.tsx:48`) | catalog.ts:307 หมายเหตุ "ต้องตรงกันตอน merge" (อ้างบรรทัดใหม่ตาม R1 F14) |
| 1.4 | ~~`qc-prisma.sh` รู้จัก `ep-frosty-lab`~~ | ตัดแล้ว | **ไม่ต้องทำ — ตัดแล้ว** (CD-P61-P7 · มติ addendum 2 P7: prod ไม่ใช้ `qc-prisma.sh` · POS ใช้ `scripts/qc4.sh:12-13`) | scripts/qc-prisma.sh:29-32 |
| 1.5 | `catalog-legacy.ts` อยู่ใน `SYSTEM_MARKER_ALLOWLIST` | ✅ `scripts/fitness-pos.mts:1062-1068` | ไม่ต้องทำแล้ว (fitness-pos ตรวจทุกด่าน) | fitness-pos.mts:1072 (อ้างบรรทัดใหม่ตาม R1 F14) |
| 1.6 | `registerCatalog` ใช้กติกาความพร้อมขายเดียวกับ `listForUnit` | ✅ `src/lib/modules/pos/register.ts:407` · `:775` · `:851` | ไม่ต้องทำแล้ว (`qc-pos-p1.3` ตรวจ) | register.ts:998 |
| 1.7 | สัญญา `createSale` (`--update-pos-contract`) | snapshot `scripts/pos-sale-contract.json` · ตัวสร้าง `scripts/fitness-pos.mts:510` | **ยังใช้** — รัน `fitness-pos` ที่ `<PR_HEAD_SHA>` ต้องเขียว (ห้ามเขียนทับ snapshot ถ้าไม่จำเป็น) | fitness-pos.mts:4 |
| 1.8 | dependency ใหม่ `@zxing/browser` | ส่วนต่าง `package.json` เทียบ main มีบรรทัดเดียว + `pnpm-lock.yaml` | **ยังใช้** — ตอน merge เอา `package.json` ทั้งสองฝั่งแล้ว `pnpm install` (ห้ามแก้ lockfile ด้วยมือ) · `@zxing/library` ประกาศ engines node ≥ 24 แต่ **VPS นี้ใช้ node v20.20.2 + pnpm 10.33.0** (`bash scripts/iso.sh node --version` · `pnpm --version` 24 ต.ค. — รุ่นที่ใช้รันทุกคำสั่งของ fix1/fix2) · ไม่มี engine-strict ⇒ `pnpm install --frozen-lockfile` แค่เตือน (เลนทุกทรีติดตั้งได้) · ไลบรารีใช้ในเบราว์เซอร์เท่านั้น · node ของ build = ค่าในตั้งค่าโปรเจกต์ Vercel (R2-F3) | `git diff --stat origin/main HEAD -- package.json pnpm-lock.yaml` |
| 1.9 | Prisma ที่ใช้ deploy = 7.8 (โหมด tx ของไฟล์ขึ้นกับรุ่นนี้ — §2) | `package.json:105` · `:125` = `^7.8.0` | **ยังใช้** — `pnpm exec prisma --version` ใน worktree deploy (§4.0) | |
| 1.10 | ชุดข้อสอบเต็มบน Neon branch ส่วนตัว (ไม่ใช่ QC4) | ยังไม่ทำ | **ยังใช้** — ซ้อมตาม §4.5 (W31) | P6 brief §5 |
| 1.11 | `qc-account-api-*` ×5 (เลน acc-v2) เขียว · `qc-account-api-settings` ข้าม (P3.12 F23) | อยู่ใน `scripts/pos-gates.json` แล้ว | **ยังใช้** — ผลด่านเต็มที่ `<PR_HEAD_SHA>` | HANDOVER-2026-10-16-POS-P2.md:219 |
| 1.12 | PR ของ `session/pos` → `main` พร้อม (ข้อความ PR) | ยังไม่มี ledger/pos-briefs/pos-PR-main.md (ผู้คุมเขียนหลัง P3.12/P4/P5 ปิด — P6 §10 addendum) | **ยังใช้** — PR body ต้องมีลำดับ deploy ของ §0 + นโยบายถอยกลับ forward-fix ของ §9 | qc-pos-p6.1 R1 · R3 |
| 1.13 | **W40** `POS_DEVICE_KEY` ตั้งบน Vercel production | ยังไม่ตั้ง (ของใหม่ · `src/lib/env.ts:27` · `src/lib/modules/pos/device-cookie.ts:15`) | **ยังใช้** — ⛔ GO-1 **ก่อน migrate** (CD-P61-R2 · §6) | POS-OWNER-PENDING W40 |
| 1.14 | **W33** นับแถว prod แบบอ่านอย่างเดียว (`verify-prod-pos.mts --counts`) | สคริปต์พร้อม (fix1) | **ยังใช้** — ⛔ GO-6 ในหน้าต่าง deploy → เลือกทาง §3.2 | POS-OWNER-PENDING W33 |
| 1.15 | **W34** crontab นาที/ชั่วโมงของ CRM/POS บน VPS | crontab มี 3 บรรทัด `crm-cron.mts` (minute/hourly/daily) ชี้ `/root/projects/shark-in-th` · checkout นั้นตามหลัง `origin/main` 43 commit และไม่มีงาน `pos.*` (ตรวจ 24 ต.ค. ด้วย `verify-prod-pos.mts --crons`) | **ยังใช้** — ⛔ GO-13 หลัง merge เลื่อน checkout (§7 · CD-P61-R6) | POS-OWNER-PENDING W34 |
| 1.16 | **W37** แอ็กชันคลัง (`inventory/actions.ts`) เขียนแถวแคตตาล็อก POS ทุกสาขาโดยไม่ผ่านด่านแถวของ POS | ค่าเริ่มต้นยังไม่ได้ทำในโค้ด (accepted-pending-owner · 8d5312da) | **ยังใช้** — ⛔ GO-4 เจ้าของตอบหรือรับค่าเริ่มต้น **ก่อน merge** (ส่งไปพร้อม merge) | POS-OWNER-PENDING W37 |
| 1.17 | **W38** `updatePosStaffCommission` (เขียนอัตราค่าคอมฯ) อยู่หลังคีย์อ่าน `hr.payroll.read` | ยังเป็นแบบเดิม (`src/lib/modules/pos/settings-general.ts:613` `canViewPayroll`) | **ยังใช้** — ⛔ GO-4 ตอบหรือรับ (ส่งไปพร้อม merge) | POS-OWNER-PENDING W38 |
| 1.18 | **W39 · W41** นโยบายมัดจำโมดูล (ริบเมื่อ NO_SHOW · วิธีจ่ายปริยาย TRANSFER) | ค่าเริ่มต้นอยู่ในโค้ดแล้ว (§1A ข้อ b) | **ยังใช้** — ⛔ GO-4 ตอบหรือรับค่าเริ่มต้น | POS-OWNER-PENDING W39 · W41 |
| 1.19 | **W19** ระยะเก็บสลิปโอน (5 ปี vs PDPA) | ค่าเริ่มต้น 1,825 วัน (`pos.slip.purge`) | **ยังใช้** — ⛔ GO-4 ตอบหรือรับก่อนเปิดตรวจสลิปร้านแรก | POS-OWNER-PENDING W19 |
| 1.20 | พฤติกรรมที่เปลี่ยนตอน deploy โดยไม่มีธง (§1A ข้อ a–e) | รายการ + คิวรีหาร้านที่โดนพร้อมแล้ว | **ยังใช้** — ⛔ GO-3 เจ้าของรับทราบทีละข้อก่อน merge | CD-P61-R4 |
| 1.21 | `lock_timeout` ผ่าน URL ใช้ได้จริงกับ Neon proxy + Prisma 7.8 | ✅ พิสูจน์บน QC4 (24 ต.ค. · §3.3) | **ยังใช้** — พิสูจน์ซ้ำบน branch ซ้อมและบน prod ก่อน deploy (อ่านอย่างเดียว · §3.3) | CD-P61-P2 |

```bash
# 1.1 — migration ที่ไม่อยู่บน main ต้องเป็น *_pos_* ทั้งหมด (37 บรรทัด) และเรียงหลังตัวสุดท้ายของ main
git -C /root/projects/shark-pos fetch origin
comm -13 <(git -C /root/projects/shark-pos ls-tree --name-only origin/main prisma/migrations/ | sort) \
         <(git -C /root/projects/shark-pos ls-tree --name-only <PR_HEAD_SHA> prisma/migrations/ | sort)
git -C /root/projects/shark-pos ls-tree --name-only origin/main prisma/migrations/ | sort | grep -v migration_lock | tail -1
# 1.2 — hotfix ต้องเป็น ancestor ของ main (พิมพ์ ok ครบ 3 บรรทัด)
for b in hotfix/inventory-atomic hotfix/pos-page-authz rc/hotfixes-2026-10-01; do git -C /root/projects/shark-pos merge-base --is-ancestor origin/$b origin/main && echo "$b ok"; done
```

## 1A. พฤติกรรมที่เปลี่ยนตอน deploy แม้ธง POS ปิดทุกตัว (CD-P61-R4 · R1 F4 · ข้อ f = R2-F2)

ประโยค "ธงทุกตัวปิด ⇒ prod ไม่เปลี่ยนตอน deploy" ของฉบับเตรียม **ไม่จริง** — 6 เรื่องนี้มีผลกับทุกร้านทันทีที่โค้ดใหม่ขึ้น (หลัง merge · ขั้น 4 ของ §0) ไม่ขึ้นกับ `registerV2` หรือธงใด. เจ้าของรันคิวรีหาร้านที่โดน (อ่านอย่างเดียว) แล้วรับทราบทีละข้อ (⛔ GO-3) ก่อน merge. ตัวเลขรวมดูเร็วได้จาก `verify-prod-pos.mts --counts` ข้อ K3 (§3.4).

| ข้อ | อะไรเปลี่ยน (ไฟล์:บรรทัด · commit) | ใครโดน (คิวรีข้างล่าง) | ⛔ เจ้าของรับทราบ | ลิงก์ |
|---|---|---|---|---|
| a | **ประตูเดิมของร้านอาหารปิดบนสาขาที่ผูก POS active** — ตัวตัดสิน = `AppSystemUnit` type POS + `AppSystem` active (`src/lib/modules/pos/legacy-door.ts:20-36`) ไม่ดู `registerV2`: route ของแขกตอบ 409 `POS_LINKED` + ส่งไปประตูใหม่ `/q/t/<qrToken>` · หน้าเดิมของพนักงาน redirect ไปหน้า POS · action เงิน/ครัวเดิม (เช็คบิล · ยืนยันพร้อมเพย์ · ยกเลิกรายการ · รวมโต๊ะ · เดิน/ดึงกลับครัว) ถูกปฏิเสธ (P2.14) · **ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม 15 ตัว redirect `?err=POS_LINKED`** (P5.2 D11 · abbd7d1a · `src/lib/actions/restaurant.ts:28`) | คิวรี (a) — สาขาร้านอาหารที่ผูก POS active + จำนวนโต๊ะ/ออเดอร์ 30 วัน | ⛔ GO-3a รับทราบ หรือก่อน merge ให้ร้านนั้นเลิกผูก POS / วางแผนเปิด `registerV2` (หน้าโต๊ะ/ครัวใหม่) · QR โต๊ะเดิมไม่ได้หมุน (W27) | P2.14 มติ 1 · W27 |
| b | **มัดจำโมดูล (booking · hotel · rental) กลายเป็นใบรับ POS_DEPOSIT** — `src/lib/modules/pos/deposit.ts:609` (`moduleTakeDeposit`) · `:703` (`moduleRefundDeposit`) · 61453bf2 · e3b5b815 · 161ca81b · 12ef86f4: บัญชีรับมัดจำ = Cr 2110 หนี้สิน (ไม่ใช่รายได้) · บิลปิดจ่าย DEPOSIT(อ้างใบรับ) + ส่วนที่เหลือ · ใบรับลงวิธีจ่ายจริง ปริยาย TRANSFER (W41) · booking NO_SHOW ริบมัดจำ OPEN อัตโนมัติ = บิล "มัดจำริบ — ไม่มาตามนัด" (W39 ค่าเริ่มต้น) · ยกเลิก = คง OPEN ให้คนตัดสิน · มัดจำที่รับก่อน deploy คงทางเดิม (void) | คิวรี (b) — มัดจำที่รับแล้วยังเปิดอยู่ต่อโมดูล + ร้านที่ตั้งเก็บมัดจำ | ⛔ GO-3b รับทราบ + ตอบ/รับค่าเริ่มต้น W39 · W41 | W39 · W41 |
| c | **คีย์ REST กลาง (scope ว่าง ไม่ผูกระบบ) เรียกเครื่องมือ AI ของ POS ไม่ได้** — `/api/v1/ai/tools/<เครื่องมือ POS>` ตอบ 403 `pos_scope_required` และ `/skills/sales` ไม่แสดงเครื่องมือ POS (`src/app/api/v1/ai/general-key-gate.ts:41` · f87cc9c5 · e4f14951) | คิวรี (c) — คีย์กลางที่ยังใช้ได้ + ใช้ล่าสุด | ⛔ GO-3c รับทราบ + แจ้งผู้เชื่อมต่อให้ออกคีย์ที่มี scope `pos.*` | CD-P52-O3-1 |
| d | **บัญชีเครดิต (เขียน) และสมุดทิป (อ่าน) = OWNER หรือ MANAGER ที่ `unitAccess` = `"*"` ตรงตัวเท่านั้น** — `src/lib/modules/pos/credit.ts:93` · `src/lib/modules/pos/tip-ledger.ts:12` (549c0964) · ผู้จัดการที่ระบุครบทุกสาขาแบบรายชื่อก็ถูกปฏิเสธ · เป็นฟีเจอร์ใหม่ (ไม่มีข้อมูลเดิมบน prod) | คิวรี (d) — MANAGER ที่ไม่ใช่ `"*"` ในร้านที่มี POS | ⛔ GO-3d รับทราบ (ถ้าผู้จัดการต้องใช้ ให้ตั้ง `"*"` ในหน้าสมาชิกทีม) · รวมในการทบทวนสิทธิ์ §9 | CD-P52-O4 F5 |
| e | **ผูกเครื่องขายจากคุกกี้ลงนามเท่านั้น** ทั้งขาย · คืนเงิน · เงินสดเข้าออก · กะ · ซิงก์ออฟไลน์ · snapshot (c81988ad · b4c05ec9 · 1ab99b10 · 0de07d33 · 14fd873c · c27ea9cc) — `src/lib/modules/pos/device-request.ts:4`: ไม่มีคุกกี้ + สาขามีเครื่อง ACTIVE ≥ 1 = `DEVICE_NOT_PAIRED` (409 ที่ `src/app/api/pos/sync/route.ts:67`) · ไม่มีคุกกี้ + สาขาไม่มีเครื่องเลย = ทางเดิมแบบไม่มีเครื่อง · จับคู่ต้องมี `POS_DEVICE_KEY` (`src/lib/modules/pos/device-cookie.ts:47` `DEVICE_KEY_UNSET`) · หน้ากะอ่านเครื่องจากคุกกี้เท่านั้น ⇒ ไม่มีกุญแจ = เปิดกะจากหน้ากะไม่ได้ · ปิดกะไม่มีคุกกี้ได้เฉพาะผู้มี `pos.shift.manage` + audit `pos.shift.close.override` (`src/lib/modules/pos/device.ts:392`) · ตอน deploy ตาราง PosDevice ว่าง ⇒ ทุกสาขาอยู่ทางไม่มีเครื่อง จนกว่าจะลงทะเบียนเครื่องแรก | คิวรี (e) — **หลัง migrate** (ตารางใหม่): สาขาที่มีเครื่อง ACTIVE | ⛔ GO-3e รับทราบ + GO-1 (กุญแจ) + GO-15 (จับคู่ทุกเครื่องก่อนบิลแรก) | W40 · CD-P61-R2 |
| f | **ระบบ POS ที่ `registerV2 = true` อยู่แล้วได้หน้าขาย V2 ทันทีที่ merge** (R2-F2) — หน้าขาย V2 อ่าน `PosProduct` (`src/lib/modules/pos/register.ts:829`) ซึ่งว่างจนกว่า backfill §8.1 จะรัน · และ `shift.required.register` ไม่ตั้ง = บังคับเปิดกะ (`src/lib/modules/pos/shift.ts:48-55`) จนกว่า §8.5 · ถ้า backfill ทำหลัง merge ตามลำดับปกติ ร้านนั้นขายไม่ได้ตลอดรอบ dry-run → TG → "ทำ" (หลายชั่วโมงได้) | คิวรี (f) — ระบบที่ `registerV2 = true` (= K2 ของ `--counts`) · QC4 = 2 · prod รู้ที่ GO-6 | ⛔ GO-3f เลือกทาง (ถ้า K2 > 0): **(1) ค่าแนะนำ** ทำ §8.1–8.5 เฉพาะร้านเหล่านั้น **ระหว่าง GO-10 กับ GO-12** (GO-11b · เขียนแค่ตารางใหม่ · คอลัมน์เชื่อม `posProductId` · คีย์ settings ที่โค้ด main ไม่อ่าน) แล้วรัน `--verify` ซ้ำหลัง GO-12 (การแก้ของเดิมระหว่างนั้นทิ้ง drift ได้) · **(2)** ปิด `registerV2` ของระบบเหล่านั้นก่อน merge (SQL ข้างล่าง · ⛔ เขียน) แล้วเปิดคืนหลัง backfill · ทางที่เลือกต้องซ้อมใน W31 | R2-F2 · P1.9 |

ส่งไปพร้อม merge ด้วย (ไม่ใช่พฤติกรรมของประตู แต่เจ้าของต้องรับ — §1 แถว 1.16–1.19): **W37** (แอ็กชันคลังเขียนแถวแคตตาล็อก POS ทุกสาขาโดยไม่ผ่านด่านแถว) · **W38** (อัตราค่าคอมฯ หลังคีย์อ่าน `hr.payroll.read`) · **W39/W41** (มัดจำ — ข้อ b) · **W19** (เก็บสลิป) · **W40** (กุญแจเครื่อง — ข้อ e).

```bash
# ⛔ GO-3 · อ่านอย่างเดียว (BEGIN READ ONLY … ROLLBACK) · ต้องตั้ง PROD_DIRECT_URL ตาม §4.0 ก่อน · ผลวางใน ledger/wo-notes/pos-P6.1.md
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
-- (a) สาขาร้านอาหารที่ผูก POS active (ประตูเดิมปิดตอน deploy)
SELECT t.slug AS tenant, bu.slug AS unit, bu.type::text AS unit_type,
       (SELECT count(*) FROM "RestaurantTable" rt WHERE rt."unitId" = bu.id) AS tables,
       (SELECT count(*) FROM "RestaurantOrder" ro WHERE ro."unitId" = bu.id AND ro."createdAt" > now() - interval '30 days') AS orders_30d
  FROM "AppSystemUnit" su
  JOIN "AppSystem" ps ON ps.id = su."systemId" AND ps.type = 'POS' AND ps.active
  JOIN "BusinessUnit" bu ON bu.id = su."unitId"
  JOIN "Tenant" t ON t.id = bu."tenantId"
 WHERE su.type = 'POS'
   AND (bu.type = 'RESTAURANT' OR EXISTS (SELECT 1 FROM "RestaurantSetting" rs WHERE rs."unitId" = bu.id) OR EXISTS (SELECT 1 FROM "RestaurantTable" rt WHERE rt."unitId" = bu.id))
 ORDER BY 1, 2;
-- (b) มัดจำโมดูลที่รับแล้วและยังเปิดอยู่ (ทางเดิม void คงไว้) + ร้านที่ตั้งเก็บมัดจำ (มัดจำใหม่หลัง deploy = ใบรับ POS_DEPOSIT)
SELECT 'booking' AS module, t.slug AS tenant, count(*) AS open_paid_deposits FROM "Appointment" a JOIN "Tenant" t ON t.id = a."tenantId" WHERE a."depositPaidAt" IS NOT NULL AND a.status::text IN ('PENDING','CONFIRMED','ARRIVED') GROUP BY 1, 2
UNION ALL SELECT 'hotel', t.slug, count(*) FROM "HotelReservation" h JOIN "Tenant" t ON t.id = h."tenantId" WHERE h."depositPaidAt" IS NOT NULL AND h.status::text IN ('BOOKED','CHECKED_IN') GROUP BY 1, 2
UNION ALL SELECT 'rental', t.slug, count(*) FROM "RentalBooking" r JOIN "Tenant" t ON t.id = r."tenantId" WHERE r."depositPaidAt" IS NOT NULL AND r.status::text IN ('BOOKED','PICKED_UP') GROUP BY 1, 2
 ORDER BY 1, 2;
SELECT DISTINCT t.slug AS tenant_taking_deposits FROM (SELECT "tenantId" FROM "BookingService" WHERE "depositSatang" > 0 UNION SELECT "tenantId" FROM "HotelRoomType" WHERE "depositSatang" > 0 UNION SELECT "tenantId" FROM "RentalAsset" WHERE "depositSatang" > 0) x JOIN "Tenant" t ON t.id = x."tenantId" ORDER BY 1;
-- (c) คีย์ API กลาง (scope ว่าง ไม่ผูกระบบ) ที่ยังใช้ได้ — เครื่องมือ AI ของ POS จะตอบ 403 pos_scope_required
SELECT t.slug AS tenant, k.name AS key_name, k."lastUsedAt" FROM "ApiKey" k JOIN "Tenant" t ON t.id = k."tenantId" WHERE k."revokedAt" IS NULL AND (k."expiresAt" IS NULL OR k."expiresAt" > now()) AND k."systemId" IS NULL AND k."scopesJson" = '[]'::jsonb ORDER BY k."lastUsedAt" DESC NULLS LAST;
-- (d) MANAGER ที่ไม่ใช่ "*" ในร้านที่มี POS active — ใช้บัญชีเครดิต/สมุดทิปไม่ได้
SELECT t.slug AS tenant, count(*) AS managers_not_star FROM "Membership" m JOIN "Tenant" t ON t.id = m."tenantId" WHERE m.role::text = 'MANAGER' AND m."acceptedAt" IS NOT NULL AND NOT (m."unitAccess" @> '["*"]'::jsonb) AND EXISTS (SELECT 1 FROM "AppSystem" s WHERE s."tenantId" = m."tenantId" AND s.type = 'POS' AND s.active) GROUP BY 1 ORDER BY 1;
-- (f) ระบบ POS ที่ registerV2 = true อยู่แล้ว (= K2) — ได้หน้าขาย V2 ทันทีที่ merge ⇒ ทาง GO-3f
SELECT t.slug AS tenant, t.id AS tenant_id, s.id AS system_id, s.name, s.active FROM "AppSystem" s JOIN "Tenant" t ON t.id = s."tenantId" WHERE s.type = 'POS' AND (s."settings"->'pos'->'registerV2') = 'true'::jsonb ORDER BY 1, 3;
ROLLBACK;
SQL
# ⛔ GO-15 (หลัง migrate · ก่อนจับคู่) — (e) สาขาที่มีเครื่อง ACTIVE (ตาราง PosDevice เป็นของใหม่ — ก่อน migrate คิวรีนี้ error "relation does not exist" = 0 เครื่อง)
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SELECT t.slug AS tenant, bu.slug AS unit, count(*) AS active_devices FROM "PosDevice" d JOIN "BusinessUnit" bu ON bu.id = d."unitId" JOIN "Tenant" t ON t.id = d."tenantId" WHERE d.status::text = 'ACTIVE' GROUP BY 1, 2 ORDER BY 1, 2;
ROLLBACK;
SQL
```
คิวรีทุกตัวข้างบนรันผ่านบน QC4 แล้ว (24 ต.ค. · อ่านอย่างเดียว · ไม่มี error) — prod ใช้ schema ของ main ซึ่งมีทุกคอลัมน์ที่คิวรี (a)–(d) · (f) อ้าง.

ทาง (2) ของข้อ f (เฉพาะเมื่อเจ้าของเลือก · เขียน prod ตรง ไม่มี AuditLog ⇒ จดลงบันทึกเอง · แทน `<system-id>` ด้วย id จากคิวรี (f)):
```bash
# ⛔ GO-3f-2 · ปิด registerV2 ก่อน merge — ผลต้องเป็น UPDATE <จำนวนระบบที่ใส่> · ไม่ตรง = พิมพ์ ROLLBACK; แทน COMMIT;
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE "AppSystem" SET "settings" = jsonb_set("settings", '{pos,registerV2}', 'false'::jsonb), "updatedAt" = now() WHERE type = 'POS' AND id IN ('<system-id>') AND ("settings"->'pos'->'registerV2') = 'true'::jsonb;
COMMIT;
SQL
# ⛔ GO-3f-2 (คืน · หลัง §8.1–8.5 ของร้านนั้นครบและ --verify = 0) — คำสั่งเดียวกันแต่ 'true' และเงื่อนไข = 'false'
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE "AppSystem" SET "settings" = jsonb_set("settings", '{pos,registerV2}', 'true'::jsonb), "updatedAt" = now() WHERE type = 'POS' AND id IN ('<system-id>') AND ("settings"->'pos'->'registerV2') = 'false'::jsonb;
COMMIT;
SQL
```

## 2. รายการ migration ของ POS (ลำดับ timestamp ตามที่ commit · 37 ไฟล์)

คำอธิบายคอลัมน์:
- **tx**: `DO` = ไฟล์มี `DO $$` ⇒ Prisma 7.8 ส่งทั้งไฟล์เป็น transaction เดียว (atomic · ล็อกที่ได้ถือจนจบไฟล์) · `stmt` = ไม่มี `DO` ⇒ ทีละคำสั่ง ทีละ transaction (ไม่ atomic · ล็อกสั้นต่อคำสั่ง · `SET LOCAL` ไม่มีผล ไฟล์จึงใช้ `SET lock_timeout` ระดับ session + `RESET` ท้ายไฟล์).
- **lock_timeout**: ค่าที่ไฟล์ตั้งเอง · `ไม่มี ⚠️` = ไฟล์ไม่ตั้ง (ได้ 5s จาก URL ของ deploy — §3.3).
- **ชั้นล็อก**: `L0` = สร้างของใหม่ล้วน (ไม่แตะตารางเดิม · ทันที) · `L1` = เปลี่ยน metadata ของตารางเดิม (ADD COLUMN ว่างได้ / ค่าคงที่ DEFAULT บน PG ≥ 11 · ADD VALUE ของ enum เดิม) — ACCESS EXCLUSIVE ระดับมิลลิวินาที แต่ต่อคิวหลัง transaction ยาว · `L2` = สร้าง index บนตารางเดิมในไฟล์ (SHARE lock บล็อกการเขียนตลอดเวลาสแกน ∝ จำนวนแถว) · `-TX` = อยู่ในไฟล์ `DO` ⇒ ACCESS EXCLUSIVE ของคำสั่ง ALTER ถือต่อจนจบไฟล์ (บล็อกทั้งอ่านและเขียน).
- **★** = ตารางที่มีอยู่แล้วบน prod (ดู §3.1).
- **เพิ่มอย่างเดียว / ทำลาย**: ทุกไฟล์ไม่มี DROP TABLE/COLUMN · RENAME · UPDATE/DELETE/INSERT ข้อมูล · SET NOT NULL บนตารางเดิม · ข้อยกเว้นเดียวที่ "ผ่อน" คือ `pos_p27_qr_orders` DROP NOT NULL บน `PosPaymentIntent` (ตารางใหม่ของ RUN นี้).
- **ถอนไม่ได้**: `ALTER TYPE … ADD VALUE` ลบค่าออกไม่ได้ (ปล่อยไว้ได้ — ค่าที่ไม่มีแถวใช้ไม่มีผล).

| # | migration | tx | lock_timeout | ชั้นล็อก | สร้าง | แก้ของเดิม | เพิ่มอย่างเดียว | ทำลาย | ถอนไม่ได้ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `20261120000000_pos_v2_a` | DO | 3s | L0 | 1 enum · ตาราง PosCategory PosProduct PosProductOptionGroup RecipeLine | — | ใช่ | ไม่ | — |
| 2 | `20261120000001_pos_v2_a_links` | stmt | 3s | L1 | — | MenuItem+posProductId ★ · PosSaleLine+productId ★ · RestaurantOrderItem+productId ★ · ShopOrderLine+posProductId ★ · ShopProduct+posProductId ★ | ใช่ | ไม่ | — |
| 3 | `20261121000000_pos_p15_held_cart` | stmt | ไม่มี ⚠️ | L0 | 1 enum · ตาราง PosHeldCart | — | ใช่ | ไม่ | — |
| 4 | `20261122000000_pos_p16_payment` | stmt | 3s | L1 | — | PosPayType+'CARD' · PosPayment+changeSatang,reference,tenderedSatang ★ · PosSale+note,serviceChargeSatang,tipSatang ★ · PosSaleLine+note ★ | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 5 | `20261123000000_pos_p19_shift` | stmt | 3s | L1 | 2 enum · ตาราง PosShift PosCashMovement PosShiftCounter | PosSale+shiftId ★ | ใช่ | ไม่ | — |
| 6 | `20261124000000_pos_p12_options` | stmt | 3s | L1 | ตาราง PosSaleLineOption | PosProduct+scalePlu,soldByWeight · PosSaleLine+components,weightGrams ★ | ใช่ | ไม่ | — |
| 7 | `20261125000000_pos_p19b_shift_recount` | stmt | 3s | L0 | ตาราง PosShiftRecount | — | ใช่ | ไม่ | — |
| 8 | `20261126000000_pos_p117_reports` | stmt | 3s | L1 | — | PosSale+soldByUserId ★ | ใช่ | ไม่ | — |
| 9 | `20261127000000_pos_p114_stock_count` | stmt | 3s | L0 | 2 enum · ตาราง PosStockCount PosStockCountLine PosStockCountEntry | — | ใช่ | ไม่ | — |
| 10 | `20261128000000_pos_p18_refund` | stmt | 3s | L1 | 1 enum · ตาราง PosDocCounter | PosSale+docType,reasonCode,refSaleId,refundedSatang ★ · PosSaleLine+refLineId,restock ★ | ใช่ | ไม่ | — |
| 11 | `20261128100000_pos_p110_devices` | stmt | ไม่มี ⚠️ | L0 | 1 enum · ตาราง PosDevice | — | ใช่ | ไม่ | — |
| 12 | `20261129000000_pos_p111_online_receipt` | stmt | ไม่มี ⚠️ | L2 | 2 enum · ตาราง PosReceiptIssue PosTaxInvoiceRequest | PosSale+publicToken ★ · UIDX PosSale_publicToken_key ★ | ใช่ | ไม่ | — |
| 13 | `20261130000000_pos_p115_staff_pin_approval` | stmt | ไม่มี ⚠️ | L0 | ตาราง PosStaffPin PosApprovalPayload | PosHeldCart+approvedRequestId | ใช่ | ไม่ | — |
| 14 | `20261130100000_pos_p17_payment_intent` | stmt | ไม่มี ⚠️ | L0 | ตาราง PosPaymentIntent | — | ใช่ | ไม่ | — |
| 15 | `20261201100000_pos_p113_tax_invoice` | stmt | ไม่มี ⚠️ | L1 | ตาราง PosBuyerProfile | AccountDocument+supersededByDocId ★ · PosSale+taxInvoice,taxInvoiceDocId ★ | ใช่ | ไม่ | — |
| 16 | `20261202100000_pos_p112_member_snapshot` | stmt | ไม่มี ⚠️ | L1 | — | PosSale+memberSnapshot,memberBenefits ★ | ใช่ | ไม่ | — |
| 17 | `20261203100000_pos_p21_sales_channel` | stmt | 3s | L1 | 3 enum · ตาราง SalesChannel | PosPayType+'PLATFORM' · PosSale+channelId,channelCode,channelRef,channelPayout,channelCommissionSatang,channelCommissionVatSatang ★ | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 18 | `20261204100000_pos_p22_prices` | stmt | 3s | L1 | 3 enum · ตาราง PosProductChannelPrice PosPriceRule | PosSaleLine+listPriceSatang,priceRuleId,priceSource ★ | ใช่ | ไม่ | — |
| 19 | `20261205100000_pos_p23_recipe` | stmt | 3s | L0 | ตาราง PosRecipeChoiceLine | PosProduct+bomEnabled | ใช่ | ไม่ | — |
| 20 | `20261206100000_pos_p24_tables` | DO | 3s | L1-TX | 1 enum · ตาราง RestaurantReservation | PosHeldCart+tableSessionId · RestaurantTable+dirtySince ★ | ใช่ | ไม่ | — |
| 21 | `20261207100000_pos_p28_orders` | DO | 3s | L0 | 3 enum · ตาราง PosOrder PosOrderLine PosOrderEvent | — | ใช่ | ไม่ | — |
| 22 | `20261208100000_pos_p26_kds` | DO | 3s | L2-TX | 1 enum · ตาราง PosAvailabilityMark | RestaurantOrder+posSaleId,posOrderId,channelCode,channelName,externalRef,targetMinutes ★ · RestaurantSetting+autoAcceptMaxOpen ★ · UIDX RestaurantOrder_posOrderId_key ★ · UIDX RestaurantOrder_posSaleId_key ★ | ใช่ | ไม่ | — |
| 23 | `20261208100100_pos_p26_stock_taken` | stmt | 3s | L1 | — | RestaurantOrderItem+stockTaken ★ | ใช่ | ไม่ | — |
| 24 | `20261208100200_pos_p26_station_set_at` | stmt | 3s | L0 | — | PosProduct+stationSetAt | ใช่ | ไม่ | — |
| 25 | `20261209100000_pos_p29_tenders` | DO | 3s | L2-TX | 1 enum | GiftCard+kind ★ · PosPayType+'GIFT_CARD' · PosPayType+'STORE_CREDIT' · PosPayment+giftCardId,giftCardTxnId ★ · UIDX GiftCard_storeCredit_owner_key ★ | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 26 | `20261210100000_pos_p25_split` | DO | 3s | L0 | 3 enum · ตาราง PosTableSplit PosTableSplitPart PosTableSplitLine | — | ใช่ | ไม่ | — |
| 27 | `20261211100000_pos_p29b_deposits` | DO | 3s | L0 | 2 enum · ตาราง PosDeposit PosDepositTxn | — | ใช่ | ไม่ | — |
| 28 | `20261211110000_pos_p29b_deposit_phone_lock` | stmt | 3s | L0 | — | PosDeposit+phoneFailedCount,phoneLockedUntil | ใช่ | ไม่ | — |
| 29 | `20261215100000_pos_p210_customer_display` | DO | 3s | L0 | 1 enum · ตาราง PosCustomerDisplay | — | ใช่ | ไม่ | — |
| 30 | `20261216100000_pos_p27_qr_orders` | stmt | 3s | L0 | ตาราง PosOrderLink | PosOrder+payBy,paidAt,customerClaimAt,paymentIntentId,publicToken · PosOrderPaymentState+'PENDING_PAYMENT' · PosOrderPaymentState+'PREPAID' · PosPaymentIntent DROP NOT NULL ×2 · PosPaymentIntent+orderId · SalesChannelAdapter+'QR' | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 31 | `20261217100000_pos_p35_staff_commission` | stmt | ไม่มี ⚠️ | L0 | 2 enum · ตาราง PosStaffCommission | — | ใช่ | ไม่ | — |
| 32 | `20261217110000_pos_p34_offline` | stmt | ไม่มี ⚠️ | L2 | ตาราง PosOfflineSale PosOfflineSnapshot | PosDevice+offlineCode,offlineSeq · PosSale+offlineRef,syncedAt ★ · UIDX PosSale_unit_offlineRef_key ★ | ใช่ | ไม่ | — |
| 33 | `20261218100000_pos_p3skel` | stmt | 5s | L0 | ตาราง PosIntegrationCredential PosPaymentSlip PosPrintAgent PosPrintJob | — | ใช่ | ไม่ | — |
| 34 | `20261218100100_pos_p3skel_slip_hash` | stmt | 5s | L0 | — | PosPaymentSlip+sha256 | ใช่ | ไม่ | — |
| 35 | `20261219100000_pos_p36_credit_enum` | stmt | 5s | L1 | — | PosPayType+'ON_ACCOUNT' | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 36 | `20261219100100_pos_p36_credit` | stmt | 5s | L1 | ตาราง PosCreditAccount | PosSale+customerPartyId,crmDealId,creditTerms ★ | ใช่ | ไม่ | — |
| 37 | `20261220100000_pos_p61_hand_indexes` | stmt | 5s | L2 | — | index 14 ตัว (`@@index` ของ CD-P61-P4) บน ShopProduct ★ · ShopOrderLine ★ · PosSaleLine ★ ×2 · MenuItem ★ · RestaurantOrderItem ★ · InvItem ★ · PosSale ★ ×5 · PosOrderLine · PosOrderEvent — ทุกคำสั่ง `CREATE INDEX IF NOT EXISTS` (no-op ถ้าสร้างมือแล้ว · §3.2 ทาง ง · §5.1) | ใช่ | ไม่ | — |

สรุป: **37 ไฟล์ · เพิ่มอย่างเดียว 37 · ทำลาย 0** · `DO` 8 ไฟล์ (#1 #20 #21 #22 #25 #26 #27 #29) · `ALTER TYPE ADD VALUE` **5** ไฟล์ (#4 #17 #25 #30 #35 — brief P6 §⚠️2 นับ 6 เพราะรวม `pos_p18_refund` ที่มีคำนี้ใน comment เท่านั้น) · ไม่มี `lock_timeout` 9 ไฟล์ (4 ไฟล์แตะตารางเดิม: #12 #15 #16 #32 — §3.3 · ทุกไฟล์ได้ 5s จาก URL) · ชั้น L2 ขึ้นไป 5 ไฟล์ (#12 #22 #25 #32 #37 — §3.2) · stmt ที่ **รันซ้ำทั้งไฟล์ไม่ได้** 20 ไฟล์ (ภาคผนวก ก · R1 F7).
ข้อสังเกต: `20260809100000_pos_service_split` อยู่บน main/prod แล้ว (ไม่นับใน 37) · `verify-prod-pos.mts` M1 ตรวจทุกไฟล์ `*_pos_*` ในทรี (38) · #37 เพิ่มใน fix1 (CD-P61-P4) — ไม่ได้ apply บน QC4 ที่ใช้ร่วม (self-test แสดง M1 🟡 "รอ").

## 3. ตรวจล็อกก่อน deploy (อ่านอย่างเดียว · ⛔ เจ้าของสั่ง)

### 3.1 ตารางเดิมที่ migration POS แก้ (13 ตาราง = 10 โมดูลอื่น + 3 `Pos*` ก่อน RUN)

| ตาราง | ประเภท | migration ที่แตะ |
|---|---|---|
| `AccountDocument` | โมดูลอื่น | pos_p113_tax_invoice |
| `GiftCard` | โมดูลอื่น | pos_p29_tenders |
| `InvItem` | โมดูลอื่น | pos_p61_hand_indexes (index อย่างเดียว · CD-P61-P4) |
| `MenuItem` | โมดูลอื่น | pos_v2_a_links · pos_p61_hand_indexes |
| `PosPayment` | Pos* ก่อน RUN | pos_p16_payment · pos_p29_tenders |
| `PosSale` | Pos* ก่อน RUN | pos_p16_payment · pos_p19_shift · pos_p117_reports · pos_p18_refund · pos_p111_online_receipt · pos_p113_tax_invoice · pos_p112_member_snapshot · pos_p21_sales_channel · pos_p34_offline · pos_p36_credit · pos_p61_hand_indexes |
| `PosSaleLine` | Pos* ก่อน RUN | pos_v2_a_links · pos_p16_payment · pos_p12_options · pos_p18_refund · pos_p22_prices · pos_p61_hand_indexes |
| `RestaurantOrder` | โมดูลอื่น | pos_p26_kds |
| `RestaurantOrderItem` | โมดูลอื่น | pos_v2_a_links · pos_p26_stock_taken · pos_p61_hand_indexes |
| `RestaurantSetting` | โมดูลอื่น | pos_p26_kds |
| `RestaurantTable` | โมดูลอื่น | pos_p24_tables |
| `ShopOrderLine` | โมดูลอื่น | pos_v2_a_links · pos_p61_hand_indexes |
| `ShopProduct` | โมดูลอื่น | pos_v2_a_links · pos_p61_hand_indexes |

หมายเหตุ: brief P6 §⚠️3 นับ `RecipeLine` เป็นตารางเดิม — ไม่ใช่: main ไม่มี model/ตารางนี้ · `pos_v2_a` เป็นผู้สร้าง ⇒ ตารางเดิมจริง = 12 ตามมติ P10 + `InvItem` ที่ #37 เพิ่ม index (ไม่แก้คอลัมน์) = **13**.

### 3.2 index ในไฟล์ migration บนตารางเดิม + กลยุทธ์ตามจำนวนแถว (CD-P61-R5 · R1 F5 · มติ addendum 2 P1 · W33)

| index | ตาราง | ชนิด | migration | `IF NOT EXISTS` ในไฟล์ | โหมดไฟล์ |
|---|---|---|---|---|---|
| `PosSale_publicToken_key` | `PosSale` | UNIQUE | `pos_p111_online_receipt` (#12) | **ไม่มี** (คอลัมน์ `publicToken` ก็ `ADD COLUMN` แบบไม่มี IF NOT EXISTS ในไฟล์เดียวกัน `:10` · index `:56`) | stmt |
| `RestaurantOrder_posSaleId_key` · `RestaurantOrder_posOrderId_key` | `RestaurantOrder` | UNIQUE partial | `pos_p26_kds` (#22) | มี (คอลัมน์ก็ IF NOT EXISTS · `:5-7`) | DO = tx เดียว (ACCESS EXCLUSIVE ของ ALTER ถือจนจบไฟล์ — บล็อกทั้งอ่านและเขียนตลอดเวลาสแกน) |
| `GiftCard_storeCredit_owner_key` | `GiftCard` | UNIQUE partial | `pos_p29_tenders` (#25) | มี (type ใน DO · คอลัมน์ IF NOT EXISTS · `:21-30`) | DO = tx เดียว |
| `PosSale_unit_offlineRef_key` | `PosSale` | UNIQUE partial | `pos_p34_offline` (#32) | **ไม่มี** (`ADD COLUMN` `:9` · index `:50`) | stmt |
| `ShopProduct_posProductId_idx` · `ShopOrderLine_posProductId_idx` · `PosSaleLine_productId_idx` · `MenuItem_posProductId_idx` · `RestaurantOrderItem_productId_idx` · `InvItem_tenantId_barcode_idx` · `PosSale_shiftId_idx` · `PosSale_refSaleId_idx` · `PosSale_channelId_idx` · `PosSaleLine_refLineId_idx` · `PosSale_customerPartyId_idx` · `PosSale_crmDealId_idx` | 7 ตารางเดิม | INDEX | `pos_p61_hand_indexes` (#37 · CD-P61-P4) | มี (ทุกคำสั่ง) | stmt · `lock_timeout` 5s |

ทุกตัวสร้างบนคอลัมน์ที่ค่าว่างทุกแถว แต่ Postgres ยังสแกนทั้งตาราง ⇒ การเขียนตารางนั้นถูกบล็อก ∝ จำนวนแถว (ไฟล์ DO บล็อกการอ่านด้วย). **ตัดสินจาก `count(*)` จริง** ของ `verify-prod-pos.mts --counts` ข้อ K1 (§3.4) — เกณฑ์ **100,000 แถว** (มติ addendum 2 P1 · W33). ไม่แก้ไฟล์ migration เดิม (มติ addendum 2 P1 · ไฟล์ apply บน QC4/QC5 แล้ว).

| เงื่อนไข (count จริงจาก K1) | ทาง | ทำอะไร | ช่วงเวลา |
|---|---|---|---|
| ทุกตารางในแถวล่าง ≤ 100,000 | **ก** | ไม่ทำอะไรเพิ่ม — `migrate deploy` สร้างในไฟล์เอง (ล็อกระดับวินาที · ไฟล์ stmt ตั้ง `lock_timeout` เอง/จาก URL §3.3) · §5.1 กลายเป็น no-op | ขั้น 2 |
| `PosSale` > 100,000 | **ข** | p111 + p34: `migrate resolve --applied` **ก่อน** deploy (deploy ข้ามสองไฟล์นี้) → deploy → ทาไฟล์ทั้งสองด้วยมือหลัง deploy โดยเปลี่ยน index บน `PosSale` เป็น `CONCURRENTLY` (ไฟล์อื่นไม่พึ่งของในสองไฟล์นี้ — ตรวจแล้ว: มีแค่ `pos_p27_qr_orders` ที่มีคำ `publicToken` แต่เป็นของ `PosOrder`) · p34 ต้องรอ #11 (`PosDevice`) ⇒ ทาไฟล์มือได้หลัง deploy เท่านั้น | ก่อนและหลังขั้น 2 · ก่อน GO-10 |
| `RestaurantOrder` > 100,000 | **ค** (p26) | สร้างคอลัมน์ + unique 2 ตัวด้วย `CONCURRENTLY` **ก่อน** deploy ด้วยข้อความเดียวกับไฟล์ — ไฟล์ IF NOT EXISTS ⇒ ข้ามเอง (ACCESS EXCLUSIVE ของไฟล์เหลือระดับมิลลิวินาที) | ก่อนขั้น 2 |
| `GiftCard` > 100,000 | **ค** (p29) | สร้าง type `GiftCardKind` + คอลัมน์ `kind` (DEFAULT เดียวกัน) + unique partial ด้วย `CONCURRENTLY` **ก่อน** deploy (predicate เดียวกับไฟล์ทุกตัวอักษร) | ก่อนขั้น 2 |
| ตารางใดของ #37 (`PosSale` `PosSaleLine` `ShopProduct` `ShopOrderLine` `MenuItem` `RestaurantOrderItem` `InvItem`) > 100,000 | **ง** | `migrate resolve --applied 20261220100000_pos_p61_hand_indexes` **ก่อน** deploy → §5.1 (`CONCURRENTLY` 14 ตัว) หลัง deploy ก่อน merge | ก่อนและหลังขั้น 2 · ก่อน GO-10 |

⚠️ สมมติฐาน (ทาง ข และ ง): Prisma 7.8 `migrate deploy` ข้ามไฟล์ที่ `resolve --applied` ไว้ก่อน แม้ timestamp อยู่กลางลำดับ และไม่ปฏิเสธเพราะลำดับ · branch ซ้อม (W31) คัดลอกจาก prod ⇒ จำนวนแถวเท่ากัน ⇒ ถ้า prod ต้องใช้ทาง ข/ง การซ้อมจะเดินทางเดียวกันและพิสูจน์ข้อนี้ก่อน · ระหว่าง resolve กับทาไฟล์มือ ฐานบันทึกว่า apply แล้วแต่ของยังไม่มี — โค้ด main เดิมไม่อ่านของเหล่านี้ และยังไม่ merge จนกว่า GO-10 (verify T1/C1/I1) เขียว.

**ทาง ข** (ใน worktree deploy · ตั้งตัวแปรตาม §4.0 แล้ว):
```bash
# ⛔ GO-8b · ทาง ข เท่านั้น (PosSale > 100k) · ก่อน migrate deploy — บันทึก p111 + p34 ว่า apply แล้ว (deploy จะข้าม)
env -C /root/pos-deploy bash scripts/iso.sh env DIRECT_URL="$PROD_MIGRATE_URL" DATABASE_URL="$PROD_MIGRATE_URL" pnpm exec prisma migrate resolve --applied 20261129000000_pos_p111_online_receipt
env -C /root/pos-deploy bash scripts/iso.sh env DIRECT_URL="$PROD_MIGRATE_URL" DATABASE_URL="$PROD_MIGRATE_URL" pnpm exec prisma migrate resolve --applied 20261217110000_pos_p34_offline
```
```bash
# ⛔ GO-9b · ทาง ข · หลัง migrate deploy — สร้างไฟล์มือจาก migration เดิม (เปลี่ยนแค่ index บน PosSale เป็น CONCURRENTLY IF NOT EXISTS + ตั้ง lock_timeout) แล้วรันทีละคำสั่ง (psql autocommit · ไม่มี -1)
{ echo "SET lock_timeout = '5s';"; sed -e 's/^CREATE UNIQUE INDEX "PosSale_publicToken_key"/CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_publicToken_key"/' /root/pos-deploy/prisma/migrations/20261129000000_pos_p111_online_receipt/migration.sql; } > /root/pos-deploy-hand-p111.sql
grep -c 'CONCURRENTLY' /root/pos-deploy-hand-p111.sql
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 -f /root/pos-deploy-hand-p111.sql
{ echo "SET lock_timeout = '5s';"; sed -e 's/^CREATE UNIQUE INDEX "PosSale_unit_offlineRef_key"/CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_unit_offlineRef_key"/' /root/pos-deploy/prisma/migrations/20261217110000_pos_p34_offline/migration.sql; } > /root/pos-deploy-hand-p34.sql
grep -c 'CONCURRENTLY' /root/pos-deploy-hand-p34.sql
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 -f /root/pos-deploy-hand-p34.sql
```
- `grep -c` ต้องพิมพ์ `1` ทั้งสองครั้ง (ทดสอบแล้วกับไฟล์ในทรี 24 ต.ค.) — ไม่ใช่ 1 = หยุด ถามผู้คุม.
- psql หยุดที่คำสั่งแรกที่ล้ม (`ON_ERROR_STOP`) · ไฟล์ stmt รันซ้ำไม่ได้ทั้งไฟล์ ⇒ ล้มกลางไฟล์ = รัน SQL ถอยกลับของไฟล์นั้น (ภาคผนวก ก) แล้วรันไฟล์มือใหม่ทั้งไฟล์ · index ที่ CONCURRENTLY ล้มกลางทางจะค้าง `indisvalid = false` ⇒ `DROP INDEX CONCURRENTLY IF EXISTS "<ชื่อ>";` แล้วรันบรรทัดนั้นใหม่.

**ทาง ค** (ก่อน migrate deploy · psql autocommit ทีละคำสั่ง · ข้อความเดียวกับไฟล์ ต่างแค่ `CONCURRENTLY`):
```bash
# ⛔ GO-8c · ทาง ค (p26) เท่านั้น — RestaurantOrder > 100k
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SET lock_timeout = '5s';
ALTER TABLE "RestaurantOrder" ADD COLUMN IF NOT EXISTS "posSaleId" TEXT, ADD COLUMN IF NOT EXISTS "posOrderId" TEXT, ADD COLUMN IF NOT EXISTS "channelCode" TEXT, ADD COLUMN IF NOT EXISTS "channelName" TEXT, ADD COLUMN IF NOT EXISTS "externalRef" TEXT, ADD COLUMN IF NOT EXISTS "targetMinutes" INTEGER;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "RestaurantOrder_posSaleId_key" ON "RestaurantOrder"("posSaleId") WHERE "posSaleId" IS NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "RestaurantOrder_posOrderId_key" ON "RestaurantOrder"("posOrderId") WHERE "posOrderId" IS NOT NULL;
RESET lock_timeout;
SQL
# ⛔ GO-8c · ทาง ค (p29) เท่านั้น — GiftCard > 100k
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SET lock_timeout = '5s';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'GiftCardKind' AND n.nspname = current_schema()) THEN CREATE TYPE "GiftCardKind" AS ENUM ('GIFT', 'STORE_CREDIT'); END IF; END $$;
ALTER TABLE "GiftCard" ADD COLUMN IF NOT EXISTS "kind" "GiftCardKind" NOT NULL DEFAULT 'GIFT';
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "GiftCard_storeCredit_owner_key" ON "GiftCard"("systemId", "ownerCustomerId") WHERE "kind" = 'STORE_CREDIT';
RESET lock_timeout;
SQL
```
- คอลัมน์ที่เพิ่มล่วงหน้าไม่กระทบโค้ด main (nullable · `kind` มี DEFAULT ⇒ บัตรที่โค้ดเดิมสร้าง = `GIFT`) · ตอน deploy ไฟล์ p26/p29 เจอของครบ ⇒ ข้าม (ADD VALUE ของ `PosPayType` ใน p29 ยังทำตามปกติ).

**ทาง ง**:
```bash
# ⛔ GO-8d · ทาง ง เท่านั้น (ตารางของ #37 > 100k) · ก่อน migrate deploy — แล้วทำ §5.1 หลัง deploy ก่อน GO-10
env -C /root/pos-deploy bash scripts/iso.sh env DIRECT_URL="$PROD_MIGRATE_URL" DATABASE_URL="$PROD_MIGRATE_URL" pnpm exec prisma migrate resolve --applied 20261220100000_pos_p61_hand_indexes
```

### 3.3 `lock_timeout` ของการ deploy (CD-P61-P2 · มติ addendum 2 P2 · R1 F9)

9 ไฟล์ไม่ตั้ง `lock_timeout` เอง — 4 ไฟล์แตะตารางเดิม: `pos_p111_online_receipt` (PosSale + unique index) · `pos_p113_tax_invoice` (AccountDocument · PosSale) · `pos_p112_member_snapshot` (PosSale) · `pos_p34_offline` (PosSale + unique index). ถ้ามี transaction ยาวถือ `PosSale` อยู่ คำสั่ง ALTER จะรอไม่มีกำหนด และทุกการขายที่ตามมาต่อคิวหลังมัน.

มติ: ตั้งระดับ session ผ่าน URL ที่ใช้ deploy — `options=-c%20lock_timeout%3D5s` ต่อท้าย direct URL (ตัวแปร `PROD_MIGRATE_URL` · §4.0) · ไม่แก้ไฟล์ migration. ไฟล์ที่ตั้งค่าเอง (3s/5s) ยังใช้ค่าของไฟล์ และ `RESET lock_timeout` ท้ายไฟล์กลับมาที่ 5s ของ URL · advisory lock ของ `migrate deploy` ก็อยู่ใต้ค่านี้ ⇒ ถ้ามี migrate อื่นวิ่งพร้อมกัน (เช่น build ของ Vercel) จะล้มเร็วแทนรอ.

หลักฐานบน QC4 (Neon proxy ตัวเดียวกัน · 24 ต.ค. 2026 · อ่านอย่างเดียว · ledger/wo-notes/pos-P6.1-fix1.md): psql มี option → `5s` · ไม่มี → `0` · `prisma db execute --stdin` (schema engine ตัวเดียวกับ migrate) DO-check มี option → exit 0 · ไม่มี → exit 1 `lock_timeout=0` (control ลบ).

พิสูจน์ซ้ำ (อ่านอย่างเดียว) บน branch ซ้อม และบน prod ก่อน deploy:
```bash
# ⛔ GO-7 · ต้องพิมพ์ 5s
psql "$PROD_MIGRATE_URL" -X -Atc 'SHOW lock_timeout'
# ⛔ GO-7 · Prisma ใช้ option จริง: exit 0 = ใช้ · exit 1 + "lock_timeout=0" = ไม่ใช้ ⇒ หยุด ใช้ทางสำรองข้างล่าง
printf '%s\n' "DO \$\$ BEGIN IF current_setting('lock_timeout') <> '5s' THEN RAISE EXCEPTION 'lock_timeout=% (URL option not applied)', current_setting('lock_timeout'); END IF; END \$\$;" | env -C /root/pos-deploy bash scripts/iso.sh env DIRECT_URL="$PROD_MIGRATE_URL" pnpm exec prisma db execute --stdin
```
ทางสำรอง (เฉพาะเมื่อพิสูจน์ไม่ผ่าน · ⛔ GO-7 · เป็นการเขียน role): `ALTER ROLE <deploy_role> SET lock_timeout = '5s';` ก่อน deploy แล้ว `ALTER ROLE <deploy_role> RESET lock_timeout;` หลัง deploy (session ใหม่เท่านั้นที่เห็นค่า).

### 3.4 คำสั่งตรวจ (อ่านอย่างเดียว · ⛔ เจ้าของสั่ง · นอกเวลาขาย · ทันทีก่อน deploy)

```bash
# ⛔ GO-6 · จำนวนแถว + ทางของ §3.2 + ตัวเลข §1A (K3) — อ่านอย่างเดียว · ก่อน migrate ได้
env -C /root/pos-deploy bash scripts/iso.sh env ALLOW_PROD_AUDIT=1 DATABASE_URL="$PROD_DIRECT_URL" pnpm exec tsx scripts/verify-prod-pos.mts --counts
```
ผลที่คาด: `🟢 G1 … host <ป้าย prod>… (prod)` · `K1` = จำนวนแถวทุกตาราง + บรรทัด `ไม่มีตารางตัดสินใดเกิน 100,000 ⇒ ทาง ก` หรือรายการ `เกิน 100,000: <ตาราง> <จำนวน> ⇒ <ทาง>` · `K2` registerV2 · `K3` (a)–(e) · `K4` โต๊ะ session ซ้ำ (ต้อง 0 ก่อน §5.2) · exit 0 · `JSON_SUMMARY {"mode":"counts",…}` → วางลงบันทึก.

```bash
# ⛔ GO-6 · transaction ค้าง + ล็อก (ต้องไม่มี transaction > 5 วิ ก่อนกด deploy)
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN; SET TRANSACTION READ ONLY;
SELECT pid, state, now() - xact_start AS age, left(query, 80) FROM pg_stat_activity WHERE xact_start < now() - interval '5 seconds' AND pid <> pg_backend_pid();
SELECT c.relname, l.mode, l.granted, a.pid, now() - a.xact_start AS age FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_stat_activity a ON a.pid = l.pid WHERE c.relname IN ('PosSale','PosSaleLine','PosPayment','AccountDocument','GiftCard','InvItem','MenuItem','RestaurantOrder','RestaurantOrderItem','RestaurantSetting','RestaurantTable','ShopOrderLine','ShopProduct');
ROLLBACK;
SQL
```

## 4. ขั้นตอน deploy (ลำดับ CD-P61-R1) + การกู้เมื่อล้ม

### 4.0 เตรียมเครื่อง: ตัวแปร URL + worktree สะอาดที่ SHA หัวของ PR (R1 F10)

ทำไม: worktree ของผู้คุม (`/root/projects/shark-pos`) = `session/pos` + งาน ledger ที่ยังไม่ commit — ไม่ใช่หัวของ PR · `prisma.config.ts:5` โหลด `.env` ของทรีที่รันถ้ามี ⇒ คำสั่ง prod ทุกตัวรันจาก worktree ใหม่ที่ไม่มี `.env` และอยู่ที่ `<PR_HEAD_SHA>` ตรงตัว.
```bash
# ⛔ GO-5 · บน VPS (ผู้ใช้ root) · shell เดียวกันทั้งหน้าต่าง deploy (ตัวแปรหายเมื่อปิด shell)
git -C /root/projects/shark-pos fetch origin
git -C /root/projects/shark-pos worktree add --detach /root/pos-deploy <PR_HEAD_SHA>
git -C /root/pos-deploy rev-parse HEAD
git -C /root/pos-deploy status --porcelain
ls -a /root/pos-deploy | grep -c '^\.env$'
env -C /root/pos-deploy bash scripts/iso.sh pnpm install --frozen-lockfile
env -C /root/pos-deploy bash scripts/iso.sh pnpm exec prisma --version
# ⛔ GO-5 (ต่อ) · ตั้งตัวแปร URL ของ prod (พิมพ์/วางค่า direct URL เอง · ไม่แสดงบนจอ · ไม่ลงประวัติ)
read -rsp 'PROD_DIRECT_URL (direct · ไม่ใช่ -pooler): ' PROD_DIRECT_URL; echo
case "$PROD_DIRECT_URL" in *-pooler*) echo "🔴 เป็น -pooler — หยุด"; unset PROD_DIRECT_URL;; *options=*) echo "🔴 URL มี options= อยู่แล้ว — หยุด ถามผู้คุม"; unset PROD_DIRECT_URL;; esac
[ -n "${PROD_DIRECT_URL:-}" ] || { echo "🔴 หยุด — URL ว่าง/ถูกปฏิเสธ · shell นี้จะปิด · เปิด shell ใหม่แล้วเริ่มที่บรรทัด read ข้างบน (worktree มีแล้ว ข้าม worktree add)"; exit 1; }
[ -n "${PROD_DIRECT_URL:-}" ] && case "$PROD_DIRECT_URL" in *\?*) PROD_MIGRATE_URL="${PROD_DIRECT_URL}&options=-c%20lock_timeout%3D5s";; *) PROD_MIGRATE_URL="${PROD_DIRECT_URL}?options=-c%20lock_timeout%3D5s";; esac
printf '%s\n' "${PROD_DIRECT_URL:-}" | sed -E 's#^[^@]*@([^.:/]*).*#host label: \1#'
```
ผลที่ต้องเห็น: `rev-parse` = `<PR_HEAD_SHA>` ตรงตัว · `status --porcelain` ไม่พิมพ์อะไร · `grep -c '^\.env$'` = `0` · `pnpm install` จบ exit 0 (postinstall รัน `prisma generate` · ต้องมีเน็ต + พื้นที่ดิสก์ราว 2 GB — ดู `df -h /root` ก่อน) · `prisma --version` บรรทัด `prisma` = `7.8.x` · `read` ไม่แสดงค่าที่พิมพ์ · `case` ไม่พิมพ์ 🔴 · บรรทัด `[ -n … ] || exit` ไม่ทำงาน (ถ้าทำงาน shell ปิด = หยุดตามตั้งใจ · R2-F7) · บรรทัด `host label:` ขึ้นต้นด้วย mark ของ prod (= `PROD_HOST_MARK` ใน `scripts/qc-env-guard.mts`) และไม่มี `-pooler` — พิมพ์แค่ป้าย host ไม่พิมพ์รหัสผ่าน.
หลังจบงานทั้งหมด: `unset PROD_DIRECT_URL PROD_MIGRATE_URL` · `git -C /root/projects/shark-pos worktree remove /root/pos-deploy` (หลังเก็บผลลงบันทึกแล้ว).

### 4.1 ก่อนกด (ขั้น 1 ของ §0)
1. ⛔ GO-1 ตั้ง env บน Vercel production (dashboard · Settings › Environment Variables · Production): `POS_DEVICE_KEY` = ค่าใหม่จาก `openssl rand -hex 32` (≥ 32 ตัว · ห้ามซ้ำกับ `POS_CREDENTIALS_KEY` / `CHAT_CREDENTIALS_KEY` / `SESSION_SECRET`) · `POS_CREDENTIALS_KEY` ถ้ายังไม่มี (W4) · env ใหม่มีผลกับ build ถัดไป (= build ตอน merge ขั้น 4) — ไม่ต้อง redeploy ตอนนี้.
2. ⛔ GO-2 เลือกหน้าต่างนอกเวลาขายของทุกร้านที่มี POS (ร้านอาหาร/ร้านค้า/โรงแรม/ตั๋วก็เรียก `createSale`) · ใครรัน = เจ้าของ (W32 · ผู้คุมอ่านทีละขั้น).
3. ⛔ GO-3 / GO-4 รับทราบ §1A (a–e) + ตอบหรือรับค่าเริ่มต้น W37 W38 W39 W41 W19 (§1 แถว 1.16–1.19).
4. §4.0 เสร็จ (GO-5).
5. ⛔ GO-6 §3.4: `--counts` + transaction/ล็อก → จดทางของ §3.2 (ก/ข/ค/ง).
6. ⛔ GO-7 พิสูจน์ `lock_timeout` ผ่าน URL (§3.3).
7. ⛔ GO-8 สร้าง Neon branch ของ prod ทันทีก่อน deploy (จุดย้อนกลับ · Neon console › Branches › Create branch จาก production "now") — จด branch id ในบันทึก · แล้ว (ถ้าทาง ข/ค/ง) ทำขั้นก่อน deploy ของ §3.2 (GO-8b/8c/8d).

### 4.2 deploy (ขั้น 2–3 ของ §0)
```bash
# ⛔ GO-9 · ต้องเห็นบรรทัด Datasource ชี้ host ของ prod (ป้ายเดียวกับที่ --counts พิมพ์) และรายการไฟล์ที่ยังไม่ apply (ทาง ก = 37 ไฟล์ · ทาง ข/ง น้อยกว่าตามที่ resolve)
env -C /root/pos-deploy bash scripts/iso.sh env DIRECT_URL="$PROD_MIGRATE_URL" DATABASE_URL="$PROD_MIGRATE_URL" pnpm exec prisma migrate status
# ⛔ GO-9 · deploy จริง (เวลาแต่ละไฟล์ดูจาก log · จดลงบันทึก)
env -C /root/pos-deploy bash scripts/iso.sh env DIRECT_URL="$PROD_MIGRATE_URL" DATABASE_URL="$PROD_MIGRATE_URL" pnpm exec prisma migrate deploy
```
- ผลที่คาด: `prisma migrate deploy` พิมพ์ `Applying migration …` ทีละไฟล์ แล้ว `All migrations have been successfully applied.` · exit 0 · ล้ม = §4.4.
- ทาง ข: ⛔ GO-9b ทาไฟล์มือ p111 + p34 (§3.2) · ทาง ง: ⛔ GO-9d §5.1.

```bash
# ⛔ GO-10 · ด่านแข็งก่อน merge — ต้องพิมพ์ "Database schema is up to date!"
env -C /root/pos-deploy bash scripts/iso.sh env DIRECT_URL="$PROD_MIGRATE_URL" DATABASE_URL="$PROD_MIGRATE_URL" pnpm exec prisma migrate status
# ⛔ GO-10 · verify ข้อ M1 M2 T1 C1 E1 I1 ต้อง 🟢 · X1 🟢 (ทาง ก/ง หลัง §5.1) หรือ 🟡 เฉพาะ one_open_session_per_table (สร้างหลัง merge §5.2) · exit 0
env -C /root/pos-deploy bash scripts/iso.sh env ALLOW_PROD_AUDIT=1 DATABASE_URL="$PROD_DIRECT_URL" pnpm exec tsx scripts/verify-prod-pos.mts
```
```bash
# ⛔ GO-10 · จด SHA ของ origin/main ตอนผ่านด่าน (ใช้ที่ GO-12 · R2-F1) — shell เดียวกัน
git -C /root/projects/shark-pos fetch origin
MAIN_AT_GO10=$(git -C /root/projects/shark-pos rev-parse origin/main); echo "MAIN_AT_GO10=$MAIN_AT_GO10"
```
- ไม่เขียวข้อใด = **ห้าม merge** · แก้ตาม §4.4 หรือเรียกผู้คุม.
- ⛔ GO-11b (ถ้า K2 > 0 · §1A ข้อ f ทาง 1): ทำ §8.1–8.5 ของร้านในคิวรี (f) ตอนนี้ (ก่อน GO-12) · ร้านอื่นทำหลัง merge ตามปกติ.
- ⛔ GO-11 (ถ้ามีหลายวัน) ถ้าเว้นช่วงระหว่าง GO-10 กับ merge: ทุกคน **ห้าม merge PR อื่นที่มี migration** เข้า main ระหว่างนั้น (Vercel จะ migrate ไฟล์นั้นเองตอน build).

### 4.3 merge (ขั้น 4 ของ §0) — Vercel ทำอะไร
0. ⛔ GO-12 (ก่อนกด · **ด่านแช่แข็ง** R2-F1): ตั้งแต่ GO-5 จนกด merge `session/pos` รับได้แค่ commit ที่แตะ ledger/ หรือ docs/ — commit อื่นบน PR (หรือ migration ใหม่บน main) = ทำ GO-9/GO-10 ใหม่ที่หัวใหม่ (`<PR_HEAD_SHA>` ใหม่ · worktree ใหม่):
   ```bash
   # ⛔ GO-12 · อ่าน git อย่างเดียว · สองบรรทัด git ต้องไม่พิมพ์อะไร · verify ต้อง FAIL 0 (Q3 เตือน = มี commit นอก ledger/docs หลัง SHA ⇒ หยุด ถามผู้คุม)
   git -C /root/projects/shark-pos fetch origin
   git -C /root/projects/shark-pos diff --stat <PR_HEAD_SHA> origin/session/pos -- prisma src package.json pnpm-lock.yaml vercel.json scripts/vercel-build.sh
   git -C /root/projects/shark-pos log --oneline "$MAIN_AT_GO10"..origin/main -- prisma/migrations
   env -C /root/pos-deploy bash scripts/iso.sh pnpm exec tsx scripts/verify-prod-pos.mts --pr-freeze <PR_HEAD_SHA> --main-at "$MAIN_AT_GO10"
   ```
1. ⛔ GO-12 กด merge PR บน GitHub (W-next-11) · Vercel เริ่ม build production ของ `main`.
2. `scripts/vercel-build.sh:21-25` บน Vercel: `prisma migrate deploy` ต้องพิมพ์ `No pending migrations to apply.` → `prisma migrate status` = up to date → `tsc --noEmit` → `next build` → Vercel promote อัตโนมัติ.
3. ดู log ของ build ใน Vercel dashboard (Deployments › build ล่าสุด › Build Logs) — ค้นคำ `[vercel-build]` ต้องเห็น 3 บรรทัดตามลำดับ (`production → prisma migrate deploy ก่อน build` · `migrate ผ่าน → ตรวจซ้ำ` · `tsc --noEmit`).
4. ทางล้ม: build แดงที่ขั้น migrate (เช่นมีไฟล์ค้างเพราะข้าม GO-10) ⇒ โค้ดเก่ายังเสิร์ฟ (ปลอดภัย) แต่ build ถัดไปทุกครั้งจะแดงจนกว่าแก้ ⇒ ทำ §4.4 **จาก VPS** แล้วกด Redeploy ใน Vercel · build แดงที่ `tsc`/`next build` ⇒ ฐานไม่ต้องย้อน (เพิ่มอย่างเดียว) · แก้โค้ดแล้ว deploy ใหม่ (forward fix).
- ผู้คุม (ไม่ใช่เจ้าของ · R2-F5): การ์ด schema (`@@index` + `@@unique` ของ CD-P61-P4) เปลี่ยน type ของ Prisma client ที่ generate ⇒ ด่านของผู้คุมก่อนเปิด PR ต้องมี `prisma generate` + `tsc --noEmit` เต็มบน session/pos ที่ merge แล้ว (gates130 บนทรี c ทำทั้งสอง) — ไม่งั้น type error โผล่ครั้งแรกที่ `tsc` ของ Vercel (build แดง · โค้ดเก่ายังเสิร์ฟ · แก้ไปข้างหน้า).
5. หลัง promote: ⛔ GO-13 §7 (crontab VPS) · ⛔ GO-14 §5.2 · ⛔ GO-15 คิวรี (e) ของ §1A + จับคู่เครื่องขาย (§9).

### 4.4 ล้มกลางทาง (P3018 → P3009)
1. lock timeout / error ⇒ Prisma บันทึกไฟล์นั้นว่าล้ม (`P3018`) · deploy รอบถัดไป (รวมของ Vercel) ปฏิเสธด้วย `P3009`.
2. ดูว่าไฟล์นั้นเป็น `DO` (atomic ⇒ ไม่มีอะไรเหลือ — ข้ามไปข้อ 4) หรือ `stmt` (อาจเหลือบางส่วน) จากตาราง §2.
3. ไฟล์ `stmt`: **ต้อง**รัน SQL ถอยกลับของไฟล์นั้น (ภาคผนวก ก) ทีละคำสั่ง (psql autocommit) ก่อนข้อ 4 — ไฟล์ stmt **รันซ้ำไม่ได้ทั้งไฟล์** (20 ไฟล์ (นับใหม่ใน fix1 — R1 นับ 19) มี `CREATE TYPE` / `CREATE TABLE` / `ADD COLUMN` / `CREATE INDEX` แบบไม่มี IF NOT EXISTS เช่น `pos_p19_shift` · `pos_p111_online_receipt` · `pos_p34_offline` · R1 F7) · คำสั่งถอยกลับทุกตัวเป็น `IF EXISTS` ⇒ รันซ้ำได้.
4. ⛔ GO-9 (ซ้ำ) `env -C /root/pos-deploy bash scripts/iso.sh env DIRECT_URL="$PROD_MIGRATE_URL" DATABASE_URL="$PROD_MIGRATE_URL" pnpm exec prisma migrate resolve --rolled-back <migration_name>`
5. แก้เหตุ (เช่น รอ transaction ยาวจบ · §3.4) → ⛔ deploy ใหม่ (§4.2) → GO-10 อีกครั้ง.
6. เหตุร้ายแรงที่แก้ไม่ได้ในหน้าต่าง: ⛔ ย้อนฐานด้วย Neon restore จาก branch ของ GO-8 (ยังไม่ merge ⇒ โค้ดเดิมไม่รู้จักของใหม่) แล้วเลื่อนหน้าต่าง · 🔴 **restore ทิ้งทุกการเขียนหลังจุด GO-8** (บิล · ออเดอร์ · สมาชิก · บัญชี ของทุกโมดูล) ⇒ ใช้ได้เฉพาะช่วง **ก่อนมีการขาย/การเขียนใด ๆ หลัง GO-8** (หน้าต่างนอกเวลาขาย) · มีการเขียนแล้ว = ห้าม restore · แก้ไปข้างหน้าตามข้อ 3–5 (R2-F6).

### 4.5 ซ้อมก่อนของจริง (W31)
- ค่าปริยาย W31: ⛔ เจ้าของอนุญาต branch ที่คัดลอกจาก prod เฉพาะเมื่อ **ลบภายในวันเดียวกันและไม่ส่งออกข้อมูล** · ไม่อนุญาต ⇒ ซ้อมบน QC4 เท่านั้น (พิสูจน์ได้แค่บางข้อ).
- วันซ้อม: ผู้คุมเพิ่ม endpoint ของ branch ซ้อมใน allowlist เป็น role ใหม่ `rehearsal` ทั้งใน `scripts/verify-prod-pos.mts` (`HOST_ALLOWLIST`) และ `scripts/lib/pos-prod-writer-guard.mts` (`WRITER_HOST_ALLOWLIST`) ใน commit เดียว แล้วลบออกหลังลบ branch (CD-P61-P3 · R1 F16 — **ห้ามใช้ role prod**) · rehearsal ได้กติกาเดียวกับ prod (ต้อง `ALLOW_PROD_AUDIT=1` / `ALLOW_PROD_BACKFILL=1` · ไม่มี `--self-test`).
- บน branch: ทำ §4.0–§4.2 ทุกคำสั่งโดยใช้ URL ของ branch แทน `PROD_DIRECT_URL` (ทางของ §3.2 เท่ากับ prod เพราะจำนวนแถวเท่ากัน ⇒ พิสูจน์สมมติฐาน resolve-ก่อน ถ้าต้องใช้) → §3.3 พิสูจน์ `lock_timeout` → §5 → backfill ทุกตัว `--dry-run` (§8) → `verify-prod-pos.mts` → ด่านเต็ม + `qc:all` (สูตร QC7 ของ P3.12) → ลบ branch → จดใน ledger/wo-notes/pos-P6.1.md (สร้างตอนซ้อม).
- ห้ามถ่ายภาพ/คัดลอกข้อมูลลูกค้าจาก branch.

## 5. index มือ (CREATE INDEX CONCURRENTLY)

กติกา (มติ P5 §10-9 · P1.1a M1): index บนตารางเดิมที่ใหญ่ สร้างมือทีละตัว นอก transaction (psql autocommit) · หลังสร้างต้อง `indisvalid = true` · ไม่ valid ⇒ `DROP INDEX CONCURRENTLY IF EXISTS` แล้วสร้างใหม่. ชื่อใช้แบบ Prisma (`<Table>_<cols>_idx`) และตั้งแต่ fix1 **ประกาศเป็น `@@index` ใน `prisma/schema` แล้ว** (CD-P61-P4) + migration #37 `20261220100000_pos_p61_hand_indexes` = `CREATE INDEX IF NOT EXISTS` ชื่อเดียวกัน ⇒ ทาง ก ของ §3.2: #37 สร้างให้ตอน deploy และ §5.1 เป็น no-op · ทาง ง: #37 ถูก resolve ไว้ และ §5.1 คือที่สร้างจริง · `prisma migrate diff` จาก schema ว่างสำหรับ POS (ยกเว้น partial `one_open_session_per_table` ที่ Prisma ประกาศไม่ได้และ diff ไม่รายงาน). รายการเดียวกับ `HAND_INDEXES` ใน `scripts/verify-prod-pos.mts` (ข้อ X1).

### 5.1 index 14 ตัว — หลัง migrate deploy · ก่อน GO-10 (ทาง ก = no-op · ทาง ง = สร้างจริง)
```bash
# ⛔ GO-9d · psql autocommit ทีละคำสั่ง · นอกเวลาขาย
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SET lock_timeout = '5s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ShopProduct_posProductId_idx" ON "ShopProduct" ("posProductId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ShopOrderLine_posProductId_idx" ON "ShopOrderLine" ("posProductId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSaleLine_productId_idx" ON "PosSaleLine" ("productId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MenuItem_posProductId_idx" ON "MenuItem" ("posProductId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "RestaurantOrderItem_productId_idx" ON "RestaurantOrderItem" ("productId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InvItem_tenantId_barcode_idx" ON "InvItem" ("tenantId", "barcode");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_shiftId_idx" ON "PosSale" ("shiftId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_refSaleId_idx" ON "PosSale" ("refSaleId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_channelId_idx" ON "PosSale" ("channelId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSaleLine_refLineId_idx" ON "PosSaleLine" ("refLineId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_customerPartyId_idx" ON "PosSale" ("customerPartyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_crmDealId_idx" ON "PosSale" ("crmDealId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosOrderLine_orderId_idx" ON "PosOrderLine" ("orderId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosOrderEvent_orderId_idx" ON "PosOrderEvent" ("orderId");
RESET lock_timeout;
SQL
```

### 5.2 partial unique `one_open_session_per_table` — หลัง merge · ก่อนเปิดโหมดโต๊ะร้านใด
ทำไมหลัง merge: โค้ดเดิมของร้านอาหารไม่ได้ออกแบบมาคู่กับ unique นี้ — ถ้ามันเปิด session ซ้อน (race) จะเจอ error แทนแถวซ้ำ · โค้ดใหม่ (P2.4) คาดหวัง index นี้. ต้องนับแถวซ้ำ = 0 ก่อน (verify K4/X1).
```bash
# ⛔ GO-14 · นับก่อน (ต้องได้ 0 · ไม่ใช่ 0 = เจ้าของปิด session ซ้ำในแอปก่อน แล้วนับใหม่)
psql "$PROD_DIRECT_URL" -X -Atc "SELECT count(*) FROM (SELECT \"tableId\" FROM \"TableSession\" WHERE \"status\" = 'OPEN' GROUP BY \"tableId\" HAVING count(*) > 1) d"
# ⛔ GO-14 · สร้าง (autocommit)
psql "$PROD_DIRECT_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SET lock_timeout = '5s';
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "one_open_session_per_table" ON "TableSession" ("tableId") WHERE "status" = 'OPEN';
RESET lock_timeout;
SQL
```

### 5.3 ตรวจ (ต้องได้ 15 แถว และทุกแถว `valid = t` — แถวที่ `exists = f` คือยังไม่สร้าง · R1 F15)
```bash
# ⛔ GO-10 / GO-14 · อ่านอย่างเดียว
psql "$PROD_DIRECT_URL" -X <<'SQL'
SELECT w.name, (c.oid IS NOT NULL) AS exists, coalesce(i.indisvalid, false) AS valid
  FROM (VALUES ('ShopProduct_posProductId_idx'),('ShopOrderLine_posProductId_idx'),('PosSaleLine_productId_idx'),('MenuItem_posProductId_idx'),('RestaurantOrderItem_productId_idx'),('InvItem_tenantId_barcode_idx'),('PosSale_shiftId_idx'),('PosSale_refSaleId_idx'),('PosSale_channelId_idx'),('PosSaleLine_refLineId_idx'),('PosSale_customerPartyId_idx'),('PosSale_crmDealId_idx'),('PosOrderLine_orderId_idx'),('PosOrderEvent_orderId_idx'),('one_open_session_per_table')) AS w(name)
  LEFT JOIN pg_class c ON c.relname = w.name AND c.relkind = 'i'
  LEFT JOIN pg_index i ON i.indexrelid = c.oid
 ORDER BY 1;
SQL
```
ทางลัด: `verify-prod-pos.mts` ข้อ X1 = 🟢 `15/15 สร้างแล้ว` เท่ากับตารางนี้ครบ.

| index | ที่มา | สถานะ |
|---|---|---|
| คอลัมน์เชื่อม 5 ตัว (`ShopProduct`/`ShopOrderLine`/`MenuItem`.`posProductId` · `PosSaleLine`/`RestaurantOrderItem`.`productId`) | P1.1a M1/M7 · `prisma/schema/ecommerce.prisma:29` `:72` · `pos.prisma:192` · `restaurant.prisma:187` `:470` | พร้อม · `@@index` แล้ว (CD-P61-P4) |
| `InvItem (tenantId, barcode)` | P1.1a (ขา UNION ที่สองของ `byBarcode`) · `ledger/wo-notes/pos-P1.1a.md:369` · P5.3 มติ 9 · `prisma/schema/inventory.prisma:113` | พร้อม · `@@index` แล้ว |
| `PosSale.shiftId` · `.refSaleId` · `.channelId` | `prisma/schema/pos.prisma:91` `:100` `:126` · TL-6 | พร้อม · `@@index` แล้ว |
| `PosOrderLine.orderId` · `PosOrderEvent.orderId` (ตารางใหม่ ว่างตอน deploy) | TL-6 `ledger/HANDOVER-2026-10-16-POS-P2.md:218` | พร้อม · `@@index` แล้ว |
| `one_open_session_per_table` (partial unique) | P2.4 มติ Q9 · `prisma/schema/restaurant.prisma:357` · `src/lib/modules/restaurant/table.ts:174` · QC4 มีอยู่แล้วโดยไม่มี migration (`ledger/POS-RESUME.md:1275`) | พร้อม · ต้องนับแถวซ้ำก่อน (§5.2) · คง SQL มืออย่างเดียว |
| `PosSaleLine.refLineId` | P1.8 · `prisma/migrations/20261128000000_pos_p18_refund/migration.sql:4` | พร้อม · `@@index` แล้ว |
| `PosSale.customerPartyId` · `PosSale.crmDealId` | P3.6 · `prisma/schema/pos.prisma:142` · `prisma/migrations/20261219100100_pos_p36_credit/migration.sql:2` (`sweepDealIntents` รายชั่วโมงอ่าน `crmDealId`) | พร้อม · `@@index` แล้ว |
| ผลวัดของ P5.3 (index/batching) | `ledger/pos-briefs/pos-brief-P5.md:110` · `:154` | **pending P5.3** (ถ้า P5.3 เพิ่ม index ใหม่ ⇒ เพิ่มทั้ง §5.1 · `HAND_INDEXES` · `@@index` · migration no-op ใบใหม่) |

## 6. env

| ชื่อ | ใช้ที่ | ทำอะไร | ใครตั้ง · เมื่อไร |
|---|---|---|---|
| `POS_DEVICE_KEY` | `src/lib/env.ts:27` · `src/lib/modules/pos/device-cookie.ts:15` `:17` `:35` `:47` (ยาว ≥ 32 ตัว · `POS_DEVICE_KEY_MIN`) | **W40** กุญแจลงนามคุกกี้จับคู่เครื่องขาย — ไม่ตั้ง: จับคู่เบราว์เซอร์ไม่ได้ (`DEVICE_KEY_UNSET`) และเปิดกะจากหน้ากะไม่ได้ (§1A ข้อ e) · ค่า = `openssl rand -hex 32` · ห้ามใช้ค่าเดียวกับ `POS_CREDENTIALS_KEY` / `CHAT_CREDENTIALS_KEY` / `SESSION_SECRET` · หมุนกุญแจ = ทุกเครื่องต้องจับคู่ใหม่ (ยังไม่มีระบบหมุน — หนี้) | ⛔ GO-1 เจ้าของ (Vercel · Production) **ก่อน migrate / ก่อน merge** (CD-P61-R2) |
| `POS_CREDENTIALS_KEY` | `src/lib/modules/pos/secret-box.ts:4` `:12` (≥ 32 ตัว `:14`) | กุญแจกล่อง creds (แพลตฟอร์ม · ตรวจสลิป · e-Tax) — W4: **ตั้งบน prod ก่อนวาง creds ใด ๆ** (`openssl rand -hex 32`) · ห้ามใช้ค่าเดียวกับ `CHAT_CREDENTIALS_KEY`/`SESSION_SECRET`/`POS_DEVICE_KEY` · ไม่ตั้ง = การ์ดขึ้น "ยังไม่ตั้งกุญแจ" และบันทึกถูกปฏิเสธ | ⛔ GO-1 เจ้าของ (Vercel dashboard) — ถ้ายังไม่มี |
| `APP_URL` | ลิงก์ใบเสร็จออนไลน์/QR/webhook ของ POS | มีอยู่แล้วบน prod | ตรวจเท่านั้น |
| `SESSION_SECRET` | โทเคนพนักงาน/จอลูกค้า | มีอยู่แล้วบน prod | ตรวจเท่านั้น |
| `CRON_SECRET` | `/api/cron/*` | มีอยู่แล้ว (แพลตฟอร์ม) | ตรวจเท่านั้น |
| Beam keys | แพลตฟอร์ม (W20) | ไม่ใช่ env ของ POS | — |

`verify-prod-pos.mts` ข้อ V1 รายงานแค่ "ตั้ง/ไม่ตั้ง" ในโปรเซสที่รัน (ไม่ใช่ Vercel · `ENV_NAMES` มี `POS_DEVICE_KEY` แล้ว) ⇒ env ของ Vercel ⛔ เจ้าของดูใน dashboard เอง · ห้ามพิมพ์ค่า. CD-P61-P5 ปิดแล้ว (ชื่อ = `POS_DEVICE_KEY`).

## 7. งานตั้งเวลา (cron) — ต้องถูกยิงจริงบน prod (ตรวจ ไม่เดา)

| งาน | อยู่ที่ | ถูกยิงโดย |
|---|---|---|
| `forceCloseStaleShifts` (ปิดกะค้าง) | `src/app/api/cron/hourly/route.ts:10` `:89-97` | `vercel.json:8-9` (`0 * * * *`) |
| `expirePaymentIntents` | `route.ts:11` `:98-106` | เดียวกัน |
| `expirePreorders` (สั่งล่วงหน้าเลยเวลาจ่าย) | `route.ts:12` `:107-115` | เดียวกัน |
| `sendPosDailyBriefs` (สรุปเช้า) | `route.ts:13` `:116-132` | เดียวกัน |
| `sweepPosBoard` (บอร์ดงาน 86/คืนเงิน) | `route.ts:133-142` | เดียวกัน |
| `sweepDealIntents` (บิลผูกดีล CRM) | `route.ts:143-152` | เดียวกัน |
| `pos.staffCommission.payroll` | `src/lib/platform/minute-jobs.ts:462-471` (cadence `hourly`) | **crontab VPS บรรทัด `crm-cron.mts hourly` (`7 * * * *`) เท่านั้น** — `scripts/crm-cron.mts` เรียก `runMinuteJobs` ด้วย cadence ของบรรทัดนั้น · `/api/cron/outbox` เรียกโดยไม่ระบุ cadence = `minute` (`src/app/api/cron/outbox/route.ts:21`) จึงไม่รันงานนี้ และไม่มีตัวตั้งเวลาชี้มา (`ledger/crm-briefs/crm-brief-RESOLUTIONS.md:36`) |
| `pos.slip.purge` (+ `expirePrintJobs`) | `minute-jobs.ts:474-486` (cadence `hourly`) | เดียวกัน |

⇒ โค้ดของงาน `pos.*` มาจาก **checkout ที่ crontab `cd` เข้าไป** (`/root/projects/shark-in-th`) ไม่ใช่จาก Vercel. ตรวจ 24 ต.ค. (`verify-prod-pos.mts --crons`): crontab มี 3 บรรทัด (minute `* * * * *` · hourly `7 * * * *` · daily `40 20 * * *`) · checkout อยู่ `main` ตามหลัง `origin/main` 43 commit · มีงาน `pos.*` 0 ตัว ⇒ W34 = "crontab มี · checkout ค้าง" (R1 F6 · CD-P61-R6).

ขั้นหลัง merge (⛔ GO-13 · หลัง build ของ merge ขึ้น READY):
```bash
# ⛔ GO-13 · ตรวจก่อน (อ่านอย่างเดียว · ไม่แตะ DB) — R1 OK · R2/R3 เตือน (ยังไม่เลื่อน)
env -C /root/pos-deploy bash scripts/iso.sh pnpm exec tsx scripts/verify-prod-pos.mts --crons
# ⛔ GO-13 · เลื่อน checkout ของ crontab ให้ตาม main — ถือ lock ของทั้ง 3 บรรทัดไว้ระหว่างอัปเดต (cron รอบที่ชนจะข้ามเองเพราะ flock -n · รอบที่กำลังรันจะจบก่อน ≤ 120 วิ)
git -C /root/projects/shark-in-th fetch origin main
flock /tmp/shark-crm-minute.cron.lock flock /tmp/shark-crm-hourly.cron.lock flock /tmp/shark-crm-daily.cron.lock bash -c 'git -C /root/projects/shark-in-th pull --ff-only origin main && env -C /root/projects/shark-in-th bash scripts/iso.sh pnpm install --frozen-lockfile'
# ⛔ GO-13 · ตรวจหลัง — ต้อง FAIL 0 (R2 = SHA เดียวกับ origin/main · R3 = มี pos.staffCommission.payroll + pos.slip.purge)
env -C /root/pos-deploy bash scripts/iso.sh pnpm exec tsx scripts/verify-prod-pos.mts --crons --post-merge
crontab -l | grep -c 'crm-cron.mts'
```
- `pull --ff-only` ล้ม (checkout มีของค้าง/แยกทาง) = หยุด ถามผู้คุม (R4 ของ `--crons` บอกจำนวนไฟล์ค้าง) · `crontab -l | grep -c` ต้องได้ `3`.
- ⚠️ สมมติฐาน: บรรทัด crontab ใช้ lock file ตามหัวไฟล์ `scripts/crm-cron.mts:16-18` (`/tmp/shark-crm-{minute,hourly,daily}.cron.lock` — `--crons` ตรวจแค่เวลา/โหมด/path ไม่พิมพ์ส่วนอื่นของบรรทัด) · ถ้าไม่ตรง flock ข้างบนจะไม่กันรอบที่ชน (ผลเสีย = รอบนั้นล้มระหว่าง install · รอบถัดไปปกติ).
- ⚠️ สมมติฐาน: checkout นี้ใช้ `.env` ของตัวเอง (= prod · CRM-C6-REGISTER 1.3) และ `pnpm install --frozen-lockfile` ของ main ผ่านบนเครื่องนี้ (node v20.20.2 · `@zxing/library` แค่เตือน engines · §1 แถว 1.8 · R2-F3).
- รอบชั่วโมงถัดไป (นาทีที่ 7): `verify-prod-pos.mts` ข้อ S9 ต้องแสดง `ok ล่าสุด` ของทั้งสองงานภายใน 2 ชม. (§10) · hourly ของ Vercel: OpsEvent/บันทึกท้ายรอบมี `posShiftsForced` ≥ 0.

## 8. backfill (ลำดับ · ทีละร้าน · dry-run ก่อนเสมอ)

ลำดับ (มติ P6 §10-4 · คงไว้): **catalog → `--verify` = 0 → `backfillWebPrices` → ข้อมูล P1.9 → ธง**.

**เมื่อไร**: ปกติหลัง merge (GO-16…GO-19) · ยกเว้นร้านในคิวรี (f) ของ §1A (`registerV2 = true` อยู่แล้ว · K2 > 0) ที่เจ้าของเลือกทาง 1 = ทำขั้น 1–5 ของร้านเหล่านั้น **ระหว่าง GO-10 กับ GO-12** (GO-11b · ใช้ `--tenant=<tenant_id>` ของคิวรี f) แล้วรันขั้น 3 (`--verify`) ซ้ำหลัง GO-12 · `--verify` ≠ 0 หลัง merge = หยุด ถามผู้คุม (R2-F2).

⛔ ด่านเดียวของสคริปต์เขียนทั้ง 3 ตัว (CD-P61-R3 · R1 F3 · ทุกคำสั่งในหัวข้อนี้ = เจ้าของสั่ง) = `scripts/lib/pos-prod-writer-guard.mts`: URL มาจาก `env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL"` หลัง `iso.sh` เท่านั้น (ไม่โหลด `.env` / `BACKFILL_ENV_FILE` ใด ๆ — เดิมโหลด `.env` ของทรีแบบเงียบ) · host ไม่อยู่ใน allowlist = หยุด exit 4 ก่อนต่อฐาน · prod ต้อง `ALLOW_PROD_BACKFILL=1` + `--tenant=<id>` (ซ้ำได้) หรือ `--all` · รันจริงต้องมี `--dry-run` ของ host + ชุดร้านเดียวกันภายใน 24 ชม. (ไฟล์ `.qc-shots/pos/<สคริปต์>-dryrun-<key>.json` ใน worktree deploy) · ทดสอบตัวเอง `pnpm exec tsx scripts/lib/pos-prod-writer-guard.mts --self-test` (21 กรณี). **ทุกคำสั่งต้องเห็นบรรทัด `[target] <สคริปต์> · role=prod · host=<ป้ายเดียวกับ --counts>…` ก่อนตอบ "ทำ"** — role ไม่ใช่ prod = หยุด.

1. ⛔ GO-16 แคตตาล็อก dry-run (ทีละร้าน หรือ `--all` ที่พิมพ์เอง · C13) — ตัวเลขส่ง TG ให้เจ้าของ:
   ```bash
   # ⛔ GO-16 · dry-run (อ่านอย่างเดียว · เขียนแค่ไฟล์บันทึกในเครื่อง)
   env -C /root/pos-deploy bash scripts/iso.sh env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-catalog.mts --tenant=<tenant-id> --dry-run
   ```
   ผลที่คาด: `[target] pos-backfill-catalog · role=prod · host=…  · DRY-RUN` · `ร้าน 1 · แหล่ง InvItem N · MenuItem N · ShopProduct N` · `ตัวนับ (เจ้าของควรดูก่อนเปิดใช้): {…}` · `จะสร้าง {…} · จะผูกคอลัมน์เชื่อม {…}` · `บันทึก dry-run ไว้ที่ .qc-shots/pos/pos-backfill-catalog-dryrun-….json` · exit 0 · `JSON_SUMMARY`. ตัวนับราคาที่ต้องดูกับเจ้าของ (DRAFT §4): `soldAtCostToday` · `apIgnoredButTillPriced` · `invalidLegacyPrice` · `priceNotSetOther` · `catalogPriceDiffersFromTill` (เทียบราคาที่เก็บจริง ไม่ใช่คิดใหม่).
2. ⛔ GO-16 เจ้าของตอบ "ทำ" → รันจริง = คำสั่งเดียวกัน **ไม่มี `--dry-run`** (ต้องมี dry-run ชุดร้านเดียวกันภายใน 24 ชม.) · idempotent: รอบสอง `สร้าง` ทุกตัว 0 · `ผูกคอลัมน์เชื่อม` ทุกตัว 0.
   ```bash
   # ⛔ GO-16 · เขียนจริง
   env -C /root/pos-deploy bash scripts/iso.sh env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-catalog.mts --tenant=<tenant-id>
   ```
3. ⛔ GO-17 `--verify` (อ่านล้วน) ต้อง exit 0 ทุกร้าน — รันซ้ำ **หลัง** backfill เพราะการแก้ของเดิมที่แข่งกับ backfill อาจทิ้ง drift (P1.1b hunter #3):
   ```bash
   # ⛔ GO-17 · อ่านอย่างเดียว · ผลที่คาด: [verify] … ขาดแถว {"invItem":0,"menuItem":0,"shopProduct":0} · drift 0 · exit 0
   env -C /root/pos-deploy bash scripts/iso.sh env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-catalog.mts --tenant=<tenant-id> --verify
   ```
4. ⛔ `backfillWebPrices` (`src/lib/modules/pos/catalog.ts:3561` · ทีละร้านในธุรกรรมเดียว · รันซ้ำได้ · ต้องก่อนเปิดอ่านราคาเว็บสองทาง — HANDOVER-P2 :219) ผ่าน CLI ใหม่ `scripts/pos-backfill-web-prices.mts` (CD-P61-P8 · ด่านเดียวกัน):
   ```bash
   # ⛔ GO-18 · dry-run · ผลที่คาด: [target] pos-backfill-web-prices · role=prod … · ร้าน 1 · สินค้าที่ตรวจ N · จะเขียน N · ราคาเว็บชนกัน N (+ รายการ ⚠️ ชนกัน ≤ 20) · exit 0
   env -C /root/pos-deploy bash scripts/iso.sh env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-web-prices.mts --tenant=<tenant-id> --dry-run
   # ⛔ GO-18 · เจ้าของตอบ "ทำ" → จริง · รอบสอง "เขียน 0"
   env -C /root/pos-deploy bash scripts/iso.sh env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-web-prices.mts --tenant=<tenant-id>
   ```
   ชนกัน (ShopProduct หลายตัวของสินค้าเดียวตั้งราคาต่างกัน) = สคริปต์ไม่เขียนแถวนั้น · เจ้าของเลือกราคาเว็บเองในหน้าสินค้า. QC4 dry-run 24 ต.ค.: 34 ร้าน · ตรวจ 5 · จะเขียน 0 · ชนกัน 1.
5. ⛔ ข้อมูล P1.9 (OQ-P19-1 = (a)): ทุกระบบ POS ที่ `registerV2` = true อยู่แล้วตอน deploy และยังไม่ตั้งคีย์เอง → ตั้ง `settings.pos.shift.required.register = false` (ไม่งั้นค่าปริยาย = บังคับเปิดกะทันที · `src/lib/modules/pos/shift.ts:48-55`) ผ่าน CLI ใหม่ `scripts/pos-shift-required-off.mts` (CD-P61-P8 · ล็อกแถว + เขียนเฉพาะ `settings.pos.shift.required` + AuditLog `pos.settings.updated` ผู้กระทำ SYSTEM ในธุรกรรมเดียว · ค่าที่ร้านตั้งเองแล้วไม่แตะ):
   ```bash
   # ⛔ GO-19 · dry-run ทุกร้าน · ผลที่คาด: ระบบ POS ที่ registerV2=true N · ตั้งค่า required.register เองแล้ว N (ไม่แตะ) · จะตั้ง false N + รายการระบบ · N ≤ K2 ของ --counts
   env -C /root/pos-deploy bash scripts/iso.sh env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-shift-required-off.mts --all --dry-run
   # ⛔ GO-19 · เจ้าของตอบ "ทำ" → จริง · รอบสอง "จะตั้ง false 0"
   env -C /root/pos-deploy bash scripts/iso.sh env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-shift-required-off.mts --all
   ```
   ถอยกลับ: ร้านเปิด "บังคับเปิดกะ" เองในตั้งค่า › ทั่วไป. QC4 dry-run 24 ต.ค.: 2 ระบบ (= S3/K2 ของ QC4).
6. ทุกขั้น: ตัวเลข dry-run → TG → เจ้าของ "ทำ" → จริง → รอบสอง = 0 (CRM §9 C6.2) · exit ≠ 0 = หยุด.

## 9. เปิดใช้ทีละร้าน (rollout) · ธง/สวิตช์ · การถอยกลับ

- ⛔ GO-15 **จับคู่เครื่องขาย (CD-P61-R2 · W40)**: หลัง merge (กุญแจ `POS_DEVICE_KEY` ขึ้นแล้วกับ build นั้น) ผู้จัดการเปิด POS › ตั้งค่า › เครื่องขาย บน **ทุกเบราว์เซอร์ที่ใช้ขาย** แล้วกด "จับคู่เบราว์เซอร์นี้" 1 ครั้ง ก่อนขายบิลแรกบนเครื่องนั้น · สาขาที่มีเครื่อง ≥ 1 แล้วปฏิเสธการเขียนที่ไม่มีคุกกี้ (409 `DEVICE_NOT_PAIRED`) · คุกกี้ 1 ใบต่อเบราว์เซอร์ (จับคู่สาขาอื่น = แทนที่) · หมุนกุญแจ = จับคู่ใหม่ทุกเครื่อง · **ไม่มีระบบหมุนกุญแจ (หนี้ · บันทึกใน HANDOVER)**.
- ร้านทดลองก่อน (W5 — ยังไม่มีร้านทดลอง) · ร้านอื่นคง V1/ปิด จนเจ้าของสั่ง (W-next-10).
- ⛔ GO-20 ก่อนเปิด `registerV2` ของร้าน: เจ้าของทบทวนสิทธิ์ — พนักงานที่ถือ `pos.*` จะได้ `pos.sale.priceOverride` (ราคาเปิด + รายการกำหนดเอง) ทันที (m2 · P1.3 S3.47/S3.54) · บัญชีเครดิต/สมุดทิป = OWNER หรือ MANAGER `"*"` เท่านั้น (§1A ข้อ d).

| ธง/สวิตช์ (`AppSystem(POS).settings.pos.*` ต่อระบบ) | ค่าปริยาย | อ่านที่ | ถอยกลับ |
|---|---|---|---|
| `registerV2` | ปิด (ต้อง `=== true`) | `src/lib/modules/pos/register-shared.ts:109-112` | ตั้งเป็น false → กลับหน้าขายเดิม (แท็บเก่าที่ไม่มี deviceId ต้องโหลดใหม่) |
| `offline.enabled` | ปิด | `src/lib/modules/pos/offline-shared.ts:51-57` | ปิด → เครื่องหยุดรับขายออฟไลน์ใหม่ · บิลที่ค้างซิงก์ยังซิงก์ได้ |
| `credit.enabled` (+ `requireBuyer`) | ปิด | `src/lib/modules/pos/credit-settings.ts:39-41` | ปิด → ไม่รับวางบิลใหม่ · ยอดค้างเดิมคงอยู่ |
| `chat.receiptAuto` · `chat.refundNotice` · `chat.orderStatus` · `chat.autoReply` | ปิดทั้ง 4 | `src/lib/modules/pos/chat-link-shared.ts:24-31` | ปิดรายตัวในหน้าตั้งค่า |
| `board.enabled` (+ rules) · `teamRoom` | ปิด | `src/lib/modules/pos/board-settings-shared.ts:37-45` | ปิด → cron ไม่สร้างการ์ดใหม่ |
| `ai.enabled` · `ai.brief.enabled` | ปิด | `src/lib/modules/pos/ai-brief.ts:152` · `ai-settings-actions.ts:6` | ปิด → ไม่ส่งสรุปเช้า |
| `deposit.enabled` · `serviceCharge.enabled` · `tip.enabled` | ปิด | `src/lib/modules/pos/payment-settings.ts:32-35` `:67-77` | ปิดรายตัว |
| แพลตฟอร์ม/ตรวจสลิป/e-Tax (creds `PLATFORM` · `SLIP_VERIFY` · `ETAX`) | ไม่มี creds = ปิด | `src/lib/modules/pos/integration-creds.ts:19-20` | ลบ/ปิด creds ในหน้าตั้งค่า · ต้องมี `POS_CREDENTIALS_KEY` ก่อน (§6) |
| พิมพ์ผ่าน LAN (print agent) | ไม่มี agent = ปิด | `src/lib/modules/pos/print-relay.ts:108` `:135` | `revokePrintAgent` |
| `shift.required.register` | เปิดสำหรับ registerV2 (ค่าปริยาย) | P1.9 · `src/lib/modules/pos/shift.ts:48-55` | ข้อมูลขั้น §8.5 (`pos-shift-required-off.mts`) · ร้านเปิดเองได้ |

- ถอยกลับทั้งร้าน = ปิดธงตามตาราง (ไม่ต้องย้อน migration · ข้อมูลเพิ่มอย่างเดียว).
- ถอยกลับทั้งระบบ (R1 F8): ⛔ promote build ก่อนหน้าบน Vercel ได้ **เฉพาะก่อนเขียนข้อมูล V2 ครั้งแรก** — หลังจากนั้น Prisma client ของ main เดิมเจอค่า enum ใหม่ (`PosPayType` CARD / PLATFORM / GIFT_CARD / STORE_CREDIT / ON_ACCOUNT · `PosOrderPaymentState` …) แล้วโยนตอนอ่าน · แถวคืนเงิน/ใบลดหนี้ (`PosSale.docType` = REFUND) ถูกรายงานเดิมนับเป็นยอดขาย · มัดจำโมดูลที่เป็นใบรับ POS_DEPOSIT (§1A ข้อ b — **ไม่มีธง** ⇒ เกิดได้ทันทีหลัง merge) โค้ด booking/hotel เดิมคืนไม่ได้. ⇒ **หลังเขียน V2 ครั้งแรก: ถอยกลับ = ปิดธง + แก้ไปข้างหน้า (forward fix · deploy โค้ดที่แก้)** · ห้าม promote build เก่า. ตรวจว่ายังไม่มีการเขียน V2 (ทุกค่า = 0 ⇒ promote ยังได้):
  ```bash
  # ⛔ GO-22 (เฉพาะเหตุร้ายแรง) · อ่านอย่างเดียว
  psql "$PROD_DIRECT_URL" -X -Atc "SELECT (SELECT count(*) FROM \"PosPayment\" WHERE type::text IN ('CARD','PLATFORM','GIFT_CARD','STORE_CREDIT','ON_ACCOUNT')) AS new_enum_payments, (SELECT count(*) FROM \"PosSale\" WHERE \"docType\"::text = 'REFUND') AS refund_docs, (SELECT count(*) FROM \"PosSale\" WHERE \"sourceModule\" = 'POS_DEPOSIT') AS deposit_receipts, (SELECT count(*) FROM \"PosOrder\") AS pos_orders, (SELECT count(*) FROM \"PosShift\") AS shifts"
  ```
- SQL ถอยกลับในภาคผนวก ก = เฉพาะ migration ที่ล้ม (§4.4) — ไม่ใช่ทางถอยปกติ.

## 10. ตรวจหลัง deploy — `scripts/verify-prod-pos.mts`

```bash
# รายการข้อ (ไม่แตะ DB)
env -C /root/pos-deploy bash scripts/iso.sh pnpm exec tsx scripts/verify-prod-pos.mts --list
# ⛔ GO-6 · ก่อน migrate: จำนวนแถว + ทาง §3.2 + ตัวเลข §1A (อ่านอย่างเดียว)
env -C /root/pos-deploy bash scripts/iso.sh env ALLOW_PROD_AUDIT=1 DATABASE_URL="$PROD_DIRECT_URL" pnpm exec tsx scripts/verify-prod-pos.mts --counts
# ⛔ GO-10 / GO-21 · ตรวจเต็ม (อ่านอย่างเดียว · host ต้องอยู่ใน allowlist + ALLOW_PROD_AUDIT=1 · ไม่โหลด .env)
env -C /root/pos-deploy bash scripts/iso.sh env ALLOW_PROD_AUDIT=1 DATABASE_URL="$PROD_DIRECT_URL" pnpm exec tsx scripts/verify-prod-pos.mts
# ⛔ GO-13 · crontab + checkout ของงาน pos.* (ไม่แตะ DB)
env -C /root/pos-deploy bash scripts/iso.sh pnpm exec tsx scripts/verify-prod-pos.mts --crons --post-merge
# self-test บน QC4 (เลนปกติ · ไม่ใช่เจ้าของ)
env -C /root/projects/shark-pos bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/verify-prod-pos.mts --self-test
```

| ส่วน | ข้อ | ก่อน migrate (`--counts`) | หลัง migrate (GO-10) | หลัง merge + §5.2 | หลัง backfill | ทุกวัน 24 ชม. แรก |
|---|---|---|---|---|---|---|
| ด่าน | G1 · RO · P0 | G1 · RO 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| จำนวน | K1 · K2 · K3 · K4 | ตัดสินทาง §3.2 · จดตัวเลข · K4 = 0 | | | | |
| migration | M1 · M2 · M3 | | 🟢 (37/37 POS V2 + ไฟล์ POS เดิม) | 🟢 | 🟢 | 🟢 |
| schema | T1 · C1 · E1 · I1 | | 🟢 | 🟢 | 🟢 | 🟢 |
| index มือ | X1 | | 🟢 14/15 (🟡 เฉพาะ `one_open_session_per_table`) | 🟢 15/15 | 🟢 | 🟢 |
| ข้อมูล | S1 · S2 | | S2 🟢 · S1 ดูตัวเลข (เตือนได้ · P9) | | | |
| ธง/ค่าตั้ง | S3 · S4 | | จดตัวเลข (registerV2 = true กี่ระบบ → §8.5) | | ร้านทดลองเท่านั้นที่เปลี่ยน | |
| แคตตาล็อก | S5 | | linked = 0 | | linked ตรง dry-run · `--verify` 0 | |
| คิว/ops | S6 · S7 | | จด baseline | | | FAILED 0 · ERROR 0 (CRM C6.1) |
| integration | S8 · V1 | | creds 0 | | | creds > 0 ⇒ `POS_CREDENTIALS_KEY` ตั้งแล้ว |
| งานรายชั่วโมง | S9 · `--crons` R1–R4 | R1 🟢 · R2/R3 🟡 (ยังไม่เลื่อน) | | `--crons --post-merge` FAIL 0 · S9 ok ภายใน 2 ชม. หลังนาทีที่ 7 | | S9 🟢 |

exit 0 = ไม่มี FAIL · ผล `JSON_SUMMARY` ทุกรอบวางใน ledger/wo-notes/pos-P6.1.md (สร้างตอนซ้อม).

## 11. จุดที่ต้องให้เจ้าของสั่ง ⛔ (W32 · ทีละขั้น · เรียงตามลำดับทำจริง)

1. ⛔ GO-1 ตั้ง env Vercel production `POS_DEVICE_KEY` (+ `POS_CREDENTIALS_KEY` ถ้ายังไม่มี) — §4.1 · §6 · W40 · W4.
2. ⛔ GO-2 เลือกหน้าต่างนอกเวลาขาย + ใครรัน (W-next-8 · W32) — §4.1.
3. ⛔ GO-3 รับทราบพฤติกรรมที่เปลี่ยนโดยไม่มีธง (§1A ข้อ a–e) หลังดูผลคิวรี — CD-P61-R4.
4. ⛔ GO-4 ตอบหรือรับค่าเริ่มต้น W37 · W38 · W39 · W41 · W19 (§1 แถว 1.16–1.19 · ส่งไปพร้อม merge).
5. ⛔ GO-5 เตรียม worktree สะอาดที่ `<PR_HEAD_SHA>` + ตัวแปร URL — §4.0.
6. ⛔ GO-6 อ่านอย่างเดียวบน prod: `verify-prod-pos.mts --counts` + transaction/ล็อก — §3.4 (W33) → เลือกทาง ก/ข/ค/ง ของ §3.2.
7. ⛔ GO-7 พิสูจน์ `lock_timeout` ผ่าน URL (อ่านอย่างเดียว) — §3.3 (ทางสำรอง = ALTER ROLE).
8. ⛔ GO-8 สร้าง Neon branch จุดย้อนกลับ · แล้วขั้นก่อน deploy ของทาง ข/ค/ง (GO-8b/8c/8d) — §4.1 · §3.2.
9. ⛔ GO-9 `prisma migrate status` → `prisma migrate deploy` จาก VPS (§4.2) · ทาง ข: GO-9b ทาไฟล์มือ · ทาง ง/ทุกทาง: GO-9d §5.1 · ล้ม: `migrate resolve --rolled-back` (§4.4).
10. ⛔ GO-10 ด่านแข็ง: `migrate status` up to date + `verify-prod-pos.mts` M1/M2/T1/C1/E1/I1 เขียว — ไม่เขียว ห้าม merge.
11. ⛔ GO-11 ห้าม merge PR อื่นที่มี migration ระหว่าง GO-10 กับ GO-12 · จด `MAIN_AT_GO10` · ⛔ GO-11b ถ้า K2 > 0: §8.1–8.5 ของร้านในคิวรี (f) ก่อน merge (หรือ GO-3f-2 ปิดธง) — §1A ข้อ f.
12. ⛔ GO-12 ด่านแช่แข็ง `verify-prod-pos.mts --pr-freeze <PR_HEAD_SHA> --main-at "$MAIN_AT_GO10"` FAIL 0 → merge PR `session/pos` → `main` (W-next-11) · ดู log `[vercel-build]` "No pending migrations to apply." — §4.3.
13. ⛔ GO-13 เลื่อน checkout ของ crontab VPS + `verify-prod-pos.mts --crons --post-merge` — §7 (W34 · CD-P61-R6).
14. ⛔ GO-14 นับ session ซ้ำ = 0 → `one_open_session_per_table` CONCURRENTLY → ตรวจ 15 แถว — §5.2–§5.3.
15. ⛔ GO-15 คิวรี (e) + จับคู่เบราว์เซอร์ทุกเครื่องขายก่อนบิลแรก — §1A · §9 (W40 · CD-P61-R2).
16. ⛔ GO-16…GO-19 backfill: catalog dry-run → จริง → `--verify` 0 → `pos-backfill-web-prices` → `pos-shift-required-off` (ทุกตัว dry-run → "ทำ" → จริง → รอบสอง 0) — §8.
17. ⛔ GO-20 ทบทวนสิทธิ์ priceOverride + เครดิต/ทิป ก่อนเปิดธงร้านแรก — §9.
18. ⛔ GO-21 `verify-prod-pos.mts` บน prod หลัง backfill + เปิดธงร้านทดลอง (W5) — §9 · §10.
19. ⛔ ขายจริง 1 บิล + Z report + ออเดอร์ MANUAL ลงบัญชีที่ร้านทดลอง (หลักฐานปิด `POS-MASTER-PLAN.md:142-143`).
20. ⛔ GO-22 (เฉพาะเหตุร้ายแรง) ถอยกลับทั้งระบบ: ตรวจว่ายังไม่มีการเขียน V2 ก่อน promote — §9 · ไม่งั้น forward fix.

## 12. ดัชนีหลักฐาน (evidence pack)

- บันทึกการซ้อม/deploy จริง: ledger/wo-notes/pos-P6.1.md (สร้างตอนซ้อม) (ชื่อ branch · log migrate · ทาง §3.2 ที่ใช้ · ผล `--counts` · ผลพิสูจน์ `lock_timeout` · ตัวเลข dry-run · ผล verify · ด่าน + qc:all · ลบ branch).
- งานเตรียม: `ledger/wo-notes/pos-P6.1-prep.md` (ตาราง migration · ผล `--self-test` บน QC4 · red-before ของ `qc-pos-p6.1`) · ผู้ตรวจ R1: ledger/wo-notes/pos-P6.1-prep-review.md (ทรีผู้คุม) · รอบแก้ 1: `ledger/wo-notes/pos-P6.1-fix1.md` (ต่อข้อ F1–F16 · หลักฐาน `lock_timeout` บน QC4 · diff ของ schema parity · dry-run ของ CLI ทั้ง 3).
- ดัชนีรวมสุดท้าย = HANDOVER-POS ฉบับปิด (P6.2 · มติ P6 §10-9) — ข้อที่ต้องเจ้าของ (ขายจริงที่ร้านทดลอง = W5) ติดป้าย "owner".
- ข้อความ PR: ledger/pos-briefs/pos-PR-main.md (ยังไม่มี — ผู้คุมเขียนหลัง P3.12/P4/P5 ปิด · ต้องมีลำดับ §0 + นโยบายถอยกลับ §9).

## ภาคผนวก ก — SQL ถอยกลับ (เฉพาะ migration ที่ล้มกลางทาง)

กติกา: รันเฉพาะของไฟล์ที่ล้ม · ทีละคำสั่ง autocommit · ทุกคำสั่ง `IF EXISTS` (คำสั่งถอยกลับรันซ้ำได้) · ลำดับ = index → คอลัมน์ → ตาราง → type (ย้อนลำดับสร้าง) · 🔴 **ไฟล์ `stmt` รันซ้ำทั้งไฟล์ไม่ได้** (20 ไฟล์ (นับใหม่ใน fix1 — R1 นับ 19) มี `CREATE TYPE`/`CREATE TABLE`/`ADD COLUMN`/`CREATE INDEX` แบบไม่มี IF NOT EXISTS เช่น `pos_p19_shift` · `pos_p111_online_receipt` · `pos_p34_offline` — R1 F7) ⇒ ไฟล์ stmt ที่ล้ม **ต้อง**รันบล็อกของมันก่อน `migrate resolve --rolled-back` และ deploy ใหม่ · ไฟล์ `DO` เป็น atomic ⇒ ปกติไม่มีอะไรต้องถอย (บล็อกมีไว้กรณีรันมือ) · ค่า enum ที่เพิ่มถอนไม่ได้ (ปล่อยไว้) · จบแล้ว ⛔ `prisma migrate resolve --rolled-back <name>` (§4.4) · ทาง ข ของ §3.2 (ไฟล์มือ p111/p34 ล้ม) = รันบล็อกของไฟล์นั้นแล้วรันไฟล์มือใหม่ทั้งไฟล์ (ไม่ต้อง resolve — บันทึกไว้แล้ว).

#### 20261120000000_pos_v2_a
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosCategory_systemId_name_all_branches_key";
DROP INDEX IF EXISTS "RecipeLine_productId_invItemId_key";
DROP INDEX IF EXISTS "RecipeLine_invItemId_idx";
DROP INDEX IF EXISTS "RecipeLine_tenantId_idx";
DROP INDEX IF EXISTS "PosProductOptionGroup_productId_groupId_key";
DROP INDEX IF EXISTS "PosProductOptionGroup_groupId_idx";
DROP INDEX IF EXISTS "PosProductOptionGroup_tenantId_idx";
DROP INDEX IF EXISTS "PosProduct_systemId_invItemId_key";
DROP INDEX IF EXISTS "PosProduct_parentId_idx";
DROP INDEX IF EXISTS "PosProduct_systemId_barcode_idx";
DROP INDEX IF EXISTS "PosProduct_systemId_archivedAt_name_id_idx";
DROP INDEX IF EXISTS "PosProduct_tenantId_idx";
DROP INDEX IF EXISTS "PosCategory_systemId_unitId_name_key";
DROP INDEX IF EXISTS "PosCategory_tenantId_idx";
DROP TABLE IF EXISTS "RecipeLine";
DROP TABLE IF EXISTS "PosProductOptionGroup";
DROP TABLE IF EXISTS "PosProduct";
DROP TABLE IF EXISTS "PosCategory";
DROP TYPE IF EXISTS "PosProductKind";
RESET lock_timeout;
```

#### 20261120000001_pos_v2_a_links
```sql
SET lock_timeout = '3s';
ALTER TABLE "RestaurantOrderItem" DROP COLUMN IF EXISTS "productId";
ALTER TABLE "MenuItem" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "productId";
ALTER TABLE "ShopOrderLine" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopProduct" DROP COLUMN IF EXISTS "posProductId";
RESET lock_timeout;
```

#### 20261121000000_pos_p15_held_cart
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosHeldCart_unitId_status_createdAt_idx";
DROP TABLE IF EXISTS "PosHeldCart";
DROP TYPE IF EXISTS "PosHeldCartStatus";
RESET lock_timeout;
```

#### 20261122000000_pos_p16_payment
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "note";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "tipSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "serviceChargeSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "note";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "tenderedSatang";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "reference";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "changeSatang";
-- PosPayType 'CARD': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
RESET lock_timeout;
```

#### 20261123000000_pos_p19_shift
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "one_open_shift_per_device";
DROP INDEX IF EXISTS "PosShiftCounter_unitId_key";
DROP INDEX IF EXISTS "PosCashMovement_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosCashMovement_shiftId_idx";
DROP INDEX IF EXISTS "PosShift_unitId_zNumber_key";
DROP INDEX IF EXISTS "PosShift_unitId_shiftNo_key";
DROP INDEX IF EXISTS "PosShift_tenantId_unitId_status_idx";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "shiftId";
DROP TABLE IF EXISTS "PosShiftCounter";
DROP TABLE IF EXISTS "PosCashMovement";
DROP TABLE IF EXISTS "PosShift";
DROP TYPE IF EXISTS "PosCashMoveKind";
DROP TYPE IF EXISTS "PosShiftStatus";
RESET lock_timeout;
```

#### 20261124000000_pos_p12_options
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosProduct_systemId_scalePlu_active_key";
DROP INDEX IF EXISTS "PosSaleLineOption_lineId_idx";
DROP INDEX IF EXISTS "PosSaleLineOption_saleId_idx";
DROP INDEX IF EXISTS "PosSaleLineOption_tenantId_idx";
ALTER TABLE "PosProduct" DROP COLUMN IF EXISTS "soldByWeight";
ALTER TABLE "PosProduct" DROP COLUMN IF EXISTS "scalePlu";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "weightGrams";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "components";
DROP TABLE IF EXISTS "PosSaleLineOption";
RESET lock_timeout;
```

#### 20261125000000_pos_p19b_shift_recount
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosShiftRecount_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosShiftRecount_tenantId_unitId_createdAt_idx";
DROP INDEX IF EXISTS "PosShiftRecount_shiftId_key";
DROP TABLE IF EXISTS "PosShiftRecount";
RESET lock_timeout;
```

#### 20261126000000_pos_p117_reports
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "soldByUserId";
RESET lock_timeout;
```

#### 20261127000000_pos_p114_stock_count
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosStockCount_open_location_key";
DROP INDEX IF EXISTS "PosStockCountEntry_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosStockCountEntry_countId_idx";
DROP INDEX IF EXISTS "PosStockCountLine_countId_itemId_key";
DROP INDEX IF EXISTS "PosStockCountLine_tenantId_idx";
DROP INDEX IF EXISTS "PosStockCount_unitId_countNo_key";
DROP INDEX IF EXISTS "PosStockCount_tenantId_openKey_key";
DROP INDEX IF EXISTS "PosStockCount_tenantId_unitId_status_idx";
DROP TABLE IF EXISTS "PosStockCountEntry";
DROP TABLE IF EXISTS "PosStockCountLine";
DROP TABLE IF EXISTS "PosStockCount";
DROP TYPE IF EXISTS "PosStockCountScope";
DROP TYPE IF EXISTS "PosStockCountStatus";
RESET lock_timeout;
```

#### 20261128000000_pos_p18_refund
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosDocCounter_unitId_docType_period_key";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "restock";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "refLineId";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "refundedSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "refSaleId";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "reasonCode";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "docType";
DROP TABLE IF EXISTS "PosDocCounter";
DROP TYPE IF EXISTS "PosSaleDocType";
RESET lock_timeout;
```

#### 20261128100000_pos_p110_devices
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosDevice_unitId_deviceCode_key";
DROP INDEX IF EXISTS "PosDevice_tenantId_unitId_status_idx";
DROP TABLE IF EXISTS "PosDevice";
DROP TYPE IF EXISTS "PosDeviceStatus";
RESET lock_timeout;
```

#### 20261129000000_pos_p111_online_receipt
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosSale_publicToken_key";
DROP INDEX IF EXISTS "PosTaxInvoiceRequest_tenantId_status_createdAt_idx";
DROP INDEX IF EXISTS "PosTaxInvoiceRequest_tenantId_saleId_idx";
DROP INDEX IF EXISTS "PosReceiptIssue_tenantId_saleId_createdAt_idx";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "publicToken";
DROP TABLE IF EXISTS "PosTaxInvoiceRequest";
DROP TABLE IF EXISTS "PosReceiptIssue";
DROP TYPE IF EXISTS "PosTaxInvoiceRequestStatus";
DROP TYPE IF EXISTS "PosReceiptIssueStatus";
RESET lock_timeout;
```

#### 20261130000000_pos_p115_staff_pin_approval
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosApprovalPayload_tenantId_kind_idx";
DROP INDEX IF EXISTS "PosStaffPin_unitId_userId_key";
DROP INDEX IF EXISTS "PosStaffPin_tenantId_unitId_idx";
ALTER TABLE "PosHeldCart" DROP COLUMN IF EXISTS "approvedRequestId";
DROP TABLE IF EXISTS "PosApprovalPayload";
DROP TABLE IF EXISTS "PosStaffPin";
RESET lock_timeout;
```

#### 20261130100000_pos_p17_payment_intent
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosPaymentIntent_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosPaymentIntent_beamChargeId_idx";
DROP INDEX IF EXISTS "PosPaymentIntent_tenantId_unitId_status_createdAt_idx";
DROP TABLE IF EXISTS "PosPaymentIntent";
RESET lock_timeout;
```

#### 20261201100000_pos_p113_tax_invoice
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosBuyerProfile_tenantId_taxId_idx";
DROP INDEX IF EXISTS "PosBuyerProfile_customerId_key";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "taxInvoiceDocId";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "taxInvoice";
ALTER TABLE "AccountDocument" DROP COLUMN IF EXISTS "supersededByDocId";
DROP TABLE IF EXISTS "PosBuyerProfile";
RESET lock_timeout;
```

#### 20261202100000_pos_p112_member_snapshot
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "memberBenefits";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "memberSnapshot";
RESET lock_timeout;
```

#### 20261203100000_pos_p21_sales_channel
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "SalesChannel_tenantId_systemId_unitId_idx";
DROP INDEX IF EXISTS "SalesChannel_unitId_code_key";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelCommissionVatSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelCommissionSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelPayout";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelRef";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelCode";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelId";
DROP TABLE IF EXISTS "SalesChannel";
DROP TYPE IF EXISTS "SalesChannelPayout";
DROP TYPE IF EXISTS "SalesChannelAdapter";
DROP TYPE IF EXISTS "SalesChannelKind";
-- PosPayType 'PLATFORM': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
RESET lock_timeout;
```

#### 20261204100000_pos_p22_prices
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosPriceRule_tenantId_systemId_archivedAt_idx";
DROP INDEX IF EXISTS "PosProductChannelPrice_tenantId_systemId_productId_idx";
DROP INDEX IF EXISTS "PosProductChannelPrice_product_code_unit_key";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "priceSource";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "priceRuleId";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "listPriceSatang";
DROP TABLE IF EXISTS "PosPriceRule";
DROP TABLE IF EXISTS "PosProductChannelPrice";
DROP TYPE IF EXISTS "PosPriceRuleAdjust";
DROP TYPE IF EXISTS "PosPriceRuleKind";
DROP TYPE IF EXISTS "PosPriceSource";
RESET lock_timeout;
```

#### 20261205100000_pos_p23_recipe
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosRecipeChoiceLine_productId_choiceId_invItemId_key";
DROP INDEX IF EXISTS "PosRecipeChoiceLine_invItemId_idx";
DROP INDEX IF EXISTS "PosRecipeChoiceLine_tenantId_idx";
ALTER TABLE "PosProduct" DROP COLUMN IF EXISTS "bomEnabled";
DROP TABLE IF EXISTS "PosRecipeChoiceLine";
RESET lock_timeout;
```

#### 20261206100000_pos_p24_tables
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "RestaurantReservation_unitId_at_idx";
DROP INDEX IF EXISTS "RestaurantReservation_tenantId_idx";
DROP INDEX IF EXISTS "PosHeldCart_tableSessionId_held_key";
ALTER TABLE "RestaurantTable" DROP COLUMN IF EXISTS "dirtySince";
ALTER TABLE "PosHeldCart" DROP COLUMN IF EXISTS "tableSessionId";
DROP TABLE IF EXISTS "RestaurantReservation";
DROP TYPE IF EXISTS "RestReservationStatus";
RESET lock_timeout;
```

#### 20261207100000_pos_p28_orders
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosOrder_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosOrder_tenantId_channelId_externalRef_key";
DROP INDEX IF EXISTS "PosOrder_tenantId_unitId_status_receivedAt_idx";
DROP TABLE IF EXISTS "PosOrderEvent";
DROP TABLE IF EXISTS "PosOrderLine";
DROP TABLE IF EXISTS "PosOrder";
DROP TYPE IF EXISTS "PosOrderFulfilment";
DROP TYPE IF EXISTS "PosOrderPaymentState";
DROP TYPE IF EXISTS "PosOrderStatus";
RESET lock_timeout;
```

#### 20261208100000_pos_p26_kds
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosAvailabilityMark_tenantId_unitId_idx";
DROP INDEX IF EXISTS "PosAvailabilityMark_unitId_productId_key";
DROP INDEX IF EXISTS "RestaurantOrder_posOrderId_key";
DROP INDEX IF EXISTS "RestaurantOrder_posSaleId_key";
ALTER TABLE "RestaurantSetting" DROP COLUMN IF EXISTS "autoAcceptMaxOpen";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "targetMinutes";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "externalRef";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "channelName";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "channelCode";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "posOrderId";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "posSaleId";
DROP TABLE IF EXISTS "PosAvailabilityMark";
DROP TYPE IF EXISTS "PosAvailabilitySource";
RESET lock_timeout;
```

#### 20261208100100_pos_p26_stock_taken
```sql
SET lock_timeout = '3s';
ALTER TABLE "RestaurantOrderItem" DROP COLUMN IF EXISTS "stockTaken";
RESET lock_timeout;
```

#### 20261208100200_pos_p26_station_set_at
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosProduct" DROP COLUMN IF EXISTS "stationSetAt";
RESET lock_timeout;
```

#### 20261209100000_pos_p29_tenders
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "GiftCard_storeCredit_owner_key";
ALTER TABLE "GiftCard" DROP COLUMN IF EXISTS "kind";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "giftCardTxnId";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "giftCardId";
DROP TYPE IF EXISTS "GiftCardKind";
-- PosPayType 'GIFT_CARD': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
-- PosPayType 'STORE_CREDIT': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
RESET lock_timeout;
```

#### 20261210100000_pos_p25_split
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosTableSplitLine_itemId_idx";
DROP INDEX IF EXISTS "PosTableSplitLine_splitId_idx";
DROP INDEX IF EXISTS "PosTableSplitPart_saleId_key";
DROP INDEX IF EXISTS "PosTableSplitPart_splitId_no_key";
DROP INDEX IF EXISTS "PosTableSplitPart_tenantId_idx";
DROP INDEX IF EXISTS "PosTableSplit_session_open_key";
DROP INDEX IF EXISTS "PosTableSplit_sessionId_idx";
DROP INDEX IF EXISTS "PosTableSplit_tenantId_unitId_idx";
DROP TABLE IF EXISTS "PosTableSplitLine";
DROP TABLE IF EXISTS "PosTableSplitPart";
DROP TABLE IF EXISTS "PosTableSplit";
DROP TYPE IF EXISTS "PosTableSplitPartStatus";
DROP TYPE IF EXISTS "PosTableSplitStatus";
DROP TYPE IF EXISTS "PosTableSplitMode";
RESET lock_timeout;
```

#### 20261211100000_pos_p29b_deposits
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosDepositTxn_saleId_idx";
DROP INDEX IF EXISTS "PosDepositTxn_depositId_idx";
DROP INDEX IF EXISTS "PosDepositTxn_idempotencyKey_key";
DROP INDEX IF EXISTS "PosDeposit_tenantId_customerId_idx";
DROP INDEX IF EXISTS "PosDeposit_tenantId_unitId_status_createdAt_idx";
DROP INDEX IF EXISTS "PosDeposit_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosDeposit_receiptSaleId_key";
DROP TABLE IF EXISTS "PosDepositTxn";
DROP TABLE IF EXISTS "PosDeposit";
DROP TYPE IF EXISTS "PosDepositTxnType";
DROP TYPE IF EXISTS "PosDepositStatus";
RESET lock_timeout;
```

#### 20261211110000_pos_p29b_deposit_phone_lock
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosDeposit" DROP COLUMN IF EXISTS "phoneLockedUntil";
ALTER TABLE "PosDeposit" DROP COLUMN IF EXISTS "phoneFailedCount";
RESET lock_timeout;
```

#### 20261215100000_pos_p210_customer_display
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosCustomerDisplay_tenantId_unitId_status_idx";
DROP INDEX IF EXISTS "PosCustomerDisplay_pairCodeHash_key";
DROP INDEX IF EXISTS "PosCustomerDisplay_active_device_key";
DROP INDEX IF EXISTS "PosCustomerDisplay_tokenHash_key";
DROP TABLE IF EXISTS "PosCustomerDisplay";
DROP TYPE IF EXISTS "PosCustomerDisplayStatus";
RESET lock_timeout;
```

#### 20261216100000_pos_p27_qr_orders
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosOrderLink_active_unit_key";
DROP INDEX IF EXISTS "PosOrderLink_tenantId_unitId_status_idx";
DROP INDEX IF EXISTS "PosOrderLink_token_key";
DROP INDEX IF EXISTS "PosPaymentIntent_orderId_idx";
DROP INDEX IF EXISTS "PosOrder_tenantId_unitId_paymentState_payBy_idx";
DROP INDEX IF EXISTS "PosOrder_publicToken_key";
ALTER TABLE "PosPaymentIntent" DROP COLUMN IF EXISTS "orderId";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "publicToken";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "paymentIntentId";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "customerClaimAt";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "paidAt";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "payBy";
DROP TABLE IF EXISTS "PosOrderLink";
-- PosOrderPaymentState 'PENDING_PAYMENT': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
-- PosOrderPaymentState 'PREPAID': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
-- SalesChannelAdapter 'QR': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
-- PosPaymentIntent DROP NOT NULL (deviceId · createdByUserId): ปล่อยไว้ — SET NOT NULL กลับล้มถ้ามีแถว null
RESET lock_timeout;
```

#### 20261217100000_pos_p35_staff_commission
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosStaffCommission_saleId_idx";
DROP INDEX IF EXISTS "PosStaffCommission_tenantId_userId_status_periodKey_idx";
DROP INDEX IF EXISTS "PosStaffCommission_sourceKey_key";
DROP TABLE IF EXISTS "PosStaffCommission";
DROP TYPE IF EXISTS "PosStaffCommissionStatus";
DROP TYPE IF EXISTS "PosStaffCommissionKind";
RESET lock_timeout;
```

#### 20261217110000_pos_p34_offline
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosDevice_unit_offlineCode_key";
DROP INDEX IF EXISTS "PosSale_unit_offlineRef_key";
DROP INDEX IF EXISTS "PosOfflineSnapshot_tenantId_unitId_deviceId_issuedAt_idx";
DROP INDEX IF EXISTS "PosOfflineSnapshot_unitId_deviceId_hash_key";
DROP INDEX IF EXISTS "PosOfflineSale_tenantId_unitId_offlineRef_idx";
DROP INDEX IF EXISTS "PosOfflineSale_tenantId_unitId_status_soldAt_idx";
DROP INDEX IF EXISTS "PosOfflineSale_tenantId_idempotencyKey_key";
ALTER TABLE "PosDevice" DROP COLUMN IF EXISTS "offlineSeq";
ALTER TABLE "PosDevice" DROP COLUMN IF EXISTS "offlineCode";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "syncedAt";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "offlineRef";
DROP TABLE IF EXISTS "PosOfflineSnapshot";
DROP TABLE IF EXISTS "PosOfflineSale";
RESET lock_timeout;
```

#### 20261218100000_pos_p3skel
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosPrintJob_status_expiresAt_idx";
DROP INDEX IF EXISTS "PosPrintJob_agentId_status_createdAt_idx";
DROP INDEX IF EXISTS "PosPrintJob_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosPrintAgent_tenantId_unitId_idx";
DROP INDEX IF EXISTS "PosPrintAgent_tokenHash_key";
DROP INDEX IF EXISTS "PosPaymentSlip_purgeAfter_idx";
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_intentId_idx";
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_saleId_idx";
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_transRef_key";
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosIntegrationCredential_tenantId_systemId_unitId_idx";
DROP INDEX IF EXISTS "PosIntegrationCredential_tenantId_kind_provider_scopeKey_key";
DROP TABLE IF EXISTS "PosPrintJob";
DROP TABLE IF EXISTS "PosPrintAgent";
DROP TABLE IF EXISTS "PosPaymentSlip";
DROP TABLE IF EXISTS "PosIntegrationCredential";
RESET lock_timeout;
```

#### 20261218100100_pos_p3skel_slip_hash
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_sha256_key";
ALTER TABLE "PosPaymentSlip" DROP COLUMN IF EXISTS "sha256";
RESET lock_timeout;
```

#### 20261219100000_pos_p36_credit_enum
```sql
SET lock_timeout = '3s';
-- PosPayType 'ON_ACCOUNT': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
RESET lock_timeout;
```

#### 20261219100100_pos_p36_credit
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosCreditAccount_tenantId_idx";
DROP INDEX IF EXISTS "PosCreditAccount_systemId_partyId_key";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "creditTerms";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "crmDealId";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "customerPartyId";
DROP TABLE IF EXISTS "PosCreditAccount";
RESET lock_timeout;
```

#### 20261220100000_pos_p61_hand_indexes
```sql
SET lock_timeout = '3s';
-- เฉพาะกรณีไฟล์นี้ล้มกลางทางตอน deploy (ทาง ก) — index ที่ไฟล์นี้สร้างไปแล้วในรอบนั้น · ทาง ง ไม่ได้รันไฟล์นี้ (resolve) ⇒ ห้ามรันบล็อกนี้ (จะลบ index มือของ §5.1)
DROP INDEX IF EXISTS "PosOrderEvent_orderId_idx";
DROP INDEX IF EXISTS "PosOrderLine_orderId_idx";
DROP INDEX IF EXISTS "PosSale_crmDealId_idx";
DROP INDEX IF EXISTS "PosSale_customerPartyId_idx";
DROP INDEX IF EXISTS "PosSaleLine_refLineId_idx";
DROP INDEX IF EXISTS "PosSale_channelId_idx";
DROP INDEX IF EXISTS "PosSale_refSaleId_idx";
DROP INDEX IF EXISTS "PosSale_shiftId_idx";
DROP INDEX IF EXISTS "InvItem_tenantId_barcode_idx";
DROP INDEX IF EXISTS "RestaurantOrderItem_productId_idx";
DROP INDEX IF EXISTS "MenuItem_posProductId_idx";
DROP INDEX IF EXISTS "PosSaleLine_productId_idx";
DROP INDEX IF EXISTS "ShopOrderLine_posProductId_idx";
DROP INDEX IF EXISTS "ShopProduct_posProductId_idx";
RESET lock_timeout;
```

## ภาคผนวก ข — เปลี่ยนอะไรจาก DRAFT 3 ต.ค.

- รายการ migration 2 → 36 ไฟล์ พร้อมโหมด tx · lock_timeout · ชั้นล็อก · SQL ถอยกลับครบทุกไฟล์ (DRAFT §1 รู้จักแค่ `pos_v2_a`/`_links`).
- ตาราง pre-flight 5 → 12 ตาราง (+ index บนตารางเดิม 5 ตัว · ไฟล์ไม่มี lock_timeout 4 ไฟล์).
- เงื่อนไข §0: hotfix RC ไม่ใช่ตัวบล็อกแล้ว · `SYSTEM_MARKER_ALLOWLIST` และกติกา registerCatalog ทำแล้ว · `qc-prisma.sh` ยังไม่รู้จัก QC4 (ไม่บล็อก).
- index มือ: จาก "InvItem barcode + 5" → 15 ตัว (+ `PosSale` 5 · `PosSaleLine.refLineId` · order lines/events · `one_open_session_per_table`) + รายการ pending P5.3.
- เพิ่ม env (`POS_CREDENTIALS_KEY` · กุญแจอุปกรณ์ pending) · cron 8 งาน · ตารางธง/สวิตช์ + ทางถอย · ขั้นข้อมูล P1.9 (a) · m2 priceOverride.
- `scripts/verify-prod-pos.mts` แทน `scripts/prodmig.cjs` (มติ §10-3) · ข้อ O18 (`inv-cache-audit.mts` `ALLOW_PROD_AUDIT=1`) คงเป็นงานตรวจ prod ที่ค้าง (⛔ ทีละครั้ง).
- DRAFT §6 "ใครรัน deploy" → W32 (ค่าปริยาย = เจ้าของ).

### รอบแก้ 1 (P6.1 fix1 · 24 ต.ค. 2026 · R1 F1–F16 · CD-P61-R1…R6 · O1 · P4)
- F1/R1: ลำดับใหม่ env → migrate จาก VPS → `migrate status` ด่านแข็ง → merge (อธิบาย `scripts/vercel-build.sh:21-25` + ทางล้มของ build) — §0 · §4.
- F2/R2: แถว `POS_DEVICE_KEY` (W40 · ≥ 32 · ก่อน migrate) · ขั้นจับคู่เครื่องหลัง merge · ไม่มีระบบหมุนกุญแจ (หนี้) — §6 · §9 · verify `ENV_NAMES`.
- F3/R3: ด่านเดียวของสคริปต์เขียน (`scripts/lib/pos-prod-writer-guard.mts`) · `pos-backfill-catalog` ไม่โหลด `.env` ทางเขียน prod · CLI ใหม่ `pos-backfill-web-prices` · `pos-shift-required-off` (CD-P61-P8) + ผลที่คาด — §8.
- F4/R4: §1A ใหม่ (5 เรื่องที่เปลี่ยนโดยไม่มีธง + คิวรีหาร้านที่โดน + ⛔ ต่อข้อ) · verify `--counts` K3.
- F5/R5: verify `--counts` · ตารางกลยุทธ์ ก/ข/ค/ง + SQL ครบ (p111/p34 ทางมือ + resolve · p26/p29 สร้างล่วงหน้า · #37 resolve + §5.1) — §3.2 · §3.4.
- F6/R6: ขั้นเลื่อน checkout ของ crontab หลัง merge + verify `--crons [--post-merge]` + S9 (งาน `pos.*` = cadence hourly จาก crontab เท่านั้น) — §7 · §10.
- F7: ไฟล์ stmt รันซ้ำไม่ได้ — ถอยกลับก่อน resolve บังคับ · F8: promote build เก่าได้เฉพาะก่อนเขียน V2 + คิวรีตรวจ · F9: `lock_timeout` ผ่าน URL + หลักฐาน QC4 + ขั้นพิสูจน์ · แถว 1.4 ตัด · W34 · F10: worktree สะอาดที่ `<PR_HEAD_SHA>` · F11: แถว 1.13–1.21 (W37 W38 W39 W41 W19 W40 W33 W34) · F14: อ้างบรรทัดใหม่ · F15: ตรวจ index 15 แถว (แถวที่ไม่มีก็แสดง) · F16: role `rehearsal` = กติกา prod.
- P4: index มือ 14 ตัวเป็น `@@index` + migration #37 no-op · unique `PosProductChannelPrice_product_code_unit_key` ประกาศด้วยชื่อเดิม (migrate diff ของ Prisma 7.8 เห็น index นี้ — คอมเมนต์เดิมใน schema ว่า "มองไม่เห็น" ไม่จริง) · migration 36 → 37 ไฟล์.

### รอบแก้ 2 (P6.1 fix2 · 24 ต.ค. 2026 · R1 รอบ 2 R2-F1…F7)
- R2-F1: ด่านแช่แข็งที่ GO-12 (`git diff --stat` ของ prisma/src/package/lock/vercel/vercel-build ว่าง + ไม่มี migration ใหม่บน main ตั้งแต่ `MAIN_AT_GO10`) + `verify-prod-pos.mts --pr-freeze` — §4.2 · §4.3 ข้อ 0 · §11.
- R2-F2: §1A ข้อ f (ระบบ `registerV2 = true` · คิวรี f · ทาง 1 backfill ก่อน merge / ทาง 2 ปิดธง) + §8 "เมื่อไร" + GO-11b.
- R2-F3: แถว 1.8 + สมมติฐาน §7 = node v20.20.2 / pnpm 10.33.0 ของ VPS (เตือน engines เท่านั้น).
- R2-F4: ด่าน host ของ verify และสคริปต์เขียนเทียบทั้ง host (label `<mark>-<id>` ± `-pooler` + ท้าย `.neon.tech`) · สคริปต์เขียนปฏิเสธ `-pooler` บน prod/ซ้อม · self-test เพิ่มกรณีปลอมท้าย host / IP / ตัวพิมพ์ใหญ่ / PGHOSTADDR / pooler.
- R2-F5: §4.3 — `prisma generate` + `tsc` เต็มเป็นด่านของผู้คุม (การ์ด schema เปลี่ยน type ของ client).
- R2-F6: §4.4 ข้อ 6 — restore จาก GO-8 ทิ้งทุกการเขียนหลังจุดนั้น ⇒ ใช้ได้ก่อนมีการขายเท่านั้น.
- R2-F7: §4.0 — URL ว่าง/ถูกปฏิเสธ = `exit` (หยุด) ไม่เดินต่อ.
