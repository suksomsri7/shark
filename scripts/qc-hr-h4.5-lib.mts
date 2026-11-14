// qc-hr-h4.5-lib.mts — helpers of the H4.5 oracle (LINE notices for employees) · oracle-owned, no product code
// 🔴 LINE fake: node:http on 127.0.0.1:<free port> · LINE_API_BASE points at it · fetch to any non-local host is blocked + recorded
// 🔴 fixed message table (controller ruling Q6 — the oracle asserts bodies byte for byte · th + en) = MSG below
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  type Any, ROOT, rd, short, errText, srt, failedKeys, stripComments, canon, isThai, changedVsBase, diffHunks, fileAt, importsOf, jsonOf, msgParity, testidsOf, tokensOnly, useServerFile,
} from "./qc-hr-lib.mjs";

// ═════════════════════════ pinned bodies (kind + outcome word only · no names/dates/amounts/branch) ═════════════════════════
export const MSG: Record<"th" | "en", Record<string, string>> = {
  th: {
    ROSTER: "ตารางกะของคุณมีการอัปเดต",
    "LEAVE:APPROVED": "ใบลาของคุณได้รับอนุมัติแล้ว",
    "LEAVE:REJECTED": "ใบลาของคุณไม่ได้รับอนุมัติ",
    "OT:APPROVED": "คำขอ OT ของคุณได้รับอนุมัติแล้ว",
    "OT:REJECTED": "คำขอ OT ของคุณไม่ได้รับอนุมัติ",
    "OT:CANCELLED": "คำขอ OT ของคุณถูกยกเลิก",
    SWAP_ASK: "มีคำขอสลับกะส่งถึงคุณ",
    "SWAP:APPROVED": "คำขอสลับกะได้รับอนุมัติแล้ว",
    SLIP: "สลิปเงินเดือนของคุณพร้อมให้ดูแล้ว",
    DIGEST: "คุณมีแจ้งเตือนใหม่ {n} รายการ",
    FOOTER: "ต้องเข้าสู่ระบบ SHARK ก่อนจึงจะเปิดดูได้",
    BUTTON: "เปิดดู",
  },
  en: {
    ROSTER: "Your shift roster has been updated.",
    "LEAVE:APPROVED": "Your leave request was approved.",
    "LEAVE:REJECTED": "Your leave request was not approved.",
    "OT:APPROVED": "Your OT request was approved.",
    "OT:REJECTED": "Your OT request was not approved.",
    "OT:CANCELLED": "Your OT request was cancelled.",
    SWAP_ASK: "You have a new shift swap request.",
    "SWAP:APPROVED": "A shift swap was approved.",
    SLIP: "Your payslip is ready.",
    DIGEST: "You have {n} new notices.",
    FOOTER: "Log in to SHARK to view.",
    BUTTON: "Open",
  },
};
export const KIND_CASES: { kind: string; outcome: string | null; n?: number }[] = [
  { kind: "ROSTER", outcome: null }, { kind: "LEAVE", outcome: "APPROVED" }, { kind: "LEAVE", outcome: "REJECTED" },
  { kind: "OT", outcome: "APPROVED" }, { kind: "OT", outcome: "REJECTED" }, { kind: "OT", outcome: "CANCELLED" },
  { kind: "SWAP_ASK", outcome: null }, { kind: "SWAP", outcome: "APPROVED" }, { kind: "SLIP", outcome: null }, { kind: "DIGEST", outcome: null, n: 3 },
];
export const sentence = (loc: "th" | "en", kind: string, outcome: string | null, n?: number) => (MSG[loc][outcome ? `${kind}:${outcome}` : kind] ?? "∅").replace("{n}", String(n ?? ""));
/** F7 anchors (DIGEST = /app/me/hr) */
export const HREF = (kind: string, refId: string) =>
  ({ ROSTER: "/app/me/hr/week", LEAVE: `/app/me/hr/requests#req-leave-${refId}`, OT: `/app/me/hr/requests#req-ot-${refId}`, SWAP_ASK: `/app/me/hr/requests#req-swap-${refId}`, SWAP: `/app/me/hr/requests#req-swap-${refId}`, SLIP: `/app/me/hr/pay/${refId}`, DIGEST: "/app/me/hr" })[kind] ?? "∅";

/** flex walk: text nodes + actions */
export function flexParts(v: Any, out = { texts: [] as string[], actions: [] as Any[] }) {
  if (Array.isArray(v)) for (const x of v) flexParts(x, out);
  else if (v && typeof v === "object") {
    if (v.type === "text" && typeof v.text === "string") out.texts.push(v.text);
    if (v.action && typeof v.action === "object") out.actions.push(v.action);
    for (const [k, x] of Object.entries(v)) if (k !== "action") flexParts(x, out);
  }
  return out;
}
/** exact body: altText = sentence · text nodes ⊇ {sentence, footer} ⊆ {+button} · every action = one uri href · button label present */
export function bodyOk(m: { altText?: unknown; flex?: Any; contents?: Any } | null | undefined, loc: "th" | "en", s: string, href: string): string {
  if (!m) return "∅";
  const f = flexParts(m.flex ?? m.contents);
  const allowed = new Set([s, MSG[loc].FOOTER, MSG[loc].BUTTON]);
  const bad: string[] = [];
  if (m.altText !== s) bad.push(`alt=${JSON.stringify(m.altText)}`);
  if (!f.texts.includes(s) || !f.texts.includes(MSG[loc].FOOTER)) bad.push("texts-missing");
  if (f.texts.some((t) => !allowed.has(t))) bad.push(`extra=${JSON.stringify(f.texts.filter((t) => !allowed.has(t))).slice(0, 80)}`);
  if (!f.actions.length || f.actions.some((a) => a.type !== "uri" || a.uri !== href)) bad.push(`actions=${JSON.stringify(f.actions).slice(0, 120)}`);
  if (!f.actions.some((a) => a.label === MSG[loc].BUTTON) && !f.texts.includes(MSG[loc].BUTTON)) bad.push("button");
  return bad.join(" ");
}

