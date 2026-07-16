import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { listApiKeys } from "@/lib/api-keys/service";
import { revokeKeyAction } from "./actions";
import { ApiKeyForm } from "./ApiKeyForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatThaiDateTime } from "@/lib/ui/date";

// ตั้งค่า API สำหรับนักพัฒนา (WO-0061): ออก/เพิกถอนคีย์ให้ระบบอื่นดึงข้อมูลร้านผ่าน REST
export default async function ApiSettingsPage() {
  const auth = await requireTenant();
  const keys = await listApiKeys({ tenantId: auth.active.tenantId });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="API สำหรับนักพัฒนา"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="ออกคีย์ให้ระบบอื่น (เช่น ระบบบัญชี เว็บไซต์ หรือแอปภายนอก) ดึงข้อมูลร้านของคุณผ่าน REST API แบบอ่านอย่างเดียว"
      />

      <Section title="เอกสารการเชื่อมต่อ" card>
        <p className="text-sm text-[color:var(--color-muted)]">
          ดูวิธีเรียกใช้ รายการ endpoint และตัวอย่างคำสั่งได้ที่หน้า{" "}
          <Link href="/developers" className="font-medium underline" target="_blank">
            คู่มือนักพัฒนา
          </Link>
          . แต่ละคีย์เรียกได้สูงสุด 60 ครั้งต่อนาที
        </p>
      </Section>

      <Section title="คีย์ทั้งหมด" card>
        {keys.length === 0 ? (
          <EmptyState text="ยังไม่มีคีย์ — สร้างคีย์แรกด้านล่างเพื่อเริ่มเชื่อมต่อระบบอื่น" />
        ) : (
          <div className="flex flex-col gap-2">
            {keys.map((k) => {
              const revoked = k.revokedAt != null;
              return (
                <div
                  key={k.id}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{k.name}</span>
                      <StatusChip
                        value={revoked ? "off" : "on"}
                        map={{ on: "ใช้งานอยู่", off: "เพิกถอนแล้ว" }}
                        tone={revoked ? "muted" : "strong"}
                      />
                    </div>
                    <div className="truncate text-xs text-[color:var(--color-muted)]">
                      <code>{k.prefix}…</code>
                      {" · "}
                      {k.lastUsedAt ? `ใช้ล่าสุด ${formatThaiDateTime(k.lastUsedAt)}` : "ยังไม่เคยใช้"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!revoked && (
                      <ConfirmDialog
                        triggerLabel="เพิกถอน"
                        triggerClassName="btn-sm"
                        title="เพิกถอนคีย์นี้?"
                        detail={`"${k.name}" จะใช้เรียก API ไม่ได้อีกทันที ระบบที่ใช้คีย์นี้จะถูกตัดการเชื่อมต่อ`}
                        confirmLabel="ยืนยันเพิกถอน"
                        danger
                        action={revokeKeyAction}
                        fields={{ id: k.id }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="สร้างคีย์ใหม่" card>
        <ApiKeyForm />
      </Section>
    </div>
  );
}
