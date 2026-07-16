import { requireTenant } from "@/lib/core/context";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { FormField } from "@/components/ui/FormField";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatThaiDateTime } from "@/lib/ui/date";
import { listItems, lowStock, recentMovements, type Ctx } from "./service";
import { consumeAction, createItemAction, receiveAction } from "./actions";

const muted = "text-[color:var(--color-muted)]";

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

  const [items, low, movements] = await Promise.all([
    listItems(ctx),
    lowStock(ctx),
    recentMovements(ctx),
  ]);

  const lowIds = new Set(low.map((i) => i.id));
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

      {/* รายการสินค้า + ยอดคงเหลือ */}
      <Section title={`สินค้าในคลัง (${items.length})`}>
        <DataList
          items={items.map((i) => ({
            key: i.id,
            primary: i.name,
            secondary: [`รหัส ${i.sku}`, i.category].filter(Boolean).join(" · "),
            trailing: (
              <>
                <div className="text-right">
                  <div className={`text-sm tabular-nums ${i.onHand < 0 ? "text-[color:var(--color-danger)]" : ""}`}>
                    {qty(i.onHand, i.unitLabel)}
                  </div>
                  <div className={`text-xs ${muted}`}>
                    ต้นทุน <MoneyText satang={i.costSatang} />
                  </div>
                </div>
                {lowIds.has(i.id) && (
                  <StatusChip value="LOW" map={{ LOW: "ใกล้หมด" }} tone="muted" />
                )}
              </>
            ),
          }))}
          empty="ยังไม่มีสินค้า — เพิ่มสินค้ารายการแรกด้านล่างเพื่อเริ่มนับสต็อก"
        />

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
