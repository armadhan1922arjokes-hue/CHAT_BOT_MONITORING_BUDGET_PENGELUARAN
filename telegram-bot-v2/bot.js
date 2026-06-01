// ============================================================
// TELEGRAM BOT - CATATAN PENGELUARAN HARIAN (versi Apps Script)
// Tanpa Google Cloud, tanpa kartu kredit, tanpa file JSON
// Stack: Node.js + node-telegram-bot-api + Google Apps Script
// ============================================================

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN       = process.env.BOT_TOKEN;          // dari @BotFather
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;    // URL web app Apps Script
const BUDGET          = parseInt(process.env.BUDGET_BULANAN) || 2000000;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── Panggil Apps Script ──────────────────────────────────────
async function callScript(payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  return res.json();
}

async function appendRow(data) {
  return callScript({ action: 'add', ...data });
}

async function getAllRows() {
  const r = await callScript({ action: 'getAll' });
  return (r && r.rows) ? r.rows : [];
}

// ── Helpers ──────────────────────────────────────────────────
const fmt = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

function parseKategori(text) {
  text = text.toLowerCase();
  if (/makan|minum|kopi|nasi|warteg|Sarapan|bubur|Roti Tawar|Selai Kacang|soto|Rendang|Makan Malam|jajan|snack/.test(text)) return 'Makan & Minum';
  if (/ojek|gojek|grab|bensin|motor|busway|krl|mrt|angkot/.test(text))  return 'Transportasi';
  if (/belanja|supermarket|indomaret|alfamart|sembako/.test(text))       return 'Belanja';
  if (/obat|dokter|rs|apotek|vitamin|klinik/.test(text))                 return 'Kesehatan';
  if (/nonton|bioskop|game|hiburan/.test(text))                          return 'Hiburan';
  if (/pulsa|token|listrik|air|wifi|tagihan|bayar/.test(text))           return 'Tagihan';
  return 'Lainnya';
}

const getToday = () =>
  new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });

function getWeekNum() {
  const d = new Date(), start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
}

const BULAN_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const getBulanTahun = () => {
  const d = new Date();
  return BULAN_EN[d.getMonth()] + ' ' + d.getFullYear();
};

function sumRows(rows, filterFn) {
  return rows
    .filter(filterFn)
    .reduce((acc, row) => acc + (parseFloat(String(row[5]).replace(/[^0-9.-]/g, '')) || 0), 0);
}

async function cekBudgetNotif(chatId, totalBulan) {
  const pct = totalBulan / BUDGET;
  if (pct >= 1.0) {
    await bot.sendMessage(chatId,
      `🔴 *OVER BUDGET!*\n\nPengeluaran bulan ini sudah *${fmt(totalBulan)}* — melewati batas ${fmt(BUDGET)}!\n\nSegerakan evaluasi pengeluaran lo, bro! 🙏`,
      { parse_mode: 'Markdown' });
  } else if (pct >= 0.9) {
    await bot.sendMessage(chatId,
      `🟡 *Hampir Habis!* Budget sudah *${Math.round(pct * 100)}%* terpakai.\nSisa: *${fmt(BUDGET - totalBulan)}*`,
      { parse_mode: 'Markdown' });
  } else if (pct >= 0.8) {
    await bot.sendMessage(chatId,
      `⚠️ Perhatian: Budget sudah *${Math.round(pct * 100)}%* terpakai.\nSisa: *${fmt(BUDGET - totalBulan)}*`,
      { parse_mode: 'Markdown' });
  }
}

// ══════════════════════════════════════════════════════════════
// HANDLER PERINTAH
// ══════════════════════════════════════════════════════════════

