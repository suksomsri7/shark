// ops/core.ts — op พื้นฐาน 4 ตัวที่ "ไม่แตะข้อมูลจริง" ไว้ทดสอบแกน REST (WO A3)
//
// เก็บไว้ถาวรเป็น smoke test: เวลาผู้เชื่อมต่อภายนอกตั้งคีย์ใหม่ ให้ยิง `GET /ping` ก่อนเสมอ
// เพื่อแยกว่า "คีย์/สมุด/สิทธิ์ผิด" (ปัญหาของเขา) ออกจาก "ข้อมูลบัญชีผิด" (ปัญหาของเรา)
//
// 4 ตัวนี้ครอบทุกเส้นทางของแกน: read ธรรมดา · read ที่มี path param · write ที่มี body + idempotency ·
// danger ที่ต้อง confirm + reason

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { defineOp, type ApiOp } from "../op";

const echoInput = z
  .object({
    text: z.string().min(1).max(100),
    // จำนวนเงินในระบบนี้เป็น "สตางค์" เสมอ ⇒ ต้องเป็นจำนวนเต็ม ≥ 0 (ทศนิยม = ปัดเศษเงียบ ๆ)
    amountSatang: z.number().int().min(0).optional(),
  })
  .strict();

// `confirm` ถูกตรวจและถอดออกที่ dispatch กลางแล้ว — schema เห็นแค่ `reason`
const dangerInput = z.object({ reason: z.string().min(5) }).strict();

const ping = defineOp({
  id: "ping",
  method: "GET",
  path: "/ping",
  kind: "read",
  action: "account.doc.view",
  summary: "Check that the API key works and see which accounting book it is bound to.",
  label: "ทดสอบการเชื่อมต่อ",
  test: "CORE-2.1",
  async handler({ actor }) {
    return { ok: true, systemId: actor.systemId, keyName: actor.keyName };
  },
});

const echoById = defineOp({
  id: "echo-by-id",
  method: "GET",
  path: "/echo/{id}",
  kind: "read",
  action: "account.doc.view",
  summary: "Echo back the id captured from the path (used to verify path parameters).",
  label: "ทดสอบพารามิเตอร์ใน path",
  test: "CORE-2.4",
  async handler({ params }) {
    return { id: params.id };
  },
});

const echo = defineOp({
  id: "echo",
  method: "POST",
  path: "/echo",
  kind: "write",
  action: "account.doc.create",
  summary: "Echo back the request body plus a random nonce (used to verify idempotency).",
  label: "ทดสอบการเขียนแบบกันซ้ำ",
  input: echoInput,
  test: "CORE-4.3",
  async handler({ input }) {
    // nonce สุ่มใหม่ทุกครั้งที่ "ทำจริง" ⇒ ถ้าเรียกซ้ำแล้ว nonce เท่าเดิม แปลว่าเป็นการตอบซ้ำจริง
    return { echo: input, nonce: randomBytes(8).toString("hex") };
  },
});

const dangerEcho = defineOp({
  id: "danger-echo",
  method: "POST",
  path: "/danger-echo",
  kind: "danger",
  action: "account.doc.void",
  summary: "Danger-class smoke test: requires confirm=true and a reason of at least 5 characters.",
  label: "ทดสอบคำสั่งที่ย้อนกลับยาก",
  input: dangerInput,
  test: "CORE-7.5",
  async handler({ input }) {
    return { reason: input.reason };
  },
});

export const CORE_OPS: ApiOp[] = [ping, echoById, echo, dangerEcho];
