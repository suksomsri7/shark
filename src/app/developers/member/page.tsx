// /developers/member — หน้าคู่มือสาธารณะของ API "ระบบสมาชิก" (M1.11)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": ทุก operation/scope/จำนวนในหน้านี้มาจาก `buildOpenApi(MEMBER_OPS)`
//    ซึ่งเป็นฟังก์ชันตัวเดียวกับที่ route `/api/v1/member/openapi.json` และ
//    `scripts/gen-member-api-docs.mts` เรียก — ไม่มีรายชื่อ endpoint ที่พิมพ์มือในไฟล์นี้เลย
//
// Server component ล้วน · ไม่มี client JS · **ไม่ต้องใช้คีย์** — นักพัฒนา (หรือผู้ช่วย AI)
// ต้องอ่านหน้านี้ได้ก่อนมีคีย์ เพราะหน้านี้ไม่มีข้อมูลของร้านใดเลย
import { Fragment } from "react";
import type { Metadata } from "next";
import { API_SCOPE_BUNDLES } from "@/lib/api-keys/scopes";
import type { ApiOp, ApiOpKind } from "@/lib/api/op";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api/respond";
import { MEMBER_RATE_LIMITS } from "@/lib/modules/member/api/config";
import { buildOpenApi, memberWebhookEvents } from "@/lib/modules/member/api/openapi";
import { MEMBER_OPS } from "@/lib/modules/member/api/registry";
import { webhookEventLabel } from "@/lib/webhooks/labels";

export const metadata: Metadata = {
  title: "SHARK Member API for developers",
  description:
    "REST API ของระบบสมาชิกใน SHARK: สมาชิกและฟิลด์ที่ร้านสร้างเอง ความยินยอม/PDPA ช่องทางที่ผูก ที่มาของลูกค้า ระดับสมาชิก และ webhook",
};

const BASE_URL = "https://shark.in.th/api/v1/member";

const codeBox = "block overflow-x-auto whitespace-pre rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100";
const section = "flex flex-col gap-3 border-t pt-8 first:border-t-0 first:pt-0";
const h2 = "text-xl font-bold";
const h3 = "text-base font-semibold";
const table = "w-full border-collapse text-sm";
const th = "border-b py-1.5 pr-3 text-left font-semibold text-neutral-600";
const td = "border-b border-neutral-100 py-1.5 pr-3 align-top";
const badge = "ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800";

