// ==========================================================================
// SMART ADAM - Responsive Luxury HTML Email Template for Gmail SMTP
// ==========================================================================

export function generateOtpEmailHtml(
  recipientName: string,
  otpCode: string,
  purpose: 'REGISTER' | 'FORGOT_PASSWORD',
  senderEmail: string = 'SMART ADAM System'
): string {
  const isRegister = purpose === 'REGISTER';
  const title = isRegister ? 'Verifikasi Pendaftaran Akun' : 'Reset Kata Sandi Akun';
  const description = isRegister
    ? 'Terima kasih telah bergabung di sistem SMART ADAM (Autonomous Dustbin And Management). Gunakan kode verifikasi OTP di bawah ini untuk mengaktifkan akun Anda:'
    : 'Kami menerima permintaan untuk mengatur ulang kata sandi akun SMART ADAM Anda. Masukkan kode OTP di bawah ini untuk melanjutkan pembuatan kata sandi baru:';

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - SMART ADAM</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #090d16;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
    }
    .wrapper {
      width: 100% !important;
      max-width: 580px;
      margin: 0 auto;
      padding: 24px 16px;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      padding: 32px 24px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    }
    .header {
      text-align: center;
      padding-bottom: 24px;
      border-bottom: 1px solid #1f2937;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      color: #10b981;
      letter-spacing: 0.04em;
      margin: 0 0 6px 0;
    }
    .brand-sub {
      font-size: 13px;
      color: #94a3b8;
      margin: 0;
    }
    .content {
      padding: 28px 0;
      text-align: center;
    }
    .greeting {
      font-size: 16px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 12px;
    }
    .text {
      font-size: 14px;
      line-height: 1.6;
      color: #cbd5e1;
      margin: 0 0 24px 0;
    }
    .otp-box {
      background: #0f172a;
      border: 2px dashed #10b981;
      border-radius: 12px;
      padding: 18px 24px;
      display: inline-block;
      margin: 10px auto 20px auto;
    }
    .otp-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 10px;
      color: #34d399;
      margin: 0;
      padding-left: 10px;
    }
    .notice {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 14px;
    }
    .footer {
      border-top: 1px solid #1f2937;
      padding-top: 20px;
      text-align: center;
      font-size: 11px;
      color: #64748b;
      line-height: 1.5;
    }
    /* Strict Mobile Responsiveness: 1 Component per row */
    @media only screen and (max-width: 600px) {
      .card {
        padding: 20px 14px !important;
      }
      .otp-code {
        font-size: 28px !important;
        letter-spacing: 6px !important;
      }
      .brand-title {
        font-size: 18px !important;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1 class="brand-title">SMART ADAM</h1>
        <p class="brand-sub">Autonomous Dustbin And Management &bull; IoT 24E</p>
      </div>
      <div class="content">
        <div class="greeting">Halo, ${recipientName || 'Pengguna ADAM'}!</div>
        <p class="text">${description}</p>
        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
        </div>
        <p class="notice">
          Kode OTP ini hanya berlaku selama <strong>5 menit</strong>.<br>
          Jangan bagikan kode ini kepada siapa pun untuk keamanan sistem.
        </p>
      </div>
      <div class="footer">
        Proyek UAS Internet of Things (IoT) &bull; Kelompok 1 Kelas 24E<br>
        Email Otomatis dari ${senderEmail}
      </div>
    </div>
  </div>
</body>
</html>

  `.trim();
}
