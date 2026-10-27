// providers/fake.ts — ผู้ให้บริการ FAKE (SVC R0.5 · ใบสั่ง §4) — ใช้เป็นข้อสอบสัญญา adapter เท่านั้น
// 🔴 เปิดเมื่อ INTEGRATIONS_FAKE === "1" **และ** APP_ENV !== "production" (อ่านตอนเรียก) — ปิด = ไม่อยู่ใน registry/catalog
// 🔴 mode FAIL จงใจโยนข้อความที่มี apiKey (positive control ของตัวกรอง) — service ห้ามเก็บ/แสดง error.message ของผู้ให้บริการ
import type { AdapterMap, AdapterOf, CallOpts, ProviderCreds, ProviderDef, StoredIntegrationKind } from "../types";
import { STORED_INTEGRATION_KINDS } from "../types";

export const FAKE_PROVIDER_CODE = "FAKE";
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
      verify: async (_input, expect, opts) => {
        await gate(opts);
        return { status: "VALID", amountSatang: expect.amountSatang, transRef: `FAKE-${Date.now().toString(36)}` };
      },
      quota: async (opts) => {
        await gate(opts);
        return { remaining: 100 };
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
  fields: [
    { name: "apiKey", label: "คีย์ API", secret: true, required: true },
    { name: "accountId", label: "รหัสบัญชี", secret: false, required: false },
    { name: "mode", label: "โหมดทดสอบ (OK / FAIL / QUOTA / SLOW / HANG)", secret: false, required: false },
  ],
  create: makeFake,
};