/** คำอธิบายไทยของรหัสข้อผิดพลาด — รายการรหัสเป็นของกลางทั้งแพลตฟอร์ม จึงมีบางรหัสที่โมดูลนี้ไม่มีวันคืน */
const ERROR_CODE_TH: Record<ApiErrorCode, string> = {
  unauthorized: "ไม่ได้แนบคีย์ หรือคีย์ถูกเพิกถอนแล้ว",
  key_expired: "คีย์หมดอายุ — หมุนคีย์ใหม่ที่หน้าสมาชิก › ตั้งค่า › API",
  system_required: "คีย์ไม่ได้ผูกระบบสมาชิก และไม่ได้ส่งส่วนหัว X-Shark-System",
  system_mismatch: "X-Shark-System ไม่ตรงกับระบบที่คีย์ผูกไว้",
  scope_missing: "คีย์ไม่มี scope ที่ operation นี้ต้องการ (ดูชื่อ scope ใน hint)",
  invalid_json: "เนื้อคำขอไม่ใช่ JSON ที่ถูกต้อง",
  validation: "ข้อมูลไม่ผ่านการตรวจ schema — ดูรายละเอียดรายช่องใน details[]",
  idempotency_required: "คำสั่งเขียนที่ไม่ได้แนบส่วนหัว Idempotency-Key",
  idempotency_conflict: "ใช้ Idempotency-Key เดิมกับเนื้อคำขอที่ต่างออกไป",
  idempotency_in_progress: "คำขอที่ใช้คีย์กันซ้ำใบนี้ยังทำงานค้างอยู่",
  confirm_required: "คำสั่งอันตรายที่ไม่ได้ส่ง confirm: true มาด้วย",
  customer_session_required: "เส้นทาง /me เป็นของลูกค้าเอง (เข้าผ่านไลน์/แอป) — คีย์ของร้านใช้ไม่ได้ ไม่มี scope ไหนเปิดให้",
  customer_scope: "token ของลูกค้า (cs_…) เรียก operation ของร้าน — เลนลูกค้าใช้ได้เฉพาะ /me",
  not_found: "ไม่มี operation นี้ หรือสมาชิก/ฟิลด์/ระดับนั้นไม่ได้อยู่ในระบบสมาชิกที่คีย์ผูกไว้",
  method_not_allowed: "path มีอยู่จริง แต่ไม่รองรับ HTTP method นี้ (ดูส่วนหัว Allow)",
  rate_limited: "เรียกถี่เกินเพดานของคีย์ — รอตามส่วนหัว Retry-After",
  period_locked: "ของโมดูลบัญชีเท่านั้น (งวดบัญชีถูกปิด) — API ระบบสมาชิกไม่คืนรหัสนี้",
  state_conflict: "สถานะปัจจุบันทำแบบนั้นไม่ได้ (สมาชิกถูกรวมไปแล้ว · ระดับอยู่ในคลัง · มีคำขอลบค้างอยู่)",
  duplicate: "มีของที่ชนกันอยู่แล้ว (id ช่องทางนี้เป็นของสมาชิกอีกคน · ค่าฟิลด์ที่ตั้ง unique ซ้ำ)",
  forbidden: "กติกาทางธุรกิจปฏิเสธ ไม่ใช่เรื่อง scope (รวมคน/ถอดช่องทาง ต้องเป็นคีย์ชุดผู้ดูแล · ส่งออกต้องมี member.customer.export)",
  unprocessable: "เข้าใจคำขอ แต่ทำตามที่ขอไม่ได้ (เช่น นำเข้าเกินจำนวนแถวที่กำหนด · ตั้งระดับที่สมาชิกอยู่แล้ว)",
  upstream_unavailable: "บริการภายนอกที่ operation นั้นต้องพึ่งพา ยังไม่ได้ตั้งค่าหรือติดต่อไม่ได้",
};

const KIND_LABEL: Record<ApiOpKind, string> = {
  read: "Read — อ่านอย่างเดียว",
  write: "Write — เปลี่ยนข้อมูล",
  danger: "Danger — ย้อนกลับยาก",
};
const KIND_BLURB: Record<ApiOpKind, string> = {
  read: "เรียกเมื่อไหร่ก็ได้ ไม่ต้องมี Idempotency-Key ไม่เขียนอะไรลงฐานข้อมูล",
  write: "เปลี่ยนข้อมูลจริง ต้องมีส่วนหัว Idempotency-Key ทุกครั้ง และทุกครั้งที่สำเร็จจะถูกบันทึกลงประวัติ",
  danger: "ย้อนกลับไม่ได้หรือย้อนยากมาก ต้องมีทั้ง Idempotency-Key, confirm: true และ reason ยาวอย่างน้อย 5 ตัวอักษร",
};

/** ป้ายไทยของกลุ่ม operation (กลุ่มมาจาก prefix ของ id ในทะเบียน เช่น `tiers.rules.set` → `tiers`) */
const DOMAIN_TH: Record<string, string> = {
  core: "ทั่วไป",
  members: "สมาชิก",
  channels: "ทะเบียนช่องทาง",
  fields: "ฟิลด์กำหนดเอง",
  consents: "ความยินยอม",
  privacy: "ความเป็นส่วนตัว / PDPA",
  sources: "ช่องทางที่มา",
  tiers: "ระดับสมาชิก",
  // ── ชุดสอง: ความภักดีและโปรโมชัน (M2.10) ──
  points: "แต้มสะสม",
  stamps: "บัตรสะสมตรา",
  rewards: "ของรางวัล",
  wallet: "กระเป๋าสิทธิ์",
  vouchers: "voucher",
  coupons: "คูปอง",
  giftcards: "บัตรกำนัล",
  me: "ฝั่งลูกค้าเอง",
};

const DOMAIN_ORDER = [
  "core",
  "members",
  "channels",
  "fields",
  "consents",
  "privacy",
  "sources",
  "tiers",
  "points",
  "stamps",
  "rewards",
  "wallet",
  "vouchers",
  "coupons",
  "giftcards",
  "me",
];

