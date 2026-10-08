// แกลเลอรีคอมโพเนนต์ของจอ "ทีมพนักงาน AI" (Liquid Glass · Airy) — เส้นทางสำหรับนักพัฒนา/QC เท่านั้น (ใบ T0.3)
//   /team/_gallery            → คอมโพเนนต์ครบ 15 ตัว ตัวละ 1 ชิ้น (testID gallery-<ชื่อ>) · โหมดสว่าง/มืดตาม useTheme()
//   /team/_gallery?screen=a8  → จอพิสูจน์ A8 "ยังไม่มีทีม" ประกอบจากคอมโพเนนต์ชุดเดียวกัน (จอจริงของ A8 มาในใบ T2.2)
// เปิดได้เมื่อ __DEV__ หรือ build ด้วย EXPO_PUBLIC_TEAM_GALLERY=1 เท่านั้น (web export ของ QC เป็น production bundle: __DEV__ = false)
//   นอกนั้นเด้งกลับหน้าแรก — ไม่มีเมนูใดในแอปชี้มาที่นี่
// ข้อความไทยในไฟล์นี้ = คัดจาก HTML ของ mockup (ai-team-airy-a.html หน้า 8) · เป็น literal ชั่วคราวจนกว่า i18n `team.*` ของ T0.4 จะมา
//   ชื่อแพ็ก ("แพ็กฟรี") = ตัวแทนของ key team.pack.<PACK> (T0.4)
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { api, apiErrorText } from "@/src/api/client";
import { getThemeOverride, setThemeOverride, useTheme } from "@/src/theme";
import { AvatarStack } from "@/src/components/team/AvatarStack";
import { Backdrop } from "@/src/components/team/Backdrop";
import { BottomSheet } from "@/src/components/team/BottomSheet";
import { EmptyState } from "@/src/components/team/EmptyState";
import { ErrorState } from "@/src/components/team/ErrorState";
import { GlassCard } from "@/src/components/team/GlassCard";
import { ListRow } from "@/src/components/team/ListRow";
import { Orb, type OrbDepartment } from "@/src/components/team/Orb";
import { PillTabs } from "@/src/components/team/PillTabs";
import { PrimaryButton } from "@/src/components/team/PrimaryButton";
import { QuotaRing } from "@/src/components/team/QuotaRing";
import { SearchField } from "@/src/components/team/SearchField";
import { SectionTitle } from "@/src/components/team/SectionTitle";
import { Segmented } from "@/src/components/team/Segmented";
import { Skeleton } from "@/src/components/team/Skeleton";
import { StatCard } from "@/src/components/team/StatCard";
import { TeamText } from "@/src/components/team/TeamText";
import { useGlass } from "@/src/components/team/glass";

const ENABLED = __DEV__ || process.env.EXPO_PUBLIC_TEAM_GALLERY === "1";

export default function TeamGalleryRoute() {
  const { screen } = useLocalSearchParams<{ screen?: string }>();
  if (!ENABLED) return <Redirect href="/" />;
  return screen === "a8" ? <A8Proof /> : <Gallery />;
}

// ───────────────────────── A8 · ยังไม่มีทีม ─────────────────────────
// รูปร่างคำตอบ (เฉพาะ field ที่จอนี้ใช้) — สัญญาเต็ม: docs/api/AI-TEAM-MOBILE-API.md
type Summary = {
  tenant: { id: string; name: string };
  pack: "FREE" | "STARTER" | "PRO" | "BUSINESS";
  people: { count: number; avatars: { userId: string; name: string; initial: string }[] };
  aiCount: number;
};
type Employees = { employees: { id: string; name: string; orbColor: string }[] };
type Recommend = { recommendations: { key: string; label: string; reason: string }[] };
type A8Data = { summary: Summary; employees: Employees; recommend: Recommend };

