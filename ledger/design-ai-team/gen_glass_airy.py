CSS=r'''*{box-sizing:border-box;margin:0;padding:0}
body{width:2760px;height:2920px;background:#f3f3f5;font-family:Inter,'IBM Plex Sans Thai',sans-serif;color:#111;position:relative;overflow:hidden}
.title{position:absolute;left:110px;top:80px}.title h1{font-size:60px;font-weight:600;letter-spacing:-1.5px}.title p{font-size:24px;color:#8e8e93;margin-top:10px}
.phones{position:absolute;left:0;right:0;top:250px;display:flex;justify-content:center;gap:60px;flex-wrap:wrap;row-gap:150px;padding:0 100px}
.phone{width:560px;height:1180px;border-radius:84px;padding:12px;background:#e6e6eb;box-shadow:0 40px 90px rgba(0,0,0,.08),inset 0 0 0 1px #dcdce2;position:relative}
.screen{width:100%;height:100%;border-radius:72px;overflow:hidden;position:relative;background:#fff}
.island{position:absolute;top:18px;left:50%;transform:translateX(-50%);width:170px;height:48px;border-radius:30px;background:#0c0c10}
.status{position:absolute;top:26px;left:52px;right:48px;display:flex;justify-content:space-between;font-weight:600;font-size:22px}
.sig{display:flex;gap:8px;align-items:center}.sig i{display:inline-block;background:#111;border-radius:3px}
.label{position:absolute;bottom:-66px;left:0;right:0;text-align:center;font-size:20px;color:#8e8e93;letter-spacing:1px}
svg{stroke:#111;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.pg{position:absolute;top:88px;left:34px;right:34px;bottom:0;display:flex;flex-direction:column}
.bar{height:52px;display:flex;align-items:center;justify-content:space-between;flex:none}
.bar .l,.bar .r{display:flex;gap:14px;align-items:center;min-width:44px}
.bar .c{flex:1;text-align:center;font-size:16px;font-weight:600}.bar .c small{display:block;font-size:12.5px;color:#8e8e93;font-weight:400;margin-top:2px}
.ib{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;border:1px solid #ececf0}
.me{width:44px;height:44px;border-radius:50%;background:#111;color:#fff;display:grid;place-items:center;font-weight:600;font-size:17px}
.lt{font-size:36px;font-weight:700;letter-spacing:-.9px;margin-top:22px;display:flex;align-items:center;gap:8px}
.lt svg{stroke:#8e8e93}
.st{font-size:15px;color:#8e8e93;margin-top:6px}
.av{border-radius:50%;display:grid;place-items:center;font-weight:600;flex:none;position:relative}
.a1{background:#eaf1ff;color:#3a64d8}.a2{background:#ffeef2;color:#d8436a}.a3{background:#e7f6ee;color:#23945a}.a4{background:#fff2e1;color:#c47a12}.a5{background:#f1ecff;color:#6a4fd8}.a6{background:#e4f5f8;color:#178a99}
.av .sd{position:absolute;right:0;bottom:0;width:13px;height:13px;border-radius:50%;border:2.5px solid #fff}
.on{background:#34c759}.wt{background:#ff9f0a}.idle{background:#d1d1d6}
.row{display:flex;align-items:center;gap:16px;padding:17px 0;border-bottom:1px solid #f0f0f3}
.row:last-child{border-bottom:0}
.row .t{flex:1;min-width:0}.row .t b{font-size:17px;font-weight:600;display:block}.row .t b em{font-style:normal;font-weight:400;color:#8e8e93;font-size:13.5px;margin-left:6px}
.row .t span{font-size:14.5px;color:#6e6e73;display:block;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .r{font-size:13px;color:#aeaeb2;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.row svg{stroke:#c7c7cc;flex:none}
.bd{min-width:22px;height:22px;border-radius:11px;background:#ff9f0a;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;padding:0 6px}
.amb{color:#c47a12 !important}.grn{color:#23945a !important}.gry{color:#8e8e93 !important}
.tabs{display:flex;gap:26px;border-bottom:1px solid #ececf0;margin-top:30px;flex:none}
.tabs span{padding:12px 0;font-size:15.5px;color:#8e8e93;white-space:nowrap}
.tabs .a{color:#111;font-weight:600;border-bottom:2px solid #111;margin-bottom:-1px}
.tabs em{font-style:normal;color:#ff9f0a;font-weight:600;margin-left:4px}
.sec{font-size:13px;color:#8e8e93;font-weight:500;margin-top:30px;letter-spacing:.2px}
.nums{display:flex;margin-top:34px}.nums div{flex:1}.nums b{font-size:30px;font-weight:600;letter-spacing:-.8px;display:block}.nums span{font-size:13px;color:#8e8e93;margin-top:4px;display:block}
.ub{height:4px;border-radius:2px;background:#f0f0f3;margin-top:10px}.ub i{display:block;height:100%;border-radius:2px;background:#111}
.ul{display:flex;justify-content:space-between;font-size:13.5px;color:#6e6e73;margin-top:28px}
.btn1{height:60px;border-radius:30px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font-size:17px;font-weight:600;flex:1}
.btn1 svg{stroke:#fff}
.btn2{height:60px;border-radius:30px;background:#fff;border:1px solid #e3e3e8;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;flex:1}
.foot{position:absolute;left:34px;right:34px;bottom:40px;display:flex;gap:12px}
.segw{display:flex;background:#f4f4f6;border-radius:12px;padding:3px;margin-top:10px}
.segw span{flex:1;text-align:center;padding:9px 0;font-size:14px;color:#6e6e73;border-radius:9px}
.segw .a{background:#fff;color:#111;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.opt{margin-top:22px}.opt .n{font-size:14px;color:#6e6e73;display:flex;justify-content:space-between}.opt .n small{color:#aeaeb2;font-size:12.5px}
.chips{display:flex;gap:8px;margin-top:10px}.chips span{padding:8px 14px;border-radius:17px;font-size:13.5px;border:1px solid #e3e3e8;color:#6e6e73}.chips .a{background:#111;border-color:#111;color:#fff}
.ubb{background:#f4f4f6;border-radius:22px;border-bottom-right-radius:6px;padding:14px 18px;font-size:16px;line-height:1.5;align-self:flex-end;max-width:82%;margin-top:22px}
.aiw{display:flex;gap:12px;margin-top:22px}.aiw .x{flex:1;font-size:16px;line-height:1.55}
.stp{font-size:14.5px;color:#6e6e73;line-height:2}.stp b{color:#34c759;font-weight:600;margin-right:6px}.stp .p b{color:#ff9f0a}
.apc{border:1px solid #e8e8ec;border-radius:22px;padding:20px;margin-top:18px}
.apc .tg{font-size:12.5px;font-weight:600;color:#c47a12}
.apc .h{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px}.apc .h b{font-size:18px}.apc .h .m{font-size:26px;font-weight:600;letter-spacing:-.6px}
.apc .s{font-size:13.5px;color:#8e8e93;margin-top:2px}
.li{display:flex;justify-content:space-between;font-size:14.5px;color:#6e6e73;padding:10px 0;margin-top:14px}
.li:first-of-type{margin-top:12px}
.acts{display:flex;gap:10px;margin-top:14px}.acts div{height:46px;border-radius:23px;display:grid;place-items:center;font-size:15px;font-weight:600;flex:1;border:1px solid #e3e3e8}
.acts .d{background:#111;color:#fff;border-color:#111;flex:1.8}
.inp{position:absolute;left:24px;right:24px;bottom:34px;height:64px;border-radius:32px;border:1px solid #e3e3e8;display:flex;align-items:center;gap:12px;padding:0 8px 0 22px;font-size:16px;color:#aeaeb2;background:#fff}
.inp .s{margin-left:auto;width:48px;height:48px;border-radius:50%;background:#111;display:grid;place-items:center}.inp .s svg{stroke:#fff}
.it2{padding:22px 0;border-bottom:1px solid #f0f0f3}
.it2 .w{display:flex;align-items:center;gap:8px;font-size:13px;color:#8e8e93}.it2 .w .tm{margin-left:auto}
.it2 .h{display:flex;justify-content:space-between;margin-top:10px}.it2 .h b{font-size:17px;font-weight:600}.it2 .h span{font-size:17px;font-weight:600}
.it2 p{font-size:14px;color:#6e6e73;margin-top:3px}
.it2 .ac{display:flex;justify-content:flex-end;align-items:center;gap:22px;margin-top:12px;font-size:15px;font-weight:500;color:#6e6e73}
.it2 .ac .d{background:#111;color:#fff;padding:10px 20px;border-radius:20px;font-weight:600}
.prog{display:flex;gap:6px;margin-top:6px}.prog i{flex:1;height:3px;border-radius:2px;background:#111}.prog i.n{background:#ececf0}
.fld{border-bottom:1px solid #e3e3e8;font-size:21px;font-weight:600;padding:6px 0 10px;flex:1}
.dots{display:flex;gap:10px;margin-top:12px}.dots i{width:22px;height:22px;border-radius:50%;display:block}
.qt{background:#f7f7f9;border-radius:18px;padding:16px 18px;font-size:15px;line-height:1.55;margin-top:10px;color:#333}
.big{font-size:76px;font-weight:600;letter-spacing:-3px;margin-top:34px;line-height:1}
.urow{display:flex;align-items:center;gap:14px;padding:13px 0}
.urow .n{width:84px;font-size:15px}.urow .ub{flex:1;margin:0}.urow b{width:44px;text-align:right;font-size:15px;font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr;margin-top:34px;margin-top:14px}
.grid div{padding:20px 0;border-bottom:1px solid #f0f0f3}.grid div:nth-child(odd){border-right:1px solid #f0f0f3}.grid div:nth-child(even){padding-left:24px}
.grid b{font-size:28px;font-weight:600;letter-spacing:-.8px;display:block}.grid span{font-size:13px;color:#8e8e93}
.dim{position:absolute;inset:0;background:rgba(0,0,0,.28)}
.sheet{position:absolute;left:8px;right:8px;bottom:8px;top:330px;background:#fff;border-radius:48px;padding:14px 32px}
.grab{width:56px;height:5px;border-radius:3px;background:#d1d1d6;margin:0 auto 26px}
.lg{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;font-weight:700;font-size:18px;flex:none}
.l1{background:#f3ebe3;color:#8a5a34}.l2{background:#e8efff;color:#3a64d8}.l3{background:#ffecef;color:#d8436a}
'''+r'''
/* ---- Liquid Glass · Airy ---- */
body{background:radial-gradient(1200px 800px at 15% 20%,#fde8ef 0,transparent 60%),radial-gradient(1000px 900px at 85% 30%,#e3f1ff 0,transparent 60%),radial-gradient(900px 700px at 50% 95%,#eafbf1 0,transparent 60%),#f3f2f7;color:#1d1d24}
.phone{background:linear-gradient(145deg,#ffffff,#dfe1ea 50%,#f7f7fb);box-shadow:0 60px 120px rgba(90,90,130,.22),inset 0 0 0 2px rgba(255,255,255,.9)}
.screen{background:radial-gradient(420px 380px at 90% 8%,#d9f5e6 0,transparent 70%),radial-gradient(500px 500px at 0% 35%,#fde3ec 0,transparent 70%),radial-gradient(500px 420px at 100% 70%,#e1ecff 0,transparent 70%),radial-gradient(400px 400px at 20% 100%,#fff0dc 0,transparent 70%),#fbfbfd}
.gl,.ib,.row,.it2,.apc,.nums div,.grid div,.inp,.tabs span,.btn2,.qt,.fld,.acts div{background:linear-gradient(135deg,rgba(255,255,255,.74),rgba(255,255,255,.42));backdrop-filter:blur(24px) saturate(180%);
 border:1.5px solid rgba(255,255,255,.85);box-shadow:0 10px 30px rgba(120,120,170,.10),inset 0 1px 0 rgba(255,255,255,.95)}
.pg{left:30px;right:30px}
.ib{width:48px;height:48px}
.me{width:48px;height:48px;background:linear-gradient(135deg,#f6c7a8,#c79a86);border:3px solid rgba(255,255,255,.9)}
.lt{margin-top:26px}.st{margin-top:8px;line-height:1.6}
.ao{border-radius:50%;flex:none;position:relative;
 background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.95) 0 8%,transparent 24%),radial-gradient(circle at 72% 75%,var(--c1),transparent 62%),radial-gradient(circle at 22% 70%,var(--c2),transparent 60%),radial-gradient(circle,rgba(255,255,255,.35),rgba(228,228,244,.75) 72%,#fff);
 box-shadow:inset -4px -6px 12px rgba(255,255,255,.85),inset 3px 3px 10px rgba(160,160,200,.25),0 6px 16px rgba(110,110,160,.18);border:2px solid rgba(255,255,255,.9)}
.o1{--c1:rgba(110,160,255,.85);--c2:rgba(160,220,255,.85)}.o2{--c1:rgba(255,140,170,.85);--c2:rgba(255,200,160,.8)}.o3{--c1:rgba(80,200,150,.8);--c2:rgba(180,240,200,.85)}
.o4{--c1:rgba(255,160,80,.8);--c2:rgba(255,220,140,.85)}.o5{--c1:rgba(160,120,255,.85);--c2:rgba(230,180,255,.85)}.o6{--c1:rgba(90,190,210,.85);--c2:rgba(170,235,240,.85)}
.ao .sd{position:absolute;right:-2px;bottom:0;width:15px;height:15px;border-radius:50%;border:3px solid #fff}
.on{background:#3cc47f}.wt{background:#ffb020}.idle{background:#c5c8d4}
.row{border-radius:26px;padding:16px 18px;margin-top:12px;gap:16px}
.row:last-child{border:1.5px solid rgba(255,255,255,.85)}
.row .t span{margin-top:6px;line-height:1.5}
.tabs{border:0;gap:10px;margin-top:32px;margin-bottom:6px}
.tabs span{padding:10px 17px;border-radius:22px;color:#555566;font-size:15px;font-weight:500}
.tabs .a{background:#16161c;color:#fff;border:0;margin:0;box-shadow:0 6px 14px rgba(20,20,40,.18)}
.tabs em{color:#d98a00}
.nums{gap:12px;margin-top:34px}.nums div{border-radius:24px;padding:16px 16px}.nums b{font-size:26px}.nums span{margin-top:6px}
.ul{margin-top:30px}
.ub{background:rgba(150,150,180,.18);height:6px;border-radius:3px}.ub i{background:linear-gradient(90deg,#9fd8ff,#8f9bff,#c7a0ff);border-radius:3px}
.amb{color:#d98a00 !important}.grn{color:#3cb577 !important}
.bd{background:#ffb020}
.sec{margin-top:34px;margin-left:10px;letter-spacing:1.2px;font-weight:600;color:#9a9aab}
.btn1{background:#16161c;box-shadow:0 14px 30px rgba(20,20,40,.22)}
.segw{background:rgba(150,150,185,.12);border-radius:16px;padding:4px;margin-top:12px}.segw span{border-radius:12px;padding:10px 0}
.segw .a{background:#fff;box-shadow:0 2px 8px rgba(100,100,150,.15)}
.opt{margin-top:20px}
.chips span{border:0;background:rgba(150,150,185,.12)}.chips .a{background:#16161c}
.ubb{background:linear-gradient(135deg,rgba(40,40,52,.92),rgba(20,20,28,.88));color:#fff;box-shadow:0 10px 24px rgba(20,20,40,.2);line-height:1.6;margin-top:26px}
.aiw{margin-top:26px}.aiw .x{line-height:1.65}
.stp{line-height:2.2}.stp b{color:#3cc47f}.stp .p b{color:#ffb020}
.apc{border:1.5px solid rgba(255,190,90,.7);border-radius:28px;padding:22px;margin-top:20px}
.li{border-top:0;padding:9px 0}
.acts div{border-radius:23px}.acts .d{background:#16161c;border:0}
.inp{height:72px;border-radius:36px;padding:0 8px;gap:14px}.inp .pl{width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.9);display:grid;place-items:center;flex:none;box-shadow:0 2px 8px rgba(100,100,150,.12)}.inp .mic{stroke:#8a8a9a;margin-left:auto}.inp .s{margin-left:0}.inp .s{width:56px;height:56px}
.it2{border-radius:28px;padding:20px 20px;margin-top:14px}
.it2 p{line-height:1.5;margin-top:6px}
.it2 .ac .d{background:#16161c}
.fld{border-radius:18px;padding:12px 16px;font-size:19px}
.qt{border-radius:22px;line-height:1.65;padding:18px 20px}
.grid{border:0;gap:12px}.grid div{border-radius:24px !important;padding:18px 20px !important}
.urow{padding:14px 0}.urow .ub{height:8px;border-radius:4px}
.prog i{background:#16161c}.prog i.n{background:rgba(150,150,180,.22)}
.dim{background:rgba(40,40,60,.28)}
.sheet{background:linear-gradient(160deg,rgba(255,255,255,.95),rgba(248,248,253,.9));backdrop-filter:blur(30px)}
.sheet .row{margin-top:12px}

.stk{display:flex;align-items:center}
.stk>*{margin-left:-12px;border:2.5px solid #fff !important;box-shadow:0 4px 10px rgba(110,110,160,.18)}
.stk>*:first-child{margin-left:0}
.hp{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:600;font-size:15px;flex:none}
.h1{background:linear-gradient(135deg,#f6c7a8,#c79a86)}.h2{background:linear-gradient(135deg,#a8c7f6,#6f8fd0)}.h3{background:linear-gradient(135deg,#b6e3c4,#5fae7f)}
.more{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:600;color:#55556a;background:rgba(255,255,255,.92);flex:none}
.srch{height:54px;border-radius:27px;display:flex;align-items:center;gap:10px;padding:0 20px;font-size:15px;color:#9a9aab;margin-top:24px}
.srch svg{stroke:#9a9aab}
.inp .pl{background:none !important;box-shadow:none !important;width:40px !important;margin-left:10px}
.nums{margin-top:24px !important}.ul{margin-top:24px !important}.tabs{margin-top:26px !important}
'''
STATUS='''<div class="island"></div><div class="status"><span>9:41</span><span class="sig"><i style="width:4px;height:8px"></i><i style="width:4px;height:12px"></i><i style="width:4px;height:16px"></i><i style="width:32px;height:15px;border-radius:5px"></i></span></div>'''
BACK='<div class="ib"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></div>'
CLOSE='<div class="ib"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></div>'
PLUS='<div class="ib"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>'
DOTS='<div class="ib"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></div>'
CH='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
AR='<svg width="18" height="18" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>'
def av(c,l,s=52,sd=''): return f'<div class="av {c}" style="width:{s}px;height:{s}px;font-size:{int(s*.38)}px">{l}{f"<i class=sd style=background:{sd}></i>" if sd else ""}</div>'
OM={'a1':'o1','a2':'o2','a3':'o3','a4':'o4','a5':'o5','a6':'o6'}
def av(c,l,s=52,sd=''): return f'<div class="ao {OM[c]}" style="width:{s}px;height:{s}px">{f"<i class=sd style=background:{sd}></i>" if sd else ""}</div>'
def seg(o,a): return '<div class="segw">'+''.join(f'<span{" class=a" if i==a else ""}>{x}</span>' for i,x in enumerate(o))+'</div>'
def bar(l='',c='',r=''): return f'<div class="bar"><div class="l">{l}</div><div class="c">{c}</div><div class="r">{r}</div></div>'
def emp(c,l,sd,n,role,s,r,cls=''): return f'<div class="row">{av(c,l,52,sd)}<div class="t"><b>{n}<em>{role}</em></b><span class="{cls}">{s}</span></div><div class="r">{r}</div></div>'
G,W,I='#3cc47f','#ffb020','#c5c8d4'

