# S0.1 — Survey: design ↔ code review (read-only agent · general-purpose · no lane needed)

Spawn with this prompt (verbatim; the first attempt on 3 Nov was stopped before it wrote anything — rerun from scratch):

---
You are the read-only SURVEYOR for the SHARK "AI secretary" RUN (WO S0.1). Work ONLY inside /root/projects/shark-sec (git worktree, branch session/secretary). Do NOT run git commands that change state, do NOT edit any file except the ONE output file named below, do NOT run tsx/tsc/build/pnpm/npm, do NOT read .env* or credentials*.

Inputs (read fully first):
- ledger/DESIGN-SECRETARY.md (design + owner decisions §0 items 1–13, §0.1 R1–R9, §8 learning, §9 help)
- ledger/SECRETARY-MASTER-PLAN.md (§0 code facts, §3 work orders S0–S3b, §9 answered questions)
- ledger/REVIEW-AI-TEAM-DESIGN-2026-10-08.md (older survey of the same AI layer — reuse its verified names, re-verify anything you cite)
- ledger/secretary-briefs/sec-brief-COMMON.md (house rules)

Code to verify against (this tree includes POS v2 + SVC v2 on top of main): src/lib/ai/** (service.ts, proposals.ts, plans.ts, tools*.ts, tool-access.ts, actor.ts, conversation-owner.ts, conversations.ts, scheduled.ts, memory.ts, persona.ts, proactive.ts, dataset.ts, usage.ts, credit.ts, provider.ts, skills.ts), src/lib/core/auth.ts, src/lib/core/push.ts, src/lib/platform/support.ts + support-ai.ts, src/lib/modules/chat/** (service.ts exports, guard.ts, push.ts, ai-suggest.ts, business-hours.ts, task-from-chat.ts, quick-reply.ts), src/lib/core/rbac.ts + permissions.ts, src/lib/platform/account-deletion.ts, onboarding/tenant creation code (find it), src/app/api/mobile/**, src/app/backoffice/cases/**, prisma/schema/{ai,ai_credit,core,support,dna}.prisma, apps/mobile/app/**, apps/mobile/src/**, apps/mobile/qc/**, scripts/qc-ai-*.mts (names + what each covers, 1 line each).

Write ONE file: ledger/REVIEW-SECRETARY-DESIGN-2026-11-03.md (Thai headings, English body is fine), sections:
1. Verified inventory — for every module above: exported functions with signature (name(params) → return), file:line. Mark what the master plan §0 got wrong, if anything.
2. Page→code map — for all 38 design pages (A1–A8, B1–B8, C1 C3 C4, S1 S2, D1–D3, H1–H4, K1–K5, G1–G5): which existing functions/tables serve each element; what is missing (name the planned WO from §3 that creates it; flag anything no WO covers).
3. Conflicts — design/plan vs code, numbered K1…, each with: evidence (file:line), impact, proposed ruling (keep existing code / add nullable column / new side table / change design). Must cover at least: conversation ownership encoded in id prefix vs new AiRoom/AiRoomMember; AiMessage has no author column; proposals risk tags vs "always approve" rules; scheduled task actor (SHOP_AUDIENCE) vs run-as-owner; usage.ts 5h windows unused; credit.ts ensureWallet on every chat; provider.ts OpenRouter-only format vs Anthropic direct (S1.20); AuthToken email-keyed vs SMS OTP by phone (S1.19); User has no phone; mobile BASE_URL fixed; theme.ts light only; SupportCase.conversationId usage; push.ts capabilities (what can it send, to whom); POS v2 / SVC v2 tools — do src/lib/ai tools call the v2 POS/booking/dorm code or the old one (cite).
4. Regression map — which qc-ai-*.mts (and qc-mobile-*, qc-approval*, qc-chat* if present) must stay green per planned WO.
5. Open questions for the controller (max 10, each with your recommended default).
Be precise: every claim cites file:line. Prefer `grep -n` and reading excerpts over whole-file dumps. When done, reply with a ≤15-line summary: file path, counts (functions verified / pages mapped / conflicts), and the 5 most important conflicts.
---

Acceptance: file exists · all 28 pages mapped · every S1.x WO's named functions exist or are flagged · controller turns §3 rulings + §5 answers into `sec-brief-RESOLUTIONS.md` before S1.1.
