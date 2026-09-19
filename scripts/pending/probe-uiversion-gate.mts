// probe-uiversion-gate.mts — ประตู `settings.crm.uiVersion` (มติ C23 · R-E.14): uiVersion 1 = หน้า v1 เดิม · v2 มองไม่เห็นและใช้ไม่ได้
// builder probe (ไม่ใช่ oracle) · QC database only (.env.qc) · throwaway tenant `qc-uvg-<rand>` ลบใน finally
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-uiversion-gate.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const env = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
console.log(`[env] DB ${env.loadQcEnv().host}`);
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const UV = (await import("@/lib/modules/crm/ui-version" as string)) as Any;
const ST = (await import("@/lib/modules/crm/settings" as string)) as Any;
const UI = (await import("@/lib/modules/crm/ui" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const git = (spec: string) => execFileSync("git", ["show", spec], { encoding: "utf8" });
const results: { id: string; ok: boolean }[] = [];
const chk = (id: string, t: string, ok: boolean, info = "") => {
  results.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${t}${ok ? "" : ` — ${info}`}`);
};
const settle = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return { ok: true, e: null as Any };
  } catch (e) {
    return { ok: false, e: e as Any };
  }
};
const isNotFound = (e: Any) => !!e && /404|NOT_FOUND/i.test(String(e.digest ?? e.message ?? ""));
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-uvg-${rand}`;
const PAGES = "src/app/app/sys/[id]/crm";
const V2_ONLY = ["companies/page.tsx", "companies/[companyId]/page.tsx", "companies/new/page.tsx", "contacts/new/page.tsx", "contacts/[contactId]/page.tsx", "deals/new/page.tsx", "deals/[dealId]/page.tsx", "pipelines/page.tsx", "settings/pipelines/page.tsx", "settings/stages/page.tsx", "settings/lost-reasons/page.tsx", "settings/visibility/page.tsx"];
const V2_ACTIONS = ["companies-actions.ts", "contacts-actions.ts", "deals-actions.ts", "pipelines-actions.ts", "lost-reasons-actions.ts"];
let tid = "";

try {
  // ── static: หน้า v1 เดิมทุกตัวอักษร · route v2 มีประตู · action v2 มีประตู · action v1 ไม่มี ──
  const v1c = read(`${PAGES}/contacts/_components/ContactsV1Page.tsx`);
  const v1d = read(`${PAGES}/deals/_components/DealsV1Page.tsx`);
  const strip = (s: string) => s.split("\n").filter((l) => !l.startsWith("// CRM uiVersion gate")).join("\n").replace(/export async function \w+V1Page\(/, "export default async function X(").replace(/export default async function Crm\w+Page\(/, "export default async function X(");
  chk("V1.1", "ContactsV1Page = หน้า contacts ก่อน C1.4 (4f8af9d) ทุกตัวอักษร ยกเว้นหัวคอมเมนต์ + ชื่อ export · แสดง CrmContactsSection (ตัวบ่งชี้ v1)", strip(v1c) === strip(git(`4f8af9d:${PAGES}/contacts/page.tsx`)) && /CrmContactsSection/.test(v1c));
  chk("V1.2", "DealsV1Page = หน้า deals ก่อน C1.5 (919e7d6) ทุกตัวอักษร ยกเว้นหัวคอมเมนต์ + ชื่อ export · แสดง CrmDealsSection (ตัวบ่งชี้ v1)", strip(v1d) === strip(git(`919e7d6:${PAGES}/deals/page.tsx`)) && /CrmDealsSection/.test(v1d));
  const pc = read(`${PAGES}/contacts/page.tsx`);
  const pd = read(`${PAGES}/deals/page.tsx`);
  const branch = (s: string, comp: string) => new RegExp(`pickCrmPage\\(await crmUiVersion\\([^)]*\\)\\) === "v1"\\) return <${comp}`).test(s) && s.indexOf(`<${comp}`) < s.indexOf("toMemberActor(auth.user.id");
  chk("V1.3", "contacts/page.tsx + deals/page.tsx เลือกหน้า v1 เมื่อ uiVersion ≠ 2 ก่อนอ่านข้อมูล v2 ใด ๆ", branch(pc, "ContactsV1Page") && branch(pd, "DealsV1Page"));
  const miss = V2_ONLY.filter((f) => !/await requireCrmV2Page\(\{ tenantId[^}]*systemId: id \}\)/.test(read(`${PAGES}/${f}`)));
  chk("V2.1", `route ที่มีเฉพาะ v2 ทั้ง ${V2_ONLY.length} หน้าเรียก requireCrmV2Page (→ notFound) หลังตรวจระบบ`, miss.length === 0, miss.join(","));
  const aMiss = V2_ACTIONS.filter((f) => { const s = read(`src/lib/modules/crm/${f}`); return !/await assertCrmV2\(ctx\);\n\s*return \{ ctx, actor/.test(s) || !/instanceof CrmV2DisabledError/.test(s); });
  chk("V2.2", "server action ของหน้า v2 ทุกไฟล์ผ่าน assertCrmV2 ใน session() + แปลง error เป็น FORBIDDEN ไทย · actions.ts (v1) ไม่มีประตู", aMiss.length === 0 && !/assertCrmV2/.test(read("src/lib/modules/crm/actions.ts")), aMiss.join(","));
  const lay = read("src/app/app/layout.tsx");
  const crmCase = /case "CRM":\s*return \[([\s\S]*?)\n\s{8}\];/.exec(lay)?.[1] ?? "";
  const before = crmCase.split("...(crmV2.has(slugOrId)")[0] ?? "";
  const preLay = /case "CRM":\s*return \[([\s\S]*?)\n\s{8}\];/.exec(git("4f8af9d~1:src/app/app/layout.tsx"))?.[1] ?? "-";
  const norm = (x: string) => x.split("\n").filter((l) => !l.trim().startsWith("//")).join("").replace(/\s+/g, "").replace(/,+$/, "");
  const after = crmCase.split("...(crmV2.has(slugOrId)")[1] ?? "";
  chk("V2.3", "drawer: รายการก่อนประตู = เมนู CRM ก่อน C1.3 ทุกตัว (ภาพรวม · ดีล · งานติดตาม · ผู้ติดต่อ) · companies/contacts-new/deals-new/pipelines/settings อยู่หลัง crmV2.has(...) ทั้งหมด",
    norm(before) === norm(preLay) && ["/crm/companies", "/crm/contacts/new", "/crm/deals/new", "/crm/pipelines", "/crm/settings/"].every((h) => after.includes(h) && !before.includes(h)), `${norm(before)} | ${norm(preLay)}`);

  // ── พฤติกรรม: ร้านทิ้ง · ระบบ CRM ค่าเริ่มต้น (uiVersion 1) ──
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tid = t.id;
  const crm = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
  const ctx = { tenantId: tid, systemId: crm };
  chk("B1.1", "ระบบ CRM ใหม่ = uiVersion 1 · pickCrmPage → v1 (1 · undefined · \"2\" สตริง = v1)", (await UV.crmUiVersion(ctx)) === 1 && UV.pickCrmPage(1) === "v1" && UV.pickCrmPage(undefined) === "v1" && UV.pickCrmPage("2") === "v1");
  const nf = await settle(() => UV.requireCrmV2Page(ctx));
  chk("B1.2", "uiVersion 1: ตัวโหลดของ route v2 เรียก notFound (404)", !nf.ok && isNotFound(nf.e), String(nf.e?.digest ?? nf.e?.message));
  const ac = await settle(() => UV.assertCrmV2(ctx));
  chk("B1.3", "uiVersion 1: action v2 ปฏิเสธ FORBIDDEN \"ระบบ CRM ใหม่ยังไม่เปิดให้ร้านนี้\"", !ac.ok && ac.e?.code === "FORBIDDEN" && /ระบบ CRM ใหม่ยังไม่เปิดให้ร้านนี้/.test(ac.e?.message ?? ""), String(ac.e?.message));
  const tabs1 = (UI.crmTabs(crm) as Any[]).map((x) => x.label);
  chk("B1.4", "uiVersion 1: แถบแท็บ v1 = ภาพรวม · ดีล · งานติดตาม · ผู้ติดต่อ (ไม่มี \"บริษัท\")", !tabs1.includes("บริษัท") && tabs1.includes("ผู้ติดต่อ"), tabs1.join(","));
  const foreign = await settle(() => UV.assertCrmV2({ tenantId: tid, systemId: "no-such-system" }));
  chk("B1.5", "ระบบที่อ่านไม่ได้/ไม่ใช่ของร้าน = ปิด v2 (fail closed)", !foreign.ok && foreign.e?.code === "FORBIDDEN");

  // ── เปิด v2 ──
  await ST.setCrmSettingsKey(ctx, "uiVersion", 2);
  const nf2 = await settle(() => UV.requireCrmV2Page(ctx));
  const ac2 = await settle(() => UV.assertCrmV2(ctx));
  const tabs2 = (UI.crmTabs(crm, 2) as Any[]).map((x) => x.label);
  chk("B2.1", "ตั้ง uiVersion 2 (jsonb_set) ⇒ pickCrmPage v2 · route v2 ผ่าน · action v2 ผ่าน · แท็บ \"บริษัท\" โผล่", (await UV.crmUiVersion(ctx)) === 2 && UV.pickCrmPage(await UV.crmUiVersion(ctx)) === "v2" && nf2.ok && ac2.ok && tabs2.includes("บริษัท"), `${nf2.e?.message ?? ""}${ac2.e?.message ?? ""}`);
  await ST.setCrmSettingsKey(ctx, "uiVersion", 1);
  chk("B2.2", "ย้อนกลับเป็น 1 ⇒ ปิด v2 อีกครั้ง", (await settle(() => UV.assertCrmV2(ctx))).ok === false && (await UV.crmUiVersion(ctx)) === 1);
} catch (e) {
  chk("FATAL", "probe ran to the end", false, String((e as Error)?.message ?? e).slice(0, 300));
} finally {
  if (tid) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 3; pass += 1) for (const x of tables) await P.$executeRawUnsafe(`DELETE FROM "${x}" WHERE "tenantId" = $1`, tid).catch(() => 0);
    await P.appSystemUnit.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.tenant.delete({ where: { id: tid } }).catch(() => 0);
    chk("CLEAN", "throwaway tenant gone", (await P.tenant.count({ where: { id: tid } })) === 0 && (await P.appSystem.count({ where: { tenantId: tid } })) === 0);
  }
  await prisma.$disconnect();
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed === results.length ? "🟢" : "🔴"} probe-uiversion-gate: ${passed}/${results.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: results.length, passed, findings: results.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === results.length ? 0 : 1);
