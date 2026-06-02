// ============================================================
// TELEGRAM BOT - CATATAN PENGELUARAN HARIAN (versi Apps Script)
// Tanpa Google Cloud, tanpa kartu kredit, tanpa file JSON
// Stack: Node.js + node-telegram-bot-api + Google Apps Script
// ============================================================

require('dotenv').config();
const PDFDocument = require('pdfkit');
const cron        = require('node-cron');
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
  if (/makan|minum|kopi|nasi|warteg|sarapan|bubur|roti tawar|selai kacang|soto|rendang|makan malam|jajan|snack/i.test(text)) return 'Makan & Minum';
  if (/ojek|gojek|grab|bensin|motor|busway|krl|mrt|angkot/.test(text))  return 'Transportasi';
  if (/belanja|supermarket|indomaret|alfamart|sembako/.test(text))       return 'Belanja';
  if (/obat|dokter|rs|apotek|vitamin|klinik/.test(text))                 return 'Kesehatan';
  if (/nonton|bioskop|game|hiburan/.test(text))                          return 'Hiburan';
  if (/pulsa|token|listrik|air|wifi|tagihan|bayar/.test(text))           return 'Tagihan';
  return 'Lainnya';
}

const getToday = () =>
  new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' });

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

// ===== WEB SERVER buat Render + keep-alive =====
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot pengeluaran aktif! 🤖');
}).listen(PORT, () => {
  console.log('🌐 Web server jalan di port ' + PORT + ' (buat keep-alive)');
});


//TAMABAHAKN KODE UNTUK KIRIM LAPORAN PADA SAAT AKHIR BULAN NANTI.


const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const CHART_COLORS  = ['#2E7D32', '#1565C0', '#E65100', '#6A1B9A', '#AD1457', '#00838F', '#5D4037'];

// Format singkat (Rp 74rb, Rp 1,9jt) untuk kartu & tengah donut
function fmtShort(n) {
  if (n >= 1000000) return 'Rp ' + (n / 1000000).toFixed(1).replace('.0', '').replace('.', ',') + 'jt';
  if (n >= 1000)    return 'Rp ' + Math.round(n / 1000) + 'rb';
  return 'Rp ' + Math.round(n);
}

