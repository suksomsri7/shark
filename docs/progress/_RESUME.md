# _RESUME.md — คู่มือรับช่วงงานต่อ (Claude account ใหม่ / session ใหม่)

> อัปเดต 2026-07-12 โดย Fable 5 · **อ่านไฟล์นี้ + `_HANDOFF.md` ก่อนเริ่มเสมอ**
> จุดประสงค์: ให้ Claude account อื่นมาทำงานต่อได้โดยงานไม่สะดุด แม้ session เดิมติด limit

## 0. งานถูกเซฟครบแล้ว ณ ตอนนี้ (ไม่มีอะไรค้างใน working tree)
- ทุกอย่าง commit แล้ว — `git status` = ว่าง · branch `main` · commit ล่าสุด `b44f17e`
- **Session A (บัญชี QC7 R-A..R-E) ยังทำไม่จบ** — โค้ด WIP ถูกเซฟไว้ใน commit `b44f17e` `[WIP CHECKPOINT]` (7 CRITICAL ยังปิดไม่ครบ **ห้าม deploy commit นี้ขึ้น prod**)
- Session B (Chat QC7 M9-M12) เสร็จ+deploy Vercel prod แล้ว

## 1. งานทั้งหมดอยู่บน VPS เครื่องนี้ + GitHub
- repo: `/root/projects/shark-in-th` (branch `main`)
- ✅ **push GitHub แล้ว (2026-07-12)** — `github.com/suksomsri7/shark.git` มี main ครบ (backup นอกเครื่องแล้ว) · **token ไม่ได้เก็บบนเครื่อง** (push แบบ inline แล้วลบ) → push ครั้งหน้าต้องใส่ PAT อีก หรือตั้ง credential helper เอง
- memory ของ Claude อยู่ `/root/.claude/projects/-root/memory/` (ไม่ track ใน git — เครื่องใหม่ต้องขนไปเอง)
- memory ของ Claude อยู่ `/root/.claude/projects/-root/memory/` (ผูกกับเครื่อง+user root **ไม่ผูกกับ Claude account**)

## 2. วิธี resume — 2 ทาง

### ทาง A (ง่ายสุด แนะนำ): Claude account ใหม่ บน VPS เครื่องเดิม
1. ล็อกอิน Claude Code เป็น user `root` บน VPS นี้ (SSH เดิม) — account ไหนก็ได้
2. `cd /root/projects/shark-in-th`
3. บอก Claude: **"อ่าน docs/progress/_HANDOFF.md + docs/progress/_RESUME.md + docs/qc/QC7-RESOLUTIONS.md ก่อน แล้วทำงานต่อ"**
4. เสร็จ — memory เดิมโหลดอัตโนมัติ (อยู่ใต้ /root/.claude), .env ครบอยู่แล้ว, ไม่ต้อง setup อะไร

### ทาง B: เครื่องใหม่ (ยุ่งกว่า — ต้องขนของ)
ต้องมี 3 อย่างจากเครื่องเดิม เพราะ repo ไม่ได้อยู่บน GitHub:
1. **repo** — `tar czf shark.tgz -C /root/projects shark-in-th` แล้วก๊อปไป (หรือ push GitHub ก่อน = แนะนำ ดูข้อ 5)
2. **ไฟล์ env** (gitignored ไม่ติดไปกับ repo) — ก๊อป `.env` + `.env.production.local` แยกต่างหาก
3. **memory** — ก๊อป `/root/.claude/projects/-root/memory/` ทั้งโฟลเดอร์
จากนั้น `pnpm install` → `pnpm exec prisma generate` → ทำงานต่อ

## 3. คีย์/ความลับ อยู่ที่ไหน (ไม่ panic — อยู่บนเครื่องครบ)
**ห้ามพิมพ์ค่าคีย์ลงไฟล์ที่ track ใน git** (จะรั่วถ้า push) — ทุกค่าอยู่ในที่ปลอดภัยแล้ว:

