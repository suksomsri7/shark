// รออนุมัติรวมทุกกิจการ (ใบ S2.5 · แบบ A6 sec-a.jpg หน้า 6 + sec-dark-a.jpg หน้า 6)
//   ข้อมูล: GET secretary/inbox (เส้นระดับผู้ใช้ — ไม่ส่ง x-tenant-id · รายการของทุกกิจการที่ผู้ใช้เห็น) · badge = secretary/inbox/count.canApprove (store กลางของโซน)
//   อนุมัติ/ตีกลับ: POST secretary/proposals/[id]/approve|reject หรือ secretary/plans/[id]/approve|reject ด้วย x-tenant-id = tenantId ของรายการ
//     (ไม่สลับกิจการ active) · ยืนยัน 2 ชั้น + ชีตตีกลับ C4 = useApprovalFlow เดิมของห้องงาน (S2.4)
//   canApprove=false ⇒ ปุ่มปิด + บรรทัดเหตุผล · แตะรายการ ⇒ สลับกิจการ (ถ้าต่าง) แล้วเปิด /secretary/room/[roomId]
//   แท็บ 4: ทั้งหมด / เงิน / ส่งลูกค้า / ลบ-ยกเลิก (ชั้นของรายการ — class ของเซิร์ฟเวอร์ถ้ามี ไม่งั้นจาก kind/risk) · จัดกลุ่มตามกิจการ
// ข้อความผ่าน i18n (sec.inbox.*) · สีจากธีม · สเกล R-UI1
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, IconBtn, SectionLabel, Tabs, type TabItem } from "@/src/components/airy";
import { useApprovalFlow, type ApprovalActions, type ApprovalIds } from "@/src/components/secretary/ApprovalCard";
import { InboxItem, type InboxItemIds } from "@/src/components/secretary/InboxItem";
import { roomTime } from "@/src/components/secretary/RoomCard";
import {
  DEFAULT_SECRETARY_NAME,
  inboxToApproval,
  normalizeInbox,
  refreshZoneBadges,
  secGet,
  secPostId,
  useSecretaryMe,
  useZoneBadgeCounts,
  type InboxRow,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { cardGap, size, spacing, type as T } from "@/src/theme/tokens";

type Tab = "all" | "money" | "customer" | "delete";

const ITEM_IDS: InboxItemIds = {
  item: "sec-inbox-item",
  open: "sec-inbox-open",
  reject: "sec-inbox-reject",
  approve: "sec-inbox-approve",
  why: "sec-inbox-why",
  cannot: "sec-inbox-cannot",
  note: "sec-inbox-note",
};
const TAB_IDS: Record<Tab, string> = { all: "sec-inbox-tab-all", money: "sec-inbox-tab-money", customer: "sec-inbox-tab-customer", delete: "sec-inbox-tab-delete" };
/** ชีตยืนยัน 2 ชั้น/ตีกลับ (useApprovalFlow) — ไม่มีการ์ด/แก้ในกล่องรวม */
const AP_IDS: ApprovalIds = {
  card: "sec-inbox-approval",
  approve: "sec-inbox-approve",
  reject: "sec-inbox-reject",
  edit: "sec-inbox-edit",
  why: "sec-inbox-why",
  auto: "sec-inbox-auto",
  steps: "sec-inbox-steps",
  step: "sec-inbox-step",
  confirm2x: "sec-inbox-confirm2x",
  rejectSheet: "sec-inbox-reject-sheet",
  editSheet: "sec-inbox-edit-sheet",
};

const inTab = (r: InboxRow, tab: Tab) => (tab === "money" ? r.cls.money : tab === "customer" ? r.cls.customer : tab === "delete" ? r.cls.destructive : true);

export default function SecretaryInboxScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { activeTenantId, tenants, switchTenant } = useAuth();
  const name = useSecretaryMe()?.name ?? DEFAULT_SECRETARY_NAME;
  const badge = useZoneBadgeCounts().secretary;

  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [openErr, setOpenErr] = useState<string | null>(null);
  const byId = useRef(new Map<string, InboxRow>());

  const load = useCallback(async () => {
    try {
      const r = await secGet("secretary/inbox", { take: 100 });
      const list = normalizeInbox(r);
      byId.current = new Map(list.map((x) => [x.id, x]));
      setRows(list);
      setOffline(false);
      setNowMs(Date.now());
    } catch {
      setOffline(true);
      setRows((x) => x ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // อนุมัติ/ตีกลับในนามกิจการของรายการ (header x-tenant-id = row.tenantId) — ไม่แตะกิจการ active
  const actions: ApprovalActions = useMemo(
    () => ({
      approve: (item, confirm2x) => {
        const row = byId.current.get(item.id);
        const tenantId = row?.tenantId;
        const body = confirm2x ? { confirm2x: true } : {};
        return item.type === "plan"
          ? secPostId("secretary/plans/[id]/approve", item.id, body, { tenantId })
          : secPostId("secretary/proposals/[id]/approve", item.id, body, { tenantId });
      },
      reject: (item, body) => {
        const tenantId = byId.current.get(item.id)?.tenantId;
        return item.type === "plan"
          ? secPostId("secretary/plans/[id]/reject", item.id, {}, { tenantId })
          : secPostId("secretary/proposals/[id]/reject", item.id, body, { tenantId });
      },
      edit: async () => {},
    }),
    [],
  );
  const onChanged = useCallback(() => {
    void load();
    if (activeTenantId) void refreshZoneBadges();
  }, [load, activeTenantId]);
  const flow = useApprovalFlow({ actions, onChanged, name, ids: AP_IDS });
  const { flash } = flow;
  const clearRef = useRef(flow.clearFlash);
  clearRef.current = flow.clearFlash;
  useEffect(() => {
    if (!flash && !openErr) return;
    const h = setTimeout(() => {
      clearRef.current();
      setOpenErr(null);
    }, 4000);
    return () => clearTimeout(h);
  }, [flash, openErr]);

  // แตะรายการ: กิจการต่างจาก active ⇒ switchTenant ก่อน (รายการของร้านที่เป็นสมาชิกเท่านั้น) แล้วเปิดห้องงาน
  const open = async (r: InboxRow) => {
    setOpenErr(null);
    const target = r.roomId ? `/secretary/room/${r.roomId}` : r.conversationId ? `/chat/${r.conversationId}` : null;
    if (!target) {
      setOpenErr(t("sec.inbox.noRoom"));
      return;
    }
    if (r.tenantId !== activeTenantId && tenants.some((x) => x.tenantId === r.tenantId)) await switchTenant(r.tenantId);
    router.push(target);
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.navigate("/secretary");
  };

  const all = rows ?? [];
  const counts = useMemo(() => {
    const n = (k: Tab) => all.filter((r) => inTab(r, k)).length;
    return { all: all.length, money: n("money"), customer: n("customer"), delete: n("delete") };
  }, [all]);
  const tabs: TabItem[] = (["all", "money", "customer", "delete"] as const).map((k) => ({
    key: k,
    testID: TAB_IDS[k],
    label: t(`sec.inbox.tab.${k}`),
    count: counts[k],
  }));
  const shown = all.filter((r) => inTab(r, tab));
  const groups = useMemo(() => {
    const out: { tenantId: string; tenantName: string; items: InboxRow[] }[] = [];
    for (const r of shown) {
      const g = out.find((x) => x.tenantId === r.tenantId);
      if (g) g.items.push(r);
      else out.push({ tenantId: r.tenantId, tenantName: r.tenantName, items: [r] });
    }
    return out;
  }, [shown]);

  return (
    <AiryScreen testID="sec-inbox">
      <ScrollView testID="sec-inbox-list" contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.bar}>
          <IconBtn testID="sec-inbox-back" icon="chevron-left" label={t("sec.inbox.back")} onPress={back} />
        </View>
        <Text style={[styles.h, { color: c.text }]}>{t("sec.inbox.title")}</Text>
        <Text testID="sec-inbox-sub" style={[styles.sub, { color: c.textMuted }]}>
          {t("sec.inbox.sub", { n: all.length, k: badge })}
        </Text>

        {all.length > 0 ? (
          <View style={styles.tabs}>
            <Tabs testID="sec-inbox-tabs" items={tabs} active={tab} onChange={(k) => setTab(k as Tab)} />
          </View>
        ) : null}

        {rows && all.length === 0 && !offline ? (
          <Glass testID="sec-inbox-empty" style={styles.empty}>
            <Icon name="check-circle" size={28} color={c.status.run} />
            <Text style={[styles.emptyT, { color: c.text }]}>{t("sec.inbox.empty")}</Text>
            <Text style={[styles.emptyS, { color: c.textMuted }]}>{t("sec.inbox.emptySub", { name })}</Text>
          </Glass>
        ) : null}
        {all.length > 0 && shown.length === 0 ? <Text style={[styles.none, { color: c.textMuted }]}>{t("sec.inbox.emptyTab")}</Text> : null}

        {groups.map((g) => (
          <View key={g.tenantId} testID="sec-inbox-group">
            <SectionLabel style={styles.group}>{g.tenantName || g.tenantId}</SectionLabel>
            {g.items.map((r) => (
              <View key={r.id} style={styles.item}>
                <InboxItem
                  row={r}
                  canApprove={r.canApprove}
                  ids={ITEM_IDS}
                  time={roomTime(t, "OPEN", r.createdAt, nowMs)}
                  busy={flow.busyId !== null}
                  mine={flow.busyId === r.id}
                  note={flow.notes[r.id] ?? null}
                  onOpen={() => void open(r)}
                  onReject={() => {
                    if (r.canApprove) flow.startReject(inboxToApproval(r));
                  }}
                  onApprove={() => {
                    if (r.canApprove) void flow.approve(inboxToApproval(r), false);
                  }}
                />
              </View>
            ))}
          </View>
        ))}

        {offline ? (
          <Pressable testID="sec-inbox-retry" accessibilityRole="button" onPress={() => void load()} style={styles.retry}>
            <Text style={[styles.none, { color: c.textMuted }]}>{t("sec.inbox.offline")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {flash || openErr ? (
        <Text testID="sec-inbox-flash" style={[styles.flash, { color: openErr ? c.warn.fg : c.text, backgroundColor: openErr ? c.warn.bg : c.chip.bg }]}>
          {openErr ?? flash}
        </Text>
      ) : null}
      {flow.sheets}
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: 40 },
  bar: { height: 52, flexDirection: "row", alignItems: "center" },
  h: { fontSize: F.title, fontWeight: "700", letterSpacing: -0.5, marginTop: F.v(40), lineHeight: 38 },
  sub: { fontSize: F.sub, lineHeight: 20, marginTop: 4 },
  tabs: { marginTop: F.v(26), marginHorizontal: -2 },
  group: { marginTop: F.v(30), marginBottom: 8 },
  item: { marginBottom: cardGap },
  empty: { marginTop: F.v(60), alignItems: "center", gap: spacing.sm, paddingVertical: 28 },
  emptyT: { fontSize: T.h, fontWeight: "700", textAlign: "center" },
  emptyS: { fontSize: T.sub, lineHeight: 20, textAlign: "center" },
  none: { fontSize: T.sub, textAlign: "center", marginTop: F.v(40) },
  retry: { minHeight: size.iconBtn, justifyContent: "center" },
  flash: { position: "absolute", left: spacing.page, right: spacing.page, bottom: 26, fontSize: T.sub, lineHeight: 20, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, overflow: "hidden", textAlign: "center" },
});
