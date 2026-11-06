// QC — SECRETARY S3a.6-S · แปลภาษาห้องแชทลูกค้า (server) — สัญญา server ↔ แอป ใน ledger/secretary-briefs/sec-brief-S3a.6.md
// กลุ่มข้อ:
//   N  needsTranslation (ไทย · อังกฤษ · ญี่ปุ่น · อีโมจิล้วน · สั้นกว่า 3 · staffLang อื่น) + DTO เธรด (translatedBody/Lang · needsTranslation · staffLang · contactLang · can.translate)
//   T  route แปลข้อความ: แคช (2 ครั้ง = หัก 1) · translateEnabled=false ⇒ 200 ok:false ไทย · ไม่เห็นห้อง ⇒ 403
//   D  route แปลร่าง: ปลายทางปริยาย = contactLang (ไม่มี ⇒ en)
//   G  ai-suggest gloss: en/th ⇒ gloss · th/th ⇒ null (Scripted provider · เรียกเดียว) · route คืน gloss + replyLang
//   C  เครดิตหมด ⇒ ok:false ไทย (แปล · แปลร่าง · ai-suggest)
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 SMS_PROVIDER=mock pnpm exec tsx scripts/qc-sec-s3a6-s.mts
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s3a6-s";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const STARTED = existsSync(join(ROOT, "src/app/api/mobile/inbox/conversations/[id]/translate-draft/route.ts"));
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่เริ่มใบ และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-sec-s3a6-s");
process.env.SHARK_AI_MOCK = "1";
type Res = "PASS" | "FAIL";
const cks: { id: string; res: Res; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "") => { cks.push({ id, res: ok ? "PASS" : "FAIL", why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { prisma } = await import("@/lib/core/db");
const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const dto = (await import("@/lib/mobile/inbox-dto")) as AnyMod;
const suggest = (await import("@/lib/modules/chat/ai-suggest")) as AnyMod;
const sys = (await import("@/lib/modules/system/service")) as AnyMod;
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const route = async (p: string) => (await import(`@/app/api/mobile/inbox/${p}/route`)) as unknown as Record<string, Handler>;

const STAMP = Date.now().toString(36);
const SLUG = `qc-sec-s3a6-${STAMP}`;
const U = { owner: `qcs3a6-owner-${STAMP}`, staffB: `qcs3a6-staffb-${STAMP}` };
let tid = "";

async function wipeTenant(): Promise<number> {
  if (!tid) return 0;
  const s = (await prisma.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as AnyMod[];
  if (s.length && s[0].slug !== SLUG) throw new Error("slug ไม่ตรง — ไม่ลบ");
  const tables = ((await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as AnyMod[]).map((r) => String(r.t));
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid); } catch { next.push(tb); } }
    pending = next;
  }
  await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, SLUG).catch(() => 0);
  let left = 0;
  for (const tb of tables) { try { left += Number(((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as AnyMod[])[0]?.n ?? 0); } catch { /* */ } }
  return left;
}
async function cleanup(): Promise<number> {
  let left = 0;
  try { left = await wipeTenant(); } catch (e) { console.log(`  ⚠️ wipe: ${errMsg(e)}`); left = -1; }
  for (const m of ["session", "aiSecretary", "pushDevice"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { userId: { startsWith: "qcs3a6-" } } }); } catch { /* */ } }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs3a6-" } } }); } catch { /* */ }
  try { await prisma.chatRateBucket.deleteMany({ where: { key: { contains: STAMP } } }); } catch { /* */ }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s3a6-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  return left;
}

class Scripted {
  calls = 0;
  constructor(private text: string) {}
  async chat(): Promise<Record<string, unknown>> { this.calls++; return { text: this.text, tokensIn: 500, tokensOut: 80, cacheWrite: 0, cacheRead: 0, model: "scripted" }; }
}

