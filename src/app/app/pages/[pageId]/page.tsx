import Link from "next/link";
import { publicOrigin } from "@/lib/core/origin";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { env } from "@/lib/env";
import {
  availableWidgets,
  getPage,
  tenantMembers,
} from "@/lib/pages/service";
import { widgetDef } from "@/lib/pages/registry";
import {
  addPageMemberAction,
  addWidgetAction,
  deletePageAction,
  removePageMemberAction,
  removeWidgetAction,
  renamePageMemberAction,
  reorderWidgetsAction,
  updatePageAction,
  updateWidgetAction,
  uploadWidgetImageAction,
} from "@/lib/pages/actions";
import WidgetBoard from "@/lib/pages/WidgetBoard";
import PagePinField from "@/lib/pages/PagePinField";
import ImageEditor from "@/lib/modules/inventory/ImageEditor";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { SubmitButton } from "@/components/ui/SubmitButton";

const SHAPE_LABEL: Record<string, string> = { RECT: "ผืนผ้า", SQUARE: "จัตุรัส", CIRCLE: "วงกลม" };

// Builder ของ Page 1 หน้า — widget (เพิ่ม/ทรง/ชื่อ/รูป/ลำดับ) + พนักงานที่เข้าได้ (PIN)
export default async function PageBuilderPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const page = await getPage({ tenantId }, pageId);
  if (!page) notFound();
  const [unit, avail, members] = await Promise.all([
    prisma.businessUnit.findFirst({ where: { id: page.unitId, tenantId }, select: { name: true } }),
    availableWidgets({ tenantId }, pageId),
    tenantMembers({ tenantId }),
  ]);
  const muted = "text-[color:var(--color-muted)]";
  const usedKeys = new Set(page.widgets.map((w) => w.widgetKey));
  const publicUrl = `${await publicOrigin()}/p/${page.slug}`;
  const boardWidgets = page.widgets.map((w) => {
    const def = widgetDef(w.widgetKey);
    return {
      id: w.id,
      title: w.title?.trim() || def?.label || w.widgetKey,
      icon: def?.icon ?? "•",
      imageUrl: w.imageUrl,
      shape: w.shape,
    };
  });
  const inPageMemberIds = new Set(page.members.map((m) => m.membershipId));

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader
        title={`🧩 ${page.name}`}
        desc={`Page ของ ${unit?.name ?? "กิจการ"} — จัด widget + กำหนดพนักงานที่เข้าได้`}
        back={{ href: "/app/pages", label: "Page ทั้งหมด" }}
      />

      {/* ลิงก์สาธารณะ — เอาไปเปิดบนแท็บเล็ต/ใส่ LINE LIFF */}
      <Section title="ลิงก์ของ Page นี้">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg border px-3 py-2 text-sm">{publicUrl}</code>
            <Link href={`/p/${page.slug}`} target="_blank" className="btn btn-ghost min-h-[40px] text-sm">
              เปิดดู ↗
            </Link>
          </div>
          <p className={`text-xs ${muted}`}>
            ใช้ลิงก์นี้ใน LINE LIFF ได้เลย (พนักงานเปิดแล้วใส่ PIN ของตัวเอง) · ผูกโดเมนของร้านเอง = เฟสถัดไป
          </p>
        </div>
      </Section>

      {/* ตั้งค่า Page */}
      <Section title="ตั้งค่า Page">
        <form action={updatePageAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="pageId" value={page.id} />
          <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
            ชื่อ Page
            <input name="name" required defaultValue={page.name} className="input min-w-0" />
          </label>
          <label className="flex items-center gap-1.5 self-end pb-2 text-xs">
            <input type="checkbox" name="active" defaultChecked={page.active} />
            เปิดใช้งาน
          </label>
          <SubmitButton variant="ghost">บันทึก</SubmitButton>
        </form>
        <div className="mt-2 border-t pt-2">
          <ConfirmDialog
            triggerLabel="ลบ Page นี้"
            triggerClassName="btn-sm min-h-[40px] text-[color:var(--color-danger)]"
            title={`ลบ ${page.name}?`}
            detail="ลบเฉพาะหน้า Page และการจัดวาง widget — ข้อมูลในระบบต่าง ๆ ไม่หายไปไหน"
            confirmLabel="ยืนยันลบ"
            danger
            action={deletePageAction}
            fields={{ pageId: page.id }}
          />
        </div>
      </Section>

      {/* กระดาน widget */}
      <Section title={`Widget บนหน้า (${page.widgets.length})`}>
        <WidgetBoard pageId={page.id} widgets={boardWidgets} reorderAction={reorderWidgetsAction} />

        {/* แก้ไขรายตัว: ชื่อ/ทรง/รูป/เอาออก */}
        {page.widgets.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t pt-3">
            <div className="text-sm font-medium">แก้ไข widget รายตัว</div>
            {page.widgets.map((w) => {
              const def = widgetDef(w.widgetKey);
              const title = w.title?.trim() || def?.label || w.widgetKey;
              return (
                <details key={w.id} className="rounded-lg border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    {def?.icon ?? "•"} {title}
                    <span className={`ml-2 text-xs font-normal ${muted}`}>
                      {SHAPE_LABEL[w.shape]}
                      {w.imageUrl ? " · มีรูป" : ""}
                    </span>
                  </summary>
                  <form action={updateWidgetAction} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="widgetId" value={w.id} />
                    <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
                      ชื่อที่แสดง
                      <input name="title" defaultValue={w.title ?? ""} placeholder={def?.label} className="input min-w-0" />
                    </label>
                    <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                      ทรง
                      <select name="shape" defaultValue={w.shape} className="input">
                        <option value="SQUARE">จัตุรัส</option>
                        <option value="RECT">ผืนผ้า</option>
                        <option value="CIRCLE">วงกลม</option>
                      </select>
                    </label>
                    <SubmitButton variant="ghost">บันทึก</SubmitButton>
                  </form>
                  {/* เปลี่ยนรูป — ใช้ตัวแก้รูปเดียวกับสินค้า/บริการ (ครอป/สี/ข้อความ) */}
                  <div className="mt-2 border-t pt-2">
                    <ImageEditor
                      action={uploadWidgetImageAction.bind(null, page.id, w.id)}
                      itemName={title}
                    />
                    {w.imageUrl && (
                      <form action={updateWidgetAction} className="mt-1">
                        <input type="hidden" name="pageId" value={page.id} />
                        <input type="hidden" name="widgetId" value={w.id} />
                        <input type="hidden" name="imageUrl" value="" />
                        <button className={`text-xs underline ${muted}`}>เอารูปออก (กลับไปใช้ไอคอน)</button>
                      </form>
                    )}
                  </div>
                  <form action={removeWidgetAction} className="mt-2 border-t pt-2">
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="widgetId" value={w.id} />
                    <button className="text-xs text-[color:var(--color-danger)] underline">เอา widget นี้ออก</button>
                  </form>
                </details>
              );
            })}
          </div>
        )}

        {/* เพิ่ม widget จากเมนูของกิจการนี้ */}
        <div className="mt-3 flex flex-col gap-2 border-t pt-3">
          <div className="text-sm font-medium">เพิ่ม widget (เมนูของกิจการนี้)</div>
          <div className="flex flex-wrap gap-2">
            {avail
              .filter((d) => !usedKeys.has(d.key))
              .map((d) => (
                <form key={d.key} action={addWidgetAction}>
                  <input type="hidden" name="pageId" value={page.id} />
                  <input type="hidden" name="widgetKey" value={d.key} />
                  <button className="btn-sm min-h-[40px] rounded-full border px-3">
                    + {d.icon} {d.label}
                  </button>
                </form>
              ))}
            {avail.filter((d) => !usedKeys.has(d.key)).length === 0 && (
              <p className={`text-xs ${muted}`}>เพิ่มครบทุกเมนูแล้ว</p>
            )}
          </div>
        </div>
      </Section>

      {/* พนักงานที่เข้า Page นี้ได้ */}
      <Section title={`พนักงานที่เข้าได้ (${page.members.length})`}>
        <p className={`mb-2 text-xs ${muted}`}>
          พนักงานเปิดลิงก์ Page → เลือกชื่อ → ใส่ PIN ของตัวเอง · ยังไม่ตั้ง PIN = ยังเข้าไม่ได้ ·
          สิทธิ์เพิ่ม/ลบ/แก้ในแต่ละเมนูเป็นไปตามบทบาท (role) ของคนนั้นตามเดิม
        </p>
        <div className="flex flex-col gap-2">
          {page.members.map((m) => (
            <details key={m.id} className="rounded-lg border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                {m.displayName}
                <span className={`ml-2 text-xs font-normal ${muted}`}>
                  {m.pinHash ? "ตั้ง PIN แล้ว" : "ยังไม่มี PIN (เข้าไม่ได้)"}
                </span>
              </summary>
              <form action={renamePageMemberAction} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="pageId" value={page.id} />
                <input type="hidden" name="pageMemberId" value={m.id} />
                <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
                  ชื่อบนจอ login
                  <input name="displayName" required defaultValue={m.displayName} className="input min-w-0" />
                </label>
                <SubmitButton variant="ghost">บันทึกชื่อ</SubmitButton>
              </form>
              <div className="mt-2 border-t pt-2">
                <PagePinField pageId={page.id} pageMemberId={m.id} hasPin={!!m.pinHash} />
              </div>
              <form action={removePageMemberAction} className="mt-2 border-t pt-2">
                <input type="hidden" name="pageId" value={page.id} />
                <input type="hidden" name="pageMemberId" value={m.id} />
                <button className="text-xs text-[color:var(--color-danger)] underline">เอาออกจาก Page นี้</button>
              </form>
            </details>
          ))}
        </div>
        <form action={addPageMemberAction} className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          <input type="hidden" name="pageId" value={page.id} />
          <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
            เพิ่มพนักงาน (จากทีมงานที่มีบัญชีในร้าน)
            <select name="membershipId" required className="input" defaultValue="">
              <option value="" disabled>
                เลือกพนักงาน…
              </option>
              {members
                .filter((m) => !inPageMemberIds.has(m.membershipId))
                .map((m) => (
                  <option key={m.membershipId} value={m.membershipId}>
                    {m.label} ({m.role})
                  </option>
                ))}
            </select>
          </label>
          <SubmitButton>+ เพิ่ม</SubmitButton>
        </form>
        <p className={`mt-1 text-xs ${muted}`}>
          ยังไม่มีบัญชี? เชิญเข้าทีมที่ ตั้งค่า → ทีมงาน ก่อน แล้วค่อยเพิ่มเข้า Page
        </p>
      </Section>
    </div>
  );
}
