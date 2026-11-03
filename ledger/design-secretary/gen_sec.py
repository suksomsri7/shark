# เลขา AI · session — ตัวสร้างภาพ (ใช้ CSS Airy เดิมจาก chat-glass)
import re,sys
base=open('/root/design/chat-glass/gen_glass_airy.py').read().split('team=f',1)[0]
exec(base)   # CSS, STATUS, BACK, CLOSE, PLUS, DOTS, CH, AR, av, seg, bar, AO, stk, HP, MORE, SRCH, G,W,I
full=open('/root/design/chat-glass/gen_airy_full.py').read()
CSS+=re.search(r"CSS\+=r'''(.*?)'''",full,re.S).group(1)
CSS+=r'''
/* ---- เลขา AI · session ---- */
.sysp{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:9px;background:rgba(150,150,185,.14);color:#55556a;margin-right:6px}
.sysp i{width:7px;height:7px;border-radius:50%;display:inline-block}
.s-pos{background:#ff9f0a}.s-crm{background:#5a64d8}.s-bk{background:#178a99}.s-mem{background:#d8436a}.s-acc{background:#23945a}.s-kb{background:#c47a12}.s-chat{background:#34c759}.s-dorm{background:#6a4fd8}
.ses{display:flex;gap:14px;padding:16px 18px;margin-top:12px;border-radius:26px;align-items:flex-start}
.ses .t{flex:1;min-width:0}.ses .t b{font-size:16.5px;font-weight:600;display:block;line-height:1.35}
.ses .t span{font-size:14px;color:#6e6e73;display:block;margin-top:5px;line-height:1.45}
.ses .t .sy{margin-top:9px}
.ses .r{font-size:12.5px;color:#aeaeb2;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:none}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:1px}
.run{background:#3cc47f;box-shadow:0 0 0 4px rgba(60,196,127,.22)}.wait{background:#ffb020;box-shadow:0 0 0 4px rgba(255,176,32,.22)}.done{background:#c5c8d4}
.sl{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600}
.step{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:18px;margin-top:8px}
.step .k{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-size:11px;font-weight:700;color:#fff;flex:none}
.step .x{flex:1;font-size:14px;line-height:1.45}.step .x b{font-weight:600;display:block}.step .x span{color:#6e6e73;font-size:13px}
.step .ok{color:#3cc47f;font-weight:700;flex:none;font-size:15px}.step .pz{color:#ffb020;font-weight:700;flex:none}
.live{display:flex;align-items:center;gap:10px;font-size:13.5px;color:#55556a;padding:12px 16px;border-radius:18px;margin-top:16px}
.live .dot{margin:0}
.why{font-size:13px;color:#c47a12;background:rgba(255,176,32,.14);border-radius:12px;padding:8px 12px;margin-top:12px;line-height:1.5}
.sum{border-radius:22px;padding:16px 18px;margin-top:14px}.sum b{font-size:15.5px;display:block}.sum p{font-size:14px;color:#6e6e73;line-height:1.55;margin-top:6px}
.lnk{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;margin-top:8px;font-size:14px}
.lnk .k{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-size:11px;font-weight:700;color:#fff;flex:none}
.lnk span{color:#8e8e93;font-size:13px;margin-left:auto}
.big2{font-size:40px;font-weight:700;letter-spacing:-1.5px;line-height:1.1;margin-top:20px}
.bigin{min-height:150px;border-radius:28px;padding:20px 22px;font-size:18px;line-height:1.6;color:#9a9aab;margin-top:22px;display:flex;flex-direction:column}
.bigin .tools{margin-top:auto;display:flex;gap:10px;align-items:center}
.bigin .tools .ib{width:44px;height:44px;background:rgba(255,255,255,.9)}
.bigin .tools .s{margin-left:auto;width:48px;height:48px;border-radius:50%;background:#16161c;display:grid;place-items:center}.bigin .tools .s svg{stroke:#fff}
.sugg{padding:14px 16px;border-radius:20px;margin-top:10px;font-size:14.5px;line-height:1.5;display:flex;gap:12px;align-items:center}
.sugg .x{flex:1}.sugg .x span{display:block;color:#8e8e93;font-size:13px;margin-top:3px}
.lock{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding-top:150px}
.lock .tm{font-size:92px;font-weight:300;letter-spacing:-3px;color:#16161c;width:auto}.lock .dt{font-size:20px;color:#55556a;margin-top:2px}
.ntf{width:470px;border-radius:26px;padding:16px 18px;margin-top:14px;text-align:left}
.ntf .h{display:flex;align-items:center;gap:10px;font-size:13px;color:#6e6e73}.ntf .h .tm2{margin-left:auto;font-size:12.5px}
.ntf b{display:block;font-size:15.5px;margin-top:8px}.ntf p{font-size:14px;color:#55556a;margin-top:4px;line-height:1.5}
.ntf .acts{margin-top:12px}.ntf .acts div{height:40px;font-size:14px}
.appic{width:30px;height:30px;border-radius:9px;background:#16161c;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700}
.dev{display:flex;gap:10px;margin-top:14px}.dev div{flex:1;border-radius:18px;padding:12px 10px;text-align:center;font-size:13px;font-weight:600}.dev div span{display:block;font-size:11.5px;color:#8e8e93;font-weight:400;margin-top:3px}
.lvl{display:flex;gap:6px;margin-top:10px}.lvl span{flex:1;text-align:center;padding:8px 0;font-size:12px;border-radius:10px;background:rgba(150,150,185,.12);color:#6e6e73}.lvl .a{background:#16161c;color:#fff;font-weight:600}.lvl .lk{background:rgba(150,150,185,.06);color:#c5c7d6}
.sysrow{padding:14px 16px;border-radius:22px;margin-top:10px}.sysrow .h{display:flex;align-items:center;gap:10px;font-size:15.5px;font-weight:600}.sysrow .h small{margin-left:auto;font-size:12.5px;color:#8e8e93;font-weight:400}
.rule{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:22px;margin-top:10px}.rule .t{flex:1}.rule .t b{font-size:15.5px;font-weight:600;display:block}.rule .t span{font-size:13.5px;color:#6e6e73;display:block;margin-top:4px;line-height:1.45}
.tl{display:flex;gap:14px;padding:14px 0}.tl .tmx{width:50px;font-size:12.5px;color:#8e8e93;flex:none;padding-top:2px}.tl .ln{width:2px;background:rgba(150,150,185,.25);flex:none;position:relative}.tl .ln i{position:absolute;left:-5px;top:4px;width:12px;height:12px;border-radius:50%;background:#16161c}
.tl .x{flex:1;font-size:14.5px;line-height:1.5}.tl .x b{font-weight:600}.tl .x span{display:block;color:#6e6e73;font-size:13px;margin-top:3px}
.kb{padding:14px 16px;border-radius:20px;margin-top:10px;display:flex;gap:12px;align-items:center}.kb .t{flex:1}.kb .t b{font-size:15px;font-weight:600;display:block}.kb .t span{font-size:13px;color:#6e6e73;display:block;margin-top:3px}
.pdpa{border-radius:22px;padding:16px 18px;margin-top:12px}.pdpa b{font-size:15px;display:block}.pdpa p{font-size:13.5px;color:#6e6e73;line-height:1.55;margin-top:6px}
.sec{margin-top:26px}
.ses .t .sy span,.rt .sy span{display:inline-flex;margin-top:0}
.sysp.soon{opacity:.5}
.kb .t b .tagp{display:inline-block;width:auto;margin-top:0;margin-left:8px}
/* ---- รอบ 3 · ไอคอนซ้ายบน ห้องร่วม สมัคร ---- */
.ib.on{background:#16161c;border-color:#16161c}.ib.on svg{stroke:#fff}
.sysl{align-self:center;font-size:12.5px;color:#8e8e93;margin-top:16px;padding:5px 14px;border-radius:12px;background:rgba(150,150,185,.12);text-align:center}
.oth{display:flex;gap:10px;margin-top:16px;align-items:flex-start}.oth .hp{width:32px;height:32px;font-size:13px}
.oth .nm{font-size:12.5px;color:#8e8e93;margin-bottom:4px}.oth .bb{border-radius:20px;border-top-left-radius:6px;padding:12px 16px;font-size:15.5px;line-height:1.5}
.fl{font-size:14px;font-weight:600;color:#55556a;margin:22px 0 8px 4px}
.fld.in{font-size:18px;font-weight:500;padding:15px 18px;flex:none}.fld.in.ph{color:#aeaeb2;font-weight:400}
.otp{display:flex;gap:10px;justify-content:center;margin-top:30px}.otp div{width:58px;height:72px;border-radius:18px;display:grid;place-items:center;font-size:30px;font-weight:600}.otp .cur{outline:2.5px solid #16161c}
.ses .t b .dot{display:inline-block;margin-top:0}
.ck{width:26px;height:26px;border-radius:50%;border:2px solid #c5c7d6;flex:none;display:grid;place-items:center}.ck.on{background:#16161c;border-color:#16161c}.ck svg{stroke:#fff;stroke-width:3}
'''
dk=open('/root/design/chat-glass/gen_airy_dark.py').read()
DARK=re.search(r"DARK=r'''(.*?)'''",dk,re.S).group(1)
DARK+=r'''
.sysp{background:rgba(255,255,255,.1);color:#c2c2d0}
.ses .t span,.step .x span,.live,.sum p,.lnk span,.sugg .x span,.ntf .h,.ntf p,.lock .dt,.dev div span,.lvl span,.rule .t span,.tl .x span,.kb .t span,.pdpa p,.sysrow .h small,.tl .tmx{color:#a6a6b4}
.lock .tm{color:#f2f2f7}
.ses,.step,.live,.sum,.lnk,.bigin,.sugg,.ntf,.dev div,.sysrow,.rule,.kb,.pdpa{background:linear-gradient(135deg,rgba(255,255,255,.115),rgba(255,255,255,.045));border:1.5px solid rgba(255,255,255,.13);box-shadow:0 10px 30px rgba(0,0,0,.28)}
.bigin .tools .ib{background:rgba(255,255,255,.1)}.bigin .tools .s{background:#f2f2f7}.bigin .tools .s svg{stroke:#16161c}
.lvl span{background:rgba(255,255,255,.08)}.lvl .a{background:#f2f2f7;color:#16161c}.lvl .lk{background:rgba(255,255,255,.03);color:#4c4c5c}
.why{background:rgba(255,176,32,.16);color:#ffc65c}
.tl .ln{background:rgba(255,255,255,.14)}.tl .ln i{background:#f2f2f7}
.appic{background:#f2f2f7;color:#16161c}
.done{background:#4c4c5c}
.ib.on{background:#f2f2f7;border-color:#f2f2f7}.ib.on svg{stroke:#16161c}
.oth .bb,.otp div{background:linear-gradient(135deg,rgba(255,255,255,.115),rgba(255,255,255,.045));border:1.5px solid rgba(255,255,255,.13)}
.otp .cur{outline-color:#f2f2f7}.sysl{background:rgba(255,255,255,.08);color:#a6a6b4}.fl{color:#c2c2d0}
.ck{border-color:#5c5c6c}.ck.on{background:#f2f2f7;border-color:#f2f2f7}.ck svg{stroke:#16161c}
'''
INLINE=eval(re.search(r"INLINE=(\[.*?\n\])",dk,re.S).group(1))

