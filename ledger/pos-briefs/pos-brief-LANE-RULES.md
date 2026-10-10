# POS RUN — lane rules while the CRM RUN is still live (controller, 1 Oct 2026) — OVERRIDES pos-brief-COMMON / crm-brief-COMMON where they differ

Another Claude account is running the CRM RUN on this machine right now (4 lanes; worktrees `/root/projects/shark-crm*`; QC DBs QC1/QC2/QC3; server :3215). The owner's order for POS: **do only what cannot affect CRM.**

1. **Worktrees**: lane 1 = `/root/projects/shark-pos` (branch `session/pos`), lane 2 = `/root/projects/shark-pos-b` (detached, same base `origin/main` 04d2ade9). Work ONLY inside your own worktree. Never read-write, reset, clean or `cd` into `/root/projects/shark-crm*`, `/root/projects/shark-in-th` or any other worktree. Never sweep `/tmp`.
2. **Database = QC4 only** (`wo-pos-qc4`, host `ep-frosty-lab`, a private copy for POS). In POS worktrees `.env.qc` and `.env.qc4` both point at QC4. Every DB-touching command: `bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts` (with `env QC_FORCE=1` before `bash scripts/qc4.sh` when the oracle needs it). **Owner ruling 8 Oct 2026 (option A):** POS suites queue on their own lock `/tmp/shark-gate-pos.lock`, not on `/tmp/shark-gate-qc4.lock` that HR/AI/CRM lanes also hold via `qc4.sh` — no script change. Typecheck/build still queue on the machine-wide heavy locks. Never run a suite that wipes shared data (`seed-member-qc`, `seed-hr-qc`, any `migrate reset`) — those are the reason the shared lock existed. Never use `qc2.sh`/`qc3.sh`, never export another DATABASE_URL, never read/edit/source `.env` (production).
3. **No schema work**: no edits under `prisma/`, no `prisma migrate`, no `prisma generate`, no `prisma format` (node_modules is a bind mount SHARED with the CRM lanes — regenerating the client breaks them). No `pnpm install/add`.
4. **No build, no server**: never run `next build`, `acc-v2-serve.sh`, `next start/dev`. Port 3215 belongs to CRM. Anything needing a running app = hand back to the controller as "CONTROLLER-RUN".
5. **Heavy commands** (typecheck) queue behind the machine lock shared with CRM: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (the lock script's default 3584 MB heap OOMs on current main — exit 134; do not edit that script) — foreground, run it at most twice per work order (once mid-way if needed, once at the end). It can wait up to an hour for the lock; wait in the shell, do not end your turn, do not kill other processes to get the lock.
6. **Shared hot files** (CRM is editing them on its branch; conflicts are paid at merge time): `scripts/fitness.mts`, `src/lib/ai/skills.ts`, `src/lib/ai/tools.ts`, `src/lib/outbox-consumers.ts`, `src/lib/api/**`, `src/lib/api-keys/**`, `package.json`, `src/messages/*.json`, `scripts/qc-all.mts`. Touch only if your brief names the file, and then with the smallest possible hunk (append-only, one block marked `// POS <WO> ▸ … ◂`).
7. No `git commit/push` unless your brief says so (briefs here allow ONE safety commit on your own wip branch + push of that wip branch; never push `main` or `session/crm`). No `eas`, no deploy, no Telegram.
8. Checkpoint as you go: keep `ledger/wo-notes/pos-<WO>.md` updated (what is done, what is next, commands + final summary lines) so a restart can continue from the files.
9. Report in English, compact (format in crm-brief-COMMON "Reports").

## เลนภาพ (มติเจ้าของ 10 ต.ค. 03:1xZ — "ทำตามแนะนำ")
- **รอบแก้ (fix round) ถ่ายเฉพาะ state ที่ใบงานแตะ** ด้วย `--states --state a,b,c` (มีตั้งแต่ `visual-pos.mts` 15ac8680) · ไม่ถ่ายทั้งหน้า × 3 ผู้ใช้ × 2 ภาษา
- **ถ่ายเต็ม** (ทุกหน้า × owner/cashier × th/en) เฉพาะ **จุด merge** และ **ปิดเฟส**
- ผู้คุมเปิดดูภาพเฉพาะ state ใหม่ + สุ่ม 1–2 ใบ · ที่เหลือให้ harness ตัดสิน (testid-step · console · overflow · 5xx)
- แก้แค่ harness/ledger = ไม่ build ใหม่ (server เดิมเสิร์ฟโค้ดเดิม) · builder ระบุรายการ `--state` ที่ผู้คุมต้องถ่ายไว้ท้ายโน้ต
- ฝั่ง builder: brief/prompt ต้องตัดสินทุกข้อเปิดล่วงหน้า (rulings) — รอบแก้ 1 รอบแพงกว่าภาพทั้งรอบ

## คุณภาพมาก่อน (มติเจ้าของ 10 ต.ค. 05:1xZ — "ทำตามที่แนะนำ")
- คง: Fable คุม / Opus ทำ (builder + ผู้ตรวจทุกใบ ไม่ลดเป็น Sonnet) · oracle แดงก่อนสร้าง → builder → ด่านเต็ม → ผู้ตรวจอิสระ → รอบแก้ → R2 → ภาพเต็มที่ merge · เพดาน 3 เลน (builder ≤ 2)
- **เพิ่ม 1 — hunter เลนเงินทุกจุด merge** (ไม่รอ P5.1): หลังผู้ตรวจ R-final MERGEABLE และก่อน merge ใบ S ที่แตะเงิน/สต็อก/บัญชี เปิดผู้ตรวจอ่านอย่างเดียว 1 คน (Opus) ไล่เฉพาะ race · idempotency · ตัดสต็อก · ลงบัญชี · void/refund ของใบนั้น (prompt `pos-prompt-accountB-<wo>-H.md`) → ผลลง `wo-notes/pos-<wo>-hunt.md` · พบ Medium+ = รอบแก้ก่อน merge · นับเป็นเลน
- **เพิ่ม 2 — ผู้คุมดูภาพเต็มเองที่จุด merge** เฉพาะหน้าที่แตะเงิน: หน้าขาย (01/05) · จอชำระ (07) · บิลวันนี้ (12) · ใบเสร็จ/ใบกำกับ — ทุก state ที่ใบงานแตะ ทุกจอ th (en สุ่ม) · หน้าอื่นให้ harness ตัดสิน (มติเลนภาพ)
- ผลต่อแผน: +~ครึ่งวันต่อใบใหญ่ · token +~10% · ประมาณการปิด RUN ~26–28 ต.ค.

## ด่านจุด merge (บทเรียน 10 ต.ค. 08:3xZ — S2.33 แดงเงียบหลัง merge P2.3U)
- ด่านจุด merge **ทุกใบ** (S และ U) ต้องมี `qc-pos-p1.1` (CONTROLLER-RUN · มี static G4 ตรวจไฟล์ `pos/catalog*.ts` และการ import ข้ามโมดูล) + `qc-pos-p1.3` + fitness ±env + typecheck — ไม่ว่าใบนั้นจะ "แตะแต่ UI"
- ไฟล์ action ของ POS ห้ามตั้งชื่อขึ้นต้น `catalog-` ถ้า import โมดูลผู้เขียนเดิม (inventory · account · menu · order · shop · booking · register) — ใช้ `<topic>-actions.ts`

## §HF-TX rule (10 Oct) — ตัวช่วยที่ตัดสิน "เป็นเจ้าของ tx" ด้วย `"$transaction" in client`
ทุกจุดที่เรียก `createSale(input, tx)` (หรือตัวช่วยใน HT7: device · channel · payment-intent · catalog ×2 · stamp · ticket · point/internal · `ticket.cancelOrder`) จากใน tx ของผู้เรียก ต้องส่ง `callerTx(tx)` (`core/caller-tx.ts`) และเรียก `afterSaleCommitted(input, saleId)` หลัง `$transaction` resolve — ห้ามเขียน Proxy ซ่อน `$transaction` เอง (HT6 จับ) · ด่าน `qc-hf-tx` อยู่ในชุด merge ของใบที่แตะ `register.ts`/`order.ts`/`giftcard/service.ts`.
