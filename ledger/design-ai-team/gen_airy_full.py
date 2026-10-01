# Liquid Glass · Airy — ครบ 24 หน้า (ก A1–A8 · ข B1–B8 · ค C1–C8)
# ใช้ CSS + 8 หน้าเดิมจาก gen_glass_airy.py แล้วเพิ่มอีก 16 หน้า
src=open('gen_glass_airy.py').read().split('\nP=[')[0]
exec(src)

CSS+=r'''
/* ---- เพิ่มสำหรับชุดเต็ม ---- */
.card{background:linear-gradient(135deg,rgba(255,255,255,.74),rgba(255,255,255,.42));backdrop-filter:blur(24px) saturate(180%);border:1.5px solid rgba(255,255,255,.85);box-shadow:0 10px 30px rgba(120,120,170,.10),inset 0 1px 0 rgba(255,255,255,.95);border-radius:24px;padding:16px 18px}
.card b{font-size:15.5px;font-weight:600;display:block}.card span{font-size:13px;color:#6e6e73;display:block;margin-top:6px;line-height:1.45}
.card.sel{border:2px solid #16161c}
.card.dash{background:none;box-shadow:none;border:1.5px dashed #c5c7d6;display:grid;place-items:center;text-align:center;color:#8e8e93;font-size:14.5px;font-weight:500}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px}
.ic{width:44px;height:44px;border-radius:15px;display:grid;place-items:center;font-size:20px;background:rgba(255,255,255,.8);box-shadow:0 2px 8px rgba(100,100,150,.10);flex:none}
.row.cp{padding:12px 16px;margin-top:10px}
.row .t b.n{font-weight:500;font-size:16px}
.v{font-size:14px;color:#8e8e93;white-space:nowrap}
.tgl{width:50px;height:30px;border-radius:15px;background:#3cc47f;position:relative;flex:none}
.tgl:after{content:'';position:absolute;top:3px;right:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.18)}
.tgl.off{background:rgba(150,150,185,.28)}.tgl.off:after{right:auto;left:3px}
.pillb{height:44px;padding:0 20px;border-radius:22px;display:grid;place-items:center;font-size:15px;font-weight:600;background:#16161c;color:#fff}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center}
.hero h2{font-size:27px;font-weight:700;letter-spacing:-.6px;margin-top:22px}.hero p{font-size:15px;color:#8e8e93;margin-top:8px;line-height:1.6}
.fl{font-size:14px;color:#6e6e73;margin:20px 0 10px 4px}
.fld.ml{font-size:16px;font-weight:400;line-height:1.6;min-height:92px}
.days{display:flex;gap:8px;margin-top:12px}.days span{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:14px;background:rgba(150,150,185,.12);color:#6e6e73}.days .a{background:#16161c;color:#fff}
.tagp{font-size:11.5px;font-weight:600;padding:3px 10px;border-radius:10px;background:#16161c;color:#fff;margin-left:8px;vertical-align:2px}
.pm{padding:14px 16px 16px;margin-top:10px}.pm .h{display:flex;align-items:center;gap:12px;font-size:15.5px;font-weight:600}
.pm .segw span{font-size:12.5px;padding:8px 0}
.dif{font-size:13.5px;margin-top:10px;border-radius:14px;padding:10px 14px;line-height:1.7}.dif .p{color:#23945a;display:block}.dif .m{color:#c2334d;text-decoration:line-through;display:block}
.dif{background:rgba(150,150,185,.10)}
.pl3 ul{list-style:none;margin-top:10px}.pl3 li{font-size:14px;color:#55556a;line-height:1.9}.pl3 li:before{content:'✓  ';color:#3cc47f;font-weight:700}
.pl3 .ph{display:flex;justify-content:space-between;align-items:baseline}.pl3 .ph b{font-size:20px;display:inline}.pl3 .ph .pr{font-size:22px;font-weight:600;letter-spacing:-.5px}.pl3 .ph small{font-size:13px;color:#8e8e93;font-weight:400}
.pk3{text-align:center;padding:22px 10px}.pk3 b{font-size:26px;letter-spacing:-.6px}.pk3 span{font-size:15px;margin-top:6px}
.tm{width:46px;font-size:13px;color:#8e8e93;flex:none}
.chk{width:26px;height:26px;border-radius:50%;background:#16161c;display:grid;place-items:center;flex:none}.chk svg{stroke:#fff;stroke-width:3}
.halo{box-shadow:0 0 0 18px rgba(159,216,255,.20),0 0 0 42px rgba(199,179,255,.12),0 20px 50px rgba(110,110,160,.25) !important}
.cl{position:relative;height:190px;width:100%;margin-top:30px}
.cl .ao{position:absolute}
.pg>.fld{flex:none}
.card .tagp{display:inline-block;margin-top:0;color:#fff;font-size:11.5px}
.note{font-size:13.5px;color:#8e8e93;text-align:center;line-height:1.6;margin-top:16px}
.soon{opacity:.5}
.tagp.s{background:rgba(150,150,185,.28);color:#55556a}
.btn1.off{background:rgba(150,150,185,.25);color:#8e8e93;box-shadow:none}
'''

