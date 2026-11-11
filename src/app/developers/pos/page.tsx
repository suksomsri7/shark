// /developers/pos — หน้าคู่มือสาธารณะของ API "ระบบขายหน้าร้าน" (ใบ P2.13 · brief §4 · มติ 8)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": ทุก operation/scope/จำนวนในหน้านี้มาจาก `buildOpenApi(POS_OPS)` — ฟังก์ชันตัวเดียวกับ
//    `/api/v1/pos/openapi.json` และ `scripts/gen-pos-api-docs.mts` (ไม่มีรายชื่อ endpoint ที่พิมพ์มือในไฟล์นี้)
// Server component ล้วน · ไม่มี client JS · **ไม่ต้องใช้คีย์** และไม่มีข้อมูลของร้านใดเลย
// 🔴 สีจาก token ของระบบเท่านั้น (UI_STANDARD · HF-418) · ปุ่ม/ลิงก์ ≥ 44px
import type { Metadata } from "next";
import { API_SCOPE_BUNDLES, POS_FILTER_UNIT_PREFIX } from "@/lib/api-keys/scopes";
import type { ApiOp, ApiOpKind } from "@/lib/api/op";
import { API_RATE_LIMITS } from "@/lib/api/require";
import { buildOpenApi, posWebhookEvents } from "@/lib/modules/pos/api/openapi";
import { POS_OPS } from "@/lib/modules/pos/api/registry";

export const metadata: Metadata = {
  title: "SHARK POS API for developers",
  description: "REST API ของระบบขายหน้าร้าน (POS) ใน SHARK: ขาย คืนเงิน ยกเลิกบิล ออเดอร์ออนไลน์ สินค้า ช่องทางขาย กะ และรายงาน",
};

const BASE_URL = "https://shark.in.th/api/v1/pos";

const sectionCls = "flex flex-col gap-3 border-t border-[color:var(--color-line)] pt-8 first:border-t-0 first:pt-0";
const h2 = "text-xl font-bold";
const tableCls = "w-full border-collapse text-sm";
const th = "border-b border-[color:var(--color-line)] py-1.5 pr-3 text-left font-semibold text-[color:var(--color-muted)]";
const td = "border-b border-[color:var(--color-line)] py-1.5 pr-3 align-top";
const codeCls = "rounded bg-[color:var(--color-surface-2)] px-1 py-0.5 font-mono text-[12px]";
const linkCls = "inline-flex min-h-11 items-center font-semibold text-[color:var(--color-accent)] underline underline-offset-2";

const KIND_LABEL: Record<ApiOpKind, string> = { read: "Read — อ่านอย่างเดียว", write: "Write — เปลี่ยนข้อมูล", danger: "Danger — ย้อนกลับยาก" };
const KIND_BLURB: Record<ApiOpKind, string> = {
  read: "เรียกเมื่อไหร่ก็ได้ ไม่ต้องมี Idempotency-Key ไม่เขียนอะไรลงฐานข้อมูล (POST /sales/quote ก็เป็นการอ่าน)",
  write: "เปลี่ยนข้อมูลจริง ต้องมีส่วนหัว Idempotency-Key ทุกครั้ง และทุกครั้งที่สำเร็จจะถูกบันทึกลงประวัติพร้อมชื่อคีย์",
  danger: "ย้อนกลับยาก ต้องมี Idempotency-Key, confirm: true และ reason ยาวอย่างน้อย 5 ตัวอักษร — ผู้ช่วย AI ต้องถามเจ้าของร้านก่อนเสมอ",
};
const GROUP_TH: Record<string, string> = {
  units: "สาขา",
  sales: "บิลขาย · คืนเงิน · ใบกำกับภาษี",
  shifts: "กะ",
  devices: "เครื่องขาย",
  products: "สินค้า",
  channels: "ช่องทางขาย",
  orders: "ออเดอร์",
  reports: "รายงาน",
};
const GROUP_ORDER = Object.keys(GROUP_TH);
const groupOf = (op: ApiOp) => op.path.split("/")[1] ?? "";

function opsOf(kind: ApiOpKind): ApiOp[] {
  return POS_OPS.filter((o) => o.kind === kind).sort((a, b) => GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b)) || (a.path + a.method).localeCompare(b.path + b.method));
}