AO=lambda o: f'<div class="ao {o}" style="width:40px;height:40px"></div>'
def stk(*xs): return '<div class="stk">'+''.join(xs)+'</div>'
HP=lambda c,l: f'<div class="hp {c}">{l}</div>'
MORE=lambda n: f'<div class="more">+{n}</div>'
SRCH='<div class="srch gl"><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>ค้นหาพนักงาน งาน หรือลูกค้า</div>'

team=f'''<div class="pg">{bar(r=PLUS+stk(HP('h1','ส'),HP('h2','น'),AO('o1'),AO('o2'),MORE(4)))}
 <div class="lt">The Bean Café {CH}</div><div class="st">คน 3 · พนักงาน AI 5 · แพ็กฟรี</div>
 {SRCH}
 <div class="nums"><div><b>42</b><span>งานเสร็จวันนี้</span></div><div><b>6.5 ชม.</b><span>เวลาที่ประหยัด</span></div><div><b class="amb">3 ›</b><span>รออนุมัติ</span></div></div>
 <div class="ul"><span>โควตาเดือนนี้ 62%</span><span>รอบใหม่ 1 ต.ค.</span></div><div class="ub"><i style="width:62%"></i></div>
 <div class="tabs"><span class="a">ทั้งหมด</span><span>รออนุมัติ<em>3</em></span><span>กำลังทำงาน</span><span>เสร็จ</span></div>
 <div>
 {emp('a1','อ',W,'คุณเอก','เซลส์','2 งานกำลังทำ · 1 รออนุมัติ','9:41<span class=bd>1</span>','amb')}
 {emp('a2','ม',G,'น้องมะลิ','แอดมินแชท','ตอบลูกค้า 3 ห้อง · LINE, FB','ตอนนี้')}
 {emp('a3','พ',G,'พลอยใส','บัญชี','ออกใบแจ้งหนี้ 3 จาก 5','ตอนนี้')}
 {emp('a4','ด',W,'ไอดิน','คอนเทนต์','รออนุมัติ: โพสต์โปรเดือน ต.ค.','8:15<span class=bd>2</span>','amb')}
 {emp('a5','ฟ',I,'ฟ้า','สมาชิก','ว่าง · งานประจำถัดไป 18:00','เมื่อวาน')}
 </div></div>'''

