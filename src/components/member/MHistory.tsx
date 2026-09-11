// MHistory.tsx — หน้า "ประวัติ" ของลูกค้า (M2.9 · ไทม์ไลน์ `MemberActivity` ของตัวเอง)
//
// ไทม์ไลน์เส้นเดียวเรียงใหม่→เก่า: จุด · หัวข้อสรุป · เวลาแบบไทย · ที่มา (ขาย/จอง/แต้ม/สมาชิก)
import type { MemberActivityDto } from "@/lib/modules/member/activity";
import { MemberIcon } from "./MemberIcon";
import { MMuted, MTopBar } from "./MShell";

const MODULE_ICON: Record<string, string> = {
  pos: "card",
  booking: "date",
  point: "star",
  member: "users",
  stamp: "stamp",
  voucher: "tag",
  reward: "gift",
  giftcard: "wallet",
  chat: "chat",
};

const MODULE_LABEL: Record<string, string> = {
  pos: "การซื้อ",
  booking: "การจอง",
  point: "แต้มสะสม",
  member: "สมาชิก",
  stamp: "สแตมป์",
  voucher: "Voucher",
  reward: "ของรางวัล",
  giftcard: "Gift Card",
  chat: "แชท",
};

function when(at: Date | string): string {
  return new Date(at).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

export function MHistory({ items }: { items: MemberActivityDto[] }) {
  return (
    <div data-testid="m-history" className="flex flex-col gap-3 pb-4">
      <MTopBar title="ประวัติของฉัน" left="back" right="clock" />
      {items.length === 0 ? (
        <p className="px-4" style={{ fontSize: 12, color: "var(--color-muted)" }}>
          ยังไม่มีประวัติการใช้บริการ — เริ่มสะสมได้จากการซื้อหรือจองครั้งถัดไป
        </p>
      ) : (
        <ol className="flex flex-col gap-3 px-4">
          {items.map((it) => (
            <li key={it.id} className="flex gap-2.5">
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}
              >
                <MemberIcon name={MODULE_ICON[it.module] ?? "doc"} size="sm" />
              </span>
              <span className="min-w-0 flex-1 border-b pb-3" style={{ borderColor: "var(--color-line)" }}>
                <span className="block" style={{ fontSize: 12.8, fontWeight: 600 }}>
                  {it.summary}
                </span>
                <MMuted>
                  {when(it.at)} · {MODULE_LABEL[it.module] ?? it.module}
                </MMuted>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default MHistory;
