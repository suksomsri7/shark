// QC — HOTFIX 2026-10-01 item 3a: shop payment profile (PromptPay ID = where customers' QR payments land)
//   `savePaymentProfileAction` (src/lib/payment/actions.ts) required only "member of the shop" ⇒ any STAFF could redirect payments.
//   Now: OWNER/MANAGER only (`canManagePaymentProfile`) + every change writes AuditLog `payment.profile.update`
//   (PromptPay ID masked to the last 4 digits, before → after; a no-op save writes nothing).
// QC DATABASE ONLY (.env.qc / qc3 via scripts/acc-v2-env.mts — prod-host guard BEFORE importing the db) ·
// own throwaway tenant `qc-hsan-pay-<rand>` · cleans to 0 rows.
// Run (controller): env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-payment-authz-hotfix.mts
// Note: ledger/wo-notes/hotfix-sanitize-2026-10-01.md §"Item 3"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
const svc = (await import("@/lib/payment/service" as string)) as Record<string, (...a: Any[]) => Any>;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const P = prisma as Any;
const TAG = `qc-hsan-pay-${Math.random().toString(36).slice(2, 8)}`;
let tid = "";
try {
  // ═══ S1 gate (pure) ═══
  const can = svc.canManagePaymentProfile as (m: Any) => boolean;
  const gate = typeof can === "function"
    ? [can({ role: "OWNER" }), can({ role: "MANAGER" }), can({ role: "STAFF" }), can({ role: "STAFF", permissions: { "account.finance.manage": true, "account.*": true } }), can(null)]
    : [];
  chk("PZ-S1.1", "canManagePaymentProfile: OWNER ✓ · MANAGER ✓ · STAFF ✗ · STAFF with any keys ✗ · null ✗", JSON.stringify(gate) === "[true,true,false,false,false]", "[t,t,f,f,f]", JSON.stringify(gate));
  const mask = svc.maskPromptPayId as (v: Any) => Any;
  chk("PZ-S1.2", "maskPromptPayId('0812345678') = '******5678' · 13-digit id keeps last 4 · null → null",
    typeof mask === "function" && mask("0812345678") === "******5678" && mask("1234567890123") === "*********0123" && mask(null) === null, "masked", typeof mask === "function" ? `${mask("0812345678")} ${mask("1234567890123")}` : "missing", "MAJOR");

  // ═══ S2 action wiring (static — server actions need a session) ═══
  const src = readFileSync("src/lib/payment/actions.ts", "utf8");
  const i = src.indexOf("export async function savePaymentProfileAction");
  const body = src.slice(i, src.indexOf("export ", i + 10));
  const g = body.indexOf("canManagePaymentProfile(");
  const w = body.indexOf("savePaymentProfile(");
  chk("PZ-S2.1", "savePaymentProfileAction checks canManagePaymentProfile(...) BEFORE savePaymentProfile(...) and passes the actor (actorUserId)", i >= 0 && g > 0 && w > g && /actorUserId:\s*auth\.user\.id/.test(body), "gate first + actor", `gate@${g} save@${w}`);

  // ═══ S3 audit on change (DB) ═══
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tid = t.id;
  const owner = "qc-hsan-pay-actor";
  const audits = () => P.auditLog.findMany({ where: { tenantId: tid, action: "payment.profile.update" }, orderBy: { createdAt: "asc" } });
  await svc.savePaymentProfile({ tenantId: tid, actorUserId: owner }, { promptpayId: "0812345678", displayName: "ร้าน QC" });
  let a = await audits();
  chk("PZ-S3.1", "first save → 1 audit row: before null · after { promptpayId: '******5678', displayName } · actorId = caller · no full number anywhere",
    a.length === 1 && a[0].before == null && a[0].after?.promptpayId === "******5678" && a[0].after?.displayName === "ร้าน QC" && a[0].actorId === owner && !JSON.stringify(a).includes("0812345678"),
    "1 masked row", JSON.stringify(a.map((r: Any) => ({ b: r.before, a: r.after, by: r.actorId }))).slice(0, 240));
  await svc.savePaymentProfile({ tenantId: tid, actorUserId: owner }, { promptpayId: "0812345678", displayName: "ร้าน QC" });
  a = await audits();
  chk("PZ-S3.2", "saving the same values again writes no audit row", a.length === 1, "1", String(a.length), "MAJOR");
  await svc.savePaymentProfile({ tenantId: tid, actorUserId: owner }, { promptpayId: "0899990000", displayName: "ร้าน QC" });
  a = await audits();
  const last = a[a.length - 1];
  chk("PZ-S3.3", "changing the PromptPay ID → new row before '******5678' → after '******0000' · profile holds the new id",
    a.length === 2 && last.before?.promptpayId === "******5678" && last.after?.promptpayId === "******0000" && (await P.paymentProfile.findUnique({ where: { tenantId: tid } }))?.promptpayId === "0899990000",
    "2 rows", JSON.stringify(a.map((r: Any) => [r.before?.promptpayId, r.after?.promptpayId])));
  let threw = false;
  try { await svc.savePaymentProfile({ tenantId: tid, actorUserId: owner }, { promptpayId: "12", displayName: "x" }); } catch { threw = true; }
  chk("PZ-S3.4", "invalid PromptPay ID still rejected (unchanged validation) and writes no audit", threw && (await audits()).length === 2, "throw + 2 rows", `threw=${threw}`, "MAJOR");
} catch (e) {
  chk("CRASH", "finished", false, "finished", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tid) {
      await P.auditLog.deleteMany({ where: { tenantId: tid } });
      await P.paymentProfile.deleteMany({ where: { tenantId: tid } });
      await P.tenant.deleteMany({ where: { id: tid } });
      const left = (await P.auditLog.count({ where: { tenantId: tid } })) + (await P.paymentProfile.count({ where: { tenantId: tid } })) + (await P.tenant.count({ where: { slug: TAG } }));
      chk("PZ-CLEAN", "cleanup → 0 rows of this run left (audit + profile + tenant)", left === 0, "0", String(left), "MAJOR");
    }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 160)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC hotfix payment profile authz =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
