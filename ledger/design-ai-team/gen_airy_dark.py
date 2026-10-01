# โหมดมืดของทุกชุด (a–e): อ่าน ai-team-airy-<k>.html แล้วทับ CSS + สลับสี inline → ai-team-airy-dark-<k>.html
# ต้องรัน gen_airy_full.py / gen_airy_d.py / gen_airy_e.py ก่อน เพื่อให้ไฟล์สว่างเป็นตัวล่าสุด
import re
DARK=r'''
/* ================= โหมดมืด ================= */
body{background:radial-gradient(1200px 800px at 15% 20%,#2a1a2c 0,transparent 60%),radial-gradient(1000px 900px at 85% 30%,#14233a 0,transparent 60%),radial-gradient(900px 700px at 50% 95%,#12281f 0,transparent 60%),#0b0b10;color:#f2f2f7}
.title p,.label{color:#7c7c8c}
.phone{background:linear-gradient(145deg,#4a4a58,#1a1a22 50%,#33333e);box-shadow:0 60px 120px rgba(0,0,0,.55),inset 0 0 0 2px rgba(255,255,255,.14)}
.screen{background:radial-gradient(420px 380px at 90% 8%,rgba(60,170,120,.22) 0,transparent 70%),radial-gradient(500px 500px at 0% 35%,rgba(210,90,140,.20) 0,transparent 70%),radial-gradient(500px 420px at 100% 70%,rgba(80,120,230,.22) 0,transparent 70%),radial-gradient(400px 400px at 20% 100%,rgba(220,150,60,.16) 0,transparent 70%),#0e0e15}
.island{background:#000;box-shadow:0 0 0 1px rgba(255,255,255,.07)}
.sig i{background:#f2f2f7}
svg{stroke:#f2f2f7}.row svg{stroke:#6a6a7a}.lt svg{stroke:#8e8e93}.srch svg{stroke:#8a8a9a}
.gl,.ib,.row,.it2,.apc,.nums div,.grid div,.inp,.tabs span,.btn2,.qt,.fld,.acts div,.card{background:linear-gradient(135deg,rgba(255,255,255,.115),rgba(255,255,255,.045));border:1.5px solid rgba(255,255,255,.13);box-shadow:0 10px 30px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.12)}
.row:last-child{border:1.5px solid rgba(255,255,255,.13)}
.row .t span,.card span,.it2 p,.opt .n,.fl,.li,.stp,.urow .n{color:#a6a6b4}
.it2 .ac{color:#c2c2d0}
.st{color:#8e8e9c}.sec{color:#7c7c8c}
.tabs span{color:#b4b4c4}
.tabs .a,.btn1,.pillb,.lk,.tagp,.chk,.days .a,.chips .a,.acts .d,.it2 .ac .d,.inp .s{background:#f2f2f7 !important;color:#16161c !important;border:0;box-shadow:0 8px 22px rgba(0,0,0,.35)}
.card .tagp{color:#16161c}
.btn1 svg,.chk svg,.inp .s svg{stroke:#16161c}
.btn2{color:#f2f2f7}
.segw{background:rgba(255,255,255,.08)}.segw span{color:#a6a6b4}.segw .a{background:rgba(255,255,255,.24);color:#fff;box-shadow:none}
.chips span{background:rgba(255,255,255,.09);color:#b4b4c4}
.days span{background:rgba(255,255,255,.09);color:#a6a6b4}
.ubb{background:linear-gradient(135deg,#f6f6fb,#d9d9ea);color:#16161c;box-shadow:0 10px 24px rgba(0,0,0,.35)}
.ic{background:rgba(255,255,255,.12);box-shadow:none}
.card.sel{border:2px solid #f2f2f7}.card.dash{background:none;box-shadow:none;border:1.5px dashed #4c4c5c;color:#8e8e9c}
.dim{background:rgba(0,0,0,.55)}
.sheet{background:linear-gradient(160deg,rgba(40,40,52,.98),rgba(26,26,34,.97))}.grab{background:#5a5a68}
.ub{background:rgba(255,255,255,.13)}
.prog i{background:#f2f2f7}.prog i.n{background:rgba(255,255,255,.16)}
.more{background:#3a3a48;color:#d6d6e2}
.stk>*{border-color:#17171f !important;box-shadow:0 4px 10px rgba(0,0,0,.35)}
.ao{border-color:rgba(255,255,255,.55);box-shadow:inset -4px -6px 12px rgba(255,255,255,.55),inset 3px 3px 10px rgba(160,160,200,.25),0 6px 18px rgba(0,0,0,.4)}
.ao .sd{border-color:#17171f}
.halo{box-shadow:0 0 0 18px rgba(159,216,255,.14),0 0 0 42px rgba(199,179,255,.09),0 20px 50px rgba(0,0,0,.5) !important}
.pl3 li{color:#b4b4c4}
.dif{background:rgba(255,255,255,.07)}.dif .p{color:#5fd39a}.dif .m{color:#ff7d93}
.flag.g{background:rgba(60,196,127,.16);color:#6fe0a8}.flag.w{background:rgba(255,176,32,.16);color:#ffc65c}
.lv.g{background:rgba(60,196,127,.16);color:#6fe0a8}.lv.w{background:rgba(255,176,32,.16);color:#ffc65c}
.amb{color:#ffbe55 !important}.grn{color:#5fd39a !important}.gry{color:#8e8e9c !important}
.apc .tg{color:#ffbe55}.apc .s{color:#8e8e9c}
.tgl.off{background:rgba(255,255,255,.2)}
.qt{color:#dcdce8}
.inp{color:#7c7c8c}.inp .mic{stroke:#8a8a9a}
.un{border-color:#5a5a68}
.who em{color:#8e8e9c}.stp.q{color:#6f6f7d}.stp.q b{color:#5a5a68}
.okt{color:#5fd39a}
.fld{color:#f2f2f7}
.tagp.s{background:rgba(255,255,255,.16) !important;color:#d0d0dc !important;box-shadow:none}
.btn1.off{background:rgba(255,255,255,.12) !important;color:#8e8e9c !important;box-shadow:none}
.lg{filter:saturate(.9) brightness(.92)}
'''
INLINE=[  # (สีสว่าง → สีมืด) เฉพาะใน style="" ของเนื้อหา
 ('#16161c','#f2f2f7'),('#111','#f2f2f7'),('#6e6e73','#a6a6b4'),('#55556a','#b4b4c4'),('#333','#dcdce8'),
 ('#5a64d8','#a3abff'),('#6a5ad8','#b3a6ff'),('#c2334d','#ff7d93'),('#d33','#ff7b7b'),('#c47a12','#ffbe55'),
 ('#23945a','#5fd39a'),('#c5c7d6','#4c4c5c'),('#b0b0c0','#6a6a7a'),('#aeaeb2','#7c7c8c'),
]
def dark_inline(m):
    s=m.group(0)
    for a,b in INLINE: s=re.sub(re.escape(a)+r'(?![0-9a-fA-F])',b,s)
    return s
for k in 'abcde':
    h=open(f'ai-team-airy-{k}.html').read()
    head,body=h.split('</style>',1)
    body=re.sub(r'style="[^"]*"',dark_inline,body)
    body=re.sub(r'style=color:#aeaeb2','style=color:#7c7c8c',body)
    body=body.replace('Liquid Glass · Airy','Liquid Glass · Airy · โหมดมืด')
    open(f'ai-team-airy-dark-{k}.html','w').write(head+DARK+'</style>'+body)
print('ok')
