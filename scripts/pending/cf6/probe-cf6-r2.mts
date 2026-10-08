// C5.5-fix5 ROUND 2 — probe for review C5.5-fix5 RV5-1 · RV5-2 · RV5-3 (+ RV5-4 nuance) · QC3 only · own throwaway tenant, cleaned up
//   SIG   any signature the system stored can be saved back unchanged (service + REST schema) · the other fields of that save are kept ·
//         stored output always well-formed · raw input bounded before sanitising · legacy stored values (≤ 4 000, cut mid-tag) load and re-save
//   TEXT  inbound bodyText capped at 1 000 000 like the HTML (CRM) · board mail-in text path already bounded (BODY_MAX)
//   HDR   ingestInbound caps headers AFTER the case-insensitive join (a short duplicate cannot survive next to an over-long one)
//   F16   the widened scanner catches every shape the reviewer listed and nothing in the tree except the allow-list
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf6/probe-cf6-r2.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const env = accEnv.loadQcEnv();
if (!/weathered-river/.test(String(env?.host ?? process.env.DATABASE_URL ?? ""))) { console.error("🔴 not QC3 — stop"); process.exit(4); }
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async (url: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  return new Response(JSON.stringify({ id: `re_${randomBytes(6).toString("hex")}` }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual.slice(0, 1500)}`);
};
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const j = (v: unknown) => JSON.stringify(v);
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return ""; } catch (e) { return `${(e as Any).code ?? ""} ${e instanceof Error ? e.message : String(e)}`; } };
/** well-formed = no tag cut in half: every `<` (the engine escapes stray ones) opens a tag that has its `>` and balanced quotes.
 *  (An element left open by the author — e.g. `<a …>` with no `</a>` — is ordinary HTML the engine passes through for ANY input,
 *  not a cut; RV-4/RV5-1 are about cutting inside a tag.) */
const wellFormed = (h: string) => h.split("<").slice(1).every((seg) => seg.includes(">") && seg.slice(0, seg.indexOf(">")).split('"').length % 2 === 1);

// ═══════════════ F16 (pure) ═══════════════
{
  const SC = (await import("../../lib/tag-strip-scan.mjs" as string)) as Any;
  const shapes = [
    String.raw`const a = s.replace(/<\/?[a-z][^>]*>/gi, "");`,
    String.raw`const a = s.replace(/<\/?\w+[^>]*>/g, "");`,
    String.raw`const a = s.replace(/<[a-z]+[^>]*>/gi, "");`,
    String.raw`const a = s.replace(/<(?:p|div)[^>]*>/gi, "\n");`,
    String.raw`const a = s.replace(/<[a-z][\s\S]*?>/gi, "");`,
    String.raw`const a = s.replace(/<\/[^>]*>/g, "");`,
    String.raw`const a = s.replace(/<![^>]*>/g, "");`,
    String.raw`const a = s.replace(RegExp("<[^>]+>", "g"), "");`,
  ];
  const miss = shapes.filter((s) => SC.findTagStripRegex(s).length !== 1);
  const quiet = [
    String.raw`const re = /(?<![\w+])(?:\+66[\s-]?|0)\d/g;`,
    String.raw`const re = /(?<![^\s@"'<>])[^\s@"'<>]+@x/g;`,
    String.raw`const re = /(?<![a-z])(?=[a-z]*on[a-z])[a-z]+\s*=/i;`,
    String.raw`const parts = html.split(/(<[^<>]*>)/);`,
    String.raw`const t = h.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");`,
    String.raw`const t = h.replace(/<br\s*\/?>/gi, "\n");`,
  ];
  const noisy = quiet.filter((s) => SC.findTagStripRegex(s).length !== 0);
  chk("F16.wide", "scanner catches every reviewer shape (<\\/?[a-z][^>]*> · <\\/?\\w+[^>]*> · <[a-z]+[^>]*> · <(?:p|div)[^>]*> · <[a-z][\\s\\S]*?> · <\\/[^>]*> · <![^>]*> · RegExp(…) without new) and stays quiet on lookbehinds / [^<>] / fixed tags",
    miss.length === 0 && noisy.length === 0, `missed=${j(miss)} false=${j(noisy)}`);
}

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf6r2-${rand}`;
const TENANTS: string[] = [];
const USERS: string[] = [];
const SYSTEMS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const SAN = (await import("@/lib/core/sanitize" as string)) as Any;
  const SH = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  SYSTEMS.push(S);
  const crmSettings = { uiVersion: 2, bridgesEnabled: true, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } };
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(crmSettings), S);
  const INBOX = `crm+${KEY}@shark.in.th`;
  const owner = { userId: u.id, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  const rowOf = () => P.crmEmailUserSetting.findFirst({ where: { systemId: S, userId: u.id }, select: { fromName: true, signatureHtml: true } });

  // ═══════════════ SIG (RV5-1) ═══════════════
  await sub("SIG", async () => {
    const link = `<a href="https://shop.example.com/p?a=1&b=2">ร้าน</a>`;
    let input = "";
    for (let i = 0; ; i++) { const next = input + `<p>บรรทัด ${i} ${link}</p>`; if (next.length > 4000) break; input = next; }
    const first = await CRM.emails.setUserSetting(ctx, owner, { signatureHtml: input });
    const stored = String(first?.signatureHtml ?? "");
    const resaveErr = await errOf(() => CRM.emails.setUserSetting(ctx, owner, { fromName: "ชื่อใหม่", signatureHtml: stored }));
    const row = await rowOf();
    chk("SIG.resave", `the reviewer's round trip: input ${input.length} chars stored sanitized at ${stored.length}; re-saving the card (new sender name + the stored signature sent back) is accepted, the name is kept, the signature is unchanged`,
      stored.length > 4000 && resaveErr === "" && row?.fromName === "ชื่อใหม่" && row?.signatureHtml === stored, `stored=${stored.length} err=${resaveErr} row.fromName=${row?.fromName} same=${row?.signatureHtml === stored}`);
    // REST: emails.userSettings.set input schema must accept what emails.userSettings.get returns
    const REG = (await import("@/lib/modules/crm/api/registry" as string)) as Any;
    const op = (REG.CRM_OPS as Any[]).find((o) => o.id === "emails.userSettings.set");
    const restSig = op?.input?.safeParse?.({ fromName: "ชื่อ REST", signatureHtml: stored });
    const restSig2 = op?.input?.safeParse?.({ signature: stored });
    chk("SIG.rest", "REST read-then-write: the userSettings.set schema accepts the stored signature (both `signatureHtml` and `signature`)", !!restSig?.success && !!restSig2?.success, `${j(restSig?.error?.issues ?? "ok").slice(0, 300)} · ${j(restSig2?.error?.issues ?? "ok").slice(0, 200)}`);

    // every stored value re-saves to itself: a mixed corpus of accepted inputs
    const pieces = [link, "<p>สมชาย ใจดี</p>", "<b>หนา</b> & <i>เอียง</i>", "<br>", "5 < 6 > 3", "<script>x</script>", "<img src=\"https://x/y.png\">", "\"quote\" 'q'", "<a href=\"mailto:a@b.co?subject=x&body=y\">mail</a>"];
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const bad: string[] = [];
    let n = 0;
    for (let k = 0; k < 40; k++) {
      let s = "";
      const target = Math.floor(rnd() * 9000);
      while (s.length < target) s += pieces[Math.floor(rnd() * pieces.length)];
      const e1 = await errOf(() => CRM.emails.setUserSetting(ctx, owner, { signatureHtml: s }));
      if (e1) continue; // refused input is fine — the question is about what WAS stored
      n += 1;
      const st = String((await rowOf())?.signatureHtml ?? "");
      const e2 = await errOf(() => CRM.emails.setUserSetting(ctx, owner, { fromName: `n${k}`, signatureHtml: st }));
      const st2 = String((await rowOf())?.signatureHtml ?? "");
      if (e2 || st2 !== st || !wellFormed(st) || st.length > SH.CRM_EMAIL_SIGNATURE_MAX) bad.push(`len=${s.length}/${st.length} e2=${e2} same=${st2 === st} wf=${wellFormed(st)}`);
    }
    chk("SIG.roundtrip", `40 random signatures (0–9 000 chars, links/entities/tags): every stored one is well-formed, within the stored cap, and re-saves to itself (${n} stored)`, bad.length === 0 && n >= 10, `stored=${n} bad=${j(bad.slice(0, 4))} cap=${SH.CRM_EMAIL_SIGNATURE_MAX}`);

    // over the caps: refused, nothing changes
    const before = await rowOf();
    let grow = ""; for (let i = 0; grow.length < (SH.CRM_EMAIL_SIGNATURE_INPUT_MAX ?? 16000) - 200; i++) grow += `<p>${i} ${link}</p>`;
    const sanLen = (SAN.sanitizeHtml(grow) as string).length;
    const eSan = await errOf(() => CRM.emails.setUserSetting(ctx, owner, { fromName: "ไม่ควรถูกเก็บ", signatureHtml: grow }));
    const eRaw = await errOf(() => CRM.emails.setUserSetting(ctx, owner, { signatureHtml: "x".repeat((SH.CRM_EMAIL_SIGNATURE_INPUT_MAX ?? 16000) + 1) }));
    const after = await rowOf();
    chk("SIG.cap", `sanitized form over the stored cap (raw ${grow.length} → ${sanLen}) refused · raw input over the input cap refused before sanitising · both with the signature message · the row is unchanged`,
      /VALIDATION/.test(eSan) && /ลายเซ็น/.test(eSan) && /VALIDATION/.test(eRaw) && /ลายเซ็น/.test(eRaw) && j(after) === j(before) && sanLen > (SH.CRM_EMAIL_SIGNATURE_MAX ?? 0),
      `eSan=${eSan} · eRaw=${eRaw} · unchanged=${j(after) === j(before)}`);

    // legacy rows written before this card: ≤ 4 000 chars, possibly cut mid-tag — load and save back / edit down
    const legacy = (SAN.sanitizeHtml(input) as string).slice(0, 4000);
    await P.crmEmailUserSetting.updateMany({ where: { systemId: S, userId: u.id }, data: { signatureHtml: legacy, fromName: null } });
    const got = await CRM.emails.getUserSetting(ctx, owner);
    const eL = await errOf(() => CRM.emails.setUserSetting(ctx, owner, { fromName: "หลังย้าย", signatureHtml: String(got?.signatureHtml ?? "") }));
    const rowL = await rowOf();
    const eDown = await errOf(() => CRM.emails.setUserSetting(ctx, owner, { signatureHtml: String(got?.signatureHtml ?? "").slice(0, 300) }));
    const rowD = await rowOf();
    chk("SIG.legacy", "a legacy stored signature (4 000 chars, cut mid-tag) loads, re-saves with another field change (stored well-formed), and can be edited down",
      !wellFormed(legacy) && got?.signatureHtml === legacy && eL === "" && rowL?.fromName === "หลังย้าย" && wellFormed(String(rowL?.signatureHtml ?? "")) && eDown === "" && wellFormed(String(rowD?.signatureHtml ?? "")) && String(rowD?.signatureHtml ?? "").length <= 320,
      `legacyCut=${!wellFormed(legacy)} loaded=${got?.signatureHtml === legacy} eL=${eL} name=${rowL?.fromName} wf=${wellFormed(String(rowL?.signatureHtml ?? ""))} len=${rowL?.signatureHtml?.length} eDown=${eDown} down=${rowD?.signatureHtml?.length}`);

    // UI: the card's textarea carries the input cap (prop from the page), same constant the service and REST use
    const card = readFileSync("src/components/crm/emails/MySendingCard.tsx", "utf8");
    const ops = readFileSync("src/lib/modules/crm/api/ops/emails.ts", "utf8");
    chk("SIG.align", "UI textarea maxLength = signatureInputMax prop (page passes CRM_EMAIL_SIGNATURE_INPUT_MAX) · REST optText(CRM_EMAIL_SIGNATURE_INPUT_MAX) for signature and signatureHtml",
      /maxLength=\{data\.signatureInputMax/.test(card) && (ops.match(/optText\(CRM_EMAIL_SIGNATURE_INPUT_MAX\)/g) ?? []).length === 2 && /signatureInputMax:\s*CRM_EMAIL_SIGNATURE_INPUT_MAX/.test(readFileSync("src/app/app/sys/[id]/crm/emails/page.tsx", "utf8")),
      `card=${/maxLength=\{data\.signatureInputMax/.test(card)} rest=${(ops.match(/optText\(CRM_EMAIL_SIGNATURE_INPUT_MAX\)/g) ?? []).length}`);
  });

  // ═══════════════ TEXT (RV5-3) + HDR (RV5-4 nuance) ═══════════════
  await sub("TEXT", async () => {
    let n = 0;
    const deps = { transport: async () => ({ ok: true, id: `copy-${++n}` }) };
    const ingest = (over: Record<string, unknown>) =>
      CRM.emails.ingestInbound({ messageId: `<${TAG}-${++n}@probe.test>`, from: `cust${n}-${rand}@probe.test`, to: [INBOX], cc: [], subject: `t ${n}`, text: "", html: "", headers: {}, attachments: [], ...over }, deps);
    const get = (r: Any) => (r?.emailId ? P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { bodyText: true, references: true, inReplyTo: true } }) : null);
    const big = await get(await ingest({ text: `HEADMARK ${"x".repeat(1_100_000)} TAILMARK` }));
    const small = await get(await ingest({ text: `HEADMARK ${"x".repeat(900_000)} TAILMARK` }));
    chk("TEXT.cap", "inbound text of 1.1 MB: stored bodyText keeps the head, not the tail, ≤ 1 000 000 chars (same cap as the HTML) · 0.9 MB control keeps the tail",
      String(big?.bodyText ?? "").includes("HEADMARK") && !String(big?.bodyText ?? "").includes("TAILMARK") && String(big?.bodyText ?? "").length <= 1_000_000 && String(small?.bodyText ?? "").includes("TAILMARK"),
      `big=${big?.bodyText?.length} tail=${String(big?.bodyText ?? "").includes("TAILMARK")} small=${small?.bodyText?.length} tail=${String(small?.bodyText ?? "").includes("TAILMARK")}`);
    const kin = readFileSync("src/lib/platform/kanban-email-in.ts", "utf8");
    chk("TEXT.board", "board mail-in text path is already bounded: text and html are trimmed then cut at BODY_MAX (20 000) before any processing", /const text = \(payload\.text \?\? ""\)\.trim\(\)\.slice\(0, BODY_MAX\)/.test(kin) && /const BODY_MAX = 20_000/.test(kin), "static");
    const hdr = await get(await ingest({ headers: { References: `<short-${rand}@probe.test>`, references: "<".repeat(17_000) } }));
    chk("HDR.join", "direct ingestInbound with a short `References` and an over-long `references`: the joined header is over the cap ⇒ dropped as a whole (not the long half only)",
      j(hdr?.references ?? null) === "[]", `references=${j(hdr?.references)}`);
  });
} finally {
  await new Promise((r) => setTimeout(r, 1_500));
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  for (const T of TENANTS) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (const sid of SYSTEMS) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${sid}%`).catch(() => undefined);
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${T}%`).catch(() => undefined);
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
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-cf6-r2: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ probe: "probe-cf6-r2", total: cks.length, passed, failed: cks.filter((x) => !x.ok).map((x) => x.id) })}`);
process.exit(0);