def job(t,s,r,rc=''): return f'<div class="row" style="padding:18px 22px"><div class="t"><b style="font-size:16px">{t}</b><span>{s}</span></div><div class="r" style="font-size:13.5px;font-weight:500"><span class="{rc}">{r}</span></div></div>'
jobs=f'''<div class="pg">{bar(BACK,'',PLUS+stk(AO('o1'),HP('h1','ส'),HP('h2','น'),MORE(1)))}
 <div class="lt">คุณเอก</div><div class="st">เซลส์ดูแลลูกค้า · The Bean Café</div>
 <div class="st" style="margin-top:18px;color:#6e6e73">จำได้ทุกงาน — คู่มือเซลส์ v3 · นโยบายส่วนลด · ลูกค้า 214 ราย</div>
 <div class="tabs" style="margin-top:24px"><span class="a">งาน 8</span><span>งานประจำ 2</span><span>เก็บแล้ว</span></div>
 <div class="sec">รออนุมัติ</div>
 {job('ใบเสนอราคา ร้านดอยช้าง','ร่าง Q-0012 ฿12,500 · 9:41','● รออนุมัติ','amb')}
 <div class="sec">กำลังทำ</div>
 {job('ตามลูกค้าที่เงียบเกิน 14 วัน','ส่งแล้ว 6 จาก 11 ราย','● กำลังทำ','grn')}
 {job('เตรียมข้อมูลประชุมร้านบ้านสวน','สรุปประวัติซื้อ 12 เดือน','● กำลังทำ','grn')}
 <div class="sec">งานประจำ</div>
 {job('สรุปดีลค้างทุกเช้า','ทุกวัน 08:00','พรุ่งนี้','gry')}
 <div class="sec">เสร็จแล้ว</div>
 {job('ย้ายดีล 4 รายการเข้าขั้นเจรจา','เมื่อวาน 16:20','เสร็จ','gry')}
 </div>'''

