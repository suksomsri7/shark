// จอ ก "ดีลของฉัน" ของแอปพนักงาน (ใบ C3.7 · ภาพ 13 ก)
// ชิปกรองขั้น (ทั้งหมด n · ขั้นละ n) · การ์ดดีล: ป้าย "นิ่ง N วัน" (ขอบแดง) · ขั้น · ชื่อดีล · บริษัท · มูลค่า · ปุ่ม "โทร"
// ปุ่มโทร = Linking เปิด `tel:` ของเครื่อง (ตัวจำสาย src/lib/call-prompt) → วางสายแล้วกลับเข้าแอป → แผ่นบันทึกสายเด้งเอง (ภาพ 13 ข)
// API: GET /api/mobile/crm/deals · GET /api/mobile/crm/deals/<id> (เปิดจากแจ้งเตือน ?dealId=) — ผ่าน src/api/client (Bearer + กิจการ)
// 🔴 ข้อความผิดพลาดขึ้นในจอ (ห้าม Alert) · ไม่มีอีเมลของใครบนจอ · เบอร์ใช้แค่กดโทร
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/src/components/ui/text";
import { PageColumn } from "@/src/components/ui/page";
import { api, apiErrorText } from "@/src/api/client";
import { useBrand } from "@/src/lib/brand";
import { clearPendingCall, markPendingCall, telUrl } from "@/src/lib/call-prompt";
import { Chip, CrmHeader, CrmNotice, CrmTabBar, baht, crmApiPath, crmStyles, openDrawerFrom, paramOf, thaiWhen, type CrmDeal, type CrmDeals } from "@/src/components/crm/ui";
import { C, R, S } from "@/src/theme";

