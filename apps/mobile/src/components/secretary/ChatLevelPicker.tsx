// แชทลูกค้า 3 ระดับ ไม่เห็น/ดูได้/ตอบได้ (NONE/VIEW/REPLY · ใบ S2.21 G2 · S2.22 G3) — UI อย่างเดียว
// คีย์ของแต่ละระดับอยู่ที่ LevelGrid.tsx (CHAT_KEYS · ที่เดียวของการแปลงระดับ → คีย์) · เซิร์ฟเวอร์ใช้ CHAT_LEVELS ชุดเดียวกัน (R-S1.25h)
// testID: `<testID>` การ์ด · `<testID>-<NONE|VIEW|REPLY>` ปุ่ม
import { CHAT_LEVELS, type ChatLevel } from "@/src/api/secretary";
import { Glass } from "@/src/components/airy";
import { LevelButtons, SysHead } from "@/src/components/secretary/LevelGrid";
import { useT, type I18nKey } from "@/src/i18n";
import { radii } from "@/src/theme/tokens";

const LABEL: Record<ChatLevel, I18nKey> = { NONE: "perm.chat.NONE", VIEW: "perm.chat.VIEW", REPLY: "perm.chat.REPLY" };

export function ChatLevelPicker({
  testID,
  value,
  onChange,
  hint,
  disabled = false,
}: {
  testID: string;
  value: ChatLevel;
  onChange?: (v: ChatLevel) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <Glass testID={testID} radius={radii.sugg} pad={{ v: 12, h: 14 }}>
      <SysHead module="chat" hint={hint} />
      <LevelButtons testID={testID} options={CHAT_LEVELS.map((k) => ({ key: k, label: t(LABEL[k]) }))} value={value} disabled={disabled} onChange={onChange} />
    </Glass>
  );
}