# ---------- helpers ----------
SYS={'pos':('POS','s-pos'),'crm':('CRM','s-crm'),'bk':('จองคิว','s-bk'),'mem':('สมาชิก','s-mem'),'acc':('บัญชี','s-acc'),'kb':('บอร์ดงาน','s-kb'),'chat':('แชท LINE/FB','s-chat'),'dorm':('หอพัก','s-dorm')}
def sp(*ks): return ''.join(f'<span class="sysp"><i class="{SYS[k][1]}"></i>{SYS[k][0]}</span>' for k in ks)
KC={'pos':'#ff9f0a','crm':'#5a64d8','bk':'#178a99','mem':'#d8436a','acc':'#23945a','kb':'#c47a12','chat':'#34c759','dorm':'#6a4fd8'}
KL={'pos':'POS','crm':'CRM','bk':'คิว','dorm':'หอ','mem':'สมา','acc':'บัญชี','kb':'งาน','chat':'แชท'}
def kk(k,l=None):
    t=l or KL[k]; fs='9.5px' if len(t)>=4 else '11px'
    return f'<div class="k" style="background:{KC[k]};font-size:{fs}">{t}</div>'
SEC=lambda s=44: f'<div class="ao o1" style="width:{s}px;height:{s}px"></div>'
def ses(st,t,s,sy,r,by='',mem=''):
    d={'run':'run','wait':'wait','done':'done'}[st]
    return f'<div class="ses gl"><div class="t"><b><span class="dot {d}"></span>{t}</b><span>{s}</span><div class="sy">{sp(*sy)}{f'<span class="sysp" style="background:none;color:#8e8e93">สั่งโดย {by}</span>' if by else ''}{f'<span class="sysp" style="background:none;color:#8e8e93">ร่วมกับ {mem}</span>' if mem else ''}</div></div><div class="r">{r}</div></div>'
def step(k,b,s,state='ok'):
    tail={'ok':'<span class="ok">✓</span>','run':'<span class="pz">●</span>','wait':'<span class="pz">⏸</span>'}[state]
    return f'<div class="step gl">{kk(k)}<div class="x"><b>{b}</b><span>{s}</span></div>{tail}</div>'
MIC='<svg class="mic" width="24" height="24" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
SEND='<div class="s"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg></div>'
INP=lambda ph: f'<div class="inp"><div class="pl"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>{ph}{MIC}{SEND}</div>'
CHATI=lambda on: f'<div class="ib{" on" if on else ""}"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/></svg></div>'
TEAMI=lambda on: f'<div class="ib{" on" if on else ""}"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.4c1.9.8 3 2.8 3 5.6"/></svg></div>'
ADDP='<div class="ib"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c0-3.6 2.9-6 6.5-6 1.2 0 2.3.3 3.3.8M18 14v6M15 17h6"/></svg></div>'
CKON='<div class="ck on"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg></div>'
CKOFF='<div class="ck"></div>'
HELPI=lambda on: f'<div class="ib{" on" if on else ""}"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg></div>'
TOP=bar(CHATI(1)+TEAMI(0)+HELPI(0),'',PLUS)
TOPT=bar(CHATI(0)+TEAMI(1)+HELPI(0),'','')
TOPH=bar(CHATI(0)+TEAMI(0)+HELPI(1),'',PLUS)
PLAT='<div class="hp" style="background:linear-gradient(135deg,#16161c,#4a4a60);font-size:12px">SH</div>'
def hcase(st,no,t,s,r):
    d={'open':'wait','pend':'run','done':'done'}[st]
    return f'<div class="ses gl"><div class="t"><b><span class="dot {d}"></span>{t}</b><span>{s}</span><div class="sy"><span class="sysp">{no}</span></div></div><div class="r">{r}</div></div>'
def brow(shop,no,t,s,r,who=''):
    return f'<div class="row"><div class="lg l1" style="font-size:14px">{shop[:2]}</div><div class="t"><b>{t}<em>{no}</em></b><span>{shop} · {s}</span></div><div class="r" style="font-size:12.5px;color:#aeaeb2;display:flex;flex-direction:column;align-items:flex-end;gap:6px">{r}{who}</div></div>'
def oth(c,l,n,t): return f'<div class="oth">{HP(c,l)}<div><div class="nm">{n}</div><div class="bb gl">{t}</div></div></div>'
def staff(c,l,n,role,sub,r='',ck=''): return f'<div class="row">{HP(c,l)}<div class="t"><b>{n}<em>{role}</em></b><span>{sub}</span></div>{r}{ck}</div>'

# ---------- ชุด ก ----------
A1=f'''<div class="pg">{TOP}
 <div class="lt">The Bean Café {CH}</div>
 <div class="st">เลขา Shark · กำลังทำ 3 · รออนุมัติ 2 · เสร็จวันนี้ 14</div>
 <div class="srch gl"><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>ค้นหางานที่เคยสั่ง ลูกค้า หรือเอกสาร</div>
 <div class="tabs"><span class="a">ทั้งหมด</span><span>กำลังทำ<em style="color:#3cb577">3</em></span><span>รออนุมัติ<em>2</em></span><span>เสร็จ</span></div>
 {ses('wait','ใบเสนอราคา ร้านดอยช้าง','ร่างเสร็จ ฿12,500 · รอคุณอนุมัติก่อนส่ง LINE',['crm','acc','chat'],'9:41<span class=bd>1</span>',mem='สมใจ')}
 {ses('run','ตามลูกค้าที่เงียบเกิน 14 วัน','ร่างข้อความ 11 ราย · ส่งแล้ว 6 ที่อนุมัติ · รอที่เหลือ',['crm','chat'],'ตอนนี้')}
 {ses('run','สรุปยอดขายเมื่อวาน + ของใกล้หมด','ดึงข้อมูล POS แล้ว · กำลังเขียนสรุป',['pos'],'ตอนนี้')}
 {ses('wait','ปิดบิลค้างห้อง 204 · คืนมัดจำ','คืนเงิน ฿2,400 ต้องอนุมัติเสมอ',['dorm','acc'],'8:15<span class=bd>1</span>')}
 </div>'''

