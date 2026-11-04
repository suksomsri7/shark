// เลขา AI · หน้าแรก — ตัวยึดที่ (placeholder) ของใบ S0.2: วาดหน้า C3 "ยังไม่มีงาน" ตามแบบ sec-c.jpg หน้า 4
// ข้อมูลทั้งหมดมาจาก fixture (qc/fixtures/secretary/s0.2.json) — ยังไม่เรียก API · ใบ S2.1/S2.2 แทนที่จอนี้
// ยังไม่มีทางเข้าจากจอ 1.0 (เปิดได้ด้วย URL /secretary เท่านั้น)
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Icon, IconBtn, InputBar, Orb, SectionLabel, SysBadge, TopBar } from "@/src/components/airy";
import { glassStyle, useTheme, type SysKey } from "@/src/theme/index";
import { radii, size, spacing } from "@/src/theme/tokens";
import fixture from "@/qc/fixtures/secretary/s0.2.json";

const SYS_KEYS: readonly SysKey[] = ["pos", "crm", "bk", "mem", "acc", "kb", "chat", "dorm"];
const asSys = (k: string): SysKey => (SYS_KEYS as readonly string[]).includes(k) ? (k as SysKey) : "pos";
const FX = fixture.screen;

/** ระยะล่างของช่องสั่งงาน (เหนือขอบจอ) */
const INPUT_BOTTOM = 26;

// ขนาดตัวอักษร/ระยะของ C3 ที่จอ 390×844: ตำแหน่งแนวตั้งของแต่ละชิ้น = ตำแหน่งในแบบ × 0.73 (536 → 390)
// ตัวอักษรย่อน้อยกว่านั้น (≈ 0.85) เพื่อให้อ่านได้บนเครื่องจริง — ดูภาพคู่ qc/shots-sec/c3-pair.png
const F = { title: 30, sub: 14, h2: 22, p: 14, row: 14, rowSub: 12 } as const;

export default function SecretaryHome() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <AiryScreen testID="sec-home">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <TopBar
          left={
            <>
              <IconBtn testID="sec-top-secretary" icon="message-square" on zone="secretary" label={FX.secretaryName} />
              <IconBtn testID="sec-top-customers" icon="inbox" zone="customers" />
              <IconBtn testID="sec-top-team" icon="users" zone="team" />
            </>
          }
          right={
            <>
              <IconBtn testID="sec-top-help" icon="help-circle" />
              <IconBtn testID="sec-top-new" icon="plus" />
            </>
          }
        />

        <Pressable testID="sec-tenant" accessibilityRole="button" style={styles.tenant}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
            {FX.tenantName}
          </Text>
          <Icon name="chevron-down" size={22} color={c.iconDim} />
        </Pressable>
        <Text style={[styles.sub, { color: c.textMuted }]}>{FX.subtitle}</Text>

        <View style={styles.hero}>
          <Orb size={size.orbHero} testID="sec-orb" />
          <Text style={[styles.h2, { color: c.text }]}>{FX.heroTitle}</Text>
          <Text style={[styles.p, { color: c.textMuted }]}>{FX.heroBody}</Text>
        </View>

        <SectionLabel style={styles.sec}>{FX.suggestLabel}</SectionLabel>
        {FX.suggestions.map((s) => (
          <Pressable testID={`sec-suggest-${s.id}`} key={s.id} accessibilityRole="button" style={[glassStyle(c, radii.sugg), styles.sugg]}>
            <SysBadge sys={asSys(s.sys)} label={s.badge} />
            <View style={styles.sx}>
              <Text style={[styles.st, { color: c.text }]}>{s.title}</Text>
              <Text style={[styles.ss, { color: c.textMuted }]}>{s.sub}</Text>
            </View>
            <Icon name="chevron-right" size={16} />
          </Pressable>
        ))}
      </ScrollView>

      <InputBar testID="sec-input" placeholder={FX.inputPlaceholder} style={[styles.input, { bottom: INPUT_BOTTOM + insets.bottom }]} />
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: size.inputH + INPUT_BOTTOM + spacing.lg },
  tenant: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, alignSelf: "flex-start" },
  title: { fontSize: F.title, fontWeight: "700", letterSpacing: -0.8, lineHeight: 36 },
  sub: { fontSize: F.sub, marginTop: 2, lineHeight: 20 },
  hero: { alignItems: "center", marginTop: 39 },
  h2: { fontSize: F.h2, fontWeight: "700", letterSpacing: -0.5, marginTop: 14, lineHeight: 30 },
  p: { fontSize: F.p, lineHeight: 21, marginTop: 6, textAlign: "center" },
  sec: { marginTop: 22, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  sugg: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, marginTop: 8 },
  sx: { flex: 1, minWidth: 0 },
  st: { fontSize: F.row, lineHeight: 20 },
  ss: { fontSize: F.rowSub, lineHeight: 17 },
  input: { position: "absolute", left: spacing.page, right: spacing.page },
});
