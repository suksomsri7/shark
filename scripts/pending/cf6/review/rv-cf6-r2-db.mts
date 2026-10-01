// C5.5-fix5 INDEPENDENT REVIEW — round 2, DB probe (QC3 only · own throwaway tenant/user/system · cleaned up).
//   SIG.*  the r2 signature rule through the real service: legacy row cut mid-tag (written straight into the table the way the old
//          `.slice(0, 4000)` left it) re-saves with another field change · sanitized exactly 8 000 accepted and re-saves · 8 001 refused
//          with the row unchanged · raw 16 001 refused before sanitising · an entity/link-heavy signature that grows ×1.5 re-saves
//   HDR.*  route vs direct ingest: the route's own `normalizeProviderPayload` + `crmExtras` (cut out of route.ts with the TS AST, not
//          copied) feed ingestInbound (path A); the same raw provider object with its mixed-case headers goes straight into
//          ingestInbound (path B). Stored direction / contact / fromAddr / routing flags / threading must be equal for every case, and
//          no case where a sender adds duplicate-case or padded headers may come out authenticated (OUT) or attributed when it was not
//   TXT.*  bodyText cut at 1 000 000 through a surrogate pair stores fine
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf6/review/rv-cf6-r2-db.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const env = accEnv.loadQcEnv();
if (!/weathered-river/.test(String(env?.host ?? process.env.DATABASE_URL ?? ""))) { console.error("🔴 not QC3 — stop"); process.exit(4); }
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async (url: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  return new Response(JSON.stringify({ id: `re_${randomBytes(6).toString("hex")}` }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
process.env.CRM_INBOUND_AUTHSERV_ID = "mx.rv-cf6.test";

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => { cks.push({ id, ok: !!ok }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual.slice(0, 1500)}`); };
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const j = (v: unknown) => JSON.stringify(v);

// route.ts helpers, cut out with the TS AST
function cut(src: string, name: string): string {
  const sf = ts.createSourceFile("r.ts", src, ts.ScriptTarget.Latest, true);
  let out: string | null = null;
  const visit = (n: ts.Node) => { if (out) return; if (ts.isFunctionDeclaration(n) && n.name?.text === name) out = n.getText(sf); else ts.forEachChild(n, visit); };
  visit(sf);
  if (!out) throw new Error(`cut ${name}`);
  return out;
}
const IA = (await import("@/lib/core/inbound-address" as string)) as Any;
const routeSrc = readFileSync("src/app/api/email/inbound/route.ts", "utf8");
const routeJs = ts.transpileModule(["asString", "toRecipients", "toAttachments", "normalizeProviderPayload", "crmExtras"].map((f) => cut(routeSrc, f)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const R = new Function("capInboundEnvelope", `${routeJs}\nreturn { normalizeProviderPayload, crmExtras };`)(IA.capInboundEnvelope) as Any;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-rvcf6b-${rand}`;
const TENANTS: string[] = [], USERS: string[] = [], SYSTEMS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const SH = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  const STAFF = `${TAG}-owner@rvcf6.test`;
  const u = await P.user.create({ data: { email: STAFF, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  SYSTEMS.push(S);
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify({ uiVersion: 2, bridgesEnabled: true, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } }), S);
  const INBOX = `crm+${KEY}@shark.in.th`;
  const party = await P.party.create({ data: { tenantId: T, name: `cust ${TAG}`, kind: "PERSON" } });
  const CUST = `cust-${rand}@probe.test`;
  const contact = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `cust ${TAG}`, firstName: "cust", partyId: party.id, ownerUserId: u.id, email: CUST } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  const save = async (patch: Record<string, unknown>) => { try { return { ok: true, v: await CRM.emails.setUserSetting(ctx, owner, patch) }; } catch (e) { return { ok: false, err: `${(e as Any).code ?? ""} ${e instanceof Error ? e.message : String(e)}` }; } };
  const rowSig = async () => (await P.crmEmailUserSetting.findFirst({ where: { systemId: S, userId: u.id }, select: { signatureHtml: true, fromName: true } })) as Any;

  // ═══════════════ SIG ═══════════════
  await sub("SIG", async () => {
    chk("SIG.const", "constants: stored cap 8 000 · input cap 16 000", SH.CRM_EMAIL_SIGNATURE_MAX === 8000 && SH.CRM_EMAIL_SIGNATURE_INPUT_MAX === 16000, `${SH.CRM_EMAIL_SIGNATURE_MAX} / ${SH.CRM_EMAIL_SIGNATURE_INPUT_MAX}`);
    await save({ fromName: "init" });
    // legacy row: old code stored sanitize(x).slice(0, 4000) — cut inside a rebuilt <a … tag
    const link = `<a href="https://shop.example.com/p?a=1&b=2">ร้าน</a>`;
    let x = ""; for (let i = 0; x.length < 5000; i++) x += `<p>บรรทัด ${i} ${link}</p>`;
    const full = (await import("@/lib/core/sanitize" as string)).sanitizeHtml(x) as string;
    const legacy = full.slice(0, Math.min(4000, full.lastIndexOf("<a ", 4000) + 20));
    await P.crmEmailUserSetting.updateMany({ where: { systemId: S, userId: u.id }, data: { signatureHtml: legacy } });
    const before = await rowSig();
    const r1 = await save({ fromName: "หลังซ่อม", signatureHtml: before.signatureHtml });
    const after = await rowSig();
    const s = String(after?.signatureHtml ?? "");
    chk("SIG.legacy", "legacy row cut mid-tag (written as the old slice left it) re-saves together with a sender-name change; stored result well-formed and ≤ 8 000", r1.ok && after?.fromName === "หลังซ่อม" && s.length <= 8000 && s.lastIndexOf("<") < s.lastIndexOf(">"), `legacy ${legacy.length} chars ends ${j(legacy.slice(-40))} → ${j(r1).slice(0, 120)} · stored ${s.length} ends ${j(s.slice(-40))}`);
    const r1b = await save({ fromName: "อีกครั้ง", signatureHtml: s });
    chk("SIG.legacy.again", "the repaired value re-saves unchanged", r1b.ok && (await rowSig())?.signatureHtml === s, j(r1b).slice(0, 160));

    const exact = "ก".repeat(8000);
    const r2 = await save({ signatureHtml: exact });
    const r2b = await save({ fromName: "x8000", signatureHtml: (await rowSig())?.signatureHtml });
    chk("SIG.8000", "sanitized exactly 8 000 accepted, and re-saves", r2.ok && r2b.ok && (await rowSig())?.signatureHtml === exact, `${j(r2).slice(0, 80)} · ${j(r2b).slice(0, 80)}`);
    const r3 = await save({ fromName: "nope", signatureHtml: "ก".repeat(8001) });
    const row3 = await rowSig();
    chk("SIG.8001", "sanitized 8 001 refused (VALIDATION, nothing cut), row unchanged incl. the other field in the same patch", !r3.ok && /VALIDATION/.test(r3.err ?? "") && row3?.signatureHtml === exact && row3?.fromName === "x8000", `${r3.err} · fromName=${row3?.fromName}`);
    const r4 = await save({ signatureHtml: "ก".repeat(16001) });
    chk("SIG.16001", "raw 16 001 refused", !r4.ok && /VALIDATION/.test(r4.err ?? ""), r4.err ?? "accepted");
    const grow = Array.from({ length: 60 }, (_, i) => `<a href="https://x.co/?a=${i}&b=2">l${i}</a>`).join(" ");
    const r5 = await save({ signatureHtml: grow });
    const st5 = String((await rowSig())?.signatureHtml ?? "");
    const r5b = await save({ fromName: "grow", signatureHtml: st5 });
    chk("SIG.grow", "link/entity-heavy signature that grows on sanitising (accepted once) re-saves unchanged", r5.ok && r5b.ok && st5.length > grow.length && (await rowSig())?.signatureHtml === st5, `raw ${grow.length} → stored ${st5.length} · resave ${j(r5b).slice(0, 80)}`);
  });

  // ═══════════════ HDR: route vs direct ingest ═══════════════
  await sub("HDR", async () => {
    let n = 0;
    const deps = { transport: async () => ({ ok: true, id: `copy-${++n}` }) };
    const real = "mx.rv-cf6.test; dmarc=pass header.from=rvcf6.test";
    const forged = "mx.rv-cf6.test; dmarc=pass header.from=rvcf6.test";
    const pad = (k: number) => `other.mta; spf=none ${"x".repeat(k)}`;
    const cases: Record<string, { from: string; to?: string[]; headers: Record<string, string> }> = {
      clean: { from: STAFF, headers: { "Authentication-Results": real } },
      dupCaseForged: { from: STAFF, headers: { "authentication-results": "mx.rv-cf6.test; dmarc=fail header.from=rvcf6.test", "AUTHENTICATION-RESULTS": forged } },
      padOtherCase: { from: STAFF, headers: { "Authentication-Results": real, "authentication-results": pad(17000) } },
      padForgedCase: { from: STAFF, headers: { "authentication-results": "mx.rv-cf6.test; dmarc=fail header.from=rvcf6.test", "Authentication-Results": forged + " " + "y".repeat(17000) } },
      spacedKey: { from: STAFF, headers: { "authentication-results": "mx.rv-cf6.test; dmarc=fail header.from=rvcf6.test", " Authentication-Results ": forged } },
      replyToCase: { from: `stranger-${rand}@shop-other.test`, headers: { "Reply-To": CUST, "reply-to": pad(17000) } },
      replyToShort: { from: `stranger-${rand}@shop-other.test`, headers: { "REPLY-TO": CUST } },
      refsCase: { from: CUST, headers: { References: "<short@x>", references: `<${"r".repeat(17000)}@x>` } },
    };
    const out: Record<string, unknown> = {};
    let same = true;
    for (const [k, c] of Object.entries(cases)) {
      const res: unknown[] = [];
      for (const path of ["A", "B"]) {
        const raw = { messageId: `<${TAG}-${k}-${path}@probe.test>`, from: c.from, to: c.to ?? [INBOX, CUST], subject: `hdr ${k}`, text: "body", headers: c.headers };
        let r: Any;
        if (path === "A") {
          const p = R.normalizeProviderPayload(raw);
          const ex = R.crmExtras(raw);
          r = await CRM.emails.ingestInbound({ ...p, to: p.to, cc: ex.cc, headers: ex.headers }, deps);
        } else r = await CRM.emails.ingestInbound({ ...raw, cc: [], html: "", attachments: [] }, deps);
        const row = r?.emailId ? await P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { direction: true, contactId: true, fromAddr: true, routing: true, references: true, sentById: true } }) : null;
        res.push({ ok: r?.ok, handled: r?.handled, reason: r?.reason ?? null, dir: row?.direction ?? null, contact: row ? (row.contactId === contact.id ? "CONTACT" : row.contactId ? "OTHER" : null) : null, sentBy: row?.sentById ? "STAFF" : null, from: row?.fromAddr ?? null, routing: row?.routing ?? null, refs: row?.references ?? null });
      }
      out[k] = res;
      if (j(res[0]) !== j(res[1])) same = false;
    }
    chk("HDR.same", "route path (normalizeProviderPayload + crmExtras → ingest) and direct ingest of the raw mixed-case object store the same result for every case", same, j(out).slice(0, 1500));
    const dir = (k: string) => (out[k] as Any[])[0]?.dir;
    chk("HDR.pos", "positive control: clean staff copy with our A-R ⇒ OUT (sent by staff)", dir("clean") === "OUT", j(out.clean));
    chk("HDR.safe", "no duplicate-case / padded / spaced-key A-R variant comes out authenticated (all IN, none sent-by-staff)", ["dupCaseForged", "padOtherCase", "padForgedCase", "spacedKey"].every((k) => dir(k) === "IN" && (out[k] as Any[]).every((x) => x.sentBy === null)), ["dupCaseForged", "padOtherCase", "padForgedCase", "spacedKey"].map((k) => `${k}=${dir(k)}`).join(" "));
    chk("HDR.replyto", "Reply-To padded through a duplicate-case header is dropped (not used); never attributes a stranger to the contact", (out.replyToCase as Any[]).every((x) => x.contact === null) && (out.replyToShort as Any[]).every((x) => x.contact === null), `${j(out.replyToCase)} · ${j(out.replyToShort)}`);
    chk("HDR.refs", "References short + long duplicate-case ⇒ joined header dropped on both paths", (out.refsCase as Any[]).every((x) => j(x.refs) === "[]"), j(out.refsCase));
  });

  // ═══════════════ TXT ═══════════════
  await sub("TXT", async () => {
    const text = "a".repeat(999_999) + "😀" + "tail";
    const r = await CRM.emails.ingestInbound({ messageId: `<${TAG}-txt@probe.test>`, from: CUST, to: [INBOX], cc: [], subject: "txt", text, html: "", headers: {}, attachments: [] }, { transport: async () => ({ ok: true, id: "t" }) });
    const row = r?.emailId ? await P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { bodyText: true, snippet: true } }) : null;
    const b = String(row?.bodyText ?? "");
    chk("TXT.surrogate", "1 000 000-char cut through a surrogate pair: stored without error, ≤ 1 000 000 code units, tail gone, snippet = 200 'a'", r?.ok === true && b.length <= 1_000_000 && b.length >= 999_999 && !b.endsWith("tail") && row?.snippet === "a".repeat(200), `ok=${r?.ok} len=${b.length} last=${b.charCodeAt(b.length - 1).toString(16)} snippet=${String(row?.snippet).length}`);
  });
} finally {
  await new Promise((r) => setTimeout(r, 1_500));
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  for (const T of TENANTS) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (const sid of SYSTEMS) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${sid}%`).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
  }
  for (const uid of USERS) { await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.user.delete({ where: { id: uid } }).catch(() => undefined); }
  const buckets = SYSTEMS.length ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE ANY($1::text[])`, SYSTEMS.map((s) => `%${s}%`))) as Any[])[0]?.n ?? 0) : 0;
  chk("CLEAN", "throwaway tenant, user, system, rate buckets removed (0 rows left)", left.length === 0 && buckets === 0 && (await P.tenant.count({ where: { id: { in: TENANTS } } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `${left.join(" · ") || "-"} buckets=${buckets}`);
  await prisma.$disconnect();
}
const passed = cks.filter((x) => x.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} rv-cf6-r2-db: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ probe: "rv-cf6-r2-db", total: cks.length, passed, failed: cks.filter((x) => !x.ok).map((x) => x.id) })}`);
process.exit(0);
