// plain TCP forwarder 127.0.0.1:3241 -> 127.0.0.1:3242 (acceptance runner only).
// Reason: probe-trips-w1.1-hunt-lib.mts hard-codes PORT 3241 (no env override) while build-l3.sh serve listens on 3242.
// Bytes are piped unchanged (headers untouched); the server sees the forwarder's loopback socket, same as a direct local client.
const net = require("node:net");
const srv = net.createServer((c) => {
  const u = net.connect(3242, "127.0.0.1");
  c.pipe(u); u.pipe(c);
  const end = () => { c.destroy(); u.destroy(); };
  c.on("error", end); u.on("error", end); c.on("close", end); u.on("close", end);
});
srv.maxConnections = 2000;
srv.listen(3241, "127.0.0.1", () => console.log("fwd 3241->3242 listening"));
