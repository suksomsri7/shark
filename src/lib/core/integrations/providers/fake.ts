// providers/fake.ts — ผู้ให้บริการ FAKE (SVC R0.5 · ใบสั่ง §4) — ใช้เป็นข้อสอบสัญญา adapter เท่านั้น
// 🔴 เปิดเมื่อ INTEGRATIONS_FAKE === "1" **และ** APP_ENV !== "production" (อ่านตอนเรียก) — ปิด = ไม่อยู่ใน registry/catalog
// 🔴 mode FAIL จงใจโยนข้อความที่มี apiKey (positive control ของตัวกรอง) — service ห้ามเก็บ/แสดง error.message ของผู้ให้บริการ
import type { AdapterMap, AdapterOf, CallOpts, ProviderCreds, ProviderDef, SlipVerifyResult, StoredIntegrationKind } from "../types";
import { STORED_INTEGRATION_KINDS } from "../types";

export const FAKE_PROVIDER_CODE = "FAKE";
/** SVC R0.6 §6 — คำนำหน้าสคริปต์สลิปของ FAKE (ข้อสอบสั่งผลตรวจได้ทีละใบ) */
export const FAKE_SLIP_SCRIPT_PREFIX = "FAKESLIP:";

const SLIP_STATUSES: readonly SlipVerifyResult["status"][] = ["VALID", "INVALID", "DUPLICATE", "UNKNOWN"];

