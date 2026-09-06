"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Topbar, type TopbarBranding } from "./Topbar";
import { NavDrawer, type NavItem, type SoonItem, type TenantOption } from "./NavDrawer";
import { AiDock } from "./AiDock";
import { AddSystemModal } from "./AddSystemModal";
import { NavRail, isRailPath } from "./NavRail";
import { SwipeEdge } from "./SwipeEdge";
import { IssueReportSheet } from "./IssueReportSheet";
import { useInApp } from "./use-in-app";
import { loadNavBadgesAction } from "@/lib/support/actions";
import { setNavCollapsedAction } from "@/lib/core/preferences-actions";

// โครงแอปฝั่ง client: จัดการสถานะเปิด/ปิด drawer
// help-v2: เอาศูนย์ช่วยเหลือออก — แจ้งปัญหาผ่านแชท AI แทน (ทีมงานตอบกลับในห้องเดิม)
// รับข้อมูลที่ดึงจาก DB มาจาก layout (server) เป็น props — ตัว shell ไม่แตะ DB เอง
export function AppShell({
  tenantName,
  userEmail,
  items,
  soon,
  openedCodes,
  memberships,
  activeTenantId,
  branding,
  navTone,
  navCollapsed = false,
  chatSystemIds = [],
}: {
  tenantName: string;
  userEmail: string;
  items: NavItem[];
  soon: SoonItem[];
  openedCodes: string[];
  memberships: TenantOption[];
  activeTenantId: string;
  /** ตราสัญลักษณ์ + ชื่อที่แสดงของร้าน (จาก getBrandingTokens ใน layout) */
  branding: TopbarBranding;
  /** โทนแถบเมนูของร้าน (LIGHT/BRAND/DARK) — สีจริงมาจาก CSS var ที่ ThemeRoot ตั้งไว้ */
  navTone: "LIGHT" | "BRAND" | "DARK";
  /** สถานะย่อ/ขยายแถบเมนูที่ผู้ใช้จำไว้ (User.prefs.navCollapsed) */
  navCollapsed?: boolean;
  /** id ของระบบแชทที่ร้านเปิดใช้ (มาจาก layout — ว่าง = ไม่ถามตัวเลขข้อความค้างเลย) */
  chatSystemIds?: string[];
}) {
  const [drawer, setDrawer] = useState(false);
  // แผ่นแจ้งปัญหาที่เปิดจาก "ท้ายเมนู" (จอเล็ก/แอป) — ตัวที่เปิดจากปุ่มบนแถบบนอยู่ใน Topbar เอง
  const [issueOpen, setIssueOpen] = useState(false);
  // ย่อ/ขยายแถบเมนู — เริ่มจากค่าที่ผู้ใช้จำไว้ (server) แล้ว optimistic ทันทีที่กด
  const [collapsed, setCollapsed] = useState(navCollapsed);
  useEffect(() => setCollapsed(navCollapsed), [navCollapsed]);
  // Modal เพิ่มระบบ (กลางจอ) — เปิดจากปุ่มใน drawer หรือ deep-link ?add-system=1 (จากเช็กลิสต์ "ทำต่อ")
  const [addSystemOpen, setAddSystemOpen] = useState(false);
  // ?add-system=<CODE> จาก checklist → เปิด modal พร้อมเลือกระบบนั้นให้เลย (เข้าจังหวะตั้งชื่อทันที)
  const [addSystemPreselect, setAddSystemPreselect] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // เปิด modal เมื่อมี query ?add-system=1 แล้วลบ query ทิ้ง (กันเปิดซ้ำตอน refresh/back)
  useEffect(() => {
    const want = searchParams.get("add-system");
    if (want) {
      if (want !== "1") setAddSystemPreselect(want); // ?add-system=<CODE> → เลือกระบบนั้นให้เลย (จาก checklist)
      setAddSystemOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);
  // perf A: โหลด badge แชท AI หลังหน้าโผล่ (ไม่บล็อกการเปลี่ยนหน้า)
  const [aiUnread, setAiUnread] = useState(0);
  // badge "ข้อความลูกค้ายังไม่ได้อ่าน" ราย systemId → ใช้เป็น badges ของ NavDrawer (คีย์ `s-<id>`)
  const [navBadges, setNavBadges] = useState<Record<string, number>>({});
  // เปิดจากแอปมือถือ (WebView ส่ง UA "SharkApp") → ซ่อน orb เว็บ (แอปมีปุ่ม AI native ของตัวเอง — กัน orb ซ้อน)
  // + ไม่ปักแถบเมนูซ้าย (แอปมีเมนูของตัวเอง และจอมือถือไม่มีที่พอ)
  const inApp = useInApp();
  // 🔴 ต้นทุน query ของ badge เมนู — ตั้งใจให้ "ไม่ผูกกับการเรนเดอร์":
  //  · ยิง 1 ครั้งตอน app shell mount (layout ไม่ re-mount ตอนเปลี่ยนหน้า ⇒ ไม่ใช่ต่อหน้า)
  //  · ยิงซ้ำเฉพาะตอนผู้ใช้ "กดเปิดเมนู" เอง (ท่าทางของคน = มีขอบเขต ไม่ใช่ polling)
  //  · ร้านที่ไม่ได้เปิดระบบแชท → ids ว่าง → server ไม่แตะตารางแชทเลย (ดู loadNavBadgesAction)
  //  · ใช้ round-trip เดิมของ badge AI ที่มีอยู่แล้ว — ไม่มีคำขอใหม่เพิ่ม
  const chatKey = chatSystemIds.join(","); // dep ที่เสถียร (อาเรย์จาก server สร้างใหม่ทุกครั้ง)
  const refreshBadges = useCallback(() => {
    const ids = chatKey ? chatKey.split(",") : [];
    loadNavBadgesAction(ids)
      .then((b) => {
        setAiUnread(b.aiUnread);
        // NavItem ของระบบ feature ใช้คีย์ `s-<systemId>` — map ให้ตรงกับ layout
        setNavBadges(
          Object.fromEntries(Object.entries(b.chatUnread).map(([id, n]) => [`s-${id}`, n])),
        );
      })
      .catch(() => {});
  }, [chatKey]);
  useEffect(() => {
    refreshBadges();
  }, [refreshBadges]);

  // WO-CV12: หน้ากล่องแชทเต็มจอ = `/app/sys/<id>` ของระบบที่เป็นแชท (หน้าย่อยอย่าง /chat/channels ไม่นับ)
  // 🔴 ตัดสินจากทะเบียนที่ layout ส่งมา + pathname — ไม่ฮาร์ดโค้ด id และไม่ให้หน้าไปแตะ DOM ของ shell
  const chatFullscreen = chatSystemIds.some((id) => pathname === `/app/sys/${id}`);
  // K1.5: หน้าบอร์ดงาน (`/app/sys/<id>/kanban/b/<boardId>`) ยุบแถบเมนูปักซ้าย 288px เป็นรางไอคอน 56px
  //   (พิมพ์เขียว 13-kanban-v2 §3.2 + ภาพ 02) — โมดูลอื่นไม่กระทบ เพราะตัดสินจาก pathname ที่นี่ที่เดียว
  //   ระยะขอบซ้ายของเนื้อหาคิดคู่กันใน AppMain
  // B3: รางไอคอนใช้ได้ทุกหน้าแล้ว — ผู้ใช้เป็นคนเลือก (จำต่อบัญชี) · หน้าบอร์ดงานยัง "บังคับ" ราง (K1.5)
  const boardRail = isRailPath(pathname);
  const railMode = collapsed || boardRail;
  // เปลี่ยนสถานะ = optimistic ทันที + บอก AppMain (พี่น้องกันใน layout) + จำลง prefs ของผู้ใช้เบื้องหลัง
  const applyCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    window.dispatchEvent(new CustomEvent("app:nav-collapsed", { detail: { collapsed: next } }));
    setNavCollapsedAction(next).catch(() => {});
  }, []);
  // 🔴 บอก "แอป SHARK" ด้วย — orb ที่ทับหน้าแชทบนมือถือแอปคือปุ่ม native ของแอป ไม่ใช่ของเว็บ
  //    (เจ้าของเจอ 2 ก.ย. ล้างแคช Safari แล้วก็ไม่หายเพราะคนละตัวกัน) · สัญญา: {ev:"chat-fullscreen", on}
  //    ฝั่งรับอยู่ apps/mobile/app/(app)/index.tsx · บนเบราว์เซอร์ปกติ ReactNativeWebView ไม่มี = no-op
  useEffect(() => {
    (window as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView?.postMessage(
      JSON.stringify({ ev: "chat-fullscreen", on: chatFullscreen }),
    );
  }, [chatFullscreen]);

  // 🔴 สัญญาข้ามชั้น: โมดูลแชทห้าม import จาก app-shell และ shell ห้าม import จากโมดูล
  //    ⇒ ปุ่ม ☰ ในหัวรายการแชทยิง CustomEvent ชื่อเดียว แล้ว shell เปิด drawer ให้
  useEffect(() => {
    const onOpen = () => {
      setDrawer(true);
      refreshBadges(); // เปิดเมนู = จังหวะที่คนกำลังจะมอง ตัวเลขต้องสด
    };
    window.addEventListener("app:drawer-open", onOpen);
    return () => window.removeEventListener("app:drawer-open", onOpen);
  }, [refreshBadges]);

  return (
    <>
      <Topbar
        branding={branding}
        aiUnread={aiUnread}
        inApp={inApp}
        onMenu={() => {
          setDrawer(true);
          refreshBadges(); // เปิดเมนู = จังหวะที่คนกำลังจะมอง ตัวเลขต้องสด
        }}
        hideOnMobile={chatFullscreen}
      />
      {/* ปัดจากขอบซ้ายไปขวา = เปิดเมนู (จอเล็ก/แอป) — ในแอปไม่มี ☰ แล้ว ท่านี้คือทางเดียว */}
      <SwipeEdge
        alwaysOn={inApp}
        onOpen={() => {
          setDrawer(true);
          refreshBadges();
        }}
      />
      <NavDrawer
        open={drawer}
        // ในแอป หรือหน้าที่ใช้ราง (ไม่มีแถบปักซ้ายให้ชน) → overlay ต้องโผล่ทุกความกว้าง
        alwaysOverlay={inApp || railMode}
        onClose={() => setDrawer(false)}
        tenantName={tenantName}
        userEmail={userEmail}
        items={items}
        soon={soon}
        badges={navBadges}
        branding={branding}
        navTone={navTone}
        onReportIssue={() => setIssueOpen(true)}
        onAddSystem={() => {
          setDrawer(false);
          setAddSystemOpen(true);
        }}
        memberships={memberships}
        activeTenantId={activeTenantId}
      />
      {/* เว็บบนจอใหญ่ (≥ lg): แถบเมนูปักซ้าย 288px หรือรางไอคอน 56px ตามที่ผู้ใช้เลือก · ในแอปไม่ปักทั้งคู่
          🔴 หน้าบอร์ดงานบังคับราง ⇒ ปุ่ม › ที่นั่นเปิด "เมนูเต็มแบบ overlay" แทนการคลายค่า
             (คลายไปก็ยังเป็นรางอยู่ดี = ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น) */}
      {!inApp && railMode && (
        <NavRail
          items={items}
          navTone={navTone}
          badges={navBadges}
          onExpand={() => {
            if (boardRail) {
              setDrawer(true);
              refreshBadges();
              return;
            }
            applyCollapsed(false);
          }}
        />
      )}
      {!inApp && !railMode && (
        <NavDrawer
          variant="pinned"
          open
          onClose={() => {}}
          tenantName={tenantName}
          userEmail={userEmail}
          items={items}
          soon={soon}
          badges={navBadges}
          branding={branding}
          navTone={navTone}
          onCollapse={() => applyCollapsed(true)}
          onAddSystem={() => setAddSystemOpen(true)}
          memberships={memberships}
          activeTenantId={activeTenantId}
        />
      )}
      <AddSystemModal
        preselect={addSystemPreselect}
        open={addSystemOpen}
        onClose={() => {
          setAddSystemOpen(false);
          setAddSystemPreselect(null); // เปิดครั้งหน้าจากปุ่มปกติ = เริ่มที่จังหวะเลือกระบบ
        }}
        openedCodes={openedCodes}
      />
      {/* แผ่นแจ้งปัญหาที่เปิดจากท้ายเมนู (จอเล็ก/แอป) — ปุ่มบนแถบบนมีแผ่นของตัวเองใน Topbar */}
      {issueOpen && <IssueReportSheet onClose={() => setIssueOpen(false)} />}
      {/* แผงผู้ช่วย AI — เปิดจาก orb บนแถบบนผ่าน event `app:ai-open` (ไม่มีปุ่มลอยมุมล่างขวาแล้ว) */}
      {!inApp && <AiDock />}
    </>
  );
}
