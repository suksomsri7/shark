// QC — ระบบสมาชิก v2 WO M1.3: ตัวออกแบบฟิลด์ (UI) + ทะเบียนเมนู 9 หมวด + สิทธิ์ member.* v2 + เทมเพลตกิจการ (ข้อมูลชุดแรก)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/MEMBER-RUN.md §2 M1.3 · พิมพ์เขียว §2.2 §3.3 §6.1 §11.2 · ภาพ ledger/design-member/03-field-designer.png
// requires: member-seed
//
// สัญญาไฟล์:
//   src/app/app/sys/[id]/member/settings/fields/page.tsx — requireTenant · AppSystem type MEMBER ของร้าน (ไม่ใช่ = notFound) · ไม่มี member.settings.manage = notFound (404-not-403)
//   src/components/member/FieldDesigner.tsx ("use client") — testid field-designer · field-palette (11 ชนิด) · field-section-{key} · field-item-{key} · field-props · field-props-label ·
//     field-prop-{label,type,options,required,default,unique,filterable,showInList,customerEditable,sensitive,trackHistory} · field-template-select · field-preview-mobile · field-counter ("n / 60")
//   src/lib/modules/member/fields-actions.ts ("use server") — ทุก action ผ่านด่าน member.settings.manage แล้วเรียก fields.ts (ห้ามแตะ prisma ตรง) · revalidatePath
//   src/lib/modules/member/field-types.ts — FIELD_TYPE_LABELS 11 ชนิด (ไทย) + ไอคอน/คำอธิบายสั้น (ไฟล์บริสุทธิ์ ใช้ได้ทั้ง client/server)
//   src/lib/modules/member/nav.ts — MEMBER_NAV 9 หมวด §2.2 (members tiers points stamps rewards promotions campaigns reports settings) status ready|soon + memberNavChildren(base, actor) · layout.tsx ใช้ทะเบียนนี้แทนรายการมือ
//   src/lib/modules/member/access.ts — toMemberActor · canReadMember (read-โดยนัย: มีคีย์ member.* ใดก็ได้) · canManageSettings (ไฟล์บริสุทธิ์)
//   src/lib/core/permissions.ts — คีย์ member.* v2 ครบตาม §6.1 (ป้ายไทย) · คีย์เดิม 8 ตัวคง
//   src/lib/modules/member/templates/index.ts — TEMPLATES อย่างน้อย dive/general (M1.2) + ชุดที่ 2–16 ทยอยได้ถึง M3.9 · หน้า UI แสดง dropdown จากทะเบียนนี้
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
const PAGE = "src/app/app/sys/[id]/member/settings/fields/page.tsx";
if (!existsSync(PAGE) || !existsSync("src/components/member/FieldDesigner.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (member/settings/fields/page.tsx · components/member/FieldDesigner.tsx)");
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
const has = (src: string, ...needles: (string | RegExp)[]) => needles.every((n) => (typeof n === "string" ? src.includes(n) : n.test(src)));
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const page = read(PAGE); const ui = read("src/components/member/FieldDesigner.tsx"); const act = read("src/lib/modules/member/fields-actions.ts");
  const types = read("src/lib/modules/member/field-types.ts"); const nav = read("src/lib/modules/member/nav.ts"); const access = read("src/lib/modules/member/access.ts");
  const perms = read("src/lib/core/permissions.ts"); const layout = read("src/app/app/layout.tsx");
  const uiAll = [ui, ...readdirSync("src/components/member").filter((f) => f.endsWith(".tsx")).map((f) => read(`src/components/member/${f}`))].join("\n");

  // ═══ S1 static ═══
  chk("M1.3-S1.1", "page.tsx: requireTenant · หา AppSystem {id, tenantId, type MEMBER} ไม่เจอ = notFound · ไม่มี member.settings.manage = notFound (ไม่ใช่ 403/หน้าว่าง) · โหลด layout ผ่าน fields.listLayout + เทมเพลตจาก templates registry · render <FieldDesigner …>", has(page, "requireTenant", "notFound", /type:\s*"MEMBER"/, "member.settings.manage", /listLayout|getLayout/, "FieldDesigner", /templates/), "ครบ", `missing: ${["requireTenant", "notFound", "MEMBER", "member.settings.manage", "listLayout", "FieldDesigner", "templates"].filter((k) => !page.includes(k)).join(",")}`);
  const TESTIDS = ["field-designer", "field-palette", "field-props", "field-props-label", "field-template-select", "field-preview-mobile", "field-counter", "field-item-", "field-section-", "field-prop-required", "field-prop-unique", "field-prop-filterable", "field-prop-showInList", "field-prop-customerEditable", "field-prop-sensitive", "field-prop-trackHistory", "field-prop-type", "field-prop-options", "field-prop-default", "field-prop-label"];
  chk("M1.3-S1.2", "FieldDesigner.tsx: 'use client' · testid ครบ 20 (designer/palette/props/props-label/template-select/preview-mobile/counter/item-/section-/prop-×11) · ใช้ @dnd-kit (ลากเรียงส่วน+ฟิลด์) · ไม่มีอีโมจิใน UI · ตัวนับ '/ 60' อ่านจาก MEMBER_LIMITS ไม่ฮาร์ดโค้ด", /^\s*"use client"/m.test(ui) && TESTIDS.every((t) => uiAll.includes(t)) && /@dnd-kit/.test(uiAll) && !EMOJI.test(stripComments(uiAll)) && /MEMBER_LIMITS|limits/.test(uiAll) && !/\/\s*60\b/.test(stripComments(uiAll).replace(/MEMBER_LIMITS\.fields/g, "")), "ครบ", `missing testid: ${TESTIDS.filter((t) => !uiAll.includes(t)).join(",")} · dnd=${/@dnd-kit/.test(uiAll)} emoji=${EMOJI.test(stripComments(uiAll))}`);
  const T = (await import("@/lib/modules/member/field-types" as string)) as Any;
  const labels = T.FIELD_TYPE_LABELS ?? {};
  const ELEVEN = ["TEXT", "LONG_TEXT", "NUMBER", "MONEY", "DATE", "DATETIME", "SELECT", "MULTI_SELECT", "BOOLEAN", "FILE", "LOOKUP"];
  chk("M1.3-S1.3", "field-types.ts: FIELD_TYPE_LABELS 11 ชนิด ป้ายไทย (ข้อความสั้น/ข้อความยาว/ตัวเลข/จำนวนเงิน/วันที่/วันที่+เวลา/ตัวเลือกเดียว/หลายตัวเลือก/ใช่-ไม่ใช่/ไฟล์/อ้างอิง…) · FIELD_TYPE_ORDER 11 · ไฟล์บริสุทธิ์ (ไม่ import prisma/next) · palette ใน UI วนจากทะเบียนนี้", ELEVEN.every((k) => typeof labels[k] === "string" && /[ก-๙]/.test(labels[k])) && Array.isArray(T.FIELD_TYPE_ORDER) && T.FIELD_TYPE_ORDER.length === 11 && !/@\/lib\/core\/db|from "next/.test(types) && /field-types/.test(uiAll), "11 ป้ายไทย", `${ELEVEN.filter((k) => !labels[k]).join(",") || "ครบ"} order=${T.FIELD_TYPE_ORDER?.length}`);
  const actExports = [...stripComments(act).matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]!);
  const ACTIONS = ["createSection", "updateSection", "reorderSections", "deleteSection", "createField", "updateField", "reorderFields", "archiveField", "restoreField", "applyTemplate"];
  chk("M1.3-S1.4", "fields-actions.ts: 'use server' · export เฉพาะ *Action (≥ 10: section create/update/reorder/delete · field create/update/reorder/archive/restore · applyTemplate) · ทุก action ผ่านด่านเดียว (gate → requireTenant + assertCan member.settings.manage + ระบบ MEMBER ของร้าน) · เรียก fields.ts ไม่แตะ prisma.member* ตรง · revalidatePath · คืน {ok:false, reason ไทย} ผ่าน safeReason", /^\s*"use server"/m.test(act) && actExports.length >= 10 && actExports.every((n) => /Action$/.test(n)) && ACTIONS.every((a) => new RegExp(`${a}\\w*Action`).test(act)) && has(act, "requireTenant", "assertCan", "member.settings.manage", "revalidatePath", "safeReason", /from "\.\/fields"|@\/lib\/modules\/member\/fields"/) && !/prisma\.member(Section|Field)/.test(act) && (act.match(/gate\(|guard\(/g) ?? []).length >= 10, "ครบ", `exports=${actExports.join(",")} · missing=${ACTIONS.filter((a) => !new RegExp(`${a}\\w*Action`).test(act)).join(",")} gate=${(act.match(/gate\(|guard\(/g) ?? []).length}`);
  const KEYS = ["member.customer.read", "member.customer.create", "member.customer.update", "member.customer.merge", "member.customer.import", "member.customer.export", "member.customer.delete", "member.sensitive.read", "member.tier.read", "member.tier.manage", "member.tier.setManual", "member.point.read", "member.point.adjust", "member.point.transfer", "member.loyalty.read", "member.loyalty.manage", "member.loyalty.stamp", "member.loyalty.fulfil", "member.promo.read", "member.promo.issue", "member.promo.manage", "member.giftcard.sell", "member.giftcard.manage", "member.review.read", "member.review.reply", "member.referral.manage", "member.report.view", "member.settings.manage", "member.privacy.manage", "member.api.manage"];
  const permMod = (await import("@/lib/core/permissions" as string)) as Any;
  const keySet: Set<string> = permMod.PERMISSION_KEYS;
  const OLD = ["member.tier.update", "member.plan.create", "member.plan.update", "member.subscription.create", "member.subscription.cancel"];
  chk("M1.3-S1.5", "permissions.ts: คีย์ member.* v2 ครบ 30 (§6.1) ป้ายไทย · คีย์เดิม (tier.update/plan.*/subscription.*) ยังอยู่ (backward compat) · permissionLabel() คืนไทยทุกคีย์", KEYS.every((k) => keySet.has(k)) && OLD.every((k) => keySet.has(k)) && KEYS.every((k) => /[ก-๙]/.test(permMod.permissionLabel(k))), "30 + เดิม 5", `missing: ${KEYS.filter((k) => !keySet.has(k)).join(",")} · old missing: ${OLD.filter((k) => !keySet.has(k)).join(",")}`);
  const N = (await import("@/lib/modules/member/nav" as string)) as Any;
  const navEntries: Any[] = N.MEMBER_NAV ?? [];
  const NAV_KEYS = ["members", "tiers", "points", "stamps", "rewards", "promotions", "campaigns", "reports", "settings"];
  const readyMissingPage = navEntries.filter((e) => e.status === "ready").filter((e) => { const p = `src/app/app/sys/[id]${String(e.path).split("#")[0]!.split("?")[0]}/page.tsx`; return !existsSync(p); }).map((e) => e.key);
  chk("M1.3-S1.6", "nav.ts: MEMBER_NAV 9 หมวด §2.2 (members tiers points stamps rewards promotions campaigns reports settings · ป้ายไทย · path ใต้ /member/…) · status ready ต้องมี page.tsx จริง (settings → /member/settings/fields ready) · memberNavChildren(base, actor) · layout.tsx case MEMBER ใช้ memberNavChildren (ไม่ใช่รายการมือ)", navEntries.length === 9 && NAV_KEYS.every((k) => navEntries.some((e) => e.key === k && /[ก-๙]/.test(e.label) && /^\/member\//.test(e.path) && ["ready", "soon"].includes(e.status))) && readyMissingPage.length === 0 && navEntries.find((e) => e.key === "settings")?.status === "ready" && typeof N.memberNavChildren === "function" && /memberNavChildren/.test(layout) && !/member\/customers.*label:\s*"รายชื่อสมาชิก"/.test(stripComments(layout)), "9 หมวด · ready มีหน้า", `n=${navEntries.length} keys=${navEntries.map((e) => `${e.key}:${e.status}`).join(",")} readyNoPage=${readyMissingPage.join(",")} layout=${/memberNavChildren/.test(layout)}`);

  // ═══ S2 access + รายละเอียด UI ═══
  const A = (await import("@/lib/modules/member/access" as string)) as Any;
  const mk = (role: string, permissions: Record<string, unknown>, unitAccess: string[] = ["*"]) => ({ userId: "u", role, unitAccess, permissions });
  chk("M1.3-S2.1", "access.ts (บริสุทธิ์): canReadMember — OWNER/MANAGER ผ่าน · STAFF ผ่านเมื่อมีคีย์ member.* ใดก็ได้ (read-โดยนัย บทเรียน K3.1) · STAFF ไม่มีคีย์ member.* = ไม่ผ่าน · canManageSettings — OWNER ผ่าน · MANAGER ไม่ผ่านโดยปริยาย (§6.1) เว้นมีคีย์ · STAFF ต้องมีคีย์ member.settings.manage", !/@\/lib\/core\/db|from "next/.test(access) && A.canReadMember(mk("OWNER", {})) === true && A.canReadMember(mk("MANAGER", {})) === true && A.canReadMember(mk("STAFF", { "member.loyalty.stamp": true })) === true && A.canReadMember(mk("STAFF", { "kanban.card.create": true })) === false && A.canManageSettings(mk("OWNER", {})) === true && A.canManageSettings(mk("MANAGER", {})) === false && A.canManageSettings(mk("MANAGER", { "member.settings.manage": true })) === true && A.canManageSettings(mk("STAFF", { "member.settings.manage": true })) === true && A.canManageSettings(mk("STAFF", { "member.customer.read": true })) === false, "ตามตาราง §6.1", `read: ${[A.canReadMember?.(mk("OWNER", {})), A.canReadMember?.(mk("STAFF", { "member.loyalty.stamp": true })), A.canReadMember?.(mk("STAFF", { "kanban.card.create": true }))].join("/")} settings: ${[A.canManageSettings?.(mk("OWNER", {})), A.canManageSettings?.(mk("MANAGER", {})), A.canManageSettings?.(mk("STAFF", { "member.settings.manage": true }))].join("/")}`);
  chk("M1.3-S2.2", "แผงคุณสมบัติ: ฟิลด์ระบบ (isSystem) ปิดการแก้ type/key/unique/archive (disabled + คำอธิบาย 'ฟิลด์ระบบ') · เปิด customerEditable กับฟิลด์ sensitive → คำเตือน (§11.2 'ไม่ควร') · archive ต้องยืนยัน (ConfirmDialog) · LOOKUP เลือก target 5 ชนิด · SELECT/MULTI แก้ choices ได้ (เพิ่ม/ลบ/สี)", has(uiAll, /isSystem/, /disabled/, /ฟิลด์ระบบ/, /ConfirmDialog/, /customerEditable/, /อ่อนไหว/, /PRODUCT|SERVICE|EMPLOYEE|UNIT|CUSTOMER/, /choices/), "ครบ", `missing: ${["isSystem", "disabled", "ฟิลด์ระบบ", "ConfirmDialog", "customerEditable", "อ่อนไหว", "EMPLOYEE", "choices"].filter((k) => !uiAll.includes(k)).join(",")}`, "MAJOR");
  chk("M1.3-S2.3", "เทมเพลตกิจการ: dropdown (field-template-select) วนจาก TEMPLATES registry (ชื่อไทย · ไม่ฮาร์ดโค้ดรายชื่อกิจการใน UI) · กด 'ใช้เทมเพลต' → ยืนยันก่อน (จะเพิ่ม n ส่วน / m ฟิลด์ · ไม่ทับของเดิม) → applyTemplateAction · ตัวอย่างมือถือ (field-preview-mobile) เรียงตามส่วน/ฟิลด์ · ส่วนอ่อนไหวมีไอคอนล็อก (KanbanIcon/MemberIcon ไม่ใช่อีโมจิ)", has(page, /TEMPLATES|listTemplates/) && has(uiAll, "field-template-select", /applyTemplate\w*Action/, /ไม่ทับ|ของเดิม/, "field-preview-mobile", /sensitive/) && !/ดำน้ำ.*คลินิก.*ร้านอาหาร/.test(stripComments(uiAll)) && (/MemberIcon|KanbanIcon|AccountIcon|lucide/.test(uiAll)), "ครบ", `page templates=${/TEMPLATES|listTemplates/.test(page)} ui=${["field-template-select", "applyTemplate", "ไม่ทับ", "field-preview-mobile"].filter((k) => !uiAll.includes(k)).join(",")}`, "MAJOR");
  const memberIcon = existsSync("src/components/member/MemberIcon.tsx");
  const tabs = existsSync("src/components/member/MemberTabs.tsx");
  chk("M1.3-S2.4", "โครง UI ชุดเดียวกับบอร์ดงาน/บัญชี: MemberIcon.tsx (ไอคอน SVG ชุดโมดูล · pattern AccountIcon/KanbanIcon) · MemberTabs.tsx (แถบหมวด 9 จาก nav.ts · soon = จาง + 'เร็ว ๆ นี้') · หน้า settings/fields ใช้ PageHeader + MemberTabs · โทเคนสี/ระยะจาก globals.css (ไม่มี hex สีใหม่ใน tsx)", memberIcon && tabs && /MemberTabs/.test(page) && /PageHeader/.test(page) && /memberNavItems|MEMBER_NAV/.test(read("src/components/member/MemberTabs.tsx")) && !/#[0-9a-fA-F]{6}\b/.test(stripComments(uiAll)), "ครบ", `icon=${memberIcon} tabs=${tabs} page=${/MemberTabs/.test(page)}/${/PageHeader/.test(page)} hex=${/#[0-9a-fA-F]{6}\b/.test(stripComments(uiAll))}`, "MAJOR");

  // ═══ S3 ภาพ (visual-member.mts 1.3 — owner + thana) ═══
  const dir = `${mq.MQC.shotsDir}/1.3`;
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  const sumO = existsSync(`${dir}/summary-owner.json`) ? JSON.parse(read(`${dir}/summary-owner.json`)) : null;
  const sumT = existsSync(`${dir}/summary-thana.json`) ? JSON.parse(read(`${dir}/summary-thana.json`)) : null;
  const rO = (n: string, d: string) => sumO?.results?.find((r: Any) => r.name === n && r.device === d);
  chk("M1.3-S3.1", "ภาพ owner: field-designer-owner-desktop/mobile + field-designer-selected-desktop (≥ 3 ใบ) · HTTP 200 · testid ครบ · ไม่มี console error", ["field-designer-owner-desktop.png", "field-designer-owner-mobile.png", "field-designer-selected-desktop.png"].every((f) => shots.includes(f)) && rO("field-designer-owner", "desktop")?.status === 200 && rO("field-designer-owner", "desktop")?.missing?.length === 0 && rO("field-designer-owner", "desktop")?.errors?.length === 0 && rO("field-designer-selected", "desktop")?.missing?.length === 0, "3 ใบ · 200", `shots=${shots.join(",")} owner=${JSON.stringify(rO("field-designer-owner", "desktop") ?? null)?.slice(0, 160)}`, "MAJOR");
  const rT = sumT?.results?.find((r: Any) => r.name === "field-designer-thana" && r.device === "desktop");
  chk("M1.3-S3.2", "ภาพ thana (STAFF ไม่มี settings.manage): HTTP 404 (notFound) ไม่ใช่ 200 หน้าว่าง/500", shots.includes("field-designer-thana-desktop.png") && rT?.status === 404, "404", `status=${rT?.status} shots=${shots.includes("field-designer-thana-desktop.png")}`, "MAJOR");
  chk("M1.3-S3.3", "มือถือ (390): ตัวออกแบบใช้ได้ — palette เป็นแถบเลื่อน/ปุ่ม '+ เพิ่มฟิลด์' · แผงคุณสมบัติเป็น sheet ล่าง (ไม่ซ้อนทับจนกดไม่ได้) · ไม่มี console error", rO("field-designer-owner", "mobile")?.status === 200 && rO("field-designer-owner", "mobile")?.errors?.length === 0 && /sheet|bottom|fixed inset-x-0 bottom-0|md:hidden|lg:hidden/.test(uiAll), "200 · responsive", `mobile=${JSON.stringify(rO("field-designer-owner", "mobile") ?? null)?.slice(0, 120)} responsive=${/sheet|bottom-0|md:hidden|lg:hidden/.test(uiAll)}`, "MAJOR");
  chk("M1.3-S3.4", "🔴 parity กับภาพ 03 — Fable ตรวจด้วยตา (ledger/wo-notes/member-M1.3.md ต้องมีหัวข้อ 'ตรวจภาพ' ที่ Fable เขียนผล) · ข้อนี้เขียวเมื่อไฟล์โน้ตมีบรรทัด 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M1.3.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.3-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.3: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
