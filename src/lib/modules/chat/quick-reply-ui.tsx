// quick-reply-ui.tsx — หน้าจัดการ "คำตอบสำเร็จรูป" ในหน้า "เชื่อมช่องทาง" (WO-CV6)
//
// 🔴 ของที่คนแก้ไม่ได้ = ของที่เน่าแล้วซ่อมไม่ได้
//    คลังคำตอบเก็บ "เลขบัญชี · ราคา · เงื่อนไข" ซึ่งเปลี่ยนทุกไตรมาส ⇒ ถ้าเพิ่ม/แก้/ถอดเองไม่ได้
//    ทีมจะเลิกใช้แล้วกลับไปพิมพ์มือ (หรือแย่กว่านั้น: ส่งราคาเก่าให้ลูกค้าต่อไปเรื่อย ๆ)
//
// ⚠️ ทั้งหมดเป็น server component + ฟอร์มธรรมดา — ไม่มี JS ฝั่งเบราว์เซอร์
//    การแก้จึงใช้ `<details>` เปิดฟอร์มในแถว ไม่ใช่ modal ที่ต้องมี state ฝั่ง client

import { evaluate } from "@/lib/core/rbac";
import { SubmitButton } from "@/components/ui/SubmitButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Icon } from "./icons";
import { CHANNEL_ORDER, CHANNEL_META } from "./channel-icon";
import { membershipOf, requireChatRead } from "./guard";
import {
  listQuickReplies,
  QUICK_REPLY_VARS,
  QR_BODY_MAX,
  QR_SHORTCUT_MAX,
  QR_TITLE_MAX,
  type QuickReplyRow,
} from "./quick-reply";
import {
  createQuickReplyAction,
  updateQuickReplyAction,
  archiveQuickReplyAction,
  restoreQuickReplyAction,
} from "./quick-reply-actions";

const VAR_HINT = QUICK_REPLY_VARS.map((v) => `{{${v.key}}} = ${v.label}`).join(" · ");

