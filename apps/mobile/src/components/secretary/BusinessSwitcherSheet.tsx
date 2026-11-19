// แผ่นกิจการ — 17 พ.ย. (เจ้าของอนุมัติแบบ topbar2 จอ 2–4): "แผ่นดึงลงจากขอบบน" แทนชีตล่างเดิม (bizsheet4 · 14 พ.ย.)
// เปิดจาก: แตะไอคอนกิจการ (BizIcon ซ้ายสุดของแถบบน SecTopBar) หรือ "ลากแถบบนลง" (แผ่นตามนิ้ว) · open("switch") = เริ่มที่มุมมองเปลี่ยนกิจการ (แถว "สลับกิจการ" ใน /secretary/settings)
// หน้าตา: แผ่นเดียวต่อเนื่องกับแถบบน (สำเนาแถบวางตรงตำแหน่งเดิมบนแผ่น ⇒ แถบยังเห็นอยู่ด้านบน) · มุมล่างมน 32 · ที่จับล่าง · พื้นมืดใต้แผ่น
//   ปิด = ดันแผ่นขึ้น · แตะพื้นมืด · แตะไอคอนกิจการบนแผ่น · ปุ่มย้อนของ Android · เปิดระบบ/ไปหน้าอื่น
// ① "ระบบของร้าน" (systems): หัว = BizIcon วงกลม + ชื่อกิจการ + "คุณเป็น<บทบาท>" · ขวา 2 ปุ่มกลม (เหมือนเดิม)
//     ⚙ = /business/<tenantId>/settings (OWNER/MANAGER · BIZ_SETTING_ROLES) · บทบาทอื่น (STAFF) ⚙ = /secretary/settings (เลขาของฉัน)
//     ⇄ = ไปมุมมองเปลี่ยนกิจการ
//   ป้าย "ระบบของร้าน" + ลิงก์ "จัดลำดับ" ขวา · ตาราง 4 คอลัมน์ = ช่อง "หน้าหลัก" + ทุกระบบของกิจการ active (store กลาง ./navSystems ← GET secretary/systems
//     ทะเบียนเดียวกับเมนูเว็บ · เรียงตามลำดับของผู้ใช้คนนี้ในร้านนี้) · ไอคอน Feather + สีของระบบ (ธีม c.navSys) · badge แดง = แชทลูกค้าที่ยังไม่อ่าน
//   แตะช่อง = ปิดแผ่น → เหมือนแตะไอคอนเดียวกันบนแถบบน (useOpenSystem: ระบบเว็บ = หน้าระบบ ?open= · แชทลูกค้า = จอ native /customers)
//   จัดลำดับ (จอ 4): กดค้างที่ช่อง หรือแตะ "จัดลำดับ" ⇒ หัวขวาเป็นปุ่มดำ "เสร็จ" · ป้าย = "ลากไอคอนเพื่อจัดลำดับ" · ลากช่องไปวาง
//     (ช่องที่ลาก = ยกขึ้น ขยาย 1.18 มีเงา · ตำแหน่งที่จะวาง = กรอบเส้นประ) · แถบบน "เรียงตามทันทีระหว่างลาก" (setLiveOrder) · "เสร็จ" = บันทึก (PUT systems/order)
//     ปิดแผ่นระหว่างจัดลำดับ = บันทึกเหมือนกด "เสร็จ" (ลำดับที่เห็นบนแถบตอนนั้นคือสิ่งที่เก็บ) · บันทึกล้ม = ข้อความ + โหลดลำดับเดิมกลับ
//   โหลดใหม่ทุกครั้งที่เปิดแผ่น (badge สด) · แคชต่อผู้ใช้+กิจการวาดทันที · ล้ม = ข้อความ + ลองใหม่ (ช่อง "หน้าหลัก" ยังกดได้)
// ② "เปลี่ยนกิจการ" (switch): ‹ กลับ ① · หัว + "เลือกกิจการที่จะทำงาน" · แถวกิจการ (BizIcon วงกลม · ชื่อ · บทบาท หรือ "ใช้อยู่ตอนนี้")
//     แถวที่ใช้อยู่ = กรอบเข้ม + วงกลมทึบมี ✓ · อื่น = วงกลมว่าง · แตะ = switchTenant เดิมของ 1.0 (src/lib/auth-context)
//     → ปิด stack ของโซน (dismissAll) → หน้าเลขา /secretary ของกิจการนั้น · แถวเส้นประ "+ เพิ่มกิจการใหม่" → /business/new (G1)
// BusinessSwitcherHost ครอบ Stack ของโซน (secretary/customers/business _layout + หน้าระบบ index) → SecTopBar เรียก useBusinessSwitcher()
//   ท่าลากลงอยู่ที่แถบบน (SecTopBar) — ขับ `drag.progress` (0 = ปิด · 1 = เปิดสุด) ของ Host นี้ตรงบนเธรด UI · ปล่อยนิ้ว = settle(เปิด/ปิด)
// วาดเป็น View absolute ทับทั้งจอ (Modal ของ RN-web ไม่เรนเดอร์ใน headless) · เปิดอยู่ = ซ่อนปุ่มลอย Lekaa (useLekaaSuppress)
// 17 พ.ย. (เจ้าของสั่งจากเครื่องจริง: ทีม/ปฏิทิน จัดลำดับได้ · เว้นที่เหนือแถวแรก): ตารางมีช่อง "ทีม" "ปฏิทิน" (ช่องในตัว ./navSystems แบบ "home"
//   · badge ทีม/ปฏิทิน · ลากจัดได้ · แตะ = จอ native ของโซน + ปิดแผ่น) · ช่อง "home" ชื่อ "Dashboard" ไอคอน grid
//   ตารางเว้นที่เหนือแถวแรก GRID_TOP (badge ของช่องแถวแรกเคยโดน ScrollView ตัดขอบบน · รวมตอนช่องถูกยกขยาย 1.18 ในโหมดจัดลำดับ)
//   ข้อความ "ยังไม่ได้เปิดระบบ" = ไม่มีช่องที่เป็นระบบของร้าน (ไม่นับช่องในตัว)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackHandler, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector, ScrollView } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { LekaaLoader } from "@/src/components/brand/LekaaLoader";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import { useLekaaSuppress } from "@/src/components/lekaa/core";
import { useAuth } from "@/src/lib/auth-context";
import { BIZ_SETTING_ROLES } from "@/src/api/secretary";
import { BizIcon, SecTopBar, badgeText, type SecTopBarProps } from "./SecTopBar";
import { BUILTIN_KEYS, loadNavSystems, saveNavOrder, setLiveOrder, useNavTiles, type NavTile } from "./navSystems";
import { useOpenSystem } from "./openSystem";
import { useT, type I18nKey } from "@/src/i18n";
import { glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

/** มุมมองของแผ่น: "systems" = ระบบของร้าน (ปริยาย) · "switch" = เปลี่ยนกิจการ */
export type SheetView = "systems" | "switch";
/** ตำแหน่งแถบบนบนจอ (measureInWindow) */
export type BarRect = { x: number; y: number; w: number; h: number };
/** เปิดจากแถบบน: props ของแถบ (วาดสำเนาบนแผ่น) + ตัววัดตำแหน่งแถบ */
export type PanelOpen = { bar?: SecTopBarProps; measure?: (cb: (r: BarRect) => void) => void };
/** ท่าลากลงของแถบบน: progress 0..1 (เธรด UI) · travel = ระยะลากที่เปิดสุด (px) · settle = ปล่อยนิ้ว */
export type PanelDrag = { progress: SharedValue<number>; travel: SharedValue<number>; settle: (open: boolean) => void };
/** open(view | PanelOpen) — ไม่ส่ง/ค่าอื่น (เช่น event ของ onPress) = "systems" */
type Switcher = { open: (v?: SheetView | PanelOpen) => void; begin: (o: PanelOpen) => void; close: () => void; visible: boolean; drag: PanelDrag | null };
const Ctx = createContext<Switcher | null>(null);
const NOOP: Switcher = { open: () => {}, begin: () => {}, close: () => {}, visible: false, drag: null };

/** เปิด/ปิดแผ่นกิจการ · นอก Host (เช่น gallery) = ไม่ทำอะไร */
export function useBusinessSwitcher(): Switcher {
  return useContext(Ctx) ?? NOOP;
}

const OPEN_MS = 260;
const isOpts = (v: unknown): v is PanelOpen => !!v && typeof v === "object" && ("bar" in v || "measure" in v);

/** ครอบ Stack ของโซน — แผ่นอยู่ชั้นบนสุดของโซนนั้น */
export function BusinessSwitcherHost({ children }: { children?: ReactNode }) {
  const hostRef = useRef<View>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [start, setStart] = useState<SheetView>("systems");
  const [bar, setBar] = useState<{ props: SecTopBarProps; top: number; left: number; width: number } | null>(null);
  const [hostH, setHostH] = useState(0);
  const progress = useSharedValue(0);
  const travel = useSharedValue(360);
  const barBottom = useSharedValue(0);
  const fullH = useSharedValue(420);

  /** วางสำเนาแถบบนแผ่นให้ตรงแถบจริง (พิกัดเทียบ Host) */
  const place = useCallback(
    (o?: PanelOpen) => {
      if (!o?.bar || !o.measure || !hostRef.current) {
        setBar(null);
        barBottom.value = 0;
        return;
      }
      const props = o.bar;
      const measure = o.measure;
      hostRef.current.measureInWindow((hx, hy) =>
        measure((r) => {
          const top = r.y - hy;
          setBar({ props, top, left: r.x - hx, width: r.w });
          barBottom.value = top + r.h;
          travel.value = Math.max(1, fullH.value - barBottom.value);
        }),
      );
    },
    [barBottom, travel, fullH],
  );
  const unmount = useCallback(() => setMounted(false), []);
  const animate = useCallback(
    (to: 0 | 1) => {
      progress.value = withTiming(to, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }, (fin) => {
        if (fin && to === 0) scheduleOnRN(unmount);
      });
    },
    [progress, unmount],
  );
  const open = useCallback(
    (v?: SheetView | PanelOpen) => {
      setStart(v === "switch" ? "switch" : "systems");
      place(isOpts(v) ? v : undefined);
      setMounted(true);
      setVisible(true);
      animate(1);
    },
    [place, animate],
  );
  // ลากแถบลง: วางแผ่นไว้ก่อน (progress ตามนิ้ว) — ยังไม่ถือว่าเปิดจนปล่อยนิ้ว
  const begin = useCallback(
    (o: PanelOpen) => {
      setStart("systems");
      place(o);
      setMounted(true);
    },
    [place],
  );
  const settle = useCallback(
    (isOpen: boolean) => {
      setVisible(isOpen);
      animate(isOpen ? 1 : 0);
    },
    [animate],
  );
  const close = useCallback(() => {
    setVisible(false);
    animate(0);
  }, [animate]);
  const drag = useMemo<PanelDrag>(() => ({ progress, travel, settle }), [progress, travel, settle]);
  const value = useMemo(() => ({ open, begin, close, visible, drag }), [open, begin, close, visible, drag]);
  return (
    <Ctx.Provider value={value}>
      <View ref={hostRef} style={styles.host} collapsable={false} onLayout={(e: LayoutChangeEvent) => setHostH(e.nativeEvent.layout.height)}>
        {children}
        {mounted ? (
          <TopPanel
            visible={visible}
            onClose={close}
            onSettle={settle}
            startView={start}
            bar={bar}
            hostH={hostH}
            progress={progress}
            travel={travel}
            barBottom={barBottom}
            fullH={fullH}
          />
        ) : null}
      </View>
    </Ctx.Provider>
  );
}

