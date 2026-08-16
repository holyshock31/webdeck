// demo-server.js — 供冒烟测试与示例使用的最小 HTTP 服务
// 用法: node scripts/demo-server.js [port]   （默认 32187，0 = 随机端口）
// 启动后向 stdout 打印一行 WEBDECK_DEMO_PORT=<port>
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 32187);

const server = createServer((req, res) => {
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>WebDeck Demo</title></head>
<body style="font-family:system-ui;background:#10131a;color:#d8dce4;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1>WebDeck 演示页</h1><p>这是由本地命令启动的演示服务 (${req.url})</p></div>
</body></html>`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
});

server.listen(port, '127.0.0.1', () => {
  const actual = server.address().port;
  console.log(`WEBDECK_DEMO_PORT=${actual}`);
  console.log(`demo server listening on http://127.0.0.1:${actual}`);
});
