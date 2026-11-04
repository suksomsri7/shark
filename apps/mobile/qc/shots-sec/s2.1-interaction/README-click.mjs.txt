import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync } from "node:fs"; import { join, extname } from "node:path";
const DIST="/root/qc-shark-mobile-sec-d/dist", FX=JSON.parse(readFileSync(process.argv[2],"utf8")), OUT=process.argv[3];
const srv=createServer((q,r)=>{let f=join(DIST,decodeURIComponent(new URL(q.url,"http://x").pathname)); if(!existsSync(f)||statSync(f).isDirectory()) f=join(DIST,"index.html"); r.writeHead(200,{"content-type":{".html":"text/html",".js":"application/javascript",".ttf":"font/ttf",".png":"image/png"}[extname(f)]??"application/octet-stream"}); r.end(readFileSync(f));}).listen(4725);
const b=await puppeteer.launch({executablePath:"/usr/bin/chromium-browser",headless:true,args:["--no-sandbox",`--user-data-dir=/tmp/chr-s21-${process.pid}`]});
const shots=[["/secretary","sec-tenant","sheet-secretary"],["/secretary/staff","sec-top-tenant","sheet-staff"]];
for (const [route,id,name] of shots){
 const p=await b.newPage(); await p.setViewport({width:390,height:844,deviceScaleFactor:2}); await p.setRequestInterception(true);
 const cors={"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,OPTIONS"};
 p.on("request",q=>{const u=new URL(q.url()); if(u.host==="shark.in.th"){ if(q.method()==="OPTIONS") return q.respond({status:204,headers:cors,body:""}); const k=`${q.method()} ${u.pathname}`; const body=FX.endpoints[k]; return q.respond({status:body?200:404,headers:cors,contentType:"application/json",body:JSON.stringify(body??{error:"x"})});} q.continue();});
 await p.evaluateOnNewDocument(()=>{localStorage.clear();localStorage.setItem("shark_theme","light");localStorage.setItem("shark_token","qc-mock");localStorage.setItem("shark_tenant","t1");});
 await p.goto("http://127.0.0.1:4725"+route,{waitUntil:"networkidle0"}); await p.waitForSelector(`[data-testid="${id}"]`);
 await p.click(`[data-testid="${id}"]`); await p.waitForSelector('[data-testid="sec-switch-add"]',{timeout:5000}).catch(e=>console.log("ERR",e.message));
 await new Promise(r=>setTimeout(r,800)); await p.screenshot({path:`${OUT}/${name}.png`}); console.log(name, await p.$('[data-testid="sec-switch-tenant-t2"]')?"t2 row ok":"no t2");
 if(name==="sheet-secretary"){ await p.click('[data-testid="sec-switch-tenant-t2"]'); await new Promise(r=>setTimeout(r,1500)); console.log("after switch:", (await p.evaluate(()=>document.body.innerText)).includes("บลูเฮาส์ หอพัก"), await p.evaluate(()=>localStorage.getItem("shark_tenant"))); await p.screenshot({path:`${OUT}/switched.png`});
   await p.click('[data-testid="sec-top-customers"]'); await new Promise(r=>setTimeout(r,1500)); console.log("nav customers ->", p.url()); }
 await p.close();
}
await b.close(); srv.close();
