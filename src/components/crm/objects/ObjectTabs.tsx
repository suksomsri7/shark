// ObjectTabs.tsx — แท็บวัตถุกำหนดเองในหน้า 360 (ผู้ติดต่อ · บริษัท · ดีล · สมาชิก) — CRM v2 · ใบ C1.9 · พิมพ์เขียว §3.6 · ภาพ 06 ขวา
//
// 🔴 คอมโพเนนต์ฝั่งเซิร์ฟเวอร์ (async) — อ่านผ่านบริการ C1.2b (`objects.tabsFor` / `objects.records.list`) · หน้า GET ไม่เขียนอะไร
// 🔴 AUDIT-CLASS X1: รายการตามการมองเห็นของ "แม่" (C1.7) — บริการเป็นคนตัดสิน · หน้าที่เรียกตัดแม่ที่มองไม่เห็นเป็น 404 ไปแล้ว
// 🔴 ลิงก์แท็บ `?tab=obj-<key>` · แต่ละรายการลิงก์ไป `/crm/objects/<key>/<recordId>` ของระบบ CRM เจ้าของวัตถุ

import Link from "next/link";
import { crmCan, objects } from "@/lib/modules/crm";
import type { MemberActor } from "@/lib/modules/member";
import { formFieldsOf, type ObjectsPageCtx } from "./server";
import { NewRecordToggle } from "@/app/app/sys/[id]/crm/objects/_components/RecordForm";

type ParentType = "CONTACT" | "COMPANY" | "DEAL" | "CUSTOMER";
type TabLite = { objectKey: string; label: string; labelPlural: string; count: number };
type RecordLite = { id: string; title: string; createdAt: Date };

const thaiDate = (d: Date) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });

/**
 * รายการของแม่คนนี้ในวัตถุ 1 ตัว + ปุ่มเพิ่ม (มีคีย์ crm.record.create) — ใช้ในแท็บ `obj-<key>` ของทุกหน้า 360
 * `items` ส่งมาได้ถ้าหน้าอ่านไว้แล้ว (บริษัท 360 — ไม่อ่านซ้ำ)
 */
export async function CrmObjectTabPanel({
  ctx,
  actor,
  objectKey,
  label,
  parentId,
  items,
  total,
}: {
  ctx: ObjectsPageCtx;
  actor: MemberActor;
  objectKey: string;
  label: string;
  parentId: string;
  items?: RecordLite[];
  total?: number;
}) {
  const list = items
    ? { items, total: total ?? items.length }
    : await objects.records.list(ctx, actor, objectKey, { parentId, pageSize: 50 }).catch(() => ({ items: [] as RecordLite[], total: 0 }));
  const canCreate = crmCan(actor, "crm.record.create");
  const formFields = canCreate ? await formFieldsOf(ctx, actor, objectKey).catch(() => null) : null;
  const base = `/app/sys/${ctx.systemId}/crm/objects/${objectKey}`;
  return (
    <section className="card flex flex-col gap-2 p-4" data-testid="crm-object-tab-panel">
      <h2 className="flex flex-wrap items-center gap-2 font-semibold">
        {label}
        <span className="text-xs font-normal text-[color:var(--color-muted)]">{list.total.toLocaleString("th-TH")} รายการ</span>
        <span className="rounded-md border px-1.5 text-xs font-normal text-[color:var(--color-muted)]">วัตถุกำหนดเอง</span>
        <span className="flex-1" />
        <Link href={base} className="text-xs font-normal underline" data-testid="crm-object-tab-all-link">
          ดูทั้งหมด
        </Link>
      </h2>
      {list.items.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการ{label}ที่นี่</p>
      ) : (
        <ul className="flex flex-col divide-y text-sm">
          {list.items.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <Link href={`${base}/${r.id}`} className="min-w-0 break-words font-medium hover:underline" data-testid="crm-object-tab-record-link">
                {r.title}
              </Link>
              <span className="shrink-0 text-xs text-[color:var(--color-muted)]">{thaiDate(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {formFields && <NewRecordToggle systemId={ctx.systemId} objectKey={objectKey} label={label} fields={formFields} parentId={parentId} />}
    </section>
  );
}

/**
 * แถบแท็บวัตถุ + เนื้อหาแท็บที่เลือก สำหรับหน้า 360 ที่ยังไม่มีแท็บของวัตถุเอง (ผู้ติดต่อ · ดีล)
 * `tabs` ส่งมาได้ถ้าบริการของหน้านั้นคำนวณไว้แล้ว (ผู้ติดต่อ 360 มี `objectTabs`) — ไม่ส่ง = ถาม `objects.tabsFor` เอง
 */
export async function CrmObjectTabs({
  ctx,
  actor,
  parentType,
  parentId,
  selfHref,
  tab,
  tabs,
}: {
  ctx: ObjectsPageCtx;
  actor: MemberActor;
  parentType: ParentType;
  parentId: string;
  selfHref: string;
  tab: unknown;
  tabs?: TabLite[];
}) {
  // CRM C1.9 ▸ รีวิว S2: ไม่มีคีย์อ่านรายการ = ไม่มีแท็บวัตถุเลย (ไม่โชว์แท็บจำนวน 0 ที่กดแล้วว่าง) — ทั้งทาง tabsFor และ objectTabs ของบริการผู้ติดต่อ ◂
  if (!crmCan(actor, "crm.record.read")) return null;
  const list: TabLite[] = tabs ?? (await objects.tabsFor(ctx, actor, parentType, parentId).catch(() => []));
  const wanted = typeof tab === "string" && tab.startsWith("obj-") ? tab : null;
  const active = wanted ? list.find((t) => `obj-${t.objectKey}` === wanted) ?? null : null;
  // รีวิว note: `?tab=obj-<key>` ที่ไม่รู้จัก/มองไม่เห็น/ถูกเก็บถาวร = แผงบอกว่าไม่พบ (ไม่ใช่หน้าว่าง)
  const missing = wanted && !active ? <ObjectTabMissing /> : null;
  if (list.length === 0) return missing;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="crm-object-tabs">
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px" aria-label="แท็บวัตถุกำหนดเอง">
        {list.map((t) => (
          <Link
            key={t.objectKey}
            href={`${selfHref}?tab=obj-${t.objectKey}`}
            data-testid={`crm-object-tab-obj-${t.objectKey}`}
            className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm"
            style={active?.objectKey === t.objectKey ? { borderBottom: "2px solid var(--color-accent)", fontWeight: 600 } : { color: "var(--color-muted)" }}
          >
            {t.labelPlural || t.label}
            <span className="text-xs text-[color:var(--color-muted)]">{t.count.toLocaleString("th-TH")}</span>
            <span className="rounded-md border px-1 text-[10px] text-[color:var(--color-muted)]">กำหนดเอง</span>
          </Link>
        ))}
      </nav>
      {active && <CrmObjectTabPanel ctx={ctx} actor={actor} objectKey={active.objectKey} label={active.labelPlural || active.label} parentId={parentId} />}
      {missing}
    </div>
  );
}

/** แผง "ไม่พบรายการนี้" ของแท็บวัตถุที่ไม่รู้จัก (key ผิด · วัตถุถูกเก็บถาวร · มองไม่เห็น) — ข้อความไม่โทษผู้ใช้ */
export function ObjectTabMissing() {
  return (
    <section className="card p-4 text-sm text-[color:var(--color-muted)]" role="status" data-testid="crm-object-tab-missing">
      ไม่พบรายการนี้ — แท็บนี้อาจถูกปิดหรือเก็บถาวรไปแล้ว เลือกแท็บอื่นด้านบน
    </section>
  );
}
