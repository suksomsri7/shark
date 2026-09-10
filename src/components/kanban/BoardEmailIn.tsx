// BoardEmailIn.tsx — บล็อก "อีเมลเข้าบอร์ด" ในตั้งค่าบอร์ด › ทั่วไป (K3.9 · สัญญา §K3.9)
// ⚠️ ห้ามอีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon>
//
// 🔴 ที่อยู่ที่โชว์ในนี้คือ "สิทธิ์เขียนที่ส่งต่อกันได้": ใครมีที่อยู่นี้ก็ส่งการ์ดเข้าบอร์ดได้
//    ⇒ จอต้องพูดตรง ๆ ทั้งสองอย่าง — เอาไว้ทำอะไร และทำไมต้องระวังคนที่เห็นมัน
// 🔴 ปุ่มหมุนที่อยู่ต้องบอกผลก่อนกด ("ของเก่าใช้ไม่ได้") ไม่ใช่บอกทีหลังตอนอีเมลของทีมเริ่มเด้งกลับ
"use client";

import { useState, useTransition } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { ensureEmailKeyAction, rotateEmailKeyAction } from "@/lib/modules/kanban/actions";

export function BoardEmailIn({
  systemId,
  boardId,
  initialAddress,
  switchOn,
}: {
  systemId: string;
  boardId: string;
  /** ที่อยู่ปัจจุบันของบอร์ด — `null` = ยังไม่เคยเปิด (ไม่สร้างให้เองแค่เพราะเปิดหน้าดู) */
  initialAddress: string | null;
  /** สวิตช์ "การ์ดจากอีเมล" ของระบบเปิดอยู่ไหม (ปิดอยู่ = ที่อยู่ยังไม่ทำงาน — ต้องบอกให้รู้) */
  switchOn: boolean;
}) {
  const [address, setAddress] = useState<string | null>(initialAddress);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<{ ok: true; address: string } | { ok: false; message: string }>) => {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setErr(res.message);
        return;
      }
      setAddress(res.address);
      setCopied(false);
    });
  };

  return (
    <section data-testid="board-email-in" className="card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2">
        <KanbanIcon name="mail" className="mt-0.5 text-[color:var(--color-muted)]" />
        <div className="min-w-0">
          <h2 className="text-sm font-medium">อีเมลเข้าบอร์ด</h2>
          <p className="mt-0.5 text-[12.5px] leading-[1.55] text-[color:var(--color-muted)]">
            ส่งอีเมลไปที่อยู่ของบอร์ดนี้แล้วได้การ์ดใหม่ทันที — หัวข้ออีเมล = ชื่อการ์ด · เนื้อหา = รายละเอียด · ไฟล์แนบติดมาด้วย
          </p>
        </div>
      </div>

      {address ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-[13px]"
          style={{ borderColor: "var(--color-line)" }}
        >
          <span className="select-all break-all font-medium" data-testid="board-email-in-address">
            {address}
          </span>
          <button
            type="button"
            aria-label="คัดลอกที่อยู่อีเมลของบอร์ด"
            title={copied ? "คัดลอกแล้ว" : "คัดลอก"}
            data-testid="board-email-in-copy"
            className="rounded p-0.5 text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
            onClick={() => {
              void navigator.clipboard?.writeText(address).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => setCopied(false),
              );
            }}
          >
            <KanbanIcon name={copied ? "check" : "copy"} />
          </button>
          <span className="text-[11.5px] text-[color:var(--color-muted)]">{copied ? "คัดลอกแล้ว" : "คัดลอก"}</span>
        </div>
      ) : (
        <p className="text-[12.5px] text-[color:var(--color-muted)]">บอร์ดนี้ยังไม่มีที่อยู่อีเมล — กดปุ่มด้านล่างเพื่อเปิดใช้</p>
      )}

      <div className="flex flex-wrap gap-2">
        {address === null ? (
          <button
            type="button"
            data-testid="board-email-in-create"
            disabled={busy}
            className="btn btn-primary self-start text-sm"
            onClick={() => run(() => ensureEmailKeyAction({ systemId, boardId }))}
          >
            เปิดที่อยู่อีเมลของบอร์ด
          </button>
        ) : (
          <button
            type="button"
            data-testid="board-email-in-rotate"
            disabled={busy}
            className="btn btn-ghost self-start text-sm"
            onClick={() => run(() => rotateEmailKeyAction({ systemId, boardId }))}
          >
            สร้างที่อยู่ใหม่ (ของเก่าใช้ไม่ได้)
          </button>
        )}
      </div>

      {!switchOn && (
        <p className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-[12px] text-[color:var(--color-muted)]">
          สวิตช์ &ldquo;การ์ดจากอีเมล&rdquo; ยังปิดอยู่ — อีเมลที่ส่งมาจะยังไม่กลายเป็นการ์ด เปิดได้ที่ ตั้งค่าบอร์ดงาน › การเชื่อมต่อ
        </p>
      )}

      <p className="text-[11.5px] leading-[1.55] text-[color:var(--color-muted)]">
        ใครก็ตามที่รู้ที่อยู่นี้ส่งงานเข้าบอร์ดได้ — แชร์เฉพาะกับคนที่ควรลงงานให้ทีม · ถ้าหลุดออกไป กด
        &ldquo;สร้างที่อยู่ใหม่&rdquo; แล้วที่อยู่เดิมจะใช้ไม่ได้ทันที · ผู้ส่งที่เป็นพนักงานในร้านจะถูกตั้งเป็นผู้รับผิดชอบการ์ดให้เอง
      </p>

      {err && <p className="rounded-lg bg-[#fdeceb] px-3 py-2 text-[12.5px] text-[#b42318]">{err}</p>}
    </section>
  );
}

export default BoardEmailIn;