function DealCard({ d, pinned, onCall }: { d: CrmDeal; pinned?: boolean; onCall: (d: CrmDeal) => void }) {
  const stale = d.stalledDays !== null;
  const hot = stale && (d.stalledDays ?? 0) >= 14;
  const when = thaiWhen(d.nextActivityAt ?? null);
  return (
    <View testID={`crm-deal-card-${d.id}`} style={[crmStyles.card, styles.deal, stale && (hot ? styles.dealHot : styles.dealWarm), pinned && styles.dealPinned]}>
      <View style={styles.dealTop}>
        {stale ? (
          <View testID={`crm-deal-stale-${d.id}`} style={[styles.badge, hot ? styles.badgeHot : styles.badgeWarm]}>
            <Text style={[styles.badgeText, { color: hot ? C.danger : "#b45309" }]}>นิ่ง {d.stalledDays} วัน</Text>
          </View>
        ) : when ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{when}</Text>
          </View>
        ) : null}
        <Text style={crmStyles.faint} numberOfLines={1}>
          {d.stageName}
        </Text>
      </View>
      <Text style={styles.dealTitle} numberOfLines={2}>
        {d.title}
      </Text>
      {d.company?.name || d.contact?.name ? (
        <Text style={crmStyles.dim} numberOfLines={1}>
          {d.company?.name ?? d.contact?.name}
        </Text>
      ) : null}
      <View style={styles.dealBottom}>
        <Text style={styles.value}>{baht(d.valueSatang)}</Text>
        {d.contact?.phone ? (
          <Pressable testID={`crm-deal-call-${d.id}`} onPress={() => onCall(d)} style={({ pressed }) => [styles.callBtn, pressed && { backgroundColor: C.surface }]} accessibilityLabel={`โทรหา ${d.contact.name}`}>
            <Feather name="phone" size={13} color={C.text} />
            <Text style={styles.callText}>โทร</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function CrmDealsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const brand = useBrand();
  const params = useLocalSearchParams<{ systemId?: string; dealId?: string }>();
  const systemId = paramOf(params.systemId);
  const dealId = paramOf(params.dealId);

  const [data, setData] = useState<CrmDeals | null>(null);
  const [pinned, setPinned] = useState<CrmDeal | null>(null);
  const [stage, setStage] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<CrmDeals>(crmApiPath("/api/mobile/crm/deals", systemId));
      setData(res);
      setError(null);
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [systemId]);

  useEffect(() => {
    void load();
  }, [load]);

  // เปิดจากแจ้งเตือน (?dealId=) — ดีลนั้นขึ้นบนสุด (ถ้าไม่ใช่ของเราเอง ก็ยังเปิดดูได้เมื่อมองเห็น · ไม่เห็น = ข้อความแจ้ง)
  useEffect(() => {
    if (!dealId) {
      setPinned(null);
      return;
    }
    let live = true;
    api<{ deal: CrmDeal }>(crmApiPath(`/api/mobile/crm/deals/${encodeURIComponent(dealId)}`, systemId))
      .then((r) => live && setPinned(r.deal))
      .catch((e) => live && setError(apiErrorText(e)));
    return () => {
      live = false;
    };
  }, [dealId, systemId]);

  const items = useMemo(() => {
    const all = (data?.items ?? []).filter((d) => d.id !== pinned?.id);
    return stage === "all" ? all : all.filter((d) => d.stageId === stage);
  }, [data, stage, pinned]);

  // ปุ่มโทร: จำสายไว้ก่อน แล้วเปิดหน้าโทรของเครื่องด้วย Linking (`tel:<เบอร์>`) — กลับเข้าแอป = แผ่นบันทึกสาย (useCallPrompt)
  async function call(d: CrmDeal) {
    setCallError(null);
    const url = d.contact?.phone ? telUrl(d.contact.phone) : null;
    if (!url || !d.contact) return;
    markPendingCall({ contactId: d.contact.id, dealId: d.id, systemId });
    try {
      await Linking.openURL(url);
    } catch {
      clearPendingCall();
      setCallError("เครื่องนี้เปิดหน้าโทรออกไม่ได้ — กดโทรจากแอปโทรศัพท์แทน แล้วกลับมาบันทึกสายที่แผ่นบันทึกสาย");
    }
  }

  const total = data?.items.length ?? 0;
  return (
    <View style={[crmStyles.screen, { paddingTop: insets.top }]}>
      <PageColumn>
        <CrmHeader title="ดีลของฉัน" left="menu" onLeft={() => openDrawerFrom(navigation)} />
        <ScrollView
          testID="crm-deals"
          contentContainerStyle={[crmStyles.body, { paddingBottom: S.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip testID="crm-deal-filter-all" label={`ทั้งหมด ${total}`} on={stage === "all"} onPress={() => setStage("all")} />
            {(data?.stages ?? []).map((s) => (
              <Chip key={s.id} testID={`crm-deal-filter-${s.id}`} label={`${s.name} ${s.count}`} on={stage === s.id} onPress={() => setStage(s.id)} />
            ))}
          </ScrollView>
          <CrmNotice text={error} tone="error" />
          <CrmNotice text={callError} tone="error" />
          {pinned ? <DealCard d={pinned} pinned onCall={(d) => void call(d)} /> : null}
          {loading && !data ? (
            <View style={crmStyles.center}>
              <ActivityIndicator color={brand.accent} />
            </View>
          ) : items.length === 0 && !error ? (
            <Text style={crmStyles.dim}>{stage === "all" ? "ยังไม่มีดีลที่เปิดอยู่ของคุณ — ดีลใหม่ที่มอบให้คุณจะขึ้นที่นี่" : "ไม่มีดีลในขั้นนี้"}</Text>
          ) : (
            items.map((d) => <DealCard key={d.id} d={d} onCall={(x) => void call(x)} />)
          )}
        </ScrollView>
        <CrmTabBar active="deals" bottom={insets.bottom} onDeals={() => undefined} onTasks={() => router.push(crmApiPath("/crm/tasks", systemId))} onMenu={() => openDrawerFrom(navigation)} />
      </PageColumn>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: S.sm, paddingRight: S.md },
  deal: { padding: S.md, gap: 6 },
  dealWarm: { borderColor: "#d97706" },
  dealHot: { borderColor: C.danger },
  dealPinned: { borderWidth: 2, borderColor: C.blue },
  dealTop: { flexDirection: "row", alignItems: "center", gap: S.sm },
  badge: { borderWidth: 1, borderColor: C.border, borderRadius: R.sm - 2, paddingHorizontal: 6, paddingVertical: 1, flexShrink: 0 },
  badgeWarm: { borderColor: "#d97706", backgroundColor: "#fffbeb" },
  badgeHot: { borderColor: C.danger, backgroundColor: C.dangerDim },
  badgeText: { fontSize: 11, color: C.textDim, fontFamily: "IBMPlexSansThai_600SemiBold" },
  dealTitle: { color: C.text, fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold" },
  dealBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.xs, gap: S.sm },
  value: { color: C.text, fontSize: 16, fontFamily: "IBMPlexSansThai_700Bold", flexShrink: 1 },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.border, borderRadius: R.sm, paddingHorizontal: S.md, paddingVertical: 6 },
  callText: { color: C.text, fontSize: 13, fontFamily: "IBMPlexSansThai_600SemiBold" },
});
