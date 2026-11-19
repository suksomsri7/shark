// ขั้นของเคสช่วยเหลือ (help-cases · 15 พ.ย. 2026 · แบบ /root/mockups/secretary-help/help.png)
//   StageLine = จุด + ป้ายขั้นสีของขั้น · StageBar = แถบความคืบหน้า 5 ช่อง (การ์ดรายการ) · StageTracker = การ์ดหัวห้อง (ป้าย + stepper 5 ขั้น)
//   รอข้อมูลจากคุณ (NEED_INFO) = สีชมพู · ปิดเคส = เทาทุกช่อง · สีทั้งหมดจากธีม (c.helpStage)
import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import type { HelpStage } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { glassStyle, useTheme, type Palette } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";

export function stageColor(c: Palette, stage: HelpStage): string {
  return c.helpStage[stage];
}

/** เวลาสัมพัทธ์ของการ์ดเคส (แบบ: 10 นาที · 2 ชม. · เมื่อวาน · 2 วัน · 5 พ.ย.) */
export function helpTime(t: (k: I18nKey, v?: Record<string, string | number>) => string, iso: string, nowMs: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor((nowMs - ms) / 60_000);
  if (min < 1) return t("sec.home.time.now");
  if (min < 60) return t("sec.home.time.min", { n: min });
  const day = (x: number) => Math.floor((x + 7 * 3600_000) / 86_400_000);
  const days = day(nowMs) - day(ms);
  if (days <= 0) return t("help.time.h", { n: Math.floor(min / 60) });
  if (days <= 1) return t("sec.home.time.yesterday");
  if (days < 7) return t("help.time.d", { n: days });
  const d = new Date(ms + 7 * 3600_000);
  return `${d.getUTCDate()} ${t(`sec.month.${d.getUTCMonth() + 1}` as I18nKey)}`;
}

export const stageLabelKey = (stage: HelpStage) => `help.stage.${stage}` as I18nKey;

export function StageLine({ stage, testID, hint }: { stage: HelpStage; testID?: string; hint?: string | null }) {
  const { c } = useTheme();
  const t = useT();
  const col = stageColor(c, stage);
  return (
    <View testID={testID} style={styles.line}>
      <View style={[styles.dot, { backgroundColor: col }]} />
      <Text style={[styles.lineT, { color: col }]} numberOfLines={1}>
        {t(stageLabelKey(stage))}
        {hint ? <Text style={[styles.hint, { color: c.textDim }]}>{` · ${hint}`}</Text> : null}
      </Text>
    </View>
  );
}

/** แถบ 5 ช่อง — ช่อง 1..step สีของขั้น · ปิดเคส = เทาทั้ง 5 */
export function StageBar({ stage, step, testID }: { stage: HelpStage; step: number; testID?: string }) {
  const { c } = useTheme();
  const col = stageColor(c, stage);
  const n = stage === "CLOSED" ? 5 : Math.max(1, Math.min(5, step));
  return (
    <View testID={testID} style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.seg, { backgroundColor: i <= n ? col : c.helpStage.track }]} />
      ))}
    </View>
  );
}

/** การ์ดหัวห้องเคส: ● ป้ายขั้น · คำอธิบาย + stepper รับเรื่อง → ตรวจสอบ → แก้ไข → รอยืนยัน → ปิดเคส */
export function StageTracker({ stage, step, testID }: { stage: HelpStage; step: number; testID: string }) {
  const { c } = useTheme();
  const t = useT();
  const col = stageColor(c, stage);
  const cur = stage === "CLOSED" ? 5 : Math.max(1, Math.min(5, step));
  return (
    <View testID={testID} style={[glassStyle(c, radii.sugg), styles.trk]}>
      <StageLine stage={stage} hint={t(`help.stageHint.${stage}` as I18nKey)} testID={`${testID}-line`} />
      <View style={styles.steps}>
        <View style={[styles.rail, { backgroundColor: c.helpStage.track }]} />
        {[1, 2, 3, 4, 5].map((i) => {
          const done = i < cur || stage === "CLOSED";
          const now = i === cur && stage !== "CLOSED";
          const bg = now ? col : done ? c.helpStage.AWAITING_CONFIRM : c.helpStage.track;
          return (
            <View key={i} testID={`${testID}-step-${i}${now ? "-now" : done ? "-done" : ""}`} style={styles.step}>
              <View style={[styles.halo, now && { backgroundColor: `${col}${c.helpStage.haloAlpha}` }]}>
                <View style={[styles.circle, { backgroundColor: bg }]}>
                  {done ? <Icon name="check" size={13} color={c.helpStage.onStage} /> : <Text style={[styles.num, { color: c.helpStage.onStage }]}>{i}</Text>}
                </View>
              </View>
              <Text style={[styles.stepT, { color: now ? col : done ? c.text : c.textMuted }, now && styles.stepNow]} numberOfLines={1}>
                {t(`help.step.${i}` as I18nKey)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const CIRCLE = 26;
const HALO = 34;
const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  lineT: { flexShrink: 1, fontSize: T.sub, fontWeight: "700", lineHeight: 20 },
  hint: { fontWeight: "400" },
  bar: { flexDirection: "row", gap: 5, marginTop: 10 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  trk: { paddingVertical: 14, paddingHorizontal: 14 },
  steps: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  rail: { position: "absolute", left: 24, right: 24, top: HALO / 2 - 1.5, height: 3, borderRadius: 2 },
  step: { width: 62, alignItems: "center", gap: 3 },
  halo: { width: HALO, height: HALO, borderRadius: HALO / 2, alignItems: "center", justifyContent: "center" },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: "center", justifyContent: "center" },
  num: { fontSize: 12, fontWeight: "700" },
  stepT: { fontSize: 11, lineHeight: 14 },
  stepNow: { fontWeight: "700" },
});
