import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { listTypes, listCounters, listDisplays } from "@/lib/modules/queue/service";
import {
  addTypeAction,
  removeTypeAction,
  addCounterAction,
  removeCounterAction,
  setCounterTypesAction,
  createDisplayAction,
  revokeDisplayAction,
} from "@/lib/modules/queue/actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export const dynamic = "force-dynamic";

export default async function QueueSetupPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "QUEUE") notFound();
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const tenantSlug = auth.active.tenant.slug;

  const [types, counters, displays] = await Promise.all([
    listTypes(ctx),
    listCounters(ctx),
    listDisplays(ctx),
  ]);
  const activeTypes = types.filter((t) => t.status === "ACTIVE");

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">ตั้งค่าบัตรคิว</h1>
        </div>
        <Link href={`/app/u/${unitSlug}/queue`} className="btn btn-ghost text-sm">
          ← แดชบอร์ดคิว
        </Link>
      </div>

      {/* ประเภทคิว */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">ประเภทคิว</h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          ตัวอักษรนำหน้า (prefix) ใช้เป็นเลขคิว เช่น A001 · priority มาก = ถูกเรียกก่อน
        </p>
        {activeTypes.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีประเภทคิว เพิ่มด้านล่าง</p>
        )}
        {activeTypes.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="text-sm">
              <span className="font-medium">{t.name}</span>
              <span className="text-[color:var(--color-muted)]">
                {" "}
                · {t.prefix} · priority {t.priority}
                {t.onlineIssuable ? " · ออนไลน์" : ""}
              </span>
            </div>
            {!t.isSystem && (
              <form action={removeTypeAction.bind(null, unitSlug)}>
                <input type="hidden" name="id" value={t.id} />
                <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
              </form>
            )}
          </div>
        ))}
        <form
          action={addTypeAction.bind(null, unitSlug)}
          className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        >
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className="text-xs text-[color:var(--color-muted)]">ชื่อประเภท</span>
            <input name="name" required placeholder="เช่น คิวทั่วไป" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">อักษร</span>
            <input name="prefix" required maxLength={3} placeholder="A" className="w-full rounded-lg border px-2 py-2 text-sm sm:w-16" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">priority</span>
            <input name="priority" type="number" defaultValue={0} min={0} className="w-full rounded-lg border px-2 py-2 text-sm sm:w-20" />
          </label>
          <label className="col-span-2 flex items-center gap-1.5 text-xs text-[color:var(--color-muted)] sm:col-span-1">
            <input name="onlineIssuable" type="checkbox" /> รับออนไลน์
          </label>
          <button className="btn btn-primary col-span-2 text-sm sm:col-span-1">เพิ่ม</button>
        </form>
      </section>

      {/* เคาน์เตอร์ */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">เคาน์เตอร์ / จุดบริการ</h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          เลือกประเภทที่เคาน์เตอร์รับ (ไม่เลือกเลย = รับทุกประเภท)
        </p>
        {counters.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีเคาน์เตอร์ เพิ่มด้านล่าง</p>
        )}
        {counters
          .filter((c) => c.status !== "ARCHIVED")
          .map((c) => {
            const accepted = new Set(c.types.map((x) => x.typeId));
            return (
              <div key={c.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {c.name} <span className="text-xs text-[color:var(--color-muted)]">({c.code})</span>
                  </div>
                  <form action={removeCounterAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
                  </form>
                </div>
                {activeTypes.length > 0 && (
                  <form action={setCounterTypesAction.bind(null, unitSlug)} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="counterId" value={c.id} />
                    {activeTypes.map((t) => (
                      <label key={t.id} className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="typeId" value={t.id} defaultChecked={accepted.has(t.id)} />
                        {t.prefix}
                      </label>
                    ))}
                    <button className="rounded-lg border px-2 py-1 text-xs">บันทึก</button>
                  </form>
                )}
              </div>
            );
          })}
        <form action={addCounterAction.bind(null, unitSlug)} className="flex gap-2">
          <input name="name" required placeholder="ชื่อช่อง เช่น ช่อง 1" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
          <input name="code" required placeholder="รหัส เช่น 1" className="w-24 rounded-lg border px-2 py-2 text-sm" />
          <button className="btn btn-primary text-sm">เพิ่ม</button>
        </form>
      </section>

      {/* จอแสดงคิว (TV) */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">จอแสดงคิว (TV)</h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          เปิดลิงก์บน Smart TV/แท็บเล็ตหน้าร้าน ไม่ต้องล็อกอิน
        </p>
        {displays.map((d) => (
          <div key={d.id} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{d.name}</span>
              <ConfirmDialog
                triggerLabel="ยกเลิกลิงก์"
                triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                title="ยกเลิกลิงก์จอนี้?"
                detail="ลิงก์จอเดิมจะใช้ไม่ได้ทันที ต้องสร้างจอใหม่หากต้องการใช้อีก"
                confirmLabel="ยืนยันยกเลิกลิงก์"
                danger
                action={revokeDisplayAction.bind(null, unitSlug)}
                fields={{ id: d.id }}
              />
            </div>
            <code className="break-all rounded bg-[color:var(--color-surface-2)] px-2 py-1 text-xs">
              /s/{tenantSlug}/{unit.slug}/queue/display/{d.displayToken}
            </code>
            <Link
              href={`/s/${tenantSlug}/${unit.slug}/queue/display/${d.displayToken}`}
              target="_blank"
              className="text-xs underline"
            >
              เปิดจอ →
            </Link>
          </div>
        ))}
        <form action={createDisplayAction.bind(null, unitSlug)} className="flex gap-2">
          <input name="name" required placeholder="ชื่อจอ เช่น จอหน้าร้าน" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
          <button className="btn btn-primary text-sm">สร้างจอ</button>
        </form>
      </section>
    </div>
  );
}
