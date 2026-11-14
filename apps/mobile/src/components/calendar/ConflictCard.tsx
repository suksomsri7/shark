// การ์ดนัดชน (CAL2.12 · แบบ cal-3.png จอ 10 · สัญญา §11) — ข้อความ ⚠️ ของเลขา + ปุ่ม เตือนเลย / ไม่ต้อง
//   เตือนเลย = POST calendar/items { kind REMINDER, title "ออกไป<title ของนัดหลัง>", startAt suggestRemindAt, origin "conflict" } (source SUGGEST)
//   ไม่ต้อง = จำ key ในเครื่อง (ไม่ส่งเซิร์ฟเวอร์) · suggestRemindAt = null (นัดเริ่มแล้ว) ⇒ ไม่มีปุ่มเตือนเลย
//   รวมนัดในเครื่อง: จอคำนวณคู่ที่มี device ด้วย src/lib/cal-conflicts.ts (สำเนาของ conflicts.ts ฝั่งเซิร์ฟเวอร์)
import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Text } from "@/src/components/ui/text";
import type { ConflictNote } from "@/src/api/calendar";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { calCard } from "./style";

// ───────── "ไม่ต้อง" ที่จำในเครื่อง (≤ 200 key ล่าสุด) ─────────
const SKIP_KEY = "cal_conflict_skip";
let skipped: Set<string> | null = null;
export async function loadSkipped(): Promise<Set<string>> {
  if (skipped) return skipped;
  try {
    const raw = Platform.OS === "web" ? (typeof localStorage === "undefined" ? null : localStorage.getItem(SKIP_KEY)) : await SecureStore.getItemAsync(SKIP_KEY);
    skipped = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    skipped = new Set();
  }
  return skipped;
}
export function skipConflict(key: string): void {
  const s = skipped ?? new Set<string>();
  s.add(key);
  skipped = new Set([...s].slice(-200));
  const raw = JSON.stringify([...skipped]);
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(SKIP_KEY, raw);
    } else void SecureStore.setItemAsync(SKIP_KEY, raw).catch(() => {});
  } catch {
    /* จำในหน่วยความจำต่อ */
  }
}

export function ConflictCard({ note, onRemind, onSkip }: { note: ConflictNote; onRemind: (n: ConflictNote) => Promise<void>; onSkip: (n: ConflictNote) => void }) {
  const { c } = useTheme();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const id = `cal-conflict-${note.key}`;
  return (
    <View testID={id} style={[calCard(c, 20), styles.card]}>
      <Text style={[styles.t, { color: c.text }]}>{note.text}</Text>
      <View style={styles.row}>
        {note.suggestRemindAt ? (
          <Pressable
            testID={`${id}-remind`}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void onRemind(note).finally(() => setBusy(false));
            }}
            style={[styles.btn, { backgroundColor: c.accent }, busy && styles.busy]}
          >
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t("cal.conflict.remind")}</Text>
          </Pressable>
        ) : null}
        <Pressable testID={`${id}-skip`} accessibilityRole="button" onPress={() => onSkip(note)} style={[styles.btn, { backgroundColor: c.chip.bg }]}>
          <Text style={[styles.btnT, { color: c.text }]}>{t("cal.conflict.skip")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 16 },
  t: { fontSize: 14, lineHeight: 21 },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 14 },
  btnT: { fontSize: 14, fontWeight: "700" },
  busy: { opacity: 0.6 },
});
