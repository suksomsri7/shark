import { requireTenant } from "@/lib/core/context";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatThaiDateTime } from "@/lib/ui/date";
import {
  ensureDefaultLocation,
  listItems,
  listLocations,
  lowStock,
  recentMovements,
  stockByLocationMap,
  type Ctx,
} from "./service";
import {
  consumeAction,
  createItemAction,
  createLocationAction,
  receiveAction,
  transferAction,
} from "./actions";
import { listPos, listSuppliers } from "./procurement";
import {
  cancelPoAction,
  createPoAction,
  createSupplierAction,
  markOrderedAction,
  receivePoAction,
} from "./procurement-actions";

const muted = "text-[color:var(--color-muted)]";

// สถานะใบสั่งซื้อ (ไทย) + โทนสี
const PO_STATUS: Record<string, string> = {
  DRAFT: "ร่าง",
  ORDERED: "สั่งซื้อแล้ว",
  RECEIVED: "รับของแล้ว",
  CANCELLED: "ยกเลิก",
};
const poTone = (s: string): "muted" | "strong" | "danger" =>
  s === "CANCELLED" ? "danger" : s === "RECEIVED" || s === "ORDERED" ? "strong" : "muted";

// จำนวนแถวสินค้าในฟอร์มสร้าง PO (แถวว่างถูกกรองทิ้งฝั่ง action)
const PO_LINE_ROWS = 6;

// ป้ายชนิดความเคลื่อนไหว (ไทย) — รับเข้า=ดำ, ตัดออก/ปรับ=เทา
const MOVE_LABEL: Record<string, string> = {
  IN: "รับเข้า",
  OUT: "ตัดออก",
  ADJUST: "ปรับปรุง",
  TRANSFER: "โอนย้าย",
};

