// ONE-OFF (c42b it7 · re-review RVR-2): rows the button runner left OUTSIDE its restore proof (run2 … dbg18). DEFAULT = READ-ONLY:
// prints exactly which rows it would delete and why. Deletes ONLY with `--apply` (the controller decides — the lane never applies),
// under scripts/with-gate-lock.sh (QC1 lock), and only rows PROVABLY created by the runner:
//   A AccountContact  name starts with the runner tag "qc-btn-" AND its partyId is null or points at a Party that no longer exists
//     (the runner's restore deleted the Party; the accounting-customer sync consumer had already copied it)
//   B MemberNotification / MemberAttribution / MemberTierHistory  whose Customer no longer exists AND created inside a runner window
//     (QC1 tenant: Customer rows are only ever deleted by the runner's restore) — incl. the QUEUED WELCOME e-mails
//   C AiCreditTxn (only with --include-ai)  kind USAGE by a QC persona inside a runner window (ai=mock still debits the wallet); the
//     wallet balance is credited back by the same Σ in the same transaction
//   D AppNotification (only with --include-appnotif)  inside a runner window AND title/body naming a runner entity ("qc-btn")
// Rows that match a model but not the proof are LISTED as "kept" and never touched. AuditLog / OutboxEvent are append-only by design.
// usage: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c42b/cleanup-it7-leftovers.mts [--apply] [--include-ai] [--include-appnotif]
import { readFileSync } from "node:fs";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const h = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse(readFileSync(process.env.CRM_EXPECTED_PATH ?? "scripts/crm-expected.json", "utf8"));
const T: string = E.tenantId;
const APPLY = process.argv.includes("--apply"), AI = process.argv.includes("--include-ai"), AN = process.argv.includes("--include-appnotif");
// runner windows (UTC) — from /tmp/c42b-logs/<label>.status first/last step times and ledger/wo-notes/crm-C4.2.md (run3 11:50–17:44,
//   run4 22:17–03:24, run5 13:57–18:51), widened by the first step's duration. run1 (no status times) is not covered: its rows stay.
const WINDOWS: [string, string, string][] = [
  ["run2", "2026-10-01T03:30:00Z", "2026-10-01T06:25:00Z"], ["dbg2", "2026-10-01T06:40:00Z", "2026-10-01T09:35:00Z"],
  ["dbg3", "2026-10-01T09:35:00Z", "2026-10-01T11:15:00Z"], ["run3", "2026-10-01T11:45:00Z", "2026-10-01T17:46:00Z"],
  ["dbg4-7", "2026-10-01T18:40:00Z", "2026-10-01T19:30:00Z"], ["run4", "2026-10-01T22:15:00Z", "2026-10-02T03:26:00Z"],
  ["dbg8", "2026-10-02T03:50:00Z", "2026-10-02T04:27:00Z"], ["dbg9-14", "2026-10-02T06:20:00Z", "2026-10-02T10:20:00Z"],
  ["run5", "2026-10-02T13:55:00Z", "2026-10-02T18:53:00Z"], ["dbg15-18", "2026-10-02T18:58:00Z", "2026-10-02T19:30:00Z"],
];
const inWin = (d: Date): string | null => { for (const [k, a, b] of WINDOWS) if (d >= new Date(a) && d <= new Date(b)) return k; return null; };
const anyWin = { OR: WINDOWS.map(([, a, b]) => ({ createdAt: { gte: new Date(a), lte: new Date(b) } })) };
const host = h.host.split(".")[0]!;
console.log(`cleanup-it7-leftovers · QC host ${host} · tenant ${T} · ${APPLY ? "APPLY" : "READ-ONLY (no --apply)"}${AI ? " · +AI" : ""}${AN ? " · +AppNotification" : ""}`);
if (!/ep-plain-art/.test(h.host)) { console.log("not QC1 — stop"); process.exit(1); }

const del: Record<string, string[]> = {};
const kept: Record<string, number> = {};
const add = (m: string, id: string) => (del[m] ??= []).push(id);

// A
const ac = await P.accountContact.findMany({ where: { tenantId: T, name: { startsWith: "qc-btn-" } }, select: { id: true, name: true, partyId: true, createdAt: true, systemId: true } });
console.log(`\n[A] AccountContact named qc-btn-* (all time): ${ac.length}`);
for (const r of ac) {
  const party = r.partyId ? await P.party.findFirst({ where: { id: r.partyId }, select: { id: true } }) : null;
  if (!party) { add("accountContact", r.id); console.log(`  DELETE ${r.id} ${r.createdAt.toISOString().slice(0, 16)} [${inWin(r.createdAt) ?? "outside windows"}] party ${r.partyId ? "MISSING" : "null"} · ${r.name.slice(0, 40)}`); }
  else { kept.AccountContact = (kept.AccountContact ?? 0) + 1; console.log(`  keep   ${r.id} party still exists · ${r.name.slice(0, 40)}`); }
}
const acOther = await P.accountContact.findMany({ where: { tenantId: T, NOT: { name: { startsWith: "qc-btn-" } }, partyId: { not: null }, ...anyWin }, select: { id: true, name: true, partyId: true, createdAt: true } });
let acOtherGone = 0;
for (const r of acOther) if (!(await P.party.findFirst({ where: { id: r.partyId }, select: { id: true } }))) { acOtherGone++; console.log(`  keep   ${r.id} ${r.createdAt.toISOString().slice(0, 16)} [${inWin(r.createdAt)}] party MISSING but name not runner-tagged ("${r.name.slice(0, 30)}") — not provable, listed only`); }
console.log(`  (untagged AccountContact in windows with a missing party: ${acOtherGone} — listed, never deleted)`);

