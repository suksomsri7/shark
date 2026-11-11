// ระดับสิทธิ์ต่อระบบ ปิด/ดู/ใช้งาน (ใบ S2.21 G2 · S2.22 G3 · แบบ sec-g.jpg หน้า 2–3)
//   S2.14 (§V ตั๋ว server → S1.14b): แอปไม่แปลง ระดับ → คีย์สิทธิ์ อีกแล้ว — G2 (POST staff/invite) และ G3 (PUT staff/[membershipId])
//     ส่ง `levels` + `chat` ตรง ๆ · เซิร์ฟเวอร์แปลงเอง (`permissionsForLevel` · `permissionsForChat`) และปฏิเสธคีย์อ่อนไหว (`sensitive_key`)
//   ตารางที่เหลือ LEVELS_OF = "ระดับที่โมดูลมี" อย่างเดียว (สำเนาของ `levelsAvailableFor` · src/lib/staff/levels.ts · R-S1.25e/f/g)
//     ใช้แสดงเฉพาะปุ่มระดับที่มี + ล็อกโมดูลที่มีแต่ปิด · O = ปิด · V = ดู · U = ใช้งาน · ส่งระดับที่โมดูลไม่มี = server ตอบ 422 bad_level
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Glass, Icon } from "@/src/components/airy";
import { sysColor, sysLabelKey, sysShortKey } from "@/src/components/secretary/sys";
import { useT, type I18nKey } from "@/src/i18n";
import { shadow, useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";

export type ModuleLevel = "OFF" | "VIEW" | "USE";
export const MODULE_LEVELS: readonly ModuleLevel[] = ["OFF", "VIEW", "USE"];

/** ระดับที่โมดูลมี (= levelsAvailableFor ของเซิร์ฟเวอร์) */
const LEVELS_OF: Record<string, string> = {
  pos: "OVU",
  restaurant: "OU",
  shop: "OU",
  delivery: "OU",
  booking: "OVU",
  hotel: "OU",
  dorm: "OVU",
  queue: "OU",
  ticket: "OU",
  rental: "OU",
  clinic: "OU",
  school: "OU",
  member: "OVU",
  point: "O",
  reward: "OU",
  coupon: "OU",
  crm: "OVU",
  marketing: "OU",
  inventory: "OVU",
  hr: "OVU",
  account: "OVU",
  approval: "OU",
  kanban: "OVU",
  meeting: "OU",
  kb: "OU",
  forms: "OU",
  calendar: "OV",
  reports: "OU",
  dashboard: "OU",
  pages: "OU",
  ai: "OU",
  automation: "OU",
  settings: "O",
  payments: "O",
  systems: "O",
  system: "O",
  api: "O",
  webhook: "O",
  branding: "O",
  marketplace: "OU",
};

/** ระดับที่โมดูลนี้มีจริง (= levelsAvailableFor) · ไม่รู้จัก ⇒ [OFF] · แชท ⇒ [] (ใช้ ChatLevelPicker) */
export function levelsAvailable(module: string): ModuleLevel[] {
  if (module === "chat") return [];
  const row = LEVELS_OF[module];
  if (!row) return ["OFF"];
  return MODULE_LEVELS.filter((l) => row.includes(l[0]!));
}

/** โมดูลนี้ให้ได้แค่ "ปิด" (มีแต่คีย์อ่อนไหว) — แสดงเป็นแถวล็อก */
export function offOnly(module: string): boolean {
  const a = levelsAvailable(module);
  return a.length === 1 && a[0] === "OFF";
}

/** ระดับที่แสดงของโมดูล — ค่าจากเซิร์ฟเวอร์ที่โมดูลไม่มี ⇒ ปิด */
export function levelOf(levels: Record<string, string>, module: string): ModuleLevel {
  const v = levels[module];
  return v === "VIEW" || v === "USE" ? (levelsAvailable(module).includes(v) ? v : "OFF") : "OFF";
}

/** โมดูลที่แสดงในกริด: ระบบที่กิจการเปิด (GET secretary/access) + โมดูลที่คนนี้มีระดับอยู่แล้ว · ไม่มีแชท · เรียงตามที่มา */
export function gridModules(accessModules: readonly string[], current: Record<string, string> = {}): string[] {
  const out: string[] = [];
  const add = (m: string) => {
    if (m && m !== "chat" && LEVELS_OF[m] && !out.includes(m)) out.push(m);
  };
  accessModules.forEach(add);
  Object.entries(current).forEach(([m, l]) => l !== "OFF" && add(m));
  return out;
}

const LEVEL_LABEL: Record<ModuleLevel, I18nKey> = { OFF: "perm.level.OFF", VIEW: "perm.level.VIEW", USE: "perm.level.USE" };

/** แถวปุ่ม 3 ช่อง (ช่องที่เลือก = พื้นทึบ) — ใช้ร่วมกับ ChatLevelPicker */
export function LevelButtons<K extends string>({
  testID,
  options,
  value,
  onChange,
  disabled = false,
}: {
  testID: string;
  options: { key: K; label: string }[];
  value: K;
  onChange?: (k: K) => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.btns}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            testID={`${testID}-${o.key}`}
            key={o.key}
            disabled={disabled}
            onPress={() => onChange?.(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled }}
            style={[styles.btn, on ? [{ backgroundColor: c.accent }, shadow(c.tabShadow)] : { backgroundColor: c.seg.track }, disabled && !on && styles.dim]}
          >
            <Text style={[styles.btnT, { color: on ? c.onAccent : c.seg.fg }, on && styles.on]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** หัวแถวระบบ: ป้ายย่อสีระบบ + ชื่อ + คำอธิบายขวา */
export function SysHead({ module, hint }: { module: string; hint?: string }) {
  const { c } = useTheme();
  const t = useT();
  const lk = sysLabelKey(module);
  return (
    <View style={styles.head}>
      <View style={[styles.k, { backgroundColor: c.sys[sysColor(module)] }]}>
        <Text style={[styles.kt, { color: c.onSys }]} numberOfLines={1}>
          {t(sysShortKey(module))}
        </Text>
      </View>
      <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
        {lk ? t(lk) : module === "ai" ? t("perm.mod.ai") : module}
      </Text>
      {hint ? (
        <Text style={[styles.hint, { color: c.textMuted }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * กริดระดับต่อระบบ — แสดงเฉพาะระดับที่โมดูลมี (levelsAvailable) · โมดูลที่มีแต่ปิด = แถวล็อก (กดไม่ได้)
 * testID: `<testID>` กล่อง · `<testID>-<module>` แถว · `<testID>-<module>-<OFF|VIEW|USE>` ปุ่ม · `<testID>-<module>-locked` ล็อก
 */
export function LevelGrid({
  testID,
  modules,
  levels,
  onChange,
  disabled = false,
}: {
  testID: string;
  modules: readonly string[];
  levels: Record<string, string>;
  onChange?: (module: string, level: ModuleLevel) => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View testID={testID} style={styles.grid}>
      {modules.map((m) => {
        const avail = levelsAvailable(m);
        const locked = offOnly(m);
        return (
          <Glass key={m} testID={`${testID}-${m}`} radius={radii.sugg} pad={{ v: 12, h: 14 }}>
            <SysHead module={m} />
            {locked && (levels[m] === "VIEW" || levels[m] === "USE") ? (
              // R-S2.21b: server บอกว่ามีสิทธิ์ (ให้รายคีย์ไว้) แต่โมดูลนี้ไม่มีระดับให้เลือก ⇒ ไม่แสดงเป็น "ปิด"
              <View testID={`${testID}-${m}-perkey`} style={[styles.lock, { backgroundColor: c.warn.bg }]}>
                <Icon name="key" size={14} color={c.warn.fg} />
                <Text style={[styles.lockT, { color: c.warn.fg }]}>{t("perm.perKey")}</Text>
              </View>
            ) : locked ? (
              <View testID={`${testID}-${m}-locked`} style={[styles.lock, { backgroundColor: c.seg.track }]}>
                <Icon name="lock" size={14} color={c.textMuted} />
                <Text style={[styles.lockT, { color: c.textMuted }]}>{t("perm.offOnly")}</Text>
              </View>
            ) : (
              <LevelButtons
                testID={`${testID}-${m}`}
                options={avail.map((l) => ({ key: l, label: t(LEVEL_LABEL[l]) }))}
                value={levelOf(levels, m)}
                disabled={disabled}
                onChange={(l) => onChange?.(m, l)}
              />
            )}
          </Glass>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  k: { minWidth: 20, height: 16, borderRadius: 4, paddingHorizontal: 3, alignItems: "center", justifyContent: "center" },
  kt: { fontSize: 8.5, fontWeight: "700" },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  name: { fontSize: T.body - 0.5, fontWeight: "600", flexShrink: 1 },
  hint: { fontSize: T.cap - 1, marginLeft: "auto", flexShrink: 1 },
  btns: { flexDirection: "row", gap: 6 },
  btn: { flex: 1, height: 38, borderRadius: radii.segIn - 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  btnT: { fontSize: 13.5 },
  on: { fontWeight: "700" },
  dim: { opacity: 0.55 },
  lock: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: radii.segIn - 2 },
  lockT: { fontSize: 13 },
});