PILL=lambda t: f'<div class="pillb">{t}</div>'
CK='<div class="chk"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg></div>'
def tgl(on=True): return f'<div class="tgl{"" if on else " off"}"></div>'
def it(i,t,s='',v='',arrow=True,right='',cp=True):
    sub=f'<span>{s}</span>' if s else ''
    return f'<div class="row{" cp" if cp else ""}"><div class="ic">{i}</div><div class="t"><b class="n">{t}</b>{sub}</div>{f"<span class=v>{v}</span>" if v else ""}{right}{AR if arrow else ""}</div>'
def prog(n): return '<div class="prog">'+''.join('<i></i>' if i<n else '<i class="n"></i>' for i in range(4))+'</div>'
SEND='<div class="s"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg></div>'
MIC='<svg class="mic" width="24" height="24" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
INP=lambda ph: f'<div class="inp"><div class="pl"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>{ph}{MIC}{SEND}</div>'
FILTER='<div class="ib"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg></div>'

# ---------- ก. ใช้งานประจำวัน ----------
newjob=f'''<div class="pg">{bar(BACK,'งานใหม่<small>คุณเอก · The Bean Café</small>',stk(AO('o1'),HP('h1','ส'),HP('h2','น'),MORE(1)))}
 <div class="hero" style="margin-top:34px">{av('a1','อ',120)}<h2>ให้ผมช่วยอะไรดีครับ</h2><p>คุณเอกเข้าถึง CRM · ใบเสนอราคา · บอร์ดงาน · แชทลูกค้า</p></div>
 <div class="sec">งานที่คุณเอกทำบ่อย</div>
 <div class="g2">
  <div class="card"><b>📄 ทำใบเสนอราคา</b><span>บอกชื่อลูกค้า สินค้า และส่วนลด</span></div>
  <div class="card"><b>🔔 ตามลูกค้าที่เงียบ</b><span>ลูกค้าที่ไม่ตอบเกิน 14 วัน</span></div>
  <div class="card"><b>📊 สรุปดีลค้าง</b><span>ดีลที่ไม่ขยับเกิน 7 วัน</span></div>
  <div class="card"><b>🎯 หาลูกค้าน่าขายต่อ</b><span>ซื้อซ้ำบ่อย แต่หายไปนาน</span></div>
 </div>
 {it('🔁','ทำเป็นงานประจำ','ให้คุณเอกทำซ้ำตามเวลาที่ตั้ง',arrow=False,right=tgl(False))}
 </div>{INP('พิมพ์หรือพูดสั่งงาน…')}'''

recur=f'''<div class="pg">{bar(BACK,'',PILL('บันทึก'))}
 <div class="lt">งานประจำ</div><div class="st">ทำซ้ำอัตโนมัติตามเวลาที่ตั้ง</div>
 <div class="row" style="margin-top:22px">{av('a1','อ',44)}<div class="t"><span style="margin:0 0 2px">ผู้ทำ</span><b>คุณเอก <em>เซลส์</em></b></div><span class="v">เปลี่ยน</span>{AR}</div>
 <div class="fl">ชื่องาน</div><div class="fld" style="font-size:17px">สรุปดีลค้างทุกเช้า</div>
 <div class="fl">สั่งว่า</div><div class="fld ml">สรุปดีลที่ไม่ขยับเกิน 7 วัน เรียงจากมูลค่ามากไปน้อย บอกว่าควรตามใครก่อน แล้วส่งให้ผมทาง LINE</div>
 <div class="opt"><div class="n">ความถี่<small>เวลา <b style="color:#16161c;font-size:14px">08:00</b></small></div>{seg(['ทุกวัน','ทุกสัปดาห์','ทุกเดือน'],0)}</div>
 <div class="days"><span class="a">จ</span><span class="a">อ</span><span class="a">พ</span><span class="a">พฤ</span><span class="a">ศ</span><span class="a">ส</span><span>อา</span></div>
 <div class="opt"><div class="n">ส่งผลทาง</div><div class="chips"><span class="a">ในแอป</span><span class="a">LINE</span><span>อีเมล</span></div></div>
 <div class="opt"><div class="n">ถ้าต้องส่งอะไรถึงลูกค้า</div>{seg(['ร่าง + รออนุมัติ','ทำเองได้'],0)}</div>
 <div class="note">ใช้โควตาประมาณ 1% ต่อเดือน</div>
 </div>'''

