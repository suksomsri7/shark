# T6.2 — Full QC · 6-lens hunt · button walker · final parity set (controller + hunters + fix builders)
Read `ai-brief-COMMON.md` + MASTER-PLAN §7, §8, §10 first. Contract: AI-TEAM-RUN §2 T6.2.

## Steps
1. `qc:all` full run as a systemd unit (`systemd-run --unit=ai-qcall …` through iso + qc4 + gate lock; tell the POS/HR sessions in their RESUME files that the lock will be busy ~1–2 h). Compare with the baseline file; every changed suite explained.
2. Hunters L1–L6 (MASTER-PLAN §8), one agent per lens, read-only, prompt §11.5; probe rows `qc-ai-hunt-`. Controller confirms every finding by opening the code; severity table; oracle writer turns HIGH/MEDIUM into `scripts/qc-ai-fix-s<n>.mts` (red on current code); builders per disjoint file set; controller re-runs; round two on the diff + 2 random lenses. Exit: no HIGH/MEDIUM open; LOW in the debt table with reasons.
3. Button walker `scripts/qc-ai-team-buttons.mjs`: puppeteer over the web export (fixtures `all.json` from T5.4) for roles owner / approver / commander: for each inventory row — visible (or absent when `hiddenFor`), tap, assert `expect` (navigate: route change · mutation: intercepted request matches `target` · sheet: testID appears · toast/inline-error: text appears); dead-button detector (no DOM/network change in 3 s); console errors; overflow. Output `.qc-shots/ai-team/buttons/summary.json {total, passed, dead[], wrongExpect[], hiddenLeak[], consoleErrors[]}` — **passed = total** required.
4. Final parity set: all 36 screens × light/dark into `.qc-shots/ai-team/final/` with pairs; controller opens every pair; difference table per screen (accepted deviations listed with the owner-facing reason).
5. Real-model run (controller, ≤ US$2): 5 task types through `sendMessage` on AT-1 with `SHARK_AI_MOCK` unset: assert the prompt is English (log the first 200 chars of the system prompt in the controller's notes only), the persona particle appears, a proposal is created for a write, the charge lands on the employee and the pack. Clean up as T0.1.
6. Fitness ratchets (F16.x) at their final values; `scripts/fitness.mts` untouched unless a ratchet lives there.

## Acceptance
- qc:all green except named pre-existing debt; hunt table closed; buttons passed = total; 72 pairs reviewed; real-model run recorded with spend; MASTER-PLAN §12 updated.