/** ช่องทางที่ติ๊กได้ + คำอธิบายว่าไม่ติ๊กเลยแปลว่าอะไร */
function ChannelPicker({ selected }: { selected: string[] }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-xs text-[color:var(--color-muted)]">
        ใช้กับช่องทาง (ไม่ติ๊กเลย = ใช้ได้ทุกช่องทาง)
      </legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {CHANNEL_ORDER.map((type) => (
          <label key={type} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              name="channelTypes"
              value={type}
              defaultChecked={selected.includes(type)}
            />
            {CHANNEL_META[type].label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Fields({ row }: { row?: QuickReplyRow }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ทางลัด (พิมพ์ / แล้วตามด้วยคำนี้ในกล่องแชท)
          <input
            name="shortcut"
            required
            maxLength={QR_SHORTCUT_MAX}
            defaultValue={row?.shortcut ?? ""}
            placeholder="ราคา"
            className="input"
          />
        </label>
        <label className="flex flex-[2] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          หัวเรื่อง (ทีมเห็นในเมนูตอนเลือก)
          <input
            name="title"
            required
            maxLength={QR_TITLE_MAX}
            defaultValue={row?.title ?? ""}
            placeholder="ราคาทริปสิมิลัน 3 วัน 2 คืน"
            className="input"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        เนื้อความที่จะส่งให้ลูกค้า
        <textarea
          name="body"
          required
          rows={4}
          maxLength={QR_BODY_MAX}
          defaultValue={row?.body ?? ""}
          placeholder="สวัสดีค่ะ {{contact.name}} ทริปสิมิลัน 3 วัน 2 คืน ราคา…"
          className="input"
        />
      </label>
      <p className="text-xs text-[color:var(--color-muted)]">
        ใส่ตัวแปรได้: {VAR_HINT} · ตัวแปรที่ไม่มีค่าจะถูกแทนด้วยคำกลาง ๆ
        (เช่น “คุณลูกค้า”) เพื่อไม่ให้ประโยคมีช่องว่าง · ตัวแปรที่ระบบไม่รู้จักจะบันทึกไม่ผ่าน
      </p>
      <ChannelPicker selected={row?.channelTypes ?? []} />
    </>
  );
}

export async function ChatQuickReplySection({
  systemId,
  tenantId,
  err,
}: {
  systemId: string;
  tenantId: string;
  /** ข้อความผิดพลาดจาก `?err=` — แสดง inline ในการ์ด ไม่ใช่ Alert */
  err?: string;
}) {
  // ด่านขาอ่านเดียวกับกล่องแชท — ไม่พึ่งว่าคอมโพเนนต์พี่น้องจะ throw ให้ก่อน (fail-closed ที่ตัวเอง)
  const auth = await requireChatRead();
  const canManage = evaluate(membershipOf(auth), { module: "chat", action: "chat.quickreply.manage" });
  const rows = await listQuickReplies({ tenantId, systemId, includeArchived: true, take: 100 });
  const live = rows.filter((r) => !r.archivedAt);
  const archived = rows.filter((r) => r.archivedAt);

  return (
    // จุดยึดของลิงก์ "คำตอบสำเร็จรูป" ในเมนู ⋮ ของกล่องแชท (WO-CV12) — หน้านี้ยาว ต้องพาลงมาถึงคลังจริง
    <div id="quick-replies" className="card scroll-mt-20">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Icon name="quick" size="sm" />
        คำตอบสำเร็จรูป
      </h2>
      <p className="mt-1 text-xs text-[color:var(--color-muted)]">
        ข้อความที่ทีมต้องพิมพ์ซ้ำทุกวัน (ราคา · เลขบัญชี · เวลาเรือออก) เก็บไว้ที่นี่แล้วเรียกใช้ใน
        กล่องแชทด้วยการพิมพ์ <b>/</b> ตามด้วยทางลัด · ระบบเติมชื่อลูกค้า/ชื่อคนตอบให้อัตโนมัติ
        และ <b>ยังไม่ส่งทันที</b> — ทีมได้อ่านและแก้ก่อนกดส่งเสมอ
      </p>

      {err ? (
        <p className="mt-3 rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-xs text-[color:var(--color-danger)]">
          {err}
        </p>
      ) : null}

      {!canManage ? (
        <p className="mt-3 text-xs text-[color:var(--color-muted)]">
          คุณดูคลังนี้ได้ แต่การเพิ่ม/แก้/ถอดต้องมีสิทธิ์ “จัดการคลังคำตอบสำเร็จรูป”
          — เพราะข้อความในนี้ถูกส่งซ้ำโดยทุกคนในร้าน
        </p>
      ) : null}

      {/* ── รายการที่ใช้อยู่ ── */}
      {live.length === 0 ? (
        <p className="mt-3 text-xs text-[color:var(--color-muted)]">
          ยังไม่มีคำตอบสำเร็จรูปในคลัง — เพิ่มอันแรกจากฟอร์มด้านล่างได้เลย
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {live.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Icon name="quick" size="sm" />/{r.shortcut}
                </span>
                <span className="text-[color:var(--color-muted)]">ถูกใช้ {r.usageCount} ครั้ง</span>
              </div>
              <div>{r.title}</div>
              <div className="whitespace-pre-wrap break-words text-[color:var(--color-muted)]">{r.body}</div>
              <div className="text-[color:var(--color-muted)]">
                {r.channelTypes.length === 0
                  ? "ใช้ได้ทุกช่องทาง"
                  : `เฉพาะ ${r.channelTypes.map((c) => CHANNEL_META[c as keyof typeof CHANNEL_META]?.label ?? c).join(" · ")}`}
              </div>

              {canManage ? (
                <div className="flex items-center gap-3">
                  <details className="flex-1">
                    <summary className="cursor-pointer text-[color:var(--color-accent)]">แก้ไข</summary>
                    <form action={updateQuickReplyAction} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="quickReplyId" value={r.id} />
                      <Fields row={r} />
                      <SubmitButton variant="ghost" pendingText="กำลังบันทึก…">
                        บันทึกการแก้ไข
                      </SubmitButton>
                    </form>
                  </details>
                  <ConfirmDialog
                    triggerLabel="ถอดออก"
                    triggerClassName="self-start text-xs text-[color:var(--color-danger)] underline"
                    title="ถอดคำตอบสำเร็จรูปนี้ออก?"
                    detail="ทีมจะไม่เห็นในเมนู / อีก · ข้อความที่เคยส่งไปแล้วไม่เปลี่ยน และเอากลับมาใช้ใหม่ได้ทีหลัง"
                    confirmLabel="ยืนยันถอด"
                    danger
                    action={archiveQuickReplyAction}
                    fields={{ systemId, quickReplyId: r.id }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* ── ของที่ถอดไว้ (ยังอยู่ให้ตรวจย้อน + เอากลับมาได้) ── */}
      {archived.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-[color:var(--color-muted)]">
            ถอดออกแล้ว {archived.length} รายการ
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {archived.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs opacity-70"
              >
                <span>
                  /{r.shortcut} · {r.title}
                </span>
                {canManage ? (
                  <form action={restoreQuickReplyAction}>
                    <input type="hidden" name="systemId" value={systemId} />
                    <input type="hidden" name="quickReplyId" value={r.id} />
                    <SubmitButton variant="ghost" pendingText="กำลังเอากลับ…">
                      เอากลับมาใช้
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* ── เพิ่มใหม่ ── */}
      {canManage ? (
        <form action={createQuickReplyAction} className="mt-4 flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-medium">เพิ่มคำตอบสำเร็จรูป</h3>
          <input type="hidden" name="systemId" value={systemId} />
          <Fields />
          <SubmitButton pendingText="กำลังเพิ่ม…">เพิ่มเข้าคลัง</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
