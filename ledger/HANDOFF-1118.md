# ส่งมอบก่อนย้ายเครื่อง — 2026-11-18 (ทำโดย session ผู้คุม HR · เจ้าของอนุมัติ: "ไล่ให้ครบ · ปลอดภัยที่สุด · push ได้ · บันทึกทั้งหมด")

## 1. สิ่งที่อยู่บน origin แล้ว (repo `suksomsri7/shark`)
- ป้าย (tag) `backup-1118/…` **46 ป้าย** — ตรวจหลัง push แล้ว: sha บน origin = sha ในเครื่องครบ 46/46 · ตารางเต็ม `ledger/HANDOFF-1118-backup-refs.tsv` (ชนิด · ชื่อ · sha · ป้าย)
  - 26 ป้าย = ปลายสาขาในเครื่องที่ยังไม่อยู่ในสาขาใดบน origin (`backup-1118/<ชื่อสาขา>`) — HR ทั้งหมด (`session/hr` · `hotfix/hr-hf-tenant` · `wip/hr-vis-5a` `-5bc` `-5d` `-leave-3` `-preprod-1` `-priv-3` · `tmp/walk-vis5b` …) + `session/account-fix` · `wip/acc-t0` · `session/secretary` · `wip/sec-*` · `wip/crm-cf*` · `wip/svc-h6-oracle` · `archive/crm-c44f-2026-10-25`
  - 20 ป้าย = สำเนาไฟล์แก้ค้าง + ไฟล์ไม่ติดตามของแต่ละทรี (`backup-1118/wip/<ชื่อทรี>`) — commit ลูกของ HEAD ของทรีนั้น · **ไม่อยู่ในสาขาใด · ทรีและสาขาของ session อื่นไม่ถูกแตะ** · กัน `node_modules` `.env*` `*.pem/.p8/.p12` · สแกนไม่พบรหัสเชื่อมต่อ/คีย์ (สแกนด้วย python หลังพบว่า grep ของเครื่องล้มกับ pattern ยาว)
- วิธีใช้บนเครื่องใหม่: `git clone` → `git fetch origin 'refs/tags/backup-1118/*:refs/tags/backup-1118/*'` → สร้างสาขาคืน เช่น `git branch session/hr backup-1118/session/hr` (HR: **อย่า** ใช้ `origin/session/hr` — เก่ากว่า ~160 commit) · ดึงไฟล์ค้างของทรี: `git checkout backup-1118/wip/<ทรี> -- .` บนสาขาของทรีนั้น
- **ไม่ได้ทำ:** ไม่ push main · ไม่ทับ `session/*` บน origin · ไม่ deploy · ไม่ลบอะไร · push tag ไม่กระตุ้น CI (CI เฉพาะ push main) และ Vercel ไม่รัน migration นอก production (`scripts/vercel-build.sh`)
- ⚠ ป้าย `backup-1118/session/hr` ถูกย้ายให้ชี้ commit ล่าสุดหลังเขียนไฟล์นี้ (ดูบรรทัดท้าย)

## 2. ต้องคัดลอกเอง (ไม่อยู่ใน git · ผมไม่ได้ส่งขึ้นที่ใด)
- **ไฟล์ env 61 ไฟล์** ใน `/root/projects/shark-*/.env*` (+ `apps/*/.env*`) — มีรหัสฐานข้อมูล/คีย์ · สำคัญสุด: `shark-in-th/.env` `.env.local` `.env.production.local` (มี `NEON_API_KEY`) · HR: `shark-hr*/.env.qc` `.env.qc4` `.env.qc-hr` (ฐานต่อเลน) · `shark-hr-hf/.env.qc-hf` (ฐาน `hf_tenant` บน host เลน 5)
- `scripts/hr-expected.json` ในแต่ละทรี HR (gitignored · สร้างใหม่ได้ด้วย `seed-hr-qc`)
- `/root/qc/` 617 MB — ภาพหลักฐาน (hr-h5.1 · hr-vis5a-r4 · hr-vis5c-r1/r2 · hr-vis5d-r1) · สร้างใหม่ได้ด้วยการเดินหน้าจอ
- `/tmp/hr-ctl/` 121 MB — สคริปต์ผู้คุม (`walk/rewalk.sh` ฯลฯ) **อยู่ใต้ /tmp หายเมื่อรีบูต**
- `/root/.claude-b/` 3.6 GB — ความจำข้าม session + ประวัติ session ของบัญชี B (`projects/-root/memory/`)
- `node_modules` ของแต่ละทรี — ไม่ต้องย้าย (`pnpm install` + `prisma generate` ใหม่ · ต้องเป็นโฟลเดอร์จริงชื่อ node_modules)
- ฐานข้อมูลทดสอบทั้งหมดอยู่บน Neon (ไม่อยู่บนเครื่อง) — ต้องมีไฟล์ env ชี้ไปเท่านั้น

## 3. โฟลเดอร์อื่นใน /root/projects (ไล่แบบอ่านอย่างเดียว — **ไม่ได้แตะ**)
| โฟลเดอร์ | สถานะ |
|---|---|
| `crm` (github crm) | มีไฟล์แก้ค้าง 7 · ทุกสาขาอยู่บน remote |
| `kanban` (github kanban) | มีไฟล์แก้ค้าง **38** · ทุกสาขาอยู่บน remote |
| `hub` | ไฟล์ค้าง 4 · **มี 1 สาขายังไม่อยู่บน remote** |
| `siamdive` · `siamdive-xr` · `siamdive-rn` | สะอาด · **แต่ละตัวมี 1 สาขายังไม่อยู่บน remote** |
| `siamdive-xr-models` | ไฟล์ค้าง 1 |
| `coach-app` `goodfood` `lucid-dreams` `siamdive-maps` `siamdive2` `tudtu` | สะอาด ขึ้น remote ครบ |
| **ไม่ใช่ git (ต้องคัดลอกเองถ้าจะเก็บ):** `shark` (26M โครงเก่า) · `_archive-crm-2026-10-25` · `c16-backup` + `c16-*.patch` · `shark-acc-backup` · `lekaa-brand` · `blog` · `n8n` · `bluevilla` 827M · `smilewatchshop` 950M · `siamdive2-divemap` 940M · `siamdive-app` · `siamdive-xr-*` (clips/dark/docs/linear/merge/p1/place/sand/school) | — |
| `shark-svc-nm-*` (~5.6 GB) | คลัง node_modules ของเลน SVC — สร้างใหม่ได้ ไม่ต้องย้าย |
นอก /root/projects ไม่ได้ไล่ (เช่น /root/studio-docu · /root/bots · /root/dive3d · /root/asset-masters · /root/.siamdive · /root/logo-L)

## 4. จุดต่องานของ HR
`ledger/HR-RESUME.md` บล็อก "⏸ พัก — 2026-11-18" + บรรทัดเพิ่มท้าย (สถานะทุกเลน · งานที่เหลือ · รายการรอเจ้าของ)