// ── Generate PDF infografis (digambar manual pakai pdfkit) ──────
async function generatePDF(rows, bulan) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const W = 595;
    const total = rows.reduce((s, r) => s + (parseFloat(r[5]) || 0), 0);
    const pct   = total > 0 ? Math.round((total / BUDGET) * 100) : 0;
    const sisa  = Math.max(0, BUDGET - total);

    // ===== HEADER BAND =====
    doc.rect(0, 0, W, 95).fill('#1B5E20');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('Laporan Pengeluaran', 50, 30);
    doc.fillColor('#A5D6A7').font('Helvetica').fontSize(13).text(bulan, 50, 60);

    // ===== KARTU RINGKASAN =====
    const cardY = 125, cardH = 70, cardW = 116, gap = 10;
    const cards = [
      { l: 'Total Keluar', v: fmtShort(total), c: '#E53935' },
      { l: 'Budget',       v: fmtShort(BUDGET), c: '#1B5E20' },
      { l: 'Sisa Budget',  v: fmtShort(sisa),  c: pct >= 100 ? '#E53935' : '#2E7D32' },
      { l: 'Transaksi',    v: rows.length + 'x', c: '#1565C0' },
    ];
    cards.forEach((card, i) => {
      const x = 50 + i * (cardW + gap);
      doc.roundedRect(x, cardY, cardW, cardH, 8).fill('#F5F5F5');
      doc.fillColor('#757575').font('Helvetica').fontSize(8.5).text(card.l, x + 10, cardY + 13, { width: cardW - 20 });
      doc.fillColor(card.c).font('Helvetica-Bold').fontSize(17).text(card.v, x + 10, cardY + 33, { width: cardW - 20 });
    });

    // ===== PROGRESS BAR BUDGET =====
    const secY = 230;
    doc.fillColor('#212121').font('Helvetica-Bold').fontSize(13).text('Penggunaan Budget Bulan Ini', 50, secY);
    const tX = 50, tY = secY + 26, tW = 495, tH = 24;
    doc.roundedRect(tX, tY, tW, tH, 6).fill('#E0E0E0');
    const fillW = Math.max(6, tW * Math.min(1, total / BUDGET));
    const barColor = pct >= 100 ? '#C62828' : pct >= 80 ? '#F9A825' : '#2E7D32';
    doc.roundedRect(tX, tY, fillW, tH, 6).fill(barColor);
    if (fillW > 50) {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(pct + '%', tX + 10, tY + 7);
    } else {
      doc.fillColor('#424242').font('Helvetica-Bold').fontSize(11).text(pct + '%', tX + fillW + 6, tY + 7);
    }
    doc.fillColor('#9E9E9E').font('Helvetica').fontSize(9).text('Rp 0', tX, tY + tH + 6);
    doc.fillColor('#9E9E9E').font('Helvetica').fontSize(9).text(fmt(BUDGET), tX, tY + tH + 6, { width: tW, align: 'right' });

    // ===== DONUT CHART PER KATEGORI =====
    const perKat = {};
    rows.forEach(r => { perKat[r[3]] = (perKat[r[3]] || 0) + (parseFloat(r[5]) || 0); });
    const cats = Object.keys(perKat).sort((a, b) => perKat[b] - perKat[a]);

    const catSecY = 330;
    doc.fillColor('#212121').font('Helvetica-Bold').fontSize(13).text('Pengeluaran per Kategori', 50, catSecY);

    const cx = 160, cy = catSecY + 120, r = 78;
    if (total > 0) {
      let ang = -Math.PI / 2;
      cats.forEach((cat, i) => {
        const frac  = perKat[cat] / total;
        const color = CHART_COLORS[i % CHART_COLORS.length];
        if (frac >= 0.9999) {
          doc.circle(cx, cy, r).fill(color);
        } else {
          const a2 = ang + frac * 2 * Math.PI;
          const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
          const x2 = cx + r * Math.cos(a2),  y2 = cy + r * Math.sin(a2);
          const large = (a2 - ang) > Math.PI ? 1 : 0;
          doc.path(`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`).fill(color);
          ang = a2;
        }
      });
    }
    // lubang donut + label tengah
    doc.circle(cx, cy, r * 0.6).fill('#FFFFFF');
    doc.fillColor('#9E9E9E').font('Helvetica').fontSize(8).text('TOTAL', cx - 45, cy - 16, { width: 90, align: 'center' });
    doc.fillColor('#212121').font('Helvetica-Bold').fontSize(14).text(fmtShort(total), cx - 45, cy - 4, { width: 90, align: 'center' });

    // legend di kanan donut
    const legX = 300;
    let legY = catSecY + 45;
    cats.forEach((cat, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length];
      const p = total > 0 ? Math.round((perKat[cat] / total) * 100) : 0;
      doc.roundedRect(legX, legY + 2, 12, 12, 2).fill(color);
      doc.fillColor('#616161').font('Helvetica').fontSize(10).text(cat, legX + 20, legY, { width: 235 });
      doc.fillColor('#212121').font('Helvetica-Bold').fontSize(11).text(`${fmt(perKat[cat])}  ·  ${p}%`, legX + 20, legY + 13, { width: 235 });
      legY += 38;
    });

    // ===== FOOTER =====
    doc.fillColor('#BDBDBD').font('Helvetica').fontSize(8)
       .text(`Dibuat otomatis oleh Bot Pengeluaran · ${new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
             50, 800, { width: 495, align: 'center' });

    doc.end();
  });
}

// ── Generate + kirim laporan + arsipkan ─────────────────────────
async function jalankanLaporanBulanan(chatId) {
  await bot.sendMessage(chatId, '⏳ Sedang membuat laporan akhir bulan...');

  const result = await callScript({ action: 'getAll' });
  const rows   = (result && result.rows) ? result.rows : [];

  if (rows.length === 0) {
    await bot.sendMessage(chatId, '📋 Tidak ada data pengeluaran bulan ini. Sheet sudah bersih!');
    return;
  }

  const bulan = String(rows[0][7]) || getBulanTahun();
  const total = rows.reduce((s, r) => s + (parseFloat(r[5]) || 0), 0);
  const pct   = Math.round((total / BUDGET) * 100);

  const pdfBuffer = await generatePDF(rows, bulan);

  await bot.sendDocument(
    chatId,
    pdfBuffer,
    {
      caption:    `📊 *Laporan ${bulan}*\n\nTotal: *${fmt(total)}* (${pct}% dari budget)\n${rows.length} transaksi dicatat`,
      parse_mode: 'Markdown',
    },
    {
      filename:    `Laporan_${bulan.replace(/\s/g, '_')}.pdf`,
      contentType: 'application/pdf',
    }
  );

  const arsip = await callScript({ action: 'archiveAndReset' });

  await bot.sendMessage(
    chatId,
    `✅ *Selesai!*\n\n` +
    `📁 ${arsip.msg}\n` +
    `🗑️ Data Harian sudah dikosongkan\n` +
    `💰 Budget bulan baru: *${fmt(BUDGET)}*\n\n` +
    `Siap mulai bulan depan! 💪`,
    { parse_mode: 'Markdown' }
  );
}

// ── Command /akhirbulan (trigger manual) ─────────────────────────
bot.onText(/\/akhirbulan/, async (msg) => {
  try {
    await jalankanLaporanBulanan(msg.chat.id);
  } catch (err) {
    console.error('Error /akhirbulan:', err.message);
    await bot.sendMessage(msg.chat.id, `❌ Terjadi error: ${err.message}`);
  }
});

// ── Command /myid (buat setup ADMIN_CHAT_ID) ─────────────────────
bot.onText(/\/myid/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `🆔 *Chat ID lo:* \`${msg.chat.id}\`\n\n` +
    `Tambahkan ke Render:\n*Variable:* \`ADMIN_CHAT_ID\`\n*Value:* \`${msg.chat.id}\``,
    { parse_mode: 'Markdown' }
  );
});

// ── Cron: otomatis tanggal 1 tiap bulan jam 00:00 WIB ───────────
if (ADMIN_CHAT_ID) {
  cron.schedule('0 0 1 * *', async () => {
    console.log('📅 Cron laporan bulanan berjalan...');
    try { await jalankanLaporanBulanan(ADMIN_CHAT_ID); }
    catch (err) { console.error('Cron error:', err.message); }
  }, { timezone: 'Asia/Jakarta' });
  console.log('📅 Cron laporan bulanan aktif — jalan tiap tgl 1 jam 00:00 WIB');
} else {
  console.log('⚠️  ADMIN_CHAT_ID belum diset — cron otomatis nonaktif');
}