A2=f'''<div class="pg">{bar(CLOSE,'เริ่มงานใหม่<small>The Bean Café</small>','')}
 <div style="display:flex;align-items:center;gap:14px;margin-top:22px">{SEC(52)}<div><div style="font-size:17px;font-weight:600">สวัสดีครับคุณสุข ให้ผมทำอะไรดี</div><div class="st" style="margin-top:3px">สั่งเป็นภาษาพูดได้เลย ผมทำในระบบ SHARK ให้ทั้งหมด</div></div></div>
 <div class="sec">Shark เสนอจากข้อมูลวันนี้ · แค่ข้อเสนอ ไม่เริ่มจนกว่าคุณแตะ</div>
 <div class="sugg gl">{kk('crm')}<div class="x">มีดีล 3 รายการเงียบเกิน 14 วัน<span>ให้ผมส่งข้อความตามให้ไหม</span></div>{AR}</div>
 <div class="sugg gl">{kk('pos')}<div class="x">เมล็ดกาแฟเอธิโอเปียเหลือ 2 กก.<span>ทำใบสั่งซื้อถึงซัพพลายเออร์เดิม</span></div>{AR}</div>
 <div class="sec">งานที่สั่งบ่อย</div>
 <div class="chips" style="flex-wrap:wrap;row-gap:8px"><span>สรุปยอดขายเมื่อวาน</span><span>ใบเสนอราคา</span><span>ตามลูกค้าเงียบ</span><span>เช็กคิวพรุ่งนี้</span><span>ค้างชำระหอพัก</span><span>โพสต์โปรเดือนนี้</span></div>
 <div class="sec">ระบบที่ผมเข้าถึงได้ในกิจการนี้</div>
 <div style="margin-top:10px;line-height:2.1">{sp('pos','crm','bk','dorm','mem','acc','kb','chat')}</div>
 </div>
 {INP('พิมพ์หรือพูดสั่งงาน…')}'''

A3=f'''<div class="pg">{bar(BACK,'ใบเสนอราคา ร้านดอยช้าง<small><span class="dot run"></span>กำลังทำ · เริ่ม 9:38</small>',DOTS)}
 <div class="ubb">ทำใบเสนอราคาให้คุณสมชาย ร้านดอยช้าง เครื่องชง 2 ชุด ลด 5% แล้วส่ง LINE ให้เลย</div>
 <div class="aiw">{SEC(32)}<div class="x">รับทราบครับ ขอเช็กข้อมูลในระบบก่อนนะครับ
  {step('crm','ค้นหาลูกค้า "สมชาย ดอยช้าง"','พบ 1 ราย · ซื้อครั้งล่าสุด 12 ส.ค. · เครดิต 30 วัน')}
  {step('pos','ดึงราคาสินค้า','เครื่องชง Espresso M2 · ฿6,579/ชุด · มีสต็อก 3')}
  {step('acc','ตรวจนโยบายส่วนลด','ลดได้สูงสุด 10% · 5% อยู่ในเกณฑ์')}
  {step('acc','ร่างใบเสนอราคา Q-0012','กำลังสร้างเอกสาร…','run')}
  <div class="live gl"><span class="dot run"></span>ทำงานอยู่เบื้องหลัง — ปิดแอปได้ ผมจะแจ้งเมื่อต้องอนุมัติหรือเสร็จ</div>
 </div></div>
 </div>
 {INP('สั่งเพิ่มในงานนี้…')}'''

A4=f'''<div class="pg">{bar(BACK,'ใบเสนอราคา ร้านดอยช้าง<small><span class="dot wait"></span>รออนุมัติ · 9:41</small>',DOTS)}
 <div class="aiw" style="margin-top:14px">{SEC(32)}<div class="x">ร่างเสร็จแล้วครับ ขออนุมัติก่อนส่งถึงลูกค้า
  <div class="apc"><div class="tg">รออนุมัติ · เงิน + ส่งถึงลูกค้า</div>
   <div class="h"><b>ใบเสนอราคา Q-0012</b><span class="m">฿12,500</span></div><div class="s">คุณสมชาย · ร้านดอยช้าง · เครดิต 30 วัน</div>
   <div class="li"><span>เครื่องชง Espresso M2 × 2</span><span>฿13,158</span></div><div class="li"><span>ส่วนลด 5%</span><span>−฿658</span></div>
   <div class="li" style="border-top:1px solid rgba(150,150,185,.2);margin-top:4px;padding-top:12px"><span>จะส่ง LINE ถึง</span><span>คุณสมชาย (ผูกกับ CRM)</span></div>
   <div class="why">ทำไมต้องอนุมัติ: ออกเอกสารเงิน + ส่งข้อความถึงลูกค้า — ต้องมีคนอนุมัติเสมอ</div>
   <div class="acts"><div>แก้</div><div>ตีกลับ</div><div class="d">อนุมัติและส่ง</div></div></div>
  <div class="note" style="text-align:left;margin-top:12px">รุ่นแรก: ทุกงานที่เขียนข้อมูลลงระบบหรือส่งถึงลูกค้า รอคนอนุมัติทุกครั้ง · Shark อ่านข้อมูลและร่างได้เอง</div>
  <div style="margin-top:16px;font-size:15px;line-height:1.6">อนุมัติแล้วผมจะส่ง LINE และตั้งติดตามใน 3 วันครับ</div>
 </div></div></div>
 {INP('สั่งเพิ่มในงานนี้…')}'''

A5=f'''<div class="pg">{bar(BACK,'ใบเสนอราคา ร้านดอยช้าง<small><span class="dot done"></span>เสร็จ · 9:44 · ใช้เวลา 6 นาที</small>',DOTS)}
 <div class="aiw" style="margin-top:14px">{SEC(32)}<div class="x">เสร็จแล้วครับ สรุปสิ่งที่ทำไป
  <div class="sum gl"><b>ส่งใบเสนอราคา Q-0012 ฿12,500 ให้คุณสมชายทาง LINE แล้ว</b><p>ลูกค้าอ่านแล้ว 9:43 · ตั้งติดตามวันที่ 3 ต.ค. · ดีลใน CRM ย้ายเข้าขั้น "เสนอราคา"</p></div>
  <div class="sec" style="margin-top:18px">สิ่งที่เปลี่ยนในระบบ</div>
  <div class="lnk gl">{kk('acc')}ใบเสนอราคา Q-0012<span>เปิดดู ›</span></div>
  <div class="lnk gl">{kk('crm')}ดีล "ดอยช้าง · เครื่องชง 2 ชุด"<span>ขั้นเสนอราคา ›</span></div>
  <div class="lnk gl">{kk('chat')}ข้อความ LINE ถึงคุณสมชาย<span>อ่านแล้ว ›</span></div>
  <div class="lnk gl">{kk('kb')}การ์ด "ติดตามดอยช้าง" 3 ต.ค.<span>บอร์ดขาย ›</span></div>
  <div class="acts" style="margin-top:18px"><div>ย้อนกลับ <small style="color:#8e8e93;font-weight:400;margin-left:4px">ถึงพรุ่งนี้ 9:44</small></div><div>สอน Shark</div><div>ทำซ้ำทุกเดือน</div></div>
  <div style="margin-top:16px;font-size:14.5px;color:#6e6e73;line-height:1.6">ผู้สั่ง คุณสุข · ผู้อนุมัติ คุณสุข 9:41 · บันทึกการกระทำ 7 รายการ</div>
 </div></div></div>
 {INP('สั่งต่อจากงานนี้…')}'''

def ap(k,who,tm,t,amt,d,btn,why): return f'<div class="it2"><div class="w">{kk(k)}{who}<span class="tm">{tm}</span></div><div class="h"><b>{t}</b><span>{amt}</span></div><p>{d}</p><div class="why" style="margin-top:8px">{why}</div><div class="ac"><span>ดู</span><span>แก้</span><span class="d">{btn}</span></div></div>'
A6=f'''<div class="pg">{bar(BACK)}
 <div class="lt">รออนุมัติ</div><div class="st">4 รายการ · ทุกกิจการ ⌄ · แตะตัวเลขรออนุมัติบนหน้าหลักเพื่อมาที่นี่</div>
 <div class="tabs"><span class="a">ทั้งหมด 4</span><span>เงิน 2</span><span>ส่งลูกค้า 2</span><span>ลบ/ยกเลิก 1</span></div>
 {ap('acc','The Bean Café · ใบเสนอราคา','9:41','ใบเสนอราคา Q-0012','฿12,500','คุณสมชาย · เครื่องชง 2 ชุด ลด 5% · ส่ง LINE','อนุมัติและส่ง','เงิน + ส่งถึงลูกค้า')}
 {ap('dorm','บลูเฮาส์ · คืนมัดจำ','8:15','คืนเงินห้อง 204','฿2,400','ยกเลิกก่อน 7 วัน ตามนโยบาย · โอนเข้าบัญชีเดิม','อนุมัติ','คืนเงิน = ต้องอนุมัติเสมอ')}
 {ap('chat','The Bean Café · ตอบรีวิว','เมื่อวาน','ตอบรีวิว 1 ดาว บน Facebook','','"ขออภัยค่ะ กาแฟรอนานเกินไป ครั้งหน้า…" (ลงชื่อว่าเป็นผู้ช่วย AI)','อนุมัติและตอบ','ส่งถึงลูกค้าสาธารณะ')}
 </div>'''

