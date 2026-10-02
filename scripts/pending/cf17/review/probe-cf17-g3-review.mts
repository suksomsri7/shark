// review probe — CRM C5.5-G3 (independent reviewer): memory ownership · contact-data guard · support push · latest room · LIKE escape.
//   ✅ = property holds · ❌ = finding · ℹ️ = evidence (not counted)
//   G*  contact-data scanner: formats a model could plausibly emit vs deliberate obfuscation (pure function) + linear time
//   F*  forging scope / ownership through tool arguments (remember_fact extra args, forget_fact by id, contentContains)
//   R*  residual: shop facts with non-contact personal data written by an OWNER's turn
//   P*  support push edge cases: creator left the shop · malformed room id · OWNER of another shop
//   L*  OWNER web sheet vs key confirm cards
//   E*  LIKE escape at the database for `%`, `_`, `\` in a creator prefix
// QC3 only · throwaway tenants swept · Expo requests captured, every other network call blocked.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf17/review/probe-cf17-g3-review.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-weathered-river/.test(host) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`QC3 only — got ${host}`);
  process.exit(1);
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
const PUSHED: string[] = [];
globalThis.fetch = (async (url: Any, init?: Any) => {
  if (String(url).includes("exp.host")) {
    const msgs = JSON.parse(String(init?.body ?? "[]")) as Any[];
    for (const m of msgs) PUSHED.push(`${m.to}|${m.body ?? ""}`);
    return new Response(JSON.stringify({ data: msgs.map(() => ({ status: "ok", id: "qc" })) }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error("network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-cf17r-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const res: { id: string; ok: boolean }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);
const j = (v: unknown) => JSON.stringify(v);
const cut = (v: unknown, n = 170) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const USERS: string[] = [];
const TENANTS: string[] = [];
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const svc = (await import("@/lib/ai/service" as string)) as Any;
const tools = (await import("@/lib/ai/tools" as string)) as Any;
const ACT = (await import("@/lib/ai/actor" as string)) as Any;
const CO = (await import("@/lib/ai/conversation-owner" as string)) as Any;
const CD = (await import("@/lib/ai/contact-data" as string)) as Any;
const support = (await import("@/lib/platform/support" as string)) as Any;
const mkUser = async (suffix: string) => {
  const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix} ${TAG}` } });
  USERS.push(u.id);
  return u.id as string;
};
const member = (uid: string, tid: string, role: string, permissions: Record<string, boolean>) =>
  P.membership.create({ data: { userId: uid, tenantId: tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
class Scripted {
  async chat(messages: Any[]) {
    return { text: `system: ${messages.find((m: Any) => m.role === "system")?.content ?? ""}`, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}
const isErr = (out: string) => { try { return typeof JSON.parse(out)?.error === "string"; } catch { return false; } };

try {
  // ═══ G — scanner (pure) ═══
  console.log("\n── G contact-data scanner ──");
  const plausible: [string, string][] = [
    ["dash", "โทร 089-900-0102"], ["spaces", "โทร 089 900 0102"], ["thai digits", "โทร ๐๘๙๙๐๐๐๑๐๒"], ["+66", "+66 89 900 0102"],
    ["en dash", "โทร 089–900–0102"], ["slash", "โทร 089/900/0102"], ["full-width", "โทร ０８９９０００１０２"], ["dot groups", "089.900.0102"],
    ["one digit per group", "0 8 9 9 0 0 0 1 0 2"], ["thin space", "089 900 0102"], ["email upper", "SOMCHAI@GMAIL.COM"], ["email", "somchai.k@example.co.th"],
  ];
  const deliberate: [string, string][] = [
    ["zero-width", "089​9000102"], ["underscore", "089_900_0102"], ["spelled thai", "ศูนย์แปดเก้า เก้าศูนย์ศูนย์ ศูนย์หนึ่งศูนย์สอง"],
    ["at-dot words", "somchai at gmail dot com"], ["(at)", "somchai(at)gmail.com"], ["spaced @", "somchai @ gmail . com"], ["arabic-indic", "٠٨٩٩٠٠٠١٠٢"],
    ["LINE id", "LINE: @somchai88"], ["split half 1", "เบอร์คุณสอง ขึ้นต้น 089-900"], ["split half 2", "เบอร์คุณสอง ลงท้าย 0102"],
  ];
  const miss = (arr: [string, string][]) => arr.filter(([, s]) => (CD.findContactData(s) as string[]).length === 0).map(([k]) => k);
  const missPlausible = miss(plausible);
  chk("G1.1", missPlausible.length === 0, `formats a model can plausibly copy from a tool result are caught · missed=${j(missPlausible)}`);
  info("G1.2", `deliberate obfuscation missed (by design / known limits): ${j(miss(deliberate))} of ${deliberate.length}`);
  const big = "0812 ".repeat(200_000) + "a@b.co " + "1-".repeat(200_000);
  const t0 = Date.now();
  const kinds = CD.findContactData(big) as string[];
  const ms = Date.now() - t0;
  const small = "0812 ".repeat(20_000) + "1-".repeat(20_000);
  const t1 = Date.now();
  CD.findContactData(small);
  const msSmall = Date.now() - t1;
  chk("G1.3", ms < 3000, `2.2M-char adversarial input scanned in ${ms} ms (220k chars: ${msSmall} ms — ratio ${(ms / Math.max(1, msSmall)).toFixed(1)}×) · kinds=${j(kinds)}`);

  // ── round 2 (dece4b11): ordinary Thai business text must NOT be flagged · cheap bypasses (evidence) ──
  const benign: [string, string][] = [
    ["opening hours one line", "เปิด จ-ศ 08.30-17.30 ส-อา 09.00-18.00"],
    ["hours two shifts space", "เปิด 08.30-17.30 09.00-18.00"],
    ["hours two shifts slash", "เปิด 08.30-17.30/09.00-18.00"],
    ["date range slash+dash", "โปรโมชัน 09/10/2026-08/11/2026"],
    ["date range 2-digit year", "โปรโมชัน 09/10/26-08/11/26"],
    ["date range spaced", "โปรโมชัน 09/10/2026 - 08/11/2026"],
    ["thai date", "๐๙/๑๐/๒๕๖๙"],
    ["price list slash", "ราคา 100/150/200 บาท"],
    ["zero-padded codes slash", "รหัส 050/060/070"],
    ["product code slash", "รหัสสินค้า 12/345/6789"],
    ["juristic tax id", "เลขผู้เสียภาษี 0105561000003"],
    ["juristic tax id dashed", "0-1055-61000-00-3"],
    ["order number", "PO/2026/0042"],
    ["time range dot", "09.00-18.00 น."],
    ["room numbers", "ห้อง 0905/0906/0907"],
  ];
  const fp = benign.filter(([, s]) => (CD.findContactData(s) as string[]).length > 0).map(([k, s]) => `${k}: ${s}`);
  chk("G2.1", fp.length === 0, `ordinary Thai business text (hours, date ranges, prices, codes, juristic tax id) not flagged · false positives=${j(fp)}`);
  const cheap: [string, string][] = [
    ["mixed scripts", "08๙9000１02"], ["thai digits dashed", "๐๘๙-๙๐๐-๐๑๐๒"], ["ZWSP", "089​900​0102"], ["ZWJ", "089‍9000102"],
    ["word joiner", "089⁠9000102"], ["BOM", "089﻿9000102"], ["underscore", "089_900_0102"], ["comma", "089,900,0102"],
    ["middle dot", "089·900·0102"], ["three spaces", "089   900   0102"], ["spelled sep", "089 ขีด 900 ขีด 0102"], ["colon", "089:900:0102"],
  ];
  const caught = cheap.map(([k, s]) => `${k}=${(CD.findContactData(s) as string[]).length > 0 ? "caught" : "MISSED"}`);
  info("G2.2", `cheap user-made variants: ${caught.join(" · ")}`);

  // ── round 3 (afd15669): real-world Thai phone writing must still be caught · more ordinary shop text must not be ──
  const flagged = (s: string) => (CD.findContactData(s) as string[]).includes("phone");
  const realPhones: [string, string][] = [
    ["08 1234 5678", "โทร 08 1234 5678"], ["0 2123 4567", "โทร 0 2123 4567"], ["02 + ext", "02-123-4567 ต่อ 12"], ["076 212 345", "076 212 345"],
    ["+66-2-123-4567", "+66-2-123-4567"], ["081.234.5678", "081.234.5678"], ["06x", "065-432-1098"], ["09x", "091 234 5678"],
    ["4-3-3", "0812 345 678"], ["glued thai text", "โทร0812345678ค่ะ"], ["two phones", "081-234-5678 และ 089-900-0102"], ["(02)123-4567", "(02)123-4567"],
    ["053 Chiang Mai", "053-123-456"], ["0066", "0066 89 900 0102"],
  ];
  const lost = realPhones.filter(([, s]) => !flagged(s)).map(([k]) => k);
  chk("G3.1", lost.length === 0, `common Thai phone writings still caught after the shape rule (${realPhones.length}) · missed=${j(lost)}`);
  const pairs: [string, string][] = [["081 234 56 78", "081 234 56 78"], ["081-23-45678", "081-23-45678"], ["038-12-3456", "038-12-3456"], ["02 123 45 67", "02 123 45 67"], ["bare 66", "66 89 900 0102"], ["1800 hotline", "1800-123-456"]];
  info("G3.2", `accepted misses (pairs / odd grouping / bare 66 / 1800): ${pairs.map(([k, s]) => `${k}=${flagged(s) ? "caught" : "missed"}`).join(" · ")}`);
  const shopText: [string, string][] = [
    ["promo range", "โปร 01/10/2026-31/10/2026"], ["hours shifts", "เปิด 08.30-17.30 09.00-18.00"], ["hours 4-digit", "0830-1730 0900-1800"],
    ["prices", "ราคา 099 199 299 บาท"], ["juristic tax", "0105561000003"], ["invoice", "INV-2026-0042 ลงวันที่ 02/10/2026"],
    ["bank acct dashed", "บัญชี 123-4-56789-0"], ["bank acct 0-start dashed", "บัญชี 012-3-45678-9"],
  ];
  const fp3 = shopText.filter(([, s]) => (CD.findContactData(s) as string[]).length > 0).map(([k]) => k);
  chk("G3.3", fp3.length === 0, `ordinary shop text (promo ranges, hours, prices, juristic tax id, invoice, dashed bank accounts) not flagged · false positives=${j(fp3)}`);
  const design: [string, string][] = [["bank acct no dashes 08x", "บัญชีกสิกร 0812345678"], ["shop's own phone", "เบอร์ร้าน 02-123-4567"], ["shop PromptPay", "พร้อมเพย์ร้าน 081-234-5678"], ["order no with digits", "SO0812345678"]];
  info("G3.4", `design-level refusals (owner question): ${design.map(([k, s]) => `${k}=${(CD.findContactData(s) as string[]).length > 0 ? "refused" : "allowed"}`).join(" · ")}`);
  const stripped = "a​b";
  info("G3.5", `stripping affects only the scan copy: input string unchanged=${stripped.length === 3} (findContactData returns kinds only, no offsets)`);

  // ═══ world ═══
  const tA = (await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } })).id as string;
  const tB = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id as string;
  TENANTS.push(tA, tB);
  const owner = await mkUser("-owner");
  const staff = await mkUser("-staff");
  const leaver = await mkUser("-leaver");
  const AI = { "ai.chat.send": true, "kb.article.create": true };
  await member(owner, tA, "OWNER", {});
  await member(staff, tA, "STAFF", AI);
  await member(leaver, tA, "STAFF", AI);
  await member(staff, tB, "OWNER", {}); // OWNER of another shop
  await sysSvc.createSystem(tA, "MEMBER", "สมาชิก");
  for (const t of [tA, tB]) await P.aiCreditWallet.create({ data: { tenantId: t, balanceMicro: 50_000_000, grantedAt: new Date() } });
  const act = (uid: string, t = tA) => ACT.aiMemberActor(t, uid, { role: uid === owner || t === tB ? "OWNER" : "STAFF", unitAccess: ["*"], permissions: t === tA && uid !== owner ? AI : {} });
  const rt = (uid: string, name: string, args: Any = {}, t = tA) => tools.runTool({ tenantId: t, actor: act(uid, t) }, name, args) as Promise<string>;
  const prompt = async (uid: string, t = tA) => String((await svc.sendMessage({ tenantId: t, actor: act(uid, t) }, { text: "สวัสดี" }, { provider: new Scripted() })).reply);

  // ═══ F — forging through tool arguments ═══
  console.log("\n── F forging scope / ownership ──");
  const fake = await rt(staff, "remember_fact", { content: "STAFF พยายามเขียนข้อเท็จจริงร้าน", id: `o~${owner}~${"a".repeat(24)}`, scope: "shop", shared: true });
  const row = await P.aiMemory.findFirst({ where: { tenantId: tA, content: "STAFF พยายามเขียนข้อเท็จจริงร้าน" } });
  chk("F1.1", !!row && String(row.id).startsWith(`u~${staff}~`) && !(await prompt(owner)).includes("STAFF พยายามเขียน"),
    `STAFF remember_fact with extra id/scope/shared args → stored as STAFF private (${String(row?.id).slice(0, 2)}…), not in the OWNER's prompt · ${cut(fake, 60)}`);
  await rt(owner, "remember_fact", { content: "ร้านปิดทุกวันจันทร์ (ข้อเท็จจริงร้าน)" });
  const fact = await P.aiMemory.findFirst({ where: { tenantId: tA, content: "ร้านปิดทุกวันจันทร์ (ข้อเท็จจริงร้าน)" } });
  const legacy = await P.aiMemory.create({ data: { tenantId: tA, content: "ความจำรุ่นเดิม ไม่มีข้อมูลติดต่อ" } });
  const f1 = await rt(staff, "forget_fact", { id: fact.id });
  const f2 = await rt(staff, "forget_fact", { id: legacy.id });
  const f3 = await rt(staff, "forget_fact", { contentContains: "ร้านปิด" });
  const fB = await rt(staff, "forget_fact", { id: fact.id }, tB); // same user as OWNER of shop B
  const kept = await P.aiMemory.count({ where: { id: { in: [fact.id, legacy.id] } } });
  chk("F1.2", isErr(f1) && isErr(f2) && isErr(f3) && isErr(fB) && kept === 2,
    `STAFF forgets the OWNER's shop fact / a legacy fact by id / by text · same user as OWNER of shop B forgets shop A's fact → all refused, ${kept}/2 kept`);
  const priv = await P.aiMemory.findFirst({ where: { tenantId: tA, id: { startsWith: `u~${staff}~` } } });
  const fo = await rt(owner, "forget_fact", { id: priv.id });
  chk("F1.3", isErr(fo) && (await P.aiMemory.count({ where: { id: priv.id } })) === 1, `OWNER cannot forget a STAFF private note by id`);
  // role decided per request from the actor: same user, now acting as OWNER of shop B, writes in shop B → shop fact of B only
  await rt(staff, "remember_fact", { content: "ข้อเท็จจริงร้านบี" }, tB);
  const bRow = await P.aiMemory.findFirst({ where: { content: "ข้อเท็จจริงร้านบี" } });
  chk("F1.4", bRow?.tenantId === tB && String(bRow?.id).startsWith(`o~${staff}~`) && !(await prompt(owner)).includes("ข้อเท็จจริงร้านบี"),
    `a user who is OWNER of shop B writes a shop fact there → tenant B, o~ prefix, absent from shop A prompts`);

  // ═══ R — residual: non-contact personal data in an OWNER shop fact ═══
  console.log("\n── R residual ──");
  const pii = "คุณสมชาย ใจดี สมาชิก VIP ยอดซื้อปีนี้ 52,300 บาท เป็นเบาหวาน ชอบนัดช่วงเย็น";
  const r1 = await rt(owner, "remember_fact", { content: pii });
  const sp = await prompt(staff);
  info("R1.1", `OWNER turn stores a customer's name + spend + health note (no contact data) → ${isErr(r1) ? "refused" : "stored as shop fact"} · STAFF prompt contains it=${sp.includes("เบาหวาน")}`);
  const kbCat = await rt(owner, "kb_auto_save", { title: "ลูกค้า", content: "ลูกค้าคนสำคัญของร้าน", category: "โทร 0899000102" });
  const kbRow = await P.kbArticle.findFirst({ where: { tenantId: tA, category: { contains: "0899000102" } } });
  chk("G1.4", isErr(kbCat) || !kbRow, `kb_auto_save scans every free-text field (title/content/category) → phone in category ${kbRow ? "STORED" : "refused"}`);

  // ═══ P — support push edges ═══
  console.log("\n── P support push edges ──");
  const tok = (u: string) => `ExponentPushToken[${TAG}-${u.slice(-6)}]`;
  for (const u of [owner, staff, leaver]) await P.pushDevice.create({ data: { userId: u, tenantId: tA, expoToken: tok(u), platform: "ios" } });
  const leaverConv = (await svc.sendMessage({ tenantId: tA, actor: act(leaver) }, { text: "ห้องของคนที่จะออก" }, { provider: new Scripted() })).conversationId as string;
  await P.membership.deleteMany({ where: { tenantId: tA, userId: leaver } });
  const mkCase = async (conversationId: string, n: number) => (await P.supportCase.create({ data: { tenantId: tA, caseNo: 910000 + n, openedByUserId: staff, subject: "qc", conversationId } })).id as string;
  const pu = { id: `${TAG}-pu`, email: "qc@qc.invalid", role: "SUPPORT" };
  PUSHED.length = 0;
  await support.addPlatformMessage(pu, await mkCase(leaverConv, 1), "ตอบคนที่ออกไปแล้ว");
  const p1 = [...PUSHED];
  chk("P1.1", p1.length === 0, `creator left the shop → no push to anyone (got ${p1.length}: ${j(p1.map((x) => x.split("|")[0]!.slice(-8)))})`);
  // a room id that is not server-minted shape (two parts) — exists only if written directly; who gets the push?
  const odd = (await P.aiConversation.create({ data: { id: `u~${staff}`, tenantId: tA, title: "odd" } })).id as string;
  PUSHED.length = 0;
  await support.addPlatformMessage(pu, await mkCase(odd, 2), "ห้องรหัสแปลก");
  const p2 = [...PUSHED];
  const oddVisibleToOwner = CO.canSeeConversationId(CO.sightOf({ tenantId: tA, actor: act(owner) }), odd);
  info("P1.2", `malformed member-shaped room id "u~<id>" → pushed to ${j(p2.map((x) => x.split("|")[0]!.slice(-8)))} (OWNER can open it=${oddVisibleToOwner}; such ids are never minted)`);

  // ═══ L — OWNER web sheet vs key cards ═══
  console.log("\n── L latest room ──");
  const latest = await svc.latestConversation({ tenantId: tA, actor: act(owner) });
  info("L1.1", `OWNER latest room is own=${String(latest?.id ?? "").startsWith(`u~${owner}~`)} — key/legacy/scheduled rooms reachable on web only by id (no web room list; owner Q1)`);

  // ═══ E — LIKE escape at the DB ═══
  console.log("\n── E LIKE escape ──");
  const ids = ["a_c", "aXc", "a%c", "aYYc", "a\\c", "a\\\\c"];
  for (const u of ids) await P.aiConversation.create({ data: { id: `u~${u}~${TAG}`, tenantId: tB, title: u } });
  const leak: string[] = [];
  for (const u of ["a_c", "a%c", "a\\c"]) {
    const v = ACT.aiMemberActor(tB, u, { role: "STAFF", unitAccess: ["*"], permissions: { "ai.chat.send": true } });
    const rows = (await P.aiConversation.findMany({ where: { tenantId: tB, ...CO.visibleConversationWhere(CO.sightOf({ tenantId: tB, actor: v })) }, select: { id: true } })) as Any[];
    const other = rows.filter((r) => r.id !== `u~${u}~${TAG}`).map((r) => r.id);
    const self = rows.some((r) => r.id === `u~${u}~${TAG}`);
    if (other.length || !self) leak.push(`${u}: self=${self} other=${j(other)}`);
  }
  chk("E1.1", leak.length === 0, `DB prefix filter (likePrefix) for ids with _ % \\ returns exactly the own row · problems=${j(leak)}`);
} catch (e) {
  chk("FATAL", false, `probe crashed: ${cut((e as Error)?.stack ?? e, 600)}`);
} finally {
  for (const T of TENANTS) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    chk(`CLEAN-${T.slice(-6)}`, left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `tenant rows left=${left}`);
  }
  for (const id of USERS) {
    await P.session.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.pushDevice.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
    await P.user.delete({ where: { id } }).catch(() => undefined);
  }
  const usersLeft = await P.user.count({ where: { email: { startsWith: TAG } } });
  chk("CLEAN-users", usersLeft === 0, `users left=${usersLeft}`);
  const pass = res.filter((x) => x.ok).length;
  console.log(`\nJSON_SUMMARY ${j({ pass, total: res.length, red: res.filter((x) => !x.ok).map((x) => x.id) })}`);
  await prisma.$disconnect();
  process.exit(res.every((x) => x.ok) ? 0 : 1);
}
