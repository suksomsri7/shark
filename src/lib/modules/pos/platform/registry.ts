// platform/registry.ts — ทะเบียน adapter แพลตฟอร์มภายนอก (P3-SKEL R1 R4) — คีย์ = รหัสช่องทาง (SalesChannel.code ของ preset EXTERNAL) ตรงตัว 5 ตัว
// ใช้โดย: dispatch.ts (คำสั่ง C-7 ของช่องทาง adapter API) · route ขาเข้า /api/pos/platform/[provider]/[channelId] · integration-creds.ts (ชื่อฟิลด์)
// 🔴 ready:false ทุกตัว (facts ใน pos-integrations.ts คง false · มติ §10-9) — ไฟล์นี้ไม่มี prisma
import { grabAdapter } from "./grab";
import { linemanAdapter } from "./lineman";
import { lazadaAdapter, shopeeAdapter, tiktokAdapter } from "./marketplace";
import type { PlatformAdapter, PlatformProvider } from "./types";

export const PLATFORM_ADAPTERS: Readonly<Record<PlatformProvider, PlatformAdapter>> = Object.freeze({
  LINEMAN: linemanAdapter,
  GRAB: grabAdapter,
  SHOPEE: shopeeAdapter,
  LAZADA: lazadaAdapter,
  TIKTOK: tiktokAdapter,
});

/** adapter ของรหัสแพลตฟอร์ม — ไม่รู้จัก = null (ไม่เดา · ไม่แปลงตัวพิมพ์) */
export function platformAdapter(provider: unknown): PlatformAdapter | null {
  return typeof provider === "string" && Object.prototype.hasOwnProperty.call(PLATFORM_ADAPTERS, provider) ? PLATFORM_ADAPTERS[provider as PlatformProvider] : null;
}
