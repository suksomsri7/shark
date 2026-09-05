// /developers/account — public developer page for the SHARK Accounting API (WO F1)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": every operation listed on this page comes straight from
//    `buildOpenApi(ACCOUNT_OPS)` — the same function the live `/api/v1/account/openapi.json`
//    route and `scripts/gen-account-api-docs.mts` call. There is no hand-written endpoint
//    array here (the anti-pattern of the platform `/developers` page above this one in the
//    repo, which grew stale because someone had to remember to edit it by hand).
// Server component, no client JS, no auth — a developer or an AI agent must be able to read
// this before they ever have an API key.
import type { Metadata } from "next";
import { API_SCOPE_BUNDLES, DEFAULT_BUNDLE_ID, DEFAULT_KEY_TTL_DAYS } from "@/lib/api-keys/scopes";
import { buildOpenApi } from "@/lib/modules/account/api/openapi";
import type { ApiOp, ApiOpKind } from "@/lib/modules/account/api/op";
import { ACCOUNT_OPS } from "@/lib/modules/account/api/registry";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/modules/account/api/respond";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";

export const metadata: Metadata = {
  title: "SHARK Accounting API for developers",
  description: "REST API for the SHARK accounting book: documents, payments, contacts, products, journal, reports, reconciliation and webhooks.",
};

const BASE_URL = "https://shark.in.th/api/v1/account";

const codeBox = "block overflow-x-auto whitespace-pre rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100";
const section = "flex flex-col gap-3 border-t pt-8 first:border-t-0 first:pt-0";
const h2 = "text-xl font-bold";
const h3 = "text-base font-semibold";
const table = "w-full border-collapse text-sm";
const th = "border-b py-1.5 pr-3 text-left font-semibold text-neutral-600";
const td = "border-b border-neutral-100 py-1.5 pr-3 align-top";

/** Short, human sentence per error code — the full table with HTTP status and next step lives in the generated doc. */
const ERROR_CODE_SUMMARY: Record<ApiErrorCode, string> = {
  unauthorized: "Missing or revoked API key.",
  key_expired: "The key's expiry date has passed.",
  system_required: "Key is not bound to a book and no X-Shark-System header was sent.",
  system_mismatch: "X-Shark-System does not match the book the key is bound to.",
  scope_missing: "The key lacks the scope this operation needs (see hint).",
  invalid_json: "Request body is not valid JSON.",
  validation: "Payload failed schema validation (see details[]).",
  idempotency_required: "A write was sent without an Idempotency-Key header.",
  idempotency_conflict: "The same Idempotency-Key was reused with a different body.",
  idempotency_in_progress: "A request with this key is still running.",
  confirm_required: "A danger operation was called without confirm: true.",
  not_found: "No such operation, or the record is not in this book.",
  method_not_allowed: "The path exists, but not with this HTTP method.",
  rate_limited: "Too many calls for this key; see Retry-After.",
  period_locked: "The accounting period of that date is closed.",
  state_conflict: "The record's current state does not allow this.",
  duplicate: "A conflicting record already exists.",
  forbidden: "Refused by a business rule, not by scope.",
  unprocessable: "Understood but cannot be completed as asked.",
  upstream_unavailable: "A dependency (for example the DBD lookup) is not reachable.",
};

const KIND_LABEL: Record<ApiOpKind, string> = { read: "Read", write: "Write", danger: "Danger" };
const KIND_BLURB: Record<ApiOpKind, string> = {
  read: "Safe at any time. No Idempotency-Key, nothing written, nothing audited.",
  write: "Changes data. Idempotency-Key required; every success is audited.",
  danger: "Hard to undo. Needs Idempotency-Key, confirm: true and a reason of 5+ characters.",
};

/** Domain menu derived from the id prefix everyone already uses in the registry (e.g. `documents.void` -> "documents"). */
function domainOf(op: ApiOp): string {
  return op.id.split(".")[0] ?? op.id;
}

function groupByKindThenDomain(ops: ApiOp[]): Map<ApiOpKind, Map<string, ApiOp[]>> {
  const byKind = new Map<ApiOpKind, Map<string, ApiOp[]>>();
  for (const kind of ["read", "write", "danger"] as const) byKind.set(kind, new Map());
  for (const op of ops) {
    const byDomain = byKind.get(op.kind)!;
    const list = byDomain.get(domainOf(op)) ?? [];
    list.push(op);
    byDomain.set(domainOf(op), list);
  }
  return byKind;
}

