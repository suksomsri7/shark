// browser.ts — พิมพ์ผ่านหน้าต่างพิมพ์ของระบบ (POS P1.10 U · brief §4): renderReceiptHtml → iframe ซ่อน → contentWindow.print()
// ใช้เมื่อ printerConfig.mode = "browser" และเป็นทางสำรองเมื่อ WebUSB/Web Bluetooth ใช้ไม่ได้ (iOS Safari)
// 🔴 client เท่านั้น · ไม่โยน — เบราว์เซอร์ไม่บอกว่าผู้ใช้กดพิมพ์หรือยกเลิก ⇒ เปิดหน้าต่างพิมพ์ได้ = ok
import { renderReceiptHtml, type ReceiptPayload } from "@/lib/modules/pos/receipt-render";
import { refusePrint, type PrintResult } from "./types";

/** เปิดหน้าต่างพิมพ์ของ HTML ที่ให้มา (iframe ถูกลบหลัง 60 วินาที — ระบบพิมพ์บางตัวอ่านเอกสารช้า) */
export function printHtml(html: string): Promise<PrintResult> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(refusePrint("UNSUPPORTED", "browser"));
    try {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("data-pos-print", "1");
      // แก้รอบ 1 FU-a: ไม่รันสคริปต์ในเอกสารใบเสร็จ · allow-same-origin = หน้าเรียก print() ของกรอบได้ · allow-modals = หน้าต่างพิมพ์เปิดได้
      frame.setAttribute("sandbox", "allow-same-origin allow-modals");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve({ ok: true, via: "browser" });
        } catch {
          resolve(refusePrint("UNSUPPORTED", "browser"));
        } finally {
          setTimeout(() => frame.remove(), 60_000);
        }
      };
      frame.srcdoc = html;
      document.body.appendChild(frame);
    } catch {
      resolve(refusePrint("UNSUPPORTED", "browser"));
    }
  });
}

/** ใบเสร็จผ่านเบราว์เซอร์ */
export function printViaBrowser(payload: ReceiptPayload, paper: "58" | "80", locale: "th" | "en"): Promise<PrintResult> {
  // POS P1.18 ▸ R12: ภาษาที่พิมพ์ = payload.printLocale (ค่าตั้งของระบบ POS) · locale ของจอใช้เฉพาะ payload เก่าที่ไม่มีค่านี้ ◂
  return printHtml(renderReceiptHtml(payload, { paper, locale: payload.printLocale ?? locale }));
}