empty=f'''<div class="pg">{bar(r=PLUS+stk(HP('h1','ส')))}
 <div class="lt">Sweet Studio {CH}</div><div class="st">ยังไม่มีทีม AI · แพ็กฟรี</div>
 <div class="cl"><div class="ao o2" style="width:104px;height:104px;left:98px;top:46px"></div><div class="ao o1" style="width:138px;height:138px;left:178px;top:6px"></div><div class="ao o3" style="width:96px;height:96px;left:296px;top:74px"></div></div>
 <div class="hero"><h2 style="margin-top:6px">ยังไม่มีพนักงาน AI</h2><p>จ้างคนแรกได้ใน 1 นาที · ไม่มีค่าจ้างเพิ่ม<br>จ้างได้ไม่จำกัด ใช้โควตาแพ็กของร้าน</p></div>
 <div class="sec">แนะนำสำหรับร้านคุณ</div>
 <div class="row" style="border:2px solid rgba(143,155,255,.55)">{av('a2','',48)}<div class="t"><b>แอดมินตอบแชท</b><span>แชทรอตอบ 12 ห้อง · ตอบช้าเฉลี่ย 2 ชม.</span></div>{AR}</div>
 <div class="row">{av('a3','',48)}<div class="t"><b>ผู้ช่วยบัญชี</b><span>มีใบแจ้งหนี้ค้างส่ง 7 ใบ</span></div>{AR}</div>
 <div class="row">{av('a4','',48)}<div class="t"><b>คอนเทนต์ · โซเชียล</b><span>เพจไม่ได้โพสต์มา 9 วัน</span></div>{AR}</div>
 </div><div class="foot"><div class="btn1">ดูตำแหน่งทั้งหมด</div></div>'''

# ---------- ข. จ้าง ----------
def rc(o,t,s,sel=False): return f'<div class="card{" sel" if sel else ""}" style="min-height:150px">{AO(o)}<b style="margin-top:14px">{t}</b><span>{s}</span></div>'
pos=f'''<div class="pg">{bar(BACK,'ขั้น 1 จาก 4',CLOSE)}
 {prog(1)}
 <div class="lt">ตำแหน่ง</div><div class="st">เลือกแม่แบบ แล้วปรับได้ทุกอย่างในขั้นถัดไป</div>
 <div class="srch gl"><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>ค้นหาตำแหน่ง เช่น "ตอบแชท"</div>
 <div class="tabs"><span class="a">ทั้งหมด</span><span>ขาย</span><span>บริการ</span><span>บัญชี</span><span>การตลาด</span></div>
 <div class="g2" style="margin-top:10px">
  {rc('o1','เซลส์ดูแลลูกค้า','CRM · ใบเสนอราคา · ตามดีล',True)}
  {rc('o2','แอดมินตอบแชท','LINE · FB · IG · ตอบ 24 ชม.')}
  {rc('o3','ผู้ช่วยบัญชี','ใบแจ้งหนี้ · ตามเงิน · ปิดยอด')}
  {rc('o4','คอนเทนต์ · โซเชียล','เขียนโพสต์ · ตั้งเวลา · คอมเมนต์')}
  {rc('o5','ดูแลสมาชิก','แต้ม · คูปอง · แคมเปญ')}
  <div class="card dash" style="min-height:150px">＋<br>สร้างตำแหน่งเอง</div>
 </div>
 </div><div class="foot"><div class="btn1">ถัดไป</div></div>'''

ident=ident  # B2 = หน้าเดิม