const ROLE_KEYS: Record<string, I18nKey> = { OWNER: "sec.role.OWNER", MANAGER: "sec.role.MANAGER", STAFF: "sec.role.STAFF" };

function TopPanel({
  visible,
  onClose,
  onSettle,
  startView,
  bar,
  hostH,
  progress,
  travel,
  barBottom,
  fullH,
}: {
  visible: boolean;
  onClose: () => void;
  onSettle: (open: boolean) => void;
  startView: SheetView;
  bar: { props: SecTopBarProps; top: number; left: number; width: number } | null;
  hostH: number;
  progress: SharedValue<number>;
  travel: SharedValue<number>;
  barBottom: SharedValue<number>;
  fullH: SharedValue<number>;
}) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tenants, activeTenantId, switchTenant } = useAuth();
  const [view, setView] = useState<SheetView>(startView);
  const [reorder, setReorder] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const { tiles, loaded, failed, key } = useNavTiles();
  const openSystem = useOpenSystem();
  useLekaaSuppress(true); // แผ่นเปิดอยู่ = ซ่อนปุ่มลอย Lekaa (ไม่บังแผ่น)

  // เปิดแผ่นใหม่ = เริ่มที่ "ระบบของร้าน" (หรือ "เปลี่ยนกิจการ" เมื่อเปิดด้วย open("switch"))
  useEffect(() => {
    if (visible) setView(startView);
  }, [visible, startView]);
  // โหลดระบบใหม่ทุกครั้งที่เปิดแผ่น/สลับกิจการ (badge สด) — ระหว่างโหลดแสดงแคชของผู้ใช้+กิจการนี้
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (visible) void loadNavSystems(key, true);
  }, [visible, key, reload]);

  // จัดลำดับ: บันทึกลำดับที่เห็นอยู่ (ซึ่งแถบบนก็เรียงตามอยู่แล้ว)
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const finishReorder = useCallback(() => {
    setReorder(false);
    if (!key) return setLiveOrder(null);
    const keys = tilesRef.current.map((x) => x.key);
    setSaveErr(false);
    saveNavOrder(key, keys).catch(() => {
      setSaveErr(true);
      void loadNavSystems(key, true);
    });
  }, [key]);
  const reorderRef = useRef(reorder);
  reorderRef.current = reorder;
  const closeAll = useCallback(() => {
    if (reorderRef.current) finishReorder();
    onClose();
  }, [finishReorder, onClose]);
  const settleAll = useCallback(
    (open: boolean) => {
      if (!open && reorderRef.current) finishReorder();
      onSettle(open);
    },
    [finishReorder, onSettle],
  );
  // R-S2.1f: ปุ่มย้อนของ Android ปิดแผ่นก่อน (ไม่ย้อนจอข้างหลัง)
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeAll();
      return true;
    });
    return () => sub.remove();
  }, [visible, closeAll]);

  const me = tenants.find((x) => x.tenantId === activeTenantId);
  const name = me?.name ?? t("sec.tenant.fallback");
  const roleKey = me ? ROLE_KEYS[me.role] : undefined;
  const role = roleKey ? t(roleKey) : (me?.role ?? "");
  const canSet = !!me && BIZ_SETTING_ROLES.includes(me.role);

  function go(path: string) {
    closeAll();
    router.push(path);
  }
  // R-S2.1c: สลับสำเร็จ ⇒ ปิด stack ของโซน (ห้อง/ตั้งค่าของกิจการเดิมไม่ค้าง) แล้วไปหน้าเลขาของกิจการนั้น (bizsheet4 ขั้น 3)
  async function pick(id: string) {
    if (id === activeTenantId) {
      closeAll();
      return;
    }
    await switchTenant(id);
    closeAll();
    if (router.canDismiss()) router.dismissAll();
    router.navigate("/secretary");
  }

  // ── ท่าดันขึ้นปิด (แผ่นตามนิ้ว) — 1 gesture ต่อ GestureDetector 1 ตัว (หัว · ตาราง · ที่จับ) · ตารางปิดท่านี้เมื่อจัดลำดับ/เนื้อหายาวต้องเลื่อน ──
  const closePan = useCallback(
    (enabled: boolean) =>
      Gesture.Pan()
        .activeOffsetY(-12)
        .failOffsetX([-20, 20])
        .enabled(enabled)
        .onUpdate((e) => {
          progress.value = Math.min(1, Math.max(0, 1 + e.translationY / Math.max(1, travel.value)));
        })
        .onEnd((e) => {
          scheduleOnRN(settleAll, !(progress.value < 0.65 || e.velocityY < -700));
        }),
    [progress, travel, settleAll],
  );
  const panHead = useMemo(() => closePan(visible), [closePan, visible]);
  const panBody = useMemo(() => closePan(visible && !reorder && !overflow), [closePan, visible, reorder, overflow]);
  const panGrab = useMemo(() => closePan(visible), [closePan, visible]);

  const top = bar ? bar.top + 52 : insets.top + spacing.md;
  const maxH = Math.max(0, hostH - 24);
  const panelStyle = useAnimatedStyle(() => ({ height: barBottom.value + progress.value * Math.max(0, fullH.value - barBottom.value) }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <View testID="sec-switcher" style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
        <Pressable testID="sec-switcher-dim" onPress={closeAll} accessibilityRole="button" accessibilityLabel={t("sec.panel.close")} style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} />
      </Animated.View>
      <Animated.View testID="sec-panel" style={[styles.panel, { backgroundColor: c.topPanel.bg }, shadow(c.topPanel.shadow), panelStyle]}>
        <View
          style={[styles.content, { maxHeight: maxH || undefined }]}
          onLayout={(e: LayoutChangeEvent) => {
            const h = e.nativeEvent.layout.height;
            fullH.value = h;
            travel.value = Math.max(1, h - barBottom.value);
          }}
        >
          <GestureDetector gesture={panHead}>
            <View style={{ paddingTop: top }}>
              {bar ? (
                <View style={[styles.barCopy, { top: bar.top, left: bar.left, width: bar.width }]}>
                  <SecTopBar {...bar.props} testID="sec-panel-bar" inPanel />
                </View>
              ) : null}
              {view === "systems" ? (
                <View style={styles.pad}>
                  <View style={styles.head}>
                    <BizIcon sz={44} chevron={false} />
                    <View style={styles.flex}>
                      <Text testID="sec-sheet-name" style={[styles.bizName, { color: c.text }]} numberOfLines={1}>
                        {name}
                      </Text>
                      {role ? <Text style={[styles.meta, { color: c.textMuted }]}>{t("sec.sheet.youAre", { role })}</Text> : null}
                    </View>
                    {reorder ? (
                      <Pressable testID="sec-sheet-done" accessibilityRole="button" onPress={finishReorder} style={[styles.done, { backgroundColor: c.accent }]}>
                        <Text style={[styles.doneT, { color: c.onAccent }]}>{t("sec.panel.done")}</Text>
                      </Pressable>
                    ) : (
                      <>
                        {activeTenantId ? (
                          <Pressable
                            testID="sec-sheet-settings"
                            accessibilityRole="button"
                            accessibilityLabel={canSet ? t("bizset.gear", { name }) : t("sec.switch.mySecretary")}
                            hitSlop={6}
                            onPress={() => go(canSet ? `/business/${encodeURIComponent(activeTenantId)}/settings` : "/secretary/settings")}
                            style={[styles.round, { backgroundColor: c.chip.bg }]}
                          >
                            <Icon name="settings" size={18} color={c.textDim} />
                          </Pressable>
                        ) : null}
                        <Pressable
                          testID="sec-sheet-switch"
                          accessibilityRole="button"
                          accessibilityLabel={t("sec.top.switch")}
                          hitSlop={6}
                          onPress={() => setView("switch")}
                          style={[styles.round, { backgroundColor: c.chip.bg }]}
                        >
                          <Icon name="repeat" size={17} color={c.textDim} />
                        </Pressable>
                      </>
                    )}
                  </View>
                  <View style={styles.lb}>
                    <Text style={[styles.lbT, { color: c.text }]}>{reorder ? t("sec.panel.dragHint") : t("sec.panel.systems")}</Text>
                    {reorder || !loaded ? null : (
                      <Pressable testID="sec-sheet-reorder" accessibilityRole="button" hitSlop={8} onPress={() => setReorder(true)}>
                        <Text style={[styles.lbT, { color: c.topPanel.link }]}>{t("sec.panel.reorder")}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ) : (
                <View style={[styles.pad, styles.switchHead]}>
                  <Pressable
                    testID="sec-sheet-back"
                    accessibilityRole="button"
                    accessibilityLabel={t("sec.sheet.back")}
                    hitSlop={6}
                    onPress={() => setView("systems")}
                    style={[styles.round, { backgroundColor: c.chip.bg }]}
                  >
                    <Icon name="chevron-left" size={20} color={c.text} />
                  </Pressable>
                  <Text style={[styles.h, { color: c.text }]}>{t("sec.switch.title")}</Text>
                </View>
              )}
            </View>
          </GestureDetector>

          <GestureDetector gesture={panBody}>
            <ScrollView
              style={styles.scroll}
              scrollEnabled={overflow && !reorder}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.pad}
              onContentSizeChange={(_w, h) => setOverflow(maxH > 0 && h + top + 40 > maxH)}
            >
              {view === "systems" ? (
                <View testID="sec-sheet-systems">
                  <SystemGrid
                    tiles={tiles}
                    reorder={reorder}
                    onReorder={() => setReorder(true)}
                    onOpen={(x) => {
                      if (reorderRef.current) return;
                      openSystem(x.href, x.code);
                    }}
                  />
                  {!loaded && !failed ? <LekaaLoader testID="sec-sheet-loading" style={[styles.state, styles.loaderC]} size={40} /> : null}
                  {failed && !loaded ? (
                    <Pressable testID="sec-sheet-retry" accessibilityRole="button" onPress={() => setReload((k) => k + 1)} style={[glassStyle(c, radii.sugg), styles.row, styles.state]}>
                      <Icon name="wifi-off" size={18} color={c.warn.fg} />
                      <Text style={[styles.meta, styles.flex, { color: c.text }]}>{t("sec.state.error")}</Text>
                      <Icon name="rotate-cw" size={16} color={c.iconDim} />
                    </Pressable>
                  ) : null}
                  {loaded && tiles.every((x) => BUILTIN_KEYS.includes(x.key)) ? <Text style={[styles.meta, styles.state, { color: c.textMuted }]}>{t("sec.sheet.empty")}</Text> : null}
                  {saveErr ? (
                    <Text testID="sec-sheet-save-error" style={[styles.meta, styles.state, { color: c.bad.fg }]}>
                      {t("sec.panel.saveFail")}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View testID="sec-sheet-switcher">
                  <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.switch.sub")}</Text>
                  {tenants.map((row) => {
                    const on = row.tenantId === activeTenantId;
                    const rk = ROLE_KEYS[row.role];
                    return (
                      <Pressable
                        testID={`sec-switch-tenant-${row.tenantId}`}
                        key={row.tenantId}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, checked: on }}
                        onPress={() => void pick(row.tenantId)}
                        style={[glassStyle(c, radii.sugg), styles.row, on && { borderWidth: 2, borderColor: c.text }]}
                      >
                        <BizIcon tenantId={row.tenantId} sz={40} chevron={false} />
                        <View style={styles.flex}>
                          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                            {row.name}
                          </Text>
                          <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>
                            {on ? t("sec.switch.active") : rk ? t(rk) : row.role}
                          </Text>
                        </View>
                        {on ? (
                          <View style={[styles.radio, { backgroundColor: c.text, borderColor: c.text }]}>
                            <Icon name="check" size={14} color={c.surface} />
                          </View>
                        ) : (
                          <View style={[styles.radio, { borderColor: c.iconDim }]} />
                        )}
                      </Pressable>
                    );
                  })}
                  <Pressable testID="sec-switch-add" accessibilityRole="button" onPress={() => go("/business/new")} style={[styles.row, styles.add, { borderColor: c.divider }]}>
                    <Icon name="plus" size={18} color={c.textMuted} />
                    <Text style={[styles.name, styles.flex, { color: c.textDim }]}>{t("sec.switch.add")}</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </GestureDetector>
          <View style={styles.grabSpace} />
        </View>
        <GestureDetector gesture={panGrab}>
          <View testID="sec-sheet-grab" style={[styles.grabZone, { backgroundColor: c.topPanel.bg }]}>
            <View style={[styles.grab, { backgroundColor: c.sheet.grab }]} />
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

// ───────── ตาราง 4 คอลัมน์ + จัดลำดับด้วยการลาก (topbar2 จอ 4) ─────────
/** ระยะแถว (แบบ: ไอคอน 56 + ช่อง 6 + ป้าย 1 บรรทัด ≈ 18 + ช่องแถว 14) */
const CELL_H = 80;
const STRIDE = 94;
const ICON = 56;
const LONG_PRESS_MS = 350;
/** ที่ว่างเหนือแถวแรก (17 พ.ย.): badge อยู่เหนือไอคอน 5 · ตอนยกขยาย 1.18 ขึ้นไปอีก ~5 ⇒ ≥ 12 ไม่โดนขอบ ScrollView ตัด */
const GRID_TOP = 14;

function SystemGrid({ tiles, reorder, onReorder, onOpen }: { tiles: NavTile[]; reorder: boolean; onReorder: () => void; onOpen: (x: NavTile) => void }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const cellW = w / 4;
  const rows = Math.max(1, Math.ceil(tiles.length / 4));
  const keysRef = useRef(tiles.map((x) => x.key));
  keysRef.current = tiles.map((x) => x.key);

  const onStart = useCallback(
    (k: string) => {
      setDragKey(k);
      onReorder();
      setLiveOrder(keysRef.current);
    },
    [onReorder],
  );
  // ตำแหน่งวางเปลี่ยน ⇒ เรียงใหม่ทันที (แถบบนเรียงตามจาก store เดียวกัน)
  const onTarget = useCallback((k: string, to: number) => {
    const keys = keysRef.current.filter((x) => x !== k);
    keys.splice(Math.max(0, Math.min(keys.length, to)), 0, k);
    keysRef.current = keys;
    setLiveOrder(keys);
  }, []);
  const onEnd = useCallback(() => setDragKey(null), []);
  const dragIdx = dragKey ? tiles.findIndex((x) => x.key === dragKey) : -1;

  return (
    <View style={[styles.grid, { height: rows * STRIDE - (STRIDE - CELL_H) }]} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && dragIdx >= 0 ? (
        <View
          testID="sec-sheet-slot"
          pointerEvents="none"
          style={[styles.slotBox, { left: (dragIdx % 4) * cellW + (cellW - ICON) / 2, top: Math.floor(dragIdx / 4) * STRIDE, borderColor: c.topPanel.slot }]}
        />
      ) : null}
      {w > 0
        ? tiles.map((x, i) => (
            <GridTile
              key={x.key}
              tile={x}
              index={i}
              count={tiles.length}
              cellW={cellW}
              reorder={reorder}
              dragging={x.key === dragKey}
              onStart={onStart}
              onTarget={onTarget}
              onEnd={onEnd}
              onOpen={onOpen}
            />
          ))
        : null}
    </View>
  );
}

function GridTile({
  tile,
  index,
  count,
  cellW,
  reorder,
  dragging,
  onStart,
  onTarget,
  onEnd,
  onOpen,
}: {
  tile: NavTile;
  index: number;
  count: number;
  cellW: number;
  reorder: boolean;
  dragging: boolean;
  onStart: (k: string) => void;
  onTarget: (k: string, to: number) => void;
  onEnd: () => void;
  onOpen: (x: NavTile) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const x = useSharedValue((index % 4) * cellW);
  const y = useSharedValue(Math.floor(index / 4) * STRIDE);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const last = useSharedValue(index);
  const idx = useSharedValue(index);
  const active = useSharedValue(false);
  const lift = useSharedValue(0);
  const prevW = useRef(cellW);
  // ช่องอื่นเลื่อนไปที่ใหม่แบบนุ่ม · ช่องที่กำลังลากไม่ถูกดึง · ความกว้างเปลี่ยน (หมุนจอ) = วางตรงทันที
  useEffect(() => {
    idx.value = index;
    if (active.value) return;
    const tx = (index % 4) * cellW;
    const ty = Math.floor(index / 4) * STRIDE;
    if (prevW.current !== cellW) {
      prevW.current = cellW;
      x.value = tx;
      y.value = ty;
    } else {
      x.value = withTiming(tx, { duration: 180 });
      y.value = withTiming(ty, { duration: 180 });
    }
  }, [index, cellW, x, y, idx, active]);

  const key = tile.key;
  const pan = useMemo(() => {
    const g = Gesture.Pan();
    // จัดลำดับอยู่ = ลากได้ทันที · ปกติ = กดค้าง 350ms ก่อน (แตะสั้น = เปิดระบบ)
    (reorder ? g.minDistance(4) : g.activateAfterLongPress(LONG_PRESS_MS))
      .onStart(() => {
        active.value = true;
        sx.value = x.value;
        sy.value = y.value;
        last.value = idx.value;
        lift.value = withTiming(1, { duration: 120 });
        scheduleOnRN(onStart, key);
      })
      .onUpdate((e) => {
        x.value = sx.value + e.translationX;
        y.value = sy.value + e.translationY;
        const col = Math.min(3, Math.max(0, Math.round(x.value / Math.max(1, cellW))));
        const row = Math.max(0, Math.round(y.value / STRIDE));
        const to = Math.min(count - 1, row * 4 + col);
        if (to !== last.value) {
          last.value = to;
          scheduleOnRN(onTarget, key, to);
        }
      })
      .onFinalize(() => {
        if (!active.value) return;
        active.value = false;
        lift.value = withTiming(0, { duration: 140 });
        x.value = withTiming((last.value % 4) * cellW, { duration: 160 });
        y.value = withTiming(Math.floor(last.value / 4) * STRIDE, { duration: 160 });
        scheduleOnRN(onEnd);
      });
    return g;
  }, [reorder, cellW, count, key, onStart, onTarget, onEnd, x, y, sx, sy, last, idx, active, lift]);

  const pos = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }], zIndex: active.value ? 10 : 1 }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.18 * lift.value }] }));
  const n = badgeText(tile.badge);
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.tile, { width: cellW }, pos]}>
        <Pressable
          testID={`sec-sheet-sys-${tile.key}`}
          accessibilityRole="button"
          accessibilityLabel={reorder ? t("sec.panel.reorderA11y", { name: tile.label }) : n ? `${tile.label} · ${t("sec.sheet.unread", { n: tile.badge })}` : tile.label}
          disabled={reorder}
          onPress={() => onOpen(tile)}
          style={styles.tileIn}
        >
          <Animated.View style={[styles.tileIc, { backgroundColor: tile.bg }, dragging && shadow(c.topPanel.lift), icon]}>
            <Icon name={tile.icon} size={24} color={tile.fg} />
            {n ? (
              <View testID={`sec-sheet-sys-${tile.key}-badge`} pointerEvents="none" style={[styles.badge, { backgroundColor: c.danger.bg, borderColor: c.surface }]}>
                <Text style={[styles.badgeT, { color: c.danger.fg }]}>{n}</Text>
              </View>
            ) : null}
          </Animated.View>
          <Text style={[styles.tileT, { color: c.textDim }, dragging && styles.hidden]} numberOfLines={1}>
            {tile.label}
          </Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  loaderC: { alignSelf: "center" },
  host: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  // แผ่น (.drop): ชิดขอบบน เต็มกว้าง มุมล่างมน 32 · สำเนาแถบบนวางตรงที่เดิม (barCopy) · เนื้อหาขอบข้าง 18
  panel: { position: "absolute", left: 0, right: 0, top: 0, overflow: "hidden", borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  content: { position: "absolute", left: 0, right: 0, top: 0 },
  barCopy: { position: "absolute", height: 52 },
  pad: { paddingHorizontal: 18 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18 },
  bizName: { fontSize: T.h, fontWeight: "700", lineHeight: 22 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  done: { paddingHorizontal: 18, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  doneT: { fontSize: T.sub, fontWeight: "700" },
  lb: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18, marginBottom: 8, marginHorizontal: 4 },
  lbT: { fontSize: T.cap, fontWeight: "700", lineHeight: 18 },
  grid: { position: "relative", marginTop: GRID_TOP },
  tile: { position: "absolute", left: 0, top: 0, height: CELL_H, alignItems: "center" },
  tileIn: { alignItems: "center", gap: 6 },
  tileIc: { width: ICON, height: ICON, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tileT: { fontSize: T.cap - 1, lineHeight: 18, textAlign: "center", paddingHorizontal: 2 },
  hidden: { opacity: 0 },
  slotBox: { position: "absolute", width: ICON, height: ICON, borderRadius: 18, borderWidth: 2, borderStyle: "dashed" },
  badge: { position: "absolute", top: -5, right: -7, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 10.5, fontWeight: "700", lineHeight: 13 },
  state: { marginTop: spacing.lg },
  grabSpace: { height: 30 },
  grabZone: { position: "absolute", left: 0, right: 0, bottom: 0, height: 26, alignItems: "center", justifyContent: "flex-end", paddingBottom: 9 },
  grab: { width: 40, height: 5, borderRadius: 3 },
  switchHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 18, marginBottom: spacing.xs },
  h: { fontSize: T.lt - 4, fontWeight: "700", lineHeight: 30 },
  sub: { fontSize: T.cap, lineHeight: 18, marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  add: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: radii.sugg, paddingVertical: spacing.lg },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  name: { fontSize: T.body, fontWeight: "600", lineHeight: 22 },
  meta: { fontSize: T.cap, lineHeight: 18 },
});