def rt(k,t,s,nx): return f'<div class="ses gl" style="align-items:center"><div class="t"><b>{t}</b><span>{s}</span><div class="sy">{sp(*k)}</div></div><div class="r" style="font-size:13px;color:#8e8e93">{nx}</div><div class="tgl"></div></div>'
A7=f'''<div class="pg">{bar(BACK,'',PLUS)}
 <div class="lt">งานประจำ</div><div class="st">งานที่ Shark เปิดเองตามเวลา · ผลมาเป็นงานใหม่ในหน้าหลัก</div>
 {rt(['pos'],'สรุปยอดขายเมื่อวาน + ของใกล้หมด','ทุกวัน 08:00 · อ่านอย่างเดียว · สรุปมาเป็นงานเสร็จ','พรุ่งนี้ 08:00')}
 {rt(['crm','chat'],'ตามดีลที่เงียบเกิน 14 วัน','ทุกจันทร์ 09:00 · ร่างข้อความ รออนุมัติก่อนส่ง','จ. 6 ต.ค.')}
 {rt(['dorm','acc'],'เตือนค่าหอค้างชำระ','วันที่ 1 และ 5 ของเดือน · ร่างข้อความ LINE ผู้เช่า รออนุมัติ','1 พ.ย.')}
 {rt(['bk','chat'],'ยืนยันคิวล่วงหน้า 1 วัน','ทุกวัน 18:00 · ร่างข้อความยืนยัน รออนุมัติเป็นชุด','วันนี้ 18:00')}
 {rt(['acc'],'ปิดยอดสิ้นเดือน + ส่งบัญชี','ทุกสิ้นเดือน 20:00 · ร่างให้ตรวจ ไม่ลงบัญชีเอง','31 ต.ค.')}
 <div class="note" style="margin-top:22px">งานประจำใช้สิทธิ์เดียวกับงานที่สั่งเอง · งานที่อ่านอย่างเดียวจบเองได้ · งานที่เขียน/ส่งลูกค้า รออนุมัติทุกครั้ง</div>
 </div>'''

A8=f'''<div class="lock">
 <div class="tm">9:41</div><div class="dt">วันพุธ 1 ตุลาคม</div>
 <div class="ntf gl" style="margin-top:46px"><div class="h"><div class="appic">S</div>SHARK · Shark<span class="tm2">ตอนนี้</span></div><b>ใบเสนอราคา Q-0012 พร้อมแล้ว รออนุมัติ</b><p>ร้านดอยช้าง ฿12,500 · อนุมัติแล้วส่ง LINE ให้ทันที</p><div class="acts"><div>ดู</div><div class="d">อนุมัติและส่ง</div></div></div>
 <div class="ntf gl"><div class="h"><div class="appic">S</div>SHARK · Shark<span class="tm2">3 นาที</span></div><b>ตามลูกค้าเงียบ — เสร็จแล้ว</b><p>ส่งข้อความ 11 ราย · ตอบกลับแล้ว 2 · สรุปอยู่ในงาน</p></div>
 <div class="ntf gl" style="padding:14px 18px"><div style="font-size:13px;color:#8e8e93;font-weight:600;letter-spacing:.8px">เปิดงานเดิมต่อได้จากทุกที่</div>
  <div class="dev"><div class="gl">📱 แอป HUB<span>งานทั้งหมด</span></div><div class="gl">💻 เว็บ shark.in.th<span>งานเดียวกัน</span></div><div class="gl soon">💬 LINE<span>รุ่นถัดไป</span></div></div></div>
</div>'''

# ---------- ชุด ข ----------
def bz(c,l,n,s,r): return f'<div class="row"><div class="lg {c}">{l}</div><div class="t"><b>{n}</b><span>{s}</span></div>{r}</div>'
def pr(t,s): return f'<div class="row"><div class="t"><b style="font-size:16px;font-weight:500">{t}</b></div><span style="font-size:14.5px;color:#8e8e93">{s}</span>{AR}</div>'
B1=f'''<div class="pg">{TOP}<div class="lt">The Bean Café {CH}</div><div class="st">เลขา Shark · กำลังทำ 3 · รออนุมัติ 2</div></div>
 <div class="dim"></div>
 <div class="sheet"><div class="grab"></div>
  <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">กิจการ</div><div class="st">เลขาคนเดียวกัน แต่ข้อมูลและสิทธิ์แยกตามกิจการ</div>
  <div style="margin-top:18px">
  {bz('l1','B','The Bean Café','กำลังทำ 3 · รออนุมัติ 2','<svg width="22" height="22" viewBox="0 0 24 24" style="stroke:#111;stroke-width:2.4"><path d="M5 12l5 5L20 7"/></svg>')}
  {bz('l2','BH','บลูเฮาส์ หอพัก','กำลังทำ 1 · รออนุมัติ 1','<span class="bd">1</span>')}
  {bz('l3','S','Sweet Studio · จองคิว','เสร็จหมดแล้ววันนี้','')}
  <div class="row"><div class="lg" style="border:1.5px dashed #c5c7d6;color:#8e8e93">+</div><div class="t"><b style="font-weight:500">เพิ่มกิจการใหม่</b></div></div>
  {pr('เลขาของฉัน · ตั้งค่า','Shark')}
  </div>
  <div class="ul" style="margin-top:22px !important"><span>โควตาเดือนนี้ · ใช้ร่วมทุกกิจการ 62%</span><span>รอบใหม่ 1 พ.ย.</span></div><div class="ub"><i style="width:62%"></i></div>
  <div class="st" style="margin-top:18px;line-height:1.5">งานที่สั่งในกิจการหนึ่ง เลขาจะเห็นเฉพาะข้อมูลของกิจการนั้น ลูกค้า บัญชี และแชทไม่ข้ามกัน</div>
 </div>'''

B2=f'''<div class="pg">{bar(BACK,'',DOTS)}
 <div style="text-align:center;margin-top:14px"><div style="display:flex;justify-content:center">{SEC(96)}</div>
 <div style="font-size:26px;font-weight:700;margin-top:16px;letter-spacing:-.5px">Shark</div>
 <div class="st">เลขาส่วนตัวของคุณสุข · ตามคุณไปทุกกิจการ</div></div>
 <div class="grid"><div><b>318</b><span>งานเดือนนี้</span></div><div><b>94%</b><span>ผ่านโดยไม่ต้องแก้</span></div><div><b>2.1 นาที</b><span>เวลารออนุมัติเฉลี่ย</span></div><div><b>62%</b><span>โควตาที่ใช้</span></div></div>
 <div class="opt"><div class="n">เรียกชื่อ</div><div class="fld" style="font-size:17px">Shark</div></div>
 <div class="opt"><div class="n">น้ำเสียง</div>{seg(['สุภาพ','เป็นกันเอง','ทางการ'],0)}</div>
 <div class="opt"><div class="n">ลงท้าย</div>{seg(['ครับ','ค่ะ','ไม่ระบุ'],0)}</div>
 <div class="opt"><div class="n">ภาษา</div><div class="chips"><span class="a">ไทย</span><span class="a">English</span><span>+ เพิ่ม</span></div></div>
 <div style="margin-top:10px">{pr('สิทธิ์ต่อระบบ','ตามกิจการ')}{pr('ต้องอนุมัติเสมอ','6 กฎ')}{pr('ความรู้ของกิจการ','12 รายการ')}{pr('บันทึกการกระทำ','วันนี้ 41')}</div>
 </div>'''

def sysrow(k,s,lvl,lock=''):
    L=['ปิด','ดูอย่างเดียว','ร่าง+รออนุมัติ','ทำเองได้']
    sp_=''.join(f'<span class="{"a" if i==lvl else ("lk" if (i==3 and lock) else "")}">{x}</span>' for i,x in enumerate(L))
    return f'<div class="sysrow gl"><div class="h">{kk(k)}{SYS[k][0]}<small>{s}</small></div><div class="lvl">{sp_}</div></div>'