// ───────────── InventoryContent (ฝังในหน้า /app/sys/[id]) ─────────────
export async function InventoryContent({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  // มีคลังหลักเสมอ (get-or-create) ก่อนโหลดรายการคลัง
  await ensureDefaultLocation(ctx);
  const [items, low, movements, suppliers, pos, locations, stockMap] = await Promise.all([
    listItems(ctx),
    lowStock(ctx),
    recentMovements(ctx),
    listSuppliers(ctx),
    listPos(ctx),
    listLocations(ctx),
    stockByLocationMap(ctx),
  ]);

  const lowIds = new Set(low.map((i) => i.id));
  const multiWarehouse = locations.length > 1; // มีมากกว่าคลังหลัก → แสดงตัวเลือกคลัง/โอนย้าย
  const qty = (v: number, unit: string) => `${v.toLocaleString("th-TH")} ${unit}`;

  return (
    <div className="flex flex-col gap-6">
      {/* สินค้าใกล้หมด / หมด */}
      <Section title={`ใกล้หมด / ต้องสั่งเพิ่ม (${low.length})`}>
        <DataList
          items={low.map((i) => ({
            key: i.id,
            primary: i.name,
            secondary: `รหัส ${i.sku} · จุดสั่งซื้อ ${qty(i.reorderPoint, i.unitLabel)}`,
            trailing: (
              <>
                <span className="text-sm tabular-nums">{qty(i.onHand, i.unitLabel)}</span>
                <StatusChip
                  value={i.onHand < 0 ? "NEG" : "LOW"}
                  map={{ NEG: "ติดลบ", LOW: "ใกล้หมด" }}
                  tone={i.onHand < 0 ? "danger" : "muted"}
                />
              </>
            ),
          }))}
          empty="สต็อกเพียงพอทุกรายการ — จะแจ้งเตือนเมื่อของถึงจุดสั่งซื้อ"
        />
      </Section>

      {/* บันทึกความเคลื่อนไหว (รับเข้า / ตัดออก) */}
      {items.length > 0 && (
        <Section title="บันทึกความเคลื่อนไหว">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* รับเข้า */}
            <form action={receiveAction} className="card flex flex-col gap-3 p-4">
              <input type="hidden" name="systemId" value={systemId} />
              <h3 className="text-sm font-medium">รับเข้า (เพิ่มสต็อก)</h3>
              <FormField label="สินค้า" required>
                <select name="itemId" required className="input" defaultValue="">
                  <option value="" disabled>
                    เลือกสินค้า
                  </option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.sku})
                    </option>
                  ))}
                </select>
              </FormField>
              {multiWarehouse && (
                <FormField label="รับเข้าคลัง" required>
                  <select name="locationId" required className="input" defaultValue={locations[0].id}>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              <div className="grid grid-cols-2 gap-2">
                <FormField label="จำนวน" required>
                  <input name="qty" type="number" min={1} step={1} required placeholder="0" className="input" />
                </FormField>
                <FormField label="ต้นทุน/หน่วย (บาท)" hint="ใช้คิดต้นทุนถัวเฉลี่ย">
                  <input name="cost" type="number" min={0} step="0.01" placeholder="0" className="input" />
                </FormField>
              </div>
              <FormField label="หมายเหตุ">
                <input name="note" placeholder="เช่น ล็อตวันที่รับ" className="input" />
              </FormField>
              <SubmitButton>รับเข้า</SubmitButton>
            </form>

            {/* ตัดออก */}
            <form action={consumeAction} className="card flex flex-col gap-3 p-4">
              <input type="hidden" name="systemId" value={systemId} />
              <h3 className="text-sm font-medium">ตัดออก (เสีย / ใช้เอง)</h3>
              <FormField label="สินค้า" required>
                <select name="itemId" required className="input" defaultValue="">
                  <option value="" disabled>
                    เลือกสินค้า
                  </option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.sku})
                    </option>
                  ))}
                </select>
              </FormField>
              {multiWarehouse && (
                <FormField label="ตัดจากคลัง" required>
                  <select name="locationId" required className="input" defaultValue={locations[0].id}>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              <FormField label="จำนวน" required hint="ตัดเกินสต็อกได้ ระบบจะตั้งธงให้ตรวจสอบภายหลัง">
                <input name="qty" type="number" min={1} step={1} required placeholder="0" className="input" />
              </FormField>
              <FormField label="หมายเหตุ">
                <input name="note" placeholder="เช่น ของเสีย / ใช้ภายใน" className="input" />
              </FormField>
              <SubmitButton variant="ghost">ตัดออก</SubmitButton>
            </form>
          </div>
        </Section>
      )}

      {/* คลังสินค้า (จัดการ + โอนย้าย) */}
      <Section title={`คลังสินค้า (${locations.length})`}>
        <DataList
          items={locations.map((l) => ({
            key: l.id,
            primary: l.name,
            secondary: l.isDefault ? "คลังหลัก (ค่าเริ่มต้น)" : "คลังสาขา",
          }))}
          empty="ยังไม่มีคลัง"
        />

        {/* เพิ่มคลังใหม่ */}
        <form
          action={createLocationAction}
          className="mt-2 flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="systemId" value={systemId} />
          <FormField label="ชื่อคลังใหม่" required>
            <input name="name" required placeholder="เช่น คลังสาขา 2 / หน้าร้าน" className="input" />
          </FormField>
          <SubmitButton variant="ghost">+ เพิ่มคลัง</SubmitButton>
        </form>

        {/* โอนสต็อกระหว่างคลัง (ต้องมีสินค้า + อย่างน้อย 2 คลัง) */}
        {items.length > 0 && multiWarehouse && (
          <form action={transferAction} className="mt-3 flex flex-col gap-3 rounded-lg border p-4">
            <input type="hidden" name="systemId" value={systemId} />
            <h3 className="text-sm font-medium">โอนสต็อกระหว่างคลัง</h3>
            <FormField label="สินค้า" required>
              <select name="itemId" required className="input" defaultValue="">
                <option value="" disabled>
                  เลือกสินค้า
                </option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.sku})
                  </option>
                ))}
              </select>
            </FormField>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormField label="จากคลัง" required>
                <select name="fromLocationId" required className="input" defaultValue={locations[0].id}>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="ไปคลัง" required>
                <select name="toLocationId" required className="input" defaultValue={locations[1].id}>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <FormField label="จำนวน" required hint="โอนเกินยอดคลังต้นทางได้ ระบบจะตั้งธงให้ตรวจสอบ">
              <input name="qty" type="number" min={1} step={1} required placeholder="0" className="input" />
            </FormField>
            <FormField label="หมายเหตุ">
              <input name="note" placeholder="เช่น เติมของหน้าร้าน" className="input" />
            </FormField>
            <SubmitButton>โอนสต็อก</SubmitButton>
          </form>
        )}
      </Section>

      {/* ซัพพลายเออร์ */}
      <Section title={`ซัพพลายเออร์ (${suppliers.length})`}>
        <DataList
          items={suppliers.map((s) => ({
            key: s.id,
            primary: s.name,
            secondary: [s.phone, s.email, s.note].filter(Boolean).join(" · ") || "—",
          }))}
          empty="ยังไม่มีซัพพลายเออร์ — เพิ่มรายแรกด้านล่างเพื่อเริ่มสั่งซื้อ"
        />

        {/* เพิ่มซัพพลายเออร์ */}
        <form
          action={createSupplierAction}
          className="mt-2 flex flex-col gap-3 rounded-lg border border-dashed p-4"
        >
          <input type="hidden" name="systemId" value={systemId} />
          <h3 className="text-sm font-medium">เพิ่มซัพพลายเออร์</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <FormField label="ชื่อ" required>
              <input name="name" required placeholder="เช่น บ.ซัพพลายดี" className="input" />
            </FormField>
            <FormField label="เบอร์โทร">
              <input name="phone" placeholder="เช่น 021112222" className="input" />
            </FormField>
            <FormField label="อีเมล">
              <input name="email" type="email" placeholder="เช่น sales@supply.co.th" className="input" />
            </FormField>
            <FormField label="หมายเหตุ">
              <input name="note" placeholder="เช่น ส่งของทุกวันจันทร์" className="input" />
            </FormField>
          </div>
          <SubmitButton variant="ghost">+ เพิ่มซัพพลายเออร์</SubmitButton>
        </form>
      </Section>

      {/* ใบสั่งซื้อ (PO) */}
      <Section title={`ใบสั่งซื้อ (PO) (${pos.length})`}>
        {pos.length === 0 ? (
          <p className={`text-sm ${muted}`}>
            ยังไม่มีใบสั่งซื้อ — สร้างใบแรกด้านล่างเพื่อสั่งของเข้าคลัง
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pos.map((po) => (
              <div
                key={po.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{po.code}</span>
                    <StatusChip value={po.status} map={PO_STATUS} tone={poTone(po.status)} />
                  </div>
                  <div className={`truncate text-xs ${muted}`}>
                    {po.supplierName} · {po.lineCount.toLocaleString("th-TH")} รายการ ·{" "}
                    {po.totalQty.toLocaleString("th-TH")} ชิ้น · รวม <MoneyText satang={po.totalSatang} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {po.status === "DRAFT" && (
                    <form action={markOrderedAction}>
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="poId" value={po.id} />
                      <SubmitButton>ยืนยันสั่งซื้อ</SubmitButton>
                    </form>
                  )}
                  {po.status === "ORDERED" &&
                    (multiWarehouse ? (
                      <form action={receivePoAction} className="flex items-center gap-2">
                        <input type="hidden" name="systemId" value={systemId} />
                        <input type="hidden" name="poId" value={po.id} />
                        <select name="locationId" className="input py-1 text-sm" defaultValue={locations[0].id} aria-label="รับเข้าคลัง">
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                        <SubmitButton>รับของ</SubmitButton>
                      </form>
                    ) : (
                      <ConfirmDialog
                        triggerLabel="รับของ"
                        triggerClassName="btn btn-primary text-sm"
                        title={`รับของเข้าคลัง — ${po.code}?`}
                        detail={`จะเพิ่มสต็อก ${po.totalQty.toLocaleString("th-TH")} ชิ้น จาก ${po.lineCount.toLocaleString("th-TH")} รายการ`}
                        confirmLabel="ยืนยันรับของ"
                        action={receivePoAction}
                        fields={{ systemId, poId: po.id }}
                      />
                    ))}
                  {(po.status === "DRAFT" || po.status === "ORDERED") && (
                    <ConfirmDialog
                      triggerLabel="ยกเลิก"
                      title={`ยกเลิกใบสั่งซื้อ ${po.code}?`}
                      detail="ยกเลิกแล้วจะสั่งซื้อหรือรับของใบนี้ไม่ได้อีก"
                      confirmLabel="ยืนยันยกเลิก"
                      danger
                      action={cancelPoAction}
                      fields={{ systemId, poId: po.id }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* สร้างใบสั่งซื้อใหม่ (ต้องมีซัพพลายเออร์ + สินค้าก่อน) */}
        {suppliers.length > 0 && items.length > 0 && (
          <form
            action={createPoAction}
            className="mt-2 flex flex-col gap-3 rounded-lg border border-dashed p-4"
          >
            <input type="hidden" name="systemId" value={systemId} />
            <h3 className="text-sm font-medium">สร้างใบสั่งซื้อ</h3>
            <FormField label="ซัพพลายเออร์" required>
              <select name="supplierId" required className="input" defaultValue="">
                <option value="" disabled>
                  เลือกซัพพลายเออร์
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="flex flex-col gap-2">
              <div className={`text-xs ${muted}`}>รายการสินค้า (เว้นว่างแถวที่ไม่ใช้ได้)</div>
              {Array.from({ length: PO_LINE_ROWS }).map((_, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5rem_7rem]">
                  <select name="lineItemId" className="input" defaultValue="">
                    <option value="">— เลือกสินค้า —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.sku})
                      </option>
                    ))}
                  </select>
                  <input
                    name="lineQty"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="จำนวน"
                    className="input"
                    aria-label="จำนวน"
                  />
                  <input
                    name="lineCost"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="ต้นทุน/หน่วย ฿"
                    className="input"
                    aria-label="ต้นทุนต่อหน่วย (บาท)"
                  />
                </div>
              ))}
            </div>
            <FormField label="หมายเหตุ">
              <input name="note" placeholder="เช่น สั่งของประจำเดือน" className="input" />
            </FormField>
            <SubmitButton variant="ghost">+ สร้างใบสั่งซื้อ</SubmitButton>
          </form>
        )}
      </Section>

      {/* รายการสินค้า + ยอดคงเหลือ (กดดูยอดแยกคลังได้เมื่อมีหลายคลัง) */}
      <Section title={`สินค้าในคลัง (${items.length})`}>
        {items.length === 0 ? (
          <EmptyState text="ยังไม่มีสินค้า — เพิ่มสินค้ารายการแรกด้านล่างเพื่อเริ่มนับสต็อก" />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((i) => {
              const breakdown = stockMap.get(i.id) ?? [];
              const expandable = multiWarehouse && breakdown.length > 0;
              const header = (
                <>
                  <div className="min-w-0">
                    <div className="truncate">{i.name}</div>
                    <div className={`truncate text-xs ${muted}`}>
                      {[`รหัส ${i.sku}`, i.category].filter(Boolean).join(" · ")}
                      {expandable ? " · แตะดูยอดแยกคลัง" : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <div className="text-right">
                      <div className={`text-sm tabular-nums ${i.onHand < 0 ? "text-[color:var(--color-danger)]" : ""}`}>
                        {qty(i.onHand, i.unitLabel)}
                      </div>
                      <div className={`text-xs ${muted}`}>
                        ต้นทุน <MoneyText satang={i.costSatang} />
                      </div>
                    </div>
                    {lowIds.has(i.id) && <StatusChip value="LOW" map={{ LOW: "ใกล้หมด" }} tone="muted" />}
                  </div>
                </>
              );
              if (!expandable) {
                return (
                  <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    {header}
                  </div>
                );
              }
              return (
                <details key={i.id} className="rounded-lg border text-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                    {header}
                  </summary>
                  <div className="flex flex-col gap-1 border-t px-3 py-2">
                    {breakdown.map((b) => (
                      <div key={b.locationId} className="flex items-center justify-between">
                        <span className={muted}>{b.name}</span>
                        <span className={`tabular-nums ${b.onHand < 0 ? "text-[color:var(--color-danger)]" : ""}`}>
                          {qty(b.onHand, i.unitLabel)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {/* เพิ่มสินค้าใหม่ */}
        <form action={createItemAction} className="mt-2 flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <input type="hidden" name="systemId" value={systemId} />
          <h3 className="text-sm font-medium">เพิ่มสินค้าใหม่</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <FormField label="รหัสสินค้า (SKU)" required>
              <input name="sku" required placeholder="เช่น SH-01" className="input" />
            </FormField>
            <FormField label="ชื่อสินค้า" required>
              <input name="name" required placeholder="เช่น แชมพู" className="input" />
            </FormField>
            <FormField label="หน่วยนับ" hint="ค่าเริ่มต้น: ชิ้น">
              <input name="unitLabel" placeholder="ชิ้น / ขวด / กล่อง" className="input" />
            </FormField>
            <FormField label="หมวดหมู่">
              <input name="category" placeholder="เช่น เครื่องดื่ม" className="input" />
            </FormField>
            <FormField label="จุดสั่งซื้อ" hint="เตือนเมื่อคงเหลือถึงจำนวนนี้">
              <input name="reorderPoint" type="number" min={0} step={1} placeholder="0" className="input" />
            </FormField>
            <FormField label="ต้นทุนตั้งต้น/หน่วย (บาท)">
              <input name="cost" type="number" min={0} step="0.01" placeholder="0" className="input" />
            </FormField>
          </div>
          <SubmitButton variant="ghost">+ เพิ่มสินค้า</SubmitButton>
        </form>
      </Section>

      {/* ความเคลื่อนไหวล่าสุด */}
      <Section title="ความเคลื่อนไหวล่าสุด">
        <DataList
          items={movements.map((m) => ({
            key: m.id,
            primary: `${MOVE_LABEL[m.type] ?? m.type} · ${m.item.name}`,
            secondary: [
              formatThaiDateTime(m.createdAt),
              m.sourceModule ? `จาก ${m.sourceModule}` : null,
              m.needsReview ? "⚠ รอตรวจสอบ (ติดลบ)" : null,
            ]
              .filter(Boolean)
              .join(" · "),
            trailing: (
              <div className="text-right">
                <div className={`text-sm tabular-nums ${m.qtyDelta < 0 ? "text-[color:var(--color-danger)]" : ""}`}>
                  {m.qtyDelta > 0 ? "+" : ""}
                  {m.qtyDelta.toLocaleString("th-TH")} {m.item.unitLabel}
                </div>
                <div className={`text-xs ${muted}`}>คงเหลือ {m.balanceAfter.toLocaleString("th-TH")}</div>
              </div>
            ),
          }))}
          empty="ยังไม่มีความเคลื่อนไหว — รับเข้าหรือตัดออกสินค้าเพื่อเริ่มบันทึกประวัติ"
        />
      </Section>
    </div>
  );
}

export default InventoryContent;
