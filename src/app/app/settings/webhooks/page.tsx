import { requireTenant } from "@/lib/core/context";
import { listEndpoints, listDeliveries } from "@/lib/webhooks/service";
import { toggleEndpointAction, deleteEndpointAction } from "@/lib/webhooks/actions";
import { webhookEventLabel } from "@/lib/webhooks/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { WebhookEndpointForm } from "@/components/webhook-endpoint-form";
import { formatThaiDateTime } from "@/lib/ui/date";

// ตั้งค่า Webhooks ขาออก (WO-0062): สมัคร URL รับเหตุการณ์ + ลายเซ็น HMAC + ดูประวัติการส่ง
export default async function WebhooksSettingsPage() {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId };
  const [endpoints, deliveries] = await Promise.all([listEndpoints(ctx), listDeliveries(ctx)]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Webhooks (แจ้งเตือนไปยังระบบอื่น)"
        desc="สมัครที่อยู่ปลายทางเพื่อให้ระบบยิงข้อมูลไปทันทีเมื่อเกิดเหตุการณ์ พร้อมลายเซ็นตรวจสอบความถูกต้อง"
      />

      <Section title="ปลายทางทั้งหมด" card>
        {endpoints.length === 0 ? (
          <EmptyState text="ยังไม่มีปลายทาง — เพิ่มปลายทางแรกด้านล่างเพื่อเชื่อมระบบภายนอก" />
        ) : (
          <div className="flex flex-col gap-2">
            {endpoints.map((ep) => {
              const events = Array.isArray(ep.eventsJson)
                ? (ep.eventsJson as unknown[]).filter((x): x is string => typeof x === "string")
                : [];
              return (
                <div
                  key={ep.id}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{ep.url}</span>
                      <StatusChip
                        value={ep.active ? "on" : "off"}
                        map={{ on: "เปิดอยู่", off: "ปิดอยู่" }}
                        tone={ep.active ? "strong" : "muted"}
                      />
                    </div>
                    <div className="truncate text-xs text-[color:var(--color-muted)]">
                      {events.length === 0
                        ? "ทุกเหตุการณ์"
                        : events.map((e) => webhookEventLabel(e)).join(" · ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <form action={toggleEndpointAction}>
                      <input type="hidden" name="id" value={ep.id} />
                      <input type="hidden" name="active" value={ep.active ? "false" : "true"} />
                      <button type="submit" className="btn-sm">
                        {ep.active ? "ปิด" : "เปิด"}
                      </button>
                    </form>
                    <ConfirmDialog
                      triggerLabel="ลบ"
                      triggerClassName="btn-sm"
                      title="ลบปลายทางนี้?"
                      detail={`"${ep.url}" จะถูกลบและหยุดรับข้อมูลทันที (ประวัติการส่งจะถูกลบด้วย)`}
                      confirmLabel="ยืนยันลบ"
                      danger
                      action={deleteEndpointAction}
                      fields={{ id: ep.id }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="เพิ่มปลายทางใหม่" card>
        <WebhookEndpointForm />
      </Section>

      <Section title="ประวัติการส่งล่าสุด" card>
        {deliveries.length === 0 ? (
          <EmptyState text="ยังไม่มีการส่ง — เมื่อเกิดเหตุการณ์ที่สมัครไว้ ระบบจะบันทึกผลการส่งที่นี่" />
        ) : (
          <div className="flex flex-col gap-2">
            {deliveries.map((d) => (
              <div key={d.id} className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{webhookEventLabel(d.eventType)}</span>
                  <StatusChip
                    value={d.status}
                    map={{ OK: "สำเร็จ", FAILED: "ล้มเหลว" }}
                    tone={d.status === "OK" ? "strong" : "danger"}
                  />
                </div>
                <div className="truncate text-xs text-[color:var(--color-muted)]">
                  {d.endpoint.url} · พยายาม {d.attempts} ครั้ง · {formatThaiDateTime(d.createdAt)}
                </div>
                {d.status === "FAILED" && d.lastError && (
                  <div className="truncate text-xs text-[color:var(--color-danger)]">
                    {d.lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
