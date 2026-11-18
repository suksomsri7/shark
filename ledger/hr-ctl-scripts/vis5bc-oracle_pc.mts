const L: any = await import("/root/projects/shark-hr/scripts/qc-hr-vis-5-lib.mts");
console.log("BASE", L.BASE.slice(0,9));
const d = L.diffStatics("5b"); console.log("5b outside", d.outside.length, d.outside.slice(0,6), "bad", d.bad.slice(0,6));
const e = L.diffStatics("5c"); console.log("5c outside", e.outside.length, "bad", e.bad.slice(0,6));
console.log("msg5b", L.msgStatics("5b")); console.log("msg5c", L.msgStatics("5c"));
