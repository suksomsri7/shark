// lan.ts — POS P3-SKEL U ▸ CD-SKELU-9: ทางพิมพ์ "escpos-lan" ฝั่ง client — ไบต์ ESC/POS ชุดเดียวกับ USB/BT → enqueuePrintJobAction (cloud relay) → ตัวช่วยพิมพ์ในวงแลน
//   ผล ok = "ส่งเข้าคิวแล้ว" (via "lan") — ไม่ใช่ "พิมพ์แล้ว" (ไม่มีตัวอ่านสถานะงาน · เครื่องพิมพ์จริง = W5)
//   ตัวช่วยพิมพ์ของสาขา: ไม่ถูกเพิกถอน · ช่วงโครงต้องมี 1 ตัวพอดี (≥ 2 = ปิด agentMany) · เครื่องของงาน = target ตรง หรือเครื่องเดียวที่ไม่ระบุ target (กติกาเดียวกับ printerFor ของ print-relay.ts)
// 🔴 ไม่โยน · ไม่ log ไบต์/โทเคน · คีย์งาน = สุ่มต่อการกด (ไฟล์นี้ไม่ใช่ไฟล์หน้าขาย — S5.21 ไม่เกี่ยว)
import { enqueuePrintJobAction, listPrintAgentsAction } from "@/lib/modules/pos/platform-ui-actions";
import type { PrintAgentView, PrintPrinter, PrintTarget } from "@/lib/modules/pos/print-relay";
import { refusePrint, type PrintResult } from "./types";

/** บริบทของสาขาที่พิมพ์ (หน้าที่รู้ systemId/unitId ส่งมา) */
export type LanCtx = { systemId: string; unitId: string };
export type LanAgentLite = Pick<PrintAgentView, "id" | "name" | "printers" | "revokedAt">;
export type LanState = { state: "none" } | { state: "many" } | { state: "noPrinter"; agent: LanAgentLite } | { state: "ok"; agent: LanAgentLite; printer: PrintPrinter };

/** เครื่องพิมพ์ของงาน — target ตรง → เครื่องนั้น · ไม่มี target และมีเครื่องเดียว → เครื่องนั้น · อื่น = null */
export function lanPrinterFor(printers: readonly PrintPrinter[], target: PrintTarget): PrintPrinter | null {
  const hit = printers.find((p) => p.target === target);
  if (hit) return hit;
  return printers.length === 1 && !printers[0]!.target ? printers[0]! : null;
}

/** สถานะ LAN ของสาขาสำหรับงานชนิดหนึ่ง (ปุ่มโหมด/วิทยุใบครัว/ทางพิมพ์ใช้กติกาเดียวกัน) */
export function lanStateOf(agents: readonly LanAgentLite[] | null | undefined, target: PrintTarget): LanState {
  const live = (agents ?? []).filter((a) => !a.revokedAt);
  if (live.length === 0) return { state: "none" };
  if (live.length > 1) return { state: "many" };
  const agent = live[0]!;
  const printer = lanPrinterFor(agent.printers, target);
  return printer ? { state: "ok", agent, printer } : { state: "noPrinter", agent };
}

/** คีย์ข้อความของคำปฏิเสธทาง LAN (ใต้ pos.platform) */
export function lanMessageKey(code: string | undefined): string {
  if (code === "AGENT_NONE") return "print.agentNone";
  if (code === "AGENT_MANY") return "print.agentMany";
  if (code === "AGENT_NO_PRINTER") return "print.agentNoPrinter";
  const known = ["NOT_FOUND", "PERMISSION_DENIED", "VALIDATION", "AGENT_REVOKED", "UNAUTHORIZED", "CONFLICT"];
  const c = known.includes(code ?? "") ? code! : "UNKNOWN";
  return `print.errors.${c.toLowerCase().replace(/_([a-z])/g, (_, x: string) => x.toUpperCase())}`;
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const jobKey = () => `lan_${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 100);
const lanRefuse = (code: string): PrintResult => ({ ...refusePrint(code.startsWith("AGENT_") && code !== "AGENT_REVOKED" ? "NO_DEVICE" : "WRITE_FAILED", "lan"), lanCode: code });

/** ส่งไบต์ชุดหนึ่งเข้าคิวของตัวช่วยพิมพ์ของสาขา (หลายใบ = หลายงาน · หยุดที่ใบแรกที่ถูกปฏิเสธ) */
export async function sendLan(chunks: readonly Uint8Array[], target: PrintTarget, ctx: LanCtx | undefined, deviceCode: string | undefined): Promise<PrintResult> {
  try {
    if (!ctx || !deviceCode) return lanRefuse("AGENT_NONE");
    const list = await listPrintAgentsAction({ systemId: ctx.systemId, unitId: ctx.unitId });
    if (!list || list.ok !== true) return lanRefuse(list?.code ?? "UNKNOWN");
    const st = lanStateOf(list.agents, target);
    if (st.state === "none") return lanRefuse("AGENT_NONE");
    if (st.state === "many") return lanRefuse("AGENT_MANY");
    if (st.state === "noPrinter") return lanRefuse("AGENT_NO_PRINTER");
    for (const bytes of chunks) {
      const r = await enqueuePrintJobAction({ systemId: ctx.systemId, unitId: ctx.unitId, input: { deviceCode, target, agentId: st.agent.id, bytesB64: toB64(bytes), idempotencyKey: jobKey() } });
      if (!r || r.ok !== true) return lanRefuse(r?.code ?? "UNKNOWN");
    }
    return { ok: true, via: "lan" };
  } catch {
    return lanRefuse("UNKNOWN");
  }
}