/** กลุ่มของ op — id ที่ไม่มีจุด (`ping`) ถือเป็นกลุ่ม `core` */
function domainOf(op: ApiOp): string {
  const head = op.id.split(".")[0] ?? op.id;
  return head === op.id ? "core" : head;
}

function groupByKindThenDomain(ops: readonly ApiOp[]): Map<ApiOpKind, Map<string, ApiOp[]>> {
  const byKind = new Map<ApiOpKind, Map<string, ApiOp[]>>();
  for (const kind of ["read", "write", "danger"] as const) byKind.set(kind, new Map());
  for (const op of ops) {
    const byDomain = byKind.get(op.kind)!;
    const domain = domainOf(op);
    const list = byDomain.get(domain) ?? [];
    list.push(op);
    byDomain.set(domain, list);
  }
  return byKind;
}

function sortDomains(domains: string[]): string[] {
  return [...domains].sort((a, b) => {
    const ia = DOMAIN_ORDER.indexOf(a);
    const ib = DOMAIN_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/** ป้ายไทยสั้น ๆ ของชุดสิทธิ์ (ข้อความเดียวกับที่เจ้าของร้านเห็นในหน้าตั้งค่า) */
const BUNDLE_TH: Record<string, string> = {
  "member-read": "อ่านสมาชิก ระดับ แต้ม โปรโมชัน รีวิว และรายงาน — ไม่เขียนอะไรเลย และไม่เห็นข้อมูลอ่อนไหว",
  "member-operate": "ทำได้ทุกอย่างของชุดอ่าน บวกงานหน้าร้าน: สมัคร/แก้สมาชิก นำเข้า ประทับสแตมป์ ออกโปรโมชัน ปรับแต้ม ตอบรีวิว — ยังไม่เห็นข้อมูลอ่อนไหว",
  "member-admin": "ทุกคีย์ของโมดูล: ตั้งค่า ฟิลด์ ความเป็นส่วนตัว ระดับ ลบข้อมูล และคีย์ API — ชุดเดียวที่เห็นข้อมูลอ่อนไหวได้ตามนโยบายของร้าน",
};

/** ชุดสิทธิ์ของคีย์ → ป้ายที่ `GET /ping` คืนกลับมาเป็น `apiRole` */
const BUNDLE_API_ROLE: Record<string, string> = {
  "member-read": "READONLY",
  "member-operate": "OPERATE",
  "member-admin": "ADMIN",
};

type Recipe = { title: string; scopes: string; opIds: string[]; steps: { comment: string; curl: string }[] };

/** ทุก path/ฟิลด์/scope ในสูตรด้านล่างมีอยู่จริงในทะเบียน (ดู opIds กำกับใต้หัวข้อของแต่ละสูตร) */
const RECIPES: Recipe[] = [
  {
    title: "สมัครสมาชิกจากฟอร์มบนเว็บร้าน",
    scopes: "member-operate",
    opIds: ["fields.layout", "members.create"],
    steps: [
      {
        comment: "อ่านผังฟิลด์ก่อนหนึ่งครั้ง เพื่อรู้ว่าร้านนี้เก็บอะไรบ้าง และ key ของแต่ละช่องคืออะไร",
        curl: `curl -sS "${BASE_URL}/fields/layout" -H "Authorization: Bearer $SHARK_API_KEY"`,
      },
      {
        comment: "สมัคร — เบอร์/อีเมลที่ซ้ำกับสมาชิกเดิมจะได้ created:false พร้อมการ์ดของคนเดิม (ไม่สร้างซ้ำ)",
        curl: `curl -sS -X POST "${BASE_URL}/members" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone":"0812345678","firstName":"สมชาย","lastName":"ใจดี","source":"WEB_FORM",\n       "consents":[{"channel":"LINE","granted":true,"source":"SIGNUP_FORM"}],\n       "fields":{"cert_level":"OPEN_WATER"}}'`,
      },
    ],
  },
  {
    title: "ห้องแชทเข้ามา — นี่คือสมาชิกคนไหน",
    scopes: "member-operate",
    opIds: ["channels.list", "members.resolve", "members.identities.list"],
    steps: [
      {
        comment: "ช่องทางที่ร้านนี้รับ (และต่อไว้จริงหรือยัง) — ใช้ key จากที่นี่เสมอ อย่าฮาร์ดโค้ด",
        curl: `curl -sS "${BASE_URL}/channels" -H "Authorization: Bearer $SHARK_API_KEY"`,
      },
      {
        comment: "จับคู่ตัวตน: เบอร์ → อีเมล → id ช่องทางที่เคยผูก · ไม่เจอ = customerId null (ไม่สร้างใหม่ให้)",
        curl: `curl -sS -X POST "${BASE_URL}/members/resolve" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"channel":"LINE","externalId":"Uxxxxxxxxxxxxxxxx","phone":"0812345678"}'`,
      },
      {
        comment: "ช่องทางที่ผูกกับสมาชิกคนนั้น — externalId ที่คืนกลับมาถูกปิดบังเสมอ",
        curl: `curl -sS "${BASE_URL}/members/cus_123/identities" -H "Authorization: Bearer $SHARK_API_KEY"`,
      },
    ],
  },
  {
    title: "ระดับสมาชิก: ขาดอีกเท่าไร · ลองเปลี่ยนกฎก่อนใช้จริง",
    scopes: "member-read (ทดลองรันกฎต้อง member-admin)",
    opIds: ["tiers.list", "tiers.evaluate", "tiers.rules.dryRun"],
    steps: [
      {
        comment: "บันไดระดับของร้าน + จำนวนคนในแต่ละระดับ",
        curl: `curl -sS "${BASE_URL}/tiers" -H "Authorization: Bearer $SHARK_API_KEY"`,
      },
      {
        comment: "สมาชิกคนนี้อยู่ระดับไหน ขาดอีกเท่าไรถึงระดับถัดไป (หน่วยของ spent12m เป็นสตางค์)",
        curl: `curl -sS "${BASE_URL}/members/cus_123/tier" -H "Authorization: Bearer $SHARK_API_KEY"`,
      },
      {
        comment: "ทดลองรันรอบทบทวนระดับ — ไม่เขียนอะไรเลย บอกแค่ว่าใครจะขึ้น/ลง/เสี่ยงหลุด",
        curl: `curl -sS -X POST "${BASE_URL}/tiers/rules/dry-run" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Content-Type: application/json" -d '{}'`,
      },
    ],
  },
  {
    title: "คนซ้ำ: ดูคู่ เทียบ แล้วค่อยรวม (คำสั่งอันตราย)",
    scopes: "member-admin",
    opIds: ["members.duplicates.list", "members.duplicates.compare", "members.merge"],
    steps: [
      {
        comment: "คู่ที่ระบบสงสัยว่าเป็นคนเดียวกัน พร้อมเหตุผลและคะแนนความมั่นใจ",
        curl: `curl -sS "${BASE_URL}/members/duplicates" -H "Authorization: Bearer $SHARK_API_KEY"`,
      },
      {
        comment: "เทียบสองโปรไฟล์แบบเคียงข้างกัน ก่อนตัดสินใจว่าจะเก็บใบไหน",
        curl: `curl -sS "${BASE_URL}/members/duplicates/pair_123" -H "Authorization: Bearer $SHARK_API_KEY"`,
      },
      {
        comment: "รวมจริง — ย้อนกลับไม่ได้ · ถ้าร้านตั้งสายอนุมัติไว้ จะได้ { pending: true, approvalRequestId } แทน",
        curl: `curl -sS -X POST "${BASE_URL}/members/cus_123/merge" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"mergeId":"cus_456","confirm":true,"reason":"เบอร์และชื่อตรงกัน ลูกค้ายืนยันเองที่หน้าร้าน"}'`,
      },
    ],
  },
];

export default function MemberApiDocsPage() {
  const spec = buildOpenApi(MEMBER_OPS);
  const bundles = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("member-"));
  const byKind = groupByKindThenDomain(MEMBER_OPS);
  const withCsv = MEMBER_OPS.filter((o) => o.csv);
  const withTool = MEMBER_OPS.filter((o) => o.tool);
  const events = memberWebhookEvents();
  const opById = new Map(MEMBER_OPS.map((o) => [o.id, o]));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{spec.info.title}</h1>
        <p className="text-sm text-neutral-600">
          REST API ของ <strong>ระบบสมาชิก</strong> ใน SHARK — สมาชิกและฟิลด์ที่ร้านสร้างเอง · ความยินยอมและ PDPA ·
          ช่องทางที่ผูก · ที่มาของลูกค้า · ระดับสมาชิก · webhook ขาออก
        </p>
        <p className="text-sm text-neutral-600">
          สัญญาเวอร์ชัน {spec.info.version} · {MEMBER_OPS.length} operation · Base URL <code>{BASE_URL}</code> ·
          สัญญาแบบเครื่องอ่าน (ไม่ต้องใช้คีย์){" "}
          <a className="text-emerald-700 underline" href="/api/v1/member/openapi.json">
            /api/v1/member/openapi.json
          </a>{" "}
          · ฉบับข้อความล้วนสำหรับ AI{" "}
          <a className="text-emerald-700 underline" href="/developers/member.md">
            /developers/member.md
          </a>
        </p>
      </header>

      <section className={section}>
        <h2 className={h2}>ข้อมูลในนี้คือข้อมูลส่วนบุคคล</h2>
        <p className="text-sm text-neutral-700">
          ทุก endpoint ในหน้านี้แตะข้อมูลของคนจริง — ชื่อ เบอร์โทร วันเกิด และอะไรก็ตามที่ร้านตัดสินใจเก็บ
          คีย์ผูกกับร้านและระบบสมาชิกเพียงชุดเดียว · การเปิดดูข้อมูลอ่อนไหวถูกบันทึกทุกครั้ง ·
          และร้านต้องตอบลูกค้าได้ว่าใครเห็นอะไรบ้าง <strong>ดึงเฉพาะฟิลด์ที่ต้องใช้</strong> เก็บเท่าที่จำเป็น
          และอย่าส่งต่อให้บริการที่ร้านไม่ได้ระบุไว้
        </p>
        <p className="text-sm text-neutral-700">
          <strong>ข้อมูลอ่อนไหวปิดสำหรับคีย์ชุดอ่านและชุดหน้าร้านเสมอ</strong> (ส่วนที่ร้านทำเครื่องหมายว่าอ่อนไหว
          จะคืนมาเป็น <code>visible: false</code> โดยไม่มีค่าใด ๆ) — ไม่ใช่ scope ที่ติ๊กเพิ่มได้ ต้องเป็นคีย์ชุด
          ผู้ดูแล และยังต้องผ่านนโยบายของร้านอีกชั้น
        </p>
      </section>

      <section className={section}>
        <h2 className={h2}>เริ่มต้น</h2>
        <p className="text-sm text-neutral-700">
          สร้างคีย์ที่หน้า <strong>สมาชิก › ตั้งค่า › API</strong> (คีย์ดิบแสดงครั้งเดียว) แล้วยิง{" "}
          <code>GET /ping</code> หนึ่งครั้งเพื่อรู้ว่าคีย์ใช้ได้ไหม ผูกระบบไหน และเป็นชุดสิทธิ์อะไร
        </p>
        <pre className={codeBox}>
          <code>{`curl -sS "${BASE_URL}/ping" \\\n  -H "Authorization: Bearer $SHARK_API_KEY"`}</code>
        </pre>
        <pre className={codeBox}>
          <code>{JSON.stringify({ data: { ok: true, systemId: "sys_123", keyName: "เว็บร้าน", apiRole: "OPERATE", scopes: ["member.customer.read"] }, requestId: "req_0a1b" }, null, 2)}</code>
        </pre>
      </section>

      <section className={section}>
        <h2 className={h2}>ชุดสิทธิ์ (scope bundles)</h2>
        <p className="text-sm text-neutral-700">
          scope ของคีย์คือ <strong>permission key ชุดเดียวกับที่คนในร้านใช้</strong> — คีย์จึงทำได้ไม่เกินสิ่งที่คนทำได้
          เลือกเป็นชุดสำเร็จรูปได้ 3 ชุด ซ้อนกันเป็นชั้น: read ⊂ operate ⊂ admin
        </p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>ชุด</th>
              <th className={th}>ทำอะไรได้</th>
              <th className={th}>apiRole</th>
              <th className={th}>เห็นข้อมูลอ่อนไหว</th>
            </tr>
          </thead>
          <tbody>
            {bundles.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <code>{b.id}</code>
                  <div className="text-xs text-neutral-500">{b.label}</div>
                </td>
                <td className={td}>{BUNDLE_TH[b.id] ?? b.summary}</td>
                <td className={td}>
                  <code>{BUNDLE_API_ROLE[b.id] ?? "-"}</code>
                </td>
                <td className={td}>{b.id === "member-admin" ? "ได้ ตามนโยบายของร้าน" : "ไม่เห็นเลย"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-neutral-700">
          คีย์ <strong>เห็นสมาชิกทุกคนของระบบที่ผูกไว้</strong> ข้ามสาขา (เจ้าของร้านเป็นคนออกคีย์และเลือกชุดสิทธิ์เอง) ·
          สมาชิกของร้านอื่นหรือของระบบสมาชิกอื่นตอบ 404 เสมอ ไม่ใช่ 403 · เรียก operation ที่คีย์ไม่มี scope จะได้ 403{" "}
          <code>scope_missing</code> พร้อมชื่อ scope ที่ขาดใน <code>hint</code>
        </p>
      </section>

      <section className={section}>
        <h2 className={h2}>กติกาที่ใช้กับทุก endpoint</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-700">
          <li>
            <strong>ฟิลด์ที่ร้านสร้างเองเดินทางใน <code>fields</code></strong> ทั้งขาส่งและขารับ (คีย์ของฟิลด์มาจาก{" "}
            <code>GET /fields/layout</code>) · ค่าที่ไม่ตรงชนิดของฟิลด์จะได้ 422 <code>validation</code> พร้อมชื่อ
            ฟิลด์ใน <code>details[]</code>
          </li>
          <li>
            <strong>ช่องทางเป็นทะเบียน ไม่ใช่ enum ตายตัว</strong> — อ่าน <code>GET /channels</code> เพื่อรู้ key
            ที่ใช้ได้ และรู้ว่าร้านต่อช่องทางนั้นไว้จริงหรือยัง (<code>connected</code>)
          </li>
          <li>
            <strong>เบอร์โทรคืนมาแบบปิดบัง</strong> (<code>phoneMasked</code>) ในทุกการ์ดย่อและทุกแถวของรายการ ·{" "}
            <code>externalId</code> ของช่องทางที่ผูกไว้ก็ปิดบังเสมอ
          </li>
          <li>
            <strong>
              <code>Idempotency-Key</code>
            </strong>{" "}
            บังคับกับทุกคำสั่งเขียน (POST, PATCH, PUT, DELETE) ใช้ค่าไม่ซ้ำต่อ 1 ความตั้งใจ · ยิงซ้ำด้วยคีย์เดิม
            และเนื้อเดิมจะได้คำตอบเดิมกลับมา (<code>Idempotent-Replayed: true</code>) · เนื้อต่างจะได้ 409{" "}
            <code>idempotency_conflict</code>
          </li>
          <li>
            <strong>คำสั่งอันตราย (danger)</strong> ต้องส่ง <code>confirm: true</code> (ค่าตรรกะจริง ไม่ใช่ข้อความ)
            และ <code>reason</code> ยาวอย่างน้อย 5 ตัวอักษร ซึ่งจะถูกเก็บลงประวัติ (audit log)
          </li>
          <li>
            <strong>บางคำสั่งตอบว่า &quot;รออนุมัติ&quot;</strong> — <code>{"{ applied: false, pending: true, approvalRequestId }"}</code>{" "}
            พร้อมสถานะ 200 แปลว่ายัง <strong>ไม่ได้ทำ</strong> ต้องมีคนในร้านอนุมัติก่อน อย่ายิงซ้ำและอย่ารายงานว่าสำเร็จ
          </li>
          <li>
            <strong>เงินเป็นสตางค์</strong> (<code>*Satang</code>) · แต้มเป็นจำนวนเต็ม · วันเวลาเป็น ISO-8601 UTC
          </li>
          <li>
            <strong>ซองคำตอบ.</strong> สำเร็จ = <code>{"{ data, page?, requestId }"}</code> · ล้มเหลว ={" "}
            <code>{"{ error: { code, message_th, message_en, hint?, details? }, requestId }"}</code> ·{" "}
            <code>requestId</code> อยู่ในส่วนหัว <code>X-Request-Id</code> ด้วย ยกไปแปะตอนแจ้งปัญหาได้เลย
          </li>
          <li>
            <strong>เพดานการเรียก</strong> แยกตามชนิดต่อคีย์: อ่าน {MEMBER_RATE_LIMITS.read.limit} ครั้ง/นาที · เขียน{" "}
            {MEMBER_RATE_LIMITS.write.limit} ครั้ง/นาที · รายงาน {MEMBER_RATE_LIMITS.report.limit} ครั้ง/นาที ·
            เกินได้ 429 พร้อม <code>Retry-After</code> · คำตอบที่สำเร็จมี <code>X-RateLimit-Limit</code> และ{" "}
            <code>X-RateLimit-Remaining</code>
          </li>
          <li>
            <strong>CSV.</strong> {withCsv.length} operation ที่มีป้าย <span className={badge}>CSV</span>{" "}
            ในตารางด้านล่างรองรับ <code>Accept: text/csv</code> — ได้ไฟล์ <code>text/csv; charset=utf-8</code>{" "}
            พร้อม BOM แทนซอง JSON (ทุกช่องกัน CSV injection แล้ว)
          </li>
          <li>
            <strong>
              <code>/me</code> ไม่ใช่ของคีย์
            </strong>{" "}
            — เส้นทางนั้นเป็นของลูกค้าที่ล็อกอินผ่านไลน์/แอป คีย์ของร้านจะได้ 401{" "}
            <code>customer_session_required</code> ให้ใช้ <code>/members/{"{id}"}</code> แทน · ฝั่งลูกค้าส่ง
            token ของตัวเอง (ขึ้นต้น <code>cs_</code>) มาที่ <code>Authorization: Bearer</code> เหมือนกัน
            และเรียกได้เฉพาะ <code>/me/*</code> เท่านั้น — เส้นทางอื่นได้ 403 <code>customer_scope</code>
          </li>
        </ul>
      </section>

      <section className={section}>
        <h2 className={h2}>รหัสข้อผิดพลาด</h2>
        <p className="text-sm text-neutral-700">
          แตกเงื่อนไขจาก <code>error.code</code> เสมอ อย่าอ่านจากข้อความ (ข้อความเปลี่ยนได้ รหัสไม่เปลี่ยน) ·
          รายการรหัสนี้ใช้ร่วมกันทั้งแพลตฟอร์ม จึงมีบางรหัสที่มาจากโมดูลอื่นเท่านั้นและกำกับไว้แล้ว
        </p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Code</th>
              <th className={th}>หมายความว่า</th>
            </tr>
          </thead>
          <tbody>
            {API_ERROR_CODES.map((code) => (
              <tr key={code}>
                <td className={td}>
                  <code>{code}</code>
                </td>
                <td className={td}>{ERROR_CODE_TH[code]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={section}>
        <h2 className={h2}>รายการ operation ทั้งหมด ({MEMBER_OPS.length})</h2>
        {(["read", "write", "danger"] as const).map((kind) => {
          const byDomain = byKind.get(kind)!;
          const count = [...byDomain.values()].reduce((n, list) => n + list.length, 0);
          if (count === 0) return null;
          return (
            <div key={kind} className="flex flex-col gap-2">
              <h3 className={h3}>
                {KIND_LABEL[kind]} ({count})
              </h3>
              <p className="text-sm text-neutral-600">{KIND_BLURB[kind]}</p>
              {sortDomains([...byDomain.keys()]).map((domain) => (
                <Fragment key={domain}>
                  <div className="pt-1 text-sm font-medium text-neutral-700">{DOMAIN_TH[domain] ?? domain}</div>
                  <table className={table}>
                    <thead>
                      <tr>
                        <th className={th}>Operation</th>
                        <th className={th}>Method + path</th>
                        <th className={th}>Scope</th>
                        <th className={th}>ทำอะไร</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDomain
                        .get(domain)!
                        .map((op) => (
                          <tr key={op.id}>
                            <td className={td}>
                              <code>{op.id}</code>
                              {op.csv ? <span className={badge}>CSV</span> : null}
                              {op.tool ? <span className={badge}>AI</span> : null}
                            </td>
                            <td className={`${td} font-mono text-xs`}>
                              {op.method} {op.path}
                            </td>
                            <td className={`${td} font-mono text-xs`}>{op.action}</td>
                            <td className={td}>
                              <div>{op.label}</div>
                              <div className="text-xs text-neutral-500">{op.summary}</div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Fragment>
              ))}
            </div>
          );
        })}
      </section>

      <section className={section}>
        <h2 className={h2}>สูตรใช้งานจริง</h2>
        {RECIPES.map((r) => (
          <div key={r.title} className="flex flex-col gap-2">
            <h3 className={h3}>{r.title}</h3>
            <p className="text-xs text-neutral-500">
              ชุดสิทธิ์ที่ต้องมี: <code>{r.scopes}</code> · operation:{" "}
              {r.opIds.map((id) => (
                <code key={id} className="mr-1">
                  {opById.get(id)?.id ?? id}
                </code>
              ))}
            </p>
            {r.steps.map((s) => (
              <div key={s.curl} className="flex flex-col gap-1">
                <p className="text-sm text-neutral-700">{s.comment}</p>
                <pre className={codeBox}>
                  <code>{s.curl}</code>
                </pre>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className={section}>
        <h2 className={h2}>ผู้ช่วย AI และ agent ภายนอก ({withTool.length} เครื่องมือ)</h2>
        <p className="text-sm text-neutral-700">
          operation ที่มีป้าย <span className={badge}>AI</span> ถูกเปิดเป็นเครื่องมือของสกิล <code>members</code>{" "}
          ด้วย — เครื่องมือที่อ่านอย่างเดียวทำงานทันที ส่วนเครื่องมือที่เขียนจะ{" "}
          <strong>ไม่ลงมือเอง</strong> แต่สร้าง &quot;ข้อเสนอ&quot; ให้เจ้าของร้านกดยืนยันก่อน แล้วจึงรัน
          operation ตัวเดียวกันนี้ด้วยสิทธิ์ของคนที่กด (คำสั่งอันตรายต้องยืนยันสองชั้น)
        </p>
        <p className="text-sm text-neutral-700">
          ผู้ช่วยอ่านข้อมูลสมาชิกในฐานะพนักงานที่ไม่มีตำแหน่งพิเศษ ⇒ <strong>ไม่เห็นข้อมูลอ่อนไหว</strong>{" "}
          ไม่ว่าคีย์ที่เปิดบทสนทนาจะถือชุดสิทธิ์ใด · รายละเอียดทั้งหมด (manifest · การเรียก tool · ตัวอย่างคำตอบ)
          อยู่ในคู่มือฉบับเต็มที่{" "}
          <a className="text-emerald-700 underline" href="/developers/member.md">
            /developers/member.md
          </a>{" "}
          หัวข้อ <em>AI agents</em>
        </p>
      </section>

      <section className={section}>
        <h2 className={h2}>Webhook ขาออก ({events.length} เหตุการณ์)</h2>
        <p className="text-sm text-neutral-700">
          ร้านสมัครปลายทางได้ที่ <strong>ตั้งค่า › แอปภายนอก / API</strong> · ทุกครั้งที่ส่งจะเป็น{" "}
          <code>POST</code> พร้อมส่วนหัว <code>X-Shark-Event</code> · เนื้อ{" "}
          <code>{"{ type, payload, sentAt }"}</code> · และ <code>X-Shark-Signature</code> ={" "}
          HMAC-SHA256 ของเนื้อคำขอดิบด้วยความลับของปลายทาง (hex ตัวพิมพ์เล็ก) · ส่งอย่างน้อยหนึ่งครั้ง (retry 5 ครั้ง)
          ⇒ ตัวรับต้องทนการส่งซ้ำ
        </p>
        <p className="text-sm text-neutral-700">
          <strong>payload ไม่มีข้อมูลส่วนบุคคล</strong> — มีแต่ id และป้ายสั้น ๆ ที่จำเป็นต่อการตัดสินใจ
          อ่านรายละเอียดกลับด้วย operation ด้านบน ซึ่งจะกรองตามนโยบายความเป็นส่วนตัวของร้านให้เอง
        </p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Event</th>
              <th className={th}>ยิงเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e}>
                <td className={td}>
                  <code>{e}</code>
                </td>
                <td className={td}>{webhookEventLabel(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
