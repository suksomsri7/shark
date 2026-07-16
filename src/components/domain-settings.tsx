"use client";

import { useActionState } from "react";
import {
  requestDomainAction,
  checkDomainAction,
  removeDomainAction,
  type DomainActionState,
} from "@/lib/domain/actions";
import { FormField } from "@/components/ui/FormField";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const initial: DomainActionState = { status: "idle" };

// ป้ายสถานะไทย + โทน (strong = ปกติ/สำเร็จ, danger = เสีย)
const STATUS_LABEL: Record<string, string> = {
  NONE: "ยังไม่ได้ตั้ง",
  PENDING_DNS: "รอตั้งค่า DNS",
  VERIFYING: "กำลังตรวจสอบ",
  ACTIVE: "ใช้งานแล้ว",
  FAILED: "ล้มเหลว",
};
const statusTone = (v: string) => {
  if (v === "FAILED") return "danger" as const;
  if (v === "ACTIVE") return "strong" as const;
  return "muted" as const;
};

// ฟอร์มตั้งค่าโดเมนของร้าน — กรอกโดเมน → ตั้ง DNS → ตรวจสถานะ → ยกเลิกได้
export function DomainSettings({
  customDomain,
  domainStatus,
  isOwner,
}: {
  customDomain: string | null;
  domainStatus: string;
  isOwner: boolean;
}) {
  const [reqState, requestAction, reqPending] = useActionState(requestDomainAction, initial);
  const [chkState, checkAction, chkPending] = useActionState(checkDomainAction, initial);

  if (!isOwner) {
    return (
      <div className="card">
        <p className="text-sm text-[color:var(--color-muted)]">
          เฉพาะเจ้าของร้าน (OWNER) เท่านั้นที่ตั้งค่าโดเมนได้
        </p>
      </div>
    );
  }

  const hasDomain = Boolean(customDomain);

  return (
    <div className="flex flex-col gap-6">
      {!hasDomain && (
        <form action={requestAction} className="card flex flex-col gap-4">
          <FormField
            label="โดเมนของคุณ"
            required
            hint="กรอกโดเมนที่คุณเป็นเจ้าของ เช่น shop.example.com หรือ www.myshop.com"
          >
            <input
              name="domain"
              inputMode="url"
              placeholder="shop.example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
            />
          </FormField>
          {reqState.status === "error" && (
            <p className="text-sm text-[color:var(--color-danger)]">{reqState.message}</p>
          )}
          {reqState.status === "ok" && <p className="text-sm font-medium">✅ {reqState.message}</p>}
          <button type="submit" disabled={reqPending} className="btn btn-primary text-sm disabled:opacity-50">
            {reqPending ? "กำลังบันทึก…" : "เชื่อมโดเมนนี้"}
          </button>
        </form>
      )}

      {hasDomain && (
        <>
          <div className="card flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-[color:var(--color-muted)]">โดเมนของร้าน</div>
                <div className="truncate text-sm font-semibold">{customDomain}</div>
              </div>
              <StatusChip value={domainStatus} map={STATUS_LABEL} toneOf={statusTone} />
            </div>

            {domainStatus !== "ACTIVE" && (
              <div className="rounded-lg border border-[color:var(--color-line)] p-3">
                <div className="text-xs font-medium">ขั้นตอนตั้งค่า DNS</div>
                <p className="mt-1 text-xs text-[color:var(--color-muted)]">
                  ไปที่ผู้ให้บริการโดเมนของคุณ แล้วเพิ่มเรคคอร์ดนี้:
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[320px] text-left text-xs">
                    <thead>
                      <tr className="text-[color:var(--color-muted)]">
                        <th className="py-1 pr-3 font-normal">ชนิด</th>
                        <th className="py-1 pr-3 font-normal">ชื่อ (Host)</th>
                        <th className="py-1 font-normal">ค่า (Value)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="font-mono">
                        <td className="py-1 pr-3">CNAME</td>
                        <td className="py-1 pr-3">{customDomain}</td>
                        <td className="py-1">cname.vercel-dns.com</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-[color:var(--color-muted)]">
                  หลังตั้งค่าแล้ว DNS อาจใช้เวลาแพร่กระจายไม่กี่นาทีถึงหลายชั่วโมง กด “ตรวจสถานะ” เพื่อเช็ก
                </p>
              </div>
            )}

            {domainStatus === "ACTIVE" && (
              <p className="text-sm text-[color:var(--color-muted)]">
                ลูกค้าเปิดหน้าร้านของคุณผ่านโดเมนนี้ได้แล้ว
              </p>
            )}

            <form action={checkAction} className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={chkPending} className="btn-sm disabled:opacity-50">
                {chkPending ? "กำลังตรวจ…" : "ตรวจสถานะ"}
              </button>
              <ConfirmDialog
                triggerLabel="ยกเลิกโดเมน"
                title="ยกเลิกโดเมนนี้?"
                detail={`ลูกค้าจะเปิดหน้าร้านผ่าน ${customDomain} ไม่ได้อีก (กลับไปใช้ที่อยู่ shark.in.th เดิม)`}
                confirmLabel="ยืนยันยกเลิก"
                danger
                action={removeDomainAction}
              />
            </form>

            {chkState.status === "error" && (
              <p className="text-sm text-[color:var(--color-danger)]">{chkState.message}</p>
            )}
            {chkState.status === "ok" && (
              <p className="text-sm text-[color:var(--color-muted)]">{chkState.message}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default DomainSettings;