type Recipe = { title: string; scopes: string[]; steps: { comment: string; curl: string }[]; opIds: string[] };

/** Every path/field/scope below exists in the registry — see references at the bottom of each recipe. */
const RECIPES: Recipe[] = [
  {
    title: "Quotation -> invoice -> receipt",
    scopes: ["account.doc.create", "account.doc.issue"],
    opIds: ["documents.create", "documents.issue", "documents.respond", "documents.convert", "payments.record"],
    steps: [
      {
        comment: "Draft the quotation",
        curl: `curl -sS -X POST "${BASE_URL}/documents" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"QUOTATION","contactId":"c_123","lines":[{"description":"Dive trip","qty":1,"unitPriceSatang":1000000,"vatRateBp":700}]}'`,
      },
      { comment: "Issue it, then record acceptance", curl: `curl -sS -X POST "${BASE_URL}/documents/doc_123/issue" -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)"` },
      { comment: "Convert the accepted quotation into an invoice draft, then issue it", curl: `curl -sS -X POST "${BASE_URL}/documents/doc_123/convert" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" -d '{"toType":"INVOICE"}'` },
      {
        comment: "Record the payment, then convert the paid invoice into a receipt",
        curl: `curl -sS -X POST "${BASE_URL}/payments" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"documentId":"doc_456","rows":[{"paidAt":"2026-09-05","financeAccountId":"fin_123","amountSatang":1070000}]}'`,
      },
    ],
  },
  {
    title: "Deposit received, then applied to an invoice",
    scopes: ["account.doc.create", "account.payment.record"],
    opIds: ["documents.create", "documents.issue", "payments.record", "documents.set-deposits"],
    steps: [
      {
        comment: "Draft and issue a deposit receipt, then record the money coming in",
        curl: `curl -sS -X POST "${BASE_URL}/documents" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"DEPOSIT_RECEIPT","contactId":"c_123","lines":[{"description":"Booking deposit","qty":1,"unitPriceSatang":300000}]}'`,
      },
      {
        comment: "When the invoice is ready, deduct the deposit from it",
        curl: `curl -sS -X PUT "${BASE_URL}/documents/doc_456/deposits" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"picks":[{"depositId":"dep_123","amountSatang":300000}]}'`,
      },
    ],
  },
  {
    title: "Expense with withholding tax",
    scopes: ["account.doc.create", "account.payment.record"],
    opIds: ["documents.create", "documents.issue", "payments.record"],
    steps: [
      {
        comment: "Draft the expense against a vendor, then issue it",
        curl: `curl -sS -X POST "${BASE_URL}/documents" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"EXPENSE","contactId":"c_vendor_1","lines":[{"description":"Freelance dive guide","qty":1,"unitPriceSatang":500000}]}'`,
      },
      {
        comment: "Pay it, withholding tax on the professional service (40(6))",
        curl: `curl -sS -X POST "${BASE_URL}/payments" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"documentId":"exp_123","rows":[{"paidAt":"2026-09-05","financeAccountId":"fin_123","amountSatang":475000,"whtIncomeType":"PROFESSIONAL","whtRateBp":300,"whtAmountSatang":15000}]}'`,
      },
    ],
  },
  {
    title: "Purchase order -> purchase",
    scopes: ["account.doc.create", "account.doc.approve"],
    opIds: ["documents.create", "documents.issue", "documents.approve", "documents.convert"],
    steps: [
      {
        comment: "Draft the PO, submit for approval",
        curl: `curl -sS -X POST "${BASE_URL}/documents" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"PURCHASE_ORDER","contactId":"c_vendor_1","lines":[{"description":"Tank refills x50","qty":50,"unitPriceSatang":8000}]}'`,
      },
      { comment: "Approve it (ask the owner first), then convert into a purchase and issue it", curl: `curl -sS -X POST "${BASE_URL}/documents/po_123/approve" -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)"` },
    ],
  },
  {
    title: "PromptPay payment link",
    scopes: ["account.payment.record"],
    opIds: ["payment-requests.create", "payment-requests.confirm"],
    steps: [
      {
        comment: "Create the link and QR for an outstanding invoice",
        curl: `curl -sS -X POST "${BASE_URL}/payment-requests" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"documentId":"doc_456","financeAccountId":"fin_promptpay_1","expiresInDays":3}'`,
      },
      { comment: "Provider webhook confirms it automatically; a static QR can be confirmed by hand", curl: `curl -sS -X POST "${BASE_URL}/payment-requests/req_123/confirm" -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" -d '{}'` },
    ],
  },
  {
    title: "Bank reconciliation",
    scopes: ["account.reconcile"],
    opIds: ["reconcile.channels", "reconcile.import-statement", "reconcile.auto-match", "reconcile.match", "reconcile.confirm"],
    steps: [
      {
        comment: "Import the statement CSV for the month, then auto-match",
        curl: `curl -sS -X POST "${BASE_URL}/reconcile/statements" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"financeAccountId":"fin_123","period":"2026-09","source":"KBANK","fileName":"kbank-2026-09.csv","text":"date,description,amount\\n..."}'`,
      },
      { comment: "Confirm the month once the difference is zero", curl: `curl -sS -X POST "${BASE_URL}/reconcile/2026-09/confirm" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" -d '{"financeAccountId":"fin_123"}'` },
    ],
  },
  {
    title: "Period close",
    scopes: ["account.report.view", "account.period.close"],
    opIds: ["periods.checklist", "periods.close"],
    steps: [
      { comment: "Check what is blocking the close", curl: `curl -sS "${BASE_URL}/periods/2026-08/checklist" -H "Authorization: Bearer $SHARK_API_KEY"` },
      { comment: "Close once canClose is true (ask the accountant to confirm first)", curl: `curl -sS -X POST "${BASE_URL}/periods/2026-08/close" -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)"` },
    ],
  },
  {
    title: "Reading the dashboard and financial reports",
    scopes: ["account.doc.view", "account.report.view"],
    opIds: ["dashboard.get", "reports.profit-loss", "reports.trial-balance"],
    steps: [
      { comment: "Quick shop overview", curl: `curl -sS "${BASE_URL}/dashboard" -H "Authorization: Bearer $SHARK_API_KEY"` },
      { comment: "Profit and loss for a range, trial balance as CSV", curl: `curl -sS "${BASE_URL}/reports/trial-balance?from=2026-08-01&to=2026-08-31" -H "Authorization: Bearer $SHARK_API_KEY" -H "Accept: text/csv"` },
    ],
  },
];

