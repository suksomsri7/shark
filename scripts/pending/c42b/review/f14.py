# Copy of the previous reviewer's /tmp/rv-c42/f14.py (C4.2 review 2 Oct 04:35) — F14 both directions: registry rows vs interactive data-testids of a session/crm ref. usage: python3 f14.py <ref> <registry.json>
import re,subprocess,json,sys
root='/root/projects/shark-crm'; ref=sys.argv[1]; reg=sys.argv[2]
files=subprocess.run(['git','-C',root,'ls-tree','-r','--name-only',ref,'src'],capture_output=True,text=True).stdout.split()
def crmdir(f):
    p=f.split('/')
    if f.startswith(('src/app/b/','src/app/u/','src/app/t/')): return True
    return any(x=='crm' for x in p[:-1]) and f.startswith(('src/app','src/components','src/lib/modules'))
files=[f for f in files if (f.endswith('.tsx') or f.endswith('.ts')) and crmdir(f)]
hosted={"src/lib/modules/pos/register-ui.tsx":["pos-deal-select","pos-deal-hint"],"src/components/pages/CrmDataWidgets.tsx":["page-widget-crm-my-deals-more","page-widget-crm-today-tasks-more","page-widget-crm-deal-*","page-widget-crm-task-*","page-widget-crm-portal-open"],"src/components/member/MembersSavedViewsMenu.tsx":["member-view-team"],"src/lib/modules/hr/ui.tsx":["hr-link-sales-teams"]}
TESTID_RE=re.compile(r'data-testid\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|\{\s*`([^`]*)`\s*\}|\{\s*"([^"]*)"\s*\}|\{\s*\'([^\']*)\'\s*\})')
IT={"button","a","input","select","textarea","form","summary","option","dialog"}
IC=re.compile(r'(Button|Btn|Link|Input|Textarea|Select|Form|Toggle|Switch|Checkbox|Radio|Tab|Tabs|Menu|Dropdown|Upload|Picker|Slider|Search|Combobox|Modal|Sheet|Drawer|Trigger|Item|Option|Action|Close|Cancel|Submit|Save)$')
IA=re.compile(r'\bon(Click|Change|Input|Submit|KeyDown|KeyUp|KeyPress|Drag\w*|Drop|Toggle|Select|ValueChange|CheckedChange|OpenChange|Press|PointerDown|MouseDown)\s*=|\bhref\s*=|\baction\s*=|\brole\s*=\s*\{?["\']?(button|tab|link|menuitem|switch|checkbox|option)\b|\btabIndex\s*=|\bdraggable\s*=|\bcontentEditable\s*=')
norm=lambda v: re.sub(r'\*+','*',re.sub(r'\$\{[^}]*\}','*',v)).strip()
glob=lambda g: re.compile('^'+'.*'.join(re.escape(x) for x in g.split('*'))+'$')
def around(src,at):
    o=-1
    for i in range(at,-1,-1):
        if src[i]=='<' and i+1<len(src) and src[i+1].isalpha(): o=i;break
    if o<0: return '',''
    tag=re.match(r'<([A-Za-z][\w.]*)',src[o:o+80]).group(1)
    d=0;q='';e=len(src)
    for i in range(o,len(src)):
        c=src[i]
        if q:
            if c==q and src[i-1]!='\\': q=''
            continue
        if c in '"\'`': q=c;continue
        if c=='{': d+=1
        elif c=='}': d-=1
        elif c=='>' and d<=0: e=i;break
    return tag,src[o:e]
def inter(tag,attrs): return tag in IT or tag.split('.')[-1] in IT or IC.search(tag) or IC.search(tag.split('.')[-1]) or IA.search(attrs)
found=[]
def show(f): return subprocess.run(['git','-C',root,'show',f'{ref}:{f}'],capture_output=True,text=True).stdout
for f in files:
    s=show(f)
    for m in TESTID_RE.finditer(s):
        raw=next(g for g in m.groups() if g is not None) if any(g is not None for g in m.groups()) else ''
        t,a=around(s,m.start()); found.append((norm(raw),f,bool(inter(t,a))))
for f,ids in hosted.items():
    s=show(f)
    for m in TESTID_RE.finditer(s):
        raw=norm(next(g for g in m.groups() if g is not None))
        if raw in ids: t,a=around(s,m.start()); found.append((raw,f,bool(inter(t,a))))
rows=json.load(open(reg))['rows']; rid=[r['testid'] for r in rows]
rexact={x for x in rid if '*' not in x}; rpat=[(x,glob(x)) for x in rid if '*' in x]
cexact={x for x,_,_ in found if '*' not in x}; cpat=[(x,glob(x)) for x,_,_ in found if '*' in x]
def registered(i): return i in rexact or ('*' in i and any(r.match(i) or glob(i).match(p) for p,r in rpat))
def incode(i): return any(c.match(i) or glob(i).match(p) for p,c in cpat) if '*' in i else (i in cexact or any(c.match(i) for p,c in cpat))
un=sorted({(i,f) for i,f,x in found if x and not registered(i)})
gh=[i for i in rid if not incode(i)]
print(ref,reg.split('/')[-1],'interactive',len({(i,f) for i,f,x in found if x}),'unregistered',len(un),un[:20],'ghosts',len(gh),gh[:20])
