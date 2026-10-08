// ขนาด/ระยะ/ตัวอักษรของ Liquid Glass · Airy (ทีมพนักงาน AI)
// กติกา (คำตัดสิน OQ-4): ทุกค่า = CSS px ของ mockup × 390/536 (จอ mockup กว้าง 536 px · แอป 390 pt = ×0.7276) ปัดเป็นจุดเต็มหรือครึ่งจุด
// ที่มาแต่ละค่าอยู่ท้ายบรรทัด: G = ledger/design-ai-team/gen_glass_airy.py · F = gen_airy_full.py (เลขบรรทัดของไฟล์นั้น)
// เป้าแตะขั้นต่ำ 44 pt เสมอ (size.touchMin) — ของที่ภาพเล็กกว่านั้นใช้ hitSlop / minHeight
export const tokens = {
  spacing: {
    cardGap: 8.5, // G:102 .row margin-top:12px
    cardPadV: 11.5, // G:102 .row padding:16px 18px
    cardPadH: 13, // G:102
    rowGap: 11.5, // G:102 .row gap:16px
    pageX: 22, // G:91 .pg left/right:30px
    pageTop: 64, // G:12 .pg top:88px (รวมแถบสถานะของเครื่อง)
    statusZone: 48, // G:7 .island top 18 + สูง 48 = 66px
    barHeight: 38, // G:13 .bar height:52px
    barGap: 10, // G:14 .bar .r gap:14px
    titleTop: 19, // G:94 .lt margin-top:26px
    titleGap: 6, // G:18 .lt gap:8px · G:94 .st margin-top:8px
    sectionTop: 25, // G:114 .sec margin-top:34px
    sectionLeft: 7, // G:114 .sec margin-left:10px
    subTop: 4.5, // G:104 .row .t span margin-top:6px
    heroTop: 22, // F:38 .cl margin-top:30px
    heroTitleTop: 4.5, // F:88 h2 margin-top:6px
    heroBodyTop: 6, // F:23 .hero p margin-top:8px
    footX: 24.5, // G:44 .foot left/right:34px
    footBottom: 29, // G:44 .foot bottom:40px
    pillPadV: 7.5, // G:106 .tabs span padding:10px 17px
    pillPadH: 12.5, // G:106
    pillGap: 7.5, // G:105 .tabs gap:10px
    statPad: 11.5, // G:109 .nums div padding:16px
    stackOverlap: 8.5, // G:140 .stk>* margin-left:-12px
    segPad: 3, // G:116 .segw padding:4px
    segItemPadV: 7.5, // G:116 .segw span padding:10px 0
    searchPadH: 14.5, // G:145 .srch padding:0 20px
    searchGap: 7.5, // G:145 .srch gap:10px
    sheetInset: 6, // G:80 .sheet left/right/bottom:8px
    sheetPadV: 10, // G:80 .sheet padding:14px 32px
    sheetPadH: 23, // G:80
    grabBottom: 19, // G:81 .grab margin-bottom:26px
    buttonGap: 6, // G:41 .btn1 gap:8px
  },
  radii: {
    card: 19, // G:102 .row border-radius:26px
    stat: 17.5, // G:109 .nums div border-radius:24px
    pill: 16, // G:106 .tabs span border-radius:22px
    button: 22, // G:41 .btn1 border-radius:30px
    segmented: 11.5, // G:116 .segw border-radius:16px
    segmentedItem: 8.5, // G:116 .segw span border-radius:12px
    field: 13, // G:130 .fld border-radius:18px
    sheet: 35, // G:80 .sheet border-radius:48px
    grab: 2, // G:81 .grab border-radius:3px
    full: 999,
  },
  size: {
    button: 44, // G:41 .btn1 height:60px (43.7 → 44 = เป้าแตะขั้นต่ำพอดี)
    iconButton: 35, // G:92 .ib 48px
    icon: 16, // G:153 svg 22px
    avatar: 29, // G:142 .hp 40px
    search: 39.5, // G:145 .srch height:54px
    searchIcon: 14.5, // F:101 svg 20px
    orbRow: 35, // F:90 av(…,48)
    orbHero: 100.5, // F:87 138px
    orbHeroSide: 75.5, // F:87 104px
    orbHeroSmall: 70, // F:87 96px
    heroArt: 138, // F:38 .cl height:190px
    chevron: 13, // G:156 svg 18px
    titleChevron: 19, // G:155 svg 26px
    statusDot: 11, // G:100 .ao .sd 15px
    grabW: 41, // G:81 .grab 56px
    grabH: 3.5, // G:81 .grab 5px
    ring: 87, // วงโควตา (C1 — ยังไม่มีค่าใน generator ของ T0.3 · T3.4 ปรับตามภาพ)
    ringStroke: 6, // G:112 .urow .ub height:8px
    touchMin: 44,
  },
  border: {
    glass: 1, // G:89 border:1.5px
    highlight: 1.5, // F:90 border:2px solid
    ring: 2, // G:140 .stk>* border:2.5px
    dot: 2, // G:100 .ao .sd border:3px
  },
  type: {
    title: { fontSize: 26, lineHeight: 34, fontWeight: "700", letterSpacing: -0.65 }, // G:18 .lt 36px/700/-.9px
    subtitle: { fontSize: 11, lineHeight: 17.5, fontWeight: "400", letterSpacing: 0 }, // G:20 .st 15px · G:94 line-height 1.6
    rowTitle: { fontSize: 12.5, lineHeight: 17, fontWeight: "600", letterSpacing: 0 }, // G:27 .row .t b 17px/600
    rowSub: { fontSize: 10.5, lineHeight: 16, fontWeight: "400", letterSpacing: 0 }, // G:28 14.5px · G:104 line-height 1.5
    section: { fontSize: 9.5, lineHeight: 13, fontWeight: "600", letterSpacing: 0.85 }, // G:37 .sec 13px · G:114 600/1.2px
    tab: { fontSize: 11, lineHeight: 14.5, fontWeight: "500", letterSpacing: 0 }, // G:106 .tabs span 15px/500
    button: { fontSize: 12.5, lineHeight: 17, fontWeight: "600", letterSpacing: 0 }, // G:41 .btn1 17px/600
    heroTitle: { fontSize: 19.5, lineHeight: 26, fontWeight: "700", letterSpacing: -0.45 }, // F:23 .hero h2 27px/700/-.6px
    heroBody: { fontSize: 11, lineHeight: 17.5, fontWeight: "400", letterSpacing: 0 }, // F:23 .hero p 15px/1.6
    statValue: { fontSize: 19, lineHeight: 24, fontWeight: "600", letterSpacing: -0.6 }, // G:109 .nums b 26px · G:38 600/-.8px
    statLabel: { fontSize: 9.5, lineHeight: 13, fontWeight: "400", letterSpacing: 0 }, // G:38 .nums span 13px
    segment: { fontSize: 10, lineHeight: 14, fontWeight: "400", letterSpacing: 0 }, // G:46 .segw span 14px
    avatar: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 0 }, // G:142 .hp 15px/600
    more: { fontSize: 9.5, lineHeight: 13, fontWeight: "600", letterSpacing: 0 }, // G:144 .more 13px/600
  },
} as const;

export type Tokens = typeof tokens;