B3=f'''<div class="pg">{bar(BACK,'สิทธิ์ของ Shark<small>The Bean Café · ตั้งโดยเจ้าของ</small>','')}
 <div class="st" style="margin-top:18px;line-height:1.55">สิทธิ์เป็นของ "คนที่สั่ง" — Shark ทำได้ไม่เกินที่คุณทำได้ และไม่เกินระดับที่ตั้งไว้ต่อระบบ</div>
 {sysrow('pos','ขาย · บิล · สต็อก',2,'lock')}
 {sysrow('crm','ลูกค้า · ดีล',2,'lock')}
 {sysrow('bk','คิว · ตารางงาน',2,'lock')}
 {sysrow('mem','สมาชิก · แต้ม',2,'lock')}
 {sysrow('acc','เอกสาร · ลงบัญชี',2,'lock')}
 {sysrow('kb','การ์ดงาน',2,'lock')}
 {sysrow('chat','ตอบลูกค้า LINE/FB',1,'lock')}
 <div class="note">รุ่นแรก "ทำเองได้" ยังปิดทุกระบบ (เปิดในรุ่นถัดไปเมื่อสถิติผ่านดี) · ลบ ยกเลิก คืนเงิน ไม่มีทางทำเองได้</div>
 </div>'''

def rule(t,s,on=True,val=''): return f'<div class="rule gl"><div class="t"><b>{t}</b><span>{s}</span></div>{f"<span class=v>{val}</span>" if val else ""}<div class="tgl{"" if on else " off"}"></div></div>'
B4=f'''<div class="pg">{bar(BACK,'ต้องอนุมัติเสมอ<small>The Bean Café</small>','')}
 <div class="st" style="margin-top:18px;line-height:1.55">รุ่นแรกทุกงานที่เขียนรออนุมัติอยู่แล้ว · รายการนี้คือสิ่งที่จะยังต้องอนุมัติเสมอแม้รุ่นถัดไปเปิด "ทำเองได้"</div>
 {rule('เงินออกจากกิจการ','คืนเงิน · จ่ายซัพพลายเออร์ · ปรับยอดบิล',True,'ทุกบาท')}
 {rule('เอกสารเงินถึงลูกค้า','ใบเสนอราคา · ใบแจ้งหนี้ · ใบเสร็จ เกินวงเงิน',True,'> ฿20,000')}
 {rule('ส่งข้อความถึงลูกค้า','LINE · Facebook · SMS · โพสต์สาธารณะ',True,'ทุกข้อความ')}
 {rule('ลบ · ยกเลิก · แก้ย้อนหลัง','ลบลูกค้า · ยกเลิกคิว/การจอง · แก้บิลที่ปิดแล้ว',True,'ปิดไม่ได้')}
 {rule('เปลี่ยนราคา/โปรโมชัน','ราคาสินค้า · ส่วนลดเกินนโยบาย',True)}
 {rule('ข้อมูลส่วนบุคคล','ส่งออกรายชื่อ · ดูเลขบัตร/ที่อยู่เต็ม',True,'ปิดไม่ได้')}
 <div class="sec">ผู้อนุมัติ</div>
 <div class="row"><div class="me" style="width:40px;height:40px;font-size:15px">ส</div><div class="t"><b style="font-size:16px">คุณสุข</b><span>เจ้าของ · ทุกเรื่อง</span></div></div>
 <div class="row"><div class="hp h2">น</div><div class="t"><b style="font-size:16px">คุณนัท</b><span>ผู้จัดการ · เงิน ≤ ฿5,000 · ส่งลูกค้า</span></div></div>
 </div>'''

def tl(tm,k,b,s): return f'<div class="tl"><div class="tmx">{tm}</div><div class="ln"><i style="background:{KC[k]}"></i></div><div class="x"><b>{b}</b><span>{s}</span></div></div>'
B5=f'''<div class="pg">{bar(BACK,'บันทึกการกระทำ<small>Shark · The Bean Café · วันนี้ 41</small>','')}
 <div class="tabs" style="margin-top:18px"><span class="a">ทั้งหมด</span><span>เงิน</span><span>ส่งลูกค้า</span><span>ย้อนได้</span></div>
 <div class="gl" style="border-radius:26px;padding:6px 20px;margin-top:14px">
 {tl('9:44','chat','ส่ง LINE ใบเสนอราคา Q-0012 → คุณสมชาย','งาน "ใบเสนอราคา ร้านดอยช้าง" · อนุมัติโดย คุณสุข 9:41')}
 {tl('9:44','crm','ย้ายดีล "ดอยช้าง" → ขั้นเสนอราคา','ย้อนกลับได้ถึงพรุ่งนี้ 9:44')}
 {tl('9:43','acc','สร้างใบเสนอราคา Q-0012 ฿12,500','ร่าง → ออกเอกสาร · อนุมัติโดย คุณสุข')}
 {tl('9:40','pos','อ่านราคา + สต็อก Espresso M2','อ่านอย่างเดียว')}
 {tl('9:38','crm','ค้นหาลูกค้า "สมชาย"','อ่านอย่างเดียว · พบ 1 ราย')}
 {tl('9:12','chat','ส่งข้อความตามดีล 6 ราย','อนุมัติเป็นชุดโดย คุณสุข 9:10')}
 {tl('8:00','pos','สรุปยอดขาย 30 ก.ย.','งานประจำ · อ่านอย่างเดียว')}
 </div>
 <div class="note">ทุกการกระทำระบุ งาน · ผู้สั่ง · ผู้อนุมัติ · ย้อนได้ภายใน 24 ชม. (เฉพาะที่ย้อนได้จริง) · ส่งออกเป็นไฟล์ได้</div>
 </div>'''

def kb(e,t,s,tag=''): return f'<div class="kb gl"><div class="ic">{e}</div><div class="t"><b>{t}{f"<span class=tagp>{tag}</span>" if tag else ""}</b><span>{s}</span></div>{AR}</div>'
B6=f'''<div class="pg">{bar(BACK,'',PLUS)}
 <div class="lt">ความรู้ของกิจการ</div><div class="st">สิ่งที่ Shark จำและใช้ทุกครั้งที่ทำงานใน The Bean Café</div>
 <div class="sec">กฎและนโยบาย</div>
 {kb('🏷️','นโยบายส่วนลด','ลดได้สูงสุด 10% · ลูกค้าประจำ 15% ต้องเจ้าของอนุมัติ')}
 {kb('🕘','เวลาเปิด-ปิด · วันหยุด','จ.–ส. 7:30–18:00 · หยุดนักขัตฤกษ์')}
 {kb('💬','น้ำเสียงเวลาคุยกับลูกค้า','สุภาพ เป็นกันเอง ลงท้าย "ค่ะ/ครับ" · ไม่ใช้อิโมจิเกิน 1')}
 <div class="sec">เอกสาร</div>
 {kb('📄','รายการสินค้า + ราคาส่ง 2026','PDF · อัปเดต 20 ก.ย.')}
 {kb('📄','คำถามที่ลูกค้าถามบ่อย','18 ข้อ · ใช้ตอบแชท')}
 <div class="sec">Shark เรียนรู้จากที่คุณสอน</div>
 {kb('✏️','ใบเสนอราคาต้องมีเลขผู้เสียภาษีลูกค้า','จากการตีกลับ 28 ก.ย. · ใช้แล้ว 4 งาน','ใหม่')}
 {kb('✏️','ลูกค้าดอยช้างให้เครดิต 30 วันเสมอ','จากที่คุณแก้ 1 ต.ค. · รอยืนยัน','รอยืนยัน')}
 </div>'''

B7=f'''<div class="pg">{bar(BACK,'คุยกับลูกค้าแทนร้าน<small>The Bean Café · LINE · Facebook</small>','')}
 <div class="rule gl" style="margin-top:18px"><div class="t"><b>บอกลูกค้าว่าเป็นผู้ช่วย AI</b><span>ข้อความแรกของทุกบทสนทนา + ลงชื่อท้ายข้อความที่ส่งเอง</span></div><div class="tgl"></div></div>
 <div class="qt" style="margin-top:10px"><div style="font-size:12.5px;font-weight:600;color:#6a5ad8;margin-bottom:4px">ตัวอย่างข้อความ</div>สวัสดีค่ะ Shark ผู้ช่วย AI ของ The Bean Café ค่ะ ยินดีช่วยเรื่องสินค้าและการจอง หากต้องการคุยกับพนักงาน พิมพ์ "คุยกับคน" ได้ทุกเมื่อนะคะ</div>
 <div class="rule gl"><div class="t"><b>ส่งต่อให้คนทันทีเมื่อ</b><span>ลูกค้าขอคุยกับคน · ร้องเรียน · เรื่องเงิน/คืนเงิน · อารมณ์ไม่ดี</span></div><div class="tgl"></div></div>
 <div class="rule gl"><div class="t"><b>ตอบเองได้เฉพาะ</b><span>สินค้า ราคา เวลาเปิด การจอง สถานะออเดอร์ (จากข้อมูลในระบบเท่านั้น ไม่เดา)</span></div><div class="tgl"></div></div>
 <div class="sec">ข้อมูลส่วนบุคคล (PDPA)</div>
 <div class="pdpa gl"><b>Shark เห็นข้อมูลลูกค้าเท่าที่งานต้องใช้</b><p>ชื่อ เบอร์ ประวัติซื้อ · ไม่เห็นเลขบัตร/ที่อยู่เต็มเว้นแต่คุณอนุมัติในงานนั้น · ไม่ส่งข้อมูลลูกค้าออกนอก SHARK</p></div>
 <div class="pdpa gl"><b>ความยินยอมการติดต่อ</b><p>ส่งข้อความการตลาดเฉพาะลูกค้าที่ให้ความยินยอมในระบบสมาชิก · ลูกค้าพิมพ์ "ยกเลิกรับข่าว" = หยุดทันทีและบันทึก</p></div>
 <div class="pdpa gl"><b>คำขอของเจ้าของข้อมูล</b><p>ลูกค้าขอดู/ลบข้อมูล → Shark เปิดงาน "คำขอ PDPA" ให้คุณอนุมัติ ไม่ลบเอง</p></div>
 </div>'''

