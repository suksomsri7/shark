// QC — Form builder v1 (WO-0054) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/forms/service.ts (ctx {tenantId} — tenantDb ทุก query):
//   createForm(ctx, { name, description?, crmEnabled?, fields: [{key,label,type,required?,options?}] }) → { id, publicToken }
//     · name ว่าง/fields ว่าง → throw ไทย · key ซ้ำใน fields → throw ไทย
//     · type ∈ text|phone|email|select|textarea (อื่น → throw) · select ต้องมี options ≥1
//     · publicToken = token สุ่มยาว ≥ 20 ตัว (crypto ไม่ใช่ Math.random)
//   updateForm(ctx, id, patch) · listForms(ctx) · getForm(ctx, id) (พร้อมนับ submissions)
//   getPublicForm(token) → { form } | null — **ไม่ใช้ ctx (public) แต่ต้องคืนเฉพาะ active=true** · inactive/token ปลอม → null
//   submitPublicForm(token, answers: Record<string,unknown>, meta?: { ip? }) → { id } — public เช่นกัน
//     · form inactive/ไม่มี → throw ไทย · field required ไม่กรอก/ค่าว่าง → throw ไทย
//     · เก็บเฉพาะ key ที่ประกาศใน fieldsJson (key แปลกปลอม → ตัดทิ้งเงียบ ๆ)
//     · crmEnabled + tenant มีระบบ CRM (AppSystem type CRM ตัวแรก) → crm.createContact
//       { name: ค่า field key "name" (หรือ field แรก type text), phone: key "phone", email: key "email", source: "FORM" }
//       → เก็บ crmContactId ลง submission · **ไม่มีระบบ CRM → submission ยังบันทึกสำเร็จ (ข้าม CRM เงียบ ๆ)**
//   listSubmissions(ctx, formId, take?) → เรียงใหม่ก่อน
// public UI: /f/[token] (render ตาม fieldsJson + ส่ง + หน้าขอบคุณ · rate limit ด้วย core checkRateLimit)
// app UI: /app/forms (สร้าง/แก้ฟอร์ม builder เพิ่ม-ลบ field + ลิงก์สาธารณะ copy ได้ + ตาราง submissions) + ลิงก์ NavDrawer · actions มี assertCan forms.*
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const fm = (await import("@/lib/modules/forms/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!fm) { chk("FM-0", "มี forms/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC FORM", slug: `qc-form-${Date.now()}` } }); tid = t.id;
    await sys.createSystem(tid, "CRM", "ลูกค้ามุ่งหวัง");
    const ctx = { tenantId: tid };
    const FIELDS = [
      { key: "name", label: "ชื่อ", type: "text", required: true },
      { key: "phone", label: "เบอร์โทร", type: "phone", required: true },
      { key: "email", label: "อีเมล", type: "email" },
      { key: "topic", label: "สนใจเรื่อง", type: "select", options: ["คอร์ส A", "คอร์ส B"] },
    ];

    // 1) create + validation
    let th1 = false; try { await fm.createForm(ctx, { name: "x", fields: [] }); } catch { th1 = true; }
    let th2 = false; try { await fm.createForm(ctx, { name: "x", fields: [{ key: "a", label: "ก", type: "text" }, { key: "a", label: "ข", type: "text" }] }); } catch { th2 = true; }
    let th3 = false; try { await fm.createForm(ctx, { name: "x", fields: [{ key: "a", label: "ก", type: "checkbox" }] }); } catch { th3 = true; }
    chk("FM-1.1", "fields ว่าง / key ซ้ำ / type แปลก → throw ทั้งสาม", th1 && th2 && th3, "throw×3", `${th1}/${th2}/${th3}`);
    const f1 = await fm.createForm(ctx, { name: "ฟอร์มสนใจคอร์ส", crmEnabled: true, fields: FIELDS });
    chk("FM-1.2", "publicToken ยาว ≥20", typeof f1.publicToken === "string" && f1.publicToken.length >= 20, "≥20", String(f1.publicToken).length + "");

    // 2) public form
    const pub = await fm.getPublicForm(f1.publicToken);
    chk("FM-2.1", "getPublicForm ได้ฟอร์ม (ไม่ใช้ ctx) · token ปลอม → null", (pub as { form?: { id?: string } })?.form?.id === f1.id && (await fm.getPublicForm("no-such-token-xxxxxxxxxx")) === null, "เจอ/null", "?");

    // 3) submit + validation + CRM
    let thReq = false; try { await fm.submitPublicForm(f1.publicToken, { name: "ก" }); } catch { thReq = true; } // ขาด phone (required)
    chk("FM-3.1", "required ไม่กรอก → throw", thReq, "throw", "?");
    const sub = await fm.submitPublicForm(f1.publicToken, { name: "คุณลีด", phone: "0801112222", email: "lead@x.com", topic: "คอร์ส A", hack: "ตัดทิ้ง" }, { ip: "1.2.3.4" });
    const row = await prisma.formSubmission.findUnique({ where: { id: sub.id as string } });
    const ans = (row?.answersJson ?? {}) as Record<string, unknown>;
    chk("FM-3.2", "บันทึก answers ตาม fields + ตัด key แปลกปลอม", ans.name === "คุณลีด" && ans.phone === "0801112222" && !("hack" in ans), "ครบ+ตัด hack", JSON.stringify(ans).slice(0, 60));
    const contact = row?.crmContactId ? await prisma.crmContact.findUnique({ where: { id: row.crmContactId } }) : null;
    chk("FM-3.3", "crmEnabled + มีระบบ CRM → CrmContact เกิด (ชื่อ+เบอร์+source FORM)", !!contact && contact.name === "คุณลีด" && contact.phone === "0801112222" && contact.source === "FORM", "contact", JSON.stringify({ n: contact?.name, s: contact?.source }));

    // 4) inactive
    await fm.updateForm(ctx, f1.id, { active: false });
    let thOff = false; try { await fm.submitPublicForm(f1.publicToken, { name: "ก", phone: "1" }); } catch { thOff = true; }
    chk("FM-4.1", "ปิดฟอร์ม → getPublicForm null + submit throw", (await fm.getPublicForm(f1.publicToken)) === null && thOff, "null+throw", "?");

    // 5) ไม่มีระบบ CRM → ยังบันทึกได้
    const t2 = await prisma.tenant.create({ data: { name: "QC FORM2", slug: `qc-form2-${Date.now()}` } }); tid2 = t2.id;
    const f2 = await fm.createForm({ tenantId: tid2 }, { name: "ฟอร์มไม่มี CRM", crmEnabled: true, fields: [{ key: "name", label: "ชื่อ", type: "text", required: true }] });
    const sub2 = await fm.submitPublicForm(f2.publicToken, { name: "คุณสอง" });
    chk("FM-5.1", "ไม่มีระบบ CRM → submission สำเร็จ + crmContactId null", !!sub2.id && (await prisma.formSubmission.findUnique({ where: { id: sub2.id as string } }))?.crmContactId === null, "สำเร็จ/null", "?");

    // 6) list + isolation
    chk("FM-6.1", "listSubmissions ของ form1 = 1 แถว", ((await fm.listSubmissions(ctx, f1.id)) as unknown[]).length === 1, "1", "?");
    chk("FM-6.2", "tenant อื่นไม่เห็นฟอร์มกัน (guard)", ((await fm.listForms({ tenantId: tid2 })) as unknown[]).length === 1, "1 (ของตัวเอง)", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["formSubmission", "formDef", "crmActivity", "crmDeal", "crmContact", "crmStage", "crmPipeline", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Form Builder =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