def mr(i,t,s,muted=False): return f'<div class="row cp"><div class="ic">{i}</div><div class="t"><b class="n">{t}</b><span{" style=color:#aeaeb2" if muted else ""}>{s}</span></div>{AR}</div>'
manual=f'''<div class="pg">{bar(BACK,'ขั้น 3 จาก 4',CLOSE)}
 {prog(3)}
 <div class="lt">คู่มือการทำงาน</div><div class="st">เริ่มจากแม่แบบเซลส์ · แก้ได้ทุกข้อ ใช้ภาษาธรรมดา</div>
 <div style="margin-top:8px">
 {mr('🎯','หน้าที่หลัก','ดูแลดีล · ทำใบเสนอราคา · ตามลูกค้า')}
 {mr('⛔','สิ่งที่ห้ามทำ','ห้ามลดเกิน 10% · ห้ามสัญญาวันส่ง · +2')}
 {mr('🙋','เมื่อไหร่ต้องถามคุณ','ดีลเกิน ฿50,000 · ลูกค้าขอเครดิต')}
 {mr('🪜','ขั้นตอนทำงาน','ใช้ของแม่แบบ 5 ขั้น',True)}
 {mr('⭐','ตัวอย่างงานที่ดี','ยังไม่มี · ใส่ใบเสนอราคาที่ชอบได้',True)}
 {mr('📏','ตัวชี้วัด','ปิดดีล 8 รายต่อเดือน · ตอบใน 1 ชม.')}
 </div>
 <div class="g2">
  <div class="card"><b>🎙 พูดอธิบายเอง</b><span>AI แยกเป็นหัวข้อให้</span></div>
  <div class="card"><b>📎 แนบเอกสาร SOP</b><span>PDF · Word · รูปถ่าย</span></div>
 </div>
 </div><div class="foot"><div class="btn1">ถัดไป</div></div>'''

def rule(t): return f'<div class="row cp"><span style="color:#b0b0c0;font-size:18px;letter-spacing:-3px">⋮⋮</span><div class="t"><b class="n" style="font-size:15.5px;white-space:normal;line-height:1.5">{t}</b></div><span style="color:#c2334d;font-size:22px;font-weight:300">−</span></div>'
forbid=f'''<div class="pg">{bar(BACK,'',PILL('บันทึก'))}
 <div class="lt">สิ่งที่ห้ามทำ</div><div class="st">คุณเอกจะไม่ทำสิ่งเหล่านี้ แม้ลูกค้าจะขอ</div>
 <div style="margin-top:10px">
 {rule('ห้ามให้ส่วนลดเกิน 10% โดยไม่ถามก่อน')}
 {rule('ห้ามสัญญาวันส่งของ ให้บอกว่าจะเช็กสต็อกก่อน')}
 {rule('ห้ามบอกราคาทุนหรือกำไร')}
 {rule('ห้ามพูดถึงร้านคู่แข่ง')}
 <div class="row cp" style="color:#5a64d8;font-weight:600;font-size:15.5px;justify-content:center">＋ เพิ่มข้อ</div>
 </div>
 <div class="sec">แนะนำจากร้านแบบเดียวกัน</div>
 <div class="chips" style="flex-wrap:wrap;margin-top:12px"><span>+ ห้ามรับคืนสินค้าเอง</span><span>+ ห้ามแจ้งเลขบัญชีอื่น</span><span>+ ห้ามยืนยันการจ่ายเงินเอง</span></div>
 <div class="sec">ถ้าลูกค้าขอสิ่งที่ห้าม ให้ตอบว่า</div>
 <div class="qt" style="margin-top:12px">ขอผมเช็กกับเจ้าของร้านก่อนนะครับ จะรีบแจ้งกลับภายในวันนี้ครับ</div>
 {it('🔔','แจ้งคุณทันทีเมื่อลูกค้าขอ','',arrow=False,right=tgl(True))}
 </div>'''

