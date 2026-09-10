// QC — ระบบสมาชิก v2 WO M1.2: fields engine (D14) — ส่วน/ฟิลด์/ค่า/ประวัติ · validate ต่อชนิด 11 · filterWhere · applyTemplate · เพดาน
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/MEMBER-RUN.md §2 M1.2 · พิมพ์เขียว docs/modules/06-member-v2.md §5.3 §11.2 §11.9
// requires: member-seed
//
// สัญญาฟังก์ชัน (src/lib/modules/member/fields.ts) — ctx = { tenantId, systemId, actorUserId: string|null }
//   listLayout(ctx, { audience?: "staff"|"customer", includeArchived?: boolean }) → { sections: [{ id key label description columns sortOrder isSystem sensitive collapsed fields: FieldDef[] }] }
//   createSection(ctx, { key label description? columns? sensitive? }) · updateSection(ctx, id, patch) · reorderSections(ctx, ids[]) · deleteSection(ctx, id) (ว่าง+ไม่ใช่ระบบเท่านั้น)
//   createField(ctx, { sectionId key label type options? required? defaultValue? unique? filterable? showInList? showOnCard? customerEditable? sensitive? trackHistory? }) · updateField(ctx, id, patch)
//   archiveField(ctx, id) · restoreField(ctx, id) · reorderFields(ctx, sectionId, ids[])
//   setFieldValues(ctx, customerId, values: Record<key, unknown>, { via: MemberConsentSource, byUserId?: string }) → { changed: string[] }
//     ค่า: TEXT/LONG_TEXT string · NUMBER/MONEY number · DATE "YYYY-MM-DD" · DATETIME ISO · SELECT string · MULTI_SELECT string[] · BOOLEAN boolean · FILE fileId · LOOKUP id · null = ล้าง
//     ฟิลด์ระบบ (isSystem) = pointer → เขียน/อ่านคอลัมน์ Customer จริง · via CUSTOMER_SELF = เฉพาะ customerEditable
//   getFieldValues(ctx, customerIds[]) → Record<customerId, Record<key, value>> (รูปแบบเดียวกับ input · DATE = "YYYY-MM-DD")
//   fieldFilterWhere(ctx, filters: Record<key, string>) → Prisma where ของ Customer (อาจ async) — ไวยากรณ์ค่า:
//     TEXT "abc"=contains · "=abc"=eq · NUMBER/MONEY "10..50" range (ปลายเปิดได้ "10..") · "=42" eq · DATE "2026-01-01..2026-03-31" · BOOLEAN "true"/"false" · SELECT "a,b" in · MULTI "a,b" hasAny · LOOKUP "<id>" eq · FILE "true"/"false"
//     ฟิลด์ที่ไม่ filterable → throw ไทย
//   applyTemplate(ctx, templateKey) → { added: { sections: number; fields: number } } (เพิ่มเฉพาะที่ยังไม่มี · ไม่ทับ label/options ของเดิม)
//   templates: src/lib/modules/member/templates/index.ts export TEMPLATES: Record<key, { key, name(ไทย), sections: [...] }> อย่างน้อย "dive" + "general"
//   เพดาน (MEMBER_LIMITS ใน src/lib/modules/member/limits.ts): fields 60 · sections 12 · filterable 20 → throw ไทย มีคำว่า LIMIT_REACHED
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/member/fields.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/member/fields.ts)");
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
const P = prisma as Any;
let tid = ""; let SYS = "";
const made = { sections: [] as string[], fields: [] as string[], customers: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const F = (await import("@/lib/modules/member/fields" as string)) as Record<string, (...a: Any[]) => Any>;
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const members: Any[] = E.members;
  const m = (i: number) => members[i - 1].id as string;
  const tag = `qc12_${Date.now().toString(36)}`;
  const mkSection = async (key: string, extra: Record<string, unknown> = {}) => { const s = await F.createSection(ctx, { key, label: `ส่วนทดสอบ ${key}`, ...extra }); made.sections.push(s.id); return s; };
  const mkField = async (sectionId: string, key: string, type: string, extra: Record<string, unknown> = {}) => { const f = await F.createField(ctx, { sectionId, key, label: `ฟิลด์ ${key}`, type, ...extra }); made.fields.push(f.id); return f; };

  // ═══ S1 CRUD ส่วน/ฟิลด์ + isSystem guard ═══
  const sec = await mkSection(`${tag}_a`, { description: "คำอธิบาย", columns: 3 });
  const lay0 = await F.listLayout(ctx, {});
  const secInLayout = lay0.sections.find((s: Any) => s.id === sec.id);
  chk("M1.2-S1.1", "createSection(ctx,{key,label,description,columns}) → แถว (isSystem false · sortOrder ต่อท้าย) · listLayout(ctx) คืน sections เรียง sortOrder พร้อม fields[] (ส่วนใหม่ fields ว่าง) · ส่วนระบบจาก backfill + ส่วน dive/health ของ seed อยู่ในรายการ", sec?.id && sec.isSystem === false && secInLayout && Array.isArray(secInLayout.fields) && secInLayout.fields.length === 0 && secInLayout.columns === 3 && lay0.sections.some((s: Any) => s.key === "dive") && lay0.sections.some((s: Any) => s.key === "health" && s.sensitive === true) && lay0.sections.some((s: Any) => s.isSystem === true) && lay0.sections.every((s: Any, i: number, arr: Any[]) => i === 0 || arr[i - 1].sortOrder <= s.sortOrder), "ครบ", JSON.stringify({ sec: !!sec?.id, inLayout: !!secInLayout, keys: lay0.sections?.map((s: Any) => s.key) }).slice(0, 300));
  const sec2 = await mkSection(`${tag}_b`);
  await F.updateSection(ctx, sec2.id, { label: "แก้ชื่อแล้ว", collapsed: true, columns: 1 });
  const all = (await F.listLayout(ctx, {})).sections as Any[];
  const ids = all.map((s) => s.id as string);
  const swapped = [...ids]; const ia = swapped.indexOf(sec.id); const ib = swapped.indexOf(sec2.id); swapped[ia] = sec2.id; swapped[ib] = sec.id;
  await F.reorderSections(ctx, swapped);
  const after = (await F.listLayout(ctx, {})).sections as Any[];
  const eDupKey = await fails(() => F.createSection(ctx, { key: `${tag}_a`, label: "ซ้ำ" }));
  chk("M1.2-S1.2", "updateSection(label/collapsed/columns) เขียนจริง · reorderSections(ctx, ids[]) → sortOrder ตามลำดับใหม่ · key ซ้ำในระบบเดียวกัน → throw ไทย · key ต้องเป็น [a-z][a-zA-Z0-9_]* (camelCase ได้ · throw ถ้า 'ส่วน-1')", after.find((s) => s.id === sec2.id)?.label === "แก้ชื่อแล้ว" && after.find((s) => s.id === sec2.id)?.collapsed === true && after.findIndex((s) => s.id === sec2.id) === ia && after.findIndex((s) => s.id === sec.id) === ib && thai(eDupKey) && thai(await fails(() => F.createSection(ctx, { key: "ส่วน-1", label: "x" }))), "ครบ", `label=${after.find((s) => s.id === sec2.id)?.label} idx=${after.findIndex((s) => s.id === sec2.id)}/${ia} dup=${!!eDupKey}`);
  const fTmp = await mkField(sec2.id, `${tag}_tmp`, "TEXT");
  const eNonEmpty = await fails(() => F.deleteSection(ctx, sec2.id));
  const sysSec = all.find((s) => s.isSystem);
  const eSysDel = await fails(() => F.deleteSection(ctx, sysSec.id));
  await prisma.$transaction(async (tx) => { await (tx as Any).memberField.delete({ where: { id: fTmp.id } }); });
  made.fields.splice(made.fields.indexOf(fTmp.id), 1);
  const eEmptyDel = await fails(() => F.deleteSection(ctx, sec2.id));
  if (!eEmptyDel) made.sections.splice(made.sections.indexOf(sec2.id), 1);
  chk("M1.2-S1.3", "deleteSection: มีฟิลด์อยู่ → throw ไทย · ส่วนระบบ → throw · ส่วนว่าง (ไม่ใช่ระบบ) → ลบได้", thai(eNonEmpty) && thai(eSysDel) && eEmptyDel === null && (await P.memberSection.findUnique({ where: { id: sec2.id } })) === null, "throw/throw/ลบ", `${!!eNonEmpty}/${!!eSysDel}/${eEmptyDel?.message ?? "ok"}`);
  const TYPES = ["TEXT", "LONG_TEXT", "NUMBER", "MONEY", "DATE", "DATETIME", "SELECT", "MULTI_SELECT", "BOOLEAN", "FILE", "LOOKUP"];
  const hrSys = scope.systems.HR as string;
  const employee = await P.hrEmployee.findFirst({ where: { tenantId: tid, systemId: hrSys } });
  const fx: Record<string, Any> = {};
  for (const t of TYPES) {
    const extra: Record<string, unknown> = { filterable: true };
    if (t === "SELECT" || t === "MULTI_SELECT") extra.options = { choices: [{ value: "a", label: "เอ" }, { value: "b", label: "บี" }, { value: "c", label: "ซี" }] };
    if (t === "NUMBER") extra.options = { min: 0, max: 1000, decimals: 0 };
    if (t === "LOOKUP") extra.options = { target: "EMPLOYEE" };
    if (t === "TEXT") extra.options = { maxLength: 20 };
    fx[t] = await mkField(sec.id, `${tag}_${t.toLowerCase()}`, t, extra);
  }
  const eBadKey = await fails(() => F.createField(ctx, { sectionId: sec.id, key: "Bad Key", label: "x", type: "TEXT" }));
  const eDupF = await fails(() => F.createField(ctx, { sectionId: sec.id, key: `${tag}_text`, label: "ซ้ำ", type: "TEXT" }));
  const eBadType = await fails(() => F.createField(ctx, { sectionId: sec.id, key: `${tag}_zz`, label: "x", type: "COLOR" }));
  const eNoChoices = await fails(() => F.createField(ctx, { sectionId: sec.id, key: `${tag}_zy`, label: "x", type: "SELECT" }));
  const eNoTarget = await fails(() => F.createField(ctx, { sectionId: sec.id, key: `${tag}_zx`, label: "x", type: "LOOKUP" }));
  chk("M1.2-S1.4", "createField ทั้ง 11 ชนิด → แถว (isSystem false · sortOrder ต่อท้ายในส่วน) · key ผิดรูป/ซ้ำ/ชนิดไม่รู้จัก → throw ไทย · SELECT ไม่มี choices → throw · LOOKUP ไม่มี target → throw", TYPES.every((t) => fx[t]?.id && fx[t].type === t && fx[t].isSystem === false) && thai(eBadKey) && thai(eDupF) && !!eBadType && thai(eNoChoices) && thai(eNoTarget), "11 + throw 5", `${TYPES.filter((t) => !fx[t]?.id).join(",")} · ${[eBadKey, eDupF, eBadType, eNoChoices, eNoTarget].map((e) => !!e).join("/")}`);
  await F.updateField(ctx, fx.TEXT.id, { label: "ข้อความ (แก้)", showInList: true, showOnCard: true, required: false, options: { maxLength: 30 } });
  const fIds = TYPES.map((t) => fx[t].id as string);
  await F.reorderFields(ctx, sec.id, [...fIds].reverse());
  await F.archiveField(ctx, fx.FILE.id);
  const layA = (await F.listLayout(ctx, {})).sections.find((s: Any) => s.id === sec.id) as Any;
  const layB = (await F.listLayout(ctx, { includeArchived: true })).sections.find((s: Any) => s.id === sec.id) as Any;
  await F.restoreField(ctx, fx.FILE.id);
  const layC = (await F.listLayout(ctx, {})).sections.find((s: Any) => s.id === sec.id) as Any;
  chk("M1.2-S1.5", "updateField(label/showInList/showOnCard/options) · reorderFields(ctx, sectionId, ids[]) → ลำดับใหม่ (ตัวสุดท้ายกลายเป็นตัวแรก) · archiveField → หายจาก listLayout ปกติ (archivedAt) แต่เห็นเมื่อ includeArchived · restoreField → กลับมา", layA.fields.find((f: Any) => f.id === fx.TEXT.id)?.label === "ข้อความ (แก้)" && layA.fields.find((f: Any) => f.id === fx.TEXT.id)?.options?.maxLength === 30 && layA.fields[0]?.id === fx.LOOKUP.id && !layA.fields.some((f: Any) => f.id === fx.FILE.id) && layB.fields.some((f: Any) => f.id === fx.FILE.id && f.archivedAt) && layC.fields.some((f: Any) => f.id === fx.FILE.id && !f.archivedAt), "ครบ", JSON.stringify({ label: layA.fields.find((f: Any) => f.id === fx.TEXT.id)?.label, first: layA.fields[0]?.key, archived: !layA.fields.some((f: Any) => f.id === fx.FILE.id), back: layC.fields.some((f: Any) => f.id === fx.FILE.id) }));
  const sysPhone = await P.memberField.findFirst({ where: { systemId: SYS, systemKey: "phone" } });
  const eSysType = await fails(() => F.updateField(ctx, sysPhone.id, { type: "NUMBER" }));
  const eSysKey = await fails(() => F.updateField(ctx, sysPhone.id, { key: "tel" }));
  const eSysArch = await fails(() => F.archiveField(ctx, sysPhone.id));
  const eSysUnique = await fails(() => F.updateField(ctx, sysPhone.id, { unique: false }));
  const okLabel = await fails(() => F.updateField(ctx, sysPhone.id, { label: "เบอร์โทรศัพท์ (QC)", description: "หลัก" }));
  restore.push(() => P.memberField.update({ where: { id: sysPhone.id }, data: { label: sysPhone.label, description: sysPhone.description } }));
  chk("M1.2-S1.6", "ฟิลด์ระบบ (isSystem): เปลี่ยน type/key/unique → throw ไทย · archive → throw · แก้ label/description/sortOrder/showInList ได้", thai(eSysType) && thai(eSysKey) && thai(eSysArch) && thai(eSysUnique) && okLabel === null && ((await P.memberField.findUnique({ where: { id: sysPhone.id } })) as Any).label === "เบอร์โทรศัพท์ (QC)", "throw 4 · label ok", `${[eSysType, eSysKey, eSysArch, eSysUnique].map((e) => !!e).join("/")} label=${okLabel?.message ?? "ok"}`);

  // ═══ S2 setFieldValues ทุกชนิด + validate ═══
  const c1 = m(50); const c2 = m(51); const c3 = m(52);
  const via = { via: "STAFF", byUserId: E.users.owner.userId };
  const r1 = await F.setFieldValues(ctx, c1, { [`${tag}_text`]: "สวัสดี", [`${tag}_long_text`]: "ยาว".repeat(100) }, via);
  const g1 = await F.getFieldValues(ctx, [c1, c2]);
  const eLong = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_long_text`]: "ก".repeat(4001) }, via));
  const eMax = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_text`]: "ก".repeat(31) }, via));
  chk("M1.2-S2.1", "TEXT/LONG_TEXT: set → {changed:[keys]} · getFieldValues(ctx,[ids]) batch คืนทั้ง 2 คน (คนที่ไม่มีค่า = {} หรือ undefined ต่อ key) · LONG_TEXT > 4,000 → throw ไทย · TEXT > options.maxLength → throw", Array.isArray(r1?.changed) && r1.changed.length === 2 && g1?.[c1]?.[`${tag}_text`] === "สวัสดี" && g1[c1][`${tag}_long_text`].length === 300 && g1[c2] !== undefined && g1[c2][`${tag}_text`] == null && thai(eLong) && thai(eMax), "ครบ", JSON.stringify({ r1, v: g1?.[c1]?.[`${tag}_text`], long: !!eLong, max: !!eMax }).slice(0, 200));
  await F.setFieldValues(ctx, c1, { [`${tag}_number`]: 42, [`${tag}_money`]: 1999.5 }, via);
  const g2 = await F.getFieldValues(ctx, [c1]);
  const eStr = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_number`]: "abc" }, via));
  const eMin = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_number`]: -1 }, via));
  const eMaxN = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_number`]: 1001 }, via));
  const eDec = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_number`]: 1.5 }, via));
  chk("M1.2-S2.2", "NUMBER/MONEY: number → valueNumber (อ่านกลับเป็น number 42 / 1999.5) · สตริง 'abc' → throw ไทย · นอก min/max → throw · decimals 0 แต่ส่ง 1.5 → throw", g2[c1][`${tag}_number`] === 42 && g2[c1][`${tag}_money`] === 1999.5 && thai(eStr) && thai(eMin) && thai(eMaxN) && thai(eDec) && ((await P.memberFieldValue.findFirst({ where: { customerId: c1, fieldId: fx.NUMBER.id } })) as Any)?.valueNumber != null, "ครบ", JSON.stringify({ n: g2[c1][`${tag}_number`], m: g2[c1][`${tag}_money`], e: [eStr, eMin, eMaxN, eDec].map((e) => !!e) }));
  await F.setFieldValues(ctx, c1, { [`${tag}_date`]: "2026-03-15", [`${tag}_datetime`]: "2026-03-15T09:30:00+07:00" }, via);
  const g3 = await F.getFieldValues(ctx, [c1]);
  const eDate = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_date`]: "15/03/2026" }, via));
  const eDate2 = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_date`]: "2026-02-30" }, via));
  const dbDate = (await P.memberFieldValue.findFirst({ where: { customerId: c1, fieldId: fx.DATE.id } })) as Any;
  chk("M1.2-S2.3", "DATE 'YYYY-MM-DD' → valueDate (อ่านกลับ '2026-03-15' ไม่เพี้ยนวัน) · DATETIME ISO → valueDate (อ่านกลับเป็น ISO ที่เวลาตรง 02:30Z) · รูปแบบผิด/วันไม่มีจริง → throw ไทย", g3[c1][`${tag}_date`] === "2026-03-15" && new Date(g3[c1][`${tag}_datetime`]).getTime() === Date.parse("2026-03-15T02:30:00Z") && thai(eDate) && thai(eDate2) && dbDate?.valueDate instanceof Date, "ครบ", JSON.stringify({ d: g3[c1][`${tag}_date`], dt: g3[c1][`${tag}_datetime`], e: [eDate, eDate2].map((e) => !!e) }));
  await F.setFieldValues(ctx, c1, { [`${tag}_select`]: "b", [`${tag}_multi_select`]: ["a", "c"] }, via);
  const g4 = await F.getFieldValues(ctx, [c1]);
  const eSel = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_select`]: "z" }, via));
  const eMulti = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_multi_select`]: ["a", "z"] }, via));
  const eMultiStr = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_multi_select`]: "a" }, via));
  chk("M1.2-S2.4", "SELECT ค่าใน choices → valueOptions [b] (อ่านกลับ 'b') · MULTI_SELECT [a,c] → valueOptions (อ่านกลับ array) · นอก choices → throw ไทย · MULTI ส่งสตริง → throw", g4[c1][`${tag}_select`] === "b" && JSON.stringify(g4[c1][`${tag}_multi_select`]) === JSON.stringify(["a", "c"]) && thai(eSel) && thai(eMulti) && !!eMultiStr, "ครบ", JSON.stringify({ s: g4[c1][`${tag}_select`], ms: g4[c1][`${tag}_multi_select`], e: [eSel, eMulti, eMultiStr].map((e) => !!e) }));
  await F.setFieldValues(ctx, c1, { [`${tag}_boolean`]: true, [`${tag}_file`]: "file_qc_123" }, via);
  await F.setFieldValues(ctx, c2, { [`${tag}_boolean`]: false }, via);
  const g5 = await F.getFieldValues(ctx, [c1, c2]);
  const eBool = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_boolean`]: "yes" }, via));
  await F.setFieldValues(ctx, c1, { [`${tag}_file`]: null }, via);
  const g5b = await F.getFieldValues(ctx, [c1]);
  chk("M1.2-S2.5", "BOOLEAN true/false → valueBool (false ไม่ใช่ 'ไม่มีค่า') · FILE fileId → valueFileId · 'yes' → throw ไทย · null = ล้างค่า (อ่านกลับ null/undefined)", g5[c1][`${tag}_boolean`] === true && g5[c2][`${tag}_boolean`] === false && g5[c1][`${tag}_file`] === "file_qc_123" && thai(eBool) && g5b[c1][`${tag}_file`] == null, "ครบ", JSON.stringify({ b1: g5[c1][`${tag}_boolean`], b2: g5[c2][`${tag}_boolean`], f: g5[c1][`${tag}_file`], cleared: g5b[c1][`${tag}_file`] }));
  const fUnit = await mkField(sec.id, `${tag}_unit`, "LOOKUP", { options: { target: "UNIT" }, filterable: true });
  await F.setFieldValues(ctx, c1, { [`${tag}_lookup`]: employee.id, [`${tag}_unit`]: E.units.patong }, via);
  const g6 = await F.getFieldValues(ctx, [c1]);
  const eGhost = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_lookup`]: "ไม่มีจริง" }, via));
  const kb = await prisma.tenant.findFirst({ where: { slug: { not: mq.MQC.tenantSlug } }, select: { id: true } });
  const otherEmp = kb ? await P.hrEmployee.findFirst({ where: { tenantId: kb.id } }) : null;
  const eOther = otherEmp ? await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_lookup`]: otherEmp.id }, via)) : new Error("ไม่มีร้านอื่นให้ทดสอบ — ผ่านโดยปริยาย");
  const eUnitBad = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_unit`]: employee.id }, via));
  chk("M1.2-S2.6", "LOOKUP EMPLOYEE: id ของ HrEmployee ในร้าน → valueRef · id ไม่มีจริง/ของร้านอื่น → throw ไทย · LOOKUP UNIT รับ BusinessUnit id · ส่ง id ผิดชนิด (พนักงาน) → throw", g6[c1][`${tag}_lookup`] === employee.id && g6[c1][`${tag}_unit`] === E.units.patong && thai(eGhost) && !!eOther && thai(eUnitBad), "ครบ", JSON.stringify({ l: g6[c1][`${tag}_lookup`] === employee.id, u: g6[c1][`${tag}_unit`] === E.units.patong, e: [eGhost, eOther, eUnitBad].map((e) => !!e) }));
  const fUniq = await mkField(sec.id, `${tag}_uniq`, "TEXT", { unique: true });
  const fReq = await mkField(sec.id, `${tag}_req`, "TEXT", { required: true });
  await F.setFieldValues(ctx, c1, { [`${tag}_uniq`]: "DUP-1", [`${tag}_req`]: "มีค่า" }, via);
  const eUniq = await fails(() => F.setFieldValues(ctx, c2, { [`${tag}_uniq`]: "DUP-1" }, via));
  const okSame = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_uniq`]: "DUP-1" }, via));
  const eReq = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_req`]: null }, via));
  const eReqEmpty = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_req`]: "   " }, via));
  const eUnknown = await fails(() => F.setFieldValues(ctx, c1, { no_such_field_xyz: "x" }, via));
  const eArchived = await (async () => { await F.archiveField(ctx, fx.FILE.id); const e = await fails(() => F.setFieldValues(ctx, c1, { [`${tag}_file`]: "f2" }, via)); await F.restoreField(ctx, fx.FILE.id); return e; })();
  chk("M1.2-S2.7", "unique: ค่าซ้ำคนอื่น → throw ไทย (คนเดิมค่าเดิม = ผ่าน) · required: null/ช่องว่างล้วน → throw · key ที่ไม่มี → throw · ฟิลด์ที่ archive แล้ว → throw", thai(eUniq) && okSame === null && thai(eReq) && thai(eReqEmpty) && thai(eUnknown) && thai(eArchived), "throw 5 · same ok", `${[eUniq, eReq, eReqEmpty, eUnknown, eArchived].map((e) => !!e).join("/")} same=${okSame?.message ?? "ok"}`);
  const before = (await prisma.customer.findUnique({ where: { id: c3 } })) as Any;
  restore.push(() => prisma.customer.update({ where: { id: c3 }, data: { nickname: before.nickname, birthDate: before.birthDate, note: before.note } as Any }));
  await F.setFieldValues(ctx, c3, { nickname: "โอ๊ต QC", birthDate: "1990-10-05", note: "โน้ตจาก engine" }, via);
  const c3a = (await prisma.customer.findUnique({ where: { id: c3 } })) as Any;
  const g7 = await F.getFieldValues(ctx, [c3]);
  const fCust = await mkField(sec.id, `${tag}_cust`, "TEXT", { customerEditable: true });
  const okSelf = await fails(() => F.setFieldValues(ctx, c3, { [`${tag}_cust`]: "ลูกค้ากรอกเอง" }, { via: "CUSTOMER_SELF" }));
  const eSelf = await fails(() => F.setFieldValues(ctx, c3, { [`${tag}_text`]: "ห้าม" }, { via: "CUSTOMER_SELF" }));
  const eSelfSys = await fails(() => F.setFieldValues(ctx, c3, { memberCode: "HACK" }, { via: "CUSTOMER_SELF" }));
  chk("M1.2-S2.8", "🔴 ฟิลด์ระบบ = pointer: setFieldValues(nickname/birthDate/note) เขียนคอลัมน์ Customer จริง (ไม่สร้าง MemberFieldValue) · getFieldValues คืน nickname/birthDate('1990-10-05')/phone/memberCode จากคอลัมน์ · via CUSTOMER_SELF: ฟิลด์ customerEditable → ได้ · ฟิลด์อื่น/memberCode → throw ไทย", c3a.nickname === "โอ๊ต QC" && c3a.note === "โน้ตจาก engine" && c3a.birthDate && new Date(c3a.birthDate).toISOString().startsWith("1990-10-05") && g7[c3].nickname === "โอ๊ต QC" && g7[c3].birthDate === "1990-10-05" && g7[c3].phone === members[51].phone && g7[c3].memberCode === members[51].memberCode && (await P.memberFieldValue.count({ where: { customerId: c3, fieldId: { in: [sysPhone.id] } } })) === 0 && okSelf === null && thai(eSelf) && thai(eSelfSys), "pointer · self", JSON.stringify({ nick: c3a.nickname, bd: g7[c3]?.birthDate, phone: g7[c3]?.phone === members[51].phone, self: okSelf?.message ?? "ok", e: [eSelf, eSelfSys].map((e) => !!e) }).slice(0, 250));

  // ═══ S3 history ═══
  const fHist = await mkField(sec.id, `${tag}_hist`, "TEXT", { trackHistory: true });
  await F.setFieldValues(ctx, c1, { [`${tag}_hist`]: "ค่าแรก" }, via);
  await F.setFieldValues(ctx, c1, { [`${tag}_hist`]: "ค่าสอง" }, { via: "LIFF", byUserId: null });
  await F.setFieldValues(ctx, c1, { [`${tag}_hist`]: "ค่าสอง" }, via);
  const hist: Any[] = await P.memberFieldValueHistory.findMany({ where: { customerId: c1, fieldId: fHist.id }, orderBy: { createdAt: "asc" } });
  chk("M1.2-S3.1", "trackHistory=true: เขียนค่าครั้งแรก → history {oldValue null, newValue 'ค่าแรก', changedVia STAFF, changedById owner} · เปลี่ยนเป็น 'ค่าสอง' via LIFF → แถว 2 (old 'ค่าแรก') · ตั้งค่าเดิมซ้ำ → **ไม่เพิ่ม** (2 แถว)", hist.length === 2 && hist[0].oldValue === null && hist[0].newValue === "ค่าแรก" && hist[0].changedVia === "STAFF" && hist[0].changedById === E.users.owner.userId && hist[1].oldValue === "ค่าแรก" && hist[1].newValue === "ค่าสอง" && hist[1].changedVia === "LIFF", "2 แถว", JSON.stringify(hist.map((h) => [h.oldValue, h.newValue, h.changedVia])));
  await F.setFieldValues(ctx, c1, { [`${tag}_text`]: "เปลี่ยนอีก" }, via);
  const sysNickField = await P.memberField.findFirst({ where: { systemId: SYS, systemKey: "nickname" } });
  await P.memberField.update({ where: { id: sysNickField.id }, data: { trackHistory: true } });
  restore.push(() => P.memberField.update({ where: { id: sysNickField.id }, data: { trackHistory: false } }));
  await F.setFieldValues(ctx, c3, { nickname: "โอ๊ต 2" }, via);
  chk("M1.2-S3.2", "trackHistory=false → ไม่มี history (ฟิลด์ text) · ฟิลด์ระบบเปิด trackHistory → history ของ nickname (old 'โอ๊ต QC' → 'โอ๊ต 2') เขียนได้แม้ค่าอยู่ในคอลัมน์ Customer", (await P.memberFieldValueHistory.count({ where: { customerId: c1, fieldId: fx.TEXT.id } })) === 0 && (await P.memberFieldValueHistory.count({ where: { customerId: c3, fieldId: sysNickField.id, oldValue: { equals: "โอ๊ต QC" }, newValue: { equals: "โอ๊ต 2" } } })) === 1, "0 · 1", `${await P.memberFieldValueHistory.count({ where: { customerId: c1, fieldId: fx.TEXT.id } })} · ${await P.memberFieldValueHistory.count({ where: { customerId: c3, fieldId: sysNickField.id } })}`);

  // ═══ S4 fieldFilterWhere ═══
  const list = async (filters: Record<string, string>) => { const w = await F.fieldFilterWhere(ctx, filters); const rows = await prisma.customer.findMany({ where: { memberSystemId: SYS, ...w }, select: { id: true } }); return rows.map((r) => r.id); };
  const ids5 = [m(40), m(41), m(42), m(43), m(44)];
  const vals = [{ t: "ปลาการ์ตูน", n: 5, d: "2026-01-10", b: true, s: "a", ms: ["a"], l: employee.id }, { t: "ปลาไหล", n: 15, d: "2026-02-10", b: false, s: "b", ms: ["a", "b"], l: employee.id }, { t: "ฉลามวาฬ", n: 25, d: "2026-03-10", b: true, s: "c", ms: ["c"], l: null }, { t: "ปลากระเบน", n: 35, d: "2026-04-10", b: false, s: "a", ms: ["b", "c"], l: null }, { t: "เต่าทะเล", n: 45, d: "2026-05-10", b: true, s: "b", ms: [], l: null }];
  for (let i = 0; i < 5; i++) { const v = vals[i]!; await F.setFieldValues(ctx, ids5[i]!, { [`${tag}_text`]: v.t, [`${tag}_number`]: v.n, [`${tag}_date`]: v.d, [`${tag}_boolean`]: v.b, [`${tag}_select`]: v.s, [`${tag}_multi_select`]: v.ms, [`${tag}_lookup`]: v.l, [`${tag}_file`]: i === 0 ? "f-0" : null }, via); }
  const same = (a: string[], b: string[]) => a.length === b.length && b.every((x) => a.includes(x));
  const r_contains = await list({ [`${tag}_text`]: "ปลา" }); const r_eq = await list({ [`${tag}_text`]: "=ปลาไหล" });
  chk("M1.2-S4.1", "TEXT: 'ปลา' = contains (ปลาการ์ตูน/ปลาไหล/ปลากระเบน = 3) · '=ปลาไหล' = eq (1)", same(r_contains, [ids5[0]!, ids5[1]!, ids5[3]!]) && same(r_eq, [ids5[1]!]), "3 / 1", `${r_contains.length} / ${r_eq.length}`);
  const r_range = await list({ [`${tag}_number`]: "10..30" }); const r_open = await list({ [`${tag}_number`]: "40.." }); const r_eqn = await list({ [`${tag}_number`]: "=25" });
  chk("M1.2-S4.2", "NUMBER: '10..30' → 15,25 (2) · '40..' → 45 (1 · c1 มี 42 ด้วย = 2) · '=25' → 1", same(r_range, [ids5[1]!, ids5[2]!]) && r_open.includes(ids5[4]!) && r_open.includes(c1) && r_open.length === 2 && same(r_eqn, [ids5[2]!]), "2 / 2 / 1", `${r_range.length} / ${r_open.length} / ${r_eqn.length}`);
  const r_date = await list({ [`${tag}_date`]: "2026-02-01..2026-04-30" }); const r_dateOpen = await list({ [`${tag}_date`]: "..2026-01-31" });
  chk("M1.2-S4.3", "DATE: '2026-02-01..2026-04-30' → ก.พ./มี.ค./เม.ย. (3 · ไม่รวม c1 15 มี.ค.? รวม = 4) · '..2026-01-31' → 1", r_date.includes(ids5[1]!) && r_date.includes(ids5[2]!) && r_date.includes(ids5[3]!) && r_date.includes(c1) && r_date.length === 4 && same(r_dateOpen, [ids5[0]!]), "4 / 1", `${r_date.length} / ${r_dateOpen.length}`);
  const r_true = await list({ [`${tag}_boolean`]: "true" }); const r_false = await list({ [`${tag}_boolean`]: "false" });
  chk("M1.2-S4.4", "BOOLEAN: 'true' → 3 ใน 5 + c1 (4) · 'false' → 2 + c2 (3)", r_true.length === 4 && [ids5[0], ids5[2], ids5[4], c1].every((x) => r_true.includes(x!)) && r_false.length === 3 && [ids5[1], ids5[3], c2].every((x) => r_false.includes(x!)), "4 / 3", `${r_true.length} / ${r_false.length}`);
  const r_sel = await list({ [`${tag}_select`]: "a,c" }); const r_ms = await list({ [`${tag}_multi_select`]: "b" }); const r_ms2 = await list({ [`${tag}_multi_select`]: "a,c" });
  chk("M1.2-S4.5", "SELECT 'a,c' = in → a,c,a (3) · MULTI 'b' = hasAny → 2 · MULTI 'a,c' → a·a,b·c·b,c + c1[a,c] (5)", same(r_sel, [ids5[0]!, ids5[2]!, ids5[3]!]) && same(r_ms, [ids5[1]!, ids5[3]!]) && r_ms2.length === 5 && [ids5[0], ids5[1], ids5[2], ids5[3], c1].every((x) => r_ms2.includes(x!)), "3 / 2 / 5", `${r_sel.length} / ${r_ms.length} / ${r_ms2.length}`);
  const r_lk = await list({ [`${tag}_lookup`]: employee.id }); const r_file = await list({ [`${tag}_file`]: "true" });
  const r_and = await list({ [`${tag}_text`]: "ปลา", [`${tag}_boolean`]: "false" });
  const fNoFilter = await mkField(sec.id, `${tag}_nofilter`, "TEXT", { filterable: false });
  const eNF = await fails(() => list({ [`${tag}_nofilter`]: "x" }));
  const eNoKey = await fails(() => list({ ghost_key_xyz: "x" }));
  chk("M1.2-S4.6", "LOOKUP eq → 2 + c1 (3) · FILE 'true' → มีไฟล์ (1) · 2 ตัวกรอง = AND (ปลา ∧ false → ปลาไหล,ปลากระเบน = 2) · ฟิลด์ไม่ filterable → throw ไทย · key ไม่มี → throw", r_lk.length === 3 && r_lk.includes(c1) && same(r_file, [ids5[0]!]) && same(r_and, [ids5[1]!, ids5[3]!]) && thai(eNF) && thai(eNoKey), "3 / 1 / 2 / throw", `${r_lk.length} / ${r_file.length} / ${r_and.length} / ${!!eNF}/${!!eNoKey}`);

  // ═══ S5 applyTemplate ═══
  const T = (await import("@/lib/modules/member/templates" as string)) as Any;
  const certField = await P.memberField.findUnique({ where: { id: E.fields.dive.certLevel } });
  await P.memberField.update({ where: { id: certField.id }, data: { label: "ระดับ (แก้เอง)" } });
  restore.push(() => P.memberField.update({ where: { id: certField.id }, data: { label: certField.label } }));
  const nF0 = await P.memberField.count({ where: { systemId: SYS } });
  const a1 = await F.applyTemplate(ctx, "dive");
  const nF1 = await P.memberField.count({ where: { systemId: SYS } });
  const certAfter = await P.memberField.findUnique({ where: { id: certField.id } });
  const healthSec = await P.memberSection.findFirst({ where: { systemId: SYS, key: "health" } });
  const newDive = (await P.memberField.findMany({ where: { systemId: SYS, key: { in: ["wetsuitSize", "insuranceExpiresAt", "instructorId", "medicalCertFile"] } } })) as Any[];
  chk("M1.2-S5.1", "applyTemplate(ctx,'dive'): เพิ่มเฉพาะฟิลด์ที่ยังไม่มี (wetsuitSize SELECT · insuranceExpiresAt DATE · instructorId LOOKUP EMPLOYEE · medicalCertFile FILE …) → added.fields > 0 · ไม่ทับ label ที่ร้านแก้ ('ระดับ (แก้เอง)' คงอยู่) · ส่วน health คง sensitive=true · ฟิลด์ที่เพิ่มถูก (isSystem false · ผ่าน validate เดียวกับ createField)", a1?.added?.fields > 0 && nF1 === nF0 + a1.added.fields && certAfter.label === "ระดับ (แก้เอง)" && healthSec?.sensitive === true && newDive.length === 4 && newDive.find((f) => f.key === "instructorId")?.type === "LOOKUP" && newDive.find((f) => f.key === "instructorId")?.options?.target === "EMPLOYEE" && newDive.find((f) => f.key === "medicalCertFile")?.type === "FILE" && newDive.every((f) => f.isSystem === false), "เพิ่มเฉพาะที่ขาด", JSON.stringify({ a1, nF0, nF1, label: certAfter?.label, newDive: newDive.map((f) => `${f.key}:${f.type}`)}));
  for (const f of newDive) made.fields.push(f.id);
  const a2 = await F.applyTemplate(ctx, "dive");
  const nF2 = await P.memberField.count({ where: { systemId: SYS } });
  const tpl = T.TEMPLATES ?? T.default;
  chk("M1.2-S5.2", "applyTemplate ซ้ำ → added {sections:0, fields:0} · จำนวนฟิลด์เท่าเดิม · templates registry มี key 'dive' และ 'general' (name ไทย · sections[] · fields ครบ key/label/type) · key ไม่รู้จัก → throw ไทย", a2?.added?.fields === 0 && a2.added.sections === 0 && nF2 === nF1 && tpl?.dive?.name && /[ก-๙]/.test(tpl.dive.name) && tpl?.general?.name && Array.isArray(tpl.dive.sections) && tpl.dive.sections.every((s: Any) => s.key && s.label && Array.isArray(s.fields) && s.fields.every((f: Any) => f.key && f.label && f.type)) && thai(await fails(() => F.applyTemplate(ctx, "no_such_template"))), "0 · registry", JSON.stringify({ a2, nF1, nF2, keys: Object.keys(tpl ?? {}) }));

  // ═══ S6 เพดาน ═══
  const lim = (await import("@/lib/modules/member/limits" as string)) as Any;
  const L = lim.MEMBER_LIMITS ?? lim.default;
  const nowF = await P.memberField.count({ where: { systemId: SYS, archivedAt: null } });
  const capSec = await mkSection(`${tag}_cap`);
  for (let i = nowF; i < 60; i++) await mkField(capSec.id, `${tag}_cap_${i}`, "TEXT");
  const eCap = await fails(() => F.createField(ctx, { sectionId: capSec.id, key: `${tag}_cap_over`, label: "เกิน", type: "TEXT" }));
  chk("M1.2-S6.1", "MEMBER_LIMITS.fields = 60 · สร้างจนครบ 60 (นับเฉพาะที่ไม่ archive) แล้วใบที่ 61 → throw ไทย มี LIMIT_REACHED", L?.fields === 60 && (await P.memberField.count({ where: { systemId: SYS, archivedAt: null } })) === 60 && thai(eCap) && /LIMIT_REACHED/.test(eCap?.message ?? ""), "60 · throw", `${L?.fields} · ${await P.memberField.count({ where: { systemId: SYS, archivedAt: null } })} · ${eCap?.message?.slice(0, 80)}`);
  const nowS = await P.memberSection.count({ where: { systemId: SYS } });
  for (let i = nowS; i < 12; i++) await mkSection(`${tag}_sec_${i}`);
  const eSecCap = await fails(() => F.createSection(ctx, { key: `${tag}_sec_over`, label: "เกิน" }));
  const filterableNow = await P.memberField.count({ where: { systemId: SYS, filterable: true, archivedAt: null } });
  const nonFilterable: Any[] = await P.memberField.findMany({ where: { systemId: SYS, filterable: false, archivedAt: null, isSystem: false }, take: 25 });
  let eFilt: Error | null = null; let turned = 0;
  for (const f of nonFilterable) { if (filterableNow + turned >= 20) { eFilt = await fails(() => F.updateField(ctx, f.id, { filterable: true })); break; } const e = await fails(() => F.updateField(ctx, f.id, { filterable: true })); if (e) { eFilt = e; break; } turned++; restore.push(() => P.memberField.update({ where: { id: f.id }, data: { filterable: false } })); }
  chk("M1.2-S6.2", "MEMBER_LIMITS.sections = 12 → ส่วนที่ 13 throw ไทย LIMIT_REACHED · filterable = 20 → เปิด filterable ตัวที่ 21 throw", L?.sections === 12 && thai(eSecCap) && /LIMIT_REACHED/.test(eSecCap?.message ?? "") && L?.filterable === 20 && thai(eFilt) && /LIMIT_REACHED/.test(eFilt?.message ?? ""), "throw ทั้งคู่", `sec=${eSecCap?.message?.slice(0, 60)} filt=${eFilt?.message?.slice(0, 60)} (${filterableNow}+${turned})`);
  const src = read("src/lib/modules/member/fields.ts");
  chk("M1.2-S6.3", "โค้ด: fields.ts ไม่มี `any` · ใช้ zod · import prisma จาก @/lib/core/db · ไม่ import โมดูลอื่นตรง (hr/system ผ่าน facade หรือ prisma อ่านตรงเฉพาะ lookup)", !/\bany\b/.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")) && /from "zod"/.test(src) && /@\/lib\/core\/db/.test(src) && !/@\/lib\/modules\/(pos|booking|chat|kanban|account)\//.test(src), "สะอาด", "ผิดกติกา", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.2-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  // S3.2 เปิด trackHistory ให้ฟิลด์ระบบ nickname แล้วเขียน history 1 แถว — ต้องลบทิ้ง ไม่งั้นรันซ้ำโดยไม่ reseed จะนับได้ 2 (builder M1.4 แย้งถูก)
  await d(async () => { const f = await P.memberField.findFirst({ where: { systemId: SYS, systemKey: "nickname" } }); if (f) await P.memberFieldValueHistory.deleteMany({ where: { fieldId: f.id } }); });
  if (made.fields.length) { await d(() => P.memberFieldValueHistory.deleteMany({ where: { fieldId: { in: made.fields } } })); await d(() => P.memberFieldValue.deleteMany({ where: { fieldId: { in: made.fields } } })); await d(() => P.memberField.deleteMany({ where: { id: { in: made.fields } } })); }
  if (made.sections.length) { await d(() => P.memberField.deleteMany({ where: { sectionId: { in: made.sections } } })); await d(() => P.memberSection.deleteMany({ where: { id: { in: made.sections } } })); }
  // ฟิลด์ที่ applyTemplate("dive") เพิ่มนอกเหนือจาก 4 ตัวที่ S5.1 จำไว้ (bootSize/insuranceNo — หนี้ M1.2 ข้อ 3) ลบตาม key ให้ seed กลับสภาพเดิม 7 ฟิลด์
  await d(async () => { const extra: Any[] = await P.memberField.findMany({ where: { systemId: SYS, key: { in: ["wetsuitSize", "bootSize", "insuranceNo", "insuranceExpiresAt", "instructorId", "medicalCertFile"] } }, select: { id: true } }); const ids = extra.map((f) => f.id); if (ids.length) { await P.memberFieldValueHistory.deleteMany({ where: { fieldId: { in: ids } } }); await P.memberFieldValue.deleteMany({ where: { fieldId: { in: ids } } }); await P.memberField.deleteMany({ where: { id: { in: ids } } }); } });
  await d(() => P.memberFieldValueHistory.deleteMany({ where: { tenantId: tid, fieldId: { in: made.fields } } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.2: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
