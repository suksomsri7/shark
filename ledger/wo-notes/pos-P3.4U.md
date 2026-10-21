# P3.4U — builder notes (ออฟไลน์ 19ง: IndexedDB · ขายเงินสด/โอน · สลิป OFF · คิว+ซิงก์ · คิวผู้จัดการ · สวิตช์ · PIN ออฟไลน์)

Tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.4u` from `origin/session/pos` **731caa0c** (= base b92d5598 + ledger-only 731caa0c) · prompt `pos-prompt-accountA-P3.4U-BUILD.md` · rulings 1–11 + CD-P34U-1…4.
This file is the restart checkpoint (§0 = status).

## 0. Status / next
- [x] step 1 `6a471c55` — client modules (IDB `offline-store.ts` · PBKDF2 `offline-pin.ts` · `use-offline-register.ts`) · `offline-actions.ts` · route `api/pos/sync/snapshot` · CD-P34U-3 hunk
- [x] steps 2–3 + 5 (carried from the killed session, reviewed + 2 fixes, see §3) — sell/banner/chips/slip · sync strip + badge + status bar · LockScreen offline PIN
- [x] steps 4 + 6 `c1f6f1d3` — Shifts close guard + manager queue card · [x] step 7 `ac4b793b` settings live card · [x] step 8a `4d5fabbd` visual (9 states) · [x] 8b `2a92a7b1` inventory +36 · spec · [x] step 9 merge `09fe30cf` (origin b45584ad, ledger only)
- [ ] typecheck (final head) · [ ] pos-pre-submit (≤ 2 runs) · [ ] push · [ ] final report

## 1. 🔴 Server hunk for the reviewer (CD-P34U-3 — the ONLY server hunk of the card)
`src/lib/modules/pos/offline-sync.ts` `issueOfflineSnapshot` — one block `// POS P3.4U ▸ CD-P34U-3 … ◂ POS P3.4U`:
`$transaction` + `pg_try_advisory_xact_lock(hashtextextended('pos-off-snap:<tenant>:<unit>:<deviceCode>',0))` around rate-check → catalog walk → insert → prune.
Lock busy ⇒ `RATE_LIMITED` at once (N parallel issues ⇒ one catalog walk — N11/H1). Insert = `createMany skipDuplicates` (P2002 cannot abort the tx).
Prune keeps: 2 newest ∪ ≤200 newest inside 48 h ∪ **the oldest inside 48 h** (N11) ∪ hashes referenced by pending rows. Catalog reads go through `db` (pool max 10, the tx holds only the lock + writes); tx `{maxWait 10 s, timeout 120 s}`.