LV=['ปิด','ดูอย่างเดียว','ร่าง+รออนุมัติ','ทำเองได้']
def pm(i,t,a): return f'<div class="card pm"><div class="h"><span style="font-size:19px">{i}</span>{t}</div>{seg(LV,a)}</div>'
perm=f'''<div class="pg">{bar(BACK,'ขั้น 4 จาก 4',CLOSE)}
 {prog(4)}
 <div class="lt">สิทธิ์ &amp; โควตา</div><div class="st">คุณเอกเข้าระบบไหนได้ และใช้โควตาได้เท่าไร</div>
 <div class="sec" style="margin-top:24px">ให้เข้าระบบไหนได้บ้าง</div>
 {pm('👥','CRM · ลูกค้า &amp; ดีล',3)}
 {pm('🧾','บัญชี · ใบเสนอราคา',2)}
 {pm('📋','บอร์ดงาน',3)}
 {pm('💬','แชทลูกค้า',2)}
 <div class="g2" style="margin-top:12px">
  <div class="card"><span style="margin:0">เวลาทำงาน</span><b style="font-size:19px;margin-top:6px">ตลอด 24 ชม.</b></div>
  <div class="card"><span style="margin:0">ใช้โควตาได้สูงสุด</span><b style="font-size:19px;margin-top:6px">25% <small style="font-size:13px;font-weight:400;color:#8e8e93">ต่อเดือน</small></b></div>
 </div>
 <div class="note">ไม่มีค่าจ้างเพิ่ม · จ้างได้ไม่จำกัด · ใช้โควตาแพ็กของร้าน</div>
 </div><div class="foot"><div class="btn1">จ้างคุณเอก</div></div>'''

done=f'''<div class="pg">{bar(r=CLOSE)}
 <div class="hero" style="margin-top:56px;position:relative"><div class="ao o1 halo" style="width:150px;height:150px"></div>
  <span style="position:absolute;top:-6px;left:92px;font-size:26px">✨</span><span style="position:absolute;top:120px;right:96px;font-size:22px">✨</span>
  <h2 style="margin-top:54px">คุณเอกเริ่มงานแล้ว</h2><p>เซลส์ดูแลลูกค้า · The Bean Café</p></div>
 <div class="nums" style="margin-top:30px !important"><div><b>4</b><span>ระบบที่เข้าได้</span></div><div><b>6</b><span>หัวข้อคู่มือ</span></div><div><b>25%</b><span>โควตาสูงสุด</span></div></div>
 <div class="sec">ลองสั่งงานแรก</div>
 {it('📊','สรุปดีลที่ค้างอยู่ตอนนี้')}
 {it('🔔','ตามลูกค้าที่เงียบเกิน 14 วัน')}
 {it('📄','ทำใบเสนอราคาให้ลูกค้า')}
 </div><div class="foot"><div class="btn2">กลับหน้าทีม</div><div class="btn1">สั่งงานแรก</div></div>'''

def ver(v,date,who,note,d='',cur=False,res=''):
    btn='' if cur else '<span class="v" style="padding:8px 14px;border-radius:16px;background:rgba(150,150,185,.12);color:#16161c;font-weight:500;font-size:13.5px">ย้อนกลับไปใช้</span>'
    return f'''<div class="card{" sel" if cur else ""}" style="margin-top:14px;padding:18px 20px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:18px">{v}{"<span class=tagp>ใช้อยู่</span>" if cur else ""}</b>{btn}</div>
   <span>{date} · แก้โดย {who}</span><div style="font-size:15px;margin-top:8px">{note}</div>{d}{res}</div>'''
hist=f'''<div class="pg">{bar(BACK)}
 <div class="lt">ประวัติคู่มือ</div>
 <div style="display:flex;align-items:center;gap:10px;margin-top:10px">{av('a1','อ',32)}<span class="st" style="margin:0">คุณเอก · 3 เวอร์ชัน · ย้อนกลับได้ทุกเวอร์ชัน</span></div>
 <div style="margin-top:12px">
 {ver('v3','20 ก.ย. 69','คุณ','เพิ่มข้อห้ามเรื่องส่วนลด','<div class="dif"><span class="p">+ ห้ามให้ส่วนลดเกิน 10% โดยไม่ถามก่อน</span></div>',True,'<div class="grn" style="font-size:13.5px;font-weight:600;margin-top:12px">📈 หลังแก้ ผ่านโดยไม่ต้องแก้ 88% → 94%</div>')}
 {ver('v2','5 ก.ย. 69','คุณนิด','เปลี่ยนน้ำเสียง','<div class="dif"><span class="m">น้ำเสียง: เป็นกันเอง</span><span class="p">น้ำเสียง: สุภาพ</span></div>')}
 {ver('v1','1 ส.ค. 69','คุณ','จ้างจากแม่แบบ "เซลส์ดูแลลูกค้า"')}
 </div></div>'''

# ---------- ค. ตั้งค่า ----------
def pl3(n,pr,items,cur=False,hi=False,soon=False):
    st=' style="margin-top:12px;'+('border:2px solid #16161c' if cur else ('border:2px solid rgba(143,155,255,.6)' if hi else ''))+'"'
    tag='<span class=tagp>ใช้อยู่</span>' if cur else ('<span class="tagp s">เร็ว ๆ นี้</span>' if soon else '')
    return f'<div class="card pl3{" soon" if soon else ""}"{st}><div class="ph"><b>{n}{tag}</b><span class="pr" style="margin:0;color:#16161c">{pr}<small> /เดือน</small></span></div><ul>{"".join(f"<li>{x}</li>" for x in items)}</ul></div>'
