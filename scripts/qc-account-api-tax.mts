// QC — API บัญชี ACC T0.1/T0.2: GET/PATCH /settings/tax (ประเภทผู้ประกอบการ + ตารางค่ากฎหมาย)
// test id ของ op: settings.tax = T02-API.1 · settings.tax.update = T02-API.2 (ด่าน fitness F13.1)
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-tax.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-tax");
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const idem = () => ({ "idempotency-key": `t02-${Date.now()}-${Math.random().toString(16).slice(2)}` });

let tid = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  const t = await prisma.tenant.create({ data: { name: "QC API T02", slug: `qc-api-t02-${Date.now()}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-at02-${Date.now()}@qc.local`, name: "เจ้าของ API T02" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี API T02");
  const SYS = s.id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน API T02", vatRegistered: true, vatRateBp: 700 });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const kS = await ak.createApiKey({ tenantId: tid }, "T02 settings", { scopes: scopes.expandBundles(["accountant", "settings"]), systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "T02 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });

  const call = async (method: string, path: string, key: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : idem()) };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed };
  };
  const S = kS.rawKey;
  const R = kR.rawKey;

  // ═══ T02-API.1 GET /settings/tax ═══
  const g = await call("GET", "/settings/tax?asOf=2026-11-13", R);
  const d = g.body?.data;
  chk("T02-API.1", "GET /settings/tax (read-only) → 200 entityKind UNSET + คำเตือน · vatRateBp 700 · ตาราง 3 ชุดพร้อมที่มา/ป้าย", g.status === 200 && d?.entityKind === "UNSET" && d?.vatRateBp === 700 && d?.warnings?.some((w: Any) => w.code === "ENTITY_KIND_UNSET") && d?.tables?.vat?.[0]?.source?.startsWith("references/") && Array.isArray(d?.tables?.wht) && Array.isArray(d?.tables?.deadline), "ครบ", `${g.status} ${JSON.stringify(d).slice(0, 220)}`);
  const ewht = d?.tables?.wht?.find((r: Any) => r.id === "sys-ewht-40-2-jur");
  chk("T02-API.1b", "แถว e-WHT มีช่วงวันที่ 2026-01-01..2027-12-31 + inEffect ณ asOf", ewht?.from === "2026-01-01" && ewht?.to === "2027-12-31" && ewht?.inEffect === true, "ช่วง+inEffect", JSON.stringify(ewht).slice(0, 200), "MAJOR");
  const gLater = await call("GET", "/settings/tax?asOf=2028-01-01", R);
  chk("T02-API.1c", "asOf หลัง e-WHT หมดอายุ → แถว e-WHT inEffect=false", gLater.status === 200 && gLater.body?.data?.tables?.wht?.find((r: Any) => r.id === "sys-ewht-40-2-jur")?.inEffect === false, "false", `${gLater.status}`, "MAJOR");
  const gBad = await call("GET", "/settings/tax?asOf=13-11-2026", R);
  chk("T02-API.1d", "asOf รูปแบบผิด → 422", gBad.status === 422, "422", `${gBad.status}`, "MAJOR");

  // ═══ T02-API.2 PATCH /settings/tax ═══
  const denied = await call("PATCH", "/settings/tax", R, { entityKind: "COMPANY" });
  chk("T02-API.2a", "read-only → 403", denied.status === 403, "403", `${denied.status}`);
  const p = await call("PATCH", "/settings/tax", S, {
    entityKind: "COMPANY",
    whtRows: [{ incomeType: "M40_2", payer: "JURISTIC", recipient: "JURISTIC_TH", channel: "NORMAL", method: "RATE", value: 200, from: null, to: null, source: "ตกลงกับคู่ค้า" }],
    reason: "QC T02",
  });
  const pd = p.body?.data;
  chk("T02-API.2", "PATCH entityKind + แถวร้าน 2% → 200 saved · คำเตือน SHOP_DIFFERS_FROM_DEFAULT (ไม่บล็อก) · settings สะท้อน", p.status === 200 && pd?.saved >= 2 && pd?.warnings?.some((w: Any) => w.code === "SHOP_DIFFERS_FROM_DEFAULT") && pd?.settings?.entityKind === "COMPANY" && pd?.settings?.tables?.wht?.some((r: Any) => r.origin === "SHOP" && r.value === 200 && r.tag === "SHOP"), "ครบ", `${p.status} ${JSON.stringify(pd).slice(0, 260)}`);
  const st = await call("GET", "/settings", S);
  chk("T02-API.2c", "GET /settings คืน entityKind COMPANY", st.status === 200 && st.body?.data?.entityKind === "COMPANY", "COMPANY", `${st.status} ${st.body?.data?.entityKind}`, "MAJOR");
  const badKind = await call("PATCH", "/settings/tax", S, { entityKind: "LLC" });
  chk("T02-API.2d", "entityKind ไม่รู้จัก → 422", badKind.status === 422, "422", `${badKind.status}`, "MAJOR");
  const badRow = await call("PATCH", "/settings/tax", S, { deadlineRows: [{ form: "PP30", channel: "PAPER", value: 40, from: null, to: null }] });
  chk("T02-API.2e", "วันยื่นนอก 1–31 → 422", badRow.status === 422, "422", `${badRow.status}`, "MAJOR");
  const reset = await call("PATCH", "/settings/tax", S, { whtRows: [] });
  chk("T02-API.2f", "whtRows [] → กลับค่าเริ่มระบบ (ไม่มีแถว SHOP)", reset.status === 200 && !reset.body?.data?.settings?.tables?.wht?.some((r: Any) => r.origin === "SHOP"), "ไม่มี SHOP", `${reset.status}`);

  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["settings.tax", "read", "account.doc.view"], ["settings.tax.update", "write", "account.settings.manage"]];
  const bad = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action; });
  chk("T02-API.3", "registry มี settings.tax / settings.tax.update ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["settingChange", "settingValue", "accountJournalLine", "accountJournalEntry", "accountDocSequence", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "membership", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
    await d(() => prisma.user.deleteMany({ where: { email: { contains: "@qc.local" }, name: { in: ["เจ้าของ API T02"] } } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API tax settings (T0.1/T0.2) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
