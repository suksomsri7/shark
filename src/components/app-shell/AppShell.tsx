"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Topbar } from "./Topbar";
import { NavDrawer, type NavItem, type SoonItem, type TenantOption } from "./NavDrawer";
import { AiDock } from "./AiDock";
import { AddSystemModal } from "./AddSystemModal";
import { useInApp } from "./use-in-app";
import { loadNavBadgesAction } from "@/lib/support/actions";

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
  chatSystemIds = [],
}: {
  tenantName: string;
  userEmail: string;
  items: NavItem[];
  soon: SoonItem[];
  openedCodes: string[];
  memberships: TenantOption[];
  activeTenantId: string;
  /** id ของระบบแชทที่ร้านเปิดใช้ (มาจาก layout — ว่าง = ไม่ถามตัวเลขข้อความค้างเลย) */
  chatSystemIds?: string[];
}) {
  const [drawer, setDrawer] = useState(false);
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

  return (
    <>
      <Topbar
        tenantName={tenantName}
        onMenu={() => {
          setDrawer(true);
          refreshBadges(); // เปิดเมนู = จังหวะที่คนกำลังจะมอง ตัวเลขต้องสด
        }}
        pinnedNav={!inApp}
      />
      <NavDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        tenantName={tenantName}
        userEmail={userEmail}
        items={items}
        soon={soon}
        badges={navBadges}
        onAddSystem={() => {
          setDrawer(false);
          setAddSystemOpen(true);
        }}
        memberships={memberships}
        activeTenantId={activeTenantId}
      />
      {/* เว็บบนจอใหญ่ (≥ lg): กางเมนูปักซ้ายให้เลย ไม่ต้องกดแฮมเบอร์เกอร์ · ในแอปไม่ปัก */}
      {!inApp && (
        <NavDrawer
          variant="pinned"
          open
          onClose={() => {}}
          tenantName={tenantName}
          userEmail={userEmail}
          items={items}
          soon={soon}
          badges={navBadges}
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
      {!inApp && <AiDock aiUnread={aiUnread} />}
    </>
  );
}
