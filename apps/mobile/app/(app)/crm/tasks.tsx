// จอ ค "งานวันนี้" ของแอปพนักงาน (ใบ C3.7 · ภาพ 13 ค)
// ตัวนับ 3 ช่อง (วันนี้ · เลยกำหนด (แดง) · เสร็จแล้ว) · รายการงาน: ช่องติ๊ก · ชื่องาน · ดีล/ผู้ติดต่อ · เวลา · ทางเข้าสแกนนามบัตร
// API: GET /api/mobile/crm/tasks · POST /api/mobile/crm/tasks/<id>/complete — ผ่าน src/api/client (Bearer + กิจการ)
// 🔴 ติ๊กแล้วขึ้นทันที (ถ้าเซิร์ฟเวอร์ปฏิเสธ = ย้อนกลับ + ข้อความใต้รายการ · ห้าม Alert) · งานที่ติ๊กแล้วติ๊กคืนไม่ได้จากแอป
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/src/components/ui/text";
import { PageColumn } from "@/src/components/ui/page";
import { api, apiErrorText } from "@/src/api/client";
import { useBrand } from "@/src/lib/brand";
import { CrmHeader, CrmNotice, CrmTabBar, crmApiPath, crmStyles, openDrawerFrom, paramOf, thaiWhen, type CrmTask, type CrmTasks } from "@/src/components/crm/ui";
import { C, R, S } from "@/src/theme";

const OFFSET = 7 * 3_600_000;
const thaiDayNo = (t: number) => Math.floor((t + OFFSET) / 86_400_000);

/** เวลาของงานในแถว: วันนี้ = "10:00" · เลยกำหนด = วันที่ · ไม่มีกำหนด = "" */
function dueLabel(t: CrmTask, now = Date.now()): string {
  if (!t.dueAt) return "";
  const at = new Date(t.dueAt).getTime();
  if (Number.isNaN(at)) return "";
  const w = thaiWhen(t.dueAt, now);
  return thaiDayNo(at) === thaiDayNo(now) ? w.replace(/^วันนี้ /, "") : w;
}

