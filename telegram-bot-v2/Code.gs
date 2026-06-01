// ============================================================
// GOOGLE APPS SCRIPT - Backend Sheet untuk Bot Telegram
// Paste kode ini di: Google Sheet → Extensions → Apps Script
// GRATIS, tanpa Cloud Console, tanpa kartu kredit
// ============================================================

// ── KONFIGURASI ──────────────────────────────────────────────
const NAMA_TAB    = '📋 Data Harian';  // nama tab sheet (sesuai template)
const BARIS_MULAI = 5;                  // data mulai baris ke-5

// Ambil sheet (fallback ke sheet pertama kalau nama gak ketemu)
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(NAMA_TAB);
  if (!s) s = ss.getSheets()[0];
  return s;
}

// ── ENDPOINT UTAMA (dipanggil bot) ───────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    let hasil;
    switch (data.action) {
      case 'add':        hasil = tambah(data);     break;
      case 'getAll':     hasil = ambilSemua();      break;
      case 'deleteLast': hasil = hapusTerakhir();   break;
      default:           hasil = { ok: false, pesan: 'Action tidak dikenal' };
    }
    return out(hasil);
  } catch (err) {
    return out({ ok: false, pesan: String(err) });
  }
}

// Cek status (buka URL di browser untuk test)
function doGet() {
  return out({ ok: true, pesan: 'API bot pengeluaran aktif! 🚀' });
}

function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── TAMBAH PENGELUARAN ───────────────────────────────────────
function tambah(d) {
  const s = getSheet();
  const lastRow = s.getLastRow();
  const baris   = Math.max(lastRow, BARIS_MULAI - 1) + 1;
  const noUrut  = baris - BARIS_MULAI + 1;

  // Paksa kolom tanggal & jam jadi teks (biar gak diubah jadi format tanggal)
  s.getRange(baris, 2).setNumberFormat('@');
  s.getRange(baris, 3).setNumberFormat('@');

  s.getRange(baris, 1, 1, 8).setValues([[
    noUrut, d.tanggal, d.jam, d.kategori, d.deskripsi, d.nominal, d.minggu, d.bulan
  ]]);

  return { ok: true, noUrut: noUrut };
}

// ── AMBIL SEMUA DATA ─────────────────────────────────────────
function ambilSemua() {
  const s = getSheet();
  const lastRow = s.getLastRow();
  if (lastRow < BARIS_MULAI) return { ok: true, rows: [] };

  const rows = s.getRange(BARIS_MULAI, 1, lastRow - BARIS_MULAI + 1, 8).getValues();
  const bersih = rows.filter(r => r[5] !== '' && r[5] !== null && r[5] !== undefined);
  return { ok: true, rows: bersih };
}

// ── HAPUS TRANSAKSI TERAKHIR ─────────────────────────────────
function hapusTerakhir() {
  const s = getSheet();
  const lastRow = s.getLastRow();
  if (lastRow < BARIS_MULAI) return { ok: false, pesan: 'Tidak ada data' };

  const row = s.getRange(lastRow, 1, 1, 8).getValues()[0];
  s.getRange(lastRow, 1, 1, 8).clearContent();
  return { ok: true, deleted: row };
}