room=f'''<div class="pg">{bar(BACK,'ใบเสนอราคา ร้านดอยช้าง<small>คุณเอก · The Bean Café</small>',stk(AO('o1'),HP('h1','ส'),HP('h2','น'),MORE(1)))}
 <div class="ubb">ทำใบเสนอราคาให้คุณสมชาย ร้านดอยช้าง เครื่องชงกาแฟ 2 ชุด ส่วนลด 5%</div>
 <div class="aiw">{av('a1','อ',32)}<div class="x">
  <div class="stp"><div><b>✓</b>พบลูกค้าใน CRM · คุณสมชาย</div><div><b>✓</b>ดึงราคาสินค้า 2 รายการ</div><div><b>✓</b>ส่วนลด 5% อยู่ในนโยบาย</div><div class="p"><b>●</b>รอคุณอนุมัติก่อนส่ง</div></div>
  <div class="apc"><div class="tg">รออนุมัติ</div>
   <div class="h"><b>ใบเสนอราคา Q-0012</b><span class="m">฿12,500</span></div><div class="s">คุณสมชาย · ร้านดอยช้าง</div>
   <div class="li"><span>เครื่องชง Espresso × 2</span><span>฿13,158</span></div><div class="li"><span>ส่วนลด 5%</span><span>−฿658</span></div>
   <div class="acts"><div>แก้</div><div class="d">อนุมัติและส่ง LINE</div></div></div>
  <div style="margin-top:18px">อนุมัติแล้วผมจะส่งให้ลูกค้าทาง LINE และตั้งเตือนติดตามใน 3 วันครับ</div>
 </div></div></div>
 <div class="inp"><div class="pl"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>สั่งงานต่อในงานนี้…<svg class="mic" width="24" height="24" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><div class="s"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg></div></div>'''