def ur(n,p,k): return f'<div class="urow"><span class="n" style="width:auto;flex:1;display:flex;align-items:center;gap:8px">{kk(k)}{n}</span><div class="ub" style="flex:1.4"><i style="width:{p*100/40:.0f}%"></i></div><b>{p}%</b></div>'
B8=f'''<div class="pg">{bar(BACK)}
 <div class="lt">แพ็กฟรี</div><div class="st">คุณสุข · โควตาใช้ร่วมกัน 3 กิจการ</div>
 <div class="big">62%</div>
 <div class="st" style="margin-top:12px;color:#6e6e73">ใช้ไปแล้ว · รอบใหม่ 1 พ.ย. (อีก 4 วัน) · ≈ 38 งานที่เหลือ</div>
 <div class="ub" style="height:6px;border-radius:3px;margin-top:16px"><i style="width:62%"></i></div>
 <div class="st grn" style="margin-top:12px">✓ พอใช้ถึงรอบใหม่ตามอัตราปัจจุบัน</div>
 <div style="display:flex;gap:12px;margin-top:24px"><div class="btn2">ดูแพ็กทั้งหมด</div></div>
 <div class="sec">ใช้ไปกับงานประเภทไหน · เดือนนี้</div>
 <div class="gl" style="margin-top:12px;border-radius:26px;padding:6px 20px">{ur('ตอบแชทลูกค้า',31,'chat')}{ur('สรุป/รายงาน',12,'pos')}{ur('เอกสารเงิน',9,'acc')}{ur('ตามลูกค้า',6,'crm')}{ur('คิว/หอพัก',4,'bk')}</div>
 <div class="row" style="margin-top:14px"><div class="t"><b style="font-size:16px;font-weight:500">ถ้าโควตาหมดก่อนรอบใหม่</b></div><span style="font-size:15px;color:#8e8e93">งานประจำหยุด · สั่งใหม่ไม่ได้ · งานค้างยังอนุมัติได้</span></div>
 </div>'''


S1=f'''<div class="pg">{bar('','ขั้น 1 จาก 3','')}
 <div class="prog"><i></i><i class="n"></i><i class="n"></i></div>
 <div class="hero" style="margin-top:28px">{SEC(84)}<h2>สมัครใช้ SHARK</h2><p>ใส่ชื่อ เบอร์โทร และอีเมล<br>เราจะส่งรหัสยืนยันไปที่อีเมลของคุณ</p></div>
 <div class="fl" style="margin-top:26px">ชื่อ</div><div class="fld in">สุข</div>
 <div class="fl">เบอร์โทร</div><div class="fld in">081-234-5678</div>
 <div class="fl">อีเมล</div><div class="fld in">suk@thebean.co</div>
 <div class="note" style="margin-top:22px">กดส่งรหัสถือว่ายอมรับข้อตกลงการใช้งานและนโยบายความเป็นส่วนตัว</div>
 </div><div class="foot" style="flex-direction:column;align-items:stretch;gap:0"><div class="btn1" style="flex:none;height:60px">ส่งรหัสยืนยันทางอีเมล</div><div class="note" style="margin-top:14px">มีบัญชีแล้ว? <b style="color:inherit">เข้าสู่ระบบ</b></div></div>'''

S2=f'''<div class="pg">{bar(BACK,'ขั้น 2 จาก 3','')}
 <div class="prog"><i></i><i></i><i class="n"></i></div>
 <div class="hero" style="margin-top:50px"><h2>ใส่รหัสจากอีเมล</h2><p>ส่งรหัส 6 หลักไปที่ <b>suk@thebean.co</b> แล้ว<br>ไม่เห็นเมล ลองดูในกล่องจดหมายขยะ</p></div>
 <div class="otp"><div class="gl">4</div><div class="gl">8</div><div class="gl">2</div><div class="gl cur"></div><div class="gl"></div><div class="gl"></div></div>
 <div class="note" style="margin-top:26px">ส่งรหัสอีกครั้งได้ใน 0:42</div>
 <div class="note" style="margin-top:8px"><b style="color:inherit">แก้อีเมล</b></div>
 </div><div class="foot"><div class="btn1 off">ยืนยัน</div></div>'''

C1=f'''<div class="pg">{bar(BACK,'ขั้น 3 จาก 3','')}
 <div class="prog"><i></i><i></i><i></i></div>
 <div class="hero" style="margin-top:40px">{SEC(120)}<h2>ตั้งชื่อเลขาของคุณ</h2><p>เลขา AI ที่จะทำงานแทนคุณในทุกระบบ SHARK<br>เปลี่ยนชื่อทีหลังได้ที่ "เลขาของฉัน"</p></div>
 <div class="fld" style="margin-top:30px;font-size:24px;text-align:center;padding:16px">Shark</div>
 <div class="opt" style="margin-top:28px"><div class="n">ลงท้าย</div>{seg(['ครับ','ค่ะ','ไม่ระบุ'],0)}</div>
 <div class="opt"><div class="n">น้ำเสียง</div>{seg(['สุภาพ','เป็นกันเอง','ทางการ'],0)}</div>
 <div class="qt" style="margin-top:22px"><div style="font-size:12.5px;font-weight:600;color:#6a5ad8;margin-bottom:4px">ตัวอย่างการพูด</div>สวัสดีครับคุณสุข ผม Shark เลขาของคุณครับ สั่งงานได้เลย ผมทำในระบบให้แล้วจะขออนุมัติก่อนทุกครั้งที่ต้องส่งถึงลูกค้าหรือเกี่ยวกับเงินครับ</div>
 </div><div class="foot"><div class="btn1">เริ่มใช้ Shark</div></div>'''

C3=f'''<div class="pg">{TOP}
 <div class="lt">The Bean Café {CH}</div>
 <div class="st">เลขา Shark · ยังไม่มีงานในกิจการนี้</div>
 <div class="hero" style="margin-top:60px">{SEC(96)}<h2>สั่งงานแรกได้เลย</h2><p>พิมพ์หรือพูดเป็นภาษาปกติ<br>ผมหาข้อมูลในระบบ ร่างให้ แล้วขออนุมัติก่อนทำจริง</p></div>
 <div class="sec" style="margin-top:36px">ลองสั่งแบบนี้</div>
 <div class="sugg gl">{kk('pos')}<div class="x">สรุปยอดขายเมื่อวาน กับของที่ใกล้หมด<span>อ่านอย่างเดียว · เสร็จเองได้</span></div>{AR}</div>
 <div class="sugg gl">{kk('crm')}<div class="x">ลูกค้าคนไหนไม่ได้ซื้อนานเกิน 1 เดือน<span>อ่านอย่างเดียว · เสร็จเองได้</span></div>{AR}</div>
 <div class="sugg gl">{kk('bk')}<div class="x">เช็กคิวพรุ่งนี้ แล้วร่างข้อความยืนยันลูกค้า<span>ร่างแล้วรอคุณอนุมัติก่อนส่ง</span></div>{AR}</div>
 </div>
 {INP('สั่งงานแรกให้ Shark…')}'''

