# Bot Telegram Catatan Pengeluaran (v2 - Apps Script)

## Kenapa versi ini lebih mudah?
- TANPA Google Cloud Console
- TANPA kartu kredit
- TANPA service account / file JSON
- Semua langsung dari dalam Google Sheets

## Setup (6 langkah)

### 1. Buat Bot Telegram
- Buka Telegram, cari @BotFather → ketik /newbot
- Ikuti instruksi, salin BOT_TOKEN

### 2. Siapkan Google Sheet
- Upload file CatatanPengeluaran_BotWA.xlsx ke Google Drive
- Buka dengan Google Sheets (klik kanan → Open with → Google Sheets)
- Pastikan ada tab bernama "📋 Data Harian"

### 3. Pasang Apps Script
- Di Google Sheet: menu Extensions → Apps Script
- Hapus kode default, paste isi file Code.gs
- Save (ikon disket / Ctrl+S)

### 4. Deploy Apps Script jadi Web App
- Klik tombol "Deploy" (kanan atas) → New deployment
- Pilih tipe: Web app (klik ikon gerigi → Web app)
- Execute as: Me
- Who has access: Anyone
- Klik Deploy → Authorize access (login Google lo)
- SALIN URL Web App yang muncul (diakhiri /exec)

### 5. Isi .env & install
- Rename .env.example jadi .env
- Isi BOT_TOKEN dan APPS_SCRIPT_URL
- Buka Terminal di folder bot, jalankan:
  npm install

### 6. Test & Deploy
- Test lokal: node bot.js → kirim /start ke bot di Telegram
- Deploy 24/7 ke Railway.app atau Render.com (gratis)

## Perintah Bot
| Perintah | Fungsi |
|---|---|
| /keluar 25000 makan siang | Catat pengeluaran |
| /laporan harian | Laporan hari ini |
| /laporan mingguan | Laporan minggu ini |
| /laporan bulanan | Laporan bulan ini |
| /budget | Cek sisa budget + progress bar |
| /hapus | Hapus transaksi terakhir |
| /help | Semua perintah |

## Notifikasi Otomatis
- 80% budget → peringatan
- 90% budget → peringatan urgent
- 100%+ → alert OVER BUDGET
