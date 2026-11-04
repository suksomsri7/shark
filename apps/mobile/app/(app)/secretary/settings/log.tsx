// บันทึกการกระทำ (ใบ S2.8 · แบบ B5 sec-b.jpg หน้า 5) — GET secretary/log?module&day · POST log/[id]/undo
//   ไทม์ไลน์: เวลาไทย · ระบบ · สรุป · ผู้สั่ง/ผู้อนุมัติ · ปุ่มย้อนเมื่อยังอยู่ในกรอบ (undoableUntil > ตอนนี้) · ย้อนแล้ว = ขีดฆ่า
//   ตัวกรอง: ทั้งหมด · วันนี้ (?day= วันไทย) · ย้อนได้ (กรองในแอป) · ระบบ (?module=) — ชิประบบมาจากรายการชุดแรก
//   ใครเห็นแถวไหนเซิร์ฟเวอร์เป็นผู้ตัดสิน (OWNER ทุกแถว · คนอื่นห้องตัวเอง + แถวที่ตัวเองสั่ง/อนุมัติ · RESOLUTIONS §K) — จอไม่กรองสิทธิ์เอง
//   ย้อน: ไม่ส่ง now (§K) · ผล {ok, note} — note ไทยของเซิร์ฟเวอร์แสดงตรง ๆ · สำเร็จ = โหลดใหม่
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Chip, Glass, Note } from "@/src/components/airy";
import { SettingsTop } from "@/src/components/secretary/SettingRow";
import { LogItem } from "@/src/components/secretary/LogItem";
import { sysName } from "@/src/components/secretary/RoomCard";
import { dayBkk } from "@/src/components/secretary/bkk";
import { DEFAULT_SECRETARY_NAME, logCanUndo, secGet, secPostId, serverNote, useActiveRole, useSecretaryMe, type LogRow } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

type Filter = { kind: "all" } | { kind: "today" } | { kind: "undo" } | { kind: "module"; module: string };
const keyOf = (f: Filter) => (f.kind === "module" ? `m-${f.module}` : f.kind);

export default function SecretaryLogScreen() {
  const { c } = useTheme();
  const t = useT();
  const sec = useSecretaryMe();
  const role = useActiveRole();
  const name = sec?.name ?? DEFAULT_SECRETARY_NAME;
  const { user, tenants, activeTenantId } = useAuth();
  const tenantName = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [rows, setRows] = useState<LogRow[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const seq = useRef(0);

  const load = useCallback(
    (f: Filter) => {
      if (!activeTenantId) return;
      const my = ++seq.current;
      const now = Date.now();
      const q = { take: 100, ...(f.kind === "today" ? { day: dayBkk(now) } : {}), ...(f.kind === "module" ? { module: f.module } : {}) };
      secGet("secretary/log", q)
        .then((r) => {
          if (my !== seq.current) return;
          const items = r.items ?? [];
          setRows(items);
          setNowMs(now);
          setLoaded(true);
          if (f.kind === "all") setModules([...new Set(items.map((x) => x.module).filter(Boolean))].slice(0, 6));
        })
        .catch(() => {
          if (my !== seq.current) return;
          setLoaded(true);
          setNote({ text: t("sec.set.loadFail"), warn: true });
        });
    },
    [activeTenantId, t],
  );

  useFocusEffect(
    useCallback(() => {
      load(filter);
      if (!activeTenantId) return;
      let live = true;
      // ชื่อผู้สั่ง/ผู้อนุมัติ — รายชื่อพนักงานอ่านได้เฉพาะเจ้าของ/ผู้จัดการ · อ่านไม่ได้ ⇒ แสดงเฉพาะ "คุณ"
      if (role !== "OWNER" && role !== "MANAGER") return;
      secGet("secretary/staff")
        .then((r) => {
          if (!live) return;
          const m: Record<string, string> = {};
          for (const x of r.items ?? []) if (x.userId && x.name) m[x.userId] = x.name;
          setNames(m);
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTenantId, load, role]),
  );

  const pick = (f: Filter) => {
    setFilter(f);
    setNote(null);
    if (f.kind !== "undo") load(f);
    else if (filter.kind !== "all") load({ kind: "all" });
  };

  const nameOf = useCallback(
    (id: string | null | undefined) => {
      if (!id) return null;
      if (id === user?.id) return t("sec.log.you");
      return names[id] ?? null;
    },
    [names, user?.id, t],
  );

  const undo = async (row: LogRow) => {
    if (busyId) return;
    setBusyId(row.id);
    setNote(null);
    try {
      const r = await secPostId("secretary/log/[id]/undo", row.id, {});
      setNote({ text: r.note?.trim() || t(r.ok ? "sec.log.undoDone" : "sec.log.undoFail"), warn: !r.ok });
      if (r.ok) load(filter.kind === "undo" ? { kind: "all" } : filter);
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("sec.log.undoFail"), warn: true });
    } finally {
      setBusyId(null);
    }
  };

  const shown = useMemo(() => (filter.kind === "undo" ? rows.filter((r) => logCanUndo(r, nowMs)) : rows), [rows, filter, nowMs]);
  const today = dayBkk(nowMs);
  const todayCount = rows.filter((r) => dayBkk(Date.parse(r.createdAt)) === today).length;
  const chips: { f: Filter; label: string }[] = [
    { f: { kind: "all" }, label: t("sec.log.filter.all") },
    { f: { kind: "today" }, label: t("sec.log.filter.today") },
    { f: { kind: "undo" }, label: t("sec.log.filter.undo") },
    ...modules.map((m) => ({ f: { kind: "module", module: m } as Filter, label: sysName(t, m) })),
  ];

  return (
    <AiryScreen testID="sec-log">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SettingsTop testID="sec-log-top" title={t("sec.title.settingsLog")} subtitle={t("sec.log.sub", { name, tenant: tenantName, n: todayCount })} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
          <View testID="sec-log-filter" style={styles.chipsIn}>
            {chips.map((x) => (
              <Chip key={keyOf(x.f)} testID={`sec-log-filter-${keyOf(x.f)}`} label={x.label} active={keyOf(x.f) === keyOf(filter)} onPress={() => pick(x.f)} />
            ))}
          </View>
        </ScrollView>
        {note ? (
          <Note warn={note.warn} testID="sec-log-note">
            {note.text}
          </Note>
        ) : null}
        {shown.length > 0 ? (
          <Glass testID="sec-log-list" radius={radii.card} style={styles.card}>
            {shown.map((r, i) => (
              <LogItem key={r.id} row={r} testID="sec-log-item" undoTestID="sec-log-undo" nowMs={nowMs} nameOf={nameOf} busy={busyId === r.id} last={i === shown.length - 1} onUndo={(x) => void undo(x)} />
            ))}
          </Glass>
        ) : loaded ? (
          <Text testID="sec-log-empty" style={[styles.empty, { color: c.textMuted }]}>
            {t("sec.log.empty")}
          </Text>
        ) : null}
        <Text style={[styles.foot, { color: c.textMuted }]}>{t("sec.log.foot")}</Text>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  chipsScroll: { marginTop: F.v(22), marginHorizontal: -spacing.page },
  chips: { paddingHorizontal: spacing.page },
  chipsIn: { flexDirection: "row", gap: spacing.sm },
  card: { marginTop: F.v(28), paddingTop: 18, paddingBottom: 4 },
  empty: { fontSize: T.sub, marginTop: spacing.xl, textAlign: "center" },
  foot: { fontSize: T.cap - 0.5, lineHeight: 17, marginTop: spacing.lg, textAlign: "center" },
});