let residue = 0;
try {
  // ───────── N (pure) ─────────
  console.log("── N: needsTranslation ──");
  const nt = dto.needsTranslation;
  const cases: [string, string, boolean][] = [["Hello, do you have a table tonight?", "th", true], ["สวัสดีครับ จองโต๊ะได้ไหม", "th", false], ["こんにちは、予約できますか", "th", true], ["😀😀😀👍", "th", false], ["ok", "th", false], ["Hi สวัสดี", "th", false], ["Hello there", "en", false], ["สวัสดีครับ", "en", true], ["12345 678", "th", false]];
  const bad = cases.filter(([t, l, exp]) => nt(t, l) !== exp);
  chk("N-1", "needsTranslation: อังกฤษ/ญี่ปุ่น (staff th) = true · ไทย/อีโมจิล้วน/สั้นกว่า 3/ตัวเลข/ปนไทย = false · staff en: ไทย = true · อังกฤษ = false", bad.length === 0, JSON.stringify(bad));

  // ───────── fixtures ─────────
  const t = await prisma.tenant.create({ data: { name: "QC SEC S3a6", slug: SLUG } }); tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `คุณ${k}` } });
  const unitA = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา A", slug: `a-${STAMP}` } as never });
  const unitB = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา B", slug: `b-${STAMP}` } as never });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } as never });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staffB, role: "STAFF", unitAccess: [unitB.id], permissions: { "chat.conversation.read": true, "chat.translate.use": true, "chat.message.send": true }, acceptedAt: new Date() } as never });
  const chat = await sys.createSystem(tid, "CHAT", "แชทลูกค้า"); const sid = chat.id;
  await prisma.chatSetting.create({ data: { tenantId: tid, systemId: sid, translateEnabled: true, aiSuggestEnabled: true, staffLang: "th" } as never });
  const mkConv = async (tag: string, lang: string | null, body: string) => {
    const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", externalUserId: `qcs3a6-${tag}-${STAMP}`, displayName: `ลูกค้า ${tag}`, lang } as never });
    const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", unitId: unitA.id, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1 } as never });
    const msg = await prisma.chatMessage.create({ data: { tenantId: tid, systemId: sid, conversationId: conv.id, direction: "IN", type: "TEXT", body } as never });
    return { contact, conv, msg };
  };
  const en = await mkConv("en", "en", "Hello, do you have a table for two tonight? call 0812345678");
  const ja = await mkConv("ja", "ja", "こんにちは、今夜二人で予約できますか");
  const th = await mkConv("th", "th", "สวัสดีครับ คืนนี้มีโต๊ะว่างไหม");
  const nolang = await mkConv("nl", null, "Hello there, any table?");
  const H = { authorization: `Bearer ${(await auth.issueMobileToken(U.owner)).token}`, "x-tenant-id": tid, "content-type": "application/json" };
  const HB = { authorization: `Bearer ${(await auth.issueMobileToken(U.staffB)).token}`, "x-tenant-id": tid, "content-type": "application/json" };
  const call = async (p: string, params: Record<string, string>, body: unknown, headers = H) => {
    const m = await route(p);
    const res = await (m.POST ?? m.GET)!(new Request(`http://qc.local/api/mobile/inbox/${p}`, { method: m.POST ? "POST" : "GET", headers, body: m.POST ? JSON.stringify(body) : undefined }), { params: Promise.resolve(params) });
    let json: AnyMod = {}; try { json = (await res.json()) as AnyMod; } catch { /* */ }
    return { status: res.status, json };
  };

  // ───────── DTO เธรด ─────────
  {
    const m = await route("conversations/[id]");
    const res = await m.GET!(new Request(`http://qc.local/api/mobile/inbox/conversations/${en.conv.id}?systemId=${sid}`, { method: "GET", headers: H }), { params: Promise.resolve({ id: en.conv.id }) });
    const j = (await res.json()) as AnyMod;
    const mm = (j.messages ?? []).find((x: AnyMod) => x.id === en.msg.id);
    chk("N-2", "GET เธรด: conversation.staffLang='th' · contactLang='en' · can.translate=true (OWNER · เปิดแปล) · ข้อความ IN อังกฤษ needsTranslation=true · translatedBody/translatedLang = null",
      res.status === 200 && j.conversation?.staffLang === "th" && j.conversation?.contactLang === "en" && j.conversation?.can?.translate === true && mm?.needsTranslation === true && mm?.translatedBody === null && mm?.translatedLang === null,
      JSON.stringify({ s: res.status, conv: { staffLang: j.conversation?.staffLang, contactLang: j.conversation?.contactLang, can: j.conversation?.can }, msg: mm && { n: mm.needsTranslation, tb: mm.translatedBody } }).slice(0, 300));
  }

  // ───────── T ─────────
  console.log("── T: แปลข้อความ ──");
  const P = "conversations/[id]/messages/[mid]/translate";
  const usage = () => prisma.aiCreditTxn.count({ where: { tenantId: tid, kind: "USAGE", source: "CHAT_TRANSLATE" } });
  const u0 = await usage();
  const t1 = await call(P, { id: en.conv.id, mid: en.msg.id }, { systemId: sid });
  const t2 = await call(P, { id: en.conv.id, mid: en.msg.id }, { systemId: sid });
  const u1 = await usage();
  const row = await prisma.chatMessage.findUnique({ where: { id: en.msg.id }, select: { translatedBody: true, translatedLang: true, body: true } });
  chk("T-1", "แปลข้อความอังกฤษ 2 ครั้ง ⇒ ครั้งแรก ok cached:false lang th · ครั้งสอง cached:true ข้อความเดิม · หักเครดิต CHAT_TRANSLATE 1 ครั้ง · ต้นฉบับ body ไม่ถูกแตะ",
    t1.status === 200 && t1.json.ok === true && t1.json.cached === false && t1.json.lang === "th" && typeof t1.json.text === "string" && t2.json.ok === true && t2.json.cached === true && t2.json.text === t1.json.text && u1 - u0 === 1 && row?.translatedLang === "th" && row?.body === en.msg.body,
    JSON.stringify({ t1, t2: t2.json, charged: u1 - u0, row: { tl: row?.translatedLang } }).slice(0, 300));
  const tB = await call(P, { id: en.conv.id, mid: en.msg.id }, { systemId: sid }, HB);
  chk("T-2", "พนักงานสาขา B (ห้องอยู่สาขา A) ⇒ 403", tB.status === 403, JSON.stringify(tB).slice(0, 160));
  await prisma.chatSetting.updateMany({ where: { tenantId: tid, systemId: sid }, data: { translateEnabled: false } });
  const tOff = await call(P, { id: ja.conv.id, mid: ja.msg.id }, { systemId: sid });
  const dOff = await call("conversations/[id]/translate-draft", { id: ja.conv.id }, { systemId: sid, body: "คืนนี้มีโต๊ะว่างครับ" });
  chk("T-3", "translateEnabled=false ⇒ 200 {ok:false, reason ไทย} ทั้งแปลข้อความและแปลร่าง", tOff.status === 200 && tOff.json.ok === false && thai(tOff.json.reason) && dOff.status === 200 && dOff.json.ok === false && thai(dOff.json.reason), JSON.stringify({ tOff, dOff }).slice(0, 240));
  await prisma.chatSetting.updateMany({ where: { tenantId: tid, systemId: sid }, data: { translateEnabled: true } });

  // ───────── D ─────────
  console.log("── D: แปลร่าง ──");
  const lastNote = async (conversationId: string) => (await prisma.aiCreditTxn.findFirst({ where: { tenantId: tid, kind: "USAGE", source: "CHAT_TRANSLATE", conversationId }, orderBy: { createdAt: "desc" }, select: { note: true } }))?.note ?? "";
  const dJa = await call("conversations/[id]/translate-draft", { id: ja.conv.id }, { systemId: sid, body: "คืนนี้มีโต๊ะว่างสำหรับสองท่านครับ" });
  const dNl = await call("conversations/[id]/translate-draft", { id: nolang.conv.id }, { systemId: sid, body: "คืนนี้มีโต๊ะว่างครับ" });
  const nJa = await lastNote(ja.conv.id), nNl = await lastNote(nolang.conv.id);
  chk("D-1", "translate-draft ไม่ระบุ targetLang ⇒ ปลายทาง = contactLang (ja · ญี่ปุ่น) · ไม่มีภาษาลูกค้า ⇒ en (อังกฤษ) · ok:true text", dJa.json.ok === true && typeof dJa.json.text === "string" && /ญี่ปุ่น/.test(nJa) && dNl.json.ok === true && /อังกฤษ/.test(nNl), JSON.stringify({ dJa: dJa.json, nJa, dNl: dNl.json, nNl }).slice(0, 300));
  const msgs = await prisma.chatMessage.count({ where: { tenantId: tid, conversationId: ja.conv.id, direction: "OUT" } });
  chk("D-2", "แปลร่างไม่ส่งข้อความเอง (OUT 0)", msgs === 0, String(msgs));

  // ───────── G ─────────
  console.log("── G: ai-suggest gloss ──");
  const glossJson = JSON.stringify({ options: [{ body: "Yes, we have a table for two tonight.", sources: [], gloss: "ได้ครับ คืนนี้มีโต๊ะสำหรับสองท่าน" }] });
  const pEn = new Scripted(glossJson);
  const gEn = await suggest.suggestReply({ tenantId: tid, systemId: sid, conversationId: en.conv.id, userId: U.owner, source: "app", provider: pEn });
  chk("G-1", "ลูกค้า en / ทีม th ⇒ option.gloss = คำแปลไทย · replyLang en · เรียกโมเดลครั้งเดียว", gEn.ok === true && gEn.replyLang === "en" && gEn.options[0]?.gloss === "ได้ครับ คืนนี้มีโต๊ะสำหรับสองท่าน" && pEn.calls === 1, JSON.stringify({ gEn, calls: pEn.calls }).slice(0, 260));
  const pTh = new Scripted(JSON.stringify({ options: [{ body: "มีโต๊ะว่างครับ", sources: [], gloss: "ไม่ควรออก" }] }));
  const gTh = await suggest.suggestReply({ tenantId: tid, systemId: sid, conversationId: th.conv.id, userId: U.owner, source: "app", provider: pTh });
  chk("G-2", "ลูกค้า th / ทีม th ⇒ gloss = null (แม้โมเดลส่งมา) · replyLang th", gTh.ok === true && gTh.replyLang === "th" && gTh.options[0]?.gloss === null, JSON.stringify(gTh).slice(0, 200));
  const pNo = new Scripted(JSON.stringify({ options: [{ body: "Yes we do.", sources: [] }] }));
  const gNo = await suggest.suggestReply({ tenantId: tid, systemId: sid, conversationId: nolang.conv.id, userId: U.owner, source: "app", provider: pNo });
  chk("G-3", "โมเดลไม่ส่ง gloss ⇒ null (parse ปลอดภัย)", gNo.ok === true && gNo.options[0]?.gloss === null, JSON.stringify(gNo).slice(0, 200));
  const rsrc = (await import("node:fs")).readFileSync(join(ROOT, "src/app/api/mobile/inbox/conversations/[id]/ai-suggest/route.ts"), "utf8");
  chk("G-4", "route ai-suggest คืน gloss ต่อ option + replyLang ระดับบน", /gloss:\s*o\.gloss/.test(rsrc) && /replyLang:\s*r\.replyLang/.test(rsrc), "grep route");

  // ───────── C ─────────
  console.log("── C: เครดิตหมด ──");
  await prisma.aiCreditWallet.upsert({ where: { tenantId: tid }, create: { tenantId: tid, balanceMicro: -1_000_000_000 }, update: { balanceMicro: -1_000_000_000 } } as never);
  await prisma.aiCreditTxn.create({ data: { tenantId: tid, kind: "USAGE", source: "CHAT", amountMicro: -1_000_000_000, balanceAfter: -1_000_000_000, model: "qc", tokensIn: 0, tokensOut: 0, note: "qc-s3a6-exhaust" } as never });
  const cT = await call(P, { id: ja.conv.id, mid: ja.msg.id }, { systemId: sid });
  const cD = await call("conversations/[id]/translate-draft", { id: en.conv.id }, { systemId: sid, body: "ทดสอบเครดิตหมดครับ" });
  const cG = await suggest.suggestReply({ tenantId: tid, systemId: sid, conversationId: ja.conv.id, userId: U.owner, source: "app", provider: new Scripted(glossJson) });
  chk("C-1", "เครดิตหมด ⇒ แปลข้อความ / แปลร่าง / ai-suggest = ok:false + เหตุผลไทย (200)", cT.status === 200 && cT.json.ok === false && thai(cT.json.reason) && cD.json.ok === false && thai(cD.json.reason) && cG.ok === false && thai(cG.reason), JSON.stringify({ cT: cT.json, cD: cD.json, cG }).slice(0, 300));
} catch (e) {
  const detail = (e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : JSON.stringify(e)).slice(0, 400);
  console.log(`  💥 ${detail}`); chk("CRASH", "ข้อสอบรันจบ", false, detail.slice(0, 200));
} finally {
  residue = await cleanup();
}
chk("CLEAN", "ลบร้านทดสอบหมด (residue 0)", residue === 0, String(residue));
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: [], residue }));
process.exit(failed.length ? 1 : 0);