def ap(c,l,who,tm,t,amt,d,btn): return f'<div class="it2"><div class="w">{av(c,l,26)}{who}<span class="tm">{tm}</span></div><div class="h"><b>{t}</b><span>{amt}</span></div><p>{d}</p><div class="ac"><span>ดู</span><span>แก้</span><span class="d">{btn}</span></div></div>'
appr=f'''<div class="pg">{bar(BACK)}
 <div class="lt">รออนุมัติ</div><div class="st">5 รายการ · ทุกกิจการ ⌄</div>
 <div class="tabs"><span class="a">ทั้งหมด 5</span><span>เงิน 2</span><span>ส่งลูกค้า 2</span><span>โพสต์ 1</span></div>
 {ap('a1','อ','คุณเอก · The Bean Café','9:41','ใบเสนอราคา Q-0012','฿12,500','คุณสมชาย · เครื่องชง 2 ชุด ลด 5%','อนุมัติและส่ง')}
 {ap('a4','ด','ไอดิน · The Bean Café','8:15','โพสต์โปรเดือน ต.ค.','','FB + IG · ลงพฤ. 1 ต.ค. 10:00','อนุมัติ')}
 {ap('a2','ม','น้องมะลิ · The Bean Café','เมื่อวาน','ตอบรีวิว 1 ดาว','','"ขออภัยค่ะ กาแฟรอนานเกินไป…"','อนุมัติและตอบ')}
 {ap('a3','น','แนน · บลูเฮาส์','เมื่อวาน','คืนเงินห้อง 204','฿2,400','ยกเลิกก่อน 7 วัน ตามนโยบาย','อนุมัติ')}
 </div>'''

