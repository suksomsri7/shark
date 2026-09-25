"use client";

// CrmNotificationsManager.tsx — หน้าตั้งค่าการแจ้งเตือนของ CRM v2 (ใบ C2.10 · พิมพ์เขียว §7.4 · มติ C22)
//   แท็บ "ของร้าน" = เทมเพลต 10 เรื่อง × 3 ช่องทาง + ช่วงห้ามรบกวน + ชั่วโมงส่งสรุป (คีย์ `crm.settings.manage`)
//   แท็บ "ของฉัน"  = ทับค่าร้านเป็นรายคน + ช่วงห้ามรบกวนของตัวเอง (พนักงานทุกคนตั้งได้ ไม่ต้องมีคีย์)
//
// 🔴 ไฟล์ client: ไม่ import โมดูลที่ถึง prisma — ข้อมูล/ตัวบันทึกมาทาง props (server action) ทั้งหมด (F2.3)
// 🔴 ตรวจค่าแบบ inline ใต้ช่อง ไม่ใช่ alert() · ข้อความไม่โทษผู้ใช้
// 🔴 390 px: ตารางเทมเพลตกลายเป็นการ์ดต่อเรื่อง (ไม่มีตารางที่ล้นแนวนอน)

import { useState, useTransition } from "react";
import type { CrmNotifyActions, CrmNotifyChannelKey, CrmNotifyPageData, CrmNotifyQuiet, CrmNotifyTemplateRow } from "./types";

const muted = "text-[color:var(--color-muted)]";
const HM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

type Tab = "shop" | "mine";

