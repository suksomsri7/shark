"use client";

// PrintFrame.tsx — POS P2.12U ▸ มติ 1: เกาะ client ของหน้าพิมพ์รายงาน ◂
//   เอกสาร (HTML ทั้งหน้าจาก posReportPrintAction) อยู่ใน iframe srcdoc กว้าง A4 (แนวนอน 297 มม. เมื่อเอกสารสั่ง landscape) · สูงตามเนื้อ
//   โหลดเสร็จ → ยืมฟอนต์ของแอป (กฎ @font-face ของหน้าแม่ + ตระกูลฟอนต์ของ body) → รอ document.fonts.ready ของ iframe → print() ของ iframe ครั้งเดียว
//   (พิมพ์เฉพาะเอกสาร A4 ไม่ใช่หน้าแอป) · ปุ่ม "พิมพ์ / PDF" สั่งซ้ำได้ · autoPrint=false (?noprint=1) = ไม่สั่งเอง (ภาพ QC)
// 🔴 iframe sandbox: allow-same-origin (อ่านความสูง/ใส่ฟอนต์) + allow-modals (print) — สคริปต์ในเอกสารไม่ทำงาน (เอกสารไม่มี <script> อยู่แล้ว)

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Props = { html: string; wide: boolean; autoPrint: boolean; toolbar: ReactNode; printLabel: string; frameTitle: string };
/** ความสูงเริ่มของ A4 ที่ 96 dpi (ก่อนวัดเนื้อจริง) */
const A4_PX = { portrait: 1123, landscape: 794 };

// POS P2.12U ▸ fix1 F7: url() ในกฎ @font-face ของ Next เป็นทางสัมพัทธ์ของไฟล์ CSS (../media/*.woff2) — เอกสาร srcdoc ใช้ฐานของหน้าแม่
//   (/app/sys/…/pos/reports/print) ⇒ ฟอนต์ 404 · แปลงเป็น URL เต็มด้วย href ของสไตล์ชีต (สไตล์ในหน้า = baseURI ของหน้าแม่) ◂
const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
function absoluteUrls(css: string, base: string): string {
  return css.replace(URL_RE, (m, _q: string, u: string) => {
    if (/^(data:|blob:|[a-z][a-z0-9+.-]*:\/\/)/i.test(u)) return m;
    try {
      return `url("${new URL(u, base).href}")`;
    } catch {
      return m;
    }
  });
}

/** ใส่กฎ @font-face ของหน้าแม่ + ตระกูลฟอนต์ของ body ลงเอกสารใน iframe (ครั้งเดียว) — ฟอนต์ไทยของแอปถูกโหลดผ่าน next/font ในหน้าแม่เท่านั้น */
function adoptFonts(doc: Document) {
  if (doc.documentElement.hasAttribute("data-fonts")) return;
  doc.documentElement.setAttribute("data-fonts", "1");
  const faces: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // สไตล์ข้ามโดเมนอ่านกฎไม่ได้ — ข้าม
    }
    const base = sheet.href ?? document.baseURI; // POS P2.12U ▸ fix1 F7 ◂
    for (const r of Array.from(rules)) if (r instanceof CSSFontFaceRule) faces.push(absoluteUrls(r.cssText, base));
  }
  const family = getComputedStyle(document.body).fontFamily;
  const style = doc.createElement("style");
  style.textContent = `${faces.join("\n")}\nhtml { background: #fff; }\nbody { font-family: ${family}; }`; // กระดาษขาวเสมอ (จอธีมมืดก็ตาม)
  doc.head.appendChild(style);
}

export function PrintFrame({ html, wide, autoPrint, toolbar, printLabel, frameTitle }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const printed = useRef(false);
  const [height, setHeight] = useState(wide ? A4_PX.landscape : A4_PX.portrait);
  const [ready, setReady] = useState(false);

  /** เตรียมเอกสาร: ฟอนต์ + วัดความสูง · คืนหน้าต่างของ iframe (ยังไม่พร้อม = null) */
  const prepare = useCallback(async (): Promise<Window | null> => {
    const f = ref.current;
    const doc = f?.contentDocument;
    const win = f?.contentWindow;
    if (!f || !doc || !win || !doc.body) return null;
    adoptFonts(doc);
    const loads: Promise<unknown>[] = [];
    doc.fonts.forEach((face) => void loads.push(face.load().catch(() => null)));
    await Promise.all(loads);
    await doc.fonts.ready.catch(() => undefined);
    setHeight(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, wide ? A4_PX.landscape : A4_PX.portrait));
    setReady(true);
    return win;
  }, [wide]);

  const doPrint = useCallback(async () => {
    const win = await prepare();
    if (!win) return;
    win.focus();
    win.print();
  }, [prepare]);

  const onLoad = useCallback(() => {
    void prepare().then((win) => {
      if (!win || !autoPrint || printed.current) return;
      printed.current = true;
      win.focus();
      win.print();
    });
  }, [prepare, autoPrint]);

  // srcdoc อาจโหลดเสร็จก่อน React ผูก onLoad (หน้า SSR) — ตรวจเองหนึ่งครั้งหลัง mount
  useEffect(() => {
    const doc = ref.current?.contentDocument;
    if (doc && doc.readyState === "complete" && doc.body && doc.body.childElementCount > 0) onLoad();
  }, [onLoad]);

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-3 print:hidden" data-testid="pos-report-print-toolbar">
        {toolbar}
        <button type="button" data-testid="pos-report-print-again" className="btn btn-primary min-h-[44px] text-sm" disabled={!ready} onClick={() => void doPrint()}>
          {printLabel}
        </button>
      </div>
      <div className="w-full min-w-0 overflow-x-auto rounded-xl border bg-[color:var(--color-surface-2)] p-3 print:overflow-visible print:border-0 print:bg-transparent print:p-0">
        <iframe
          ref={ref}
          title={frameTitle}
          srcDoc={html}
          sandbox="allow-same-origin allow-modals"
          onLoad={onLoad}
          data-testid="pos-report-print-frame"
          className="mx-auto block border-0 shadow-sm"
          style={{ width: wide ? "297mm" : "210mm", height }}
        />
      </div>
    </>
  );
}
