// QC — Hardening (WO-0043) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
// 1) src/lib/core/rate-limit.ts (in-memory sliding window — per-instance ยอมรับได้บน Vercel):
//    checkRateLimit(key: string, opts: { limit: number; windowMs: number }) → { ok: boolean; retryAfterSec?: number }
//    resetRateLimit(key?: string) — ล้าง (สำหรับทดสอบ) · key ไม่ส่ง = ล้างหมด
// 2) src/lib/core/cron-auth.ts:
//    isCronAuthorized(req: Request) → boolean — secret = SHARK_CRON_SECRET ?? CRON_SECRET
//    · รับได้ทั้ง `Authorization: Bearer <secret>` และ `X-Cron-Secret: <secret>` (รวมมาตรฐานเก่า/ใหม่)
//    · เทียบ constant-time (timingSafeEqual) · ไม่มี header/ผิด → false
//    · ทั้ง /api/cron/tick และ /api/cron/outbox ต้องใช้ helper นี้ (ของเดิม 2 มาตรฐานแยกกัน)
// 3) core/auth.ts requestLogin: กันถล่ม OTP — นับ AuthToken purpose OTP ใน 10 นาที
//    · อีเมลเดิม ≥5 → throw ไทย ("ขอรหัสถี่เกินไป...") · ip เดิม ≥20 → throw ไทย · นับ "ก่อน" สร้างแถวใหม่
// 4) platform/auth.ts requestPlatformOtp: อีเมลเดิม ≥5 ใน 10 นาที → throw ไทย (backoffice)
//    · UI action ทั้งสองฝั่งต้อง catch → error inline (ห้ามหน้าแตก)
// 5) src/proxy.ts applySecurity เพิ่ม: Strict-Transport-Security (max-age ≥ 1 ปี + includeSubDomains) + Permissions-Policy (ปิด camera/microphone/geolocation) — ของเดิม 3 ตัวห้ามหาย
// 6) /api/chat/webchat: rate limit ต่อ session/ip ด้วย checkRateLimit → เกิน = 429 (surface สาธารณะ)
// 7) docs/SECURITY_AUDIT.md — self-audit checklist (rate limit/headers/CSRF/secret/RBAC/tenant isolation + สถานะ + ช่องโหว่ที่รู้และ defer)
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_CRON_SECRET = "qc-cron-secret";
process.env.CRON_SECRET = "qc-legacy-secret";
const { prisma } = await import("@/lib/core/db");
const { readFileSync, existsSync } = await import("node:fs");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

