// QC — หน้าตั้งค่า Webhooks: ผู้ใช้ต้อง "รู้ผล" ของทุกปุ่มที่กด
//
// ⚠️ ชื่อไฟล์: มี `qc-webhook.mts` อยู่ก่อนแล้ว (ตัวนั้นทดสอบ service + dispatch)
//    แยกไฟล์นี้ออกมาโดยตั้งใจเพราะ **ชุดนี้ไม่แตะฐานข้อมูลเลย** — อ่านซอร์สอย่างเดียว
//    (`qc-webhook.mts` ต่อ Neon prod จริงและสร้าง/ลบ tenant ทดสอบ ⇒ ไม่ควรต้องรันบ่อย ๆ
//     แค่เพื่อตรวจเรื่องหน้าจอ)
//
// สัญญาที่ล็อกไว้ (เจ้าของแจ้งเอง 30 ส.ค. 2026: "กดบันทึกแล้วไม่รู้ว่าบันทึกยัง ไม่มีเอฟเฟคอะไรบอกเลย"):
//   U-1) ปุ่มบันทึกเหตุการณ์ต้องมีครบสามสถานะ — กำลังบันทึก · สำเร็จ · ผิดพลาด
//   U-2) คำยืนยันต้องบอกว่า "ตอนนี้รับอะไรบ้าง" จากค่าที่ **อ่านกลับจาก DB** ไม่ใช่ค่าที่ฟอร์มส่งไป
//   U-3) แผงต้องค้างเปิดหลังบันทึก (ถ้าหุบ คำยืนยันจะหายไปพร้อมแผง = เท่ากับไม่มี)
//   U-4) แก้เหตุการณ์ต้องไม่มีทางแตะ secret

const { readFileSync } = await import("node:fs");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
/** ตัดคอมเมนต์ออกก่อนตรวจ — ไม่งั้นคอมเมนต์ที่**อธิบายบั๊ก** จะถูกนับเป็นตัวบั๊กเอง
 *  (เจอจริง: คอมเมนต์ "รอบแรกทำเป็น <details>" ทำข้อสอบ U-3.1 แดงทั้งที่โค้ดถูกแล้ว) */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");

const EDITOR = read("src/components/webhook-events-editor.tsx");
const ACTIONS = read("src/lib/webhooks/actions.ts");
const SERVICE = read("src/lib/webhooks/service.ts");
const PAGE = read("src/app/app/settings/webhooks/page.tsx");

chk("U-0", "มีคอมโพเนนต์แก้เหตุการณ์ และหน้าเรียกใช้จริง",
  EDITOR.length > 0 && PAGE.includes("<WebhookEventsEditor"), "มีทั้งคู่",
  `editor ${EDITOR.length} ตัวอักษร · page ${PAGE.includes("<WebhookEventsEditor")}`);

// U-1 · สามสถานะ
chk("U-1.1", "🔴 ตอนกำลังบันทึก ปุ่มเปลี่ยนข้อความ + กดซ้ำไม่ได้",
  /pending \? "กำลังบันทึก…"/.test(EDITOR) && /disabled=\{pending\}/.test(EDITOR),
  "มีทั้งข้อความและ disabled", `label ${/กำลังบันทึก/.test(EDITOR)} · disabled ${/disabled=\{pending\}/.test(EDITOR)}`);
chk("U-1.2", "🔴 บันทึกสำเร็จ → ขึ้นคำยืนยันบนจอ",
  /state\.status === "ok"/.test(EDITOR) && /บันทึกแล้ว/.test(EDITOR),
  "มีบล็อก ok + ข้อความยืนยัน", `ok ${/state\.status === "ok"/.test(EDITOR)}`);
chk("U-1.3", "ผิดพลาด → ขึ้นข้อความผิดพลาด ไม่ใช่เงียบ",
  /state\.status === "error"/.test(EDITOR) && /color-danger/.test(EDITOR),
  "มีบล็อก error", `error ${/state\.status === "error"/.test(EDITOR)}`);
chk("U-1.4", "action คืน 'สถานะ' ไม่ใช่ void (ไม่งั้นหน้าจอไม่มีอะไรให้แสดง)",
  /updateEndpointEventsAction\([\s\S]{0,200}?\): Promise<UpdateEventsState>/.test(ACTIONS),
  "Promise<UpdateEventsState>", /Promise<void>/.test(ACTIONS.slice(ACTIONS.indexOf("updateEndpointEventsAction"))) ? "ยังเป็น void" : "?");

// U-2 · คำยืนยันต้องเชื่อถือได้
chk("U-2.1", "🔴 คำยืนยันใช้ค่าที่อ่านกลับจาก DB (saved.eventsJson) ไม่ใช่ค่าที่ฟอร์มส่งไป",
  /const saved = await setEndpointEvents/.test(ACTIONS) && /saved\.eventsJson/.test(ACTIONS) && /status: "ok", events: stored/.test(ACTIONS),
  "อ่านกลับจากผลลัพธ์ของ setEndpointEvents", `saved ${/saved\.eventsJson/.test(ACTIONS)}`);
chk("U-2.2", "คำยืนยันบอกด้วยว่าตอนนี้รับเหตุการณ์อะไรบ้าง (ไม่ใช่แค่ 'สำเร็จ')",
  /state\.events/.test(EDITOR) && /webhookEventLabel/.test(EDITOR) && /ทุกเหตุการณ์/.test(EDITOR),
  "แสดงรายการ + กรณีว่าง", `events ${/state\.events/.test(EDITOR)}`);

// U-3 · แผงต้องไม่หุบหลังบันทึก
chk("U-3.1", "🔴 ไม่ใช้ <details> (หน้าเรนเดอร์ใหม่แล้วหุบเอง = คำยืนยันหายไปพร้อมแผง)",
  !/<details/.test(code(EDITOR)) && !/<details/.test(code(PAGE)), "ไม่มี <details> ในโค้ดจริง",
  `editor ${/<details/.test(code(EDITOR))} · page ${/<details/.test(code(PAGE))}`);
chk("U-3.2", "การเปิด/ปิดแผงคุมด้วย state ของคอมโพเนนต์เอง (บันทึกแล้วยังเปิดอยู่)",
  /useState\(false\)/.test(EDITOR) && /if \(!open\)/.test(EDITOR), "มี state `open`",
  `useState ${/useState\(false\)/.test(EDITOR)}`);

// U-4 · ห้ามแตะ secret
chk("U-4.1", "🔴 setEndpointEvents เขียนเฉพาะ eventsJson — ห้ามมี secret ในคำสั่งอัปเดต",
  (() => {
    const i = SERVICE.indexOf("export async function setEndpointEvents");
    const body = i < 0 ? "" : SERVICE.slice(i, SERVICE.indexOf("\n}", i));
    return i >= 0 && body.includes("eventsJson") && !body.includes("secret");
  })(),
  "มี eventsJson · ไม่มี secret", "?");
chk("U-4.2", "หน้าเว็บบอกผู้ใช้ตรง ๆ ว่ารหัสลับไม่เปลี่ยน (กันคนกลัวจนไม่กล้ากด)",
  /รหัสลับไม่เปลี่ยน/.test(EDITOR), "มีข้อความ", "?", "MINOR");

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Webhooks UI =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
