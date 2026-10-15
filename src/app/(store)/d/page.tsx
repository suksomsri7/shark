// /d — จอลูกค้า (จอที่ 2 · POS P2.10 · ภาพ 11 แผง A · มติ 1 2 7)
//
// 🔴 หน้าสาธารณะ: ไม่อ่าน session · noindex · force-dynamic · สิทธิ์ = คุกกี้ pos_display (token ของจอ · httpOnly · Path=/d)
//    ไม่มีคุกกี้/คุกกี้ใช้ไม่ได้ = ฟอร์มใส่รหัสจับคู่ (?c=<รหัส> เติมให้จาก QR ของหน้าตั้งค่าเครื่อง)
// 🔴 แท็บเล็ตเก่า (Chrome < 111 / iPadOS < 16.4 · Tailwind v4 ใช้ @layer + color-mix) = หน้าแจ้งอัปเดตเบราว์เซอร์แบบ HTML ล้วน
//    ผ่านกฎ @supports ที่ไม่อยู่ใน layer (มติ 7) — ข้อความมาจาก pos.display.screen ทั้งสองภาษา
// 🔴 ไม่มีวันที่/เวลา/ตัวเลขตาม locale ของเครื่องในผล SSR (HF-418) — เงิน/แต้มจัดรูปด้วย displayBaht/displayGroup ของ display-shared

import type { Metadata } from "next";
import { cookies } from "next/headers";
import thPos from "@/messages/th/pos.json";
import enPos from "@/messages/en/pos.json";
import { DisplayScreen, type DisplayInitial } from "@/components/pos/display/DisplayScreen";
import { readCustomerDisplay } from "@/lib/modules/pos/display";
import { DISPLAY_COOKIE, normalizePairCode, type DisplayLocale } from "@/lib/modules/pos/display-shared";
import { pairDisplayAction, readDisplayAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: thPos.display.screen.title, robots: { index: false, follow: false } };

const OLD_BROWSER_CSS =
  "#pos-display-unsupported{display:none}" +
  "@supports not (color: color-mix(in srgb, red, red)){#pos-display-unsupported{display:block}#pos-display-app{display:none}}";
const NOTICE_STYLE = { padding: "48px 32px", fontFamily: "sans-serif", textAlign: "center", color: "#0a0a0a", background: "#ffffff" } as const;

export default async function CustomerDisplayPage({ searchParams }: { searchParams: Promise<{ c?: string; lang?: string }> }) {
  const { c, lang } = await searchParams;
  const jar = await cookies();
  const fallbackLocale: DisplayLocale = lang === "en" || (lang !== "th" && jar.get("lang")?.value === "en") ? "en" : "th";
  const token = jar.get(DISPLAY_COOKIE)?.value;
  let initial: DisplayInitial | null = null;
  let pairedOffline = false; // POS P2.10 ▸ fix1 F7 ◂
  if (token) {
    const r = await readCustomerDisplay({ token }).catch(() => null);
    if (r && r.ok && r.changed) initial = { ver: r.ver, view: r.view, nextPollMs: r.nextPollMs };
    // POS P2.10 ▸ fix1 F7 (มติ fix1 ข้อ 7): อ่านล้ม (INTERNAL/โยน) ทั้งที่มีคุกกี้ = จับคู่อยู่แต่ออฟไลน์ → เริ่มโพล · DISPLAY_NOT_PAIRED เท่านั้นที่กลับฟอร์ม
    else if (!(r && !r.ok && r.code === "DISPLAY_NOT_PAIRED")) pairedOffline = true; // ◂
  }
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: OLD_BROWSER_CSS }} />
      <div id="pos-display-unsupported" data-testid="pos-display-unsupported" style={NOTICE_STYLE}>
        <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>{thPos.display.screen.unsupportedTitle}</h1>
        <p style={{ fontSize: 18, margin: "0 0 32px" }}>{thPos.display.screen.unsupportedBody}</p>
        <h2 style={{ fontSize: 22, margin: "0 0 8px" }}>{enPos.display.screen.unsupportedTitle}</h2>
        <p style={{ fontSize: 16, margin: 0 }}>{enPos.display.screen.unsupportedBody}</p>
      </div>
      <DisplayScreen
        initial={initial}
        pairedOffline={pairedOffline} // POS P2.10 ▸ fix1 F7 ◂
        prefillCode={normalizePairCode(c ?? "") ?? ""}
        fallbackLocale={fallbackLocale}
        messages={{ th: thPos.display, en: enPos.display }}
        pairAction={pairDisplayAction}
        readAction={readDisplayAction}
      />
    </>
  );
}