C4=f'''<div class="pg">{bar(BACK,'ใบเสนอราคา ร้านดอยช้าง<small><span class="dot wait"></span>รออนุมัติ · 9:41</small>',DOTS)}
 <div class="aiw" style="margin-top:14px">{SEC(32)}<div class="x">ร่างเสร็จแล้วครับ ขออนุมัติก่อนส่งถึงลูกค้า
  <div class="apc" style="opacity:.55"><div class="tg">รออนุมัติ</div><div class="h"><b>ใบเสนอราคา Q-0012</b><span class="m">฿12,500</span></div><div class="s">คุณสมชาย · ร้านดอยช้าง</div></div>
 </div></div>
 <div class="ubb">ตีกลับ — ใบเสนอราคาต้องใส่เลขผู้เสียภาษีของลูกค้าทุกครั้ง</div>
 <div class="aiw">{SEC(32)}<div class="x">ขอโทษครับ แก้ให้แล้ว และขอจำไว้เป็นกฎของกิจการนะครับ
  {step('crm','ดึงเลขผู้เสียภาษีจากข้อมูลลูกค้า','0105560001234')}
  {step('acc','แก้ใบเสนอราคา Q-0012','เพิ่มเลขผู้เสียภาษี · ยอดเท่าเดิม')}
  <div class="kb gl" style="margin-top:14px"><div class="ic">✏️</div><div class="t"><b>กฎใหม่ของ The Bean Café</b><span>ใบเสนอราคา/ใบแจ้งหนี้ ต้องมีเลขผู้เสียภาษีลูกค้าเสมอ</span></div></div>
  <div class="acts" style="margin-top:12px"><div>แค่งานนี้</div><div class="d">จำเป็นกฎของกิจการ</div></div>
  <div class="apc" style="margin-top:18px"><div class="tg">รออนุมัติ · แก้แล้ว</div><div class="h"><b>ใบเสนอราคา Q-0012</b><span class="m">฿12,500</span></div><div class="s">คุณสมชาย · ร้านดอยช้าง · เลขผู้เสียภาษี 0105560001234</div><div class="acts"><div>แก้</div><div class="d">อนุมัติและส่ง</div></div></div>
 </div></div></div>
 {INP('สั่งเพิ่มในงานนี้…')}'''

# ---------- ชุด ง ----------
D1=f'''<div class="pg">{TOPT}
 <div class="lt">The Bean Café {CH}</div>
 <div class="st">พนักงาน 4 คน · แตะชื่อเพื่อดูงานของคนนั้น · เห็นได้เฉพาะเจ้าของ</div>
 <div class="srch gl"><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>ค้นหาพนักงาน</div>
 {staff('h2','น','น้ำ','ผู้จัดการร้าน','กำลังทำ 2 · รออนุมัติ 1','<span class="bd">1</span>')}
 {staff('h3','ส','สมใจ','ฝ่ายขาย','กำลังทำ 1 · ห้องร่วมกับคุณ 1')}
 {staff('h1','บ','บอย','บาริสต้า','เสร็จวันนี้ 3')}
 {staff('h2','ฝ','ฝน','บัญชี','ยังไม่ได้ยืนยันอีเมล · ส่งคำเชิญอีกครั้ง')}
 </div><div class="foot"><div class="btn1">เพิ่มพนักงาน</div></div>'''

D2=f'''<div class="pg">{bar(BACK,'ใบเสนอราคา ร้านดอยช้าง<small><span class="dot wait"></span>รออนุมัติ · 2 คนในห้อง</small>',ADDP)}
 <div class="ubb" style="margin-top:14px">ทำใบเสนอราคาให้คุณสมชาย ร้านดอยช้าง เครื่องชง 2 ชุด ลด 5%</div>
 <div class="sysl">คุณสุขเพิ่ม สมใจ (ฝ่ายขาย) เข้าห้อง · 9:42</div>
 {oth('h3','ส','สมใจ · ฝ่ายขาย','ลูกค้าขอเครดิต 45 วันค่ะ Shark ช่วยแก้ให้หน่อย')}
 <div class="aiw">{SEC(32)}<div class="x">แก้เป็น 45 วันแล้วครับ รอคุณสุขอนุมัติ เพราะคุณสมใจไม่มีสิทธิ์อนุมัติเอกสารเงิน
  <div class="apc"><div class="tg">รออนุมัติ · คุณสุข</div><div class="h"><b>ใบเสนอราคา Q-0012</b><span class="m">฿12,500</span></div><div class="s">คุณสมชาย · ร้านดอยช้าง · เครดิต 45 วัน</div><div class="acts"><div>แก้</div><div>ตีกลับ</div><div class="d">อนุมัติและส่ง</div></div></div>
 </div></div></div>
 {INP('พิมพ์ในห้องนี้…')}'''

D3=f'''<div class="pg">{bar(BACK,'ใบเสนอราคา ร้านดอยช้าง<small><span class="dot wait"></span>รออนุมัติ</small>',ADDP)}<div class="ubb" style="margin-top:14px">ทำใบเสนอราคาให้คุณสมชาย ร้านดอยช้าง เครื่องชง 2 ชุด ลด 5%</div></div>
 <div class="dim"></div>
 <div class="sheet"><div class="grab"></div>
  <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">เพิ่มพนักงานเข้าห้อง</div><div class="st">เฉพาะพนักงานของ The Bean Café</div>
  {staff('h3','ส','สมใจ','ฝ่ายขาย','ดู CRM และ POS ได้',ck=CKON)}
  {staff('h2','น','น้ำ','ผู้จัดการร้าน','ดูทุกระบบ · อนุมัติได้',ck=CKOFF)}
  {staff('h1','บ','บอย','บาริสต้า','ดู POS ได้',ck=CKOFF)}
  {rule('ให้เห็นข้อความเก่าในห้องนี้','ปิดอยู่ จะเห็นเฉพาะข้อความหลังถูกเพิ่ม',False)}
  <div class="why">ทุกคนในห้องเห็นคำตอบของ Shark · สั่งงานได้ตามสิทธิ์ของแต่ละคน</div>
  <div class="btn1" style="margin-top:16px">เพิ่ม 1 คน</div>
 </div>'''

# ---------- ชุด จ ช่วยเหลือ ----------
H1=f'''<div class="pg">{TOPH}
 <div class="lt">ช่วยเหลือ</div>
 <div class="st">แจ้งปัญหาการใช้งาน · ทีม SHARK ตอบในห้องแชท · เห็นเฉพาะคุณ</div>
 <div class="sec">แจ้งเรื่องใหม่</div>
 <div class="chips" style="flex-wrap:wrap;row-gap:8px"><span>ใช้งานไม่ได้</span><span>เลขาทำผิด</span><span>ข้อมูลไม่ตรง</span><span>บัญชี/การเงิน</span><span>ข้อเสนอแนะ</span></div>
 <div class="sec">เรื่องที่แจ้งไว้</div>
 {hcase('pend','SHARK-00042','ใบเสนอราคาไม่ส่ง LINE','ทีม SHARK ตอบแล้ว · รอคุณยืนยันว่าแก้แล้ว','10:12<span class=bd>1</span>')}
 {hcase('open','SHARK-00041','ขอเพิ่มระบบคลังให้เลขาเห็น','ส่งแล้ว · รอทีม SHARK','เมื่อวาน')}
 {hcase('done','SHARK-00037','ล็อกอิน Apple ไม่ผ่าน','ปิดแล้ว 28 ต.ค. · แก้แล้ว','28 ต.ค.')}
 <div class="note" style="margin-top:22px">เรื่องเร่งด่วนเกี่ยวกับเงินหรือข้อมูลหาย ทีมตอบภายใน 4 ชม.ทำการ · เรื่องทั่วไปภายใน 1 วันทำการ</div>
 </div>
 {INP('พิมพ์ปัญหาที่พบ…')}'''

H2=f'''<div class="pg">{bar(BACK,'ใบเสนอราคาไม่ส่ง LINE<small>SHARK-00042 · <span class="dot run"></span>ทีม SHARK ตอบแล้ว</small>',DOTS)}
 <div class="ubb" style="margin-top:14px">กดอนุมัติใบเสนอราคาแล้ว แต่ลูกค้าบอกว่าไม่ได้รับทาง LINE<div style="margin-top:8px;display:inline-flex;align-items:center;gap:8px;font-size:13px;opacity:.85;background:rgba(255,255,255,.14);padding:6px 10px;border-radius:10px">🖼 ภาพหน้าจอ 1 รูป</div></div>
 <div class="sysl">เปิดเรื่อง SHARK-00042 · แนบห้องงาน "ใบเสนอราคา ร้านดอยช้าง" ให้ทีมดูอัตโนมัติ · 9:58</div>
 <div class="oth">{PLAT}<div><div class="nm">นัท · ทีม SHARK</div><div class="bb gl">ตรวจแล้วครับ LINE ของร้านยังไม่ได้เชื่อมในระบบแชท เลขาจึงส่งไม่ได้ ผมเปิดหน้าตั้งค่าให้แล้ว กดเชื่อมได้ที่ลิงก์นี้ครับ<div class="lnk gl" style="margin-top:10px">{kk('chat')}เชื่อม LINE Official<span>เปิด ›</span></div></div></div></div>
 <div class="kb gl" style="margin-top:16px"><div class="ic">✅</div><div class="t"><b>ปัญหาแก้แล้วหรือยัง</b><span>ตอบแล้วเรื่องจะปิด · พิมพ์ต่อได้ถ้ายังไม่หาย</span></div></div>
 <div class="acts" style="margin-top:10px"><div>ยังไม่แก้</div><div class="d">แก้แล้ว ปิดเรื่อง</div></div>
 </div>
 {INP('พิมพ์ตอบทีม SHARK…')}'''

