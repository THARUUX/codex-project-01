import http from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : fallback;
};
const root = resolve(option('--dir', 'site'));
const port = Number(option('--port', process.env.PORT || '5173'));
const host = option('--host', '0.0.0.0');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.avif':'image/avif', '.woff':'font/woff', '.woff2':'font/woff2', '.mp4':'video/mp4', '.wasm':'application/wasm', '.glb':'model/gltf-binary' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let info = await stat(file);
    if (info.isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(301, { Location: pathname + '/' }).end(); return; }
      file = resolve(file, 'index.html');
      info = await stat(file);
    }
    const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : info.size - 1, info.size - 1);
      if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
      const data = await readFile(file);
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end-start+1 });
      res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': info.size });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    }
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Page not found');
  }
});
server.listen(port, host, () => console.log(`Website serving on port ${port} from ${root}`));
