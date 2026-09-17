# C2.4 — Activity capture: call logging + AI, chat → activity, calendar merge
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.4". Spec: blueprint §5.5, mockup 08 (left/right), 13, decision C5.

## Facts
There is NO speech-to-text anywhere in the codebase (only an ffmpeg transcode worker on the VPS). Vision exists (`src/lib/ai/service.ts` takes `imageUrls`). AI credit: `src/lib/ai/credit.ts` (`canSpend`, `chargeUsageSafe`). Chat events: `chat.message.received` payload `{conversationId, channel}`; `chat.conversation.status` payload `{conversationId, status, externalUserId}`.

## Deliverables
- Call-log modal (click-to-call `tel:` opens it; outcome, duration, direction, note, next task, recording upload ≤ 25 MB through the PRIVATE file path C0.4).
- `CrmTranscriber` adapter interface + `settings.crm.ai.callTranscribe`; default provider = none → button shows a calm "ยังไม่ได้เชื่อมบริการถอดเสียง" state (owner decision Q2 pending). With a fake provider in QC: job → AI summary + next step → **proposal** that fills `transcript/aiSummary/aiNextStep` (never auto-writes); charges AI credit; refuses when `canSpend` is false.
- Business-card scan (vision) → proposal `crm_create_lead`.
- `chat.conversation.status` RESOLVED → ONE CHAT activity per conversation (dedupe `sourceRef=conversationId`), optional AI summary; `chat.message.received` stops sequences waiting for a reply and bumps `lastActivityAt` (no activity per message).
- Calendar merges read-only appointments of the same Party from booking/clinic/school through small read facades `appointmentsByParty` (add them to those modules' facades; read only).
- `CrmCallProvider` interface + webhook shape (stub).

## Acceptance (oracle `qc-crm-c2.4`)
CRM-RUN S1–S7 (24).
X4 RESOLVED event twice/parallel → one activity · X8 transcript/summary never appear in outbox payloads, OpsEvent or logs; AI prompt contains no phone/e-mail · X10 recording DTO has only an expiring link; other viewer/tenant cannot fetch · X6 upload mime allowlist (audio/*), size cap · X1 calendar shows only appointments of parties the actor can see.
Regressions: `qc-chat-core-v2`, `qc-chat-v2-context`, `qc-ai-vision`, `qc-ai-credit`, `qc-ai-proposals`, C1.6.
