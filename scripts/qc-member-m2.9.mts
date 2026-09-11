// QC — ระบบสมาชิก v2 WO M2.9: ฝั่งลูกค้า `/m/*` — session ลูกค้า (OTP เบอร์/อีเมล + LINE login) แยกจาก session พนักงาน · ตรวจเจ้าของทุก op · บัตร QR token หมุน 24 ชม. + พนักงาน lookup · me.get/update (เฉพาะ customerEditable) · consent/PDPA จากลูกค้า · หน้า /m/<slug>/{login,card,wallet,profile,history} (ภาพ 09 · LIFF + WebView แอป ใช้ URL เดียวกัน D4) · rate limit OTP
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M2.9 · พิมพ์เขียว §3.10 §6.3 §11.8 (session แยก · QR token · rate limit) · MEMBER-API me.* (M1.11 stub → M2.10 เปิดจริง) · ภาพ 09
// requires: member-seed
//
// สัญญา (migration `member_v2_f2` · src/lib/modules/member/{customer-session.ts, me.ts, me-actions.ts} · src/app/m/[slug]/{layout.tsx, login, card, wallet, profile, history}/page.tsx · src/app/m/[slug]/auth/line/route.ts)
//   schema: CustomerSession {tenantId customerId tokenHash(unique) userAgent? expiresAt revokedAt? createdAt} index(customerId) · CustomerOtp {tenantId target channel("PHONE"|"EMAIL") codeHash attempts(0) expiresAt usedAt? customerId? createdAt} index(tenantId,target,createdAt) · Customer +cardTokenHash? +cardTokenExpiresAt?
//   customer-session.ts (ไม่ใช้ PlatformAuthToken/PlatformSession ของ backoffice):
//     requestOtp(tenantSlug, { phone? | email? }, { ip?, devPreview? }) → { otpId, expiresAt (≈5 นาที), maskedTo, devOtp?: string } — ไม่เผยว่ามีสมาชิกหรือไม่ (ไม่พบก็ตอบสำเร็จ แต่ verify ไม่มีวันผ่าน) · codeHash = sha256(`${otpId}:${code}`) · devOtp คืนเมื่อ process.env.QC_OTP_PREVIEW === "1" หรือ NODE_ENV !== "production"
//       rate limit (core checkRateLimit): ต่อเป้าหมาย 3 ครั้ง/10 นาที · ต่อ ip 10 ครั้ง/10 นาที → เกิน throw ไทย (message มี "ลองใหม่" · err.code = "RATE_LIMITED") · __resetCustomerOtpLimit() สำหรับ QC
//     verifyOtp({ otpId, code }, { userAgent? }) → { token, cookieName, customerId, tenantId, expiresAt (≈30 วัน) } · ผิด → attempts+1 · ครบ 5 → otp ใช้ไม่ได้ (throw ไทย แม้รหัสถูก) · หมดอายุ/ใช้แล้ว → throw ไทย · ผ่าน → usedAt + CustomerSession {tokenHash sha256(token)}
//     loginWithLine(tenantSlug, { lineUserId, displayName? }, { userAgent? }) → { token, cookieName, customerId } เมื่อ MemberChannelIdentity channel "LINE" externalId ตรง (ระบบ MEMBER ของร้าน) · ไม่พบ → { needsJoin: true, joinUrl: "/m/<slug>/join?line=…" } ไม่มี session · route auth/line ตรวจ id_token กับ LINE (https://api.line.me/oauth2/v2.1/verify) ก่อนเรียก (โค้ดต้องมี)
//     mintCustomerSession(customerId, { userAgent? }) → { token, cookieName, expiresAt } (harness ใช้) · getCustomerSession(token) → { customerId, tenantId, memberSystemId } | null (หมดอายุ/ถูกเพิกถอน = null) · revokeCustomerSession(token) · requireCustomer(slug) (server component · อ่าน cookie → ไม่มี = redirect login)
//     cookieName = "shark_customer" (http) / "__Host-shark_customer" (https) · httpOnly · sameSite lax · ไม่ปนกับ shark_session ของพนักงาน
//   me.ts (ทุก op ตรวจ actor.role === "CUSTOMER" && actor.customerId === customerId ไม่งั้น throw ไทย):
//     meGet(ctx, actor, customerId) → { member: { customerId, memberCode, displayName, tier: { name, color } | null, points, memberSince, nextTier?: { name, shortfallSatang } }, sections: [{ key, title, fields: [{ key, label, type, value, customerEditable, sensitive }] }] (listLayout audience customer), consents: [{ channel, label, granted, canConsent }], policy: { version, acceptedAt } | null }
//     meUpdate(ctx, actor, customerId, { fields }) → { updated: string[] } — คีย์ที่ customerEditable=false หรือไม่มี → throw ไทย ระบุคีย์ · ค่าผิด → throw จาก fields engine · AuditLog action "member.me.update" targetId customerId
//     meCard(ctx, actor, customerId) → { memberCode, displayName, tierName, tierColor, points, qr: { content: `SHARK-MC:${token}`, dataUrl: "data:image/png…" }, expiresAt } · token 32+ ตัว (crypto) เก็บ hash · เรียกซ้ำภายในอายุ → token เดิม · หมดอายุ (24 ชม.) → ออกใหม่อัตโนมัติ
//     rotateCardToken(ctx, actor, customerId) → { token, expiresAt } ใหม่ · ของเก่าใช้ไม่ได้ · resolveCardToken(tenantId, token) (พนักงานสแกน · ไม่ต้องมี actor ลูกค้า) → MemberBrief | null (หมดอายุ/ต่างร้าน/ไม่มี = null)
//   consent/PDPA จากลูกค้า: privacy.setConsent(ctx, actorลูกค้า, customerId, { channel, granted, source: "LIFF" }) · privacy.requestExport(ctx, actorลูกค้า, customerId, "LIFF") · privacy.requestErase(ctx, actorลูกค้า, customerId, { reason, via: "LIFF" }) · privacy.acceptPolicy(ctx, customerId, version, "LIFF") — เปิดผ่าน me-actions.ts ("use server" · ผู้เรียก = session ลูกค้าเท่านั้น)
//   หน้า (มือถือ ≤ 390 เป็นหลัก · เดสก์ท็อปก็เปิดได้): /m/[slug]/login (เบอร์/อีเมล → OTP 6 หลัก · ปุ่ม "เข้าสู่ระบบด้วย LINE") · /card (ภาพ 09 ก: การ์ดดำ ชื่อร้าน · ชื่อ+ชิประดับ · รหัส+สมาชิกมา · QR ใหญ่ · แต้มคงเหลือ + แถบความคืบหน้า + "อีก ฿x → เลื่อนเป็น <ระดับถัดไป>" · ปุ่ม 4 สิทธิ์/สแตมป์/ประวัติ/แนะนำเพื่อน · "สิทธิ์ที่ใช้ได้ตอนนี้" 2 รายการแรก) · /wallet (ภาพ 09 ข: แถบเตือนแต้มใกล้หมดอายุ · voucher n · การ์ดสแตมป์วงกลม · gift card + ปุ่มใช้ · ของรางวัลรอรับ) · /profile (ภาพ 09 ค: หัว ชื่อ/รหัส/ระดับ · รายการฟิลด์ (ดินสอ = แก้ได้ · กุญแจ = ร้านยืนยัน) · ความยินยอมรับข่าวสาร toggle ต่อช่องทาง · ปุ่ม "ส่งออก/ลบข้อมูลของฉัน (PDPA)") · /history (ไทม์ไลน์ MemberActivity) · layout: แถบล่าง 4 (บัตร กระเป๋า โปรไฟล์ ประวัติ)
//   testid: m-login m-login-form m-login-line · m-card m-card-qr m-card-points m-card-actions m-card-benefits · m-wallet m-wallet-vouchers m-wallet-stamps m-wallet-giftcards m-wallet-rewards · m-profile m-profile-fields m-profile-consents m-profile-pdpa · m-history · m-nav
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
process.env.QC_OTP_PREVIEW = "1";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_f2$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/member/customer-session.ts") || !existsSync("src/app/m/[slug]/card/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_f2 · member/customer-session.ts · app/m/[slug]/card)");
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
const hasIdx = async (t: string, colsIn: string[], unique = false) => { const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`); return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("(") + 1).replace(/"/g, "").toLowerCase(); return colsIn.every((c) => body.includes(c.toLowerCase())); }); };
const P = prisma as Any;
let tid = ""; let SYS = "";
const tag = Date.now().toString(36);
const made = { fieldRestore: [] as (() => Promise<unknown>)[], sessions: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const slug = mq.MQC.tenantSlug as string;
  const CS = (await import("@/lib/modules/member/customer-session" as string)) as Record<string, (...a: Any[]) => Any>;
  const ME = (await import("@/lib/modules/member/me" as string)) as Record<string, (...a: Any[]) => Any>;
  const PV = (await import("@/lib/modules/member/privacy" as string)) as Record<string, (...a: Any[]) => Any>;
  const F = (await import("@/lib/modules/member/fields" as string)) as Record<string, (...a: Any[]) => Any>;
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: null as string | null };
  const cust = (i: number) => ({ role: "CUSTOMER", customerId: m(i).id, userId: null, unitAccess: [], permissions: {} });
  const resetLimit = async () => { if (CS.__resetCustomerOtpLimit) await CS.__resetCustomerOtpLimit(); };
  await resetLimit();

  // ═══ S1 session ═══
  const cs = await cols("CustomerSession"); const co = await cols("CustomerOtp"); const cc = await cols("Customer");
  const sql = read(`prisma/migrations/${migDir}/migration.sql`);
  const destructive = sql.split("\n").filter((l) => /^\s*(ALTER TABLE .*\b(DROP COLUMN|ALTER COLUMN [^;]*\bTYPE)|DROP TABLE|DROP TYPE)\b/i.test(l));
  const applied = await q<{ finished_at: Date | null }>(`select finished_at from "_prisma_migrations" where migration_name='${migDir}'`);
  const diff = spawnSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "prisma.config.ts", "--to-schema", "prisma/schema", "--script"], { encoding: "utf8", env: process.env, timeout: 300_000 });
  chk("M2.9-S1.1", "migration member_v2_f2: CustomerSession {customerId tokenHash userAgent expiresAt revokedAt} unique(tokenHash) index(customerId) · CustomerOtp {target channel codeHash attempts expiresAt usedAt customerId} index(tenantId,target,createdAt) · Customer +cardTokenHash +cardTokenExpiresAt · additive · applied · diff = empty · ไม่แตะ PlatformAuthToken/PlatformSession (backoffice)",
    ["customerId", "tokenHash", "userAgent", "expiresAt", "revokedAt"].every((c) => cs.has(c)) && ["target", "channel", "codeHash", "attempts", "expiresAt", "usedAt", "customerId"].every((c) => co.has(c)) && cc.has("cardTokenHash") && cc.has("cardTokenExpiresAt") && (await hasIdx("CustomerSession", ["tokenHash"], true)) && (await hasIdx("CustomerSession", ["customerId"])) && (await hasIdx("CustomerOtp", ["tenantId", "target", "createdAt"])) && destructive.length === 0 && !!applied[0]?.finished_at && /empty migration/i.test(diff.stdout + diff.stderr) && !/PlatformAuth|PlatformSession/.test(read("src/lib/modules/member/customer-session.ts")),
    "ครบ", `cs=${[...cs].length} co=${[...co].length} card=${cc.has("cardTokenHash")}/${cc.has("cardTokenExpiresAt")} destructive=${destructive.length} applied=${!!applied[0]?.finished_at} diff=${/empty migration/i.test(diff.stdout + diff.stderr)}`);

  const o1 = await CS.requestOtp(slug, { phone: m(1).phone }, { ip: `10.0.0.${tag.slice(-2).charCodeAt(0) % 200}` });
  const otpRow = o1?.otpId ? await P.customerOtp.findUnique({ where: { id: o1.otpId } }) : null;
  const oGhost = await CS.requestOtp(slug, { phone: "0800000999" }, { ip: "10.0.1.1" });
  const oEmail = await CS.requestOtp(slug, { email: m(2).email }, { ip: "10.0.1.2" });
  const eSlug = await fails(() => CS.requestOtp("no-such-shop", { phone: m(1).phone }, { ip: "10.0.1.3" }));
  chk("M2.9-S1.2", "requestOtp(เบอร์สมาชิก 1) → {otpId, expiresAt ≈ 5 นาที, maskedTo (ปิดบัง), devOtp 6 หลัก (QC)} · CustomerOtp codeHash = sha256(otpId:code) attempts 0 channel PHONE · เบอร์ที่ไม่มีสมาชิก → ตอบสำเร็จเหมือนกัน (ไม่เผย) · อีเมลสมาชิก 2 → ได้ (channel EMAIL) · ร้านไม่มี → throw ไทย",
    !!o1?.otpId && Math.abs(new Date(o1.expiresAt).getTime() - (Date.now() + 5 * 60_000)) < 60_000 && /\*/.test(o1.maskedTo ?? "") && /^\d{6}$/.test(o1.devOtp ?? "") && otpRow?.codeHash === sha256(`${o1.otpId}:${o1.devOtp}`) && otpRow.attempts === 0 && otpRow.channel === "PHONE" && !!oGhost?.otpId && !!oEmail?.otpId && thai(eSlug),
    "OTP ออก", `o1=${JSON.stringify({ id: !!o1?.otpId, exp: o1?.expiresAt, masked: o1?.maskedTo, dev: !!o1?.devOtp })} row=${JSON.stringify({ hash: otpRow?.codeHash === sha256(`${o1?.otpId}:${o1?.devOtp}`), att: otpRow?.attempts, ch: otpRow?.channel })} ghost=${!!oGhost?.otpId} email=${!!oEmail?.otpId} slug=${thai(eSlug)}`);

  const wrongs: (Error | null)[] = [];
  for (let k = 0; k < 5; k += 1) wrongs.push(await fails(() => CS.verifyOtp({ otpId: o1.otpId, code: "000000" }, { userAgent: "qc" })));
  const eLockedRight = await fails(() => CS.verifyOtp({ otpId: o1.otpId, code: o1.devOtp }, { userAgent: "qc" }));
  const eGhostVerify = await fails(() => CS.verifyOtp({ otpId: oGhost.otpId, code: oGhost.devOtp ?? "123456" }, { userAgent: "qc" }));
  const o2 = await CS.requestOtp(slug, { phone: m(1).phone }, { ip: "10.0.2.1" });
  const s1 = await CS.verifyOtp({ otpId: o2.otpId, code: o2.devOtp }, { userAgent: "qc-verify" });
  if (s1?.token) made.sessions.push(s1.token);
  const sessRow = s1?.token ? await P.customerSession.findUnique({ where: { tokenHash: sha256(s1.token) } }) : null;
  const got = s1?.token ? await CS.getCustomerSession(s1.token) : null;
  const eReuse = await fails(() => CS.verifyOtp({ otpId: o2.otpId, code: o2.devOtp }, { userAgent: "qc" }));
  chk("M2.9-S1.3", "verifyOtp: ผิด 5 ครั้ง → throw ไทยทุกครั้ง · ครั้งที่ 6 รหัสถูก → ยัง throw (ใช้ไม่ได้แล้ว) · OTP ของเบอร์ที่ไม่มีสมาชิก → ไม่มีวันผ่าน · OTP ใหม่ + รหัสถูก → {token, cookieName shark_customer, customerId สมาชิก 1, tenantId, expiresAt ≈ 30 วัน} · CustomerSession tokenHash sha256(token) userAgent · getCustomerSession(token) → {customerId, tenantId, memberSystemId} · OTP ใช้แล้วใช้ซ้ำ → throw",
    wrongs.every(thai) && thai(eLockedRight) && !!eGhostVerify && !!s1?.token && /shark_customer/.test(s1.cookieName) && s1.customerId === m(1).id && s1.tenantId === tid && Math.abs(new Date(s1.expiresAt).getTime() - (Date.now() + 30 * 86_400_000)) < 3 * 86_400_000 && sessRow?.customerId === m(1).id && sessRow.userAgent === "qc-verify" && got?.customerId === m(1).id && got.memberSystemId === SYS && thai(eReuse),
    "session ออก", `wrong=${wrongs.map(thai).join(",")} locked=${eLockedRight?.message?.slice(0, 40)} ghost=${!!eGhostVerify} s1=${JSON.stringify({ tok: !!s1?.token, cookie: s1?.cookieName, cid: s1?.customerId === m(1).id, exp: s1?.expiresAt })} row=${!!sessRow} got=${JSON.stringify(got)} reuse=${thai(eReuse)}`);

  const lineIdent = await P.memberChannelIdentity.findFirst({ where: { tenantId: tid, channel: "LINE", customer: { memberSystemId: SYS } }, include: { customer: true } });
  const l1 = lineIdent ? await CS.loginWithLine(slug, { lineUserId: lineIdent.externalId, displayName: "คุณไลน์" }, { userAgent: "liff" }) : null;
  if (l1?.token) made.sessions.push(l1.token);
  const l2 = await CS.loginWithLine(slug, { lineUserId: `U-no-such-${tag}` }, { userAgent: "liff" });
  const minted = await CS.mintCustomerSession(m(3).id, { userAgent: "harness" });
  if (minted?.token) made.sessions.push(minted.token);
  const gotM = await CS.getCustomerSession(minted.token);
  await CS.revokeCustomerSession(minted.token);
  const gotAfter = await CS.getCustomerSession(minted.token);
  const lineRoute = read("src/app/m/[slug]/auth/line/route.ts");
  chk("M2.9-S1.4", "loginWithLine: lineUserId ที่ผูก MemberChannelIdentity LINE → session ของลูกค้าคนนั้น · ไม่รู้จัก → {needsJoin true, joinUrl /m/<slug>/join…} ไม่มี token · mintCustomerSession(สมาชิก 3) → token ใช้ได้ · revoke → getCustomerSession null · route auth/line ตรวจ id_token กับ LINE (api.line.me … verify)",
    (!lineIdent || (l1?.token && l1.customerId === lineIdent.customerId)) && l2?.needsJoin === true && !l2.token && /\/m\/.+\/join/.test(l2.joinUrl ?? "") && gotM?.customerId === m(3).id && gotAfter === null && /api\.line\.me/.test(lineRoute) && /verify/.test(lineRoute),
    "LINE + mint/revoke", `ident=${!!lineIdent} l1=${JSON.stringify({ tok: !!l1?.token, cid: l1?.customerId === lineIdent?.customerId })} l2=${JSON.stringify(l2)} mint=${gotM?.customerId === m(3).id} revoked=${gotAfter} route=${/api\.line\.me/.test(lineRoute)}`);

  const eMeOther = await fails(() => ME.meGet(ctx, cust(1), m(2).id));
  const eWalletOther = await fails(() => M.getWallet(ctx, cust(1), m(2).id, {}));
  const eStaffAsCust = await fails(() => ME.meGet(ctx, { role: "STAFF", userId: E.users.staff.thana.userId, unitAccess: ["*"], permissions: { "member.*": true } }, m(1).id));
  const expSess = await CS.mintCustomerSession(m(4).id, { userAgent: "exp" });
  await P.customerSession.update({ where: { tokenHash: sha256(expSess.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const gotExp = await CS.getCustomerSession(expSess.token);
  const gotBad = await CS.getCustomerSession("not-a-token");
  chk("M2.9-S1.5", "ตรวจเจ้าของ: session สมาชิก 1 เรียก meGet(สมาชิก 2) → throw ไทย · getWallet ของคนอื่น → throw · actor พนักงานเรียก me.* → throw (เส้นทางลูกค้าเท่านั้น) · session หมดอายุ → null · token มั่ว → null",
    thai(eMeOther) && !!eWalletOther && !!eStaffAsCust && gotExp === null && gotBad === null, "ปิดทุกทาง", `other=${eMeOther?.message?.slice(0, 40)} wallet=${!!eWalletOther} staff=${!!eStaffAsCust} exp=${gotExp} bad=${gotBad}`);

  // ═══ S2 บัตร QR token ═══
  const c1 = await ME.meCard(ctx, cust(1), m(1).id);
  const c1b = await ME.meCard(ctx, cust(1), m(1).id);
  const tok1 = (c1?.qr?.content ?? "").replace(/^SHARK-MC:/, "");
  const cRow = await prisma.customer.findUnique({ where: { id: m(1).id } }) as Any;
  chk("M2.9-S2.1", "meCard(สมาชิก 1) → {memberCode, displayName, tierName, points, qr{content 'SHARK-MC:<token 32+>', dataUrl data:image/png}, expiresAt ≈ 24 ชม.} · Customer.cardTokenHash = sha256(token) (ไม่เก็บ token ดิบ) · เรียกซ้ำ → token เดิม",
    c1?.memberCode === m(1).memberCode && !!c1.displayName && typeof c1.points === "number" && /^SHARK-MC:[A-Za-z0-9_-]{32,}$/.test(c1.qr?.content ?? "") && /^data:image\/png/.test(c1.qr?.dataUrl ?? "") && (() => { const d = Date.now() + 24 * 3600_000 - new Date(c1.expiresAt).getTime(); return d > -120_000 && d < 15 * 60_000 + 120_000; })() /* token ใช้ซ้ำได้ 15 นาที (CARD_REUSE_MS) ⇒ อายุที่เหลืออาจสั้นกว่า 24 ชม. ไม่เกิน 15 นาที */ && cRow?.cardTokenHash === sha256(tok1) && c1b?.qr?.content === c1.qr.content,
    "บัตร + token", `c1=${JSON.stringify({ code: c1?.memberCode, name: !!c1?.displayName, pts: c1?.points, qr: c1?.qr?.content?.slice(0, 14), data: c1?.qr?.dataUrl?.slice(0, 15), exp: c1?.expiresAt })} hash=${cRow?.cardTokenHash === sha256(tok1)} same=${c1b?.qr?.content === c1?.qr?.content}`);

  const rot = await ME.rotateCardToken(ctx, cust(1), m(1).id);
  const oldRes = await ME.resolveCardToken(tid, tok1);
  const newRes = await ME.resolveCardToken(tid, rot?.token ?? "");
  chk("M2.9-S2.2", "rotateCardToken → token ใหม่ (≠ เดิม) · ของเก่า resolve → null · ใหม่ resolve → MemberBrief สมาชิก 1 · เรียก rotate ให้คนอื่น → throw",
    !!rot?.token && rot.token !== tok1 && oldRes === null && newRes?.id === m(1).id && newRes.memberCode === m(1).memberCode && !!(await fails(() => ME.rotateCardToken(ctx, cust(1), m(2).id))),
    "หมุนแล้วของเก่าตาย", `rot=${!!rot?.token}/${rot?.token !== tok1} old=${oldRes} new=${newRes?.id === m(1).id}`);

  const c2 = await ME.meCard(ctx, cust(2), m(2).id);
  const tok2 = (c2?.qr?.content ?? "").replace(/^SHARK-MC:/, "");
  const res2 = await ME.resolveCardToken(tid, tok2);
  await prisma.customer.update({ where: { id: m(2).id }, data: { cardTokenExpiresAt: new Date(Date.now() - 1000) } as Any });
  const res2exp = await ME.resolveCardToken(tid, tok2);
  const c2again = await ME.meCard(ctx, cust(2), m(2).id);
  const other = await prisma.tenant.findFirst({ where: { id: { not: tid } } });
  const resOtherTenant = other ? await ME.resolveCardToken(other.id, (c2again?.qr?.content ?? "").replace(/^SHARK-MC:/, "")) : null;
  chk("M2.9-S2.3", "พนักงาน lookup: resolveCardToken(tenant, token สมาชิก 2) → MemberBrief {id, memberCode, displayName, tier, points} (ไม่มีเบอร์เต็ม) · หมดอายุ (24 ชม.) → null · meCard หลังหมดอายุ → ออก token ใหม่อัตโนมัติ · token ของร้านอื่น → null",
    res2?.id === m(2).id && !!res2.memberCode && !!res2.displayName && typeof res2.points === "number" && !("phone" in (res2 ?? {})) && res2exp === null && c2again?.qr?.content !== c2?.qr?.content && resOtherTenant === null,
    "lookup ถูกขอบเขต", `res=${JSON.stringify({ id: res2?.id === m(2).id, code: res2?.memberCode, phone: "phone" in (res2 ?? {}) })} exp=${res2exp} renew=${c2again?.qr?.content !== c2?.qr?.content} other=${resOtherTenant}`);

  const actSrc = read("src/lib/modules/member/me-actions.ts") + read("src/lib/modules/member/members-actions.ts") + read("src/lib/modules/member/chat-actions.ts");
  chk("M2.9-S2.4", "ทางเข้าพนักงาน: มี action lookupCardTokenAction (\"use server\" · gate member.customer.read · เรียก resolveCardToken) สำหรับแอปพนักงาน/POS สแกน QR · me-actions.ts ทุก action อ่าน session ลูกค้า (getCustomerSession/requireCustomer) ไม่ใช่ requireTenant",
    /lookupCardTokenAction/.test(actSrc) && /resolveCardToken/.test(actSrc) && /getCustomerSession|requireCustomer/.test(read("src/lib/modules/member/me-actions.ts")) && /["']use server["']/.test(read("src/lib/modules/member/me-actions.ts")),
    "มี action", `lookup=${/lookupCardTokenAction/.test(actSrc)} session=${/getCustomerSession|requireCustomer/.test(read("src/lib/modules/member/me-actions.ts"))}`);

  // ═══ S3 me.get / me.update ═══
  const layout = await F.listLayout({ tenantId: tid, systemId: SYS }, { audience: "staff" });
  const allFields = layout.sections.flatMap((s: Any) => s.fields);
  const nick = allFields.find((f: Any) => f.key === "nickname");
  const certLevel = allFields.find((f: Any) => f.key === "certLevel");
  if (nick && !nick.customerEditable) { await F.updateField({ tenantId: tid, systemId: SYS }, nick.id, { customerEditable: true }); made.fieldRestore.push(() => F.updateField({ tenantId: tid, systemId: SYS }, nick.id, { customerEditable: false })); }
  if (certLevel && certLevel.customerEditable) { await F.updateField({ tenantId: tid, systemId: SYS }, certLevel.id, { customerEditable: false }); made.fieldRestore.push(() => F.updateField({ tenantId: tid, systemId: SYS }, certLevel.id, { customerEditable: true })); }
  const me1 = await ME.meGet(ctx, cust(1), m(1).id);
  const meFields = (me1?.sections ?? []).flatMap((s: Any) => s.fields);
  const fNick = meFields.find((f: Any) => f.key === "nickname");
  chk("M2.9-S3.1", "meGet(สมาชิก 1): member {customerId, memberCode, displayName, tier{name,color}, points, memberSince} · sections[] ตาม listLayout audience customer · ฟิลด์ nickname customerEditable true (label ไทย) · consents[] 15 ช่องทาง (channel/label/granted/canConsent) · policy (null หรือ {version, acceptedAt})",
    me1?.member?.customerId === m(1).id && me1.member.memberCode === m(1).memberCode && !!me1.member.displayName && typeof me1.member.points === "number" && !!me1.member.memberSince && Array.isArray(me1.sections) && me1.sections.length > 0 && fNick?.customerEditable === true && /[ก-๙]/.test(fNick.label ?? "") && Array.isArray(me1.consents) && me1.consents.length >= 6 && me1.consents.every((c: Any) => "channel" in c && "granted" in c && "canConsent" in c) && ("policy" in me1),
    "DTO ครบ", `me=${JSON.stringify({ cid: me1?.member?.customerId === m(1).id, code: me1?.member?.memberCode, pts: me1?.member?.points, sec: me1?.sections?.length, nick: fNick, consents: me1?.consents?.length, policy: me1?.policy })}`);

  const up = await ME.meUpdate(ctx, cust(1), m(1).id, { fields: { nickname: `ต้น${tag.slice(-3)}` } });
  const me1b = await ME.meGet(ctx, cust(1), m(1).id);
  const nickVal = (me1b?.sections ?? []).flatMap((s: Any) => s.fields).find((f: Any) => f.key === "nickname")?.value;
  const eNotEditable = await fails(() => ME.meUpdate(ctx, cust(1), m(1).id, { fields: { certLevel: "Advanced" } }));
  const eUnknown = await fails(() => ME.meUpdate(ctx, cust(1), m(1).id, { fields: { noSuchKey: "x" } }));
  const ePhone = await fails(() => ME.meUpdate(ctx, cust(1), m(1).id, { fields: { phone: "0811111111" } }));
  restore.push(() => P.customer.update({ where: { id: m(1).id }, data: { nickname: null } }).catch(() => null));
  chk("M2.9-S3.2", "meUpdate: nickname (customerEditable) → {updated ['nickname']} · meGet เห็นค่าใหม่ · certLevel (ไม่ editable) → throw ไทย ระบุคีย์ · คีย์ไม่มี → throw · phone (ฟิลด์ระบบที่ร้านยืนยัน) → throw",
    JSON.stringify(up?.updated) === JSON.stringify(["nickname"]) && nickVal === `ต้น${tag.slice(-3)}` && thai(eNotEditable) && /certLevel/.test(eNotEditable?.message ?? "") && thai(eUnknown) && !!ePhone,
    "แก้ได้เฉพาะ editable", `up=${JSON.stringify(up)} val=${nickVal} cert=${eNotEditable?.message?.slice(0, 50)} unknown=${thai(eUnknown)} phone=${!!ePhone}`);

  const eBad = await fails(() => ME.meUpdate(ctx, cust(1), m(1).id, { fields: { nickname: "ยาว".repeat(200) } }));
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "member.me.update", targetId: m(1).id }, orderBy: { createdAt: "desc" } });
  chk("M2.9-S3.3", "ค่าผิดกติกา fields engine (ยาวเกิน) → throw ไทย ไม่บันทึก · AuditLog action member.me.update targetId สมาชิก 1 (actorType ไม่ใช่ USER พนักงาน)",
    thai(eBad) && !!audit && audit.actorType !== "USER", "ตรวจ + audit", `bad=${eBad?.message?.slice(0, 40)} audit=${audit?.actorType}`);

  // ═══ S4 consent / PDPA ═══
  const cons0 = await PV.getConsents(ctx, m(1).id);
  const line0 = cons0.find((c: Any) => c.channel === "LINE")?.granted;
  const sc = await PV.setConsent(ctx, cust(1), m(1).id, { channel: "LINE", granted: !line0, source: "LIFF" });
  const cons1 = await PV.getConsents(ctx, m(1).id);
  const line1 = cons1.find((c: Any) => c.channel === "LINE")?.granted;
  restore.push(() => PV.setConsent(ctx, { role: "OWNER", userId: E.users.owner.userId, unitAccess: ["*"], permissions: {} }, m(1).id, { channel: "LINE", granted: !!line0, source: "STAFF" }).catch(() => null));
  const eConsOther = await fails(() => PV.setConsent(ctx, cust(2), m(1).id, { channel: "LINE", granted: true, source: "LIFF" }));
  const ob = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "member.consent.changed", payload: { path: ["customerId"], equals: m(1).id } }, orderBy: { createdAt: "desc" } });
  chk("M2.9-S4.1", "consent จากลูกค้า: setConsent(LINE สลับค่า · source LIFF) → เปลี่ยนจริง · event member.consent.changed · ลูกค้าคนอื่นตั้งให้ → throw",
    !!sc && line1 === !line0 && !!ob && !!eConsOther, "สลับได้", `before=${line0} after=${line1} ob=${!!ob} other=${!!eConsOther}`);

  const ex = await PV.requestExport(ctx, cust(1), m(1).id, "LIFF");
  const er = await PV.requestErase(ctx, cust(1), m(1).id, { reason: "ไม่ใช้บริการแล้ว", via: "LIFF" });
  const reqE = er?.requestId ? await P.memberPrivacyRequest.findUnique({ where: { id: er.requestId } }) : null;
  restore.push(async () => { await P.memberPrivacyRequest.deleteMany({ where: { customerId: m(1).id, requestedVia: "LIFF" } }); await P.approvalRequest.deleteMany({ where: { tenantId: tid, entityType: "member.erase", entityId: m(1).id } }).catch(() => null); });
  const eExOther = await fails(() => PV.requestExport(ctx, cust(2), m(1).id, "LIFF"));
  chk("M2.9-S4.2", "PDPA จากลูกค้า: requestExport(LIFF) → {requestId, bundle} (ข้อมูลตัวเอง) · requestErase(LIFF) → คำขอ PENDING type ERASE requestedVia LIFF (ไม่ลบทันที · สมาชิกยังอยู่) · ลูกค้าคนอื่นขอแทน → throw",
    !!ex?.requestId && !!ex.bundle && !!er?.requestId && reqE?.type === "ERASE" && reqE.status === "PENDING" && reqE.requestedVia === "LIFF" && String((await prisma.customer.findUnique({ where: { id: m(1).id } }))?.status) !== "ERASED" && !!eExOther,
    "คำขอ PDPA", `ex=${!!ex?.requestId}/${!!ex?.bundle} er=${JSON.stringify({ id: !!er?.requestId, type: reqE?.type, st: reqE?.status, via: reqE?.requestedVia })} other=${!!eExOther}`);

  const pol = await PV.currentPolicy(ctx);
  const acc = pol ? await PV.acceptPolicy(ctx, m(1).id, pol.version, "LIFF") : null;
  const me1c = await ME.meGet(ctx, cust(1), m(1).id);
  chk("M2.9-S4.3", "acceptPolicy(เวอร์ชันปัจจุบัน · via LIFF) → {version, acceptedAt} · meGet.policy.version = เวอร์ชันนั้น + acceptedAt (ไม่มีนโยบาย = policy null ยอมรับได้)",
    (!pol && me1c?.policy === null) || (!!acc?.acceptedAt && me1c?.policy?.version === pol.version && !!me1c.policy.acceptedAt), "ยอมรับแล้ว", `pol=${pol?.version} acc=${JSON.stringify(acc)} me=${JSON.stringify(me1c?.policy)}`);

  // ═══ S5 หน้า / ภาพ ═══
  const pages = { layout: read("src/app/m/[slug]/layout.tsx"), login: read("src/app/m/[slug]/login/page.tsx"), card: read("src/app/m/[slug]/card/page.tsx"), wallet: read("src/app/m/[slug]/wallet/page.tsx"), profile: read("src/app/m/[slug]/profile/page.tsx"), history: read("src/app/m/[slug]/history/page.tsx") };
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /^M[A-Z]|Customer|Liff|MobileCard|MyCard|MyWallet|MyProfile/.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = Object.values(pages).join("\n") + comps;
  const TIDS = ["m-login", "m-login-form", "m-login-line", "m-card", "m-card-qr", "m-card-points", "m-card-actions", "m-card-benefits", "m-wallet", "m-wallet-vouchers", "m-wallet-stamps", "m-wallet-giftcards", "m-wallet-rewards", "m-profile", "m-profile-fields", "m-profile-consents", "m-profile-pdpa", "m-history", "m-nav"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const clean = all.replace(/\/\/.*$/gm, "");
  const LABELS = ["บัตรสมาชิกของฉัน", "แต้มคงเหลือ", "เลื่อนเป็น", "สิทธิ์", "สแตมป์", "ประวัติ", "แนะนำเพื่อน", "สิทธิ์ที่ใช้ได้ตอนนี้", "กระเป๋าสิทธิ์", "Voucher", "Gift Card", "ของรางวัลรอรับ", "โปรไฟล์ของฉัน", "ความยินยอมรับข่าวสาร", "ส่งออก/ลบข้อมูลของฉัน (PDPA)", "บัตร", "กระเป๋า", "โปรไฟล์", "เข้าสู่ระบบด้วย LINE"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  chk("M2.9-S5.1", "หน้า /m/[slug]/{login,card,wallet,profile,history} + layout (แถบล่าง 4) มีจริง · card/wallet/profile/history ใช้ requireCustomer (ไม่ใช้ requireTenant ของพนักงาน) · testid 19 · ป้ายภาพ 09 ครบ · ไม่มีอีโมจิ/hex · viewport มือถือ (meta viewport / max-w)",
    Object.values(pages).every((p) => p.length > 0) && ["card", "wallet", "profile", "history"].every((k) => /requireCustomer/.test((pages as Any)[k]) && !/requireTenant\(/.test((pages as Any)[k])) && missingT.length === 0 && missingL.length === 0 && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(clean) && !/#[0-9a-fA-F]{6}\b/.test(clean),
    "ครบ", `pages=${Object.entries(pages).map(([k, p]) => `${k}:${p.length > 0}`).join("/")} tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"}`);

  const dir = `${mq.MQC.shotsDir}/2.9`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const custKey = `customer:${m(1).memberCode}`;
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M2.9-S5.2", "ภาพ 09 (--user customer:<รหัสสมาชิก 1> · มือถือ 390): m-card · m-wallet · m-profile · m-history 200 ไม่ล้น · m-login (ไม่มี session) 200 · ไม่มี session เปิด /card → redirect login (302/200 ที่หน้า login)",
    ok(custKey, "m-card", "mobile") && ok(custKey, "m-wallet", "mobile") && ok(custKey, "m-profile", "mobile") && ok(custKey, "m-history", "mobile") && r("owner", "m-login", "mobile")?.status === 200 && r("owner", "m-card-nosession", "mobile")?.status === 200 && (r("owner", "m-card-nosession", "mobile")?.missing?.length ?? 1) === 0,
    "200 ×6", `card=${r(custKey, "m-card", "mobile")?.status} wallet=${r(custKey, "m-wallet", "mobile")?.status} profile=${r(custKey, "m-profile", "mobile")?.status} history=${r(custKey, "m-history", "mobile")?.status} login=${r("owner", "m-login", "mobile")?.status} nosession=${r("owner", "m-card-nosession", "mobile")?.status}/${JSON.stringify(r("owner", "m-card-nosession", "mobile")?.missing)}`);
  chk("M2.9-S5.3", "🔴 parity ภาพ 09 (3 จอ) — Fable ตรวจด้วยตา · wo-notes/member-M2.9.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M2.9.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");

  // ═══ S6 perf ═══
  const t0 = Date.now();
  await Promise.all([ME.meCard(ctx, cust(1), m(1).id), M.getWallet(ctx, cust(1), m(1).id, {}), ME.meGet(ctx, cust(1), m(1).id)]);
  const ms = Date.now() - t0;
  chk("M2.9-S6.1", "perf: meCard + getWallet + meGet ขนานกัน ≤ 1500ms บน QC (หน้า /m เปิดในไลน์ต้องไว)", ms <= 1500, "≤1500ms", `${ms}ms`, "MAJOR");

  // ═══ S7 OTP limit ═══
  await resetLimit();
  const ph = m(5).phone;
  const rs: Any[] = [];
  for (let k = 0; k < 3; k += 1) rs.push(await CS.requestOtp(slug, { phone: ph }, { ip: `10.0.3.${k}` }));
  const e4 = await fails(() => CS.requestOtp(slug, { phone: ph }, { ip: "10.0.3.9" }));
  chk("M2.9-S7.1", "rate limit ต่อเป้าหมาย: เบอร์เดียวกันขอ OTP 3 ครั้งได้ · ครั้งที่ 4 ใน 10 นาที → throw ไทย (code RATE_LIMITED · มี 'ลองใหม่')",
    rs.every((x) => !!x?.otpId) && thai(e4) && (e4 as Any)?.code === "RATE_LIMITED" && /ลองใหม่/.test(e4?.message ?? ""), "3 แล้วหยุด", `ok=${rs.map((x) => !!x?.otpId).join(",")} e4=${e4?.message?.slice(0, 50)}/${(e4 as Any)?.code}`);

  await resetLimit();
  const ip = `10.0.4.${tag.slice(-1).charCodeAt(0) % 250}`;
  const ipRs: Any[] = [];
  for (let k = 0; k < 10; k += 1) ipRs.push(await CS.requestOtp(slug, { phone: `08999${String(k).padStart(5, "0")}` }, { ip }));
  const eIp = await fails(() => CS.requestOtp(slug, { phone: "0899900099" }, { ip }));
  const okOtherIp = await CS.requestOtp(slug, { phone: "0899900098" }, { ip: "10.0.5.1" });
  chk("M2.9-S7.2", "rate limit ต่อ ip: 10 ครั้ง/10 นาที (เบอร์ต่างกัน) ได้ · ครั้งที่ 11 → throw RATE_LIMITED · ip อื่นยังขอได้",
    ipRs.every((x) => !!x?.otpId) && thai(eIp) && (eIp as Any)?.code === "RATE_LIMITED" && !!okOtherIp?.otpId, "10 แล้วหยุด", `ok=${ipRs.filter((x) => !!x?.otpId).length} eIp=${(eIp as Any)?.code} other=${!!okOtherIp?.otpId}`);

  await resetLimit();
  const o5 = await CS.requestOtp(slug, { phone: m(6).phone }, { ip: "10.0.6.1" });
  await P.customerOtp.update({ where: { id: o5.otpId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const eExpired = await fails(() => CS.verifyOtp({ otpId: o5.otpId, code: o5.devOtp }, { userAgent: "qc" }));
  const eNoOtp = await fails(() => CS.verifyOtp({ otpId: "no-such", code: "123456" }, { userAgent: "qc" }));
  const srcCS = read("src/lib/modules/member/customer-session.ts");
  chk("M2.9-S7.3", "OTP หมดอายุ → throw ไทย · otpId ไม่มี → throw ไทย (ไม่บอกว่าไม่มี — ข้อความเดียวกับรหัสผิด) · โค้ดไม่ log OTP ดิบ (ไม่มี console.log(otp/code)) · ใช้ checkRateLimit กลาง",
    thai(eExpired) && thai(eNoOtp) && !/console\.log\([^)]*(otp|code)/i.test(srcCS) && /checkRateLimit/.test(srcCS), "ปลอดภัย", `exp=${thai(eExpired)} none=${thai(eNoOtp)} log=${/console\.log\([^)]*(otp|code)/i.test(srcCS)} rl=${/checkRateLimit/.test(srcCS)}`);
} catch (e) {
  console.error("💥", e);
  chk("M2.9-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const r of made.fieldRestore) await d(r);
  await d(() => P.customerOtp.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 3600_000) } } }));
  await d(() => P.customerSession.deleteMany({ where: { tenantId: tid, userAgent: { in: ["qc", "qc-verify", "liff", "harness", "exp"] } } }));
  await d(() => P.customer.updateMany({ where: { memberSystemId: SYS }, data: { cardTokenHash: null, cardTokenExpiresAt: null } }));
  await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, action: { in: ["member.me.update", "member.privacy.export", "member.privacy.erase.requested"] } } }));
  await d(() => P.memberAccessLog.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 3600_000) }, target: { contains: "export" } } }));
  for (const t of ["member."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.9: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