export default function CrmTasksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const brand = useBrand();
  const params = useLocalSearchParams<{ systemId?: string; taskId?: string }>();
  const systemId = paramOf(params.systemId);
  const focusId = paramOf(params.taskId);

  const [data, setData] = useState<CrmTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setData(await api<CrmTasks>(crmApiPath("/api/mobile/crm/tasks", systemId)));
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

  async function complete(t: CrmTask) {
    if (t.done || busy[t.id]) return;
    setRowError(null);
    setBusy((b) => ({ ...b, [t.id]: true }));
    const flip = (done: boolean) =>
      setData((d) => {
        if (!d) return d;
        const overdue = !!t.dueAt && thaiDayNo(new Date(t.dueAt).getTime()) < thaiDayNo(Date.now());
        const step = done ? 1 : -1;
        return {
          items: d.items.map((x) => (x.id === t.id ? { ...x, done } : x)),
          counts: {
            today: d.counts.today - (overdue ? 0 : step),
            overdue: d.counts.overdue - (overdue ? step : 0),
            done: d.counts.done + step,
          },
        };
      });
    flip(true);
    try {
      await api(crmApiPath(`/api/mobile/crm/tasks/${encodeURIComponent(t.id)}/complete`, systemId), { method: "POST", body: {} });
    } catch (e) {
      flip(false);
      setRowError(apiErrorText(e));
    } finally {
      setBusy((b) => ({ ...b, [t.id]: false }));
    }
  }

  const counts = data?.counts ?? { today: 0, overdue: 0, done: 0 };
  return (
    <View style={[crmStyles.screen, { paddingTop: insets.top }]}>
      <PageColumn>
        <CrmHeader title="งานวันนี้" left="menu" onLeft={() => openDrawerFrom(navigation)} />
        <ScrollView
          testID="crm-tasks"
          contentContainerStyle={[crmStyles.body, { paddingBottom: S.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          <View style={styles.counts}>
            <View testID="crm-tasks-count-today" style={styles.count}>
              <Text style={crmStyles.dim}>วันนี้</Text>
              <Text style={styles.countNum}>{counts.today}</Text>
            </View>
            <View testID="crm-tasks-count-overdue" style={styles.count}>
              <Text style={crmStyles.dim}>เลยกำหนด</Text>
              <Text style={[styles.countNum, counts.overdue > 0 && { color: C.danger }]}>{counts.overdue}</Text>
            </View>
            <View testID="crm-tasks-count-done" style={styles.count}>
              <Text style={crmStyles.dim}>เสร็จแล้ว</Text>
              <Text style={styles.countNum}>{counts.done}</Text>
            </View>
          </View>
          <CrmNotice text={error} tone="error" />
          {loading && !data ? (
            <View style={crmStyles.center}>
              <ActivityIndicator color={brand.accent} />
            </View>
          ) : (data?.items.length ?? 0) === 0 && !error ? (
            <Text style={crmStyles.dim}>วันนี้ไม่มีงานค้าง — งานใหม่ที่ครบกำหนดวันนี้จะขึ้นที่นี่</Text>
          ) : data ? (
            <View style={crmStyles.card}>
              {data.items.map((t, i) => (
                <View key={t.id} testID={`crm-task-${t.id}`} style={[styles.row, i > 0 && styles.rowLine, t.id === focusId && styles.rowFocus]}>
                  <Pressable
                    testID={`crm-task-check-${t.id}`}
                    onPress={() => void complete(t)}
                    hitSlop={8}
                    disabled={t.done || !!busy[t.id]}
                    style={[styles.check, t.done && styles.checkOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: t.done }}
                    accessibilityLabel={`ทำเสร็จ: ${t.title}`}
                  >
                    {t.done ? <Feather name="check" size={13} color={C.bg} /> : null}
                  </Pressable>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, t.done && styles.rowDone]} numberOfLines={2}>
                      {t.title}
                    </Text>
                    {t.context ? (
                      <Text style={crmStyles.faint} numberOfLines={1}>
                        {t.context}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={crmStyles.faint}>{dueLabel(t)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <CrmNotice text={rowError} tone="error" />

          <View style={styles.scanHead}>
            <Feather name="camera" size={14} color={C.text} />
            <Text style={crmStyles.sectionTitle}>สแกนนามบัตร</Text>
          </View>
          <Pressable testID="crm-scan-card-open" onPress={() => router.push(crmApiPath("/crm/scan-card", systemId))} style={({ pressed }) => [styles.scanBox, pressed && { backgroundColor: C.surface }]}>
            <Feather name="camera" size={22} color={C.textDim} />
            <Text style={styles.scanTitle}>สแกนนามบัตรลูกค้าใหม่</Text>
            <Text style={crmStyles.faint}>ถ่ายรูป → AI อ่านและสร้าง lead ให้ทันที</Text>
          </Pressable>
        </ScrollView>
        <CrmTabBar active="tasks" bottom={insets.bottom} onDeals={() => router.push(crmApiPath("/crm", systemId))} onTasks={() => undefined} onMenu={() => openDrawerFrom(navigation)} />
      </PageColumn>
    </View>
  );
}

const styles = StyleSheet.create({
  counts: { flexDirection: "row", gap: S.xl },
  count: { gap: 2 },
  countNum: { color: C.text, fontSize: 22, fontFamily: "IBMPlexSansThai_700Bold" },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.md, paddingVertical: S.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  rowFocus: { backgroundColor: "#eff6ff" },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { color: C.text, fontSize: 14, fontFamily: "IBMPlexSansThai_700Bold" },
  rowDone: { color: C.textFaint, textDecorationLine: "line-through" },
  check: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: C.textFaint, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: C.text, borderColor: C.text },
  scanHead: { flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: S.sm },
  scanBox: { borderWidth: 1.5, borderStyle: "dashed", borderColor: C.textFaint, borderRadius: R.lg, paddingVertical: S.xl, alignItems: "center", gap: S.xs },
  scanTitle: { color: C.text, fontSize: 14, fontFamily: "IBMPlexSansThai_700Bold", marginTop: S.xs },
});