bot.onText(/\/start/, async (msg) => {
  const name = msg.from.first_name || 'bro';
  await bot.sendMessage(msg.chat.id,
    `👋 Halo *${name}*! Gua Bot Catatan Pengeluaran lo.\n\n` +
    `Cara pake:\n` +
    `*/keluar 25000 makan siang warteg* — catat pengeluaran\n` +
    `*/laporan harian* — laporan hari ini\n` +
    `*/laporan mingguan* — laporan minggu ini\n` +
    `*/laporan bulanan* — laporan bulan ini\n` +
    `*/budget* — cek sisa budget\n` +
    `*/help* — semua perintah\n\n` +
    `Budget bulanan lo: *${fmt(BUDGET)}* 💰`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/keluar (.+)/, async (msg, match) => {
  const chatId  = msg.chat.id;
  const parts   = match[1].trim().split(/\s+/);
  const nominal = parseInt(parts[0]);

  if (isNaN(nominal) || nominal <= 0) {
    return bot.sendMessage(chatId, '❌ Format salah.\nContoh: */keluar 25000 makan warteg*', { parse_mode: 'Markdown' });
  }

  const desc   = parts.slice(1).join(' ') || 'Pengeluaran';
  const kat    = parseKategori(desc);
  const jam    = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const bulan  = getBulanTahun();
  const minggu = getWeekNum();

  await appendRow({
    tanggal: getToday(), jam, kategori: kat,
    deskripsi: desc, nominal, minggu, bulan,
  });

  const rows = await getAllRows();
  const totalBulan = sumRows(rows, (r) => r[7] === bulan);
  const sisa = BUDGET - totalBulan;

  await bot.sendMessage(chatId,
    `✅ *Tersimpan!*\n\n` +
    `📝 ${desc}\n🏷️ Kategori: *${kat}*\n💸 Nominal: *${fmt(nominal)}*\n🕐 ${getToday()} ${jam}\n\n` +
    `📊 Total bulan ini: *${fmt(totalBulan)}* / ${fmt(BUDGET)}\n💰 Sisa budget: *${fmt(Math.max(0, sisa))}*`,
    { parse_mode: 'Markdown' });

  await cekBudgetNotif(chatId, totalBulan);
});

bot.onText(/\/laporan harian/, async (msg) => {
  const rows = await getAllRows();
  const today = getToday();
  const txHari = rows.filter((r) => r[1] === today);
  if (!txHari.length) return bot.sendMessage(msg.chat.id, '📋 Belum ada pengeluaran hari ini.');

  const total = sumRows(txHari, () => true);
  const lines = txHari.map((r) => `• ${r[2]} | ${r[3]}: ${r[4]} = *${fmt(r[5])}*`).join('\n');
  await bot.sendMessage(msg.chat.id,
    `📋 *Laporan Harian — ${today}*\n\n${lines}\n\n*Total: ${fmt(total)}* (${txHari.length} transaksi)`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/laporan mingguan/, async (msg) => {
  const rows = await getAllRows();
  const minggu = getWeekNum();
  const txMinggu = rows.filter((r) => parseInt(r[6]) === minggu);
  const total = sumRows(txMinggu, () => true);

  const perKat = {};
  txMinggu.forEach((r) => { perKat[r[3]] = (perKat[r[3]] || 0) + parseFloat(r[5]); });
  const katLines = Object.entries(perKat).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `• ${k}: *${fmt(v)}*`).join('\n');

  await bot.sendMessage(msg.chat.id,
    `📅 *Laporan Mingguan — Minggu ke-${minggu}*\n\n${katLines || 'Belum ada data'}\n\n*Total: ${fmt(total)}* (${txMinggu.length} transaksi)`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/laporan bulanan/, async (msg) => {
  const rows = await getAllRows();
  const bulan = getBulanTahun();
  const txBln = rows.filter((r) => r[7] === bulan);
  const total = sumRows(txBln, () => true);
  const pct = Math.round((total / BUDGET) * 100);
  const sisa = BUDGET - total;

  const perKat = {};
  txBln.forEach((r) => { perKat[r[3]] = (perKat[r[3]] || 0) + parseFloat(r[5]); });
  const katLines = Object.entries(perKat).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `• ${k}: *${fmt(v)}*`).join('\n');

  const emoji = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢';
  await bot.sendMessage(msg.chat.id,
    `📊 *Laporan Bulanan — ${bulan}*\n\n${katLines || 'Belum ada data'}\n\n` +
    `─────────────────\n💸 Total: *${fmt(total)}*\n🎯 Budget: *${fmt(BUDGET)}*\n${emoji} Terpakai: *${pct}%*\n💰 Sisa: *${fmt(Math.max(0, sisa))}*`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/budget/, async (msg) => {
  const rows = await getAllRows();
  const bulan = getBulanTahun();
  const total = sumRows(rows, (r) => r[7] === bulan);
  const pct = Math.round((total / BUDGET) * 100);
  const sisa = BUDGET - total;
  const bar = '█'.repeat(Math.min(10, Math.round(pct / 10))) + '░'.repeat(Math.max(0, 10 - Math.round(pct / 10)));
  const status = pct >= 100 ? '🔴 OVER BUDGET' : pct >= 80 ? '🟡 Perhatian' : '🟢 Aman';

  await bot.sendMessage(msg.chat.id,
    `💰 *Status Budget ${bulan}*\n\n[${bar}] ${pct}%\n\nTerpakai: *${fmt(total)}*\nBudget: *${fmt(BUDGET)}*\nSisa: *${fmt(Math.max(0, sisa))}*\n\nStatus: ${status}`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/hapus/, async (msg) => {
  const r = await callScript({ action: 'deleteLast' });
  if (!r.ok) return bot.sendMessage(msg.chat.id, '❌ Tidak ada transaksi untuk dihapus.');
  const d = r.deleted;
  await bot.sendMessage(msg.chat.id,
    `🗑️ Transaksi terakhir dihapus:\n*${d[4]}* — ${fmt(d[5])}`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `📱 *Daftar Perintah Bot*\n\n` +
    `*/keluar [nominal] [deskripsi]* — catat pengeluaran\n  Contoh: \`/keluar 25000 makan siang\`\n\n` +
    `*/laporan harian* — laporan hari ini\n*/laporan mingguan* — laporan minggu ini\n*/laporan bulanan* — laporan bulan ini\n` +
    `*/budget* — cek sisa budget + progress bar\n*/hapus* — hapus transaksi terakhir\n\n` +
    `─────────────────\n📌 *Notifikasi otomatis:*\n• ⚠️ 80% budget terpakai\n• 🟡 90% budget terpakai\n• 🔴 100% — OVER BUDGET!\n\nBudget bulanan: *${fmt(BUDGET)}*`,
    { parse_mode: 'Markdown' });
});

console.log('🤖 Bot Telegram Pengeluaran aktif (mode Apps Script)!');