H3=f'''<div class="pg">{bar('','<b style="font-size:17px">Backoffice · เรื่องแจ้งจากผู้ใช้</b><small>ทีม SHARK · เว็บ (มีอยู่แล้ว ปรับ)</small>','')}
 <div class="tabs"><span class="a">ใหม่<em>7</em></span><span>รอร้าน 12</span><span>ของฉัน 3</span><span>ปิดแล้ว</span></div>
 <div class="chips" style="margin-top:14px"><span class="a">ทุกช่องทาง</span><span>จากแอปเลขา</span><span>จากเว็บ</span><span>เลขาทำผิด</span></div>
 {brow('The Bean Café','SHARK-00042','ใบเสนอราคาไม่ส่ง LINE','จากแอปเลขา · มีห้องงานแนบ','10:12',HP('h2','น'))}
 {brow('บลูเฮาส์ หอพัก','SHARK-00043','เลขาคืนมัดจำผิดห้อง','จากแอปเลขา · เลขาทำผิด','9:40<span class=bd>!</span>','')}
 {brow('Sweet Studio','SHARK-00040','อยากให้มีสรุปคิวรายสัปดาห์','ข้อเสนอแนะ','เมื่อวาน',HP('h3','ก'))}
 {brow('ร้านป้าแดง','SHARK-00039','ล็อกอินไม่ได้หลังอัปเดต','จากเว็บ','เมื่อวาน','')}
 <div class="note" style="margin-top:20px">ตัวเลขบนสุด = เรื่องที่ยังไม่มีคนรับ · กดเรื่องเพื่อเปิดห้องแชทกับผู้ใช้</div>
 </div>'''

H4=f'''<div class="pg">{bar(BACK,'SHARK-00043 · บลูเฮาส์ หอพัก<small><span class="dot wait"></span>ใหม่ · ยังไม่มีคนรับ</small>','')}
 <div class="chips" style="margin-top:12px"><span>รับเรื่อง</span><span>ระงับเลขาของร้านนี้</span><span>เปิดร้านใน backoffice</span></div>
 <div class="oth" style="margin-top:16px">{HP('h1','ส')}<div><div class="nm">คุณสุข · เจ้าของ · 9:40</div><div class="bb gl">เลขาคืนมัดจำห้อง 204 แต่ไปลงบัญชีห้อง 205 ตอนนี้ยอดไม่ตรง ช่วยดูด่วน</div></div></div>
 <div class="sec">ที่แนบมาอัตโนมัติ</div>
 <div class="lnk gl">{kk('dorm')}ห้องงาน "ปิดบิลค้างห้อง 204 · คืนมัดจำ"<span>เปิดบทสนทนา ›</span></div>
 <div class="lnk gl">{kk('acc')}บันทึกการกระทำ 8:15 · คืนเงิน ฿2,400 · ผู้อนุมัติ คุณสุข<span>ย้อนได้ถึงพรุ่งนี้ 8:15 ›</span></div>
 <div class="sum gl" style="margin-top:16px"><b>ร่างคำตอบจาก AI (ทีมแก้แล้วค่อยส่ง)</b><p>สวัสดีครับคุณสุข ทีมตรวจพบว่าข้อเสนอคืนมัดจำอ้างห้อง 205 จากข้อมูลผู้เช่าที่ซ้ำกัน ผมกดย้อนรายการให้แล้ว และแจ้งทีมเลขาแก้การจับคู่ห้อง…</p></div>
 <div class="acts" style="margin-top:12px"><div>แก้ร่าง</div><div class="d">ส่งถึงผู้ใช้</div></div>
 </div>
 {INP('พิมพ์ตอบผู้ใช้…')}'''

def phone(b,l): return f'<div class="phone"><div class="screen">{STATUS}{b}</div><div class="label">{l}</div></div>'
SETS={
 'a':('เลขา AI · session — ชุด ก ใช้งานประจำวัน','เลขาคนเดียว · เปิดงาน (session) ได้ไม่จำกัด · ทำงานเบื้องหลังในทุกระบบ SHARK · สถานะ กำลังทำ / รออนุมัติ / เสร็จ',
  [(A1,'A1 · หน้าหลัก ห้องแชทของฉัน'),(A2,'A2 · เริ่มงานใหม่'),(A3,'A3 · งานกำลังทำ'),(A4,'A4 · งานรออนุมัติ'),(A5,'A5 · งานเสร็จ'),(A6,'A6 · รออนุมัติรวมทุกกิจการ'),(A7,'A7 · งานประจำ'),(A8,'A8 · แจ้งเตือน · เปิดต่อจากทุกที่')]),
 'b':('เลขา AI · session — ชุด ข ตั้งค่า · ความปลอดภัย · PDPA','สิทธิ์ตามคนสั่ง · กฎต้องอนุมัติเสมอ · บันทึกทุกการกระทำ · เปิดเผยว่าเป็น AI · ข้อมูลไม่ข้ามกิจการ',
  [(B1,'B1 · สลับกิจการ'),(B2,'B2 · เลขาของฉัน'),(B3,'B3 · สิทธิ์ต่อระบบ'),(B4,'B4 · ต้องอนุมัติเสมอ + ผู้อนุมัติ'),(B5,'B5 · บันทึกการกระทำ'),(B6,'B6 · ความรู้ของกิจการ'),(B7,'B7 · คุยกับลูกค้า + PDPA'),(B8,'B8 · โควตา / แพ็ก')]),
 'c':('เลขา AI · session — ชุด ค เริ่มใช้ครั้งแรก · สอนงาน','สมัครด้วยชื่อ + เบอร์โทร + อีเมล ยืนยัน OTP ทางอีเมล · ตั้งชื่อเลขา (เริ่มต้น Shark) · งานแรก · ตีกลับแล้วจำเป็นกฎของกิจการ',
  [(S1,'S1 · สมัคร ชื่อ + เบอร์โทร + อีเมล (ใหม่)'),(S2,'S2 · ยืนยัน OTP ทางอีเมล (ใหม่)'),(C1,'C1 · ตั้งชื่อเลขา (ครั้งแรก)'),(C3,'C3 · ยังไม่มีงาน'),(C4,'C4 · ตีกลับ + สอน Shark')]),
 'd':('เลขา AI · session — ชุด ง พนักงาน · ห้องร่วม','ไอคอนซ้ายบน: ห้องแชท / พนักงาน · เพิ่มพนักงานเข้าห้องแชทได้ · สั่งงานและอนุมัติตามสิทธิ์ของแต่ละคน',
  [(D1,'D1 · ทุกคนในกิจการ = พนักงาน (ใหม่)'),(D2,'D2 · ห้องแชทที่มีหลายคน (ใหม่)'),(D3,'D3 · เพิ่มพนักงานเข้าห้อง (ใหม่)')]),
 'h':('เลขา AI · session — ชุด จ ช่วยเหลือ · แจ้งปัญหา','ไอคอน ? ซ้ายบน → ห้องแชทแจ้งปัญหากับทีม SHARK · แนบห้องงานที่เกี่ยวอัตโนมัติ · ฝั่ง backoffice เห็นทุกร้าน (ต่อยอด Support Desk ที่มีอยู่)',
  [(H1,'H1 · ช่วยเหลือ (แอป · ใหม่)'),(H2,'H2 · ห้องแจ้งปัญหา (แอป · ใหม่)'),(H3,'H3 · backoffice รายการเรื่องแจ้ง (ปรับ)'),(H4,'H4 · backoffice ห้องแชทกับผู้ใช้ (ปรับ)')]),
}
def dark_inline(m):
    s=m.group(0)
    for a,b in INLINE: s=re.sub(re.escape(a)+r'(?![0-9a-fA-F])',b,s)
    return s
for k,(h1,p,pages) in SETS.items():
    html=f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="title"><h1>SHARK · {h1}</h1><p>{p}</p></div>
<div class="phones">{''.join(phone(b,l) for b,l in pages)}</div></body></html>'''
    open(f'/root/design/ai-hire/sec-{k}.html','w').write(html)
    head,body=html.split('</style>',1)
    body=re.sub(r'style="[^"]*"',dark_inline,body)
    body=body.replace('— ชุด','— โหมดมืด · ชุด')
    open(f'/root/design/ai-hire/sec-dark-{k}.html','w').write(head+DARK+'</style>'+body)
print('ok')
