import type { RoomReadOnly } from "@/lib/platform/secretary-ops";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatThaiDateTime } from "@/lib/ui/date";

// ห้องงานเลขา แบบอ่านอย่างเดียว (S2.16 H4 ของที่แนบ · S2.23 G5 เปิดห้อง) — ไม่มีปุ่มเขียนใด ๆ
// ปุ่ม "ย้อน" ของบันทึกการกระทำ **ซ่อน**: undoAction (S1.8) รับเฉพาะ actor สมาชิกร้าน ไม่รองรับ actor ทีมงาน (หนี้ S3 · wo-notes sec-s2.16)

const ROLE_LABEL: Record<string, string> = { USER: "ผู้ใช้", ASSISTANT: "เลขา", SYSTEM: "ระบบ", TOOL: "เครื่องมือ" };
const PROPOSAL_LABEL: Record<string, string> = {
  PENDING: "รออนุมัติ",
  EXECUTED: "ทำแล้ว",
  REJECTED: "ไม่อนุมัติ",
  EXPIRED: "หมดอายุ",
  FAILED: "ไม่สำเร็จ",
};
const JOB_LABEL: Record<string, string> = { QUEUED: "รอคิว", RUNNING: "กำลังรัน", DONE: "เสร็จ", FAILED: "ล้มเหลว" };
const MSG_MAX = 2000;
const clip = (s: string) => (s.length > MSG_MAX ? `${s.slice(0, MSG_MAX)}…` : s);

export function RoomReadOnlyView({ data, messageLimit }: { data: RoomReadOnly; messageLimit?: number }) {
  const msgs = typeof messageLimit === "number" ? data.messages.slice(-messageLimit) : data.messages;
  return (
    <div className="flex flex-col gap-4" data-testid="room-readonly">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted)]">
        <span className="font-medium text-[color:var(--color-ink)]">ห้องงาน “{data.room.title}”</span>
        <span>· {data.room.tenantName}</span>
        <span>· เปิด {formatThaiDateTime(data.room.createdAt)}</span>
        {data.room.closedAt && <StatusChip value="closed" map={{ closed: "ปิดห้องแล้ว" }} />}
        <span>· อ่านอย่างเดียว</span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-[color:var(--color-muted)]">
          ข้อความ ({data.messages.length.toLocaleString("th-TH")}
          {msgs.length < data.messages.length ? ` · แสดง ${msgs.length} ล่าสุด` : ""})
        </div>
        {msgs.length === 0 ? (
          <div className="text-sm text-[color:var(--color-muted)]">ยังไม่มีข้อความ</div>
        ) : (
          msgs.map((m) => (
            <div
              key={m.id}
              className={`max-w-[90%] rounded-lg border px-3 py-2 text-sm ${
                m.role === "USER" ? "self-end bg-[color:var(--color-surface-2)]" : "self-start"
              }`}
            >
              <div className="mb-0.5 text-xs text-[color:var(--color-muted)]">
                {ROLE_LABEL[m.role] ?? m.role} · {formatThaiDateTime(m.createdAt)}
              </div>
              <div className="whitespace-pre-wrap break-words">{clip(m.content)}</div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-[color:var(--color-muted)]">ข้อเสนอของเลขา ({data.proposals.length})</div>
        {data.proposals.length === 0 ? (
          <div className="text-sm text-[color:var(--color-muted)]">ไม่มีข้อเสนอ</div>
        ) : (
          data.proposals.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="whitespace-pre-wrap break-words">{clip(p.summary)}</div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {p.kind} · {formatThaiDateTime(p.createdAt)}
                  {p.resultNote ? ` · ${p.resultNote}` : ""}
                </div>
              </div>
              <StatusChip value={p.status} map={PROPOSAL_LABEL} />
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-[color:var(--color-muted)]">บันทึกการกระทำของห้อง ({data.log.length})</div>
        {data.log.length === 0 ? (
          <div className="text-sm text-[color:var(--color-muted)]">ยังไม่มีการกระทำ</div>
        ) : (
          data.log.map((l) => (
            <div key={l.id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="break-words">{l.summary}</div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {l.module} · {l.kind} · {formatThaiDateTime(l.createdAt)}
                  {l.undoneAt ? ` · ย้อนแล้ว ${formatThaiDateTime(l.undoneAt)}` : l.undoableUntil ? " · ร้านย้อนเองได้ใน 24 ชม." : ""}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {data.jobs.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-[color:var(--color-muted)]">งานในคิวของห้อง</div>
          {data.jobs.map((j) => (
            <div key={j.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
              <span className="min-w-0 truncate">
                {formatThaiDateTime(j.createdAt)} · ลอง {j.attempts} ครั้ง{j.error ? ` · ${j.error}` : ""}
              </span>
              <StatusChip value={j.status} map={JOB_LABEL} tone={j.status === "FAILED" ? "danger" : undefined} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RoomReadOnlyView;