/** base64url → ข้อความ utf8 — ไม่ใช้ node:crypto/Buffer (ไฟล์นี้ถูก registry ดึงเข้าบันเดิลฝั่ง client ด้วย) */
function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** อ่านสคริปต์ "FAKESLIP:" + base64url(JSON) — อ่านไม่ได้ = null (ใช้พฤติกรรมเดิม) · เก็บเฉพาะคีย์ของ SlipVerifyResult ที่ชนิดถูก */
function fakeSlipScript(qrPayload: unknown): SlipVerifyResult | null {
  if (typeof qrPayload !== "string" || !qrPayload.startsWith(FAKE_SLIP_SCRIPT_PREFIX)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(decodeBase64Url(qrPayload.slice(FAKE_SLIP_SCRIPT_PREFIX.length)));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const status = o.status === undefined ? "VALID" : SLIP_STATUSES.find((x) => x === o.status);
  if (!status) return null;
  const out: SlipVerifyResult = { status };
  if (typeof o.amountSatang === "number") out.amountSatang = o.amountSatang;
  for (const k of ["transRef", "payerName", "receiverMasked", "transferredAt", "providerRef"] as const) {
    const v = o[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** SVC C.3 ▸ ข้อความตัวเลข → number (ว่าง/ไม่ใช่ตัวเลข = undefined) ◂ */
function fakeNumber(v: string | undefined): number | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** mode SLOW รอกี่ ms ก่อนผ่าน */
export const FAKE_SLOW_MS = 1500;

export function fakeProviderEnabled(): boolean {
  return process.env.INTEGRATIONS_FAKE === "1" && process.env.APP_ENV !== "production";
}

/** โยนแบบ AbortError เมื่อ signal ถูก abort (เหมือน fetch) */
function abortError(): Error {
  return Object.assign(new Error("fake provider aborted"), { name: "AbortError" });
}

function makeFake<K extends StoredIntegrationKind>(kind: K, creds: ProviderCreds): AdapterOf<K> {
  const apiKey = creds.secrets.apiKey ?? "";
  const mode = (creds.publicFields.mode ?? "OK").toUpperCase();
  // 🔴 เคารพ signal: abort แล้ว = ไม่ทำต่อ · mode SLOW = รอ 1500 ms แล้วผ่าน · mode HANG = ค้างจนกว่าจะถูก abort (ใช้พิสูจน์ว่า callIntegration ยกเลิกงานจริงเมื่อหมดเวลา)
  const gate = async (opts?: CallOpts): Promise<void> => {
    const signal = opts?.signal;
    if (signal?.aborted) throw abortError();
    if (mode === "HANG") {
      await new Promise<never>((_, reject) => {
        if (!signal) return; // ไม่มี signal = ค้างตลอด (ผู้เรียกต้องมี timeout)
        signal.addEventListener("abort", () => reject(abortError()), { once: true });
      });
    }
    if (mode === "SLOW") {
      // รอ 1500 ms แล้วผ่าน — abort ระหว่างรอ = เลิกทันที (มติผู้ตรวจ R0.5 ข้อ 10)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, FAKE_SLOW_MS);
        const onAbort = () => {
          clearTimeout(timer);
          reject(abortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    if (mode === "FAIL") throw new Error("fake provider failure apiKey=" + apiKey);
    if (mode === "QUOTA") throw Object.assign(new Error("fake provider quota exceeded"), { code: "QUOTA" });
  };
  const test = async (opts?: CallOpts): Promise<void> => {
    await gate(opts);
  };
  const all: AdapterMap = {
    SLIP_VERIFY: {
      test,
      verify: async (input, expect, opts) => {
        await gate(opts);
        // SVC R0.6 §6 ▸ สคริปต์สลิป: qrPayload "FAKESLIP:" + base64url(JSON) ⇒ คืน JSON นั้น (ผ่าน gate ตาม mode ก่อนเสมอ)
        const scripted = fakeSlipScript(input?.qrPayload);
        if (scripted) return scripted;
        // ไม่ใช่สคริปต์ = พฤติกรรมเดิม · เลขอ้างอิงสุ่ม (ของเดิม Date.now() ชนกันเมื่อยิงพร้อมกัน ⇒ "ซ้ำ" ปลอม) ◂
        return { status: "VALID", amountSatang: expect.amountSatang, transRef: `FAKE-${globalThis.crypto.randomUUID()}` };
      },
      quota: async (opts) => {
        await gate(opts);
        // SVC C.3 ▸ ข้อสอบตั้งโควตาได้ผ่านฟิลด์สาธารณะ (ไม่ตั้ง = { remaining: 100 } เท่าเดิม) ◂
        const remaining = fakeNumber(creds.publicFields.quotaRemaining);
        const limit = fakeNumber(creds.publicFields.quotaLimit);
        return { remaining: remaining ?? 100, ...(limit !== undefined ? { limit } : {}) };
      },
    },
    PAYMENT_GATEWAY: {
      test,
      createCharge: async (input, opts) => {
        await gate(opts);
        return { chargeId: `FAKE-${input.ref}`, payUrl: input.returnUrl };
      },
      verifyWebhook: async (_raw, _headers, opts) => {
        await gate(opts);
        return { chargeId: "FAKE", paid: true };
      },
    },
    SMS: {
      test,
      send: async (input, opts) => {
        await gate(opts);
        return { ok: true, externalId: `FAKE-${input.ref}` };
      },
    },
    CHANNEL_MANAGER: {
      test,
      pushAri: async (_m, _d, _a, opts) => {
        await gate(opts);
      },
      pullReservations: async (_since, opts) => {
        await gate(opts);
        return [];
      },
      ackReservation: async (_id, opts) => {
        await gate(opts);
      },
    },
    METER: {
      test,
      readings: async (_ids, _period, opts) => {
        await gate(opts);
        return [];
      },
    },
    CALENDAR: { test },
    EDC: { test },
  };
  return all[kind];
}

export const FAKE_PROVIDER: ProviderDef = {
  code: FAKE_PROVIDER_CODE,
  label: "ผู้ให้บริการทดสอบ (FAKE)",
  kinds: STORED_INTEGRATION_KINDS,
  capabilities: { checksReceiver: true },
  fields: [
    { name: "apiKey", label: "คีย์ API", secret: true, required: true },
    { name: "accountId", label: "รหัสบัญชี", secret: false, required: false },
    { name: "mode", label: "โหมดทดสอบ (OK / FAIL / QUOTA / SLOW / HANG)", secret: false, required: false },
    // SVC C.3 ▸ โควตาจำลองของ quota() (ไม่บังคับ) ◂
    { name: "quotaRemaining", label: "โควตาคงเหลือ (ทดสอบ)", secret: false, required: false },
    { name: "quotaLimit", label: "โควตาทั้งหมด (ทดสอบ)", secret: false, required: false },
  ],
  create: makeFake,
};