// ═════════════════════════ LINE fake ═════════════════════════
export type FakeReq = { method: string; path: string; to: string; replyToken: string; retryKey: string; messages: Any[]; status: number; at: number };
export type Fake = { base: string; reqs: FakeReq[]; script: Map<string, number[]>; names: Map<string, string>; close: () => Promise<void>; blocked: string[]; restore: () => void };
/** fake LINE (push · reply · profile) · per-user script (queue of statuses) · prefixes Ufail=500 · Uquota=429 · Uslow=hang 12 s · Udown=503 */
export async function startFake(): Promise<Fake> {
  const reqs: FakeReq[] = [];
  const script = new Map<string, number[]>();
  const names = new Map<string, string>();
  const accepted = new Set<string>();
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let json: Any = null;
      try {
        json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
      } catch {
        json = null;
      }
      const path = (req.url ?? "").split("?")[0] ?? "";
      const rec: FakeReq = { method: req.method ?? "", path, to: String(json?.to ?? ""), replyToken: String(json?.replyToken ?? ""), retryKey: String(req.headers["x-line-retry-key"] ?? ""), messages: Array.isArray(json?.messages) ? json.messages : [], status: 0, at: Date.now() };
      reqs.push(rec);
      const send = (code: number, body: unknown) => {
        rec.status = code;
        if (res.writableEnded || res.destroyed) return;
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.method === "POST" && path === "/v2/bot/message/push") {
        const to = rec.to;
        const q = script.get(to);
        const forced = q && q.length ? q.shift()! : 0; // scripted status wins over the prefix behaviour (200 = accept now)
        if (forced && forced !== 200) return send(forced, { message: "scripted" });
        if (!forced) {
          if (to.startsWith("Ufail")) return send(500, { message: "fake failure" });
          if (to.startsWith("Udown")) return send(503, { message: "down" });
          if (to.startsWith("Uquota")) return send(429, { message: "You have reached your monthly limit." });
        }
        if (rec.retryKey && accepted.has(rec.retryKey)) return send(409, { message: "The retry key is already accepted" });
        if (!forced && to.startsWith("Uslow")) return void setTimeout(() => send(200, { sentMessages: [{ id: "slow" }] }), 12_000);
        if (rec.retryKey) accepted.add(rec.retryKey);
        return send(200, { sentMessages: [{ id: `fm${reqs.length}` }] });
      }
      if (req.method === "POST" && path === "/v2/bot/message/reply") return send(200, { sentMessages: [{ id: `fr${reqs.length}` }] });
      if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) {
        const id = decodeURIComponent(path.split("/").pop() ?? "");
        return send(200, { displayName: names.get(id) ?? "QC", userId: id });
      }
      return send(200, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const REAL = globalThis.fetch;
  const blocked: string[] = [];
  globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      /* not a URL */
    }
    if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL(input, init);
    blocked.push(host.slice(0, 80));
    return new Response(JSON.stringify({ message: "blocked by qc-hr-h4.5" }), { status: 503, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return {
    base, reqs, script, names, blocked,
    restore: () => void (globalThis.fetch = REAL),
    close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

// ═════════════════════════ webhook (signed like qc-svc-r0.7) ═════════════════════════
let evSeq = 0;
export const evText = (userId: string, text: string, tag: string) => {
  const id = `${tag}${++evSeq}${Date.now().toString(36)}`;
  return { type: "message", mode: "active", timestamp: Date.now(), webhookEventId: `01QC45${id}`, deliveryContext: { isRedelivery: false }, replyToken: `rt${id}`, source: { type: "user", userId }, message: { id: `m${id}`, type: "text", text, quoteToken: "q" } };
};
export const evPostback = (userId: string, data: string, tag: string) => {
  const id = `${tag}${++evSeq}${Date.now().toString(36)}`;
  return { type: "postback", mode: "active", timestamp: Date.now(), webhookEventId: `01QC45${id}`, deliveryContext: { isRedelivery: false }, replyToken: `rt${id}`, source: { type: "user", userId }, postback: { data } };
};
export const signedBody = (secret: string, events: Any[]) => {
  const body = JSON.stringify({ destination: "Uqc45bot", events });
  return { body, sig: createHmac("sha256", secret).update(body, "utf8").digest("base64") };
};
/** replies (reply by token or fallback push to the user) seen by the fake since index `from` */
export function repliesOf(fake: Fake, from: number, ev: Any): Any[] {
  return fake.reqs.slice(from).filter((r) => (r.path === "/v2/bot/message/reply" && r.replyToken === ev.replyToken) || (r.path === "/v2/bot/message/push" && r.to === ev.source.userId && !r.retryKey)).flatMap((r) => r.messages);
}
/** advisory key holder (pg_blocking_pids evidence — like qc-hr-h3.8-lib holdRows) */
export const ADVISORY_SQL = `SELECT count(pg_advisory_xact_lock(hashtextextended($1::text, 0)))::int AS n`;

// ═════════════════════════ files · checks · statics · pure (moved here to keep the oracle ≤ 60 KB) ═════════════════════════
type Reg = { chk: (id: string, ok: unknown, expected: unknown, actual: unknown) => boolean; ck: (id: string, r: Record<string, unknown>, exp: string, extra?: string) => boolean };
export const H = "src/lib/modules/hr/";
export const F = {
  rules: `${H}line-rules.ts`, link: `${H}line-link.ts`, notify: `${H}line-notify.ts`, acts: `${H}line-actions.ts`, ui: `${H}line-ui.tsx`,
  glue: "src/lib/platform/hr-line.ts", gacts: "src/lib/platform/hr-line-actions.ts", routes: "src/lib/platform/postback-routes.ts", code: "src/lib/modules/chat/link-code.ts",
  hook: "src/app/api/chat/webhook/[connectionId]/route.ts", cons: "src/lib/outbox-consumers.ts", jobs: "src/lib/platform/minute-jobs.ts", hrIdx: `${H}index.ts`,
  hrSchema: "prisma/schema/hr.prisma", scope: "src/lib/core/scope.ts", env: "scripts/hr-qc-env.mts", visual: "scripts/visual-hr.mts", inv: "scripts/hr-ui-inventory.json",
  pProfile: "src/app/app/me/hr/profile/page.tsx", pSettings: "src/app/app/sys/[id]/hr/settings/page.tsx", pEmp: "src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx",
  th: "src/messages/th/common.json", en: "src/messages/en/common.json", labels: "src/lib/modules/webhooks/labels.ts",
};
export const NEW = [F.rules, F.link, F.notify, F.acts, F.ui, F.glue, F.gacts];
export const MARKED = [F.hrIdx, F.hrSchema, F.scope, F.env, F.code, F.routes, F.cons, F.jobs, F.pProfile, F.pSettings, F.pEmp, F.visual];
export const FROZEN_FILES = [F.hook, "src/lib/platform/notify-customer.ts", "src/lib/modules/approval", "src/lib/modules/account", `${H}settings-lock.ts`, `${H}roster.ts`, `${H}leave.ts`, `${H}ot.ts`, `${H}swap.ts`, `${H}service.ts`, `${H}lifecycle.ts`, "scripts/qc-hr-lib.mts", "package.json", "pnpm-lock.yaml", F.labels];
export const EVENTS = ["hr.roster.published", "hr.leave.decided", "hr.ot.decided", "hr.shift.swap_requested", "hr.shift.swap_approved", "hr.payroll.paid", "hr.employee.offboarded"];
export const AUDIT = ["hr.line.link", "hr.line.unlink", "hr.line.settings", "hr.line.cap_reached", "hr.line.quota"];
export const RULE_EXPORTS = ["HR_LINE_TEXT", "HR_LINE_TEXT_EN", "noticeMessage", "hrefOf", "dedupeKeyOf", "nextAttemptAt", "lineNotifyPolicyOf", "monthKeyBkk"];
export const LINK_COLS = "chatContactId,connectionId,createdAt,employeeId,endReason,endedAt,expiresAt,id,issuedForUserId,linkedAt,status,systemId,tenantId";
export const NOTICE_COLS = "appNotified,createdAt,dedupeKey,digestOf,employeeId,id,kind,line,lineAttempts,nextAttemptAt,outcome,refId,sentAt,skipCode,systemId,tenantId";
export const TESTIDS = ["hr-self-line-card", "hr-self-line-link", "hr-self-line-code", "hr-self-line-deeplink", "hr-self-line-unlink", "hr-self-line-status", "hr-emp-line-chip", "hr-emp-line-unlink"];
export const PILOT = "ยังไม่ได้ทดสอบกับ LINE OA จริง";
/** names the brief leaves open — first exported name found wins (notes §shapes) */
export const STATUS_FNS = ["employeeLineStatus", "lineStatusForViewer", "adminLineStatus"];
export const SAVE_FNS = ["saveLineNotifyPolicy", "saveLinePolicy", "saveLineSettings", "saveHrLinePolicy"];

export const CHECKS_SRC = `
S1.1|R1|C|R|[static] migration 20270111000000_hr_line_link: 2 CREATE TABLE · status/endReason/kind/line CHECK lists · ACTIVE completeness CHECK · partial UNIQUE ACTIVE + PENDING (systemId, employeeId) · (tenantId, chatContactId) ACTIVE · UNIQUE (tenantId, dedupeKey) · index (line, nextAttemptAt) · FK HrEmployee RESTRICT · additive
S1.2|R1|C|R|[static] hr.prisma models HrLineLink/HrNotice (fields = R1 lists · no name/text/LINE id/money field) · core/scope.ts sys() ×2 · hr-qc-env entries
S1.3|F6 P|C|R|[static] boundaries: no hr/** file imports chat or platform · platform/hr-line.ts imports chat + hr via facades only · no other platform file outside postback-routes/minute-jobs/consumers names hr-line
S1.4|§5|C|G|[static] [control] frozen unchanged vs base: webhook route · chat/** except link-code.ts · notify-customer · approval · account · settings-lock · roster/leave/ot/swap/service/lifecycle · payroll*/payslip* · qc-hr-lib · package.json · lockfile · webhook labels · other oracles only "ORACLE-EDIT (H4.5" hunks
S1.5|R4|C|R|[static] chat/link-code.ts: one marked hunk, LINK_PURPOSES = base + "HR_EMPLOYEE" only
S1.6|§5|M|R|[static] marked hunks "HR H4.5" (opened + closed ◂, never removing another ticket's marker) in hr/index · hr.prisma · scope · hr-qc-env · link-code · postback-routes · consumers · minute-jobs · 3 pages · visual-hr
S1.7|R8|C|R|[static] no new outbox type: consumer key set = base · new files emit nothing · 7 events wrapped with onHrEventForLine via compose
S1.8|R8|M|R|[static] minute job "hr.line" everyMinutes 5 → runHrLineJobs(now, {budgetMs, signal})
S1.9|R9|C|R|[static] lineNotify written only via lockHrSettings(…"hr:linepolicy:"…) + writeHrSettingsKeys · no own appSystem update · audit hr.line.settings
S1.10|R3 C.7|C|R|[static] self fns (myLineStatus · beginLineLink · unlinkMyLine · issueHrLineCode) call resolveSelf and read no input employeeId · issueMyLineCodeAction + line-actions "use server" → requireTenant()
S1.11|R4 P3|C|R|[static] hr-line.ts: issueLinkCode purpose "HR_EMPLOYEE" ttlMin 10 · no console/log near the code · route prefix "hr." resolveParty → null · postback handler never reads evt.params
S1.12|R12|M|R|[static] audit action names ×5 present · audit writes carry no code/externalUserId/displayName/chatContactId
S1.13|R11|M|R|[static] UI testids · inventory rows H4.5 · messages hr.line th = en + pilot label · visual-hr "4.5" · tokens only
S2.1|R2|C|R|[pure] HR_LINE_TEXT / _EN: same keys · th Thai · en ASCII
S2.2|R2 Q6|C|R|[pure] noticeMessage th: 10 kind×outcome bodies byte for byte (altText · sentence + footer · one uri button)
S2.3|R2 Q6|C|R|[pure] noticeMessage en: 10 bodies byte for byte
S2.4|P1|C|R|[pure] extra input (name · date · amount · branch · reason) never reaches a body · no digit in any non-DIGEST body
S2.5|R2 F7|C|R|[pure] hrefOf vectors (7 kinds) · no tenant/system/employee id · no query/token
S2.6|R2|C|R|[pure] dedupeKeyOf = hr:<kind>:<refId>:<employeeId>[:<outcome>]
S2.7|R2 Q12|C|R|[pure] nextAttemptAt(1..4) = +5 m · +30 m · +2 h · null
S2.8|R9 Q7|C|R|[pure] lineNotifyPolicyOf: defaults (OFF · events on · IMMEDIATE · 17:30 · cap 200 · unit null) · bad values ⇒ defaults · cap 0..5000
S2.9|R2|M|R|[pure] monthKeyBkk: 2032-01-31T17:00Z ⇒ 2032-02 · 16:59Z ⇒ 2032-01
S3.0|fix|C|G|[db] [control] fake LINE up · lineApiBase() = fake before any send · fixtures (2 tenants · 3 OAs · 27 employees · contacts)
S3.1|R3 R9|C|R|[db] shop default OFF (shopEnabled false) · begin refusals DISABLED · NO_EMPLOYEE · INACTIVE · NO_OA (codes) · nothing written
S3.2|R3 R4 P3|C|R|[db] issueHrLineCode: code once · PENDING row (issuedForUserId · OA c1 · +10 min) · ChatLinkCode HR_EMPLOYEE refId = linkId · no raw code in DB/logs
S3.3|R3 R4 R5|C|R|[db] signed webhook with the code ⇒ ACTIVE · exact reply · room shows LINK_CODE_MASK · audit hr.line.link {employeeId} · in-app note · contact partyId/customerId untouched · self status ACTIVE + own LINE name
S3.4|P3|C|R|[db] expired · consumed code replayed · reissued (old CANCELLED/REISSUED) ⇒ LINK_FAILED_TEXT · no ACTIVE
S3.5|P4|C|R|[db] code typed on another OA of the shop · on another shop's OA ⇒ LINK_FAILED_TEXT (same bytes) · no ACTIVE · nothing revealed
S3.6|R3|C|R|[db] employee ENDED · linkedUserId changed · Membership gone after issue ⇒ refused · no ACTIVE
S3.7|F2|C|R|[db] 11th guess within 15 min ⇒ refused although the code is valid
S3.8|Q3|C|R|[db] 5 codes/hour: 6th ⇒ RATE · reissues leave one PENDING
S3.9|R3|C|R|[db] relink (phone change) ⇒ old ENDED/RELINK · same contact to employee B ⇒ A ENDED/CONTACT_REUSED · B ACTIVE
S3.10|F3 P5|C|R|[db] same signed body twice ⇒ 1 link · 1 reply · bad signature ⇒ 401 · no write · code still unused
S3.11|R3 R4|C|R|[db] unlink self (SELF) · admin (ADMIN) · LINE hr.unlink (LINE) · audit hr.line.unlink {employeeId, reason} · hr.unlink with param ids from an unlinked contact ends nothing
S3.12|R4 Q9|C|R|[db] hr.menu: linked ⇒ flex with week · requests · pay links (no ids) · unlinked · other shop · param ids ⇒ identical notLinked
S4.1|R6 Q5|C|R|[db] hr.roster.published ⇒ each listed employee: 1 notice ROSTER · 1 in-app · 1 push (th / en by contact lang · exact body · absolute href · retry key = lineRetryKeyOf)
S4.2|R6|C|R|[db] hr.leave.decided APPROVED ⇒ LEAVE notice+in-app+push · REJECTED decided by own user ⇒ none · CANCELLED ⇒ none
S4.3|R6|C|R|[db] hr.ot.decided ⇒ OT notice appNotified=false · no extra in-app (only the existing OT note) · 1 push
S4.4|R6|C|R|[db] swap_requested ⇒ counterpart only (SWAP_ASK) · swap_approved ⇒ both (SWAP)
S4.5|R6|C|R|[db] hr.payroll.paid ⇒ SLIP for items with slipState ISSUED (v1 PAID) · v2 unfinalized run ⇒ none
S4.6|R8|C|R|[db] replay twice per consumer ⇒ no new notice/in-app/push
S4.7|R9 Q8|C|R|[db] policy OFF ⇒ 0 pushes · in-app present · event toggle ROSTER off ⇒ no roster push
S5.1|R7|C|R|[db] 503 ⇒ FAILED (attempt 1 · next = now+5 m) · in-app present · job at +6 m resends same key ⇒ SENT · 1 delivery · sentAt = now
S5.2|Q12|C|R|[db] always 500 ⇒ 4 attempts (5 m/30 m/2 h) ⇒ FAILED final (next null) · later job sends nothing
S5.3|R7|C|R|[db] 429 ⇒ QUOTA final · two QUOTA the same day ⇒ 1 audit hr.line.quota {connectionId}
S5.4|R7|C|R|[db] hung LINE ⇒ FAILED within 20 s
S5.5|R7|C|R|[db] blocked contact ⇒ SKIPPED · link ENDED/BLOCKED · 0 requests
S5.6|R7|C|R|[db] stale SENDING (crash after accepted push) ⇒ resend same key · fake 409 ⇒ SENT · 1 delivery
S5.7|R7|C|R|[db] no APP_URL / NEXT_PUBLIC_APP_URL ⇒ SKIPPED NO_URL · 0 requests
S5.8|F1|C|R|[db] quiet 21:00–08:00 of home unit: 22:00 ⇒ HELD until 08:00 · job 08:01 ⇒ 1 push SENT
S5.9|R7|C|R|[db] DIGEST 17:30: 3 HELD ⇒ 1 DIGEST notice · 1 push "3" exact · members SENT digestOf · rerun ⇒ none
S5.10|R7|C|R|[db] cap 2 ⇒ 2 SENT · 3rd + 4th CAP · 1 audit hr.line.cap_reached {monthKey} · in-app for all 4
S5.11|R8|M|R|[db] job cancels expired PENDING links (CANCELLED)
S6.1|R8|C|R|[db] offboard + consumer ⇒ link ENDED/OFFBOARD · pending SKIPPED · 0 pushes after
S6.2|R6|C|R|[db] account unlinked from employee ⇒ precheck ENDED/ACCOUNT · notice SKIPPED · 0 pushes
S6.3|R6|C|R|[db] membership removed ⇒ ENDED · SKIPPED · 0 pushes
S7.1|X|C|R|[db] 10× onHrEventForLine(same event) in parallel ⇒ 1 notice · 1 in-app · 1 push
S7.2|X|C|R|[db] notice row held: 2 drains blocked (pg_blocking_pids) or skip it while held · after release 1 push total
S7.3|X|C|R|[db] complete waits on hrline:<sys>:<emp> · 2 contacts × 2 codes of one employee ⇒ 1 ACTIVE · begin ∥ complete consistent
S7.4|R9|C|R|[db] line policy save ∥ OT policy save under held hr:clockpolicy ⇒ blocked · both keys kept
S8.1|C.2 P8|C|R|[db] status reader matrix: owner · all-branch key · [] key ok (keys exactly ok/state/linkedAt) · branch key own branch only · member · employee · other shop refused
S8.2|F.3|C|R|[db] refusals for out-of-branch · unknown · other shop's id identical bytes · Thai · no ids
S8.3|R3|C|R|[db] adminUnlinkLine: branch key refused for other branch (same bytes as unknown) · member refused · link unchanged
S8.4|R3 Q14|C|R|[db] myLineStatus keys exact · own LINE name · forged employeeId ignored
S8.5|R9|C|R|[db] settings save: member refused · cap 5001 refused · owner ok + audit hr.line.settings
S9.1|R1 §4|C|R|[db] HrLineLink / HrNotice columns = R1 · rows hold no names / LINE ids / texts
S9.2|R12|C|R|[db] audit after keys exact per action · no raw code / LINE id / LINE name / contact id in audits, notices, in-app rows or logs
X1|17|M|G|[run] [control] fitness + fitness-hr without env ⇒ exit 0
Z1|17|C|G|no residue (HR · chat · settings · rate buckets of the QC tenants)
`;

export const exists = (p: string) => existsSync(join(ROOT, p));
const bodies = (src: string) => [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)(?=\nexport\s|$)/g)].map((m) => ({ name: m[1]!, body: m[2]! }));
const modelBlock = (s: string, m: string) => {
  const i = s.indexOf(`model ${m} {`);
  return i < 0 ? "" : s.slice(i, s.indexOf("\n}", i) + 2);
};
const fieldsOf = (block: string) => block.split("\n").slice(1).map((l) => l.trim()).filter((l) => /^[a-z]\w*\s/.test(l)).map((l) => l.split(/\s+/)[0]!).filter((f) => !/^[A-Z]/.test(f));
const listDir = (d: string) => (exists(d) ? readdirSync(join(ROOT, d), { recursive: true }).map((n) => `${d}/${String(n)}`).filter((p) => /\.(ts|tsx)$/.test(p)) : []);

// ═════════════════════════ statics ═════════════════════════
export function runStatic(g: Reg & { BASE: string; IN_BASE: boolean }): void {
  const { chk, ck, BASE, IN_BASE } = g;
  console.log(`── [static] base ${BASE.slice(0, 9) || "?"}${IN_BASE ? " (H4.5 in base)" : ""} ──`);
  {
    const d = "prisma/migrations/";
    const hit = exists(d) ? readdirSync(join(ROOT, d)).find((n) => n.startsWith("20270111000000_hr_line_link")) : undefined;
    const s = hit ? rd(`${d}${hit}/migration.sql`) : "";
    const list = (words: string[]) => new RegExp(`CHECK[\\s\\S]{0,400}${words.map((w) => `'${w}'`).join("[\\s\\S]{0,80}")}`).test(s);
    ck("S1.1", {
      file: !!s, tables: /CREATE TABLE "HrLineLink"/.test(s) && /CREATE TABLE "HrNotice"/.test(s),
      status: list(["PENDING", "ACTIVE", "ENDED", "CANCELLED"]), reason: list(["SELF", "ADMIN", "LINE", "RELINK", "OFFBOARD", "ACCOUNT", "BLOCKED", "CONTACT_REUSED", "REISSUED"]),
      kind: list(["ROSTER", "LEAVE", "OT", "SWAP_ASK", "SWAP", "SLIP", "DIGEST"]), line: list(["NONE", "PENDING", "SENDING", "HELD", "SENT", "FAILED", "QUOTA", "CAP", "SKIPPED"]),
      activeComplete: /'ACTIVE'[\s\S]{0,300}"connectionId"\s+IS NOT NULL[\s\S]{0,200}"chatContactId"\s+IS NOT NULL[\s\S]{0,200}"linkedAt"\s+IS NOT NULL/i.test(s),
      uActive: /UNIQUE INDEX[^;]*"HrLineLink"[^;]*\("systemId",\s*"employeeId"\)[^;]*WHERE[^;]*'ACTIVE'/i.test(s), uPending: /UNIQUE INDEX[^;]*"HrLineLink"[^;]*\("systemId",\s*"employeeId"\)[^;]*WHERE[^;]*'PENDING'/i.test(s),
      uContact: /UNIQUE INDEX[^;]*\("tenantId",\s*"chatContactId"\)[^;]*WHERE[^;]*'ACTIVE'/i.test(s), uDedupe: /UNIQUE INDEX[^;]*\("tenantId",\s*"dedupeKey"\)/.test(s), due: /INDEX[^;]*"HrNotice"[^;]*\("line",\s*"nextAttemptAt"\)/.test(s),
      fk: /REFERENCES "HrEmployee"\("id"\) ON DELETE RESTRICT/.test(s), additive: !/\bDROP\b|ALTER\s+TYPE/i.test(s) && [...s.matchAll(/ALTER\s+TABLE\s+"(\w+)"/gi)].every((m) => m[1] === "HrLineLink" || m[1] === "HrNotice"),
    }, "migration shape", s ? "" : "∅ migration");
  }
  {
    const p = rd(F.hrSchema);
    const lf = srt(fieldsOf(modelBlock(p, "HrLineLink")));
    const nf = srt(fieldsOf(modelBlock(p, "HrNotice")));
    ck("S1.2", { link: lf === srt([...LINK_COLS.split(","), "employee"]) /* ORACLE-EDIT (H4.5 fix round · controller ruling A): + exactly the relation field `employee` */, notice: nf === NOTICE_COLS, scope: /HrLineLink:\s*sys\(\)/.test(rd(F.scope)) && /HrNotice:\s*sys\(\)/.test(rd(F.scope)), env: /hrLineLink/.test(rd(F.env)) && /hrNotice/.test(rd(F.env)) }, "schema + registries", `link=${lf.slice(0, 60) || "∅"} notice=${nf.slice(0, 60) || "∅"}`);
  }
  {
    const hrFiles = listDir("src/lib/modules/hr");
    const xImp = (src: string) => importsOf(stripComments(src)).map((i) => i.spec).filter((sp) => /^@\/lib\/(modules\/chat|platform)(\/|$)|\.\.\/chat\/|\.\.\/\.\.\/platform\//.test(sp));
    // base precedent kept (hr/attendance-job.ts → platform/minute-jobs, H2.5) · anything new = violation
    const bad = hrFiles.filter((f) => { const was = new Set(BASE ? xImp(fileAt(BASE, f) ?? "") : []); return xImp(rd(f)).some((sp) => !was.has(sp)); }).map((f) => f.split("/").pop());
    const g = importsOf(stripComments(rd(F.glue)));
    const glueOk = !!g.length && g.filter((i) => /modules\/chat/.test(i.spec)).every((i) => i.spec === "@/lib/modules/chat") && g.filter((i) => /modules\/hr/.test(i.spec)).every((i) => i.spec === "@/lib/modules/hr") && g.some((i) => i.spec === "@/lib/modules/chat");
    const others = listDir("src/lib").filter((f) => ![F.glue, F.gacts, F.routes, F.jobs, F.cons].includes(f) && /platform\/hr-line(["']|-actions)/.test(rd(f))).map((f) => f.split("/").pop());
    ck("S1.3", { hrClean: bad.length === 0, glue: glueOk, onlyGlue: others.length === 0 }, "facades only", `hr→chat/platform=${bad.join(",") || "-"} glueImports=${g.map((i) => i.spec).join(",").slice(0, 120)} others=${others.join(",") || "-"}`);
  }
  {
    const hrDir = exists(H) ? readdirSync(join(ROOT, H)).filter((n) => /^(payroll|payslip)/.test(n)).map((n) => `${H}${n}`) : [];
    const chatChanged = BASE ? changedVsBase(BASE, ["src/lib/modules/chat"]).replace(/^changed: /, "").split(",").filter((f) => f && f !== "unchanged" && f !== F.code) : [];
    const diff = BASE ? changedVsBase(BASE, [...FROZEN_FILES, ...hrDir]) : "no base";
    let oracleBad: string[] = [];
    try {
      const ch = execFileSync("git", ["diff", "--name-only", BASE, "--", "scripts"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => /^scripts\/qc-.*\.mts$/.test(f) && !/qc-hr-h4\.5/.test(f));
      oracleBad = ch.filter((f) => !(diffHunks(BASE, f) ?? []).every((h) => h.added.some((l) => l.includes("ORACLE-EDIT (H4.5"))));
    } catch {
      oracleBad = ["git"];
    }
    ck("S1.4", { frozen: IN_BASE || diff === "unchanged", chat: IN_BASE || chatChanged.length === 0, oracles: IN_BASE || oracleBad.length === 0 }, "frozen", IN_BASE ? "n/a · H4.5 in base" : `${diff} chat=${chatChanged.join(",") || "-"} oracles=${oracleBad.join(",") || "-"}`);
  }
  {
    const lp = (s: string) => (s.match(/LINK_PURPOSES\s*=\s*\[([^\]]*)\]/)?.[1] ?? "").match(/"[A-Z_]+"/g)?.join(",") ?? "";
    const now = lp(rd(F.code));
    const was = BASE ? lp(fileAt(BASE, F.code) ?? "") : "";
    const hs = BASE ? (diffHunks(BASE, F.code) ?? []) : [];
    ck("S1.5", { purposes: IN_BASE || (!!was && now === `${was},"HR_EMPLOYEE"`), hunks: IN_BASE || (hs.length >= 1 && hs.length <= 2 && hs.every((h) => h.added.some((l) => l.includes("HR H4.5")))) }, "+HR_EMPLOYEE only", `now=${now} base=${was}`);
  }
  {
    const bad: string[] = [];
    if (!IN_BASE)
      for (const f of MARKED) {
        const hs = BASE ? diffHunks(BASE, f) : null;
        const n = f.split("/").slice(-2).join("/");
        if (!hs || hs.length === 0) bad.push(`${n}:none`);
        else if (!hs.every((h) => h.added.some((l) => l.includes("HR H4.5")))) bad.push(`${n}:unmarked`);
        else if (!hs.every((h) => h.added.some((l) => l.includes("◂")))) bad.push(`${n}:unclosed`);
        else if (hs.some((h) => h.removed.some((l) => /HR H(?!4\.5\b)\d+\.\d+|HF-[A-Z]+-\d|SVC [A-Z]\d|CRM C\d|POS P\d/.test(l)))) bad.push(`${n}:removes-other-ticket`);
      }
    chk("S1.6", bad.length === 0, `marked hunks in ${MARKED.length} files (JSON files exempt)`, IN_BASE ? "n/a · H4.5 in base" : bad.join(" ") || "ok");
  }
  {
    const keys = (s: string) => srt(new Set([...s.matchAll(/^\s*"([a-z]+\.[a-z_.]+)":/gm)].map((m) => m[1]!)));
    const now = stripComments(rd(F.cons));
    const same = IN_BASE || (!!BASE && keys(now) === keys(fileAt(BASE, F.cons) ?? ""));
    const emits = NEW.filter((f) => /emitOutbox|outboxEvent\.create/.test(stripComments(rd(f))));
    const entries = now.split(/\n(?=\s*"[a-z]+\.[a-z_.]+":)/);
    const wrapped = EVENTS.filter((e) => entries.some((x) => x.trimStart().startsWith(`"${e}":`) && x.includes("onHrEventForLine")));
    ck("S1.7", { same, emits: emits.length === 0, wrapped: wrapped.length === EVENTS.length && /compose\(/.test(now) }, "no new type · 7 wrapped", `wrapped=${wrapped.length}/7 emits=${emits.join(",") || "-"}`);
  }
  {
    const s = stripComments(rd(F.jobs));
    const i = s.indexOf('"hr.line"');
    const blk = i >= 0 ? s.slice(Math.max(0, i - 200), i + 400) : "";
    ck("S1.8", { job: !!blk, every5: /everyMinutes:\s*5\b/.test(blk), run: /runHrLineJobs\(/.test(blk) }, "minute job hr.line");
  }
  {
    const files = [...NEW, F.glue].map((f) => stripComments(rd(f)));
    const all = files.join("\n");
    ck("S1.9", { lock: /lockHrSettings\([^)]*hr:linepolicy:/.test(all.replace(/\n/g, " ")) || /hr:linepolicy:/.test(all) && /lockHrSettings\(/.test(all), write: /writeHrSettingsKeys\([^)]*lineNotify/.test(all.replace(/\n/g, " ")), noOwn: !/appSystem\.(update|updateMany|upsert)\s*\(/.test(all) && !/UPDATE\s+"AppSystem"/i.test(all), audit: all.includes('"hr.line.settings"') }, "settings writer");
  }
  {
    const fns = [...bodies(stripComments(rd(F.link))), ...bodies(stripComments(rd(F.glue)))].filter((b) => ["myLineStatus", "beginLineLink", "unlinkMyLine", "issueHrLineCode"].includes(b.name));
    const bad = fns.filter((b) => !/resolveSelf\(|beginLineLink\(/.test(b.body) || /\b(input|i|opts|o|args|params|actor)\s*(\?\.|\.)\s*employeeId\b|\[\s*["']employeeId["']\s*\]/.test(b.body)).map((b) => b.name);
    const ga = useServerFile(rd(F.gacts), ["issueMyLineCodeAction"], [/requireTenant\(\)/]);
    const la = useServerFile(rd(F.acts), [], [/requireTenant\(\)/]);
    ck("S1.10", { fns: fns.length === 4, resolve: bad.length === 0, gacts: Object.values(ga.r).every(Boolean), acts: !!rd(F.acts) && Object.values(la.r).every(Boolean) }, "self from session · actions", `fns=${fns.map((b) => b.name).join(",")} bad=${bad.join(",") || "-"} gacts=${failedKeys(ga.r)} acts=${failedKeys(la.r)}`);
  }
  {
    const g = stripComments(rd(F.glue));
    const r = stripComments(rd(F.routes));
    const pb = g.match(/export\s+async\s+function\s+onHrPostback\s*\(([\s\S]*?)(?=\nexport\s|$)/)?.[1] ?? "";
    ck("S1.11", {
      issue: /issueLinkCode\(/.test(g) && /["']HR_EMPLOYEE["']/.test(g) && /ttlMin:\s*10\b/.test(g), noLog: !/console\.|logOps\(/.test(g),
      route: /prefix:\s*["']hr\.["']/.test(r) && /resolveParty:\s*(async\s*)?\(\)\s*=>\s*null/.test(r) && /HR_EMPLOYEE:\s*["']hr\.["']/.test(r) && /DATA_RE\s*=\s*\/\^\([^)]*\bhr\b/.test(r),
      noParams: !!pb && !/\.params\b/.test(pb),
    }, "glue contract");
  }
  {
    const all = [F.link, F.notify, F.glue, F.acts, F.gacts].map((f) => stripComments(rd(f))).join("\n");
    const writes = [...all.matchAll(/(?:writeAudit|auditLog\.create)\(([\s\S]{0,400}?)\)\s*;/g)].map((m) => m[1]!);
    const leaky = writes.filter((w) => /\bcode\b|externalUserId|displayName|chatContactId/.test(w));
    ck("S1.12", { names: AUDIT.every((a) => all.includes(`"${a}"`)), clean: leaky.length === 0 }, "audit names", `writes=${writes.length} leaky=${leaky.length}`);
  }
  {
    const src = [F.ui, F.pProfile, F.pSettings, F.pEmp].map((f) => rd(f)).join("\n");
    const ids = new Set([...testidsOf(src, "hr-self-line"), ...testidsOf(src, "hr-emp-line"), ...testidsOf(src, "hr-line-settings")]);
    const miss = TESTIDS.filter((t) => !ids.has(t));
    const rows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((r) => r.wo === "H4.5");
    const invOk = rows.length >= TESTIDS.length && TESTIDS.every((t) => rows.some((r) => r.testid === t)) && rows.every((r) => r.oracle === "qc-hr-h4.5" && ids.has(String(r.testid)));
    const th = jsonOf(F.th)?.hr?.line ?? {};
    const en = jsonOf(F.en)?.hr?.line ?? {};
    const mp = msgParity(th, en, []);
    const tk = tokensOnly(stripComments(rd(F.ui)));
    ck("S1.13", { ids: miss.length === 0, settings: [...ids].some((i) => i.startsWith("hr-line-settings-")), inv: invOk, msgs: Object.values(mp).every(Boolean), pilot: Object.values(th).includes(PILOT) || rd(F.ui).includes(PILOT), vis: /"4\.5":\s*\[/.test(rd(F.visual)), tokens: !!rd(F.ui) && Object.values(tk).every(Boolean) }, "UI contract", `missing=${miss.join(",") || "-"} rows=${rows.length}`);
  }
}

const pure = (R: Any, fn: string, ...a: unknown[]): Any => {
  try {
    return typeof R?.[fn] === "function" ? R[fn](...a) : undefined;
  } catch (e) {
    return `THROW ${errText(e)}`;
  }
};

// ═════════════════════════ pure ═════════════════════════
export function runPure(R: Any, g: Reg): void {
  const { chk, ck } = g;
  const T = R?.HR_LINE_TEXT ?? {};
  const TE = R?.HR_LINE_TEXT_EN ?? {};
  const miss = RULE_EXPORTS.filter((n) => R?.[n] === undefined);
  ck("S2.1", { exports: miss.length === 0, keys: Object.keys(T).length > 0 && srt(Object.keys(T)) === srt(Object.keys(TE)), th: Object.values(T).every((v) => typeof v === "string" && isThai(v)), en: Object.values(TE).every((v) => typeof v === "string" && /^[\x20-\x7e]+$/.test(v)) }, "text tables", `missing=${miss.join(",") || "-"}`);
  for (const [id, loc] of [["S2.2", "th"], ["S2.3", "en"]] as const) {
    const bad = KIND_CASES.map((c) => {
      const href = `https://qc45.invalid${HREF(c.kind, "r1")}`;
      const m = pure(R, "noticeMessage", { kind: c.kind, outcome: c.outcome, n: c.n }, loc, href);
      const b = bodyOk(m, loc, sentence(loc, c.kind, c.outcome, c.n), href);
      return b ? `${c.kind}:${c.outcome ?? "-"}(${b.slice(0, 60)})` : "";
    }).filter(Boolean);
    chk(id, bad.length === 0, `10 exact ${loc} bodies`, bad.slice(0, 3).join(" ") || "ok");
  }
  {
    const extra = { name: "สมชาย ใจดี", employeeName: "สมชาย", date: "2032-01-05", fromDate: "2032-01-05", amountSatang: 1234500, branch: "สาขาเหนือ", reason: "ป่วย" };
    const diffs = KIND_CASES.filter((c) => canon(pure(R, "noticeMessage", { kind: c.kind, outcome: c.outcome, n: c.n, ...extra }, "th", "https://x.invalid/a")) !== canon(pure(R, "noticeMessage", { kind: c.kind, outcome: c.outcome, n: c.n }, "th", "https://x.invalid/a")));
    const digits = KIND_CASES.filter((c) => c.kind !== "DIGEST").filter((c) => /\d/.test(flexParts(pure(R, "noticeMessage", c, "th", "https://x.invalid/a")?.flex).texts.join(" ") + String(pure(R, "noticeMessage", c, "th", "https://x.invalid/a")?.altText ?? "")));
    const leak = KIND_CASES.some((c) => /สมชาย|สาขา|12,345|2032/.test(canon(pure(R, "noticeMessage", { ...c, ...extra }, "th", "https://x.invalid/a"))));
    ck("S2.4", { loaded: typeof R?.noticeMessage === "function", same: diffs.length === 0, digits: digits.length === 0, leak: !leak }, "P1", `diff=${diffs.map((c) => c.kind).join(",") || "-"}`);
  }
  {
    const v = [["ROSTER", "p1"], ["LEAVE", "l1"], ["OT", "o1"], ["SWAP_ASK", "s1"], ["SWAP", "s1"], ["SLIP", "run1"], ["DIGEST", "d1"]].map(([k, r]) => [k!, pure(R, "hrefOf", { kind: k, refId: r }), HREF(k!, r!)]);
    const bad = v.filter(([, got, want]) => got !== want).map(([k, got]) => `${k}=${short(got, 40)}`);
    chk("S2.5", bad.length === 0, "F7 anchors", bad.join(" ") || "ok");
  }
  {
    const a = pure(R, "dedupeKeyOf", { kind: "LEAVE", refId: "L1", employeeId: "E1", outcome: "APPROVED" });
    const b = pure(R, "dedupeKeyOf", { kind: "ROSTER", refId: "P1", employeeId: "E1" });
    chk("S2.6", a === "hr:LEAVE:L1:E1:APPROVED" && b === "hr:ROSTER:P1:E1", "hr:LEAVE:L1:E1:APPROVED · hr:ROSTER:P1:E1", `${a} · ${b}`);
  }
  {
    const n0 = new Date("2032-01-10T03:00:00Z");
    const got = [1, 2, 3, 4].map((k) => {
      const d = pure(R, "nextAttemptAt", k, n0);
      return d instanceof Date ? String((d.getTime() - n0.getTime()) / 60_000) : String(d);
    });
    chk("S2.7", got.join(",") === "5,30,120,null", "5,30,120,null", got.join(","));
  }
  {
    const D = { enabled: false, events: { ROSTER: true, LEAVE: true, OT: true, SWAP: true, SLIP: true }, mode: "IMMEDIATE", digestAt: "17:30", monthlyCap: 200, unitId: null };
    const p = (x: unknown) => canon(pure(R, "lineNotifyPolicyOf", x));
    ck("S2.8", {
      def: p(undefined) === canon(D), junk: p({ enabled: "yes", mode: "X", digestAt: "25:00", monthlyCap: 5001, unitId: 7 }) === canon(D), zero: pure(R, "lineNotifyPolicyOf", { monthlyCap: 0 })?.monthlyCap === 0,
      max: pure(R, "lineNotifyPolicyOf", { monthlyCap: 5000 })?.monthlyCap === 5000, neg: pure(R, "lineNotifyPolicyOf", { monthlyCap: -1 })?.monthlyCap === 200,
      on: canon(pure(R, "lineNotifyPolicyOf", { enabled: true, mode: "DIGEST", digestAt: "18:00", events: { OT: false } })) === canon({ ...D, enabled: true, mode: "DIGEST", digestAt: "18:00", events: { ...D.events, OT: false } }),
    }, "defaults + clamps", short(pure(R, "lineNotifyPolicyOf", undefined), 120));
  }
  {
    const a = pure(R, "monthKeyBkk", new Date("2032-01-31T17:00:00Z"));
    const b = pure(R, "monthKeyBkk", new Date("2032-01-31T16:59:00Z"));
    chk("S2.9", a === "2032-02" && b === "2032-01", "2032-02 · 2032-01", `${a} · ${b}`);
  }
}
