# T3.5 — ⏸ DEFERRED to the selling release (not part of this run)
Owner decision (DESIGN §1 3ก, RESOLUTIONS R-A2): version 2.0 is not sold; no payment in the app; top-up closed.

## What this WO will contain when opened
- Pack purchase + top-up (wallet overflow `WALLET`/`ASK`) + tax invoice — through the web only or through the store IAP, after the store-rules decision (DESIGN §7.2).
- Beam keys (reference_beam_payment) required.
- Flags to flip: `AI_TEAM_SALES_ENABLED` (packs.ts), `overflowMode` defaults, C2/C3 screens un-grey (T3.4 reads the flag).

## Preconditions to open
1. Owner says "เปิดขาย". 2. Store-rules decision recorded in RESOLUTIONS. 3. Beam credentials present. 4. T6.x released.

Status: ⏸ recorded in MASTER-PLAN §12; no oracle, no code.