choose=f'''<div class="pg">{bar(BACK)}
 <div class="lt">แพ็ก</div><div class="st">ทุกแพ็กจ้าง AI ได้ไม่จำกัด · ตอนนี้เปิดให้ใช้แพ็กฟรี</div>
 <div style="margin-top:14px">
 {pl3('ฟรี','฿0',['ประมาณ 50 งานต่อเดือน · ไม่ต้องใส่บัตร','งานประจำ 1 งาน · ผู้อนุมัติ 1 คน'],cur=True)}
 {pl3('Starter','฿490',['ประมาณ 800 งานต่อเดือน','งานประจำ 5 งาน · ผู้อนุมัติ 1 คน'],soon=True)}
 {pl3('Pro','฿1,490',['ประมาณ 3,000 งานต่อเดือน','งานประจำ 30 งาน · ผู้อนุมัติ 3 คน','บันทึกย้อนหลัง 90 วัน'],soon=True)}
 {pl3('Business','฿3,990',['ประมาณ 10,000 งานต่อเดือน','งานประจำ · ผู้อนุมัติ ไม่จำกัด','บันทึกย้อนหลัง 1 ปี · รายงานทีม'],soon=True)}
 </div>
 <div class="note">แพ็กเสียเงินยังไม่เปิดขายในรุ่นนี้</div>
 </div><div class="foot"><div class="btn2">แจ้งฉันเมื่อเปิดขาย</div></div>'''

topup=f'''<div class="pg">{bar(BACK)}
 <div class="lt">เติมโควตา</div><div class="st">เติมเองเมื่อโควตาแพ็กหมดแล้วอยากใช้ต่อ</div>
 <div class="qt gl" style="margin-top:20px"><b>ยังไม่เปิดให้เติมในรุ่นนี้</b> · จะเปิดพร้อมแพ็กเสียเงิน</div>
 <div class="soon">
 <div class="g3">
  <div class="card pk3"><b>+10%</b><span>฿190</span></div>
  <div class="card pk3 sel"><b>+25%</b><span>฿450</span></div>
  <div class="card pk3"><b>+50%</b><span>฿850</span></div>
 </div>
 <div class="note" style="margin-top:12px">+25% ≈ 750 งาน</div>
 <div class="sec" style="margin-top:22px">ชำระด้วย</div>
 {it('💳','บัตร •••• 4242','หมดอายุ 08/28',arrow=False,right=CK)}
 {it('📱','พร้อมเพย์ QR','',arrow=False)}
 <div class="sec" style="margin-top:22px">ใบกำกับภาษี</div>
 {it('🧾','ออกในนาม The Bean Café','0105•••••321 · ส่งอีเมลบัญชี',arrow=False,right=tgl(True))}
 </div>
 </div><div class="foot"><div class="btn1 off">ยังไม่เปิดให้เติม</div></div>'''

menu=f'''<div class="pg">{bar(BACK)}
 <div class="row" style="margin-top:14px"><div class="hp h1" style="width:56px;height:56px;font-size:20px">ส</div><div class="t"><b style="font-size:19px">คุณสุข</b><span>เจ้าของ · 3 กิจการ</span></div>{AR}</div>
 <div class="sec" style="margin-top:26px">กิจการนี้ · The Bean Café</div>
 {it('📦','แพ็กและการใช้งาน','','ฟรี · 62%')}
 {it('📚','ความรู้ของร้าน','','18 รายการ')}
 {it('👥','ผู้อนุมัติ &amp; คนในทีม','','3 คน')}
 {it('🗂','บันทึกการกระทำ')}
 {it('🔔','การแจ้งเตือน')}
 <div class="sec" style="margin-top:26px">ทั่วไป</div>
 {it('🧾','ใบเสร็จ &amp; ใบกำกับภาษี')}
 {it('🌐','ภาษาแอป','','ไทย')}
 {it('💬','ช่วยเหลือ')}
 <div style="text-align:center;color:#d33;font-size:15.5px;font-weight:500;margin-top:22px">ออกจากระบบ</div>
 </div>'''

