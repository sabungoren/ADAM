/**
 * ==============================================================================
 * Project A.D.A.M - Frontend Production Static Server & Reverse Proxy
 * ==============================================================================
 * Melayani folder 'dist/' hasil build React Vite di STB (Linux/Armbian)
 * DAN menjadi reverse-proxy untuk endpoint /api/*, /events, dan /graph.bin ke Go backend (port 5194).
 * ==============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.env.PORT || '5193', 10);
const HOST = process.env.HOST || '0.0.0.0';
const BACKEND_TARGET = process.env.BACKEND_TARGET || 'http://127.0.0.1:5194';
const distDir = path.resolve(__dirname, 'dist');

const backendUrlObj = url.parse(BACKEND_TARGET);
const BACKEND_HOST = backendUrlObj.hostname || '127.0.0.1';
const BACKEND_PORT = parseInt(backendUrlObj.port || '5194', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// Fungsi reverse-proxy ke Go backend (port 5194)
function proxyToBackend(req, res) {
  const reqHeaders = { ...req.headers };
  // Set Host header ke backend target agar tidak tertolak
  reqHeaders['host'] = `${BACKEND_HOST}:${BACKEND_PORT}`;
  reqHeaders['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  reqHeaders['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'https';

  const options = {
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: reqHeaders,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Frontend Proxy Error] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: 'Backend gateway (adam-backend) offline atau gagal dihubungi di port 5194',
        details: err.message,
      }));
    }
  });

  // HANYA pipe body untuk method yang memiliki payload (POST, PUT, PATCH)
  // Untuk GET, HEAD, DELETE: WAJIB panggil proxyReq.end() agar request tidak menggantung!
  if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || '/', true);
  const pathname = decodeURIComponent(parsedUrl.pathname || '/');

  // 1. JIKA REQUEST ADALAH API, SSE (/events), ATAU GRAPH BINARY:
  // Teruskan langsung ke Go Backend di port 5194!
  if (
    pathname.startsWith('/api/') ||
    pathname === '/events' ||
    pathname.startsWith('/events/') ||
    pathname === '/graph.bin' ||
    pathname === '/healthz' ||
    pathname === '/save'
  ) {
    proxyToBackend(req, res);
    return;
  }

  // 2. JIKA REQUEST ADALAH STATIC FILE FRONTEND:
  // Keamanan: cegah directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(distDir, safePath);

  // Jika folder dist belum di-build
  if (!fs.existsSync(distDir)) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <div style="font-family:sans-serif;padding:40px;text-align:center;background:#090d16;color:#f8fafc;min-height:100vh;">
        <h2 style="color:#06b6d4;">Project A.D.A.M Production Server Aktif</h2>
        <p>Folder <code>dist/</code> belum ditemukan di STB.</p>
        <p>Silakan jalankan <code>npm run build</code> di folder frontend sebelum menjalankan PM2.</p>
      </div>
    `);
    return;
  }

  // Cek apakah request menunjuk ke file fisik yang ada
  fs.stat(filePath, (err, stats) => {
    let targetFile = filePath;

    if (!err && stats.isDirectory()) {
      targetFile = path.join(filePath, 'index.html');
    }

    // Jika file fisik ditemukan
    if (!err && fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      const ext = path.extname(targetFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Cache: asset dengan hash di-cache 1 tahun, index.html tidak di-cache
      const isHashedAsset = targetFile.includes('assets');
      const cacheControl = isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      });

      fs.createReadStream(targetFile).pipe(res);
      return;
    }

    // 3. SPA Fallback: Sajikan index.html untuk seluruh route client (/login, /admin, /cmd/A, dll)
    const indexFile = path.join(distDir, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(indexFile).pipe(res);
      return;
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found - Project A.D.A.M');
  });
});

server.listen(PORT, HOST, () => {
  console.log('===============================================================');
  console.log(`Project A.D.A.M Frontend Production Server Aktif di STB`);
  console.log(`URL Frontend:  http://${HOST}:${PORT}`);
  console.log(`Target Backend: ${BACKEND_TARGET}`);
  console.log(`Domain Publik: https://smartadam.my.id`);
  console.log(`Folder Dist:   ${distDir}`);
  console.log('===============================================================');
});
