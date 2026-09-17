# WO C<x>.<y> — <ชื่อใบ>

> RUN "CRM v2" · worktree `/root/projects/shark-crm` · branch `session/crm` · <วันที่> · ผู้คุมงาน: Opus 5 · builder: <ตัวแทน/โมเดล>
> (โหมด Codex ใช้ `session/crm-codex` — เขียนชื่อ branch ที่ใช้จริงลงไป)
> สัญญา: `ledger/CRM-RUN.md` §2 C<x>.<y> + `ledger/CRM-MASTER-PLAN.md` §6 (แถว "แก้จากเดิม" ทับของเดิม) · ใบสั่ง `ledger/crm-briefs/crm-brief-C<x>.<y>.md` (+ COMMON + RESOLUTIONS)
> พิมพ์เขียว `docs/modules/20-crm-v2.md` §… · ภาพ `ledger/design-crm/NN-*.png`
> ข้อสอบ: `scripts/qc-crm-c<x>.<y>.mts` (N ข้อ · commit test: <hash> · **แก้หลัง commit หรือไม่: ไม่/ใช่ (ดู §6)**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ (ใหม่/แก้) | ทำอะไร |
|---|---|---|

## 2. migration / seed / backfill (ถ้ามี)
- migration: ชื่อ (`_crm_v2_a|b|c` เท่านั้น · ใบ C1.1/C2.0/C3.0) · additive ล้วน (ยืนยันว่าไม่มี DROP/ALTER ทำลาย/NOT NULL ไม่มี default) · รันบน QC แล้ว
- seed: เพิ่มอะไร · `scripts/crm-qc-env.mts` เปลี่ยนอะไร · `scripts/crm-expected.json` ยังถูกเขียนใหม่ทุกครั้ง
- backfill: สคริปต์ · dry-run ผล · รันจริงผล · idempotent ยืนยันอย่างไร

## 3. ด่าน 12 ข้อ (MASTER-PLAN §3 — ทุกข้อต้องมีหลักฐาน · ข้อที่ผ่านไม่ได้ ⇒ ลงตาราง §7 หนี้ พร้อมใบที่จะปิด)
| # | ด่าน | ผ่าน? | หลักฐาน (วางของจริง ไม่ใช่คำบรรยาย) |
|---|---|---|---|
| D1 | ข้อสอบเขียนก่อนโค้ด โดยตัวแทนแยก และเคยแดง/SKIPPED | ☐ | commit `test(crm): C<x>.<y>` <hash> + บรรทัดสรุปตอนแดง |
| D2 | ข้อสอบเขียวครบเมื่อ **ผู้คุมงานรันซ้ำเอง** หลัง reseed | ☐ | `JSON_SUMMARY {...}` |
| D3 | กลุ่ม X ครบทุกหัวข้อที่เกี่ยว (ไม่เกี่ยว = เหตุผล 1 บรรทัด) | ☐ | ตาราง §4 ด้านล่าง |
| D4 | regression: ข้อสอบ CRM ใบก่อนหน้า + ชุดของโมดูลที่ใบนี้แตะ | ☐ | บรรทัดสรุปต่อชุด (§5) |
| D5 | `pnpm typecheck` สะอาด · `pnpm fitness` ผ่านทั้งมี env และ `env -u DATABASE_URL` | ☐ | บรรทัด `FINDINGS:`/`JSON_SUMMARY` ทั้ง 3 คำสั่ง |
| D6 | build ผ่าน (`bash scripts/iso.sh bash scripts/acc-v2-serve.sh`) | ☐ | exit 0 + พอร์ตขึ้น |
| D7 | ภาพ owner · thana · nok · manager · (portal: customer) ทั้ง 1440 และ 390 · ผู้คุมงานเปิดดูคู่ mockup เอง · ไม่มี overflow | ☐ | path ภาพ + `PARITY: ผ่าน/ตีกลับ + เหตุผล` (§6) |
| D8 | ทุก element ที่กดได้มี `data-testid` + แถวใน `scripts/crm-ui-inventory.json` | ☐ | diff ของทะเบียน + ผล F14.1/F14.2 |
| D9 | ผู้ตรวจ (ตัวแทนแยก) อ่าน diff แล้วไม่มี BLOCKER | ☐ | สรุปรายงานผู้ตรวจ |
| D10 | เอกสาร: op ใหม่มี `test:` id · docs API ไม่ stale · สิทธิ์ใหม่มีป้ายไทย · event ใหม่ครบ 3 ทะเบียน | ☐ | ผล F13.x |
| D11 | wo-notes ครบตามแม่แบบนี้ + ตารางหนี้ + ข้อมูล QC คืนสภาพ (`qc-member-m1.9` ยังได้ 30/15/10/5) | ☐ | ไฟล์นี้ + JSON_SUMMARY ของ m1.9 |
| D12 | commit → push main → Vercel READY → (ถ้ามี migration) `_prisma_migrations` บน prod มีแถวใหม่ → Telegram สรุป % | ☐ | hash · สถานะ deploy |

## 4. กลุ่มข้อสอบ X (MASTER-PLAN §4 — ทุกใบต้องมีตารางนี้ครบ 10 แถว)
| กลุ่ม | เกี่ยวกับใบนี้? | check ids (ถ้าเกี่ยว) / เหตุผลที่ N-A (1 บรรทัด ถ้าไม่เกี่ยว) |
|---|---|---|
| X1 ขอบเขต (ข้ามร้าน · ข้ามระบบ · ข้ามทีม · ข้ามบริษัท ⇒ 404) | ☐ ใช้ / ☐ N-A | `C<x>.<y>-X1.1` … |
| X2 คีย์ API และผู้ช่วย AI (scope `crm.*` · bundle อ่านอย่างเดียว · ตัวกรอง owner/team · สิทธิ์ผู้ถาม) | ☐ ใช้ / ☐ N-A | |
| X3 ยิงพร้อมกัน (ตัวนับ/ยอดสะสม/ตัวชี้ ≥10 ทาง connection แยก) | ☐ ใช้ / ☐ N-A | |
| X4 ส่งซ้ำ (consumer เดิม 2 รอบ + 2 รอบพร้อมกัน ⇒ เกิดครั้งเดียว) | ☐ ใช้ / ☐ N-A | |
| X5 จองแถวงานตามเวลา (cron 2 รอบซ้อน · ตายหลังจอง แล้ว lease หมด) | ☐ ใช้ / ☐ N-A | |
| X6 ข้อมูลเข้าอันตราย (`csvRow` · เพดานนำเข้า · URL http/https · SSRF · sanitize · หัวอีเมล · ไฟล์) | ☐ ใช้ / ☐ N-A | |
| X7 endpoint สาธารณะ (`checkRateLimitDb` · token ≥128 บิตเก็บเป็น hash · ตอบเหมือนกันทุกกรณี · CORS) | ☐ ใช้ / ☐ N-A | |
| X8 PDPA (ตรวจ consent ตอนส่งจริง · optOut/bounce · payload/log ไม่มี PII · อยู่ในรายการ erase/export) | ☐ ใช้ / ☐ N-A | |
| X9 การกระทำอันตราย (confirm + เหตุผล ≥5 ตัวอักษร · เพดาน bulk · approval · แถว audit ทุก mutation) | ☐ ใช้ / ☐ N-A | |
| X10 ความลับและไฟล์ (route ตรวจสิทธิ์+หมดอายุ · ไม่มี URL CDN ใน DTO · secret เป็น hash · cookie secure) | ☐ ใช้ / ☐ N-A | |

## 5. ผลข้อสอบ (วาง JSON_SUMMARY จริง — ห้ามสรุปเป็นคำพูด)
- `qc-crm-c<x>.<y>`: `JSON_SUMMARY {...}`
- regressions: `qc-crm` · `qc-crm-activity` · `qc-crm-c1.*` ก่อนหน้า · <ชุดของโมดูลที่ใบนี้แตะ ตาม §6 ของ MASTER-PLAN> — JSON_SUMMARY แต่ละชุด
- `bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` · `bash scripts/iso.sh pnpm fitness` · `bash scripts/iso.sh env -u DATABASE_URL pnpm fitness` · build (ถ้ามี UI)

## 6. ภาพ (ถ้ามี UI · D7)
คำสั่ง: `bash scripts/iso.sh bash scripts/acc-v2-serve.sh` → `pnpm exec tsx scripts/visual-crm.mts <wo> --user <owner|manager|thana|nok|customer:รหัส>`
| หน้า | mockup | ภาพจริง (path) | ผู้ใช้ | จอ | overflow | จุดต่างที่เห็นเอง |
|---|---|---|---|---|---|---|
- `PARITY: ผ่าน / ตีกลับ — <เหตุผล>`

## 7. ข้อแย้ง / มติทางเทคนิค (พร้อมหลักฐาน)
- ข้อสอบ id … : เชื่อว่าผิดเพราะ … (อ้างพิมพ์เขียว §… / โค้ด file:line) · ปล่อยแดง / `ORACLE-EDIT <ชุด>-<ข้อ>` (ผู้คุมงานเป็นคนแก้ + บันทึกใน `ledger/CRM-RUN.md` §4)
- สเปกขาด: … → ตัดสินใจ … (ย้อนกลับได้อย่างไร)

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|

## 9. คืนสภาพ QC
- ข้อสอบ `finally` ลบอะไร · seed ยังตรงเฉลยหลังรัน (ยืนยันด้วย seed ซ้ำหรือนับ) · ไม่มีแถว `qc-<wo>-*` ค้าง · ไม่มี session `qc-visual-crm` ค้าง
