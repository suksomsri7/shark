// จอ ข "สรุปสมาชิก + ปุ่มด่วน 4 ปุ่ม" ของแอปพนักงาน (M3.11 · ภาพ 28 ข)
// การ์ดหัว (ชื่อ · ระดับ · รหัส) · ตัวเลข 3 (แต้ม / voucher / สแตมป์) · ปุ่ม 2×2 · ประวัติ 3 รายการล่าสุด
// API: GET /api/mobile/member/summary?id= (ผ่าน src/api/client)
//
// ปุ่ม "ประทับสแตมป์" = จอ native (member/stamp) · อีก 3 ปุ่ม (ใช้สิทธิ์ · ให้แต้ม · ออก voucher) ยังไม่มีจอในแอป
// ⇒ เปิดหน้าเว็บจริงของร้าน (พาธจาก API — มีอยู่จริงทุกเส้น) ใน WebView ของหน้าระบบงาน (index.tsx รับ `open`)
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/src/components/ui/text";
import { PageColumn } from "@/src/components/ui/page";
import { api, apiErrorText } from "@/src/api/client";
import { useBrand } from "@/src/lib/brand";
import {
  Avatar,
  MemberHeader,
  Notice,
  TierChip,
  fmtNum,
  memberStyles,
  thaiShortDate,
  type MemberSummary,
} from "@/src/components/member/ui";
import { C, R, S } from "@/src/theme";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

/** ไอคอนของแถวประวัติตามชนิด (ชนิดเดียวกับไทม์ไลน์หลังร้าน M3.7) */
function historyIcon(kind: string): FeatherName {
  const map: Record<string, FeatherName> = {
    purchase: "shopping-bag",
    booking: "calendar",
    chat: "message-circle",
    document: "file-text",
    tier: "award",
    loyalty: "gift",
    task: "check-square",
    review: "star",
    profile: "user",
  };
  return map[kind] ?? "clock";
}

