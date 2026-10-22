// kds-print.ts — POS P2.6U พิมพ์ใบครัวจากจอครัว (มติ 6 · Q8): ใบละสถานีจาก kitchenSlipPayloadAction → ตัวเรนเดอร์บริสุทธิ์ → ทางพิมพ์เดียวกับใบเสร็จ P1.10
//   printerConfig.mode = browser → renderKitchenSlipHtml → printHtml (print/browser.ts · หน้าต่างพิมพ์ของระบบ · หลายใบ = เอกสารเดียวคั่นหน้า)
//   escpos-usb / escpos-bt → renderKitchenSlipEscPos (รูปไบต์เดียวกับ encodeEscPos ของใบเสร็จ · ช่อง raster วาดด้วย canvas เดียวกัน) →
//     ข้อมูลจับคู่ของ "รหัสเครื่องนี้" (pairing.ts) → writeUsb / writeBluetooth (ทางเดียวกับ printReceipt.send) · ไม่จับคู่ = NO_DEVICE
//   🔴 client เท่านั้น · ไม่โยน · ไม่มีเงินในใบ (ข้อมูลจากเซิร์ฟเวอร์ไม่มีคีย์เงิน) · LAN = P3.11 (ไม่มีที่นี่)
import type { KitchenSlip } from "@/lib/modules/pos/kds-shared";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { renderKitchenSlipEscPos, renderKitchenSlipHtml } from "@/lib/modules/pos/kitchen-slip-render";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { printHtml } from "@/components/pos/print/browser";
import { pairingMatches, readPairing } from "@/components/pos/print/pairing";
import { writeUsb } from "@/components/pos/print/usb";
import { writeBluetooth } from "@/components/pos/print/bluetooth";
import { spliceRaster } from "@/components/pos/print/raster";
import { CanvasUnavailableError, rasterizeSlot } from "@/components/pos/print/canvas-raster";
import { transportOf, transportSupported } from "@/components/pos/print/printReceipt";
import { refusePrint, type PrintResult } from "@/components/pos/print/types";
import { sendLan, type LanCtx } from "@/components/pos/print/lan"; // POS P3-SKEL U ▸ CD-SKELU-9 ◂

/** ค่าพิมพ์ปริยายเมื่อเครื่องนี้ไม่ได้ลงทะเบียน (เบราว์เซอร์ · 80 มม.) */
export const KDS_PRINT_FALLBACK: Pick<PosPrinterConfig, "mode" | "paper" | "thaiText"> = { mode: "browser", paper: "80", thaiText: "raster" };

/** รวมใบ HTML หลายใบเป็นเอกสารเดียว (หัวเอกสาร/สไตล์ของใบแรก · คั่นหน้าระหว่างใบ) */
export function joinSlipHtml(docs: readonly string[]): string {
  if (docs.length <= 1) return docs[0] ?? "";
  const bodyOf = (d: string) => {
    const a = d.indexOf("<body>");
    const b = d.lastIndexOf("</body>");
    return a >= 0 && b > a ? d.slice(a + 6, b) : d;
  };
  const first = docs[0]!;
  const head = first.slice(0, first.indexOf("<body>") + 6);
  return `${head}${docs.map(bodyOf).join('<div style="page-break-after:always"></div>')}</body></html>`;
}

/** พิมพ์ใบครัวชุดหนึ่งที่เครื่องนี้ (ไม่โยน) */
export async function printKitchenSlips(slips: readonly KitchenSlip[], cfg: Pick<PosPrinterConfig, "mode" | "paper" | "thaiText"> | null, locale: "th" | "en", lan?: LanCtx /* POS P3-SKEL U ▸ CD-SKELU-9: สาขาของงาน (โหมด escpos-lan) ◂ */): Promise<PrintResult> {
  const c = cfg ?? KDS_PRINT_FALLBACK;
  const via = transportOf(c.mode);
  try {
    if (!slips.length) return { ok: true, via };
    if (via === "browser") return await printHtml(joinSlipHtml(slips.map((s) => renderKitchenSlipHtml(s, { paper: c.paper, locale: s.printLocale ?? locale }))));
    if (!transportSupported(c.mode)) return refusePrint("UNSUPPORTED", via);
    // POS P3-SKEL U ▸ CD-SKELU-9: escpos-lan = ไบต์ชุดเดียวกับ USB/BT ต่อใบ → คิวตัวช่วยพิมพ์ (target kitchen) · ไม่ต้องจับคู่ในเบราว์เซอร์ ◂
    if (via === "lan") {
      const chunks: Uint8Array[] = [];
      for (const s of slips) {
        try {
          const r = renderKitchenSlipEscPos(s, { paper: c.paper, thaiText: c.thaiText === "tis620" ? "tis620" : "raster", cut: true, locale: s.printLocale ?? locale });
          chunks.push(c.thaiText !== "tis620" && r.rasterSlots.length ? spliceRaster(r.bytes, r.rasterSlots, r.rasterSlots.map((x) => rasterizeSlot(x))) : r.bytes);
        } catch (e) {
          return refusePrint(e instanceof CanvasUnavailableError ? "UNSUPPORTED" : "WRITE_FAILED", via);
        }
      }
      return await sendLan(chunks, "kitchen", lan, getPosDeviceId());
    }
    const p = readPairing(getPosDeviceId());
    if (!p || !pairingMatches(p, c.mode)) return refusePrint("NO_DEVICE", via);
    for (const s of slips) {
      let bytes: Uint8Array;
      try {
        const r = renderKitchenSlipEscPos(s, { paper: c.paper, thaiText: c.thaiText === "tis620" ? "tis620" : "raster", cut: true, locale: s.printLocale ?? locale });
        bytes = c.thaiText !== "tis620" && r.rasterSlots.length ? spliceRaster(r.bytes, r.rasterSlots, r.rasterSlots.map((x) => rasterizeSlot(x))) : r.bytes;
      } catch (e) {
        return refusePrint(e instanceof CanvasUnavailableError ? "UNSUPPORTED" : "WRITE_FAILED", via);
      }
      const w = p.transport === "usb" ? await writeUsb(p, bytes) : await writeBluetooth(p, bytes);
      if (!w.ok) return w;
    }
    return { ok: true, via };
  } catch {
    return refusePrint("WRITE_FAILED", via);
  }
}