def kb(i,t,s,orbs,acc): return f'<div class="row cp"><div class="ic">{i}</div><div class="t"><b class="n">{t}</b><span>{s}</span></div><div class="r" style="gap:6px">{stk(*[f"<div class=\"ao {o}\" style=\"width:26px;height:26px\"></div>" for o in orbs])}<span style="font-size:12px">{acc}</span></div></div>'
know=f'''<div class="pg">{bar(BACK,'',PLUS)}
 <div class="lt">ความรู้ของร้าน</div><div class="st">18 รายการ · พนักงาน AI ใช้ตอบและทำงาน</div>
 <div class="srch gl"><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>ค้นหาในความรู้ของร้าน</div>
 <div class="sec" style="margin-top:24px">ดึงจาก SHARK อัตโนมัติ</div>
 {kb('📦','สินค้า &amp; ราคา','214 รายการ · ซิงก์ทุกชั่วโมง',['o1','o2','o3'],'ทุกคน')}
 {kb('🕘','เวลาเปิด-ปิด &amp; สาขา','2 สาขา',['o2','o1'],'ทุกคน')}
 <div class="sec" style="margin-top:24px">ที่คุณเพิ่มเอง</div>
 {kb('💸','นโยบายส่วนลด','เอกสาร · 1 หน้า',['o1','o2'],'เซลส์ · แชท')}
 {kb('📘','คู่มือเครื่องชงกาแฟ','PDF · 24 หน้า',['o1','o2'],'เซลส์ · แชท')}
 {kb('❓','คำถามที่พบบ่อย','42 ข้อ',['o2'],'แชท')}
 {kb('🔒','ต้นทุน &amp; กำไร','ตาราง · อัปเดต 1 ก.ย.',['o3'],'บัญชีเท่านั้น')}
 </div>'''

def tl(tm,o,t,s,tag=''): return f'<div class="row cp"><span class="tm">{tm}</span>{AO(o).replace("40px","36px")}<div class="t"><b class="n" style="font-size:15px">{t}</b><span style="font-size:13px">{s}</span></div>{tag}</div>'
UNDO='<span style="font-size:12.5px;font-weight:600;color:#5a64d8;padding:6px 12px;border-radius:14px;background:rgba(120,130,255,.12);white-space:nowrap">ยกเลิกได้</span>'
log=f'''<div class="pg">{bar(BACK,'',FILTER)}
 <div class="lt">บันทึกการกระทำ</div><div class="st">ทุกอย่างที่พนักงาน AI ทำ · ย้อนหลัง 90 วัน</div>
 <div class="tabs"><span class="a">ทั้งหมด</span><span>ส่งลูกค้า</span><span>เงิน</span><span>แก้ข้อมูล</span></div>
 <div class="sec" style="margin-top:20px">วันนี้</div>
 {tl('9:42','o1','ส่งใบเสนอราคา Q-0012 ทาง LINE','คุณเอก · อนุมัติโดยคุณ 9:41')}
 {tl('9:30','o2','ตอบแชทลูกค้า 14 ข้อความ','น้องมะลิ · LINE 9 · FB 5')}
 {tl('9:12','o3','ออกใบแจ้งหนี้ INV-0231 ฿4,800','พลอยใส · ทำเองได้',UNDO)}
 {tl('8:15','o4','ร่างโพสต์โปรเดือน ต.ค.','ไอดิน · ส่งไปรออนุมัติ')}
 {tl('7:30','o6','สั่งของ 4 รายการจากผู้ขาย','ต้น · อนุมัติโดยคุณนิด')}
 <div class="sec" style="margin-top:20px">เมื่อวาน</div>
 {tl('18:00','o5','ส่งคูปองวันเกิด 12 คน','ฟ้า · งานประจำ')}
 </div>'''

def nt(i,t,s,on=True): return it(i,t,s,arrow=False,right=tgl(on))
notif=f'''<div class="pg">{bar(BACK)}
 <div class="lt">การแจ้งเตือน</div><div class="st">The Bean Café · ตั้งแยกได้ทุกกิจการ</div>
 <div class="sec" style="margin-top:24px">แจ้งเมื่อ</div>
 {nt('⏳','มีงานรออนุมัติ','ทันที')}
 {nt('🙋','พนักงานติดปัญหา / ต้องถาม','ทันที')}
 {nt('✅','งานเสร็จ','สรุปวันละครั้ง 18:00')}
 {nt('📦','โควตาใกล้หมด','เมื่อใช้ถึง 80% และ 95%')}
 {nt('📈','รายงานทีมประจำสัปดาห์','ทุกจันทร์ 09:00',False)}
 <div class="opt" style="margin-top:26px"><div class="n">ช่องทาง</div><div class="chips"><span class="a">ในแอป</span><span class="a">LINE</span><span>อีเมล</span></div></div>
 <div class="opt" style="margin-top:24px"><div class="n">ห้ามรบกวน<small><b style="color:#16161c;font-size:13.5px">22:00 – 07:00</b></small></div>{seg(['งานด่วนรอเช้า','งานด่วนแจ้งเลย'],0)}</div>
 </div>'''

