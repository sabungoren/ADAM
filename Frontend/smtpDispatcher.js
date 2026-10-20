// ==========================================================================
// SMART ADAM - Zero-Dependency Native Node.js Gmail SMTP Dispatcher
// Menggunakan modul bawaan 'tls' Node.js untuk koneksi SMTPS (Port 465)
// ==========================================================================

import tls from 'tls';

export function sendGmailSmtp({ host, port, user, pass, to, subject, html, fromName }) {
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
    const socket = tls.connect(cleanPort, cleanHost, { rejectUnauthorized: true }, () => {
      // SMTPS handshake initiated
    });

    socket.setEncoding('utf8');

    const timeout = setTimeout(() => {
      try {
        socket.destroy();
      } catch {}
      reject(new Error('Koneksi SMTP ke smtp.gmail.com timeout (10 detik).'));
    }, 10000);

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Koneksi SMTP Error: ${err.message}`));
    });

    socket.on('close', () => {
      clearTimeout(timeout);
    });

    socket.on('data', (data) => {
      buffer += data;
      if (!buffer.endsWith('\r\n')) return;

      const lines = buffer.split('\r\n').filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';

      // Abaikan multi-line responses (seperti 250-...) sampai mendapat respon akhir (250 ...)
      if (/^\d{3}-/.test(lastLine)) return;

      const code = parseInt(lastLine.slice(0, 3), 10);
      buffer = ''; // Reset buffer

      if (code >= 400) {
        clearTimeout(timeout);
        try {
          socket.write('QUIT\r\n');
          socket.end();
        } catch {}
        return reject(new Error(`Gmail SMTP Ditolak (${code}): ${lastLine}`));
      }

      if (step === 0 && code === 220) {
        step = 1;
        socket.write('EHLO localhost\r\n');
      } else if (step === 1 && code === 250) {
        step = 2;
        socket.write('AUTH LOGIN\r\n');
      } else if (step === 2 && code === 334) {
        step = 3;
        socket.write(Buffer.from(cleanUser).toString('base64') + '\r\n');
      } else if (step === 3 && code === 334) {
        step = 4;
        socket.write(Buffer.from(cleanPass).toString('base64') + '\r\n');
      } else if (step === 4 && code === 235) {
        step = 5;
        socket.write(`MAIL FROM:<${cleanUser}>\r\n`);
      } else if (step === 5 && code === 250) {
        step = 6;
        socket.write(`RCPT TO:<${to}>\r\n`);
      } else if (step === 6 && code === 250) {
        step = 7;
        socket.write('DATA\r\n');
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
        resolve({ success: true, message: 'Email OTP berhasil dikirimkan ke kotak masuk via Gmail SMTP.' });
      }
    });
  });
}
