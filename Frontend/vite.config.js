import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { sendGmailSmtp } from './smtpDispatcher.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const otpApiPlugin = {
    name: 'smart-adam-otp-api',
    configureServer(server) {
      server.middlewares.use('/api/send-otp', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: false, error: 'Method not allowed' }))
          return
        }

        let body = ''
        req.on('data', chunk => {
          body += chunk
        })

        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}')
            const { to, subject, html } = data

            if (!to || !html) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Email tujuan dan konten wajib diisi' }))
              return
            }

            const host = env.VITE_SMTP_HOST || env.SMTP_HOST || 'smtp.gmail.com'
            const port = env.VITE_SMTP_PORT || env.SMTP_PORT || 465
            const user = env.VITE_SMTP_USER || env.SMTP_USER || ''
            const pass = env.VITE_SMTP_PASS || env.SMTP_PASS || ''
            const fromName = env.VITE_SMTP_FROM_NAME || env.SMTP_FROM_NAME || 'SMART ADAM System'

            console.log(`[Vite Server] Mengirimkan email OTP ke ${to} via Gmail SMTP (${user})...`)
            const result = await sendGmailSmtp({
              host,
              port,
              user,
              pass,
              to,
              subject: subject || '[SMART ADAM] Kode Verifikasi OTP Anda',
              html,
              fromName,
            })

            console.log(`[Vite Server] Berhasil kirim OTP ke ${to}!`)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, message: result.message }))
          } catch (err) {
            console.error('[Vite Server] Gagal kirim email OTP:', err.message)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
        })
      })
    },
  }

  return {
    plugins: [react(), otpApiPlugin],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_', 'SUPABASE_'],
    server: {
      port: 5193,
      host: true,
    },
  }
})