const DEPARTMENTS: OrbDepartment[] = ["sales", "chat", "account", "content", "member", "custom"];
const asDepartment = (key: string): OrbDepartment => (DEPARTMENTS.includes(key as OrbDepartment) ? (key as OrbDepartment) : "custom");
const PACK_LABEL: Record<Summary["pack"], string> = { FREE: "แพ็กฟรี", STARTER: "แพ็กเริ่มต้น", PRO: "แพ็กโปร", BUSINESS: "แพ็กธุรกิจ" };

function A8Proof() {
  const { colors, tokens } = useTheme();
  const glass = useGlass();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<A8Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([api<Summary>("/api/mobile/team/summary"), api<Employees>("/api/mobile/team/employees"), api<Recommend>("/api/mobile/team/positions/recommend")])
      .then(([summary, employees, recommend]) => {
        if (alive) setData({ summary, employees, recommend });
      })
      .catch((e: unknown) => {
        if (alive) setError(apiErrorText(e));
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const noop = useCallback(() => {}, []);

  const s = tokens.spacing;
  const z = tokens.size;
  const top = Math.max(insets.top, s.statusZone) + (s.pageTop - s.statusZone);
  const footBottom = Math.max(insets.bottom + s.titleGap, s.footBottom);
  const slop = (z.touchMin - z.iconButton) / 2;

  return (
    <View testID="team-a8" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: top, paddingHorizontal: s.pageX, paddingBottom: footBottom + z.button + s.sectionTop }} showsVerticalScrollIndicator={false}>
        {/* แถบบน: + จ้าง · กองอวาตาร์ (คน + AI) */}
        <View style={{ height: s.barHeight, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: s.barGap }}>
          <Pressable
            testID="team-a8-hire"
            onPress={noop}
            hitSlop={slop}
            accessibilityRole="button"
            accessibilityLabel="จ้างพนักงาน AI"
            style={[glass, { width: z.iconButton, height: z.iconButton, borderRadius: tokens.radii.full, alignItems: "center", justifyContent: "center" }]}
          >
            <Feather name="plus" size={z.icon} color={colors.iconStrong} />
          </Pressable>
          {data ? (
            <AvatarStack
              testID="team-a8-avatars"
              people={data.summary.people.avatars.map((p) => ({ name: p.name, initial: p.initial }))}
              ai={data.employees.employees.map((e) => ({ department: asDepartment(e.orbColor), name: e.name }))}
            />
          ) : (
            <Skeleton height={z.avatar} width={z.avatar} radius={tokens.radii.full} />
          )}
        </View>

        {error ? (
          <ErrorState testID="team-a8-error" message={error} retryLabel="ลองใหม่" onRetry={retry} style={{ marginTop: z.heroArt }} />
        ) : !data ? (
          <View style={{ marginTop: s.titleTop, gap: s.cardGap }}>
            <Skeleton height={tokens.type.title.lineHeight} width="60%" />
            <Skeleton height={tokens.type.subtitle.lineHeight} width="40%" />
            <Skeleton height={z.heroArt} style={{ marginTop: s.heroTop }} />
            <Skeleton height={z.orbRow + s.cardPadV * 2} radius={tokens.radii.card} />
            <Skeleton height={z.orbRow + s.cardPadV * 2} radius={tokens.radii.card} />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: s.titleGap, marginTop: s.titleTop }}>
              <TeamText accessibilityRole="header" style={[tokens.type.title, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
                {data.summary.tenant.name}
              </TeamText>
              <Feather name="chevron-down" size={z.titleChevron} color={colors.textDim} />
            </View>
            <TeamText style={[tokens.type.subtitle, { color: colors.textDim, marginTop: s.titleGap }]} numberOfLines={1}>
              {`ยังไม่มีทีม AI · ${PACK_LABEL[data.summary.pack]}`}
            </TeamText>

            <EmptyState
              testID="team-a8-empty"
              style={{ marginTop: s.heroTop }}
              title="ยังไม่มีพนักงาน AI"
              body={"จ้างคนแรกได้ใน 1 นาที · ไม่มีค่าจ้างเพิ่ม\nจ้างได้ไม่จำกัด ใช้โควตาแพ็กของร้าน"}
              art={
                // กลุ่มลูกแก้ว 3 ลูก — ตำแหน่ง = gen_airy_full.py:87 × 390/536 (กรอบ .cl กว้างเท่าเนื้อหา 346 pt สูง 138 pt)
                <View style={{ alignSelf: "stretch", height: z.heroArt }}>
                  <Orb department="chat" size={z.orbHeroSide} style={{ position: "absolute", left: 71.5, top: 33.5 }} />
                  <Orb department="sales" size={z.orbHero} style={{ position: "absolute", left: 129.5, top: 4.5 }} />
                  <Orb department="account" size={z.orbHeroSmall} style={{ position: "absolute", left: 215.5, top: 54 }} />
                </View>
              }
            />

            <SectionTitle title="แนะนำสำหรับร้านคุณ" />
            {data.recommend.recommendations.map((r, i) => (
              <ListRow
                key={r.key}
                testID={`team-a8-recommend-${r.key}`}
                title={r.label}
                subtitle={r.reason}
                highlighted={i === 0}
                chevron
                onPress={noop}
                left={<Orb department={asDepartment(r.key)} size={z.orbRow} />}
                style={{ marginTop: s.cardGap }}
              />
            ))}
          </>
        )}
      </ScrollView>
      <View style={{ position: "absolute", left: s.footX, right: s.footX, bottom: footBottom }}>
        <PrimaryButton testID="team-a8-positions" label="ดูตำแหน่งทั้งหมด" onPress={noop} />
      </View>
    </View>
  );
}

