import { tracking } from "@/lib/modules/crm";

// GET /t/s/<siteKey>.js — สคริปต์ติดตามเว็บของร้าน (shark.js · ใบ C2.6 · R-C.7 · ภาพ 16)
//
// 🔴 AUDIT-CLASS X7: siteKey ที่ไม่รู้จัก · ร้านที่ปิดการติดตาม · ร้านที่ยัง uiVersion 1 ได้ **ไฟล์เดียวกันทุกไบต์**
//    (สคริปต์เปล่าที่ยังเป็น JS ใช้ได้) ⇒ ไม่มีใครไล่เดา siteKey ของร้านอื่นจากคำตอบได้
// 🔴 AUDIT-CLASS X8: เนื้อสคริปต์ไม่แตะค่าในฟอร์มของลูกค้าเลย (ไม่มี FormData/ตัวดักพิมพ์) และแบนเนอร์สร้างด้วย
//    textContent (ข้อความของร้านเป็นข้อความ ไม่ใช่ HTML)
// 🔴 ต้องเรียกผ่าน facade `@/lib/modules/crm` เท่านั้น (fitness F2.3)

export const dynamic = "force-dynamic";

const JS_HEADERS: Record<string, string> = {
  "Content-Type": "application/javascript; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "public, max-age=300",
};

const js = (body: string) => new Response(body, { status: 200, headers: new Headers(JS_HEADERS) });

export async function GET(_req: Request, { params }: { params: Promise<{ script: string }> }): Promise<Response> {
  try {
    const { script } = await params;
    const seg = String(script ?? "");
    const key = seg.replace(/\.js$/i, "");
    if (!key || key === seg) return js(tracking.NOOP_TRACKER);
    const site = await tracking.resolveSite(key);
    if (!site) return js(tracking.NOOP_TRACKER);
    return js(tracking.trackerScript(site, tracking.trackerOrigin()));
  } catch {
    return js(tracking.NOOP_TRACKER);
  }
}
