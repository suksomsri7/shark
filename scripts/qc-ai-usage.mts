// QC — เครดิตผู้ช่วย AI 2 ชั้นแบบ Claude (Phase 4 · MOBILE_PLAN.md) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/ai/usage.ts:
//   pure:
//     creditsFor(model, tokensIn, tokensOut) → เครดิต (1 เครดิต = 1,000 weighted token ·
//        output แพงกว่า input 5 เท่า · น้ำหนักโมเดล: haiku(FAST)=1 · sonnet(SMART)=3) · มี token แต่ปัดได้ 0 → ขั้นต่ำ 1
//     weekStartBangkok(d) → จันทร์ 00:00 เวลาไทย ของสัปดาห์นั้น
//     applyDegrade(model, degraded) → degraded=true แปลง SMART→FAST เท่านั้น (โมเดลอื่นคงเดิม)
//     planLimits(plan) → { sessionCredits, weeklyCredits, degradeAtPct, warnAtPct } (env override ได้)
//   DB (tenant-scoped ตาราง AiUsageWindow kind SESSION/WEEK):
//     recordQuotaUsage(ctx, {model,tokensIn,tokensOut}, now?) → บวกเครดิตทั้ง 2 ชั้น
//       · SESSION = หน้าต่างกลิ้ง 5 ชม. เริ่มนับที่ "ข้อความแรก" หลังหน้าต่างเดิมหมด (แบบ Claude)
//       · WEEK = สัปดาห์ไทย (จันทร์)
//     getQuotaStatus(ctx, now?) → { session:{used,limit,pct,resetAt}, week:{...}, degraded, warn, blocked }
//       · blocked = "session" | "week" | null (ใช้ครบเพดานชั้นนั้น)
//       · degraded = ใช้เกิน degradeAtPct → ลดชั้นเหลือ haiku ก่อนตัด (soft degrade)
//   service.ts: blocked → { ok:false, error:"over_budget", scope, resetAt } โดย "ห้ามเรียก provider"
//               · สำเร็จ → เครดิตเพิ่มจริงทั้ง 2 ชั้น · degraded → applyDegrade ก่อนเลือก tier
//   actions.ts: ข้อความไทยบอกเวลาที่โควตากลับมา · GET /api/mobile/usage (requireMobile) · เว็บมีแถบโควตา
try { process.loadEnvFile(".env"); } catch {}
import { readFileSync, existsSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const ts = Date.now();
const tids: string[] = [];
try {
  const U = (await import("@/lib/ai/usage").catch(() => null)) as unknown as Record<string, (...a: any[]) => any> | null;
  const P = (await import("@/lib/ai/provider")) as unknown as { FAST_MODEL: string; SMART_MODEL: string };

  if (!U || typeof U.creditsFor !== "function" || typeof U.getQuotaStatus !== "function") {
    chk("AU-1.0", "มี src/lib/ai/usage.ts (creditsFor/getQuotaStatus/recordQuotaUsage)", false, "มี", "ยังไม่สร้าง");
  } else {
    // ── ชั้น pure ──
    chk("AU-1.1", "1 เครดิต = 1,000 token ขาเข้า (haiku)", U.creditsFor(P.FAST_MODEL, 1000, 0) === 1, "1", String(U.creditsFor(P.FAST_MODEL, 1000, 0)));
    chk("AU-1.2", "sonnet แพงกว่า haiku 3 เท่า", U.creditsFor(P.SMART_MODEL, 1000, 0) === 3, "3", String(U.creditsFor(P.SMART_MODEL, 1000, 0)));
    chk("AU-1.3", "token ขาออกแพงกว่าขาเข้า 5 เท่า", U.creditsFor(P.FAST_MODEL, 0, 1000) === 5, "5", String(U.creditsFor(P.FAST_MODEL, 0, 1000)));
    chk("AU-1.4", "ใช้จริงแต่ปัดได้ 0 → คิดขั้นต่ำ 1 เครดิต", U.creditsFor(P.FAST_MODEL, 10, 1) === 1, "1", String(U.creditsFor(P.FAST_MODEL, 10, 1)));
    chk("AU-1.5", "ไม่ใช้เลย → 0 เครดิต", U.creditsFor(P.FAST_MODEL, 0, 0) === 0, "0", String(U.creditsFor(P.FAST_MODEL, 0, 0)));

    // จันทร์ 00:00 ไทย = อาทิตย์ 17:00 UTC · ศุกร์ 31 ก.ค. 2026 → จันทร์ 27 ก.ค. 2026
    const wk = U.weekStartBangkok(new Date("2026-07-31T00:00:00Z")) as Date;
    chk("AU-1.6", "weekStartBangkok = จันทร์ 00:00 เวลาไทย", wk.toISOString() === "2026-07-26T17:00:00.000Z", "2026-07-26T17:00:00.000Z", wk.toISOString());
    // ต้นสัปดาห์เองต้องคืนตัวมันเอง (idempotent)
    chk("AU-1.7", "weekStartBangkok idempotent", (U.weekStartBangkok(wk) as Date).toISOString() === wk.toISOString(), "เท่าเดิม", (U.weekStartBangkok(wk) as Date).toISOString());

    chk("AU-1.8", "applyDegrade: SMART→FAST เมื่อ degraded", U.applyDegrade(P.SMART_MODEL, true) === P.FAST_MODEL, P.FAST_MODEL, String(U.applyDegrade(P.SMART_MODEL, true)));
    chk("AU-1.9", "applyDegrade: ไม่ degraded = คงเดิม · FAST อยู่แล้ว = คงเดิม", U.applyDegrade(P.SMART_MODEL, false) === P.SMART_MODEL && U.applyDegrade(P.FAST_MODEL, true) === P.FAST_MODEL, "คงเดิม", `${U.applyDegrade(P.SMART_MODEL, false)}/${U.applyDegrade(P.FAST_MODEL, true)}`);

    const lim = U.planLimits("FREE") as { sessionCredits: number; weeklyCredits: number; degradeAtPct: number; warnAtPct: number };
    chk("AU-1.10", "planLimits FREE: เพดาน 5 ชม. < เพดานสัปดาห์ · degrade < warn ≤ 1", lim.sessionCredits > 0 && lim.weeklyCredits > lim.sessionCredits && lim.degradeAtPct > 0 && lim.degradeAtPct < lim.warnAtPct && lim.warnAtPct <= 1, "สมเหตุผล", JSON.stringify(lim));

    // ── ชั้น DB ──
    const t = await prisma.tenant.create({ data: { name: "QC AI-USAGE", slug: `qc-au-${ts}` } }); tids.push(t.id);
    const ctx = { tenantId: t.id };
    const T0 = new Date("2026-07-31T03:00:00Z"); // ศุกร์ 10:00 ไทย

    await U.recordQuotaUsage(ctx, { model: P.FAST_MODEL, tokensIn: 2000, tokensOut: 0 }, T0); // 2 เครดิต
    const s1 = await U.getQuotaStatus(ctx, T0);
    const rows1 = await prisma.aiUsageWindow.findMany({ where: { tenantId: t.id } });
    chk("AU-2.1", "บันทึกครั้งแรก → 2 แถว (SESSION+WEEK) เครดิตตรง", rows1.length === 2 && s1.session.used === 2 && s1.week.used === 2, "2 แถว/2 เครดิต", JSON.stringify({ n: rows1.length, s: s1.session.used, w: s1.week.used }));
    chk("AU-2.2", "resetAt ของหน้าต่าง 5 ชม. = เวลาที่เริ่ม + 5 ชม.", new Date(s1.session.resetAt).getTime() === T0.getTime() + 5 * 3600_000, new Date(T0.getTime() + 5 * 3600_000).toISOString(), new Date(s1.session.resetAt).toISOString());

    // บันทึกซ้ำในหน้าต่างเดิม (ผ่านไป 1 ชม.) → บวกทับแถวเดิม ไม่เปิดหน้าต่างใหม่
    const T1 = new Date(T0.getTime() + 3600_000);
    await U.recordQuotaUsage(ctx, { model: P.SMART_MODEL, tokensIn: 1000, tokensOut: 0 }, T1); // 3 เครดิต
    const s2 = await U.getQuotaStatus(ctx, T1);
    const sessRows = await prisma.aiUsageWindow.count({ where: { tenantId: t.id, kind: "SESSION" } });
    chk("AU-2.3", "ใช้ซ้ำในหน้าต่างเดิม → บวกทับแถวเดิม (SESSION 1 แถว · 5 เครดิต)", sessRows === 1 && s2.session.used === 5, "1 แถว/5", JSON.stringify({ sessRows, used: s2.session.used }));
    chk("AU-2.4", "resetAt ไม่ขยับตามการใช้ซ้ำ (หน้าต่างกลิ้งจากข้อความแรก)", new Date(s2.session.resetAt).getTime() === T0.getTime() + 5 * 3600_000, "เท่าเดิม", new Date(s2.session.resetAt).toISOString());

    // เลย 5 ชม. → หน้าต่างใหม่ · แต่ยอดสัปดาห์ยังสะสมแถวเดิม
    const T2 = new Date(T0.getTime() + 5 * 3600_000 + 60_000);
    await U.recordQuotaUsage(ctx, { model: P.FAST_MODEL, tokensIn: 1000, tokensOut: 0 }, T2); // 1 เครดิต
    const s3 = await U.getQuotaStatus(ctx, T2);
    const sessRows2 = await prisma.aiUsageWindow.count({ where: { tenantId: t.id, kind: "SESSION" } });
    const weekRows = await prisma.aiUsageWindow.count({ where: { tenantId: t.id, kind: "WEEK" } });
    chk("AU-2.5", "เลย 5 ชม. → เปิดหน้าต่างใหม่ (SESSION 2 แถว · ยอดใหม่ = 1)", sessRows2 === 2 && s3.session.used === 1, "2 แถว/1", JSON.stringify({ sessRows2, used: s3.session.used }));
    chk("AU-2.6", "ยอดสัปดาห์สะสมข้ามหน้าต่าง (1 แถว · 6 เครดิต)", weekRows === 1 && s3.week.used === 6, "1 แถว/6", JSON.stringify({ weekRows, used: s3.week.used }));

    // ── เกณฑ์เตือน/ลดชั้น/ตัด ──
    const seed = async (kind: "SESSION" | "WEEK", windowStart: Date, credits: number) => {
      await prisma.aiUsageWindow.upsert({
        where: { tenantId_kind_windowStart: { tenantId: t.id, kind, windowStart } },
        create: { tenantId: t.id, kind, windowStart, credits, requests: 1 },
        update: { credits },
      });
    };
    const T3 = new Date("2026-07-31T20:00:00Z");
    const wkStart = U.weekStartBangkok(T3) as Date;
    await seed("WEEK", wkStart, 0);

    await seed("SESSION", T3, Math.ceil(lim.sessionCredits * lim.degradeAtPct));
    const d1 = await U.getQuotaStatus(ctx, T3);
    chk("AU-3.1", "ใช้ถึงเกณฑ์ลดชั้น → degraded=true แต่ยังไม่ตัด", d1.degraded === true && d1.blocked === null, "degraded/ไม่ตัด", JSON.stringify({ d: d1.degraded, b: d1.blocked }));

    await seed("SESSION", T3, Math.ceil(lim.sessionCredits * lim.warnAtPct));
    const d2 = await U.getQuotaStatus(ctx, T3);
    chk("AU-3.2", "ใช้ถึงเกณฑ์เตือน → warn=true (ยังใช้ได้)", d2.warn === true && d2.blocked === null, "warn/ไม่ตัด", JSON.stringify({ w: d2.warn, b: d2.blocked }));

    await seed("SESSION", T3, lim.sessionCredits);
    const d3 = await U.getQuotaStatus(ctx, T3);
    chk("AU-3.3", "ใช้ครบเพดาน 5 ชม. → blocked='session' + บอกเวลาคืนโควตา", d3.blocked === "session" && new Date(d3.session.resetAt).getTime() > T3.getTime(), "session/อนาคต", JSON.stringify({ b: d3.blocked, r: d3.session.resetAt }));

    await seed("SESSION", T3, 0);
    await seed("WEEK", wkStart, lim.weeklyCredits);
    const d4 = await U.getQuotaStatus(ctx, T3);
    chk("AU-3.4", "ใช้ครบเพดานสัปดาห์ → blocked='week' (แม้หน้าต่าง 5 ชม. ว่าง)", d4.blocked === "week", "week", String(d4.blocked));
    chk("AU-3.5", "resetAt รายสัปดาห์ = จันทร์ถัดไป 00:00 ไทย", new Date(d4.week.resetAt).getTime() === wkStart.getTime() + 7 * 86400_000, new Date(wkStart.getTime() + 7 * 86400_000).toISOString(), new Date(d4.week.resetAt).toISOString());

    // ยังไม่เคยใช้ → ไม่ตัด ไม่เตือน + pct 0
    const t2 = await prisma.tenant.create({ data: { name: "QC AI-USAGE 2", slug: `qc-au2-${ts}` } }); tids.push(t2.id);
    const fresh = await U.getQuotaStatus({ tenantId: t2.id }, T3);
    chk("AU-3.6", "ร้านใหม่ยังไม่เคยใช้ → pct 0 · ไม่ตัด ไม่ลดชั้น", fresh.session.used === 0 && fresh.session.pct === 0 && fresh.blocked === null && fresh.degraded === false, "ว่างสะอาด", JSON.stringify({ u: fresh.session.used, b: fresh.blocked, d: fresh.degraded }));

    // ── ต่อกับ service.ts จริง ──
    const svc = (await import("@/lib/ai/service")) as unknown as { sendMessage: (c: any, i: any, d?: any) => Promise<any> };
    let calls = 0;
    const spy = { chat: async () => { calls++; return { text: "โอเค", tokensIn: 1000, tokensOut: 200, model: P.FAST_MODEL }; } };

    // ร้านที่โดนตัด → ต้องคืน over_budget โดยไม่แตะ provider
    await seed("WEEK", U.weekStartBangkok(new Date()) as Date, lim.weeklyCredits);
    const blockedRes = await svc.sendMessage(ctx, { text: "ยอดขายวันนี้เท่าไหร่" }, { provider: spy });
    chk("AU-4.1", "โควตาหมด → sendMessage คืน over_budget โดยไม่เรียก provider", blockedRes.ok === false && blockedRes.error === "over_budget" && calls === 0, "over_budget/0 call", JSON.stringify({ r: blockedRes, calls }));
    chk("AU-4.2", "แจ้งชั้นที่หมด + เวลาคืนโควตากลับไปให้ UI", blockedRes.scope === "week" && typeof blockedRes.resetAt === "string" && blockedRes.resetAt.length > 0, "scope+resetAt", JSON.stringify({ s: blockedRes.scope, r: blockedRes.resetAt }));

    // ร้านที่ยังไม่ตัน → ตอบได้ + เครดิตเพิ่มจริงทั้ง 2 ชั้น
    const okRes = await svc.sendMessage({ tenantId: t2.id }, { text: "สวัสดี" }, { provider: spy });
    const after = await U.getQuotaStatus({ tenantId: t2.id }, new Date());
    chk("AU-4.3", "ตอบสำเร็จ → เครดิตถูกหักทั้งชั้น 5 ชม. และชั้นสัปดาห์", okRes.ok === true && after.session.used > 0 && after.week.used === after.session.used, ">0 เท่ากัน", JSON.stringify({ ok: okRes.ok, s: after.session.used, w: after.week.used }));

    const svcSrc = read("src/lib/ai/service.ts");
    chk("AU-4.4", "service.ts ใช้ applyDegrade + getQuotaStatus (ไม่ใช่เช็คแค่โควตารายวันเดิม)", svcSrc.includes("applyDegrade") && svcSrc.includes("getQuotaStatus") && svcSrc.includes("recordQuotaUsage"), "ครบ 3", "ไม่ครบ");

    // ── ผิว UI/สัญญาเปิดเผย ──
    const act = read("src/lib/ai/actions.ts");
    chk("AU-5.1", "actions.ts บอกเวลาที่โควตากลับมาเป็นภาษาไทย (ไม่ใช่ 'พรุ่งนี้' ตายตัว)", /quotaMessage|resetAt/.test(act) && !/พรุ่งนี้กลับมาคุยกันใหม่ได้เลย/.test(act), "อ้าง resetAt", "ยังเป็นข้อความตายตัว");
    const mob = read("src/app/api/mobile/usage/route.ts");
    chk("AU-5.2", "GET /api/mobile/usage มีจริง + ป้องกันด้วย requireMobile", mob.includes("requireMobile") && /export async function GET/.test(mob), "มี GET+requireMobile", mob ? "ไม่ครบ" : "ไม่มีไฟล์");
    chk("AU-5.3", "mobile chat แปลง over_budget เป็นข้อความไทย (ไม่โยน error code ดิบให้ผู้ใช้)", read("src/lib/mobile/chat.ts").includes("quotaMessage"), "ใช้ quotaMessage", "ยังส่ง code ดิบ");
    const dockSrc = read("src/components/app-shell/AiChat.tsx") + read("src/components/app-shell/AiDock.tsx") + read("src/components/app-shell/AiQuotaBar.tsx");
    chk("AU-6.1", "เว็บมีแถบโควตา (แสดงยอดใช้ + เตือนเมื่อใกล้เต็ม)", /โควตา|quota/i.test(dockSrc), "มีแถบโควตา", "ไม่พบ", "MAJOR");
    chk("AU-6.2", "แอปมีจอ/แถบโควตาเรียก /api/mobile/usage", /api\/mobile\/usage|\/usage/.test(read("apps/mobile/app/(app)/sessions.tsx") + read("apps/mobile/src/components/chat/QuotaBar.tsx")), "เรียก usage", "ไม่พบ", "MAJOR");
  }
} finally {
  for (const tid of tids) {
    for (const m of ["aiUsageWindow", "aiUsage", "aiMessage", "aiConversation", "aiMemory", "membership"] as const) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: tid } }).catch(() => {});
  }
  await prisma.$disconnect();
}
const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-ai-usage: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