| คีย์ | อยู่ที่ | ใช้ทำอะไร |
|---|---|---|
| DATABASE_URL / DIRECT_URL | `.env` (Neon Singapore, pooled+direct) | DB — ทุก query + prisma |
| SESSION_SECRET | `.env` | เซ็นเซสชันล็อกอิน |
| RESEND_API_KEY / EMAIL_FROM | `.env` + `.env.production.local` | ส่งอีเมล OTP (noreply@shark.in.th) |
| CHAT_CREDENTIALS_KEY | `.env` + `.env.production.local` + **Vercel env** | เข้ารหัส LINE token (AES-256-GCM) |
| CRON_SECRET | `.env` | header X-Cron-Secret |
| **Vercel token + projectId + orgId** | memory `reference_vercel_credentials` | deploy prod |
| Neon connection string | memory `project_shark_in_th` | สำรอง |

- env บน **Vercel** (prod) ตั้งครบแล้ว — ดู/แก้: `vercel env ls --scope siamdives-projects --token=<VT>`
- env บน **VPS** อยู่ในไฟล์ `.env*` ที่ repo แล้ว

## 4. คำสั่ง deploy (จำเป็นต้องรู้)
- **Vercel prod** (จาก tree สะอาด): `cd <repo> && pnpm dlx vercel@latest deploy --prod --yes --scope siamdives-projects --token=<VT ดู memory>`
- **VPS staging** (shark.suksomsri.cloud): `cd <repo> && pnpm build && pm2 restart shark --update-env` (pm2 ชื่อ `shark` port 3801)
- **golden rules ตอน deploy หลาย session ทำพร้อมกัน:**
  1. ถ้า working tree มี WIP ของ session อื่น → **deploy ผ่าน git worktree** ที่ commit สะอาด (อย่า deploy tree ที่ปน WIP): `git worktree add /tmp/dep <commit> && cp -r .vercel /tmp/dep/ && cd /tmp/dep && vercel deploy --prod ...` แล้ว `git worktree remove /tmp/dep --force`
  2. **ห้าม `git stash`** เด็ดขาด (ดึงไฟล์ออกจากมือ session อื่นที่กำลังพิมพ์)
  3. worktree ต้องมี `.vercel/` (ก๊อปจาก repo หลัก) ไม่งั้นไปสร้าง project ใหม่ที่ไม่มี env → build fail
- **แตะ account ทุกครั้ง** ต้องรัน `pnpm exec tsx scripts/qc-account-cpa.mts` = **107/107** ก่อน deploy

## 5. ✅ push GitHub แล้ว — วิธี push ครั้งต่อไป
มี backup บน `github.com/suksomsri7/shark.git` แล้ว (2026-07-12). token ไม่ได้เก็บบนเครื่อง — ครั้งหน้าใช้ PAT (scope `repo`) แบบ inline แล้วลบทิ้ง:
```
cd /root/projects/shark-in-th
git -c credential.helper= push "https://suksomsri7:<PAT>@github.com/suksomsri7/shark.git" main:main
git remote set-url origin https://github.com/suksomsri7/shark.git   # ล้าง token
```
⚠️ commit author = `suksomsri7` (ตั้งใน `-c user.name/email` ทุก commit) · `.env*` gitignored ไม่หลุด (เช็คแล้ว) · ถ้าอยากให้ push ไม่ต้องพิมพ์ PAT ซ้ำ → ตั้ง credential helper (เก็บ token plaintext ใน ~/.git-credentials — เป็น tradeoff ความปลอดภัย ตัดสินใจเอง)

## 6. งานที่ค้าง (สั่ง session ใหม่ต่อได้เลย)
- **Session A ค้าง**: บัญชี QC7 R-A..R-E (7 CRITICAL + MAJOR M1-M8) ตาม `docs/qc/QC7-RESOLUTIONS.md` — resume จาก `b44f17e` · เสร็จแล้ว co-deploy VPS พร้อม Chat
- **Session HR/Inventory**: ระบบ 17/18 ตาม `modules/18-hr.md`+`19-inventory.md` + contract C-1/C-2
- **VPS staging รอ co-deploy** Chat+account พร้อมกันทีเดียว (ตอนนี้ Vercel=chat fix แล้ว, VPS ยังเก่า)
- ค้างนาน: MINOR ~12 ข้อใน QC7 · verify checksum เลขภาษีนิติบุคคล DBD ก่อน launch
