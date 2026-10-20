// ==========================================================================
// SMART ADAM - PRODUCTION HTTP SERVER (Node.js Built-in, Zero Dependencies)
// Dibuat khusus untuk deployment ke STB (Armbian / Linux) & Cloudflare Tunnel
// ES Module Version (Cocok dengan "type": "module" di package.json)
// ==========================================================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import url, { fileURLToPath } from 'url';
import tls from 'tls';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sederhana load file .env tanpa dependency eksternal
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const envVars = Object.assign(
  {},
  loadEnvFile(path.resolve(__dirname, '.env')),
  loadEnvFile(path.resolve(__dirname, '..', '.env')),
  process.env
);

function sendGmailSmtpNode({ host, port, user, pass, to, subject, html, fromName }) {
  return new Promise((resolve, reject) => {
    const cleanPass = (pass || '').replace(/\s+/g, '').replace(/^"|"$/g, '');
    const cleanUser = (user || '').trim().replace(/^"|"$/g, '');
    const cleanHost = (host || 'smtp.gmail.com').trim();
    const cleanPort = Number(port) || 465;

    if (!cleanUser || !cleanPass) {
      return reject(new Error('Kredensial Gmail SMTP (User / App Password) belum lengkap di file .env'));
    }

    let step = 0;
    let buffer = '';
    const socket = tls.connect(cleanPort, cleanHost, { rejectUnauthorized: true }, () => {});
    socket.setEncoding('utf8');

    const timeout = setTimeout(() => {
      try { socket.destroy(); } catch {}
      reject(new Error('Koneksi SMTP ke smtp.gmail.com timeout (10 detik).'));
    }, 10000);

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Koneksi SMTP Error: ${err.message}`));
    });

    socket.on('close', () => { clearTimeout(timeout); });

    socket.on('data', (data) => {
      buffer += data;
      if (!buffer.endsWith('\r\n')) return;

      const lines = buffer.split('\r\n').filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';
      if (/^\d{3}-/.test(lastLine)) return;

      const code = parseInt(lastLine.slice(0, 3), 10);
      buffer = '';

      if (code >= 400) {
        clearTimeout(timeout);
        try { socket.write('QUIT\r\n'); socket.end(); } catch {}
        return reject(new Error(`Gmail SMTP Ditolak (${code}): ${lastLine}`));
      }

      if (step === 0 && code === 220) {
        step = 1; socket.write('EHLO localhost\r\n');
      } else if (step === 1 && code === 250) {
        step = 2; socket.write('AUTH LOGIN\r\n');
      } else if (step === 2 && code === 334) {
        step = 3; socket.write(Buffer.from(cleanUser).toString('base64') + '\r\n');
      } else if (step === 3 && code === 334) {
        step = 4; socket.write(Buffer.from(cleanPass).toString('base64') + '\r\n');
      } else if (step === 4 && code === 235) {
        step = 5; socket.write(`MAIL FROM:<${cleanUser}>\r\n`);
      } else if (step === 5 && code === 250) {
        step = 6; socket.write(`RCPT TO:<${to}>\r\n`);
      } else if (step === 6 && code === 250) {
        step = 7; socket.write('DATA\r\n');
      } else if (step === 7 && code === 354) {
        step = 8;
        const sender = fromName ? `"${fromName}" <${cleanUser}>` : cleanUser;
        const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@gmail.com>`;
        const dateStr = new Date().toUTCString();
        const rawMessage = [
          `Message-ID: ${messageId}`,
          `Date: ${dateStr}`,
          `From: ${sender}`,
          `To: ${to}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          '',
          Buffer.from(html).toString('base64'),
          '',
          '.',
          '',
        ].join('\r\n');
        socket.write(rawMessage);
      } else if (step === 8 && code === 250) {
        step = 9;
        clearTimeout(timeout);
        socket.write('QUIT\r\n');
        socket.end();
        resolve({ success: true, message: 'Email OTP berhasil dikirimkan via Gmail SMTP.' });
      }
    });
  });
}

const PORT = parseInt(process.env.PORT || '5193', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Lokasi folder dist (output dari npm run build)
let distDir = path.resolve(__dirname, 'dist');
if (!fs.existsSync(distDir) && fs.existsSync(path.resolve(__dirname, 'Frontend', 'dist'))) {
  distDir = path.resolve(__dirname, 'Frontend', 'dist');
}

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
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || '/', true);
  let pathname = decodeURIComponent(parsedUrl.pathname || '/');

  // API Endpoint: Dispatch Email OTP via Gmail SMTPS (Port 465)
  if (req.method === 'POST' && pathname === '/api/send-otp') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const { to, subject, html } = data;
        if (!to || !html) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Email tujuan dan konten wajib diisi' }));
          return;
        }

        const host = envVars.VITE_SMTP_HOST || envVars.SMTP_HOST || 'smtp.gmail.com';
        const port = envVars.VITE_SMTP_PORT || envVars.SMTP_PORT || 465;
        const user = envVars.VITE_SMTP_USER || envVars.SMTP_USER || '';
        const pass = envVars.VITE_SMTP_PASS || envVars.SMTP_PASS || '';
        const fromName = envVars.VITE_SMTP_FROM_NAME || envVars.SMTP_FROM_NAME || 'SMART ADAM System';

        const result = await sendGmailSmtpNode({ host, port, user, pass, to, subject, html, fromName });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: result.message }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Keamanan: cegah directory traversal
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(distDir, safePath);

  // Jika folder dist belum di-build
  if (!fs.existsSync(distDir)) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <div style="font-family:sans-serif;padding:40px;text-align:center;background:#0f172a;color:#f8fafc;min-height:100vh;">
        <h2 style="color:#60a5fa;">SMART ADAM Production Server Aktif</h2>
        <p>Folder <code>dist/</code> belum ditemukan di STB.</p>
        <p>Silakan jalankan <code>npm run build</code> di folder Frontend, lalu unggah folder <code>dist</code> ke STB.</p>
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

      // Cache control: asset dengan hash di-cache 1 tahun, index.html tidak di-cache
      const isHashedAsset = targetFile.includes('assets');
      const cacheControl = isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      });

      const readStream = fs.createReadStream(targetFile);
      readStream.pipe(res);
      return;
    }

    // SPA Fallback: Jika rute bukan file (seperti /dashboard, /login, /logs, dsb), sajikan index.html
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
    res.end('404 Not Found - SMART ADAM');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`SMART ADAM Web Production Server Aktif`);
  console.log(`URL Lokal:     http://${HOST}:${PORT}`);
  console.log(`Domain Publik: https://smartadam.jinwoostream.lol`);
  console.log(`Folder Dist:   ${distDir}`);
  console.log(`Siap melayani request dari Nginx & Cloudflare Tunnel`);
  console.log(`=======================================================`);
});
