// แกลเลอรีชิ้นส่วน Airy (dev เท่านั้น) — วาดทุกคอมโพเนนต์ทั้งโหมดสว่างและมืดคู่กัน ใช้ตรวจตาด้วยภาพ (qc/shoot-sec.mjs)
// เปิดได้เฉพาะ __DEV__ หรือ build ของสำเนา QC (EXPO_PUBLIC_QC=1) · ไม่มีลิงก์จากจอ 1.0 · ใน build จริง = เด้งกลับ /secretary
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { Text } from "@/src/components/ui/text";
import {
  Chip,
  Dot,
  Glass,
  IconBtn,
  InputBar,
  Note,
  Orb,
  PrimaryButton,
  SectionLabel,
  Segment,
  Sheet,
  SysBadge,
  SysTag,
  Tabs,
  TopBar,
} from "@/src/components/airy";
import { ThemeProvider, screenBg, useTheme, type SysKey } from "@/src/theme/index";
import { spacing } from "@/src/theme/tokens";

const GALLERY_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_QC === "1";

// ชื่อเต็ม (SYS) + ตัวย่อ (KL) ตาม gen_sec.py
const SYS: { k: SysKey; l: string; b: string }[] = [
  { k: "pos", l: "POS", b: "POS" },
  { k: "crm", l: "CRM", b: "CRM" },
  { k: "bk", l: "จองคิว", b: "คิว" },
  { k: "mem", l: "สมาชิก", b: "สมา" },
  { k: "acc", l: "บัญชี", b: "บัญชี" },
  { k: "kb", l: "บอร์ดงาน", b: "งาน" },
  { k: "chat", l: "แชท", b: "แชท" },
  { k: "dorm", l: "หอพัก", b: "หอ" },
];

function Panel({ mode }: { mode: "light" | "dark" }) {
  return (
    <ThemeProvider mode={mode}>
      <PanelBody mode={mode} />
    </ThemeProvider>
  );
}

function PanelBody({ mode }: { mode: "light" | "dark" }) {
  const { c } = useTheme();
  const [tab, setTab] = useState("all");
  const [seg, setSeg] = useState("a");
  const [chip, setChip] = useState("c1");
  const [sheet, setSheet] = useState(true);
  const id = (s: string) => `gal-${mode}-${s}`;
  return (
    <View style={[styles.panel, screenBg(c)]} testID={id("panel")}>
      <Text style={[styles.h, { color: c.text }]}>{mode === "dark" ? "Dark" : "Light"}</Text>
      <TopBar
        left={
          <>
            <IconBtn testID={id("ib-sec")} icon="message-square" on zone="secretary" />
            <IconBtn testID={id("ib-cust")} icon="inbox" on zone="customers" />
            <IconBtn testID={id("ib-team")} icon="users" on zone="team" />
          </>
        }
        title="TopBar"
        subtitle="subtitle"
        right={<IconBtn testID={id("ib-help")} icon="help-circle" />}
      />
      <SectionLabel>Glass · Orb · Dot</SectionLabel>
      <Glass style={styles.row}>
        <Orb size={44} />
        <Orb size={32} />
        <Dot status="run" />
        <Dot status="wait" />
        <Dot status="done" />
      </Glass>
      <SectionLabel>SysTag · SysBadge</SectionLabel>
      <View style={styles.wrap}>
        {SYS.map((s) => (
          <SysTag key={s.k} sys={s.k} label={s.l} />
        ))}
      </View>
      <View style={styles.wrap}>
        {SYS.map((s) => (
          <SysBadge key={s.k} sys={s.k} label={s.b} solid />
        ))}
      </View>
      <View style={styles.wrap}>
        {SYS.map((s) => (
          <SysBadge key={s.k} sys={s.k} label={s.b} />
        ))}
      </View>
      <SectionLabel>Tabs · Segment · Chip</SectionLabel>
      <Tabs
        testID={id("tabs")}
        active={tab}
        onChange={setTab}
        items={[
          { key: "all", label: "ทั้งหมด" },
          { key: "run", label: "กำลังทำ", count: 3, tone: "run" },
          { key: "wait", label: "รออนุมัติ", count: 2 },
        ]}
      />
      <Segment testID={id("seg")} value={seg} onChange={setSeg} options={[{ key: "a", label: "ครับ" }, { key: "b", label: "ค่ะ" }, { key: "c", label: "ไม่ระบุ" }]} />
      <View style={styles.wrap}>
        <Chip testID={id("chip-c1")} label="สรุปยอดขาย" active={chip === "c1"} onPress={() => setChip("c1")} />
        <Chip testID={id("chip-c2")} label="ใบเสนอราคา" active={chip === "c2"} onPress={() => setChip("c2")} />
      </View>
      <SectionLabel>Note · PrimaryButton · InputBar</SectionLabel>
      <Note>ข้อความกำกับแบบ .note</Note>
      <Note warn>ทำไมต้องอนุมัติ: ออกเอกสารเงิน</Note>
      <View style={styles.gap}>
        <PrimaryButton testID={id("btn")} label="เปิด/ปิดแผ่นล่าง" onPress={() => setSheet((v) => !v)} />
        <PrimaryButton testID={id("btn-off")} label="ยืนยัน" disabled />
        <InputBar testID={id("input")} placeholder="สั่งงาน…" />
      </View>
      <SectionLabel>Sheet</SectionLabel>
      {/* กล่องตัวอย่างสูงคงที่ — Sheet วางทับแบบ absolute ภายในกล่องนี้ (กดปุ่มด้านบนเพื่อปิด/เปิด) */}
      <View style={styles.sheetBox}>
        <Sheet testID={id("sheet")} visible={sheet} onClose={() => setSheet(false)} top={50}>
          <Text style={{ color: c.text }}>Sheet</Text>
        </Sheet>
      </View>
    </View>
  );
}

export default function AiryGallery() {
  if (!GALLERY_ENABLED) return <Redirect href="/secretary" />;
  return (
    <ScrollView testID="sec-gallery">
      <Panel mode="light" />
      <Panel mode="dark" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { padding: spacing.page, paddingTop: 56, gap: 0 },
  h: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 10 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  gap: { gap: 12, marginTop: 12 },
  sheetBox: { height: 220, marginTop: 10, borderRadius: 24, overflow: "hidden" },
});
