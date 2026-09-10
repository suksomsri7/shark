// QC — ระบบสมาชิก v2 WO M2.10: REST/AI ชุดสอง — ops MEMBER-API §2.6–2.12 (points 14 · stamps 8 · rewards 9 · wallet 3 · vouchers 11 · coupons 6 · giftcards 9) + me.* (wallet/transfer/redeem/vouchers/stamps/giftcards) ≈ 66 op · idempotency ทุก write · CUSTOMER session ผ่าน REST (token จาก M2.9 เป็น Bearer) · tools propose ทุก write · webhook events M2 · docs/skill regen · curl จริงบน QC server · rate class
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M2.10 · MEMBER-API (ร่างเดิม git HEAD~ §2.6–2.12 · ปัจจุบันถูก generator ทับ — ให้ยึด id/path/scope/class ในหัวไฟล์นี้) · พิมพ์เขียว §7.1 (events M2) §9.7 · M1.11 wo-notes (โครง registry/ops/tools)
// requires: member-seed
//
// สัญญา (เพิ่มไฟล์ src/lib/modules/member/api/ops/{points,stamps,rewards,wallet,vouchers,coupons,giftcards}.ts + ขยาย ops/me.ts · ต่อเข้า MEMBER_OPS · ทุก op เรียก facade ของโมดูล (point/stamp/reward/voucher/coupon/giftcard/member) ห้ามยิง prisma เอง)
//   op id (method path · scope · kind):
//     points.balance GET /members/{id}/points (point.read read) · points.ledger GET /members/{id}/points/ledger · points.quoteEarn POST /points/quote-earn (read) · points.quoteBurn POST /points/quote-burn (read) · points.credit POST /members/{id}/points/credit (point.adjust write · เกินเพดาน → APPROVAL_REQUIRED shape {pending, approvalRequestId}) · points.adjust POST /members/{id}/points/adjust (danger · confirm) · points.transfer POST /members/{id}/points/transfer (CUSTOMER ตนเอง + otp · write) · points.reverse POST /points/reverse (write) · points.expiring GET /points/expiring (report) · points.rules.list/upsert/toggle (settings.manage) · points.settings.get/set (settings.manage)
//     stamps.cards.list/create/update/toggle (/stamps/cards · loyalty.manage · list = loyalty.read) · stamps.progress GET /members/{id}/stamps · stamps.add POST /members/{id}/stamps (loyalty.stamp write) · stamps.void POST /stamps/events/{id}/void · stamps.stats GET /stamps/cards/{id}/stats
//     rewards.list/create/update/toggle (/rewards) · rewards.redeem POST /members/{id}/rewards/redeem (loyalty.read write) · rewards.redemptions.list GET /rewards/redemptions · rewards.redemptions.lookup GET /rewards/redemptions/lookup?code= (loyalty.fulfil) · rewards.fulfil POST /rewards/redemptions/{id}/fulfil · rewards.cancel POST /rewards/redemptions/{id}/cancel
//     wallet.get GET /members/{id}/wallet (customer.read) · wallet.quote POST /members/{id}/wallet/quote (read · operate) · wallet.apply POST /members/{id}/wallet/apply (write)
//     vouchers.templates.list/create/update/toggle (/vouchers/templates · promo.manage) · vouchers.list GET /vouchers · vouchers.forMember GET /members/{id}/vouchers · vouchers.issue POST /vouchers (promo.issue · เกินเพดาน → {pending, approvalRequestId, batchId}) · vouchers.validate POST /vouchers/validate (read) · vouchers.redeem POST /vouchers/{id}/redeem · vouchers.release POST /vouchers/{id}/release · vouchers.cancel POST /vouchers/{id}/cancel (promo.manage)
//     coupons.list/create/update/toggle (/coupons · promo.manage) · coupons.validate POST /coupons/validate (read) · coupons.issuePerMember POST /coupons/{id}/per-member · coupons.saveToWallet POST /members/{id}/coupons
//     giftcards.list GET /giftcards (giftcard.manage) · giftcards.sell POST /giftcards (giftcard.sell) · giftcards.balance GET /giftcards/{number}/balance · giftcards.use POST /giftcards/{number}/use · giftcards.reload POST /giftcards/{number}/reload · giftcards.transfer POST /giftcards/{number}/transfer · giftcards.suspend POST /giftcards/{number}/suspend · giftcards.settings.get/set (/giftcards/settings)
//     me.wallet GET /me/wallet · me.vouchers GET /me/vouchers · me.stamps GET /me/stamps · me.giftcards GET /me/giftcards · me.redeem POST /me/rewards/redeem {rewardId} · me.transfer POST /me/points/transfer {toCustomerId, points, otp} · (me.get/update/card ของ M1.11 เปิดทำงานจริง)
//   session ลูกค้าผ่าน REST: `Authorization: Bearer <token ของ mintCustomerSession/verifyOtp>` (token ขึ้นต้น "cs_") → actor CUSTOMER {customerId} · เรียก op ที่ไม่ใช่ /me หรือของคนอื่น → 403 customer_scope (ข้อความไทย) · คีย์ร้านเรียก /me → 401 customer_session_required (เดิม)
//   write ทุก op: ไม่มี Idempotency-Key → 400 idempotency_key_required · คีย์เดิม+body เดิม → คำตอบเดิม (ไม่เขียนซ้ำ) · คีย์เดิม+body ต่าง → 409 idempotency_conflict (ยกเว้น op ที่ประกาศ idempotency: "key")
//   tools: `member_*` เพิ่มจาก op ที่ tool: true — อย่างน้อย member_points_credit member_stamps_add member_vouchers_issue member_rewards_redeem member_giftcards_sell (write → propose) · member_wallet_quote member_points_balance (read → รันทันที) · สกิล members ครบ (F13.9)
//   webhook events (memberWebhookEvents + WEBHOOK_EVENTS): point.earned point.burned point.expiring point.expired point.transferred stamp.added stamp.completed reward.redeemed reward.fulfilled voucher.issued voucher.used voucher.expiring voucher.expired giftcard.sold giftcard.used
//   docs: `pnpm exec tsx scripts/gen-member-api-docs.mts --check` exit 0 · SKILL.md เพิ่ม recipes loyalty/wallet ≥ 4 · /developers/member แสดง section ใหม่
//   rate class: report ops (points.expiring · stamps.stats · rewards.redemptions.list · vouchers.list · giftcards.list) → X-RateLimit-Limit 60 · read/write 600
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
if (!existsSync("src/lib/modules/member/api/ops/points.ts") || !existsSync("src/lib/modules/member/api/ops/wallet.ts") || !existsSync("src/lib/modules/member/api/ops/giftcards.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (member/api/ops/{points,wallet,giftcards}.ts)");
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
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = ""; let PT = "";
const tag = Date.now().toString(36);
const keyIds: string[] = [];
const before = { vouchers: new Set<string>(), templates: new Set<string>(), cards: new Set<string>(), gcards: new Set<string>(), rewards: new Set<string>(), coupons: new Set<string>() };
const made = { customers: [] as string[], ledgerKeys: [] as string[], sessions: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string;
  for (const [k, model] of [["vouchers", "voucher"], ["templates", "voucherTemplate"], ["cards", "stampCard"], ["gcards", "giftCard"], ["rewards", "reward"], ["coupons", "coupon"]] as const) for (const r of await P[model].findMany({ where: { tenantId: tid }, select: { id: true } }).catch(() => [])) (before as Any)[k].add(r.id);
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const reg = (await import("@/lib/modules/member/api/registry" as string)) as { MEMBER_OPS: Any[] };
  const ops = reg.MEMBER_OPS; const ids = ops.map((o) => o.id);
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/member/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const G = (await import("@/lib/modules/giftcard" as string)) as Record<string, (...a: Any[]) => Any>;
  const CS = (await import("@/lib/modules/member/customer-session" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const pctx = { tenantId: tid, systemId: PT, memberSystemId: SYS, actorUserId: E.users.owner.userId as string };
  const gctx = { tenantId: tid, systemId: SYS, posSystemId: scope.systems.POS as string, actorUserId: E.users.owner.userId as string };
  const mkKey = async (bundle: string) => { const k = await ak.createApiKey({ tenantId: tid }, `QC M2.10 ${bundle} ${tag}`, { scopes: scopes.expandBundles([bundle]), systemId: SYS }); keyIds.push(k.id); return k.rawKey as string; };
  const kRead = await mkKey("member-read"); const kOp = await mkKey("member-operate"); const kAdmin = await mkKey("member-admin");
  const call = async (method: string, path: string, key: string | null, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(method === "GET" || extra["idempotency-key"] === "" ? {} : { "idempotency-key": `m210-${Date.now()}-${Math.random().toString(16).slice(2)}` }), ...extra };
    if (extra["idempotency-key"] === "") delete headers["idempotency-key"];
    let b: string | undefined; if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const res = await route[method]!(new Request(`http://x/api/v1/member${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = await res.text(); let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed, headers: res.headers };
  };
  const mkCust = async (nm: string) => { const c = await PR.createMember(ctx as Any, owner, { phone: `0899${String((Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000).padStart(6, "0")}`, firstName: nm, lastName: "API", source: "API", homeUnitId: E.units.patong }); made.customers.push(c.customerId); return c.customerId as string; };
  const X = await mkCust("เอพีไอ");
  const gs0 = await G.getSettings(gctx); restore.push(() => G.setSettings(gctx, owner, gs0));
  await G.setSettings(gctx, owner, { enabled: true, accountingLink: false });
  const bal = (cid: string) => PS.getBalance(PT, cid);

  // ═══ S1 ทะเบียน ═══
  const MUST = ["points.balance", "points.ledger", "points.quoteEarn", "points.quoteBurn", "points.credit", "points.adjust", "points.transfer", "points.reverse", "points.expiring", "points.rules.list", "points.rules.upsert", "points.rules.toggle", "points.settings.get", "points.settings.set", "stamps.cards.list", "stamps.cards.create", "stamps.cards.update", "stamps.cards.toggle", "stamps.progress", "stamps.add", "stamps.void", "stamps.stats", "rewards.list", "rewards.create", "rewards.update", "rewards.toggle", "rewards.redeem", "rewards.redemptions.list", "rewards.redemptions.lookup", "rewards.fulfil", "rewards.cancel", "wallet.get", "wallet.quote", "wallet.apply", "vouchers.templates.list", "vouchers.templates.create", "vouchers.templates.update", "vouchers.templates.toggle", "vouchers.list", "vouchers.forMember", "vouchers.issue", "vouchers.validate", "vouchers.redeem", "vouchers.release", "vouchers.cancel", "coupons.list", "coupons.create", "coupons.update", "coupons.toggle", "coupons.validate", "coupons.issuePerMember", "coupons.saveToWallet", "giftcards.list", "giftcards.sell", "giftcards.balance", "giftcards.use", "giftcards.reload", "giftcards.transfer", "giftcards.suspend", "giftcards.settings.get", "giftcards.settings.set", "me.wallet", "me.vouchers", "me.stamps", "me.giftcards", "me.redeem", "me.transfer"];
  const missing = MUST.filter((x) => !ids.includes(x));
  const dupIds = ids.filter((x, i) => ids.indexOf(x) !== i);
  const byId = (id: string) => ops.find((o) => o.id === id);
  chk("M2.10-S1.1", `ทะเบียน MEMBER_OPS ≥ 130 (มี ${ops.length}) · op ชุดสอง ${MUST.length} ตัวครบ · id ไม่ซ้ำ · points.adjust kind danger · wallet.quote/vouchers.validate/coupons.validate/points.quoteEarn kind read แม้ POST · ทุก op มี test id · op ไม่ยิง prisma เอง (ops/*.ts ไม่ import @/lib/core/db)`,
    ops.length >= 130 && missing.length === 0 && dupIds.length === 0 && byId("points.adjust")?.kind === "danger" && ["wallet.quote", "vouchers.validate", "coupons.validate", "points.quoteEarn"].every((x) => byId(x)?.kind === "read") && ops.every((o) => /^M\d+\.\d+-S/.test(o.test ?? "")) && !["points", "stamps", "rewards", "wallet", "vouchers", "coupons", "giftcards", "me"].some((f) => /@\/lib\/core\/db/.test(read(`src/lib/modules/member/api/ops/${f}.ts`))),
    "ครบ", `n=${ops.length} missing=${missing.join(",") || "-"} dup=${dupIds.join(",") || "-"} adjust=${byId("points.adjust")?.kind} prisma=${["points", "stamps", "rewards", "wallet", "vouchers", "coupons", "giftcards", "me"].filter((f) => /@\/lib\/core\/db/.test(read(`src/lib/modules/member/api/ops/${f}.ts`))).join(",") || "-"}`);

  const gen = spawnSync("pnpm", ["exec", "tsx", "scripts/gen-member-api-docs.mts", "--check"], { encoding: "utf8", env: process.env, timeout: 300_000 });
  const oa = (await import("@/lib/modules/member/api/openapi" as string)) as Any;
  const evs: string[] = (oa.memberWebhookEvents?.() ?? []).map((e: Any) => (typeof e === "string" ? e : e.value));
  const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const M2EV = ["point.earned", "point.burned", "point.expiring", "point.expired", "point.transferred", "stamp.added", "stamp.completed", "reward.redeemed", "reward.fulfilled", "voucher.issued", "voucher.used", "voucher.expiring", "voucher.expired", "giftcard.sold", "giftcard.used"];
  const skill = read(".claude/skills/shark-member-api/SKILL.md");
  chk("M2.10-S1.2", "gen-member-api-docs --check exit 0 (docs + endpoints.md ไม่ stale) · webhook events M2 15 ตัวอยู่ใน memberWebhookEvents และ WEBHOOK_EVENTS · SKILL.md มี recipes points/stamps/wallet/vouchers/giftcards (curl ≥ 4 เส้นชุดสอง)",
    gen.status === 0 && M2EV.every((e) => evs.includes(e) && W2.WEBHOOK_EVENTS.some((x: Any) => x.value === e)) && ["/points", "/stamps", "/wallet", "/vouchers", "/giftcards"].filter((p) => skill.includes(p)).length >= 4,
    "docs/events/skill", `gen=${gen.status} ev-missing=${M2EV.filter((e) => !evs.includes(e)).join(",") || "-"} skill=${["/points", "/stamps", "/wallet", "/vouchers", "/giftcards"].filter((p) => skill.includes(p)).length}`);

  // ═══ S2 idempotency ทุก write ═══
  const ik = `m210-idem-${tag}`;
  const c1 = await call("POST", `/members/${X}/points/credit`, kAdmin, { points: 120, reason: "ชดเชย QC" }, { "idempotency-key": `${ik}-credit` });
  const c2 = await call("POST", `/members/${X}/points/credit`, kAdmin, { points: 120, reason: "ชดเชย QC" }, { "idempotency-key": `${ik}-credit` });
  const c3 = await call("POST", `/members/${X}/points/credit`, kAdmin, { points: 999, reason: "อื่น" }, { "idempotency-key": `${ik}-credit` });
  const cNoKey = await call("POST", `/members/${X}/points/credit`, kAdmin, { points: 10, reason: "x" }, { "idempotency-key": "" });
  made.ledgerKeys.push(`${ik}-credit`);
  chk("M2.10-S2.1", "points.credit +120 (admin) → 200 {ledgerId, balance 120} · คีย์เดิม+body เดิม → 200 คำตอบเดิม (ledgerId เดิม · balance ยัง 120) · คีย์เดิม+body ต่าง → 409 idempotency_conflict · ไม่มีคีย์ → 400 idempotency_key_required",
    c1.status === 200 && !!c1.body?.data?.ledgerId && c2.status === 200 && c2.body?.data?.ledgerId === c1.body.data.ledgerId && (await bal(X)) === 120 && c3.status === 409 && /idempotency_conflict/.test(JSON.stringify(c3.body)) && cNoKey.status === 400,
    "200/200/409/400", `${c1.status}/${c2.status}/${c3.status}/${cNoKey.status} bal=${await bal(X)} c1=${JSON.stringify(c1.body).slice(0, 160)}`);

  const ST = (await import("@/lib/modules/stamp" as string)) as Record<string, (...a: Any[]) => Any>;
  const card = await ST.createCard(ctx, owner, { name: `API stamp ${tag}`, slots: 5, ruleKind: "MANUAL", ruleConfig: { perDayMax: 10 }, rewardKind: "POINTS", rewardConfig: { points: 5 }, autoRestart: true, tierDefIds: [], unitIds: [] });
  const s1 = await call("POST", `/members/${X}/stamps`, kOp, { cardId: card.id, count: 1 }, { "idempotency-key": `${ik}-stamp` });
  const s2 = await call("POST", `/members/${X}/stamps`, kOp, { cardId: card.id, count: 1 }, { "idempotency-key": `${ik}-stamp` });
  const prog = await P.stampCardProgress.findFirst({ where: { cardId: card.id, customerId: X } });
  const sRead = await call("POST", `/members/${X}/stamps`, kRead, { cardId: card.id }, {});
  chk("M2.10-S2.2", "stamps.add (operate) → 200 {stamps 1, eventId} · ซ้ำคีย์เดิม → eventId เดิม stamps ยัง 1 · คีย์ read → 403 scope_missing",
    s1.status === 200 && s1.body?.data?.stamps === 1 && !!s1.body.data.eventId && s2.status === 200 && s2.body?.data?.eventId === s1.body.data.eventId && prog?.stamps === 1 && sRead.status === 403,
    "1 ตรา", `${s1.status}/${s2.status}/${sRead.status} stamps=${prog?.stamps} same=${s2.body?.data?.eventId === s1.body?.data?.eventId}`);

  const v1 = await call("POST", "/vouchers", kOp, { customerIds: [X], adhoc: { kind: "FIXED", value: 5_000, config: {}, validDays: 7 }, origin: "API", reason: "QC" }, { "idempotency-key": `${ik}-issue` });
  const v2 = await call("POST", "/vouchers", kOp, { customerIds: [X], adhoc: { kind: "FIXED", value: 5_000, config: {}, validDays: 7 }, origin: "API", reason: "QC" }, { "idempotency-key": `${ik}-issue` });
  const nV = await P.voucher.count({ where: { customerId: X } });
  chk("M2.10-S2.3", "vouchers.issue (operate · adhoc ฿50 · origin API) → 200 {issued 1, vouchers[1]{id, code}} · ซ้ำคีย์ → คำตอบเดิม · ใบของ X ยัง 1",
    v1.status === 200 && v1.body?.data?.issued === 1 && /^V-/.test(v1.body.data.vouchers?.[0]?.code ?? "") && v2.status === 200 && v2.body?.data?.vouchers?.[0]?.id === v1.body.data.vouchers[0].id && nV === 1,
    "1 ใบ", `${v1.status}/${v2.status} n=${nV} v1=${JSON.stringify(v1.body).slice(0, 160)}`);

  const g1 = await call("POST", "/giftcards", kOp, { satang: 50_000, buyerCustomerId: X, recipient: { customerId: X }, payMethods: [{ type: "CASH", amountSatang: 50_000 }], unitId: E.units.patong }, { "idempotency-key": `${ik}-gc` });
  const g2 = await call("POST", "/giftcards", kOp, { satang: 50_000, buyerCustomerId: X, recipient: { customerId: X }, payMethods: [{ type: "CASH", amountSatang: 50_000 }], unitId: E.units.patong }, { "idempotency-key": `${ik}-gc` });
  const gRead = await call("POST", "/giftcards", kRead, { satang: 1_000, recipient: { print: true }, payMethods: [{ type: "CASH", amountSatang: 1_000 }], unitId: E.units.patong });
  chk("M2.10-S2.4", "giftcards.sell (operate) → 200 {giftCardId, number GC-, pin 6 หลัก (ครั้งเดียว)} · ซ้ำคีย์ → giftCardId เดิม pin null · คีย์ read → 403",
    g1.status === 200 && /^GC-\d{8}$/.test(g1.body?.data?.number ?? "") && /^\d{6}$/.test(g1.body?.data?.pin ?? "") && g2.status === 200 && g2.body?.data?.giftCardId === g1.body.data.giftCardId && (g2.body.data.pin === null || g2.body.data.pin === undefined) && gRead.status === 403,
    "บัตร 1 ใบ", `${g1.status}/${g2.status}/${gRead.status} n=${g1.body?.data?.number} pin2=${g2.body?.data?.pin}`);

  const RV = (await import("@/lib/modules/reward" as string)) as Record<string, (...a: Any[]) => Any>;
  const rctx = { tenantId: tid, systemId: scope.systems.REWARD as string, memberSystemId: SYS, pointSystemId: PT, actorUserId: E.users.owner.userId as string };
  const rw = await RV.createRewardV2(rctx, owner, { name: `API reward ${tag}`, kind: "ITEM", pointsCost: 50, stock: 3, tierDefIds: [], unitIds: [], pickupDays: 14, showToCustomer: true });
  const r1 = await call("POST", `/members/${X}/rewards/redeem`, kOp, { rewardId: rw.id }, { "idempotency-key": `${ik}-redeem` });
  const r2 = await call("POST", `/members/${X}/rewards/redeem`, kOp, { rewardId: rw.id }, { "idempotency-key": `${ik}-redeem` });
  const r3 = await call("POST", `/members/${X}/rewards/redeem`, kOp, { rewardId: "no-such" }, { "idempotency-key": `${ik}-redeem` });
  chk("M2.10-S2.5", "rewards.redeem (operate · 50 แต้ม) → 200 {redemptionId, qrCode, expiresAt} · แต้ม 120 → 70 · ซ้ำคีย์ → redemptionId เดิม (แต้มยัง 70) · คีย์เดิม body ต่าง → 409",
    r1.status === 200 && !!r1.body?.data?.redemptionId && !!r1.body.data.qrCode && r2.status === 200 && r2.body?.data?.redemptionId === r1.body.data.redemptionId && (await bal(X)) === 70 && r3.status === 409,
    "แลกครั้งเดียว", `${r1.status}/${r2.status}/${r3.status} bal=${await bal(X)} r1=${JSON.stringify(r1.body).slice(0, 140)}`);

  // ═══ S3 CUSTOMER session ผ่าน REST ═══
  const sess = await CS.mintCustomerSession(X, { userAgent: "qc-api" }); made.sessions.push(sess.token);
  const me = await call("GET", "/me", sess.token);
  const meCard = await call("GET", "/me/card", sess.token);
  const meUp = await call("PATCH", "/me", sess.token, { fields: { nickname: "เอพี" } });
  chk("M2.10-S3.1", "Bearer <customer token> → GET /me 200 {member{customerId X, memberCode}, sections[], consents[]} · GET /me/card 200 {qr{content SHARK-MC:}} · PATCH /me {nickname} 200 {updated ['nickname']} (ฟิลด์ที่ร้านเปิดให้แก้)",
    me.status === 200 && me.body?.data?.member?.customerId === X && Array.isArray(me.body.data.sections) && meCard.status === 200 && /^SHARK-MC:/.test(meCard.body?.data?.qr?.content ?? "") && meUp.status === 200 && JSON.stringify(meUp.body?.data?.updated) === JSON.stringify(["nickname"]),
    "me.* ทำงาน", `${me.status}/${meCard.status}/${meUp.status} me=${JSON.stringify(me.body).slice(0, 120)} up=${JSON.stringify(meUp.body).slice(0, 100)}`);

  const meW = await call("GET", "/me/wallet", sess.token);
  const meV = await call("GET", "/me/vouchers", sess.token);
  const meRd = await call("POST", "/me/rewards/redeem", sess.token, { rewardId: rw.id });
  const meGc = await call("GET", "/me/giftcards", sess.token);
  chk("M2.10-S3.2", "GET /me/wallet → 200 {points{balance}, vouchers[1], giftCards[1], rewardsPending[≥1], stamps[1]} · GET /me/vouchers → 1 · POST /me/rewards/redeem (แต้ม 70 ≥ 50) → 200 redemption ใหม่ (balance 20) · GET /me/giftcards → 1 ใบ เลขปิดบัง ไม่มี pin",
    meW.status === 200 && typeof meW.body?.data?.points?.balance === "number" && meW.body.data.vouchers?.length === 1 && meW.body.data.giftCards?.length === 1 && (meW.body.data.rewardsPending?.length ?? 0) >= 1 && meW.body.data.stamps?.length === 1 && meV.status === 200 && (meV.body?.data?.items?.length ?? meV.body?.data?.length) === 1 && meRd.status === 200 && !!meRd.body?.data?.redemptionId && (await bal(X)) === 20 && meGc.status === 200 && /GC-\*{4}/.test(JSON.stringify(meGc.body)) && !/pinHash|"pin"/.test(JSON.stringify(meGc.body)),
    "wallet ลูกค้า", `${meW.status}/${meV.status}/${meRd.status}/${meGc.status} bal=${await bal(X)} w=${JSON.stringify(meW.body).slice(0, 160)}`);

  const custOther = await call("GET", `/members/${m(1).id}/points`, sess.token);
  const custList = await call("GET", "/members", sess.token);
  const keyMe = await call("GET", "/me", kOp);
  const badTok = await call("GET", "/me", "cs_not-a-real-token");
  chk("M2.10-S3.3", "token ลูกค้าเรียก op ของร้าน (GET /members/{คนอื่น}/points · GET /members) → 403 customer_scope ข้อความไทย · คีย์ร้านเรียก /me → 401 customer_session_required · token มั่ว → 401",
    custOther.status === 403 && /customer_scope/.test(JSON.stringify(custOther.body)) && /[ก-๙]/.test(JSON.stringify(custOther.body)) && custList.status === 403 && keyMe.status === 401 && /customer_session_required/.test(JSON.stringify(keyMe.body)) && badTok.status === 401,
    "403/403/401/401", `${custOther.status}/${custList.status}/${keyMe.status}/${badTok.status} other=${JSON.stringify(custOther.body).slice(0, 120)}`);

  // ═══ S4 tools propose ═══
  const tools = (await import("@/lib/modules/member/api/tools" as string)) as Record<string, (...a: Any[]) => Any>;
  const names: string[] = tools.memberToolNames?.() ?? [];
  const mem = (await prisma.membership.findFirst({ where: { tenantId: tid, userId: E.users.owner.userId } }))!;
  const toolCtx = { tenantId: tid, systemId: SYS, userId: E.users.owner.userId, membershipId: mem.id, role: "OWNER", unitAccess: ["*"], permissions: { "member.*": true } };
  const tryTool = async (name: string, args: Any) => { try { return await tools.runMemberTool(toolCtx, name, args); } catch (e) { return { error: String((e as Error)?.message ?? e) }; } };
  const balPre = await bal(X);
  const t1 = await tryTool("member_points_credit", { customerId: X, points: 30, reason: "ทดสอบ tool" });
  chk("M2.10-S4.1", "tool member_points_credit (write) → mode propose {kind member.points.credit, summary ไทย, payload} ไม่เขียน DB (แต้มเท่าเดิม) · ชื่อ tool อยู่ใน memberToolNames",
    names.includes("member_points_credit") && t1?.mode === "propose" && /member\.points\.credit/.test(t1.kind ?? "") && /[ก-๙]/.test(t1.summary ?? "") && (await bal(X)) === balPre, "propose", `names=${names.includes("member_points_credit")} t1=${JSON.stringify(t1).slice(0, 160)} bal=${await bal(X)}/${balPre}`);
  const t2 = await tryTool("member_stamps_add", { customerId: X, cardId: card.id, count: 1 });
  chk("M2.10-S4.2", "tool member_stamps_add → propose (สแตมป์ยัง 1)", t2?.mode === "propose" && (await P.stampCardProgress.findFirst({ where: { cardId: card.id, customerId: X } }))?.stamps === 1, "propose", JSON.stringify(t2).slice(0, 160));
  const t3 = await tryTool("member_vouchers_issue", { customerIds: [X], adhoc: { kind: "FIXED", value: 1_000, config: {}, validDays: 3 }, origin: "MANUAL", reason: "tool" });
  chk("M2.10-S4.3", "tool member_vouchers_issue → propose (ใบของ X ยัง 1)", t3?.mode === "propose" && (await P.voucher.count({ where: { customerId: X } })) === 1, "propose", JSON.stringify(t3).slice(0, 160));
  const t4 = await tryTool("member_rewards_redeem", { customerId: X, rewardId: rw.id });
  const t5 = await tryTool("member_giftcards_sell", { satang: 10_000, recipient: { print: true }, payMethods: [{ type: "CASH", amountSatang: 10_000 }], unitId: E.units.patong });
  chk("M2.10-S4.4", "tool member_rewards_redeem / member_giftcards_sell → propose ทั้งคู่ (ไม่มี redemption/บัตรเพิ่ม)", t4?.mode === "propose" && t5?.mode === "propose" && (await P.rewardRedemption.count({ where: { customerId: X } })) === 2 && (await P.giftCard.count({ where: { tenantId: tid, id: { notIn: [...before.gcards] } } })) === 1, "propose ×2", `${JSON.stringify(t4).slice(0, 100)} | ${JSON.stringify(t5).slice(0, 100)}`);
  const t6 = await tryTool("member_wallet_quote", { customerId: X, cart: { unitId: E.units.patong, lines: [{ name: "คอร์ส", qty: 1, unitPriceSatang: 200_000 }] }, choices: { points: 20 } });
  const t7 = await tryTool("member_points_balance", { customerId: X });
  chk("M2.10-S4.5", "tool อ่าน: member_wallet_quote → mode read result {order, lines, netSatang} · member_points_balance → {balance 20} (รันทันที ไม่ propose)",
    t6?.mode === "read" && Array.isArray(t6.result?.order) && typeof t6.result?.netSatang === "number" && t7?.mode === "read" && t7.result?.balance === 20, "read", `q=${JSON.stringify(t6).slice(0, 140)} b=${JSON.stringify(t7).slice(0, 100)}`);
  const applied = await tools.dispatchMemberKind(toolCtx, t1.kind, t1.payload);
  const balPost = await bal(X);
  chk("M2.10-S4.6", "ยืนยัน proposal (dispatchMemberKind ด้วย OWNER จริง) → member.points.credit ทำงาน แต้ม +30 (= 50) · dispatch ซ้ำ payload เดิม → ไม่บวกซ้ำ (idempotencyKey จาก proposal)",
    !!applied && balPost === balPre + 30 && (await tools.dispatchMemberKind(toolCtx, t1.kind, t1.payload), (await bal(X)) === balPre + 30), "+30 ครั้งเดียว", `applied=${JSON.stringify(applied).slice(0, 100)} bal=${balPost}/${balPre + 30} again=${await bal(X)}`);

  // ═══ S5 curl จริงบน QC server ═══
  const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
  const up = await fetch(`${BASE}/api/v1/member/ping`, { headers: { authorization: `Bearer ${kRead}` } }).then((r) => r.status).catch(() => 0);
  const http = async (method: string, path: string, key: string, body?: unknown) => { const r = await fetch(`${BASE}/api/v1/member${path}`, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": `m210-http-${Date.now()}-${Math.random().toString(16).slice(2)}` }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null); if (!r) return { status: 0, body: null as Any, headers: new Headers() }; let b: Any = null; try { b = await r.json(); } catch { /* ignore */ } return { status: r.status, body: b, headers: r.headers }; };
  const h1 = await http("GET", `/members/${X}/points`, kRead);
  const h2 = await http("POST", "/points/quote-earn", kRead, { customerId: X, cart: { lines: [{ name: "คอร์ส", qty: 1, netSatang: 250_000 }], netSatang: 250_000 } });
  chk("M2.10-S5.1", "QC server (:3215) GET /members/{id}/points → 200 {balance 50, lots[], expiringSoon[]} · POST /points/quote-earn → 200 {points ≥ 1, breakdown[]} (server ต้องขึ้น — Fable รันหลัง build)",
    up === 200 && h1.status === 200 && h1.body?.data?.balance === 50 && Array.isArray(h1.body.data.lots) && h2.status === 200 && (h2.body?.data?.points ?? 0) >= 1 && Array.isArray(h2.body.data.breakdown), "200 ×2", `up=${up} h1=${h1.status}/${JSON.stringify(h1.body).slice(0, 100)} h2=${h2.status}/${JSON.stringify(h2.body).slice(0, 100)}`);
  const h3 = await http("GET", `/members/${X}/wallet`, kOp);
  const h4 = await http("POST", "/vouchers/validate", kRead, { customerId: X, voucherId: v1.body?.data?.vouchers?.[0]?.id, cart: { lines: [{ name: "x", qty: 1, netSatang: 200_000 }], netSatang: 200_000 } });
  chk("M2.10-S5.2", "GET /members/{id}/wallet → 200 DTO (points/vouchers/giftCards/rewardsPending/stamps/tierBenefits) · POST /vouchers/validate (ใบ ฿50 ของ X · ตะกร้า ฿2,000) → 200 {ok true, discountSatang 5000}",
    h3.status === 200 && ["points", "vouchers", "giftCards", "rewardsPending", "stamps", "tierBenefits"].every((k) => k in (h3.body?.data ?? {})) && h4.status === 200 && h4.body?.data?.ok === true && h4.body.data.discountSatang === 5_000, "200 ×2", `h3=${h3.status}/${Object.keys(h3.body?.data ?? {}).join(",")} h4=${h4.status}/${JSON.stringify(h4.body).slice(0, 100)}`);
  const h5 = await http("GET", `/giftcards/${g1.body?.data?.number}/balance`, kOp);
  const h6 = await http("GET", `/members/${X}/stamps`, kRead);
  const h7 = await fetch(`${BASE}/api/v1/member/me/wallet`, { headers: { authorization: `Bearer ${sess.token}` } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch(() => ({ status: 0, body: null as Any }));
  chk("M2.10-S5.3", "GET /giftcards/{number}/balance → 200 {balanceSatang 50000, status ACTIVE} · GET /members/{id}/stamps → 200 [{cardId, stamps 1, slots 5}] · Bearer token ลูกค้าผ่าน HTTP จริง GET /me/wallet → 200",
    h5.status === 200 && h5.body?.data?.balanceSatang === 50_000 && h5.body.data.status === "ACTIVE" && h6.status === 200 && (h6.body?.data?.items ?? h6.body?.data)?.some?.((s: Any) => s.cardId === card.id && s.stamps === 1) && h7.status === 200 && typeof h7.body?.data?.points?.balance === "number", "200 ×3", `h5=${h5.status}/${JSON.stringify(h5.body).slice(0, 80)} h6=${h6.status} h7=${h7.status}`);

  // ═══ S6 rate class ═══
  const rep = await call("GET", "/points/expiring?days=30", kRead);
  const rd = await call("GET", `/members/${X}/points`, kRead);
  chk("M2.10-S6.1", "rate class: GET /points/expiring (report) X-RateLimit-Limit 60 · GET /members/{id}/points (read) 600 · ทั้งคู่มี X-RateLimit-Remaining",
    rep.status === 200 && rep.headers.get("x-ratelimit-limit") === "60" && rd.headers.get("x-ratelimit-limit") === "600" && !!rep.headers.get("x-ratelimit-remaining") && !!rd.headers.get("x-ratelimit-remaining"), "60/600", `rep=${rep.status}/${rep.headers.get("x-ratelimit-limit")} rd=${rd.headers.get("x-ratelimit-limit")}`);
} catch (e) {
  console.error("💥", e);
  chk("M2.10-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const id of keyIds) await d(() => P.apiKey.delete({ where: { id } }));
  await d(() => P.customerSession.deleteMany({ where: { tenantId: tid, userAgent: "qc-api" } }));
  await d(() => P.apiIdempotency?.deleteMany?.({ where: { tenantId: tid, key: { startsWith: "m210-" } } }));
  const newG = await P.giftCard.findMany({ where: { tenantId: tid, id: { notIn: [...before.gcards] } }, select: { id: true, saleId: true } }).catch(() => [] as Any[]);
  if (newG.length) { const gids = newG.map((g: Any) => g.id); await d(() => P.giftCardTxn.deleteMany({ where: { giftCardId: { in: gids } } })); await d(() => P.giftCard.deleteMany({ where: { id: { in: gids } } })); const sids = newG.map((g: Any) => g.saleId).filter(Boolean); if (sids.length) { await d(() => P.posPayment.deleteMany({ where: { saleId: { in: sids } } })); await d(() => P.posSaleLine.deleteMany({ where: { saleId: { in: sids } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: sids } } })); } }
  const newR = await prisma.reward.findMany({ where: { tenantId: tid, id: { notIn: [...before.rewards] } }, select: { id: true } }).catch(() => [] as Any[]);
  if (newR.length) { const reds = await P.rewardRedemption.findMany({ where: { rewardId: { in: newR.map((r: Any) => r.id) } }, select: { id: true } }); const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, refId: { in: reds.map((r: Any) => r.id) } }, select: { id: true } }); await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } })); await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } })); await d(() => P.rewardRedemption.deleteMany({ where: { id: { in: reds.map((r: Any) => r.id) } } })); await d(() => prisma.reward.deleteMany({ where: { id: { in: newR.map((r: Any) => r.id) } } })); }
  const newC = await P.stampCard.findMany({ where: { tenantId: tid, id: { notIn: [...before.cards] } }, select: { id: true } }).catch(() => [] as Any[]);
  if (newC.length) { const progs = await P.stampCardProgress.findMany({ where: { cardId: { in: newC.map((c: Any) => c.id) } }, select: { id: true } }); await d(() => P.stampEvent.deleteMany({ where: { progressId: { in: progs.map((p: Any) => p.id) } } })); await d(() => P.stampCardProgress.deleteMany({ where: { id: { in: progs.map((p: Any) => p.id) } } })); await d(() => P.stampCard.deleteMany({ where: { id: { in: newC.map((c: Any) => c.id) } } })); }
  await d(() => P.voucher.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.vouchers] } } }));
  await d(() => P.voucherTemplate.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.templates] } } }));
  await d(() => P.coupon.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.coupons] } } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["customerSession", "voucher", "rewardRedemption", "stampCardProgress", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  await d(() => P.aiProposal?.deleteMany?.({ where: { tenantId: tid, kind: { startsWith: "member." } } }));
  for (const t of ["point.", "stamp.", "reward.", "voucher.", "giftcard.", "member."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.10: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