const GLOSSARY: [string, string, string][] = [
  ["สมุดบัญชี", "accounting book", "X-Shark-System / systemId"],
  ["ใบเสนอราคา", "quotation", "QUOTATION"],
  ["ใบแจ้งหนี้", "invoice", "INVOICE"],
  ["ใบเสร็จรับเงิน", "receipt", "RECEIPT"],
  ["มัดจำ", "deposit", "DEPOSIT_RECEIPT / depositSatang"],
  ["ใบสั่งซื้อ", "purchase order", "PURCHASE_ORDER"],
  ["ยกเลิกเอกสาร", "void a document", "danger operation"],
  ["ผู้ติดต่อ (ลูกค้า/ผู้ขาย)", "contact (customer / supplier)", "contactId"],
  ["ผังบัญชี", "chart of accounts", "chart"],
  ["งวดบัญชี / ปิดงวด", "accounting period / period close", "period_locked"],
  ["ภาษีหัก ณ ที่จ่าย", "withholding tax (WHT)", "whtSatang"],
  ["กระทบยอด", "reconciliation", "reconcile"],
  ["สตางค์", "satang (1/100 of a baht)", "every *Satang field"],
];

export default function AccountApiDevPage() {
  const spec = buildOpenApi(ACCOUNT_OPS);
  const grouped = groupByKindThenDomain(ACCOUNT_OPS);
  const accountEvents = WEBHOOK_EVENTS.filter((e) => e.value.startsWith("account."));
  const withTool = ACCOUNT_OPS.filter((o) => o.tool);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">SHARK Developers</p>
        <h1 className="text-2xl font-bold">SHARK Accounting API</h1>
        <p className="text-sm text-neutral-700">
          REST API for one shop&apos;s accounting book: documents, payments, contacts, products, chart of accounts,
          journal, financial reports, reconciliation, and outgoing webhooks. Every operation, field and scope on this
          page is generated straight from the running registry (<code>buildOpenApi(ACCOUNT_OPS)</code>) — nothing here
          can drift from the live API.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a className="font-medium text-emerald-700 underline" href="/api/v1/account/openapi.json">
            /api/v1/account/openapi.json
          </a>
          <span className="text-neutral-400">·</span>
          <a className="font-medium text-emerald-700 underline" href="/developers/account.md">
            /developers/account.md
          </a>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-600">
            {spec.openapi} · {ACCOUNT_OPS.length} operations · version {spec.info.version}
          </span>
        </p>
      </header>

      <section className={section}>
        <h2 className={h2}>Authentication and scopes</h2>
        <p className="text-sm text-neutral-700">
          Send <code>Authorization: Bearer &lt;api key&gt;</code>. Keys are created by the shop owner in the accounting
          book settings (Connections &gt; External apps / API); the raw key is shown once. A key carries a list of{" "}
          <strong>scopes</strong> — the same permission keys the human roles use, so a key can never do more than a
          person could. Default for a key created from the accounting page: <code>{DEFAULT_BUNDLE_ID}</code>, valid
          for {DEFAULT_KEY_TTL_DAYS} days.
        </p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Bundle</th>
              <th className={th}>What it can do</th>
              <th className={th}>Scopes</th>
            </tr>
          </thead>
          <tbody>
            {API_SCOPE_BUNDLES.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <code>{b.id}</code>
                </td>
                <td className={td}>{b.summary}</td>
                <td className={`${td} font-mono text-xs`}>{b.scopes.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-neutral-700">
          A key is normally bound to one accounting book. If it is not, every call must carry{" "}
          <code>X-Shark-System: &lt;book id&gt;</code>. A call that needs a scope the key lacks fails with 403{" "}
          <code>scope_missing</code> and the missing scope in <code>hint</code>.
        </p>
      </section>

      <section className={section}>
        <h2 className={h2}>Conventions</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-700">
          <li>
            <strong>Money is satang.</strong> Every amount is an integer number of satang (1 baht = 100 satang), field
            names end with <code>Satang</code>. 1,250.50 baht is <code>125050</code>. Decimals are rejected, never
            rounded.
          </li>
          <li>
            <strong>Dates are <code>YYYY-MM-DD</code></strong> and mean a Thai calendar day (UTC+7). Instants are
            ISO-8601 UTC strings ending in <code>At</code>.
          </li>
          <li>
            <strong><code>Idempotency-Key</code>.</strong> Every write (POST, PATCH, PUT, DELETE) requires one, unique
            per logical attempt. Retrying with the same key and body replays the stored response (
            <code>Idempotent-Replayed: true</code>); a different body fails with 409 <code>idempotency_conflict</code>.
          </li>
          <li>
            <strong>Pagination.</strong> Lists take <code>page</code> (1 based) and <code>pageSize</code> (default 20,
            max 100) and answer with <code>page: {"{ page, pageSize, pageCount, total, hasMore }"}</code>.
          </li>
          <li>
            <strong>Envelope.</strong> Success is <code>{"{ data, page?, requestId }"}</code>. Failure is{" "}
            <code>{"{ error: { code, message_th, message_en, hint?, details? }, requestId }"}</code>.
          </li>
          <li>
            <strong>CSV.</strong> Reports and statements that list <code>text/csv</code> also answer{" "}
            <code>Accept: text/csv</code> with a file instead of the JSON envelope.
          </li>
          <li>
            <strong>Danger operations</strong> additionally require <code>confirm: true</code> and a{" "}
            <code>reason</code> of at least 5 characters, stored in the audit log.
          </li>
        </ul>
      </section>

      <section className={section}>
        <h2 className={h2}>Error codes</h2>
        <p className="text-sm text-neutral-700">Branch on `error.code`, never on the message text.</p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Code</th>
              <th className={th}>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {API_ERROR_CODES.map((code) => (
              <tr key={code}>
                <td className={td}>
                  <code>{code}</code>
                </td>
                <td className={td}>{ERROR_CODE_SUMMARY[code]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={section}>
        <h2 className={h2}>Operations</h2>
        <p className="text-sm text-neutral-700">
          Grouped by kind, then by menu. Every row below comes from the same operation registry as{" "}
          <code>/api/v1/account/openapi.json</code>.
        </p>
        {(["read", "write", "danger"] as const).map((kind) => {
          const byDomain = grouped.get(kind)!;
          const domains = [...byDomain.keys()].sort();
          const count = domains.reduce((n, d) => n + byDomain.get(d)!.length, 0);
          return (
            <details key={kind} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                {KIND_LABEL[kind]} operations ({count}) — {KIND_BLURB[kind]}
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                {domains.map((domain) => (
                  <details key={domain} className="pl-2">
                    <summary className="cursor-pointer text-sm font-medium capitalize">
                      {domain} ({byDomain.get(domain)!.length})
                    </summary>
                    <table className={`${table} mt-1`}>
                      <thead>
                        <tr>
                          <th className={th}>Operation</th>
                          <th className={th}>Method + path</th>
                          <th className={th}>Scope</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byDomain.get(domain)!.map((op) => (
                          <tr key={op.id}>
                            <td className={td}>
                              <code>{op.id}</code>
                              {op.tool ? <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">AI tool</span> : null}
                            </td>
                            <td className={`${td} font-mono text-xs`}>
                              {op.method} {op.path}
                            </td>
                            <td className={`${td} font-mono text-xs`}>{op.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ))}
              </div>
            </details>
          );
        })}
      </section>

      <section className={section}>
        <h2 className={h2}>Recipes</h2>
        <p className="text-sm text-neutral-700">
          Eight worked recipes covering the flows shop owners actually run. Each recipe below is a real sequence of
          calls with real paths and fields — replace the sample ids with ones your earlier calls returned.
        </p>
        {RECIPES.map((recipe, i) => (
          <div key={recipe.title} className="flex flex-col gap-2 rounded-lg border p-4">
            <h3 className={h3}>
              Recipe {i + 1}: {recipe.title}
            </h3>
            <p className="text-xs text-neutral-500">
              Scopes: <code>{recipe.scopes.join(", ")}</code> · Operations: <code>{recipe.opIds.join(", ")}</code>
            </p>
            {recipe.steps.map((step) => (
              <div key={step.comment} className="flex flex-col gap-1">
                <p className="text-sm text-neutral-700">{step.comment}</p>
                <pre className={codeBox}>
                  <code>{step.curl}</code>
                </pre>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className={section}>
        <h2 className={h2}>AI agents</h2>
        <p className="text-sm text-neutral-700">
          The {withTool.length} operations marked <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">AI tool</span> above
          are also published as a skill manifest at <code>/api/v1/ai/skills/account</code>, so an outside agent
          (Claude, GPT, Gemini, an n8n flow) can drive the book with the shop owner&apos;s API key. Read tools run
          immediately; write and danger tools create a <strong>proposal</strong> that the shop owner confirms in the
          SHARK app before anything changes. See the <a className="underline" href="/developers/account.md">full
          reference</a>, section &quot;AI agents&quot;, for the manifest shape and calling convention. Anthropic users
          can instead point Claude at the <code>shark-account-api</code> skill, which wraps this same REST API.
        </p>
      </section>

      <section className={section}>
        <h2 className={h2}>Webhooks</h2>
        <p className="text-sm text-neutral-700">
          The shop owner can subscribe an endpoint URL to any of these events (Connections &gt; External apps / API).
          Each delivery is <code>POST</code> with header <code>X-Shark-Signature</code> = HMAC-SHA256 of the raw body
          with the endpoint secret (lowercase hex), and a body of <code>{"{ type, payload, sentAt }"}</code>. Verify
          the signature over the <strong>raw</strong> bytes before parsing JSON.
        </p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Event</th>
              <th className={th}>Fires when (ไทย)</th>
            </tr>
          </thead>
          <tbody>
            {accountEvents.map((e) => (
              <tr key={e.value}>
                <td className={td}>
                  <code>{e.value}</code>
                </td>
                <td className={td}>{e.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={section}>
        <h2 className={h2}>Glossary (Thai / English)</h2>
        <p className="text-sm text-neutral-700">
          ศัพท์บัญชีไทยที่เจ้าของร้านใช้ เทียบกับชื่อฟิลด์ในสัญญา API (ภาษาอังกฤษ)
        </p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>ไทย</th>
              <th className={th}>English</th>
              <th className={th}>In the API</th>
            </tr>
          </thead>
          <tbody>
            {GLOSSARY.map(([th_, en, field]) => (
              <tr key={th_}>
                <td className={td}>{th_}</td>
                <td className={td}>{en}</td>
                <td className={`${td} font-mono text-xs`}>{field}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="border-t pt-4 text-xs text-neutral-500">
        Generated from the operation registry. Full prose reference:{" "}
        <a className="underline" href="/developers/account.md">
          /developers/account.md
        </a>{" "}
        · machine readable contract:{" "}
        <a className="underline" href="/api/v1/account/openapi.json">
          /api/v1/account/openapi.json
        </a>
        .
      </footer>
    </main>
  );
}