// ───────────────────────── แกลเลอรี ─────────────────────────
function Gallery() {
  const { mode, colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState("all");
  const [seg, setSeg] = useState<string>(getThemeOverride() ?? "system");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(true);
  const s = tokens.spacing;
  const z = tokens.size;
  const noop = useCallback(() => {}, []);
  const pickTheme = useCallback((key: string) => {
    setSeg(key);
    void setThemeOverride(key === "light" || key === "dark" ? key : null);
  }, []);
  const caption = (text: string) => (
    <TeamText style={[tokens.type.section, { color: colors.section, marginTop: s.sectionTop, marginBottom: s.cardGap, marginLeft: s.sectionLeft }]}>{text}</TeamText>
  );

  return (
    <View testID="team-gallery" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: Math.max(insets.top, s.statusZone), paddingHorizontal: s.pageX, paddingBottom: insets.bottom + s.sectionTop * 2 }}>
        <TeamText style={[tokens.type.title, { color: colors.text }]}>Team components</TeamText>
        <TeamText style={[tokens.type.subtitle, { color: colors.textDim, marginTop: s.titleGap }]}>{`Liquid Glass · Airy · โหมด ${mode}`}</TeamText>

        {caption("SEGMENTED · โหมดสี (บังคับ / ตามเครื่อง)")}
        <Segmented
          testID="gallery-segmented"
          value={seg}
          onChange={pickTheme}
          options={[
            { key: "system", label: "ตามเครื่อง" },
            { key: "light", label: "สว่าง" },
            { key: "dark", label: "มืด" },
          ]}
        />

        {caption("PILL TABS")}
        <PillTabs
          testID="gallery-pill-tabs"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "ทั้งหมด" },
            { key: "waiting", label: "รออนุมัติ", count: 3 },
            { key: "working", label: "กำลังทำ" },
            { key: "done", label: "เสร็จแล้ว" },
          ]}
        />

        {caption("SEARCH FIELD")}
        <SearchField testID="gallery-search-field" value={query} onChangeText={setQuery} placeholder={'ค้นหาตำแหน่ง เช่น "ตอบแชท"'} />

        {caption("ORB · 6 แผนก")}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Orb testID="gallery-orb" department="sales" size={z.orbRow} initial="อ" status="ok" />
          <Orb department="chat" size={z.orbRow} status="warn" />
          <Orb department="account" size={z.orbRow} status="idle" />
          <Orb department="content" size={z.orbRow} />
          <Orb department="member" size={z.orbRow} />
          <Orb department="custom" size={z.orbRow} />
          <Orb department="sales" size={z.orbHeroSmall} />
        </View>

        {caption("AVATAR STACK · คน + AI")}
        <View style={{ flexDirection: "row" }}>
          <AvatarStack
            testID="gallery-avatar-stack"
            people={[
              { name: "สมใจ", initial: "ส" },
              { name: "ธนา", initial: "ธ" },
            ]}
            ai={[{ department: "sales" }, { department: "chat" }, { department: "account" }, { department: "content" }]}
          />
        </View>

        {caption("STAT CARD · QUOTA RING")}
        <View style={{ flexDirection: "row", gap: s.cardGap, alignItems: "center" }}>
          <StatCard testID="gallery-stat-card" value="12" label="งานวันนี้" />
          <StatCard value="3" label="รออนุมัติ" tone="warn" />
          <QuotaRing testID="gallery-quota-ring" pct={62} label="โควตา" />
        </View>

        {caption("GLASS CARD")}
        <GlassCard testID="gallery-glass-card">
          <TeamText style={[tokens.type.rowTitle, { color: colors.text }]}>การ์ดแก้ว</TeamText>
          <TeamText style={[tokens.type.rowSub, { color: colors.textSub, marginTop: s.subTop }]}>พื้นโปร่ง ขอบขาว เงานุ่ม · มี padding ในเสมอ</TeamText>
        </GlassCard>

        <SectionTitle testID="gallery-section-title" title="SECTION TITLE · LIST ROW" />
        <ListRow
          testID="gallery-list-row"
          title="แอดมินตอบแชท"
          subtitle="แชทรอตอบ 12 ห้อง · ตอบช้าเฉลี่ย 2 ชม."
          highlighted
          chevron
          onPress={noop}
          left={<Orb department="chat" size={z.orbRow} />}
          style={{ marginTop: s.cardGap }}
        />
        <ListRow title="ผู้ช่วยบัญชี" subtitle="มีใบแจ้งหนี้ค้างส่ง 7 ใบ" chevron left={<Orb department="account" size={z.orbRow} />} style={{ marginTop: s.cardGap }} />

        {caption("PRIMARY BUTTON")}
        <PrimaryButton testID="gallery-primary-button" label="ดูตำแหน่งทั้งหมด" onPress={noop} />
        <PrimaryButton label="ปิดใช้งาน" onPress={noop} disabled style={{ marginTop: s.cardGap }} />

        {caption("EMPTY STATE")}
        <EmptyState testID="gallery-empty-state" title="ยังไม่มีพนักงาน AI" body={"จ้างคนแรกได้ใน 1 นาที · ไม่มีค่าจ้างเพิ่ม"} art={<Orb department="sales" size={z.orbHeroSmall} />} />

        {caption("ERROR STATE")}
        <ErrorState testID="gallery-error-state" message="เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่" retryLabel="ลองใหม่" onRetry={noop} />

        {caption("SKELETON")}
        <Skeleton testID="gallery-skeleton" height={z.orbRow + s.cardPadV * 2} radius={tokens.radii.card} />
        <Skeleton height={tokens.type.rowSub.lineHeight} width="55%" style={{ marginTop: s.cardGap }} />

        {caption("BOTTOM SHEET · ในกรอบตัวอย่าง")}
        <View style={{ height: 230, borderRadius: tokens.radii.card, overflow: "hidden" }}>
          <View style={{ padding: s.cardPadH }}>
            <PrimaryButton label="เปิดแผ่นล่าง" onPress={() => setSheet(true)} />
          </View>
          <BottomSheet testID="gallery-bottom-sheet" visible={sheet} onClose={() => setSheet(false)} closeLabel="ปิด">
            <TeamText style={[tokens.type.rowTitle, { color: colors.text }]}>สลับกิจการ</TeamText>
            <TeamText style={[tokens.type.rowSub, { color: colors.textSub, marginTop: s.subTop }]}>Sweet Studio · แตะพื้นหลังเพื่อปิด</TeamText>
          </BottomSheet>
        </View>
      </ScrollView>
    </View>
  );
}