export default function MemberSummaryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const id = String(customerId ?? "");

  const [data, setData] = useState<MemberSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = (await api("/api/mobile/member/summary?id=" + encodeURIComponent(id))) as MemberSummary;
      setData(res);
      setError(null);
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // กลับจากจอประทับ → ตัวเลขสแตมป์ต้องเป็นค่าล่าสุด
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // `t` = ตัวกันซ้ำ: กดปุ่มเดิมซ้ำ (พาธเดิม) หน้าระบบงานต้องเปิดให้อีกรอบ
  const openWeb = (path: string) => router.navigate({ pathname: "/", params: { open: path, t: String(Date.now()) } });

  const m = data?.member;
  const stamp = data?.stats.stamp ?? null;
  const actions: { testID: string; label: string; icon: FeatherName; onPress: () => void; disabled?: boolean }[] = data
    ? [
        {
          testID: "member-action-stamp",
          label: "ประทับสแตมป์",
          icon: "check-square",
          disabled: !data.canStamp,
          onPress: () =>
            router.push({ pathname: "/member/stamp", params: { customerId: data.member.id, name: data.member.name } }),
        },
        { testID: "member-action-redeem", label: "ใช้สิทธิ์", icon: "check", onPress: () => openWeb(data.links.redeem) },
        { testID: "member-action-points", label: "ให้แต้ม", icon: "zap", onPress: () => openWeb(data.links.points) },
        { testID: "member-action-voucher", label: "ออก voucher", icon: "tag", onPress: () => openWeb(data.links.voucher) },
      ]
    : [];

  return (
    <View style={[memberStyles.screen, { paddingTop: insets.top }]}>
      <PageColumn>
        <MemberHeader title={m?.name ?? "สมาชิก"} left="back" onLeft={() => (router.canGoBack() ? router.back() : router.replace("/member"))} />
        {loading && !data ? (
          <View style={memberStyles.center}>
            <ActivityIndicator color={brand.accent} />
          </View>
        ) : !data ? (
          <View style={memberStyles.body}>
            <Notice text={error ?? "เปิดข้อมูลสมาชิกไม่สำเร็จ — ลองใหม่อีกครั้ง"} tone="error" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[memberStyles.body, { paddingBottom: insets.bottom + S.xl }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await load();
                  setRefreshing(false);
                }}
                tintColor={C.textDim}
              />
            }
          >
            <View testID="member-summary" style={[memberStyles.card, styles.head]}>
              <Avatar name={data.member.name} size={44} />
              <View style={styles.headBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {data.member.name}
                  </Text>
                  <TierChip tier={data.member.tier} />
                </View>
                <Text style={memberStyles.faint} numberOfLines={1}>
                  {data.member.memberCode}
                  {data.member.phoneMasked ? ` · ${data.member.phoneMasked}` : ""}
                </Text>
              </View>
            </View>

            <View testID="member-summary-stats" style={styles.stats}>
              <View style={styles.stat}>
                <Text style={memberStyles.faint}>แต้ม</Text>
                <Text style={styles.statNum}>{fmtNum(data.stats.points)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={memberStyles.faint}>voucher</Text>
                <Text style={styles.statNum}>{fmtNum(data.stats.vouchers)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={memberStyles.faint}>สแตมป์</Text>
                <Text style={styles.statNum}>{stamp ? `${stamp.stamps}/${stamp.slots}` : "–"}</Text>
              </View>
            </View>

            <View style={styles.grid}>
              {actions.map((a) => (
                <Pressable
                  key={a.testID}
                  testID={a.testID}
                  onPress={a.onPress}
                  disabled={a.disabled}
                  style={({ pressed }) => [memberStyles.card, styles.action, pressed && { backgroundColor: C.surface }, a.disabled && styles.off]}
                >
                  <Feather name={a.icon} size={18} color={C.text} />
                  <Text style={styles.actionText}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            {!data.canStamp ? <Notice text="สมาชิกคนนี้ยังไม่มีใบสแตมป์ที่พนักงานประทับให้ได้ (ร้านยังไม่เปิดใบ หรือจำกัดระดับ/สาขาไว้)" /> : null}
            <Notice text={error} tone="error" />

            <View style={styles.sectionHead}>
              <Feather name="clock" size={15} color={C.text} />
              <Text style={memberStyles.sectionTitle}>ประวัติ</Text>
            </View>
            <View testID="member-history" style={memberStyles.card}>
              {data.history.length === 0 ? (
                <Text style={[memberStyles.dim, styles.historyEmpty]}>ยังไม่มีประวัติกับร้าน</Text>
              ) : (
                data.history.map((h, i) => (
                  <View key={h.id} style={[styles.historyRow, i > 0 && styles.rowLine]}>
                    <Feather name={historyIcon(h.kind)} size={15} color={C.textDim} />
                    <View style={styles.historyBody}>
                      <Text style={styles.historyTitle} numberOfLines={2}>
                        {h.title}
                      </Text>
                      {h.sub ? (
                        <Text style={memberStyles.faint} numberOfLines={2}>
                          {h.sub}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={memberStyles.faint}>{thaiShortDate(h.at)}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </PageColumn>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: S.md, padding: S.md },
  headBody: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  name: { flexShrink: 1, color: C.text, fontSize: 17, fontFamily: "IBMPlexSansThai_700Bold" },
  stats: { flexDirection: "row", gap: S.xl, paddingHorizontal: S.xs },
  stat: { gap: 2 },
  statNum: { color: C.text, fontSize: 20, fontFamily: "IBMPlexSansThai_700Bold" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: S.sm },
  action: { width: "48.5%", minHeight: 70, alignItems: "center", justifyContent: "center", gap: S.xs, borderRadius: R.md },
  actionText: { color: C.text, fontSize: 14, fontFamily: "IBMPlexSansThai_700Bold" },
  off: { opacity: 0.45 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: S.xs, marginTop: S.xs },
  historyRow: { flexDirection: "row", alignItems: "flex-start", gap: S.md, paddingHorizontal: S.md, paddingVertical: S.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  historyBody: { flex: 1, minWidth: 0, gap: 2 },
  historyTitle: { color: C.text, fontSize: 14, fontFamily: "IBMPlexSansThai_600SemiBold" },
  historyEmpty: { padding: S.md },
});
