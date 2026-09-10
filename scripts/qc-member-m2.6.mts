// QC — ระบบสมาชิก v2 WO M2.6: gift card — GiftCard/GiftCardTxn/GiftCardSettings · sell (PosSale ที่ `giftCardId` ไม่ให้แต้ม ไม่ลงบัญชีขาย) · PIN 6 หลัก hash + ผิด 5 ครั้งระงับ 15 นาที · use/reload/transfer/suspend/expire/refund · **accountingLink (D3)**: เปิด → JV รับเงินล่วงหน้า (2110) ตอนขาย · รับรู้รายได้ (4030) ตอนใช้ · รายได้อื่น (4900) ตอนหมดอายุ ผ่าน facade บัญชี · ปิด → ไม่แตะบัญชี · สลับกลางทาง = เฉพาะรายการหลังเปิด · UI ขาย/ตั้งค่า/รายการ (ภาพ 20)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M2.6 · พิมพ์เขียว §4.2 (GiftCardStatus/GiftCardTxnType) §4.3 (GiftCard/GiftCardTxn) §5.7 §7.1 (giftcard.sold/used) §9.1 (ขาย gift card = PosSale ไม่ให้แต้ม ไม่ VAT) §9.4 (บัญชี) §11.6 (PIN · โอน · หมดอายุขั้นต่ำ · link เปิดกลางทาง) · MEMBER-API §2.12 · ภาพ 20
// requires: member-seed
//
// สัญญา (โมดูลใหม่ src/lib/modules/giftcard/{service.ts, index.ts (facade), giftcard-actions.ts} · migration `member_v2_f` · fitness F2 อนุมัติ giftcard→pos · giftcard→account · giftcard→member (Fable เพิ่มให้แล้ว))
//   ctx = { tenantId, systemId (= ระบบ MEMBER), posSystemId, actorUserId } · actor = MemberActor · สิทธิ์: ขาย/ใช้/เติม = member.giftcard.sell · ตั้งค่า/ระงับ/โอนแทน = member.giftcard.manage · ลูกค้า (CUSTOMER) ดูยอด/โอนของตัวเอง
//   schema: GiftCard {systemId number pinHash pinFailedCount(0) pinLockedUntil? initialSatang balanceSatang buyerCustomerId? ownerCustomerId? recipientContact Json? message? status expiresAt? saleId? accountingDocId?} unique(tenantId,number) index(ownerCustomerId) · GiftCardTxn {giftCardId type satang balanceAfter refType? refId? byUserId? idempotencyKey} unique(tenantId,idempotencyKey) index(giftCardId,createdAt) · GiftCardSettings {systemId unique · enabled(false) accountingLink(false) expiryMonths(24) denominations Int[] ([100000,200000,500000]) transferable(true) reloadable(true)} · PosSale +giftCardId String? (บิลขาย/เติมบัตร) · enum GiftCardStatus {ACTIVE DEPLETED EXPIRED SUSPENDED} · GiftCardTxnType {SELL USE RELOAD TRANSFER EXPIRE REFUND ADJUST}
//   getSettings(ctx) → ค่าปริยายเมื่อยังไม่มีแถว · setSettings(ctx, actor, partial) → giftcard.manage · expiryMonths < 12 → throw ไทย (ขั้นต่ำตามกฎหมาย) · denominations ต้อง > 0
//   sell(ctx, actor, { satang, buyerCustomerId?, recipient: { customerId } | { contact: { name?, line?, email? } } | { print: true }, message?, expiresAt?, payMethods: [{ type, amountSatang }], unitId, idempotencyKey }) → { giftCardId, number (`GC-` + 8 หลัก), pin (6 หลัก · คืนครั้งเดียว), saleId, expiresAt, accountingDocId: string|null }
//     settings.enabled false → throw ไทย · satang ≤ 0 → throw · Σ payMethods ≠ satang → throw · expiresAt ที่ส่งมา < now + expiryMonths เดือน → throw ไทย (ห้ามสั้นกว่ากฎหมาย) · ไม่ส่ง = now + expiryMonths · recipient.customerId ไม่ใช่สมาชิกระบบนี้ → throw · ownerCustomerId = recipient.customerId ?? buyerCustomerId ?? null
//     PosSale ผ่าน pos.createSale (ไม่ส่ง memberId → ไม่ให้แต้ม · line 1 บรรทัด "Gift Card <number>" · payMethods ตามที่ส่ง) แล้วตั้ง PosSale.giftCardId · outbox-consumers.ts `pos.sale.paid`: บิลที่มี giftCardId → **ข้าม** account bridge / แต้ม / สแตมป์ / attribution (giftcard ลงบัญชีเอง)
//     pinHash = sha256(`${number}:${pin}`) (@/lib/core/hash) · GiftCardTxn SELL {satang, balanceAfter satang, refType "PosSale", refId saleId} · event giftcard.sold {giftCardId, number, satang, buyerCustomerId, ownerCustomerId} · idempotencyKey ซ้ำ → คืนบัตรเดิม (ไม่สร้างซ้ำ · pin คืน null ในรอบซ้ำ)
//     accountingLink เปิด + มี AccountSystemLink POS ของ posSystemId → account facade `postGiftCardSale({ tenantId, sourceSystemId: posSystemId, refId: giftCardId, occurredAt, satang, payMethods })` → AccountJournalEntry refType "GiftCard" refId giftCardId (Dr CASH/BANK · Cr 2110 DEPOSIT_RECEIVED = satang) → GiftCard.accountingDocId = entryId · ปิด/ไม่ได้เชื่อม → accountingDocId null ไม่มี JV
//   balance(ctx, { number }, actor?) → { balanceSatang, expiresAt, status, ownerCustomerId } (ไม่ต้อง PIN) · ไม่พบ → null · actor CUSTOMER ที่ไม่ใช่เจ้าของ → throw ไทย
//   use(ctx, { number, pin, satang, saleId, idempotencyKey }, tx?) → { txnId, balanceAfter } · ตรวจ PIN (ผิด → pinFailedCount+1 · ครบ 5 → pinLockedUntil = now+15 นาที + throw 'ระงับ' · ถูก → reset 0 · ล็อกอยู่ → throw แม้ PIN ถูก) · status ≠ ACTIVE → throw ไทย · expiresAt < now → throw · satang > balance → throw ไทย (ไม่เขียน) · Txn USE refType "PosSale" refId saleId · balance 0 → DEPLETED · event giftcard.used {giftCardId, number, satang, saleId, balanceAfter} · idempotencyKey ซ้ำ → txn เดิม
//     accountingLink เปิด **และ** บัตรมี accountingDocId → `postGiftCardUse({ tenantId, sourceSystemId, refId: txnId, occurredAt, satang })` → JV refType "GiftCardTxn" refId txnId (Dr 2110 · Cr 4030 INCOME_SERVICE) · บัตรที่ขายตอน link ปิด (accountingDocId null) → ไม่ลง · link ปิดอยู่ → ไม่ลง
//   reload(ctx, actor, { number, satang, payMethods, unitId, idempotencyKey }) → { txnId, saleId, balanceAfter } · settings.reloadable false → throw · SUSPENDED/EXPIRED → throw · PosSale ใหม่ (giftCardId) · Txn RELOAD · DEPLETED → ACTIVE · JV เหมือน sell (refType "GiftCardTxn" refId txnId) เมื่อ link เปิด + บัตรผูกบัญชี
//   transfer(ctx, actor, { number, pin, toCustomerId }) → settings.transferable false → throw · actor CUSTOMER ต้องเป็น owner (ไม่ใช่ → throw) · staff ต้องมี giftcard.manage · toCustomerId ต้องเป็นสมาชิกระบบนี้ (ไม่ใช่ → throw ไทย) · ownerCustomerId = to · Txn TRANSFER {satang 0, refType "Customer", refId toCustomerId}
//   suspend(ctx, actor, { number, reason }) → giftcard.manage · SUSPENDED (Txn ADJUST satang 0 refType "SUSPEND") · use → throw · unsuspend(ctx, actor, { number }) → ACTIVE (balance 0 → DEPLETED)
//   refundUse(ctx, { txnId }) (void บิล) → Txn REFUND {satang, balanceAfter} · balance คืน · DEPLETED → ACTIVE · JV กลับรายการ (account.reverseFor refType "GiftCardTxn" refId txnId) เมื่อบัตรผูกบัญชี · ซ้ำ → idempotent {refunded false}
//   expireDue(now?) → { expired } ทุกร้าน: ACTIVE + expiresAt ≤ now → EXPIRED · balance > 0 → Txn EXPIRE {satang balance, balanceAfter 0} + JV (Dr 2110 · Cr 4900 OTHER_INCOME) เมื่อบัตรผูกบัญชี + link เปิด · cron.ts step giftCardExpire (summary giftCardExpired)
//   list(ctx, { status?, q?, take? }) → { rows[{ id, number, numberMasked ('GC-****1234'), buyerName, ownerName, initialSatang, balanceSatang, status, expiresAt, accountingDocId }], kpi{ soldThisMonthSatang, soldThisMonthCount, outstandingSatang (Σ balance ACTIVE), usedThisMonthSatang } }
//   mergeGiftCards(ctx, { keepId, mergeId }) (profile.ts#mergeMembers เรียกผ่าน facade) → buyer/owner ของคนที่ถูกรวม → คนที่เก็บ
//   events giftcard.sold / giftcard.used ลง 3 ทะเบียน + consumer (no-op/บันทึก MemberActivity ให้ owner)
//   UI (ภาพ 20): /member/promotions/giftcards — KPI 3 (ขายเดือนนี้ ฿ + n ใบ · คงเหลือทั้งหมด ฿ 'หนี้สินในบัญชี 2110' · ใช้ไปเดือนนี้ ฿ 'รับรู้รายได้แล้ว') · ป้าย 'ผูกบัญชี: เปิดอยู่/ปิดอยู่' · ปุ่ม 'ขาย Gift Card' → drawer: มูลค่า (ชิป denominations + กำหนดเอง) · ผู้ซื้อ (ค้นสมาชิก) · ผู้รับ (สมาชิกในระบบ / ส่งทาง LINE/อีเมล / พิมพ์บัตร (ไม่ระบุ)) · ข้อความบนบัตร · หมดอายุ (เดือน) · ชำระที่ (POS หน้าร้าน) · กล่อง 'ผูกกับโมดูลบัญชี' toggle + คำอธิบาย เปิด/ปิด · ใช้ได้กับ POS/จอง/ออนไลน์ · สิทธิ์เพิ่มเติม โอนเจ้าของได้/เติมเงินได้ · หมายเหตุ 'หมดอายุขั้นต่ำตามกฎหมาย' · แถบล่าง ยกเลิก / 'รับเงิน ฿x ผ่าน POS' · ตาราง 'Gift Card ทั้งหมด' (หมายเลข · ผู้ซื้อ · ผู้รับ/เจ้าของ · มูลค่า · คงเหลือ · หมดอายุ · สถานะ) · /member/promotions/giftcards/settings (enabled · accountingLink · expiryMonths · denominations · transferable · reloadable)
//   testid: giftcards-page giftcards-kpi giftcards-link-badge giftcards-sell giftcards-sell-modal giftcards-sell-amount giftcards-sell-buyer giftcards-sell-recipient giftcards-sell-submit giftcards-table giftcards-row-<id> giftcards-settings giftcards-settings-form
//   actions: giftcard/giftcard-actions.ts "use server" gate giftcard.sell/manage · promotions hub มีแท็บ gift card → ready · facade giftcard/index.ts export getSettings setSettings sell balance use reload transfer suspend unsuspend refundUse expireDue list mergeGiftCards · account/index.ts เพิ่ม postGiftCardSale postGiftCardUse postGiftCardExpire (+ reverseFor เดิม) · service.ts ไม่ import โมดูลอื่นตรงนอก facade · ไม่มี any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_f$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/giftcard/service.ts") || !existsSync("src/app/app/sys/[id]/member/promotions/giftcards/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_f · giftcard/service.ts · member/promotions/giftcards/page.tsx)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const cols = async (t: string) => new Set((await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='${t}'`)).map((c) => c.column_name));
const enumVals = async (name: string) => (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='${name}'`)).map((e) => e.enumlabel);
const hasIdx = async (t: string, colsIn: string[], unique = false) => { const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`); return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("(") + 1).replace(/"/g, "").toLowerCase(); return colsIn.every((c) => body.includes(c.toLowerCase())); }); };
const P = prisma as Any;
let tid = ""; let SYS = ""; let POS = ""; let PT = "";
const tag = Date.now().toString(36);
const before = { cards: new Set<string>() };
const made = { customers: [] as string[], sales: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; POS = scope.systems.POS as string; PT = scope.systems.POINT as string;
  for (const c of await P.giftCard.findMany({ where: { tenantId: tid }, select: { id: true } })) before.cards.add(c.id);
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const G = (await import("@/lib/modules/giftcard" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana0 = await actorOf(E.users.staff.thana.userId);
  const thanaSell = { ...thana0, permissions: { ...thana0.permissions, "member.giftcard.sell": true } };
  const noPerm = await actorOf(E.users.noPerm.userId);
  const ctx = { tenantId: tid, systemId: SYS, posSystemId: POS, actorUserId: E.users.owner.userId as string };
  const outbox = (type: string, pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "desc" }, take: 60 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));
  const card = (id: string) => P.giftCard.findUnique({ where: { id } });
  const txns = (id: string) => P.giftCardTxn.findMany({ where: { giftCardId: id }, orderBy: { createdAt: "asc" } });
  const jv = (refType: string, refId: string) => P.accountJournalEntry.findMany({ where: { tenantId: tid, refType, refId }, include: { lines: { include: { account: true } } } });
  const key = (s: string) => `qc26-${tag}-${s}`;
  const pay = (satang: number) => [{ type: "CASH", amountSatang: satang }];
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  const drain = async () => { await drainOutbox(CONS, { limit: 300 }); await drainOutbox(CONS, { limit: 300 }); };
  const set0 = await G.getSettings(ctx);
  restore.push(() => G.setSettings(ctx, owner, set0));
  const sellOk = async (input: Any) => { const r = await G.sell(ctx, owner, { satang: 100_000, payMethods: pay(100_000), unitId: E.units.patong, recipient: { print: true }, ...input }); if (r?.saleId) made.sales.push(r.saleId); return r; };

  // ═══ S1 schema + settings + โครง ═══
  const gc = await cols("GiftCard"); const gt = await cols("GiftCardTxn"); const gs = await cols("GiftCardSettings"); const ps = await cols("PosSale");
  const sql = read(`prisma/migrations/${migDir}/migration.sql`);
  const destructive = sql.split("\n").filter((l) => /^\s*(ALTER TABLE .*\b(DROP COLUMN|ALTER COLUMN [^;]*\bTYPE)|DROP TABLE|DROP TYPE)\b/i.test(l));
  const applied = await q<{ finished_at: Date | null }>(`select finished_at from "_prisma_migrations" where migration_name='${migDir}'`);
  const diff = spawnSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "prisma.config.ts", "--to-schema", "prisma/schema", "--script"], { encoding: "utf8", env: process.env, timeout: 300_000 });
  const st = await enumVals("GiftCardStatus"); const tt = await enumVals("GiftCardTxnType");
  chk("M2.6-S1.1", "migration member_v2_f: GiftCard {systemId number pinHash pinFailedCount pinLockedUntil initialSatang balanceSatang buyerCustomerId ownerCustomerId recipientContact message status expiresAt saleId accountingDocId} unique(tenantId,number) index(ownerCustomerId) · GiftCardTxn {giftCardId type satang balanceAfter refType refId byUserId idempotencyKey} unique(tenantId,idempotencyKey) index(giftCardId,createdAt) · GiftCardSettings {systemId enabled accountingLink expiryMonths denominations transferable reloadable} · PosSale.giftCardId · enum GiftCardStatus 4 · GiftCardTxnType 7 · additive · applied · migrate diff = empty",
    ["systemId", "number", "pinHash", "pinFailedCount", "pinLockedUntil", "initialSatang", "balanceSatang", "buyerCustomerId", "ownerCustomerId", "recipientContact", "message", "status", "expiresAt", "saleId", "accountingDocId"].every((c) => gc.has(c)) && ["giftCardId", "type", "satang", "balanceAfter", "refType", "refId", "byUserId", "idempotencyKey"].every((c) => gt.has(c)) && ["systemId", "enabled", "accountingLink", "expiryMonths", "denominations", "transferable", "reloadable"].every((c) => gs.has(c)) && ps.has("giftCardId")
      && (await hasIdx("GiftCard", ["tenantId", "number"], true)) && (await hasIdx("GiftCard", ["ownerCustomerId"])) && (await hasIdx("GiftCardTxn", ["tenantId", "idempotencyKey"], true)) && (await hasIdx("GiftCardTxn", ["giftCardId", "createdAt"]))
      && ["ACTIVE", "DEPLETED", "EXPIRED", "SUSPENDED"].every((v) => st.includes(v)) && ["SELL", "USE", "RELOAD", "TRANSFER", "EXPIRE", "REFUND", "ADJUST"].every((v) => tt.includes(v)) && destructive.length === 0 && !!applied[0]?.finished_at && /empty migration/i.test(diff.stdout + diff.stderr),
    "ครบ", `gc=${[...gc].length} gt=${[...gt].length} gs=${[...gs].length} posCol=${ps.has("giftCardId")} st=${st.length} tt=${tt.length} destructive=${destructive.length} applied=${!!applied[0]?.finished_at} diff=${/empty migration/i.test(diff.stdout + diff.stderr)}`);

  const eMonths = await fails(() => G.setSettings(ctx, owner, { expiryMonths: 6 }));
  const eDenom = await fails(() => G.setSettings(ctx, owner, { denominations: [0, 100_000] }));
  const ePerm = await fails(() => G.setSettings(ctx, thanaSell, { enabled: true }));
  await G.setSettings(ctx, owner, { enabled: true, accountingLink: false, expiryMonths: 24, denominations: [100_000, 200_000, 500_000], transferable: true, reloadable: true });
  const s1 = await G.getSettings(ctx);
  chk("M2.6-S1.2", "settings: ค่าปริยาย enabled false · accountingLink false · expiryMonths 24 · denominations 3 · transferable/reloadable true · expiryMonths 6 (< 12) → throw ไทย · denomination 0 → throw · thana (ไม่มี giftcard.manage) → throw · set enabled/link ปิด → อ่านกลับตรง",
    set0?.enabled === false && set0.accountingLink === false && set0.expiryMonths === 24 && Array.isArray(set0.denominations) && set0.denominations.length === 3 && set0.transferable === true && set0.reloadable === true && thai(eMonths) && thai(eDenom) && !!ePerm && s1?.enabled === true && s1.accountingLink === false,
    "ตามสัญญา", `set0=${JSON.stringify(set0)} months=${thai(eMonths)} denom=${thai(eDenom)} perm=${!!ePerm} s1=${JSON.stringify(s1)}`);

  const fit = read("scripts/fitness.mts"); const facade = read("src/lib/modules/giftcard/index.ts"); const svcSrc = read("src/lib/modules/giftcard/service.ts"); const accFacade = read("src/lib/modules/account/index.ts");
  const FAC = ["getSettings", "setSettings", "sell", "balance", "use", "reload", "transfer", "suspend", "unsuspend", "refundUse", "expireDue", "list", "mergeGiftCards"];
  const missingF = FAC.filter((f) => !new RegExp(`\\b${f}\\b`).test(facade));
  chk("M2.6-S1.3", "fitness F2 มีเส้น giftcard→pos · giftcard→account · giftcard→member · facade export 13 · account/index.ts export postGiftCardSale/postGiftCardUse/postGiftCardExpire · service.ts ไม่ import โมดูลอื่นตรงนอก facade · ไม่มี any",
    /"giftcard→pos"/.test(fit) && /"giftcard→account"/.test(fit) && /"giftcard→member"/.test(fit) && missingF.length === 0 && /postGiftCardSale/.test(accFacade) && /postGiftCardUse/.test(accFacade) && /postGiftCardExpire/.test(accFacade) && !/@\/lib\/modules\/(pos|account|member|point)\/(?!index)[a-z-]+"/.test(svcSrc) && !/:\s*any\b/.test(svcSrc),
    "ครบ", `edges=${/"giftcard→pos"/.test(fit)}/${/"giftcard→account"/.test(fit)}/${/"giftcard→member"/.test(fit)} facade-missing=${missingF.join(",") || "-"} acc=${/postGiftCardSale/.test(accFacade)}/${/postGiftCardUse/.test(accFacade)}/${/postGiftCardExpire/.test(accFacade)} deep=${/@\/lib\/modules\/(pos|account|member|point)\/(?!index)[a-z-]+"/.test(svcSrc)}`);

  // ═══ S2 sell / balance / use / reload / transfer / suspend ═══
  const c1 = await sellOk({ satang: 100_000, buyerCustomerId: m(1).id, recipient: { customerId: m(2).id }, message: "สุขสันต์วันเกิด", idempotencyKey: key("s1") });
  const c1r = await card(c1?.giftCardId);
  const sale1 = c1?.saleId ? await prisma.posSale.findUnique({ where: { id: c1.saleId }, include: { lines: true, payments: true } }) as Any : null;
  const t1 = c1 ? await txns(c1.giftCardId) : [];
  const ob1 = await outbox("giftcard.sold", (p) => p.giftCardId === c1?.giftCardId);
  const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
  chk("M2.6-S2.1", "sell ฿1,000 (ซื้อ สมาชิก 1 → รับ สมาชิก 2): {number GC-xxxxxxxx, pin 6 หลัก, saleId, expiresAt ≈ +24 เดือน, accountingDocId null (link ปิด)} · GiftCard ACTIVE balance 100000 buyer 1 owner 2 message · pinHash = sha256(number:pin) (ไม่เก็บ pin ตรง) · PosSale giftCardId · ไม่มี memberId · line 1 'Gift Card' 100000 · payment CASH · Txn SELL balanceAfter 100000 refType PosSale · event giftcard.sold",
    /^GC-\d{8}$/.test(c1?.number ?? "") && /^\d{6}$/.test(c1?.pin ?? "") && !!c1.saleId && c1.accountingDocId === null && c1r?.status === "ACTIVE" && c1r.balanceSatang === 100_000 && c1r.initialSatang === 100_000 && c1r.buyerCustomerId === m(1).id && c1r.ownerCustomerId === m(2).id && c1r.message === "สุขสันต์วันเกิด" && c1r.pinHash === sha256(`${c1.number}:${c1.pin}`) && Math.abs(new Date(c1r.expiresAt).getTime() - (Date.now() + 730 * 86_400_000)) < 3 * 86_400_000 && sale1?.giftCardId === c1.giftCardId && sale1.memberId === null && sale1.lines?.length === 1 && /Gift Card/i.test(sale1.lines[0].name) && sale1.grandTotalSatang === 100_000 && sale1.payments?.[0]?.type === "CASH" && t1.length === 1 && t1[0].type === "SELL" && t1[0].balanceAfter === 100_000 && t1[0].refType === "PosSale" && !!ob1 && ob1.payload.satang === 100_000 && ob1.payload.ownerCustomerId === m(2).id,
    "ขายสำเร็จ", `c1=${JSON.stringify({ n: c1?.number, pin: !!c1?.pin, sale: !!c1?.saleId, acc: c1?.accountingDocId })} card=${JSON.stringify({ st: c1r?.status, bal: c1r?.balanceSatang, buyer: c1r?.buyerCustomerId === m(1).id, owner: c1r?.ownerCustomerId === m(2).id, hash: c1r?.pinHash === sha256(`${c1?.number}:${c1?.pin}`) })} sale=${JSON.stringify({ gc: sale1?.giftCardId === c1?.giftCardId, member: sale1?.memberId, lines: sale1?.lines?.length, total: sale1?.grandTotalSatang })} txn=${t1.map((t: Any) => t.type).join(",")} ob=${!!ob1}`);

  const c1again = await G.sell(ctx, owner, { satang: 100_000, payMethods: pay(100_000), unitId: E.units.patong, buyerCustomerId: m(1).id, recipient: { customerId: m(2).id }, message: "สุขสันต์วันเกิด", idempotencyKey: key("s1") });
  await G.setSettings(ctx, owner, { enabled: false });
  const eDisabled = await fails(() => sellOk({ idempotencyKey: key("s2") }));
  await G.setSettings(ctx, owner, { enabled: true });
  const eZero = await fails(() => sellOk({ satang: 0, payMethods: pay(0), idempotencyKey: key("s3") }));
  const ePay = await fails(() => sellOk({ satang: 100_000, payMethods: pay(50_000), idempotencyKey: key("s4") }));
  const eShort = await fails(() => sellOk({ expiresAt: new Date(Date.now() + 90 * 86_400_000), idempotencyKey: key("s5") }));
  const eRecip = await fails(() => sellOk({ recipient: { customerId: "no-such" }, idempotencyKey: key("s6") }));
  const eNoPerm = await fails(() => G.sell(ctx, noPerm, { satang: 100_000, payMethods: pay(100_000), unitId: E.units.patong, recipient: { print: true }, idempotencyKey: key("s7") }));
  const cStaff = await G.sell(ctx, thanaSell, { satang: 200_000, payMethods: pay(200_000), unitId: E.units.patong, recipient: { contact: { name: "น้องขิม", line: "@kim" } }, idempotencyKey: key("s8") });
  if (cStaff?.saleId) made.sales.push(cStaff.saleId);
  const cStaffRow = cStaff ? await card(cStaff.giftCardId) : null;
  chk("M2.6-S2.2", "sell ตรวจ: idempotencyKey ซ้ำ → บัตรเดิม (pin null · ไม่มีบัตร/บิลใหม่) · enabled false → throw ไทย · ฿0 → throw · Σ payMethods ≠ ยอด → throw · expiresAt 90 วัน (< 24 เดือน) → throw ไทย · ผู้รับไม่ใช่สมาชิก → throw · noPerm → throw · thana (giftcard.sell) ขายให้ผู้รับนอกระบบ (contact LINE) → ได้ owner null recipientContact",
    c1again?.giftCardId === c1.giftCardId && c1again.pin === null && (await P.giftCard.count({ where: { tenantId: tid, id: { notIn: [...before.cards] } } })) === 2 && thai(eDisabled) && thai(eZero) && thai(ePay) && thai(eShort) && thai(eRecip) && !!eNoPerm && !!cStaff?.giftCardId && cStaffRow?.ownerCustomerId === null && cStaffRow.recipientContact?.line === "@kim",
    "ตามสัญญา", `again=${c1again?.giftCardId === c1?.giftCardId}/${c1again?.pin} n=${await P.giftCard.count({ where: { tenantId: tid, id: { notIn: [...before.cards] } } })} disabled=${thai(eDisabled)} zero=${thai(eZero)} pay=${thai(ePay)} short=${eShort?.message?.slice(0, 40)} recip=${thai(eRecip)} np=${!!eNoPerm} staff=${JSON.stringify({ id: !!cStaff?.giftCardId, owner: cStaffRow?.ownerCustomerId, contact: cStaffRow?.recipientContact })}`);

  const b1 = await G.balance(ctx, { number: c1.number });
  const bNone = await G.balance(ctx, { number: "GC-00000000" });
  const cust2 = { role: "CUSTOMER", customerId: m(2).id, userId: null, unitAccess: [], permissions: {} };
  const cust3 = { role: "CUSTOMER", customerId: m(3).id, userId: null, unitAccess: [], permissions: {} };
  const bOwner = await G.balance(ctx, { number: c1.number }, cust2);
  const eBOther = await fails(() => G.balance(ctx, { number: c1.number }, cust3));
  chk("M2.6-S2.3", "balance(number) ไม่ต้อง PIN → {balanceSatang 100000, expiresAt, status ACTIVE, ownerCustomerId 2} · หมายเลขไม่มี → null · ลูกค้าเจ้าของ (CUSTOMER 2) → ได้ · ลูกค้าคนอื่น (3) → throw ไทย",
    b1?.balanceSatang === 100_000 && b1.status === "ACTIVE" && !!b1.expiresAt && b1.ownerCustomerId === m(2).id && bNone === null && bOwner?.balanceSatang === 100_000 && thai(eBOther),
    "ยอดถูก", `b1=${JSON.stringify(b1)} none=${bNone} owner=${bOwner?.balanceSatang} other=${eBOther?.message?.slice(0, 40)}`);

  const eWrongPin = await fails(() => G.use(ctx, { number: c1.number, pin: "000000", satang: 30_000, saleId: `${tag}-u0`, idempotencyKey: key("u0") }));
  const u1 = await G.use(ctx, { number: c1.number, pin: c1.pin, satang: 30_000, saleId: `${tag}-u1`, idempotencyKey: key("u1") });
  const obU = await outbox("giftcard.used", (p) => p.giftCardId === c1.giftCardId && p.saleId === `${tag}-u1`);
  const eOver = await fails(() => G.use(ctx, { number: c1.number, pin: c1.pin, satang: 80_000, saleId: `${tag}-u2`, idempotencyKey: key("u2") }));
  const u1b = await G.use(ctx, { number: c1.number, pin: c1.pin, satang: 30_000, saleId: `${tag}-u1`, idempotencyKey: key("u1") });
  const uTx = (await prisma.$transaction((tx) => G.use(ctx, { number: c1.number, pin: c1.pin, satang: 20_000, saleId: `${tag}-u3`, idempotencyKey: key("u3") }, tx))) as Any;
  const c1u = await card(c1.giftCardId);
  const tU = await txns(c1.giftCardId);
  chk("M2.6-S2.4", "use: PIN ผิด → throw ไทย (ไม่ตัด) · PIN ถูก ตัด ฿300 → {txnId, balanceAfter 70000} · Txn USE refType PosSale refId saleId · event giftcard.used {giftCardId, number, satang, saleId, balanceAfter} · ตัด ฿800 > 700 → throw ไทย ไม่เขียน · idempotencyKey ซ้ำ → txn เดิม balance คง · ใช้ใน tx ได้ (ตัดอีก 200 → 50000)",
    thai(eWrongPin) && u1?.balanceAfter === 70_000 && !!u1.txnId && tU.some((t: Any) => t.type === "USE" && t.refType === "PosSale" && t.refId === `${tag}-u1` && t.satang === 30_000) && !!obU && obU.payload.balanceAfter === 70_000 && obU.payload.number === c1.number && thai(eOver) && u1b?.txnId === u1.txnId && uTx?.balanceAfter === 50_000 && c1u?.balanceSatang === 50_000 && tU.filter((t: Any) => t.type === "USE").length === 2,
    "ตัดถูก", `wrong=${thai(eWrongPin)} u1=${JSON.stringify(u1)} ob=${!!obU} over=${eOver?.message?.slice(0, 40)} again=${u1b?.txnId === u1?.txnId} tx=${JSON.stringify(uTx)} bal=${c1u?.balanceSatang} uses=${tU.filter((t: Any) => t.type === "USE").length}`);

  const uAll = await G.use(ctx, { number: c1.number, pin: c1.pin, satang: 50_000, saleId: `${tag}-u4`, idempotencyKey: key("u4") });
  const c1d = await card(c1.giftCardId);
  const eDepleted = await fails(() => G.use(ctx, { number: c1.number, pin: c1.pin, satang: 1_000, saleId: `${tag}-u5`, idempotencyKey: key("u5") }));
  const rl = await G.reload(ctx, owner, { number: c1.number, satang: 50_000, payMethods: pay(50_000), unitId: E.units.patong, idempotencyKey: key("r1") });
  if (rl?.saleId) made.sales.push(rl.saleId);
  const c1rl = await card(c1.giftCardId);
  const saleRl = rl?.saleId ? await prisma.posSale.findUnique({ where: { id: rl.saleId } }) as Any : null;
  await G.setSettings(ctx, owner, { reloadable: false });
  const eReload = await fails(() => G.reload(ctx, owner, { number: c1.number, satang: 10_000, payMethods: pay(10_000), unitId: E.units.patong, idempotencyKey: key("r2") }));
  await G.setSettings(ctx, owner, { reloadable: true });
  chk("M2.6-S2.5", "ใช้จนหมด → balance 0 status DEPLETED · ใช้อีก → throw ไทย · reload ฿500 → ACTIVE balance 50000 · PosSale ใหม่ (giftCardId) · Txn RELOAD · reloadable false → throw ไทย",
    uAll?.balanceAfter === 0 && c1d?.status === "DEPLETED" && thai(eDepleted) && rl?.balanceAfter === 50_000 && c1rl?.status === "ACTIVE" && c1rl.balanceSatang === 50_000 && saleRl?.giftCardId === c1.giftCardId && (await txns(c1.giftCardId)).some((t: Any) => t.type === "RELOAD" && t.satang === 50_000) && thai(eReload),
    "หมด → เติม", `all=${uAll?.balanceAfter} st=${c1d?.status} depleted=${eDepleted?.message?.slice(0, 40)} rl=${JSON.stringify(rl)} card=${c1rl?.status}/${c1rl?.balanceSatang} sale=${saleRl?.giftCardId === c1?.giftCardId} reload=${eReload?.message?.slice(0, 40)}`);

  const eTrOther = await fails(() => G.transfer(ctx, cust3, { number: c1.number, pin: c1.pin, toCustomerId: m(4).id }));
  const eTrGhost = await fails(() => G.transfer(ctx, cust2, { number: c1.number, pin: c1.pin, toCustomerId: "no-such" }));
  const eTrPin = await fails(() => G.transfer(ctx, cust2, { number: c1.number, pin: "111111", toCustomerId: m(4).id }));
  const tr = await G.transfer(ctx, cust2, { number: c1.number, pin: c1.pin, toCustomerId: m(4).id });
  const c1t = await card(c1.giftCardId);
  await G.setSettings(ctx, owner, { transferable: false });
  const eTrOff = await fails(() => G.transfer(ctx, owner, { number: c1.number, pin: c1.pin, toCustomerId: m(5).id }));
  await G.setSettings(ctx, owner, { transferable: true });
  const eTrStaff = await fails(() => G.transfer(ctx, thanaSell, { number: c1.number, pin: c1.pin, toCustomerId: m(5).id }));
  chk("M2.6-S2.6", "transfer: ลูกค้าที่ไม่ใช่เจ้าของ → throw · ปลายทางไม่ใช่สมาชิก → throw ไทย · PIN ผิด → throw · เจ้าของ (CUSTOMER 2) + PIN → owner = สมาชิก 4 · Txn TRANSFER refType Customer refId 4 · transferable false → throw ไทย · staff ที่มีแค่ giftcard.sell → throw",
    !!eTrOther && thai(eTrGhost) && !!eTrPin && tr?.ok === true && c1t?.ownerCustomerId === m(4).id && (await txns(c1.giftCardId)).some((t: Any) => t.type === "TRANSFER" && t.refId === m(4).id) && thai(eTrOff) && !!eTrStaff,
    "โอนได้เฉพาะเจ้าของ", `other=${!!eTrOther} ghost=${thai(eTrGhost)} pin=${!!eTrPin} tr=${JSON.stringify(tr)} owner=${c1t?.ownerCustomerId === m(4).id} off=${eTrOff?.message?.slice(0, 40)} staff=${!!eTrStaff}`);

  const eSusPerm = await fails(() => G.suspend(ctx, thanaSell, { number: c1.number, reason: "x" }));
  const sus = await G.suspend(ctx, owner, { number: c1.number, reason: "บัตรหาย" });
  const eUseSus = await fails(() => G.use(ctx, { number: c1.number, pin: c1.pin, satang: 1_000, saleId: `${tag}-u6`, idempotencyKey: key("u6") }));
  const bSus = await G.balance(ctx, { number: c1.number });
  await G.unsuspend(ctx, owner, { number: c1.number });
  const c1un = await card(c1.giftCardId);
  const cExp = await sellOk({ satang: 100_000, idempotencyKey: key("s9") });
  await P.giftCard.update({ where: { id: cExp.giftCardId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const eUseExp = await fails(() => G.use(ctx, { number: cExp.number, pin: cExp.pin, satang: 1_000, saleId: `${tag}-u7`, idempotencyKey: key("u7") }));
  chk("M2.6-S2.7", "suspend: staff sell-only → throw · owner ระงับ → SUSPENDED · use → throw ไทย · balance แสดง status SUSPENDED · unsuspend → ACTIVE (balance 50000) · บัตรหมดอายุ (expiresAt ผ่าน) use → throw ไทย",
    !!eSusPerm && sus?.ok === true && thai(eUseSus) && bSus?.status === "SUSPENDED" && c1un?.status === "ACTIVE" && thai(eUseExp),
    "ระงับ/ปลด", `perm=${!!eSusPerm} sus=${JSON.stringify(sus)} use=${eUseSus?.message?.slice(0, 40)} b=${bSus?.status} un=${c1un?.status} exp=${eUseExp?.message?.slice(0, 40)}`);

  // ═══ S3 PIN lockout ═══
  const cPin = await sellOk({ satang: 100_000, idempotencyKey: key("s10") });
  const errs: (Error | null)[] = [];
  for (let k = 0; k < 5; k += 1) errs.push(await fails(() => G.use(ctx, { number: cPin.number, pin: "999999", satang: 1_000, saleId: `${tag}-p${k}`, idempotencyKey: key(`p${k}`) })));
  const cPinRow = await card(cPin.giftCardId);
  const eLocked = await fails(() => G.use(ctx, { number: cPin.number, pin: cPin.pin, satang: 1_000, saleId: `${tag}-p5`, idempotencyKey: key("p5") }));
  const bLocked = await G.balance(ctx, { number: cPin.number });
  chk("M2.6-S3.1", "PIN ผิด 5 ครั้ง → ทุกครั้ง throw ไทย · pinFailedCount 5 · pinLockedUntil ≈ now+15 นาที · ครั้งที่ 6 ด้วย PIN ถูก → throw 'ระงับ' · balance ยังดูได้ 100000",
    errs.every(thai) && cPinRow?.pinFailedCount === 5 && !!cPinRow.pinLockedUntil && Math.abs(new Date(cPinRow.pinLockedUntil).getTime() - (Date.now() + 15 * 60_000)) < 120_000 && thai(eLocked) && /ระงับ|ล็อก|15/.test(eLocked?.message ?? "") && bLocked?.balanceSatang === 100_000,
    "ล็อก 15 นาที", `errs=${errs.map(thai).join(",")} count=${cPinRow?.pinFailedCount} until=${cPinRow?.pinLockedUntil} locked=${eLocked?.message?.slice(0, 50)} bal=${bLocked?.balanceSatang}`);

  await P.giftCard.update({ where: { id: cPin.giftCardId }, data: { pinLockedUntil: new Date(Date.now() - 1000) } });
  const uAfter = await G.use(ctx, { number: cPin.number, pin: cPin.pin, satang: 1_000, saleId: `${tag}-p6`, idempotencyKey: key("p6") });
  const cPinRow2 = await card(cPin.giftCardId);
  chk("M2.6-S3.2", "พ้นเวลาระงับ (pinLockedUntil ผ่าน) + PIN ถูก → ใช้ได้ (balance 99000) · pinFailedCount reset 0 · pinLockedUntil null",
    uAfter?.balanceAfter === 99_000 && cPinRow2?.pinFailedCount === 0 && cPinRow2.pinLockedUntil === null, "reset", `u=${JSON.stringify(uAfter)} count=${cPinRow2?.pinFailedCount} until=${cPinRow2?.pinLockedUntil}`);

  // ═══ S4 accountingLink ═══
  const sys = (await import("@/lib/modules/system/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Any>;
  let accSys = await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "ACCOUNT" as Any } });
  if (!accSys) {
    accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี (MB QC)");
    for (const u of [E.units.patong, E.units.kata]) await sys.linkUnit(tid, accSys!.id, u);
    await accSvc.saveSettings(tid, accSys!.id, { orgPrefix: "บริษัท", orgName: "สยามไดฟ์ เมมเบอร์ คิวซี จำกัด", taxId: "0835565009999", branchCode: "00000", vatRegistered: false, vatRateBp: 700, taxPointBasis: "ON_ISSUE", defaultDueDays: 30, defaultValidDays: 30 });
    await gl.ensureAccounting({ tenantId: tid, systemId: accSys!.id });
  }
  const ACC = accSys!.id;
  const link = await P.accountSystemLink.findFirst({ where: { tenantId: tid, systemId: ACC, linkedKind: "POS", linkedId: POS } });
  if (!link) await P.accountSystemLink.create({ data: { tenantId: tid, systemId: ACC, linkedKind: "POS", linkedId: POS } });
  await G.setSettings(ctx, owner, { accountingLink: true });
  const cL = await sellOk({ satang: 200_000, payMethods: pay(200_000), buyerCustomerId: m(6).id, recipient: { customerId: m(6).id }, idempotencyKey: key("L1") });
  const cLrow = await card(cL?.giftCardId);
  const jS = cL ? await jv("GiftCard", cL.giftCardId) : [];
  const codeOf = (l: Any) => l.account?.code as string;
  const cr2110 = jS[0]?.lines?.filter((l: Any) => codeOf(l) === "2110").reduce((n: number, l: Any) => n + l.credit, 0) ?? 0;
  const dr1000 = jS[0]?.lines?.filter((l: Any) => codeOf(l) === "1000").reduce((n: number, l: Any) => n + l.debit, 0) ?? 0;
  chk("M2.6-S4.1", "accountingLink เปิด + ระบบบัญชีเชื่อม POS: sell ฿2,000 → AccountJournalEntry refType GiftCard refId giftCardId (Dr 1000 เงินสด 200000 · Cr 2110 เงินรับล่วงหน้า 200000 · systemId บัญชี) · GiftCard.accountingDocId = entryId · บัตรที่ขายตอน link ปิด (c1) accountingDocId ยัง null",
    !!cL?.accountingDocId && cLrow?.accountingDocId === cL.accountingDocId && jS.length === 1 && jS[0].id === cL.accountingDocId && jS[0].systemId === ACC && cr2110 === 200_000 && dr1000 === 200_000 && (await card(c1.giftCardId))?.accountingDocId === null,
    "JV รับเงินล่วงหน้า", `acc=${cL?.accountingDocId} jv=${jS.length} sys=${jS[0]?.systemId === ACC} cr2110=${cr2110} dr1000=${dr1000} c1=${(await card(c1.giftCardId))?.accountingDocId}`);

  const uL = await G.use(ctx, { number: cL.number, pin: cL.pin, satang: 50_000, saleId: `${tag}-L2`, idempotencyKey: key("L2") });
  const jU = uL ? await jv("GiftCardTxn", uL.txnId) : [];
  const uLb = await G.use(ctx, { number: cL.number, pin: cL.pin, satang: 50_000, saleId: `${tag}-L2`, idempotencyKey: key("L2") });
  const jU2 = uL ? await jv("GiftCardTxn", uL.txnId) : [];
  const dr2110u = jU[0]?.lines?.filter((l: Any) => codeOf(l) === "2110").reduce((n: number, l: Any) => n + l.debit, 0) ?? 0;
  const cr4030u = jU[0]?.lines?.filter((l: Any) => codeOf(l) === "4030").reduce((n: number, l: Any) => n + l.credit, 0) ?? 0;
  chk("M2.6-S4.2", "use ฿500 บนบัตรที่ผูกบัญชี → JV refType GiftCardTxn refId txnId (Dr 2110 50000 · Cr 4030 รายได้ค่าบริการ 50000) · idempotencyKey ซ้ำ → JV ยัง 1",
    uL?.balanceAfter === 150_000 && jU.length === 1 && dr2110u === 50_000 && cr4030u === 50_000 && uLb?.txnId === uL.txnId && jU2.length === 1,
    "รับรู้รายได้", `u=${JSON.stringify(uL)} jv=${jU.length} dr=${dr2110u} cr=${cr4030u} again=${uLb?.txnId === uL?.txnId}/${jU2.length}`);

  await P.giftCard.update({ where: { id: cL.giftCardId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const ex = await G.expireDue();
  const cLx = await card(cL.giftCardId);
  const tX = (await txns(cL.giftCardId)).find((t: Any) => t.type === "EXPIRE");
  const jX = tX ? await jv("GiftCardTxn", tX.id) : [];
  const dr2110x = jX[0]?.lines?.filter((l: Any) => codeOf(l) === "2110").reduce((n: number, l: Any) => n + l.debit, 0) ?? 0;
  const cr4900x = jX[0]?.lines?.filter((l: Any) => codeOf(l) === "4900").reduce((n: number, l: Any) => n + l.credit, 0) ?? 0;
  const cron = read("src/lib/platform/cron.ts");
  chk("M2.6-S4.3", "expireDue: บัตรผูกบัญชีหมดอายุ (เหลือ ฿1,500) → EXPIRED · Txn EXPIRE {satang 150000, balanceAfter 0} · JV (Dr 2110 150000 · Cr 4900 รายได้อื่น 150000) · balance 0 · cron.ts step giftCardExpire + summary giftCardExpired · บัตร c1 (ยังไม่หมดอายุ) ไม่แตะ",
    typeof ex?.expired === "number" && ex.expired >= 1 && cLx?.status === "EXPIRED" && cLx.balanceSatang === 0 && tX?.satang === 150_000 && tX.balanceAfter === 0 && jX.length === 1 && dr2110x === 150_000 && cr4900x === 150_000 && /giftCardExpire/.test(cron) && /giftCardExpired/.test(cron) && (await card(c1.giftCardId))?.status === "ACTIVE",
    "รายได้อื่น", `ex=${JSON.stringify(ex)} st=${cLx?.status}/${cLx?.balanceSatang} txn=${tX?.satang}/${tX?.balanceAfter} jv=${jX.length} dr=${dr2110x} cr=${cr4900x} cron=${/giftCardExpire/.test(cron)}`);

  await G.setSettings(ctx, owner, { accountingLink: false });
  const cOff = await sellOk({ satang: 100_000, buyerCustomerId: m(7).id, recipient: { customerId: m(7).id }, idempotencyKey: key("O1") });
  const cL2 = await (async () => { await G.setSettings(ctx, owner, { accountingLink: true }); const c = await sellOk({ satang: 100_000, buyerCustomerId: m(8).id, recipient: { customerId: m(8).id }, idempotencyKey: key("O2") }); await G.setSettings(ctx, owner, { accountingLink: false }); return c; })();
  const uOffLinked = await G.use(ctx, { number: cL2.number, pin: cL2.pin, satang: 10_000, saleId: `${tag}-O3`, idempotencyKey: key("O3") });
  const jOffLinked = await jv("GiftCardTxn", uOffLinked.txnId);
  await G.setSettings(ctx, owner, { accountingLink: true });
  const uOnUnlinked = await G.use(ctx, { number: cOff.number, pin: cOff.pin, satang: 10_000, saleId: `${tag}-O4`, idempotencyKey: key("O4") });
  const jOnUnlinked = await jv("GiftCardTxn", uOnUnlinked.txnId);
  const uOnLinked = await G.use(ctx, { number: cL2.number, pin: cL2.pin, satang: 10_000, saleId: `${tag}-O5`, idempotencyKey: key("O5") });
  const jOnLinked = await jv("GiftCardTxn", uOnLinked.txnId);
  chk("M2.6-S4.4", "สลับกลางทาง: link ปิด → ขาย → accountingDocId null ไม่มี JV · link เปิด → ขาย → มี JV · link ปิด + ใช้บัตรที่ผูก → ไม่ลง JV · link เปิด + ใช้บัตรที่ไม่ผูก (ขายตอนปิด) → ไม่ลง JV · link เปิด + ใช้บัตรที่ผูก → ลง JV (เฉพาะรายการหลังเปิด §11.6)",
    cOff?.accountingDocId === null && (await jv("GiftCard", cOff.giftCardId)).length === 0 && !!cL2?.accountingDocId && jOffLinked.length === 0 && jOnUnlinked.length === 0 && jOnLinked.length === 1,
    "เฉพาะหลังเปิด", `off=${cOff?.accountingDocId}/${(await jv("GiftCard", cOff.giftCardId)).length} on=${!!cL2?.accountingDocId} offLinked=${jOffLinked.length} onUnlinked=${jOnUnlinked.length} onLinked=${jOnLinked.length}`);

  const rf = await G.refundUse(ctx, { txnId: uOnLinked.txnId });
  const cL2r = await card(cL2.giftCardId);
  const jRev = await P.accountJournalEntry.findMany({ where: { tenantId: tid, reversalOfId: jOnLinked[0]?.id } });
  const rf2 = await G.refundUse(ctx, { txnId: uOnLinked.txnId });
  chk("M2.6-S4.5", "refundUse (void บิล): Txn REFUND +10000 · balance กลับ 90000 · JV กลับรายการ (reversalOfId = JV ตอนใช้) · ซ้ำ → {refunded false} ไม่คืนซ้ำ",
    rf?.refunded === true && cL2r?.balanceSatang === 90_000 && (await txns(cL2.giftCardId)).some((t: Any) => t.type === "REFUND" && t.satang === 10_000) && jRev.length === 1 && rf2?.refunded === false && (await card(cL2.giftCardId))?.balanceSatang === 90_000,
    "คืนครั้งเดียว", `rf=${JSON.stringify(rf)} bal=${cL2r?.balanceSatang} rev=${jRev.length} rf2=${JSON.stringify(rf2)}`);

  // ═══ S5 list / merge / expire ปกติ ═══
  const lst = await G.list(ctx, { take: 100 });
  const rowC1 = lst?.rows?.find((r: Any) => r.id === c1.giftCardId);
  const lstAct = await G.list(ctx, { status: "ACTIVE", take: 100 });
  const lstQ = await G.list(ctx, { q: c1.number, take: 10 });
  chk("M2.6-S5.1", "list: rows มี numberMasked 'GC-****' + 4 หลักท้าย · buyerName/ownerName · balance/status/expiresAt · kpi {soldThisMonthSatang ≥ 700000, soldThisMonthCount ≥ 7, outstandingSatang = Σ balance ACTIVE, usedThisMonthSatang ≥ 0} · status ACTIVE กรองได้ · q=หมายเลข → 1 แถว",
    !!rowC1 && rowC1.numberMasked === `GC-****${c1.number.slice(-4)}` && !!rowC1.buyerName && !!rowC1.ownerName && rowC1.balanceSatang === 50_000 && typeof lst.kpi?.soldThisMonthSatang === "number" && lst.kpi.soldThisMonthSatang >= 700_000 && lst.kpi.soldThisMonthCount >= 7 && typeof lst.kpi.outstandingSatang === "number" && lstAct.rows.every((r: Any) => r.status === "ACTIVE") && lstQ?.rows?.length === 1 && lstQ.rows[0].id === c1.giftCardId,
    "รายการ + kpi", `row=${JSON.stringify({ mask: rowC1?.numberMasked, buyer: rowC1?.buyerName, owner: rowC1?.ownerName, bal: rowC1?.balanceSatang })} kpi=${JSON.stringify(lst?.kpi)} act=${lstAct?.rows?.length} q=${lstQ?.rows?.length}`);

  const mkCust = async (nm: string) => { const c = await PR.createMember({ tenantId: tid, systemId: SYS, actorUserId: owner.userId } as Any, owner, { phone: `0896${String((Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000).padStart(6, "0")}`, firstName: nm, lastName: "giftcard", source: "STAFF", homeUnitId: E.units.patong }); made.customers.push(c.customerId); return c.customerId as string; };
  const X = await mkCust("เก็บ"); const Y = await mkCust("ถูกรวม");
  const cY = await sellOk({ satang: 100_000, buyerCustomerId: Y, recipient: { customerId: Y }, idempotencyKey: key("m1") });
  await PR.mergeMembers({ tenantId: tid, systemId: SYS, actorUserId: owner.userId } as Any, owner, { keepId: X, mergeId: Y, fieldChoices: {} });
  const cYr = await card(cY.giftCardId);
  const fresh = await sellOk({ satang: 100_000, idempotencyKey: key("m2") });
  const ex2 = await G.expireDue();
  chk("M2.6-S5.2", "merge hook: บัตรของ Y (buyer+owner) → หลังรวมเข้า X buyer/owner = X · expireDue รอบปกติ: บัตรสด (24 เดือน) ไม่แตะ (ACTIVE) · คืน {expired} เป็นตัวเลข",
    cYr?.buyerCustomerId === X && cYr.ownerCustomerId === X && typeof ex2?.expired === "number" && (await card(fresh.giftCardId))?.status === "ACTIVE", "ย้ายเจ้าของ", `buyer=${cYr?.buyerCustomerId === X} owner=${cYr?.ownerCustomerId === X} ex=${JSON.stringify(ex2)} fresh=${(await card(fresh.giftCardId))?.status}`);

  // ═══ S6 events + consumer ═══
  const consumers = read("src/lib/outbox-consumers.ts");
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const in3 = (e: string) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1;
  await drain();
  const stuck = await P.outboxEvent.count({ where: { tenantId: tid, type: { startsWith: "giftcard." }, status: { not: "DONE" } } });
  chk("M2.6-S6.1", "giftcard.sold / giftcard.used ลง 3 ทะเบียน + consumer · drain แล้ว DONE ทั้งหมด", in3("giftcard.sold") && in3("giftcard.used") && stuck === 0, "ครบ", `reg=${in3("giftcard.sold")}/${in3("giftcard.used")} stuck=${stuck}`);

  const posSaleJv = await P.accountJournalEntry.count({ where: { tenantId: tid, refType: "PosSale", refId: { in: [cL.saleId, cL2.saleId, c1.saleId] } } });
  const buyerPts = await prisma.pointLedger.count({ where: { tenantId: tid, refId: { in: [c1.saleId, cL.saleId] } } });
  chk("M2.6-S6.2", "consumer pos.sale.paid ข้ามบิล gift card: หลัง drain ไม่มี JV refType PosSale ของบิลขายบัตร (บัญชีขายไม่ถูกบันทึกซ้ำ) · ไม่มี pointLedger อ้างบิลขายบัตร (ไม่ให้แต้ม) · โค้ด consumer ตรวจ giftCardId",
    posSaleJv === 0 && buyerPts === 0 && /giftCardId/.test(consumers), "ข้ามครบ", `posJv=${posSaleJv} pts=${buyerPts} code=${/giftCardId/.test(consumers)}`);

  // ═══ S7 UI / ภาพ ═══
  const pages = { list: read("src/app/app/sys/[id]/member/promotions/giftcards/page.tsx"), settings: read("src/app/app/sys/[id]/member/promotions/giftcards/settings/page.tsx"), hub: read("src/app/app/sys/[id]/member/promotions/page.tsx") };
  const act = read("src/lib/modules/giftcard/giftcard-actions.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /gift/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = Object.values(pages).join("\n") + comps;
  const TIDS = ["giftcards-page", "giftcards-kpi", "giftcards-link-badge", "giftcards-sell", "giftcards-sell-modal", "giftcards-sell-amount", "giftcards-sell-buyer", "giftcards-sell-recipient", "giftcards-sell-submit", "giftcards-table", "giftcards-row-", "giftcards-settings", "giftcards-settings-form"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const clean = all.replace(/\/\/.*$/gm, "");
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(clean); const hex = /#[0-9a-fA-F]{6}\b/.test(clean);
  const LABELS = ["ขาย Gift Card", "ขายเดือนนี้", "คงเหลือทั้งหมด", "หนี้สินในบัญชี", "ใช้ไปเดือนนี้", "รับรู้รายได้แล้ว", "ผูกบัญชี", "มูลค่า", "กำหนดเอง", "ผู้ซื้อ", "ผู้รับ", "สมาชิกในระบบ", "ส่งทาง LINE/อีเมล", "พิมพ์บัตร", "ข้อความบนบัตร", "หมดอายุ", "ชำระที่", "ผูกกับโมดูลบัญชี", "รับเงินล่วงหน้า", "ใช้ได้กับ", "สิทธิ์เพิ่มเติม", "โอนเจ้าของได้", "เติมเงินได้", "หมดอายุขั้นต่ำตามกฎหมาย", "รับเงิน", "ผ่าน POS", "Gift Card ทั้งหมด", "หมายเลข", "ผู้รับ/เจ้าของ", "คงเหลือ", "สถานะ"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  chk("M2.6-S7.1", "หน้า giftcards + settings + hub (แท็บ gift card → ready) requireTenant + สิทธิ์ (giftcard.sell/manage) · actions 'use server' gate · testid 13 · ไม่มีอีโมจิ/hex · ป้ายภาพ 20 ครบ (KPI 3 · ป้ายผูกบัญชี · drawer ขาย ทุกแถว · ตาราง 7 คอลัมน์)",
    Object.values(pages).every((p) => p.length > 0 && /requireTenant/.test(p)) && /giftcard\.(sell|manage)/.test(act) && /["']use server["']/.test(act) && missingT.length === 0 && !emoji && !hex && missingL.length === 0 && !/soon/.test(pages.hub.match(/gift[^\n]{0,120}/i)?.[0] ?? "soon"),
    "ครบ", `pages=${Object.values(pages).map((p) => p.length > 0).join("/")} tid-missing=${missingT.join(",") || "-"} emoji=${emoji} hex=${hex} labels-missing=${missingL.join(",") || "-"}`);

  const dir = `${mq.MQC.shotsDir}/2.6`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M2.6-S7.2", "ภาพ 20: giftcards-owner desktop+mobile 200 ไม่ล้น · giftcards-sell-modal-owner 200 (กดขาย → drawer) · giftcards-settings-owner 200 · thana (read-โดยนัย) 200 ไม่มีปุ่มขาย · noperm 404",
    ok("owner", "giftcards-owner", "desktop") && ok("owner", "giftcards-owner", "mobile") && ok("owner", "giftcards-sell-modal-owner", "desktop") && ok("owner", "giftcards-settings-owner", "desktop") && ok("thana", "giftcards-thana", "desktop") && r("noperm", "giftcards-noperm", "desktop")?.status === 404,
    "200 ×5 · 404", `${["giftcards-owner", "giftcards-sell-modal-owner", "giftcards-settings-owner"].map((n) => r("owner", n, "desktop")?.status).join("/")} mobile=${r("owner", "giftcards-owner", "mobile")?.status}/ovf=${r("owner", "giftcards-owner", "mobile")?.overflow} thana=${r("thana", "giftcards-thana", "desktop")?.status} noperm=${r("noperm", "giftcards-noperm", "desktop")?.status}`);
  chk("M2.6-S7.3", "🔴 parity ภาพ 20 — Fable ตรวจด้วยตา · wo-notes/member-M2.6.md มี 'PARITY: ผ่าน'", /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M2.6.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M2.6-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  const newCards = await P.giftCard.findMany({ where: { tenantId: tid, id: { notIn: [...before.cards] } }, select: { id: true, saleId: true } }).catch(() => [] as Any[]);
  const cardIds = newCards.map((c: Any) => c.id);
  if (cardIds.length) {
    const tx = await P.giftCardTxn.findMany({ where: { giftCardId: { in: cardIds } }, select: { id: true } }).catch(() => [] as Any[]);
    const refIds = [...cardIds, ...tx.map((t: Any) => t.id)];
    const entries = await P.accountJournalEntry.findMany({ where: { tenantId: tid, OR: [{ refType: "GiftCard", refId: { in: refIds } }, { refType: "GiftCardTxn", refId: { in: refIds } }] }, select: { id: true } }).catch(() => [] as Any[]);
    const eids = entries.map((x: Any) => x.id);
    if (eids.length) {
      const revs = await P.accountJournalEntry.findMany({ where: { reversalOfId: { in: eids } }, select: { id: true } }).catch(() => [] as Any[]);
      const allE = [...eids, ...revs.map((x: Any) => x.id)];
      await d(() => P.accountJournalLine.deleteMany({ where: { entryId: { in: allE } } }));
      await d(() => P.accountJournalEntry.deleteMany({ where: { id: { in: allE } } }));
    }
    await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, module: "giftcard" } }));
    await d(() => P.giftCardTxn.deleteMany({ where: { giftCardId: { in: cardIds } } }));
    await d(() => P.giftCard.deleteMany({ where: { id: { in: cardIds } } }));
  }
  const saleIds = [...new Set([...made.sales, ...newCards.map((c: Any) => c.saleId).filter(Boolean)])];
  const extraSales = await P.posSale.findMany({ where: { tenantId: tid, giftCardId: { in: cardIds.length ? cardIds : ["-"] } }, select: { id: true } }).catch(() => [] as Any[]);
  for (const s of extraSales) saleIds.push(s.id);
  if (saleIds.length) { await d(() => P.posPayment.deleteMany({ where: { saleId: { in: saleIds } } })); await d(() => P.posSaleLine.deleteMany({ where: { saleId: { in: saleIds } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: saleIds } } })); }
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["giftcard.", "pos.sale.", "member.", "point."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.6: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
