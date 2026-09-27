"use client";

// CrmTeamRoomPicker.tsx — ผูก "ทีมขาย → ห้องแชททีม (MEETING)" บนหน้าตั้งค่า CRM (ใบ C3.4 · addendum ข้อ 4)
//   ห้องที่ผูกไว้ได้รับข้อความจากระบบ CRM: ปิดดีลได้ · lead ร้อน · สรุปดีลนิ่งรายวัน (วันละข้อความ)
// 🔴 ตัวเลือกห้อง = ห้องที่ยังใช้ได้ของระบบแชททีมในร้านนี้ (หน้า server ส่งมา) · บริการตรวจซ้ำทุกครั้ง (ห้องร้านอื่น/ถูกเก็บ = ปฏิเสธ)
// 🔴 คีย์ `crm.settings.manage` (หน้า server ไม่แสดงให้คนที่ไม่มี) · ผลแสดง inline · 'use client' ไม่ import โมดูล CRM (F2.3)

import { useState } from "react";
import { setTeamRoomAction } from "@/app/app/sys/[id]/crm/_actions/ai";

type Room = { meetingSystemId: string; systemName: string; channelId: string; channelName: string };

export function CrmTeamRoomPicker({
  systemId,
  teams,
  rooms,
  current,
  hiddenLive = [],
}: {
  systemId: string;
  teams: { id: string; name: string }[];
  rooms: Room[];
  current: Record<string, { meetingSystemId: string; channelId: string }>;
  /** ห้องที่ผูกไว้แต่ผู้ดูมองไม่เห็น (ห้องส่วนตัวที่เขาไม่ได้อยู่) และยังใช้งานอยู่ — id ล้วน (รีวิว C3.4 รอบ 2 N2) */
  hiddenLive?: string[];
}) {
  // 🔴 รีวิว C3.4 รอบ 2 N2: ค่าในช่องเลือกห้อง = เฉพาะห้องที่ผู้ดูเห็น — การผูกเดิมที่ชี้ห้องที่เขามองไม่เห็นจะไม่ถูกส่งกลับไปตอนบันทึก
  //    (ไม่งั้นบันทึกแล้วได้ NOT_FOUND) · ปุ่ม "เลิกผูก" ใช้ได้เสมอแม้ผู้ดูเห็น 0 ห้อง
  const visibleIds = new Set(rooms.map((r) => r.channelId));
  const pickable = (id: string | undefined) => (id && visibleIds.has(id) ? id : "");
  const [map, setMap] = useState(current);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [channelId, setChannelId] = useState(pickable(current[teams[0]?.id ?? ""]?.channelId));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hidden = new Set(hiddenLive);
  const roomName = (id: string) => {
    const r = rooms.find((x) => x.channelId === id);
    if (r) return `${r.systemName} · #${r.channelName}`;
    return hidden.has(id) ? "ห้องที่คุณมองไม่เห็น (ยังใช้งานอยู่)" : "ห้องที่ใช้ไม่ได้แล้ว (ถูกเก็บหรือลบ)";
  };

  async function save(nextChannel: string | null, forTeam = teamId) {
    if (!forTeam) return;
    setBusy(true);
    setMsg(null);
    const r = await setTeamRoomAction(systemId, forTeam, nextChannel);
    setBusy(false);
    if (r.ok) {
      setMap(r.teamRooms);
      setMsg({ ok: true, text: nextChannel ? "บันทึกห้องของทีมแล้ว" : "เลิกผูกห้องของทีมแล้ว" });
    } else setMsg({ ok: false, text: r.error });
  }

  if (teams.length === 0) return <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีทีมขาย — สร้างทีมที่ ตั้งค่า → ทีม ก่อน แล้วค่อยผูกห้องแชท</p>;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {rooms.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีห้องในระบบแชททีมที่คุณเลือกได้ — เปิดระบบแชททีมแล้วสร้างห้อง (หรือเข้าร่วมห้อง) ก่อน</p>
      ) : (
        <form
          className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void save(channelId || null);
          }}
          data-testid="crm-settings-team-room"
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            <span className="text-[color:var(--color-muted)]">ทีม</span>
            <select
              className="input text-sm"
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setChannelId(pickable(map[e.target.value]?.channelId));
              }}
              data-testid="crm-settings-team-room-team"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            <span className="text-[color:var(--color-muted)]">ห้องแชทของทีม</span>
            <select className="input text-sm" value={channelId} onChange={(e) => setChannelId(e.target.value)} data-testid="crm-settings-team-room-channel">
              <option value="">— ไม่ผูกห้อง —</option>
              {rooms.map((r) => (
                <option key={r.channelId} value={r.channelId}>
                  {r.systemName} · #{r.channelName}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={busy} data-testid="crm-settings-team-room-save">
            บันทึก
          </button>
        </form>
      )}
      {msg && (
        <p role="status" className={`text-xs ${msg.ok ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-danger)]"}`}>
          {msg.text}
        </p>
      )}
      <ul className="flex min-w-0 flex-col divide-y text-sm">
        {teams
          .filter((t) => map[t.id])
          .map((t) => (
            <li key={t.id} className="flex min-w-0 items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">
                <b>{t.name}</b> → {roomName(map[t.id]!.channelId)}
              </span>
              <button type="button" className="btn btn-ghost btn-sm shrink-0" disabled={busy} onClick={() => void save(null, t.id)} data-testid={`crm-settings-team-room-remove-${t.id}`}>
                เลิกผูก
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