export default function PosDevelopersPage() {
  const spec = buildOpenApi(POS_OPS);
  const bundles = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("pos-"));
  const opCount = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  return (
    <main data-testid="developers-pos" className="mx-auto flex w-full max-w-5xl flex-col gap-8 bg-[color:var(--color-surface)] px-4 py-10 text-[color:var(--color-ink)]">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{spec.info.title}</h1>
        <p className="text-sm text-[color:var(--color-ink-soft)]">
          REST API ของระบบขายหน้าร้าน: ขายด้วยราคาเดียวกับหน้าขาย ตัดสต็อก ลงบัญชี ออกใบเสร็จ · คืนเงิน/ยกเลิกบิล · รับออเดอร์จากแอปหรือแพลตฟอร์ม · จัดการสินค้า ราคา
          และของหมด · อ่านกะและรายงานทุกชนิด — {opCount} operation · ฐาน <code className={codeCls}>{BASE_URL}</code>
        </p>
        <div className="flex flex-wrap gap-x-6">
          <a data-testid="developers-pos-md" className={linkCls} href="/developers/pos.md">
            คู่มือฉบับเต็ม (Markdown · อังกฤษ)
          </a>
          <a data-testid="developers-pos-openapi" className={linkCls} href="/api/v1/pos/openapi.json">
            OpenAPI 3.1 (openapi.json)
          </a>
        </div>
      </header>

      <section className={sectionCls}>
        <h2 className={h2}>การยืนยันตัวตนและสิทธิ์</h2>
        <p className="text-sm text-[color:var(--color-ink-soft)]">
          แนบ <code className={codeCls}>Authorization: Bearer &lt;API key&gt;</code> ทุกคำขอ · เจ้าของร้านออกคีย์ได้ที่ หน้าขาย › ตั้งค่า › การเชื่อมต่อระบบ SHARK › คีย์ API (เห็นคีย์ครั้งเดียวตอนสร้าง) ·
          คีย์ผูกระบบขายหน้าร้านหนึ่งระบบ และทำงานในนามของตัวเอง (บิลที่ขายผ่าน API ผูกกับคีย์ ไม่ใช่คนที่ออกคีย์) · จำกัดสาขาได้ด้วย{" "}
          <code className={codeCls}>{POS_FILTER_UNIT_PREFIX}&lt;unitId&gt;</code>
        </p>
        <div className="max-w-full overflow-x-auto" /* POS P2.14 ▸ UI-6: ตารางกว้างเลื่อนแนวนอนในกล่อง (390 ไม่ล้นจอ) ◂ */>
<table className={tableCls}>
          <thead>
            <tr>
              <th className={th}>ชุดสิทธิ์</th>
              <th className={th}>ทำอะไรได้</th>
              <th className={th}>scope</th>
            </tr>
          </thead>
          <tbody>
            {bundles.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <code className={codeCls}>{b.id}</code>
                  <div className="text-[12px] text-[color:var(--color-muted)]">{b.label}</div>
                </td>
                <td className={td}>{b.summary}</td>
                <td className={`${td} font-mono text-[12px]`}>{b.scopes.join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      </section>

      <section className={sectionCls}>
        <h2 className={h2}>กติกาที่ใช้กับทุก operation</h2>
        <ul className="list-disc pl-5 text-sm leading-relaxed text-[color:var(--color-ink-soft)]">
          <li>เงินเป็นจำนวนเต็มหน่วยสตางค์ทุกช่องที่ลงท้าย Satang (1 บาท = 100 สตางค์)</li>
          <li>สาขาส่งเป็น unitId (query ของ GET · body ของคำสั่งอื่น) — สาขาของระบบอื่น/ร้านอื่นตอบ 404 เสมอ</li>
          <li>ขาย: POST /sales/quote ก่อน แล้ว POST /sales พร้อม expectedGrandTotalSatang — ราคาเปลี่ยนระหว่างนั้น = 409 ไม่มีบิลเกิด</li>
          <li>คำสั่งเขียนทุกตัวต้องมี Idempotency-Key — ส่งซ้ำด้วยคีย์เดิม = ได้ผลเดิม ไม่เกิดบิลซ้ำ</li>
          <li>
            เพดานต่อคีย์ต่อนาที: อ่าน {API_RATE_LIMITS.read.limit} · เขียน {API_RATE_LIMITS.write.limit} · รายงาน {API_RATE_LIMITS.report.limit} · รายงานส่งออก CSV ได้ด้วย Accept: text/csv
          </li>
          <li>ผิดพลาดเป็นซอง error.code (แยกทางด้วยรหัส) + message_th ที่แสดงให้เจ้าของร้านได้ทันที</li>
        </ul>
      </section>

      {(["read", "write", "danger"] as const).map((kind) => (
        <section key={kind} className={sectionCls}>
          <h2 className={h2}>{KIND_LABEL[kind]}</h2>
          <p className="text-sm text-[color:var(--color-ink-soft)]">{KIND_BLURB[kind]}</p>
          <div className="max-w-full overflow-x-auto" /* POS P2.14 ▸ UI-6: ตารางกว้างเลื่อนแนวนอนในกล่อง (390 ไม่ล้นจอ) ◂ */>
<table className={tableCls}>
            <thead>
              <tr>
                <th className={th}>กลุ่ม</th>
                <th className={th}>method + path</th>
                <th className={th}>ทำอะไร</th>
                <th className={th}>scope</th>
              </tr>
            </thead>
            <tbody>
              {opsOf(kind).map((op) => (
                <tr key={op.id}>
                  <td className={td}>{GROUP_TH[groupOf(op)] ?? groupOf(op)}</td>
                  <td className={`${td} whitespace-nowrap font-mono text-[12px]`}>
                    {op.method} {op.path}
                  </td>
                  <td className={td}>
                    {op.label}
                    <div className="text-[12px] text-[color:var(--color-muted)]">{op.summary}</div>
                  </td>
                  <td className={`${td} font-mono text-[12px]`}>{op.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
</div>
        </section>
      ))}

      <section className={sectionCls}>
        <h2 className={h2}>Webhooks (SHARK เรียกหาคุณ)</h2>
        <p className="text-sm text-[color:var(--color-ink-soft)]">
          เจ้าของร้านเพิ่ม URL ปลายทางได้ที่ ตั้งค่าร้าน › การเชื่อมต่อ › แอปภายนอก/API · ทุกครั้งลงลายเซ็น X-Shark-Signature (HMAC-SHA256) · ส่งอย่างน้อยหนึ่งครั้ง ตัวรับต้องกันซ้ำเอง
        </p>
        <p className="font-mono text-[12px] leading-relaxed">{posWebhookEvents().join(" · ")}</p>
      </section>
    </main>
  );
}