export function CrmNotificationsManager({ data, actions }: { data: CrmNotifyPageData; actions: CrmNotifyActions }) {
  const [tab, setTab] = useState<Tab>(data.canManageShop ? "shop" : "mine");
  const [rows, setRows] = useState<CrmNotifyTemplateRow[]>(data.templates);
  const [shopQuiet, setShopQuiet] = useState<CrmNotifyQuiet>(data.shopQuiet);
  const [digestHour, setDigestHour] = useState<string>(String(data.digestHour));
  const [myQuiet, setMyQuiet] = useState<CrmNotifyQuiet>(data.myQuiet ?? { enabled: false, from: "21:00", to: "07:00" });
  const [myQuietOwn, setMyQuietOwn] = useState<boolean>(data.myQuiet !== null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { kind: "ok", text: okText } : { kind: "error", text: res.error });
    });

  const toggle = (row: CrmNotifyTemplateRow, c: CrmNotifyChannelKey, on: boolean, mine: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key !== row.key ? r : mine ? { ...r, mine: { ...r.mine, [c]: on } } : { ...r, channels: { ...r.channels, [c]: on } },
      ),
    );
    run(
      () => (mine ? actions.setMyChannel(data.systemId, row.key, c, on) : actions.setChannel(data.systemId, row.key, c, on)),
      mine ? "บันทึกค่าของคุณแล้ว" : "บันทึกค่าของร้านแล้ว",
    );
  };

  const saveShop = () => {
    if (!HM.test(shopQuiet.from) || !HM.test(shopQuiet.to)) {
      setMsg({ kind: "error", text: "เวลาช่วงห้ามรบกวนต้องอยู่ในรูป ชั่วโมง:นาที แบบ 24 ชั่วโมง เช่น 21:00 หรือ 07:30" });
      return;
    }
    const h = Number(digestHour);
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      setMsg({ kind: "error", text: "ชั่วโมงที่ส่งสรุปต้องเป็นเลข 0–23 (เวลาไทย) — เช่น 8 คือ 08:00 น." });
      return;
    }
    run(() => actions.setShop(data.systemId, { quietHours: shopQuiet, digestHour: h }), "บันทึกค่าของร้านแล้ว");
  };

  const saveMine = () => {
    if (myQuietOwn && (!HM.test(myQuiet.from) || !HM.test(myQuiet.to))) {
      setMsg({ kind: "error", text: "เวลาช่วงห้ามรบกวนของคุณต้องอยู่ในรูป ชั่วโมง:นาที แบบ 24 ชั่วโมง เช่น 21:00" });
      return;
    }
    run(() => actions.setMyQuiet(data.systemId, { quietHours: myQuietOwn ? myQuiet : null }), "บันทึกค่าของคุณแล้ว");
  };

  const tabBtn = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm ${active ? "border-[color:var(--color-ink)] font-semibold" : muted}`;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-notify-page">
      <div className="flex min-w-0 flex-wrap gap-2">
        {data.canManageShop && (
          <button type="button" className={tabBtn(tab === "shop")} onClick={() => setTab("shop")} data-testid="crm-notify-tab-shop">
            ของร้าน
          </button>
        )}
        <button type="button" className={tabBtn(tab === "mine")} onClick={() => setTab("mine")} data-testid="crm-notify-tab-mine">
          ของฉัน
        </button>
      </div>

      {msg && (
        <p
          className={`text-sm ${msg.kind === "ok" ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-danger)]"}`}
          data-testid="crm-notify-msg"
        >
          {msg.text}
        </p>
      )}

      <section className="card flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{tab === "shop" ? "เรื่องที่แจ้งเตือน (ค่าของร้าน)" : "เรื่องที่แจ้งเตือน (ของฉัน)"}</h2>
          <p className={`text-xs ${muted}`}>
            {tab === "shop"
              ? "ค่าที่ตั้งที่นี่เป็นค่าเริ่มต้นของทุกคนในร้าน — แต่ละคนเปิด/ปิดของตัวเองทับได้ที่แท็บ “ของฉัน”"
              : "ค่าของคุณชนะค่าของร้าน — ช่องที่ยังไม่แตะจะตามค่าของร้านไปเรื่อย ๆ"}
          </p>
        </div>
        <ul className="flex min-w-0 flex-col divide-y">
          {rows.map((r) => {
            const rowId = r.key;
            return (
              <li key={r.key} className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`crm-notify-template-row-${rowId}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.label}</span>
                  <span className={`block truncate text-xs ${muted}`}>
                    {r.digest ? "สรุปรวมวันละครั้ง" : "แจ้งทันทีเมื่อเกิดเรื่อง"} · ผู้รับ: {r.recipients}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap gap-3">
                  {data.channels.map((c) => {
                    const cid = `${r.key}-${c.key}`;
                    const shopOn = r.channels[c.key];
                    const mineVal = r.mine[c.key];
                    const on = tab === "shop" ? shopOn : (mineVal ?? shopOn);
                    // 🔴 เขียนแยกสองช่อง (ไม่ใช่ testid แบบเงื่อนไข): ด่าน F14.1 อ่าน `data-testid` จากโค้ดตรง ๆ
                    //    ค่าที่มาจาก ternary = "อ่านไม่ออก" ⇒ ลงทะเบียนไม่ได้ และช่องกรอกที่ไม่มีแถวทะเบียนคือของต้องห้าม
                    return (
                      <label key={c.key} className="flex items-center gap-1.5 text-xs">
                        {tab === "shop" ? (
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={pending}
                            onChange={(e) => toggle(r, c.key, e.target.checked, false)}
                            data-testid={`crm-notify-channel-${cid}`}
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={pending}
                            onChange={(e) => toggle(r, c.key, e.target.checked, true)}
                            data-testid={`crm-notify-my-channel-${cid}`}
                          />
                        )}
                        <span>{c.label}</span>
                      </label>
                    );
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {tab === "shop" ? (
        <section className="card flex min-w-0 flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">ช่วงห้ามรบกวนของร้าน</h2>
            <p className={`text-xs ${muted}`}>
              ในช่วงนี้ระบบยังเก็บเรื่องไว้ในกล่องแจ้งเตือน แต่ไม่เด้งมือถือและไม่ส่งอีเมล — ของที่ค้างจะถูกส่งให้หลังพ้นช่วงโดยอัตโนมัติ (ไม่มีอะไรหาย)
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shopQuiet.enabled} onChange={(e) => setShopQuiet({ ...shopQuiet, enabled: e.target.checked })} data-testid="crm-notify-quiet-enabled" />
            <span>เปิดใช้ช่วงห้ามรบกวน</span>
          </label>
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span>ตั้งแต่</span>
              <input
                className="w-24 rounded-lg border px-2 py-1 text-sm tabular-nums"
                value={shopQuiet.from}
                onChange={(e) => setShopQuiet({ ...shopQuiet, from: e.target.value })}
                placeholder="21:00"
                data-testid="crm-notify-quiet-from"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span>ถึง</span>
              <input
                className="w-24 rounded-lg border px-2 py-1 text-sm tabular-nums"
                value={shopQuiet.to}
                onChange={(e) => setShopQuiet({ ...shopQuiet, to: e.target.value })}
                placeholder="07:00"
                data-testid="crm-notify-quiet-to"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span>ส่งสรุปรายวันเวลา (นาฬิกาไทย)</span>
              <input
                className="w-24 rounded-lg border px-2 py-1 text-sm tabular-nums"
                value={digestHour}
                onChange={(e) => setDigestHour(e.target.value)}
                placeholder="8"
                data-testid="crm-notify-digest-hour"
              />
            </label>
            <button type="button" className="btn" onClick={saveShop} disabled={pending} data-testid="crm-notify-save">
              บันทึก
            </button>
          </div>
        </section>
      ) : (
        <section className="card flex min-w-0 flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">ช่วงห้ามรบกวนของฉัน</h2>
            <p className={`text-xs ${muted}`}>ถ้าคุณตั้งช่วงของตัวเอง ระบบจะใช้ของคุณแทนของร้าน — ของที่ค้างยังถูกส่งให้หลังพ้นช่วงเหมือนเดิม</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={myQuietOwn} onChange={(e) => setMyQuietOwn(e.target.checked)} data-testid="crm-notify-my-quiet-own" />
            <span>ใช้ช่วงห้ามรบกวนของฉันเอง</span>
          </label>
          {myQuietOwn && (
            <div className="flex min-w-0 flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={myQuiet.enabled} onChange={(e) => setMyQuiet({ ...myQuiet, enabled: e.target.checked })} data-testid="crm-notify-my-quiet-enabled" />
                <span>เปิดใช้</span>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span>ตั้งแต่</span>
                <input
                  className="w-24 rounded-lg border px-2 py-1 text-sm tabular-nums"
                  value={myQuiet.from}
                  onChange={(e) => setMyQuiet({ ...myQuiet, from: e.target.value })}
                  placeholder="21:00"
                  data-testid="crm-notify-my-quiet-from"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span>ถึง</span>
                <input
                  className="w-24 rounded-lg border px-2 py-1 text-sm tabular-nums"
                  value={myQuiet.to}
                  onChange={(e) => setMyQuiet({ ...myQuiet, to: e.target.value })}
                  placeholder="07:00"
                  data-testid="crm-notify-my-quiet-to"
                />
              </label>
            </div>
          )}
          <div>
            <button type="button" className="btn" onClick={saveMine} disabled={pending} data-testid="crm-notify-my-save">
              บันทึกค่าของฉัน
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