ident=f'''<div class="pg">{bar(BACK,'ขั้น 2 จาก 4',CLOSE)}
 <div class="prog"><i></i><i></i><i class="n"></i><i class="n"></i></div>
 <div class="lt">ตัวตน</div><div class="st">คุณเอกจะพูดและวางตัวอย่างไร</div>
 <div style="display:flex;gap:18px;align-items:center;margin-top:26px">{av('a1','อ',64)}<div style="flex:1"><div class="fld">คุณเอก</div><div class="dots"><i style="background:#3a64d8;outline:2px solid #111;outline-offset:2px"></i><i style="background:#d8436a"></i><i style="background:#23945a"></i><i style="background:#c47a12"></i><i style="background:#6a4fd8"></i></div></div></div>
 <div class="opt"><div class="n">เพศ<small>ลงท้าย ครับ / ค่ะ</small></div>{seg(['ผู้ชาย','ผู้หญิง','ไม่ระบุ'],0)}</div>
 <div class="opt"><div class="n">น้ำเสียง</div>{seg(['สุภาพ','เป็นกันเอง','ทางการ'],0)}</div>
 <div class="opt"><div class="n">อารมณ์ขัน</div>{seg(['ไม่มี','นิดหน่อย','ขี้เล่น'],1)}</div>
 <div class="opt"><div class="n">ความยาวคำตอบ</div>{seg(['สั้น','กลาง','ละเอียด'],0)}</div>
 <div class="opt"><div class="n">ภาษา</div><div class="chips"><span class="a">ไทย</span><span class="a">English</span><span>中文</span><span>+ เพิ่ม</span></div></div>
 <div class="qt" style="margin-top:26px"><div style="font-size:12.5px;font-weight:600;color:#6a5ad8;margin-bottom:4px">💬 ตัวอย่างการพูด</div>สวัสดีครับคุณสมชาย ใบเสนอราคาพร้อมแล้วครับ ลดให้ 5% ตามที่คุยไว้ แก้วแรกหลังติดตั้งผมขอชิมเองนะครับ ☕</div>
 </div><div class="foot"><div class="btn1">ถัดไป</div></div>'''

