// ธีม Airy ของเลขา AI — ทางเข้าเดียวของสี/ขนาดสำหรับจอใหม่ (components/airy/** + app/(app)/secretary/**)
// useTheme() = โหมดจาก theme-store (system|light|dark) ∩ โหมดของเครื่อง · ThemeProvider บังคับโหมดให้ลูกได้ (เช่น gallery แสดงทั้งสองโหมด)
// จอ 1.0 ยังใช้ src/theme.ts (C/R/S เดิม) — ไฟล์นี้ไม่เปลี่ยนจอ 1.0
import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { Platform, useColorScheme, type ViewStyle } from "react-native";
import { useThemeMode, type ThemeMode } from "@/src/lib/theme-store";
import { light, legacyLight, type Palette, type SysKey, type ZoneKey } from "./light";
import { dark } from "./dark";
import { tokens, radii, spacing, type, size, cardGap, cardPad, type Tokens } from "./tokens";

export { light, dark, legacyLight, tokens, radii, spacing, type, size, cardGap, cardPad };
export type { Palette, SysKey, ZoneKey, Tokens, ThemeMode };

export type Theme = {
  /** โหมดที่ใช้จริงหลังรวมกับเครื่อง */
  scheme: "light" | "dark";
  /** ชุดสี */
  c: Palette;
  /** ขนาด */
  t: Tokens;
};

const ThemeCtx = createContext<Theme | null>(null);

function build(scheme: "light" | "dark"): Theme {
  return { scheme, c: scheme === "dark" ? dark : light, t: tokens };
}
const LIGHT = build("light");
const DARK = build("dark");

/** โหมดที่ใช้จริง: override จาก store ชนะ · "system" = ตามเครื่อง */
function useResolvedScheme(force?: "light" | "dark"): "light" | "dark" {
  const mode = useThemeMode();
  const sys = useColorScheme();
  if (force) return force;
  if (mode === "light" || mode === "dark") return mode;
  return sys === "dark" ? "dark" : "light";
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeCtx);
  const scheme = useResolvedScheme();
  return ctx ?? (scheme === "dark" ? DARK : LIGHT);
}

/** ครอบจอ/ส่วนของจอ · `mode` = บังคับโหมด (ไม่ใส่ = ตาม store + เครื่อง) */
export function ThemeProvider({ mode, children }: { mode?: "light" | "dark"; children?: ReactNode }) {
  const scheme = useResolvedScheme(mode);
  const value = useMemo(() => (scheme === "dark" ? DARK : LIGHT), [scheme]);
  return createElement(ThemeCtx.Provider, { value }, children);
}

// ───────── ตัวช่วยสไตล์ (สร้าง CSS string จากโทเคน — คอมโพเนนต์ไม่ต้องมีสีฝัง) ─────────

/** พื้นไล่สี: เว็บ = backgroundImage · มือถือ = experimental_backgroundImage (RN 0.86 new arch) */
export function bgImage(css: string): ViewStyle {
  return (Platform.OS === "web" ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
}

/** เงา CSS (RN 0.76+ และ react-native-web รับ string เดียวกัน) */
export function shadow(css: string): ViewStyle {
  return { boxShadow: css } as ViewStyle;
}

export const linear = (from: string, to: string, angle = 135) => `linear-gradient(${angle}deg, ${from}, ${to})`;

/** พื้นจอ .screen */
export function screenBg(c: Palette): ViewStyle {
  const spots = c.bg.spots.map((s) => `radial-gradient(${s.w}px ${s.h}px at ${s.x} ${s.y}, ${s.color} 0%, transparent 70%)`).join(", ");
  return { backgroundColor: c.bg.base, ...bgImage(spots) };
}

/** กระจก .gl: พื้นไล่ + ขอบ + เงา (+ blur บนเว็บ) */
export function glassStyle(c: Palette, radius: number = radii.card): ViewStyle {
  const web = Platform.OS === "web" ? ({ backdropFilter: "blur(24px) saturate(180%)" } as ViewStyle) : null;
  return {
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: c.glass.border,
    ...bgImage(linear(c.glass.fillFrom, c.glass.fillTo)),
    ...shadow(c.glass.shadow),
    ...web,
  };
}

/** ลูกแก้ว .ao.o1 */
export function orbStyle(c: Palette, d: number): ViewStyle {
  const o = c.orb;
  const img = [
    `radial-gradient(circle at 30% 25%, ${o.hi} 0%, ${o.hi} 8%, transparent 24%)`,
    `radial-gradient(circle at 72% 75%, ${o.c1}, transparent 62%)`,
    `radial-gradient(circle at 22% 70%, ${o.c2}, transparent 60%)`,
    `radial-gradient(circle, ${o.coreIn}, ${o.coreMid} 72%, ${o.coreOut})`,
  ].join(", ");
  return { width: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: o.border, ...bgImage(img), ...shadow(o.shadow) };
}

/** วงรอบจุดสถานะ (.run/.wait box-shadow 0 0 0 4px) */
export function haloStyle(color: string, halo: number = size.halo): ViewStyle {
  return shadow(`0px 0px 0px ${halo}px ${color}`);
}

/** สีพื้นของปุ่มไอคอน active ตามโซน (มติ 16) */
export function zoneColor(c: Palette, zone: ZoneKey): string {
  return zone === "secretary" ? c.accent : c.zone[zone];
}
