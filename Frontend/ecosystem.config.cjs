/**
 * ==========================================================================
 * SMART ADAM - PM2 ECOSYSTEM CONFIGURATION (CommonJS - ecosystem.config.cjs)
 * Dibuat khusus untuk STB (Armbian / Linux) + Cloudflare Tunnel
 * Domain: https://smartadam.jinwoostream.lol
 * Port: 5193
 * ==========================================================================
 */

const path = require('path');

const ecosystemConfig = {
  apps: [
    {
      name: "smartadam-frontend",
      script: "./server.cjs",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 5193,
        HOST: "0.0.0.0",
      },
    },
  ],
};

// ==========================================================================
// AUTO-LAUNCH PM2 KETIKA DIJALANKAN DENGAN: node ecosystem.config.cjs
// ==========================================================================
if (require.main === module) {
  const { execSync } = require('child_process');
  console.log('\n[SMART ADAM] ==============================================');
  console.log('[SMART ADAM] Menjalankan layanan SMART ADAM di PM2...');
  console.log('[SMART ADAM] Domain: https://smartadam.jinwoostream.lol');
  console.log('[SMART ADAM] Port:   5193 (0.0.0.0)');
  console.log('[SMART ADAM] ==============================================\n');

  try {
    try {
      execSync('pm2 start ecosystem.config.cjs', { stdio: 'inherit', cwd: __dirname });
    } catch {
      execSync('npx pm2 start ecosystem.config.cjs', { stdio: 'inherit', cwd: __dirname });
    }

    console.log('\n[SMART ADAM] Berhasil aktif di PM2!');
    console.log('[SMART ADAM] Cek status: pm2 status');
    console.log('[SMART ADAM] Cek log:    pm2 logs smartadam-frontend\n');
  } catch (err) {
    console.error('\n[SMART ADAM] Terjadi error saat mengeksekusi PM2:', err.message);
  }
}

module.exports = ecosystemConfig;
