import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { fields, toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import * as objects from "@/lib/modules/crm/objects";
import { OBJECT_PARENT_LABEL, ObjectsError } from "@/lib/modules/crm/objects-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { ModuleTabs } from "@/components/module-tabs";
import { CrmActivityBlock } from "@/components/crm/activity/CrmActivityBlock";
import { CrmFilesBlock } from "@/components/crm/files/CrmFilesBlock";
import { ArchiveRecordButton, EditRecordToggle } from "../../_components/RecordForm";
import { displayValue } from "@/components/crm/objects/types";
import { customerLinks, formFieldsOf, sensitivePresence } from "@/components/crm/objects/server";

// รายการเดี่ยวของวัตถุกำหนดเอง (CRM v2 · ใบ C1.9 · พิมพ์เขียว §3.6) — `/app/sys/{id}/crm/objects/{key}/{recordId}`
// เลย์เอาต์: ชื่อรายการ · ทุกส่วน (ป้ายฟิลด์ + ค่า — ค่าอ่อนไหวถูกบริการตัดทิ้งถ้าผู้ดูไม่มีสิทธิ์ D8) · ไทม์ไลน์ (`timelineFor`) ·
//   ไฟล์แนบ (บล็อกของ C1.6 · entityType RECORD) · โน้ต/กิจกรรม (บล็อกของ C1.6 · target customRecordId)
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM v2 · ไม่มีคีย์ crm.record.read · วัตถุ/รายการของระบบอื่น/ร้านอื่น ·
//    วัตถุที่เก็บถาวร · รายการที่แม่มองไม่เห็น (C1.7) = notFound() — ไม่ใช่หน้าพัง · หน้า GET ไม่เขียน

const PARENT_PATH: Record<string, string> = { CONTACT: "contacts", COMPANY: "companies", DEAL: "deals" };
const thaiDateTime = (d: Date) => new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export default async function ObjectRecordPage({ params }: { params: Promise<{ id: string; key: string; recordId: string }> }) {
  const { id, key, recordId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  // AUDIT-CLASS X2: ต้องมีคีย์ crm.record.read
  if (!crmCan(actor, "crm.record.read")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  // Next ถอดรหัส [key] ให้แล้ว — ไม่ decode ซ้ำ (ค่า % ที่ผิดรูปจะทำหน้าพัง)
  const objectKey = String(key ?? "");
  const nf = (e: unknown) => {
    if (e instanceof ObjectsError && e.code === "NOT_FOUND") return null;
    throw e;
  };
  // AUDIT-CLASS X1: วัตถุของระบบนี้ (เก็บถาวร = 404) → รายการของวัตถุนี้ที่ผู้ดูมองเห็น (ตามแม่ · C1.7) — ไม่พบ/มองไม่เห็น = 404
  const obj = await objects.get(ctx, actor, objectKey).catch(nf);
  if (!obj || obj.archivedAt) notFound();
  const rec = await objects.records.get(ctx, actor, obj.key, String(recordId ?? "")).catch(nf);
  if (!rec) notFound();

  const [layout, timeline, formFields] = await Promise.all([
    fields.listLayout({ ...ctx, objectKey: obj.key, actor }, {}),
    objects.timelineFor(ctx, actor, rec.id).catch(() => ({ items: [] })),
    // CRM C1.9 ▸ รีวิว B1: สิทธิ์ดูค่าอ่อนไหว "ต่อผู้ดู" (คำตัดสิน D8 เดียวกับ engine) — ไม่ใช่ดูจากค่าที่หายไป ◂
    formFieldsOf(ctx, actor, obj.key, rec.id),
  ]);
  const accessOf = new Map(formFields.map((f) => [f.key, f]));
  const present = await sensitivePresence(tenantId, [rec.id], formFields.filter((f) => f.hidden).map((f) => f.fieldId));
  const custHref = rec.parentType === "CUSTOMER" && rec.parentId ? (await customerLinks(tenantId, actor, [rec.parentId])).get(rec.parentId) ?? null : null;
  const sections = layout.sections
    .map((s) => ({ ...s, fields: s.fields.filter((f) => !f.isSystem && !f.archivedAt) }))
    .filter((s) => s.fields.length > 0);
  const live = !rec.archivedAt;
  const canEdit = live && crmCan(actor, "crm.record.update");
  const canArchive = live && crmCan(actor, "crm.record.delete");
  const listHref = `/app/sys/${id}/crm/objects/${obj.key}`;
  const parentHref = rec.parentId && PARENT_PATH[rec.parentType] ? `/app/sys/${id}/crm/${PARENT_PATH[rec.parentType]}/${rec.parentId}` : custHref;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="object-record-page">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={listHref} className="shrink-0 px-1 text-lg text-[color:var(--color-muted)]" aria-label={`กลับไปรายการ${obj.label}`} data-testid="object-record-back-link">
            ‹
          </Link>
          <h1 className="min-w-0 break-words text-lg font-semibold sm:text-xl">
            {obj.label} — {rec.title}
          </h1>
        </div>
      </div>
      <ModuleTabs items={crmNavItems(id)} />
      {!live && (
        <div className="card p-3 text-sm text-[color:var(--color-muted)]" data-testid="object-record-archived-banner">
          รายการนี้ถูกเก็บถาวรแล้ว — ดูข้อมูลย้อนหลังได้ แต่แก้ไขไม่ได้
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="card flex flex-col gap-2 p-4" data-testid="object-record-header">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="break-words text-lg font-semibold">{rec.title}</span>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {obj.label} · ผูกกับ{OBJECT_PARENT_LABEL[rec.parentType]}
                  {parentHref && (
                    <>
                      {" · "}
                      <Link href={parentHref} className="underline" data-testid="object-record-parent-link">
                        เปิด{OBJECT_PARENT_LABEL[rec.parentType]}
                      </Link>
                    </>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {canArchive && <ArchiveRecordButton systemId={id} objectKey={obj.key} recordId={rec.id} listHref={listHref} />}
              </div>
            </div>
            {canEdit && <EditRecordToggle systemId={id} objectKey={obj.key} recordId={rec.id} fields={formFields} initial={rec.values} />}
          </section>

          {sections.length === 0 ? (
            <section className="card p-4 text-sm text-[color:var(--color-muted)]" data-testid="object-record-fields-empty">
              วัตถุนี้ยังไม่มีฟิลด์ — เพิ่มฟิลด์ได้ที่หน้าตั้งค่าวัตถุ
            </section>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {sections.map((s) => (
                <section key={s.id} className="card flex flex-col gap-2 p-4" data-testid="object-record-section">
                  <h2 className="flex items-center gap-2 font-semibold">
                    {s.label}
                    {s.sensitive && <span className="rounded-md border px-1 text-[10px] font-normal text-[color:var(--color-danger)]">อ่อนไหว</span>}
                  </h2>
                  <dl className="flex flex-col divide-y text-sm">
                    {s.fields.map((f) => {
                      // รีวิว B1: ไม่มีสิทธิ์ + มีค่าอยู่จริง = "ซ่อน" · ไม่มีค่า = "—" (ค่าว่างไม่ใช่การซ่อน)
                      const hidden = accessOf.get(f.key)?.hidden === true && present.has(`${rec.id}:${f.id}`);
                      return (
                        <div key={f.key} className="grid grid-cols-[minmax(110px,40%)_1fr] gap-2 py-2">
                          <dt className="text-[color:var(--color-muted)]">{f.label}</dt>
                          <dd className="min-w-0 break-words">{hidden ? <span className="text-[color:var(--color-muted)]">ซ่อน (ข้อมูลอ่อนไหว)</span> : displayValue(rec.values[f.key], f.options.choices ?? [], f.type)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              ))}
            </div>
          )}

          <section className="card flex flex-col gap-1 p-4" data-testid="object-record-timeline">
            <h2 className="font-semibold">ไทม์ไลน์</h2>
            {timeline.items.length === 0 ? (
              <p className="py-2 text-sm text-[color:var(--color-muted)]">ยังไม่มีความเคลื่อนไหว</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {timeline.items.map((t, i) => (
                  <li key={`${t.kind}-${i}`} className="flex flex-col py-2 text-sm">
                    <span className="break-words">{t.summary}</span>
                    <span className="text-xs text-[color:var(--color-muted)]">{thaiDateTime(t.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {/* โน้ต/กิจกรรมของรายการนี้ (บล็อกของใบ C1.6) */}
          <CrmActivityBlock ctx={ctx} actor={actor} target={{ customRecordId: rec.id }} />
        </div>

        <aside className="flex w-full min-w-0 flex-col gap-4 lg:w-[320px] lg:shrink-0">
          {/* ไฟล์แนบ (บล็อกของใบ C1.6 · ไฟล์ส่วนตัว C0.4) */}
          <CrmFilesBlock ctx={ctx} actor={actor} entityType="RECORD" entityId={rec.id} />
        </aside>
      </div>
    </div>
  );
}
