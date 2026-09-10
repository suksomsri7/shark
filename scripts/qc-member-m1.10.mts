// QC — ระบบสมาชิก v2 WO M1.10: ระดับ UI — บันได · ตัวสร้างกฎ (reuse AutomationBuilder scope MEMBER_TIER) · benefits editor 9 ชนิด · ทดลองรัน · ประวัติ · แบบเสียเงิน · ตัวอย่างบัตร LINE (ภาพ 04 · 15)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M1.10 · พิมพ์เขียว §3.4 §5.4 §6.1 · engine = M1.9 tiers.ts
// requires: member-seed
//
// สัญญาไฟล์:
//   src/app/app/sys/[id]/member/tiers/page.tsx (ภาพ 04: บันไดระดับ 4 ขั้น + จำนวนคน · กฎ upgrade/keep ของระดับที่เลือก · รอบประเมิน/ผ่อนผัน/แจ้งล่วงหน้า · ปุ่มทดลองรัน → รายชื่อเลื่อน/ลด · ประวัติล่าสุด · การ์ดแบบเสียเงิน · ตัวอย่างบัตร LINE)
//   src/app/app/sys/[id]/member/tiers/[id]/page.tsx (ภาพ 15: benefits editor 9 ชนิด + ตั้งค่าระดับ) · nav.ts tiers → ready
//   src/lib/modules/member/tiers-actions.ts ("use server" · gate member.tier.manage ผ่าน access.ts hasMemberPerm · ทุก action เรียก tiers.ts · revalidatePath · {ok,reason})
//   src/components/member/{TierLadder,TierRuleBuilder,TierBenefitsEditor,TierDryRun,TierHistory,TierCardPreview}.tsx
//   testid: tiers-page tiers-ladder tiers-tier-{key} tiers-rule-builder tiers-rule-upgrade tiers-rule-keep tiers-benefits tiers-benefit-{type} tiers-dryrun tiers-dryrun-run tiers-dryrun-result tiers-history tiers-paid-plan tiers-card-preview tiers-add
//   TierRuleBuilder reuse `src/components/kanban/AutomationBuilder.tsx` ด้วย prop scope="MEMBER_TIER" (เงื่อนไข spent12m/spent{window}/visits12m/tierPoints/memberDays/paidPlan/referrals · ไม่แสดง trigger/action ของบอร์ด) — ถ้า reuse ตรงไม่ได้ ให้แยก component แต่ใช้ชุด UI/โทเคนเดียวกันและอธิบายใน wo-notes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
const PAGE = "src/app/app/sys/[id]/member/tiers/page.tsx";
if (!existsSync(PAGE) || !existsSync("src/lib/modules/member/tiers-actions.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (member/tiers/page.tsx · tiers-actions.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const has = (src: string, ...n: (string | RegExp)[]) => n.every((x) => (typeof x === "string" ? src.includes(x) : x.test(src)));
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const page = read(PAGE); const page2 = read("src/app/app/sys/[id]/member/tiers/[id]/page.tsx"); const act = read("src/lib/modules/member/tiers-actions.ts");
  const uiAll = readdirSync("src/components/member").filter((f) => f.endsWith(".tsx")).map((f) => read(`src/components/member/${f}`)).join("\n");
  const all = page + page2 + uiAll;
  // ═══ S1 actions + สิทธิ์ ═══
  const exports = [...stripComments(act).matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]!);
  const NEED = ["createTierDef", "updateTierDef", "reorderTierDefs", "archiveTierDef", "setBenefits", "setTierRules", "dryRun", "setManualTier", "reviewNow"];
  chk("M1.10-S1.1", "tiers-actions.ts: 'use server' · export เฉพาะ *Action ≥ 9 (createTierDef/updateTierDef/reorderTierDefs/archiveTierDef/setBenefits/setTierRules/dryRun/setManualTier/reviewNow) · gate เดียว = requireTenant + ระบบ MEMBER + hasMemberPerm(member.tier.manage) (setManual → member.tier.setManual) · เรียก tiers.ts เท่านั้น (ไม่แตะ prisma.memberTier* ตรง) · revalidatePath · safeReason", /^\s*"use server"/m.test(act) && exports.length >= 9 && exports.every((n) => /Action$/.test(n)) && NEED.every((n) => new RegExp(`${n}\\w*Action`).test(act)) && has(act, "requireTenant", "member.tier.manage", "member.tier.setManual", "revalidatePath", "safeReason", /from "\.\/tiers"|member\/tiers"/) && !/prisma\.memberTier/.test(act), "ครบ", `exports=${exports.join(",")} missing=${NEED.filter((n) => !new RegExp(`${n}\\w*Action`).test(act)).join(",")}`);
  const A = (await import("@/lib/modules/member/access" as string)) as Any;
  const mk = (role: string, permissions: Record<string, unknown>) => ({ userId: "u", role, unitAccess: ["*"], permissions });
  chk("M1.10-S1.2", "access.ts: hasMemberPerm(actor, 'member.tier.manage') — OWNER ✓ · MANAGER ✓ (ไม่อยู่ใน 4 คีย์ยกเว้น) · STAFF ✗ เว้นมีคีย์ · hasMemberPerm(actor,'member.tier.setManual') — STAFF ✗ · canReadTiers/หน้า tiers ใช้ member.tier.read (read-โดยนัย)", typeof A.hasMemberPerm === "function" && A.hasMemberPerm(mk("OWNER", {}), "member.tier.manage") === true && A.hasMemberPerm(mk("MANAGER", {}), "member.tier.manage") === true && A.hasMemberPerm(mk("STAFF", {}), "member.tier.manage") === false && A.hasMemberPerm(mk("STAFF", { "member.tier.manage": true }), "member.tier.manage") === true && A.hasMemberPerm(mk("STAFF", { "member.tier.manage": true }), "member.tier.setManual") === false, "ตาม §6.1", `${[A.hasMemberPerm?.(mk("OWNER", {}), "member.tier.manage"), A.hasMemberPerm?.(mk("MANAGER", {}), "member.tier.manage"), A.hasMemberPerm?.(mk("STAFF", {}), "member.tier.manage")].join("/")}`);
  chk("M1.10-S1.3", "page.tsx: requireTenant · ระบบ MEMBER · canReadMember + สิทธิ์ member.tier.read (ไม่มี = notFound) · โหลด listTierDefs + getTierRules + ประวัติล่าสุด (MemberTierHistory 20 แถว) + MemberPlan (แบบเสียเงิน) · ปุ่มแก้แสดงเฉพาะเมื่อ hasMemberPerm tier.manage (STAFF อ่านอย่างเดียว)", has(page, "requireTenant", "notFound", /type:\s*"MEMBER"/, "listTierDefs", "getTierRules", /memberTierHistory|listTierHistory/, /memberPlan|listPlans/, "member.tier.manage"), "ครบ", `missing=${["requireTenant", "notFound", "listTierDefs", "getTierRules", "member.tier.manage"].filter((k) => !page.includes(k)).join(",")}`);
  const TIDS = ["tiers-page", "tiers-ladder", "tiers-tier-", "tiers-rule-builder", "tiers-rule-upgrade", "tiers-rule-keep", "tiers-benefits", "tiers-benefit-", "tiers-dryrun", "tiers-dryrun-run", "tiers-dryrun-result", "tiers-history", "tiers-paid-plan", "tiers-card-preview", "tiers-add"];
  chk("M1.10-S1.4", "testid ครบ 15 · ไม่มีอีโมจิ · ไม่มี hex สีใน tsx · MemberTabs + PageHeader · nav.ts tiers = ready", TIDS.every((t) => all.includes(t)) && !EMOJI.test(stripComments(uiAll)) && !/#[0-9a-fA-F]{6}\b/.test(stripComments(uiAll)) && /MemberTabs/.test(page) && /PageHeader/.test(page) && /key:\s*"tiers"[^}]*status:\s*"ready"/.test(read("src/lib/modules/member/nav.ts")), "ครบ", `missing=${TIDS.filter((t) => !all.includes(t)).join(",")}`);
  // ═══ S2 รายละเอียด UI ═══
  chk("M1.10-S2.1", "ตัวสร้างกฎ: reuse AutomationBuilder (import จาก components/kanban/AutomationBuilder + prop scope) หรือ TierRuleBuilder ที่ใช้ชุดฟิลด์ 7 (spent12m spent visits12m tierPoints memberDays paidPlan referrals · ป้ายไทย) + match ALL/ANY + windowMonths · เก็บผ่าน setTierRulesAction · แยก upgrade/keep · rอบประเมิน (cron) / graceDays / notifyBeforeDays แก้ได้", (/AutomationBuilder/.test(uiAll) || /TierRuleBuilder/.test(uiAll)) && ["spent12m", "visits12m", "tierPoints", "memberDays", "paidPlan", "referrals"].every((f) => uiAll.includes(f)) && /ALL|ANY/.test(uiAll) && /windowMonths/.test(uiAll) && /setTierRules\w*Action/.test(uiAll) && /graceDays/.test(uiAll) && /notifyBeforeDays/.test(uiAll), "ครบ", `builder=${/AutomationBuilder|TierRuleBuilder/.test(uiAll)} fields=${["spent12m", "visits12m", "tierPoints", "memberDays", "paidPlan", "referrals"].filter((f) => !uiAll.includes(f)).join(",")}`);
  const TYPES = ["DISCOUNT_PCT", "DISCOUNT_FIXED", "POINT_MULTIPLIER", "WELCOME_VOUCHER", "BIRTHDAY_GIFT", "FREE_SERVICE", "PRIORITY_BOOKING", "NO_POINT_EXPIRY", "CANCEL_FEE_DISCOUNT", "EXCLUSIVE_ITEMS"];
  chk("M1.10-S2.2", "benefits editor (ภาพ 15): ชนิดครบ 10 (ป้ายไทยจาก registry ไม่ฮาร์ดโค้ดใน JSX) · ฟอร์ม config ต่อชนิด (pct/maxSatang · x · daysAhead · templateId (M2.5 stub เลือกไม่ได้ = ป้าย 'มีในใบ M2.5') · itemIds) · สวิตช์ active · บันทึกทั้งชุดผ่าน setBenefitsAction", TYPES.every((t) => all.includes(t)) && /setBenefits\w*Action/.test(uiAll) && /maxSatang/.test(uiAll) && /daysAhead/.test(uiAll) && /active/.test(uiAll) && /M2\.5|เร็ว ๆ นี้/.test(uiAll), "ครบ 10", `missing=${TYPES.filter((t) => !all.includes(t)).join(",")}`);
  chk("M1.10-S2.3", "ทดลองรัน: ปุ่ม tiers-dryrun-run → dryRunAction (runTierReview dryRun ทั้งระบบ) → ตาราง tiers-dryrun-result (จะเลื่อน n / จะลด n / คง n / ใกล้ลด n + รายชื่อ 20 แรกพร้อม evidence) · ปุ่ม 'ประเมินทั้งร้านตอนนี้' (reviewNowAction) มีการยืนยัน (ConfirmDialog) · ประวัติ: ตาราง tiers-history (วันที่ · สมาชิก · จาก→ไป · เหตุผลไทย · หลักฐาน)", /dryRun\w*Action/.test(uiAll) && /tiers-dryrun-result/.test(uiAll) && /reviewNow\w*Action/.test(uiAll) && /ConfirmDialog/.test(uiAll) && /RULE_UPGRADE|RULE_DOWNGRADE|MANUAL|INITIAL/.test(uiAll) && /evidence/.test(uiAll), "ครบ", `dry=${/dryRun\w*Action/.test(uiAll)} review=${/reviewNow\w*Action/.test(uiAll)} confirm=${/ConfirmDialog/.test(uiAll)}`);
  chk("M1.10-S2.4", "บันได: ระดับเรียง sortOrder พร้อมสี (TagColor → โทเคน) · จำนวนคน · ปุ่มเพิ่มระดับ (tiers-add · เพดาน 10 จาก MEMBER_LIMITS) · ลากเรียง/ปุ่มเลื่อน (reorderTierDefsAction) · archive มี ConfirmDialog + เลือกระดับปลายทาง (moveToTierId) · การ์ดแบบเสียเงิน (tiers-paid-plan · เชื่อม MemberPlan/paidPlanId) · ตัวอย่างบัตร LINE (tiers-card-preview · ชื่อระดับ+สี+สิทธิ์ 3 ข้อแรก)", /reorderTierDefs\w*Action/.test(uiAll) && /moveToTierId/.test(uiAll) && /MEMBER_LIMITS/.test(all) && /paidPlanId/.test(all) && /tiers-card-preview/.test(uiAll) && /archiveTierDef\w*Action/.test(uiAll), "ครบ", `reorder=${/reorderTierDefs\w*Action/.test(uiAll)} move=${/moveToTierId/.test(uiAll)} limits=${/MEMBER_LIMITS/.test(all)} plan=${/paidPlanId/.test(all)}`);
  // ═══ S3 ภาพ ═══
  const dir = `${mq.MQC.shotsDir}/1.10`;
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  const sumOf = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sumOf(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  chk("M1.10-S3.1", "ภาพ 04: tiers-owner desktop+mobile 200 ไม่มี console error · tiers-dryrun-result-desktop (หลังกดทดลองรัน) มีผล", shots.includes("tiers-owner-desktop.png") && shots.includes("tiers-owner-mobile.png") && r("owner", "tiers-owner", "desktop")?.status === 200 && r("owner", "tiers-owner", "desktop")?.errors?.length === 0 && r("owner", "tiers-owner", "mobile")?.status === 200 && shots.includes("tiers-dryrun-result-desktop.png") && r("owner", "tiers-dryrun-result", "desktop")?.missing?.length === 0, "200 ×3", `shots=${shots.join(",")}`, "MAJOR");
  chk("M1.10-S3.2", "ภาพ 15: tiers-benefits-owner-desktop 200 (หน้า /tiers/{gold}) testid tiers-benefits + tiers-benefit-DISCOUNT_PCT", shots.includes("tiers-benefits-owner-desktop.png") && r("owner", "tiers-benefits-owner", "desktop")?.status === 200 && r("owner", "tiers-benefits-owner", "desktop")?.missing?.length === 0, "200", `${r("owner", "tiers-benefits-owner", "desktop")?.status}`, "MAJOR");
  chk("M1.10-S3.3", "thana (STAFF ไม่มี member.tier.read โดยตรง แต่ read-โดยนัยจากคีย์ member.*) → 200 อ่านอย่างเดียว (ไม่มีปุ่มแก้ · tiers-add ไม่ปรากฏ) · noperm → 404", r("thana", "tiers-thana", "desktop")?.status === 200 && r("thana", "tiers-thana", "desktop")?.missing?.length === 0 && r("noperm", "tiers-noperm", "desktop")?.status === 404, "200/404", `${r("thana", "tiers-thana", "desktop")?.status}/${r("noperm", "tiers-noperm", "desktop")?.status}`, "MAJOR");
  chk("M1.10-S3.4", "🔴 parity ภาพ 04 + 15 — Fable ตรวจด้วยตา · wo-notes/member-M1.10.md มี 'PARITY: ผ่าน'", /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M1.10.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.10-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.10: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