def ppl(h,l,n,role,rule,you=False,arrow=True):
    return f'<div class="row cp"><div class="hp {h}" style="width:48px;height:48px;font-size:17px">{l}</div><div class="t"><b>{n}{" <em>(คุณ)</em>" if you else ""}</b><span style="white-space:normal">{role} · {rule}</span></div>{AR if arrow else ""}</div>'
people=f'''<div class="pg">{bar(BACK,'',PLUS)}
 <div class="lt">ผู้อนุมัติ &amp; คนในทีม</div><div class="st">คนจริงที่ตรวจและอนุมัติงานของพนักงาน AI</div>
 <div style="margin-top:12px">
 {ppl('h1','ส','คุณสุข','เจ้าของ','อนุมัติได้ทุกอย่าง',True,False)}
 {ppl('h2','น','คุณนิด','ผู้จัดการร้าน','ใบเสนอราคา · โพสต์ · สั่งของ ≤ ฿20,000')}
 {ppl('h3','บ','คุณบอม','บัญชี','งานบัญชีเท่านั้น ≤ ฿50,000')}
 </div>
 <div class="sec">กฎการอนุมัติ</div>
 {it('💸','เกิน ฿20,000','ต้องให้เจ้าของอนุมัติ')}
 {it('⏰','ไม่มีใครอนุมัติใน 4 ชม.','เตือนซ้ำ แล้วส่งต่อให้เจ้าของ')}
 {it('🛑','ยกเลิกงานที่ AI ทำไปแล้ว','เฉพาะเจ้าของ และคุณนิด')}
 </div><div class="foot"><div class="btn2">＋ เชิญคนในทีม</div></div>'''

PAGES={
 'a':('ก. ใช้งานประจำวัน',[(team,'A1 · ทีม'),(switch,'A2 · สลับกิจการ'),(jobs,'A3 · งานของพนักงาน'),(newjob,'A4 · เริ่มงานใหม่'),(room,'A5 · ห้องสั่งงาน'),(recur,'A6 · ตั้งงานประจำ'),(appr,'A7 · รออนุมัติรวม'),(empty,'A8 · ยังไม่มีทีม')]),
 'b':('ข. จ้างพนักงาน',[(pos,'B1 · จ้าง ขั้น 1 ตำแหน่ง'),(ident,'B2 · จ้าง ขั้น 2 ตัวตน'),(manual,'B3 · จ้าง ขั้น 3 คู่มือ'),(forbid,'B4 · แก้หัวข้อ สิ่งที่ห้ามทำ'),(perm,'B5 · จ้าง ขั้น 4 สิทธิ์ & โควตา'),(done,'B6 · จ้างสำเร็จ'),(profile,'B7 · โปรไฟล์พนักงาน'),(hist,'B8 · ประวัติคู่มือ')]),
 'c':('ค. แพ็กและตั้งค่า',[(plan,'C1 · แพ็กและการใช้งาน'),(choose,'C2 · แพ็ก (เสียเงินปิดไว้)'),(topup,'C3 · เติมโควตา (ปิดในรุ่นนี้)'),(menu,'C4 · เมนู'),(know,'C5 · ความรู้ของร้าน'),(log,'C6 · บันทึกการกระทำ'),(notif,'C7 · การแจ้งเตือน'),(people,'C8 · ผู้อนุมัติ & คนในทีม')]),
}
for k,(t,P) in PAGES.items():
    html=f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="title"><h1>SHARK · ทีมพนักงาน AI — {t}</h1><p>Liquid Glass · Airy · ครบ 24 หน้า ({k.upper()}1–{k.upper()}8)</p></div>
<div class="phones">{''.join(phone(b,l) for b,l in P)}</div></body></html>'''
    open(f'ai-team-airy-{k}.html','w').write(html)
print('ok')