const QC_EMAIL = `qc-hard-${Date.now()}@example.com`;
const QC_IP = "10.99.88.77";
let boEmail = "";
try {
  // 1) rate-limit kernel
  const rl = (await import("@/lib/core/rate-limit" as string).catch(() => null)) as { [k: string]: (...a: any[]) => any } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!rl) { chk("HD-0", "มี core/rate-limit.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    rl.resetRateLimit();
    const r = [1, 2, 3].map(() => rl.checkRateLimit("k1", { limit: 3, windowMs: 60000 }));
    const r4 = rl.checkRateLimit("k1", { limit: 3, windowMs: 60000 });
    chk("HD-1.1", "limit 3: ผ่าน 3 บล็อกที่ 4 + retryAfterSec", r.every((x: { ok: boolean }) => x.ok) && r4.ok === false && (r4.retryAfterSec ?? 0) > 0, "3 ok/บล็อก", JSON.stringify(r4));
    rl.resetRateLimit("k1");
    chk("HD-1.2", "reset แล้วผ่านใหม่ + คนละ key ไม่กระทบ", rl.checkRateLimit("k1", { limit: 3, windowMs: 60000 }).ok === true && rl.checkRateLimit("k2", { limit: 1, windowMs: 60000 }).ok === true, "ok", "?");
  }

  // 2) cron auth รวมมาตรฐาน
  const ca = (await import("@/lib/core/cron-auth" as string).catch(() => null)) as { isCronAuthorized: (r: Request) => boolean } | null;
  if (!ca) { chk("HD-2.0", "มี core/cron-auth.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const req = (h: Record<string, string>) => new Request("http://x/api/cron/tick", { headers: h });
    chk("HD-2.1", "Bearer SHARK_CRON_SECRET → true", ca.isCronAuthorized(req({ authorization: "Bearer qc-cron-secret" })) === true, "true", "?");
    chk("HD-2.2", "X-Cron-Secret เดียวกัน → true (รวมมาตรฐาน)", ca.isCronAuthorized(req({ "x-cron-secret": "qc-cron-secret" })) === true, "true", "?");
    chk("HD-2.3", "ผิด/ไม่มี header → false ทั้งคู่", ca.isCronAuthorized(req({ authorization: "Bearer wrong" })) === false && ca.isCronAuthorized(req({})) === false, "false", "?");
    const tick = readFileSync("src/app/api/cron/tick/route.ts", "utf8");
    const outbox = readFileSync("src/app/api/cron/outbox/route.ts", "utf8");
    chk("HD-2.4", "ทั้ง tick+outbox ใช้ isCronAuthorized", tick.includes("isCronAuthorized") && outbox.includes("isCronAuthorized"), "ใช้ทั้งคู่", "?");
  }

  // 3) กันถล่ม OTP ร้าน (นับจาก AuthToken — ไม่มีตารางใหม่)
  const auth = (await import("@/lib/core/auth")) as unknown as { requestLogin: (e: string, ip?: string) => Promise<unknown> };
  let blocked = false;
  for (let i = 0; i < 5; i++) await auth.requestLogin(QC_EMAIL, QC_IP);
  try { await auth.requestLogin(QC_EMAIL, QC_IP); } catch (e) { blocked = /ถี่เกินไป|รอสักครู่/.test(e instanceof Error ? e.message : ""); }
  chk("HD-3.1", "อีเมลเดิมครั้งที่ 6 ใน 10 นาที → throw ไทย", blocked, "throw", "?");
  chk("HD-3.2", "5 ครั้งแรกสร้าง OTP ครบ (ครั้งที่ 6 ไม่สร้างเพิ่ม)", (await prisma.authToken.count({ where: { email: QC_EMAIL, purpose: "OTP" } })) === 5, "5", String(await prisma.authToken.count({ where: { email: QC_EMAIL, purpose: "OTP" } })));
  let ipBlocked = false;
  for (let i = 0; i < 15; i++) await auth.requestLogin(`qc-hard-ip-${i}-${Date.now()}@example.com`, QC_IP); // รวมของเดิม 5 = 20 ครั้งจาก ip เดียว
  try { await auth.requestLogin(`qc-hard-ip-last-${Date.now()}@example.com`, QC_IP); } catch (e) { ipBlocked = /ถี่เกินไป|รอสักครู่/.test(e instanceof Error ? e.message : ""); }
  chk("HD-3.3", "ip เดิมครั้งที่ 21 ใน 10 นาที → throw ไทย", ipBlocked, "throw", "?");

  // 4) กันถล่ม OTP backoffice
  boEmail = `qc-hard-bo-${Date.now()}@example.com`;
  await prisma.platformUser.create({ data: { email: boEmail, name: "QC Hard", role: "SUPPORT" } });
  const pauth = (await import("@/lib/platform/auth")) as unknown as { requestPlatformOtp: (e: string) => Promise<unknown> };
  let boBlocked = false;
  for (let i = 0; i < 5; i++) await pauth.requestPlatformOtp(boEmail);
  try { await pauth.requestPlatformOtp(boEmail); } catch (e) { boBlocked = /ถี่เกินไป|รอสักครู่/.test(e instanceof Error ? e.message : ""); }
  chk("HD-4.1", "backoffice OTP ครั้งที่ 6 → throw ไทย", boBlocked, "throw", "?");

  // 5) security headers ใน proxy
  const px = readFileSync("src/proxy.ts", "utf8");
  chk("HD-5.1", "proxy มี HSTS ≥1 ปี + includeSubDomains", /Strict-Transport-Security/.test(px) && /max-age=(3[2-9]\d{6,}|[4-9]\d{7,}|\d{9,})/.test(px) && /includeSubDomains/.test(px), "มี", "?");
  chk("HD-5.2", "proxy มี Permissions-Policy ปิด camera/microphone/geolocation", /Permissions-Policy/.test(px) && /camera=\(\)/.test(px) && /microphone=\(\)/.test(px) && /geolocation=\(\)/.test(px), "มี", "?");
  chk("HD-5.3", "ของเดิม 3 header ยังอยู่", /X-Frame-Options/.test(px) && /X-Content-Type-Options/.test(px) && /Referrer-Policy/.test(px), "ครบ", "?");

  // 6) webchat rate limit
  const wc = readFileSync("src/app/api/chat/webchat/route.ts", "utf8");
  chk("HD-6.1", "webchat ใช้ checkRateLimit + ตอบ 429", wc.includes("checkRateLimit") && wc.includes("429"), "ใช้", "?", "MAJOR");

  // 7) self-audit checklist
  const auditOk = existsSync("docs/SECURITY_AUDIT.md") && (() => { const d = readFileSync("docs/SECURITY_AUDIT.md", "utf8"); return d.length > 1500 && /rate limit/i.test(d) && /CSRF/i.test(d) && /header/i.test(d) && /tenant/i.test(d); })();
  chk("HD-7.1", "docs/SECURITY_AUDIT.md checklist ครบหัวข้อ", auditOk, "ครบ", "?", "MAJOR");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  await d(() => prisma.authToken.deleteMany({ where: { OR: [{ email: { startsWith: "qc-hard-" } }, { ip: QC_IP }] } }));
  await d(() => prisma.user.deleteMany({ where: { email: { startsWith: "qc-hard-" } } }));
  if (boEmail) { await d(() => prisma.platformAuthToken.deleteMany({ where: { email: boEmail } })); await d(() => prisma.platformUser.deleteMany({ where: { email: boEmail } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Hardening =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
