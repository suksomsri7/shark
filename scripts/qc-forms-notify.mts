// QC — Forms notification (Wave4-B) · Fable oracle · Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast
// สัญญา: submitPublicForm(token, answers) → สร้าง FormSubmission + AppNotification "มีคนกรอกฟอร์ม"
//   + emitOutbox "forms.submission.received" · lead เข้า CRM ถ้า crmEnabled+มีระบบ CRM
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const forms = (await import("@/lib/modules/forms/service" as string)) as {
  createForm: (ctx: any, input: any) => Promise<{ id: string; publicToken: string }>;
  submitPublicForm: (token: string, answers: any, meta?: any) => Promise<{ id: string }>;
};
const sys = await import("@/lib/modules/system/service");

type Sev = "CRITICAL" | "MAJOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e = "", a = "", s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

let tid = "", tid2 = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC FN", slug: `qc-fn-${Date.now()}` } });
  tid = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC FN2", slug: `qc-fn2-${Date.now()}` } });
  tid2 = t2.id;
  const crmSys = await sys.createSystem(tid, "CRM", "CRM QC");

  const notifCount = async (tenantId: string) =>
    prisma.appNotification.count({ where: { tenantId, title: "มีคนกรอกฟอร์มเข้ามา" } });
  const outboxCount = async (tenantId: string) =>
    prisma.outboxEvent.count({ where: { tenantId, type: "forms.submission.received" } });

  // ── สร้างฟอร์ม (crmEnabled) ──
  const f = await forms.createForm(
    { tenantId: tid },
    {
      name: "ฟอร์มติดต่อ QC",
      crmEnabled: true,
      fields: [
        { key: "name", label: "ชื่อ", type: "text", required: true },
        { key: "phone", label: "เบอร์", type: "phone", required: false },
      ],
    },
  );
  chk("FN-0", "createForm คืน publicToken", !!f.publicToken);

  const n0 = await notifCount(tid);
  const sub1 = await forms.submitPublicForm(f.publicToken, { name: "คุณสมชาย", phone: "0812345678" });
  chk("FN-1", "submit คืน submission id", !!sub1.id);
  chk("FN-2", "AppNotification 'มีคนกรอกฟอร์ม' +1", (await notifCount(tid)) === n0 + 1, String(n0 + 1), String(await notifCount(tid)));
  chk("FN-3", "emitOutbox forms.submission.received ≥1", (await outboxCount(tid)) >= 1);

  // lead เข้า CRM
  const contactCount = await prisma.crmContact.count({ where: { tenantId: tid, systemId: crmSys.id } });
  chk("FN-4", "lead เข้า CRM (crmEnabled)", contactCount >= 1, "≥1", String(contactCount));

  // แต่ละ submission = 1 lead จริง → แจ้งอีกครั้ง (ไม่ de-dup เพราะเป็นคนละ lead)
  const n1 = await notifCount(tid);
  await forms.submitPublicForm(f.publicToken, { name: "คุณสมหญิง" });
  chk("FN-5", "submit ที่ 2 → แจ้งอีก 1 (คนละ lead)", (await notifCount(tid)) === n1 + 1);

  // required missing → throw ก่อนถึง notification (ไม่แจ้ง)
  const nBefore = await notifCount(tid);
  let threw = false;
  try { await forms.submitPublicForm(f.publicToken, { phone: "0800000000" }); } catch { threw = true; }
  chk("FN-6", "required ขาด → throw", threw);
  chk("FN-7", "required ขาด → ไม่สร้าง notification", (await notifCount(tid)) === nBefore, String(nBefore), String(await notifCount(tid)));

  // cross-tenant: notification/outbox ผูก tenant เจ้าของฟอร์มเท่านั้น (tid) ไม่รั่วไป tid2
  chk("FN-8", "cross-tenant: tid2 ไม่มี notification ฟอร์มนี้", (await notifCount(tid2)) === 0, "0", String(await notifCount(tid2)));
} catch (e) {
  chk("FN-ERR", "รันจบไม่ throw", false, "no throw", e instanceof Error ? e.message : String(e));
} finally {
  for (const id of [tid, tid2]) {
    if (!id) continue;
    for (const m of ["appNotification", "outboxEvent", "formSubmission", "formDef", "crmContact", "appSystemUnit", "appSystem"]) {
      try { await (prisma as any)[m].deleteMany({ where: { tenantId: id } }); } catch {}
    }
    try { await prisma.tenant.delete({ where: { id } }); } catch {}
  }
  console.log("[cleanup] เรียบร้อย");
}

const fail = cks.filter((c) => !c.ok);
console.log(`\nQC Forms Notify: ${cks.length - fail.length}/${cks.length} ผ่าน`);
if (fail.length) { console.error(`❌ ตก ${fail.length}`); process.exit(1); }
console.log("✅ เขียวหมด");