def ur(n,p): return f'<div class="urow"><span class="n">{n}</span><div class="ub"><i style="width:{p*100/24:.0f}%"></i></div><b>{p}%</b></div>'
plan=f'''<div class="pg">{bar(BACK)}
 <div class="lt">แพ็กฟรี</div><div class="st">คุณสุข · โควตาใช้ร่วมกัน 3 กิจการ</div>
 <div class="big">62%</div>
 <div class="st" style="margin-top:12px;color:#6e6e73">ใช้ไปแล้ว · รอบใหม่ 1 ต.ค. (อีก 4 วัน)</div>
 <div class="ub" style="height:6px;border-radius:3px;margin-top:16px"><i style="width:62%"></i></div>
 <div class="st grn" style="margin-top:12px">✓ พอใช้ถึงรอบใหม่</div>
 <div style="display:flex;gap:12px;margin-top:28px"><div class="btn2">ดูแพ็กทั้งหมด</div></div>
 <div class="sec" style="margin-top:36px">ใช้ไปกับใคร · The Bean Café</div>
 <div class="gl" style="margin-top:12px;border-radius:26px;padding:6px 20px">{ur('น้องมะลิ',24)}{ur('คุณเอก',21)}{ur('พลอยใส',9)}{ur('ไอดิน',6)}{ur('ฟ้า',2)}</div>
 <div class="row" style="margin-top:14px;margin-top:14px"><div class="t"><b style="font-size:16px;font-weight:500">ถ้าโควตาหมดก่อนรอบใหม่</b></div><span style="font-size:15px;color:#8e8e93">พักทีมจนรอบใหม่</span></div>
 </div>'''

