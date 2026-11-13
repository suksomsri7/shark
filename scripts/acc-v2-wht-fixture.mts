// ฟิกซ์เจอร์ร่วมของชุดทดสอบหัก ณ ที่จ่าย ACC T3 (qc-acc-v2-wht-*.mts) — ร้านทิ้ง (ลบใน cleanup) · ไม่พึ่ง seed กลาง
// 🔴 ไม่ใช่ชุดทดสอบเอง (ไม่มี JSON_SUMMARY) · โหลด .env.qc ผ่าน qc-env-guard ของชุดที่เรียก
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";

export function makeChecker() {
  const cks: { id: string; ok: boolean; sev: Sev }[] = [];
  const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
    cks.push({ id, ok: !!ok, sev });
    console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 700)}`}`);
  };
  const finish = () => {
    const passed = cks.filter((c) => c.ok).length;
    console.log(`\nผ่าน ${passed}/${cks.length}`);
    console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((c) => !c.ok).map((c) => c.id) })}`);
    return passed === cks.length;
  };
  return { cks, chk, finish };
}

export const D = (m: number, d: number, y = 2026) => new Date(Date.UTC(y, m - 1, d, 5));

export async function makeShop(label: string, opts: { entityKind?: string; vat?: boolean } = {}) {
  const { prisma } = await import("@/lib/core/db");
  const sys = await import("@/lib/modules/system/service");
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const LV = (await import("@/lib/modules/account/legal-values" as string)) as Any;
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const owner = await prisma.user.create({ data: { email: `qc-t3w-${label}-${stamp}@qc.local`, name: `เจ้าของ ${label}` } });
  const t = await prisma.tenant.create({ data: { name: `QC T3 WHT ${label}`, slug: `qc-t3w-${label}-${stamp}` } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const S = (await sys.createSystem(t.id, "ACCOUNT", `บัญชี ${label}`)).id;
  await acc.saveSettings(t.id, S, { orgName: `ร้าน ${label}`, vatRegistered: opts.vat ?? true, vatRateBp: 700, taxId: "0105561000330", address: "3 ถ.หักภาษี" });
  await gl.ensureAccounting({ tenantId: t.id, systemId: S });
  const ctx = { tenantId: t.id, systemId: S };
  if (opts.entityKind) {
    const r = await LV.saveBookTax({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: owner.id }, ctx, { entityKind: opts.entityKind });
    if (!r.ok) throw new Error(`ตั้งประเภทผู้ประกอบการไม่ได้ ${JSON.stringify(r)}`);
  }
  const bank = await fin.createFinanceAccount({ tenantId: t.id, systemId: S, type: "BANK", name: "กระแสรายวัน", bankName: "กสิกรไทย" });
  const vendor = async (name: string, extra: Record<string, unknown> = {}) =>
    acc.createContact({ tenantId: t.id, systemId: S, kind: "VENDOR", legalType: "COMPANY", name, taxId: null, branchCode: "00000", address: "1 ถ.ผู้ขาย", ...extra });
  const cleanup = async () => {
    await prisma.tenant.delete({ where: { id: t.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: owner.id } }).catch(() => {});
  };
  return { tid: t.id, S, ctx, owner, bank, vendor, cleanup, acc, gl, prisma };
}

/** เอกสารซื้อ (EXPENSE) ออกแล้วรอจ่าย */
export async function makeExpense(
  shop: Awaited<ReturnType<typeof makeShop>>,
  contactId: string,
  lines: { description: string; amount: number; vatRateBp?: number; lineKind?: "GOODS" | "SERVICE"; whtIncomeType?: string | null; whtRateBp?: number | null }[],
  opts: { vatMode?: "EXCLUDE" | "INCLUDE" | "NONE"; date?: Date; discount?: number } = {},
) {
  const exp = (await import("@/lib/modules/account/expense" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const r = await exp.createExpenseDoc({
    tenantId: shop.tid,
    systemId: shop.S,
    docType: "EXPENSE",
    contactId,
    vatMode: opts.vatMode ?? "EXCLUDE",
    issueDate: opts.date ?? D(9, 1),
    dueDate: opts.date ?? D(9, 30),
    discountAmount: opts.discount ?? 0,
    lines: lines.map((l) => ({ description: l.description, qty: 1, unitPrice: l.amount, vatRateBp: l.vatRateBp ?? (opts.vatMode === "NONE" ? 0 : 700) })),
    createdById: shop.owner.id,
  });
  const id = r?.id;
  if (!id) throw new Error(`สร้างค่าใช้จ่ายไม่ได้ ${JSON.stringify(r)}`);
  // ธงหัก ณ ที่จ่าย/ชนิดบรรทัดต่อบรรทัด = สิ่งที่ฟอร์ม V2 เขียน (applyEditorExtras) หลังสร้าง — จำลองทางเดียวกัน
  const ls = await shop.prisma.accountDocumentLine.findMany({ where: { documentId: id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } });
  for (let i = 0; i < ls.length; i++) {
    const l = lines[i]!;
    await shop.prisma.accountDocumentLine.update({ where: { id: ls[i]!.id }, data: { lineKind: l.lineKind ?? null, whtIncomeType: (l.whtIncomeType ?? null) as Any, whtRateBp: l.whtRateBp ?? null } });
  }
  const i = await exp.issueExpenseDoc(shop.tid, shop.S, id, { ack: { codes: ["INPUT_VAT_VENDOR_NO_TAX_ID", "INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID", "EXPENSE_PAYEE_MISSING"], actorId: shop.owner.id, via: "qc" } });
  if (!i.ok) throw new Error(`อนุมัติค่าใช้จ่ายไม่ได้ ${JSON.stringify(i)}`);
  return id as string;
}
