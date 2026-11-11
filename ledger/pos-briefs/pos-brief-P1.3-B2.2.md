# P1.3 B2.2 — builder round (cloud run · controller · 3 Oct 2026)
Same tree/branch/rules as `pos-brief-P1.3-B2.1.md` (no DB, typecheck ≤2, fitness no-env, one commit by explicit paths + push `wip/pos-p1.3`). Source: independent B2 review of ba6a9bb8 (MERGEABLE-AFTER-FIXES).
Fix (all in the register UI, `src/components/pos/register/**`):
- S1 Scan result must not rebuild the cart from the `cart` captured at Enter: functional `setCart(prev => …)` (or ref) in `addProduct`/`addLine`; drop the scan result if the bill was reset/rotated meanwhile (RegisterScreen ~:397-439).
- S2 Pay dialog cannot stack: `openPay` no-op if a pay layer is open; content behind the scrim `inert` (RegisterDialog ~:19-31) — keep focus inside the dialog.
- S3 Touch sizes per spec §7: cart action row ≥40px below xl (CartPanel ~:212/223/234), stock-warning keep/reduce buttons per spec (CartLine ~:101/111) — main buttons stay ≥44px.
- N1 Confirm disabled with a loading label while a fresh quote is pending (~:562/821).
- N2 `beforeunload` guard while phase is `sending` or `unknown` (double-sale risk when leaving with a saved request).
- N3 Scan `match:"none"` → visible not-found feedback; `"choose"` → open the chooser / visible prompt (use existing `pos.*` keys or add th+en pair). Status poll sequence guard optional.
- N4 Global Esc handler ignores `e.isComposing`.
Static checks in `qc-pos-p1.3.mts` only where DB-free and meaningful (ORACLE-EDIT noted). Report ≤25 lines: sha · files · per item what changed · gates · browser checks for the controller.