def pr(t,s): return f'<div class="row"><div class="t"><b style="font-size:16px;font-weight:500">{t}</b></div><span style="font-size:14.5px;color:#8e8e93">{s}</span>{AR}</div>'
profile=f'''<div class="pg">{bar(BACK,'',DOTS)}
 <div style="text-align:center;margin-top:18px"><div style="display:flex;justify-content:center">{av('a1','อ',96)}</div>
 <div style="font-size:26px;font-weight:700;margin-top:16px;letter-spacing:-.5px">คุณเอก</div>
 <div class="st">เซลส์ดูแลลูกค้า · จ้างเมื่อ 1 ส.ค. 69</div>
 <div class="st grn" style="margin-top:10px">● ทำงานอยู่ · 2 งาน</div></div>
 <div class="grid"><div><b>318</b><span>งานเดือนนี้</span></div><div><b>94%</b><span>ผ่านโดยไม่ต้องแก้</span></div><div><b>52 ชม.</b><span>เวลาที่ประหยัด</span></div><div><b>21%</b><span>โควตาที่ใช้ · เพดาน 25%</span></div></div>
 <div style="margin-top:10px">{pr('ตัวตน','ผู้ชาย · สุภาพ · ขำนิดหน่อย')}{pr('คู่มือการทำงาน','v3 · 20 ก.ย.')}{pr('สิทธิ์','CRM · บัญชี · +2')}{pr('ความรู้','4 รายการ')}</div>
 </div><div class="foot"><div class="btn2">พักงาน</div><div class="btn2" style="color:#d33">เลิกจ้าง</div></div>'''

def bz(c,l,n,s,r): return f'<div class="row"><div class="lg {c}">{l}</div><div class="t"><b>{n}</b><span>{s}</span></div>{r}</div>'
switch=f'''<div class="pg">{bar(r=PLUS+stk(HP('h1','ส'),HP('h2','น'),AO('o1'),AO('o2'),MORE(4)))}
 <div class="lt">The Bean Café {CH}</div><div class="st">พนักงาน AI 5 คน · แพ็กฟรี</div></div>
 <div class="dim"></div>
 <div class="sheet"><div class="grab"></div>
  <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">กิจการ</div><div class="st">แต่ละกิจการมีทีม AI และข้อมูลแยกกัน</div>
  <div style="margin-top:18px">
  {bz('l1','B','The Bean Café','AI 5 คน · วันนี้ 42 งาน','<svg width="22" height="22" viewBox="0 0 24 24" style="stroke:#111;stroke-width:2.4"><path d="M5 12l5 5L20 7"/></svg>')}
  {bz('l2','BH','บลูเฮาส์ รีสอร์ท','AI 9 คน · วันนี้ 67 งาน','<span class="bd">2</span>')}
  {bz('l3','S','Sweet Studio','AI 2 คน · วันนี้ 5 งาน','')}
  <div class="row"><div class="lg" style="border:1.5px dashed #c5c7d6;color:#8e8e93">+</div><div class="t"><b style="font-weight:500">เพิ่มกิจการใหม่</b></div></div>
  </div>
  <div class="ul" style="margin-top:22px !important"><span>แพ็กฟรี · โควตาใช้ร่วมกันทุกกิจการ 62%</span><span>รอบใหม่ 1 ต.ค.</span></div><div class="ub"><i style="width:62%"></i></div>
  <div class="st" style="margin-top:18px;line-height:1.5">พนักงาน AI เห็นข้อมูลเฉพาะกิจการของตัวเอง ข้อมูลลูกค้า บัญชี และแชทไม่ข้ามไปกิจการอื่น</div>
 </div>'''

def phone(b,l): return f'<div class="phone"><div class="screen">{STATUS}{b}</div><div class="label">{l}</div></div>'
P=[(team,'G1 · ทีม'),(switch,'G2 · สลับกิจการ'),(jobs,'G3 · งานของพนักงาน'),(room,'G4 · ห้องสั่งงาน'),(appr,'G5 · รออนุมัติ'),(ident,'G6 · จ้าง ขั้น 2 ตัวตน'),(plan,'G7 · แพ็กและการใช้งาน'),(profile,'G8 · โปรไฟล์พนักงาน')]
html=f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="title"><h1>SHARK · ทีมพนักงาน AI — Liquid Glass · Airy</h1><p>แบบกระจกเดิม · ระยะบรรทัด แถว และคอลัมน์กว้างขึ้น · ไม่มีเส้นใต้/เส้นคั่น · โปร่งโล่งขึ้น</p></div>
<div class="phones">{''.join(phone(b,l) for b,l in P)}</div></body></html>'''
open('ai-team-glass-airy.html','w').write(html)
