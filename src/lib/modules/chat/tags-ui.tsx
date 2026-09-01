// tags-ui.tsx — ชิปป้ายกำกับห้องแชท (WO-CV6 · แบบร่าง `.tag` ในคอลัมน์ขวาของ ref-desktop.png)
//
// 🔴 ไอคอนมาจากทะเบียนเดียว `chat/icons.tsx` เท่านั้น — ห้าม emoji (มติเจ้าของ V2)
// 🔴 หน้าตาอิงแบบร่าง: ชิปมุม 8px พื้น --surface2 ตัวอักษร 11.5px + ไอคอน `tag`
//    ปุ่มเพิ่มเป็นชิปสีจาง + ไอคอน `plus` (ตามที่แบบร่างวาดไว้ทุกประการ)
//
// ⚠️ คอมโพเนนต์นี้ **ยังไม่ถูกวางในหน้าจอห้องแชท** เพราะไฟล์ที่วาดห้อง (`inbox-client.tsx`)
//    และคอลัมน์บริบท (WO-CV7) เป็นของสายอื่นในรอบถัดไป — ส่งต่อเป็นสัญญาให้สาย E/F มาวาง
//    (ดูลายเซ็นที่ต้องใช้ด้านล่าง · action อยู่ใน `quick-reply-actions.ts`)

import { SubmitButton } from "@/components/ui/SubmitButton";
import { Icon } from "./icons";
import { TAG_MAX_LEN, TAG_MAX_PER_CONVERSATION, listSystemTags } from "./labels";
import { requireChatRead } from "./guard";
import { addConversationTagAction, removeConversationTagAction } from "./quick-reply-actions";

/** ชิปป้าย 1 ใบ (อ่านอย่างเดียว) — ใช้ได้ทั้งในรายการห้องและคอลัมน์บริบท */
export function TagChip({ tag }: { tag: string }) {
  return (
    <span className="mb-1 mr-1 inline-flex items-center gap-1 rounded-lg bg-[color:var(--color-surface-2)] px-2 py-1 text-[11.5px] text-[color:var(--color-ink-soft)]">
      <Icon name="tag" size="sm" />
      {tag}
    </span>
  );
}

/**
 * ป้ายกำกับของห้อง + ฟอร์มติด/ถอด
 *
 * `tags` ส่งมาจากผู้เรียก (ห้องถูกโหลดอยู่แล้วในหน้าจอนั้น — ไม่ต้องยิง query ซ้ำ)
 * `suggestions` = ป้ายที่ร้านใช้อยู่ (จาก `listSystemTags`) เพื่อกันคนสะกดคนละแบบจนกลายเป็นคนละป้าย
 */
export function ConversationTags({
  systemId,
  conversationId,
  tags,
  canEdit = false,
  suggestions = [],
}: {
  systemId: string;
  conversationId: string;
  tags: string[];
  canEdit?: boolean;
  suggestions?: string[];
}) {
  const full = tags.length >= TAG_MAX_PER_CONVERSATION;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center">
        {tags.length === 0 ? (
          <span className="text-xs text-[color:var(--color-muted)]">ยังไม่มีป้ายกำกับ</span>
        ) : (
          tags.map((t) =>
            canEdit ? (
              <form key={t} action={removeConversationTagAction} className="mb-1 mr-1 inline-flex">
                <input type="hidden" name="systemId" value={systemId} />
                <input type="hidden" name="conversationId" value={conversationId} />
                <input type="hidden" name="tag" value={t} />
                <button
                  type="submit"
                  title={`ถอดป้าย ${t}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--color-surface-2)] px-2 py-1 text-[11.5px] text-[color:var(--color-ink-soft)]"
                >
                  <Icon name="tag" size="sm" />
                  {t}
                  <Icon name="x" size="sm" />
                </button>
              </form>
            ) : (
              <TagChip key={t} tag={t} />
            ),
          )
        )}
      </div>

      {canEdit ? (
        <form action={addConversationTagAction} className="flex items-center gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="conversationId" value={conversationId} />
          <input
            name="tag"
            required
            maxLength={TAG_MAX_LEN}
            list={`tags-${conversationId}`}
            placeholder={full ? `ครบ ${TAG_MAX_PER_CONVERSATION} ป้ายแล้ว` : "เพิ่มป้าย เช่น รอโอนมัดจำ"}
            disabled={full}
            className="input flex-1 text-xs"
          />
          <datalist id={`tags-${conversationId}`}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {!full ? (
            <SubmitButton variant="ghost" pendingText="กำลังติด…">
              <span className="inline-flex items-center gap-1">
                <Icon name="plus" size="sm" />
                เพิ่ม
              </span>
            </SubmitButton>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

/**
 * การ์ด "ป้ายกำกับที่ทีมใช้อยู่" ในหน้า "เชื่อมช่องทาง"
 * 🔴 มีไว้เพื่อให้เจ้าของเห็นว่าป้ายบานปลาย/สะกดเพี้ยนหรือยัง — ป้ายที่ใช้ครั้งเดียวเยอะ ๆ
 *    คือสัญญาณว่าทีมพิมพ์กันคนละแบบ (ตอนนั้นค่อยตกลงชื่อมาตรฐานกัน)
 */
export async function ChatTagsOverview({
  systemId,
  tenantId,
}: {
  systemId: string;
  tenantId: string;
}) {
  await requireChatRead(); // fail-closed ที่ตัวเอง ไม่พึ่งคอมโพเนนต์พี่น้อง
  const tags = await listSystemTags({ tenantId, systemId });
  return (
    <div className="card">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Icon name="tag" size="sm" />
        ป้ายกำกับที่ทีมใช้อยู่
      </h2>
      <p className="mt-1 text-xs text-[color:var(--color-muted)]">
        ป้ายกำกับติด/ถอดได้ที่ห้องแชทแต่ละห้อง · หน้านี้รวมให้ดูว่าตอนนี้ร้านใช้ป้ายอะไรกันบ้าง
        (ติดได้ห้องละไม่เกิน {TAG_MAX_PER_CONVERSATION} ป้าย ป้ายละไม่เกิน {TAG_MAX_LEN} ตัวอักษร)
      </p>
      {tags.length === 0 ? (
        <p className="mt-3 text-xs text-[color:var(--color-muted)]">
          ยังไม่มีห้องไหนถูกติดป้าย — เปิดห้องแชทแล้วติดป้ายจากคอลัมน์ข้อมูลลูกค้าได้เลย
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center">
          {tags.map((t) => (
            <span
              key={t.tag}
              className="mb-1 mr-1 inline-flex items-center gap-1 rounded-lg bg-[color:var(--color-surface-2)] px-2 py-1 text-[11.5px] text-[color:var(--color-ink-soft)]"
            >
              <Icon name="tag" size="sm" />
              {t.tag}
              <span className="text-[color:var(--color-muted)]">{t.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
