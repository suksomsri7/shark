// สีโหมดมืดของ Liquid Glass · Airy — ค่าจาก ledger/design-ai-team/gen_airy_dark.py (D:บรรทัด) · key ชุดเดียวกับ light.ts ทุกตัว
import type { Palette } from "./light";

export const dark: Palette = {
  bg: "#0e0e15", // D:8 .screen
  surface: "#22222c",
  glass: {
    fill: "rgba(255,255,255,0.08)", // D:11 linear-gradient(.115 → .045) → ค่ากลาง
    border: "rgba(255,255,255,0.13)", // D:11
    shadow: "0px 7px 22px rgba(0,0,0,0.28), inset 0px 1px 0px rgba(255,255,255,0.12)", // D:11
  },
  text: "#f2f2f7", // D:5
  textDim: "#8e8e9c", // D:15 .st
  textFaint: "#7c7c8c", // D:57
  textSub: "#a6a6b4", // D:13
  section: "#7c7c8c", // D:15 .sec
  icon: "#6a6a7a", // D:10 .row svg
  iconStrong: "#f2f2f7", // D:10 svg
  placeholder: "#8a8a9a", // D:10 .srch svg
  accent: "#f2f2f7", // D:17
  accentFg: "#16161c", // D:17
  accentSoft: "rgba(255,255,255,0.09)", // D:22 .chips span
  accentOff: "rgba(255,255,255,0.12)", // D:49 .btn1.off
  accentOffFg: "#8e8e9c", // D:49
  accentShadow: "0px 6px 16px rgba(0,0,0,0.35)", // D:17
  pillShadow: "0px 6px 16px rgba(0,0,0,0.35)", // D:17
  highlight: "rgba(143,155,255,0.55)", // gen_airy_full.py:90 (inline · โหมดมืดไม่เปลี่ยน)
  tabText: "#b4b4c4", // D:16
  count: "#ffbe55", // D:40 .amb
  ok: "#5fd39a", // D:40 .grn
  warn: "#ffbe55", // D:40
  danger: "#ff7d93", // D:58
  idle: "#5a5a68", // D:29 .grab โทนเดียวกัน
  track: "rgba(255,255,255,0.13)", // D:30 .ub
  ring: "#8f9bff",
  segBg: "rgba(255,255,255,0.08)", // D:21 .segw
  segOn: "rgba(255,255,255,0.24)", // D:21 .segw .a
  segOnText: "#ffffff", // D:21
  segShadow: "0px 0px 0px rgba(0,0,0,0)", // D:21 box-shadow:none
  scrim: "rgba(0,0,0,0.55)", // D:28 .dim
  sheet: "rgba(33,33,43,0.98)", // D:29 .sheet
  grab: "#5a5a68", // D:29
  skeleton: "rgba(255,255,255,0.10)",
  avatarRing: "#17171f", // D:33 .stk>*
  avatarFg: "#ffffff",
  avatarShadow: "0px 3px 7px rgba(0,0,0,0.35)", // D:33
  more: "#3a3a48", // D:32
  moreFg: "#d6d6e2", // D:32
  human: { a: "#dfb197", b: "#8cabe3", c: "#8bc9a2" },
  orbShadow: "0px 4.5px 13px rgba(0,0,0,0.4)", // D:34 .ao
  orbInitial: "#1d1d24",
  blob: { a: "rgba(60,170,120,0.22)", b: "rgba(210,90,140,0.20)", c: "rgba(80,120,230,0.22)", d: "rgba(220,150,60,0.16)" }, // D:8
  orb: {
    sales: { c1: "rgba(110,160,255,0.85)", c2: "rgba(160,220,255,0.85)" },
    chat: { c1: "rgba(255,140,170,0.85)", c2: "rgba(255,200,160,0.8)" },
    account: { c1: "rgba(80,200,150,0.8)", c2: "rgba(180,240,200,0.85)" },
    content: { c1: "rgba(255,160,80,0.8)", c2: "rgba(255,220,140,0.85)" },
    member: { c1: "rgba(160,120,255,0.85)", c2: "rgba(230,180,255,0.85)" },
    custom: { c1: "rgba(90,190,210,0.85)", c2: "rgba(170,235,240,0.85)" },
  },
};