// B
const custGone = async (id: string) => !(await P.customer.findFirst({ where: { id }, select: { id: true } }));
for (const [m, label] of [["memberNotification", "MemberNotification"], ["memberAttribution", "MemberAttribution"], ["memberTierHistory", "MemberTierHistory"]] as const) {
  const sel: any = { id: true, customerId: true, createdAt: true };
  if (m === "memberNotification") Object.assign(sel, { channel: true, status: true, event: true });
  const rows = await P[m].findMany({ where: { tenantId: T, ...anyWin }, select: sel, orderBy: { createdAt: "asc" } });
  let d = 0, k = 0;
  console.log(`\n[B] ${label} created in runner windows: ${rows.length}`);
  for (const r of rows) {
    if (await custGone(r.customerId)) { add(m, r.id); d++; console.log(`  DELETE ${r.id} ${r.createdAt.toISOString().slice(0, 16)} [${inWin(r.createdAt)}] customer MISSING${m === "memberNotification" ? ` · ${r.channel} ${r.status} ${r.event}` : ""}`); }
    else k++;
  }
  if (k) kept[label] = k;
  console.log(`  → delete ${d} · keep ${k} (customer exists)`);
}

// C
const uids = Object.values(E.users ?? {}).map((u: any) => u?.userId).filter(Boolean);
const tx = await P.aiCreditTxn.findMany({ where: { tenantId: T, kind: "USAGE", ...anyWin }, select: { id: true, amountMicro: true, userId: true, createdAt: true } });
const txMine = tx.filter((r: any) => r.userId && uids.includes(r.userId));
const sumMicro = txMine.reduce((a: number, r: any) => a + r.amountMicro, 0);
console.log(`\n[C] AiCreditTxn USAGE in windows: ${tx.length} · by QC personas ${txMine.length} · Σ amountMicro ${sumMicro} ${AI ? "→ DELETE + wallet += " + -sumMicro : "(listed only — needs --include-ai)"}`);
const byWin = new Map<string, number>(); for (const r of txMine) byWin.set(inWin(r.createdAt)!, (byWin.get(inWin(r.createdAt)!) ?? 0) + 1);
console.log(`  per window: ${JSON.stringify([...byWin])}`);
if (AI) for (const r of txMine) add("aiCreditTxn", r.id);

// D
const an = await P.appNotification.findMany({ where: { tenantId: T, ...anyWin }, select: { id: true, title: true, body: true, createdAt: true, emailedAt: true } });
const anMine = an.filter((r: any) => /qc-btn/.test(`${r.title} ${r.body}`));
console.log(`\n[D] AppNotification in windows: ${an.length} · naming a runner entity (qc-btn): ${anMine.length} · e-mailed: ${an.filter((r: any) => r.emailedAt).length} ${AN ? "→ DELETE the qc-btn ones" : "(listed only — needs --include-appnotif)"}`);
const titles = new Map<string, number>(); for (const r of an) titles.set(r.title.slice(0, 50), (titles.get(r.title.slice(0, 50)) ?? 0) + 1);
for (const [t, k] of titles) console.log(`  ${k}× ${t}`);
if (AN) for (const r of anMine) add("appNotification", r.id);

// QUEUED welcome e-mails — can anything send them?
const q = await P.memberNotification.count({ where: { tenantId: T, status: "QUEUED" } });
console.log(`\n[note] MemberNotification QUEUED in tenant now: ${q} (the member notification sender runs from a cron QC does not run, and the QC server has no RESEND key — see it7 notes)`);

console.log(`\nSUMMARY would delete: ${Object.entries(del).map(([m, ids]) => `${m} ${ids.length}`).join(" · ") || "nothing"} · kept: ${JSON.stringify(kept)}`);
if (!APPLY) { console.log("READ-ONLY — nothing deleted (add --apply under the gate lock to delete exactly the rows above)"); await prisma.$disconnect(); process.exit(0); }
// APPLY — one transaction; the gate-lock check mirrors the runner (flock … /tmp/shark-gate*.lock in the parent chain)
{
  let pid = process.pid, held = false;
  try { for (let i = 0; i < 12 && pid > 1; i++) { const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" "); if (/\bflock\b.*\/tmp\/shark-gate[^ ]*\.lock/.test(cmd)) { held = true; break; } pid = Number(readFileSync(`/proc/${pid}/stat`, "utf8").replace(/^.*\) /, "").split(" ")[1]); } } catch { /* no /proc */ }
  if (!held) { console.log("refused: --apply must run under scripts/with-gate-lock.sh"); process.exit(1); }
}
await P.$transaction(async (t: any) => {
  for (const [m, ids] of Object.entries(del)) { const r = await t[m].deleteMany({ where: { id: { in: ids }, tenantId: T } }); console.log(`  deleted ${m} ${r.count}`); }
  if (AI && sumMicro) { const w = await t.aiCreditWallet.update({ where: { tenantId: T }, data: { balanceMicro: { increment: -sumMicro } }, select: { balanceMicro: true } }); console.log(`  AiCreditWallet balance → ${w.balanceMicro}`); }
});
await prisma.$disconnect();
