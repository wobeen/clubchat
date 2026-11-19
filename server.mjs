import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
const routes = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/domain.js': ['domain.js', 'text/javascript'],
  '/repository.js': ['repository.js', 'text/javascript'],
  '/styles.css': ['styles.css', 'text/css'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};
Object.assign(routes, {
  '/android': ['index.html', 'text/html'],
  '/android/': ['index.html', 'text/html'],
  '/messenger-layouts.js': ['messenger-layouts.js', 'text/javascript'],
  '/messenger.css': ['messenger.css', 'text/css'],
  '/demo-conversations.js': ['demo-conversations.js', 'text/javascript'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/preview': ['preview.html', 'text/html'],
  '/preview.css': ['preview.css', 'text/css'],
  '/preview.js': ['preview.js', 'text/javascript'],
});
const port = Number(process.env.PORT || 4173);
for (const name of [
  'browser-repository.js',
  'schema.js',
  'capsule-ui.js',
  'tutorial.js',
  'ui-state.js',
  'workflow-actions.js',
  'remote-repository.js',
])
  routes['/' + name] = [name, 'text/javascript'];
for (const name of ['capsule.css', 'workflow.css', 'white-theme.css', 'liquid-glass.css'])
  routes['/' + name] = [name, 'text/css'];
const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
// Development stand-in for the production reverse proxy: forwards /v1 to the API so the page and the
// API share one origin (cookies, Origin check). Example: ITDA_API_URL=http://127.0.0.1:8080
const apiUrl = process.env.ITDA_API_URL;
function proxy(req, res) {
  const upstream = http.request(new URL(req.url, apiUrl), { method: req.method, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode, answer.headers);
    answer.pipe(res);
  });
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { code: 'bad_gateway', message: 'API 서버에 연결하지 못했어요.', details: {} } }));
  });
  req.pipe(upstream);
}
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok","app":"itda"}');
      return;
    }
    if (apiUrl && path.startsWith('/v1/')) {
      proxy(req, res);
      return;
    }
    const file = routes[path];
    if (!file) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const body = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
    res.writeHead(200, {
      'Content-Type': `${file[1]}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end('Unable to load ITDA');
  }
});
// WebSocket upgrades for /v1/ws take the same route as other API requests.
server.on('upgrade', (req, socket, head) => {
  if (!apiUrl || !new URL(req.url, 'http://localhost').pathname.startsWith('/v1/')) {
    socket.destroy();
    return;
  }
  const upstream = http.request(new URL(req.url, apiUrl), { method: req.method, headers: req.headers });
  upstream.on('upgrade', (answer, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 ${answer.statusCode} ${answer.statusMessage}`];
    for (let i = 0; i < answer.rawHeaders.length; i += 2)
      lines.push(`${answer.rawHeaders[i]}: ${answer.rawHeaders[i + 1]}`);
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
    upstreamSocket.on('error', () => socket.destroy());
    socket.on('error', () => upstreamSocket.destroy());
  });
  upstream.on('response', (answer) => socket.end(`HTTP/1.1 ${answer.statusCode} ${answer.statusMessage}\r\n\r\n`));
  upstream.on('error', () => socket.destroy());
  upstream.end();
});
server.on('error', (err) => {
  console.error(
    err.code === 'EADDRINUSE' ? `포트 ${port}이 사용 중입니다. PORT 환경변수로 다른 포트를 지정해주세요.` : err.message,
  );
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(
    `잇다 ITDA · http://127.0.0.1:${port}\nPC·Android 미리보기 · http://127.0.0.1:${port}/preview\n종료: Ctrl+C · ${fileURLToPath(new URL('.', import.meta.url))}`,
  );
  if (host === '0.0.0.0')
    for (const entries of Object.values(networkInterfaces()))
      for (const entry of entries || [])
        if (entry.family === 'IPv4' && !entry.internal)
          console.log(`같은 Wi-Fi의 휴대폰: http://${entry.address}:${port}/android`);
});
