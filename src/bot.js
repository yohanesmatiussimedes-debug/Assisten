const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const { getAIResponse } = require('./gemini');
const { detectIntent, quickResponses } = require('./utils/responses');

require('dotenv').config();

// ==================== KONFIGURASI ====================
const BOT_NUMBER = process.env.BOT_NUMBER || '6289602717697';

// In-memory storage
const processedMessages = new Set();
const chatContexts = new Map();

// ==================== MAIN BOT ====================
async function startBot() {
  console.log('🚀 Memulai WhatsApp Bot...');
  console.log('📱 Nomor Bot:', BOT_NUMBER);

  // Auth state
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  // Fetch latest version
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📦 Baileys v${version.join('.')}, Latest: ${isLatest}`);

  // Buat socket dengan config yang benar untuk pairing code
  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: state,
    // Browser harus Chrome Desktop agar pairing code work
    browser: ['Chrome (Linux)', '', ''],
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    shouldSyncHistoryMessage: () => false,
    syncFullHistory: false,
    maxMsgRetryCount: 5,
    msgRetryCounterMap: {},
    fireInitQueries: true,
    // Penting untuk pairing code
    linkPreviewImageThumbnailWidth: 192,
    transactionOpts: { 
      maxCommitRetries: 10, 
      delayBetweenTriesMs: 3000 
    },
    generateHighQualityLinkPreview: true,
    auth: {
      creds: state.creds,
      keys: state.keys,
    }
  });

  // ==================== PAIRING CODE ====================
  if (!sock.authState.creds.registered) {
    console.log('\n📲 MENGHUBUNGKAN DENGAN PAIRING CODE...');
    console.log('⏳ Mohon tunggu sebentar...\n');

    // Format nomor: hapus semua non-digit
    const phoneNumber = BOT_NUMBER.replace(/\D/g, '');
    
    console.log('📱 Nomor yang digunakan:', phoneNumber);
    
    try {
      // Delay sebelum request pairing code (penting!)
      await delay(2000);
      
      // Request pairing code dengan retry
      let code = null;
      let retries = 3;
      
      while (!code && retries > 0) {
        try {
          console.log(`🔄 Request pairing code (attempt ${4 - retries}/3)...`);
          code = await sock.requestPairingCode(phoneNumber);
          break;
        } catch (err) {
          retries--;
          console.log(`⚠️ Gagal, retry... (${retries} attempts left)`);
          await delay(3000);
        }
      }

      if (!code) {
        throw new Error('Gagal generate pairing code setelah 3 kali percobaan');
      }
      
      // Format kode dengan spasi biar mudah dibaca
      const formattedCode = code.match(/.{1,4}/g).join('-');
      
      console.log('\n╔═══════════════════════════════════════════╗');
      console.log('║                                           ║');
      console.log('║     🔑 PAIRING CODE ANDA:                 ║');
      console.log('║                                           ║');
      console.log(`║        ${formattedCode}                   ║`);
      console.log('║                                           ║');
      console.log('║     📱 CARA MENGGUNAKAN:                  ║');
      console.log('║     1. Buka WhatsApp di HP kamu           ║');
      console.log('║     2. Klik titik tiga (⋮) di pojok kanan ║');
      console.log('║     3. Pilih "Perangkat Tertaut"          ║');
      console.log('║     4. Klik "Tautkan Perangkat"           ║');
      console.log('║     5. Pilih "Tautkan dengan nomor"       ║');
      console.log('║     6. Masukkan kode di atas              ║');
      console.log('║                                           ║');
      console.log('║     ⏳ Kode berlaku 2 menit               ║');
      console.log('╚═══════════════════════════════════════════╝\n');

    } catch (err) {
      console.error('\n❌ Gagal generate pairing code:', err.message);
      console.log('\n💡 SOLUSI ALTERNATIF:');
      console.log('   1. Hapus folder auth_info/');
      console.log('   2. Pastikan nomor belum terdaftar di Baileys lain');
      console.log('   3. Pastikan nomor aktif di WhatsApp');
      console.log('   4. Restart bot dan coba lagi');
      console.log('   5. Jika masih gagal, gunakan QR Code lokal dulu\n');
      process.exit(1);
    }
  }

  // ==================== EVENT HANDLERS ====================

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log('❌ Koneksi terputus:', lastDisconnect?.error?.message);

      if (shouldReconnect) {
        console.log('🔄 Mencoba reconnect dalam 5 detik...');
        setTimeout(startBot, 5000);
      } else {
        console.log('🚪 Logged out. Hapus folder auth_info dan restart bot.');
        process.exit(0);
      }
    } 
    else if (connection === 'open') {
      console.log('\n✅✅✅ BOT TERHUBUNG! ✅✅✅');
      console.log(`🤖 Bot siap melayani!`);
      console.log(`📱 Nomor aktif: ${BOT_NUMBER}`);
      console.log(`⏰ Waktu: ${new Date().toLocaleString()}`);
      console.log('═══════════════════════════════════════════\n');
    }
    else if (connection === 'connecting') {
      console.log('⏳ Menghubungkan ke WhatsApp...');
    }
  });

  // ==================== MESSAGE HANDLER ====================
  sock.ev.on('messages.upsert', async (m) => {
    const message = m.messages[0];
    
    if (!message.message || message.key.fromMe || message.key.remoteJid === 'status@broadcast') {
      return;
    }

    const sender = message.key.remoteJid;
    const senderName = message.pushName || 'Seseorang';
    const messageId = message.key.id;
    
    if (processedMessages.has(messageId)) return;
    processedMessages.add(messageId);
    
    if (processedMessages.size > 1000) {
      processedMessages.clear();
    }

    const text = extractText(message);
    if (!text) {
      console.log(`📎 Pesan non-text dari ${senderName}, diabaikan.`);
      return;
    }

    console.log(`\n📩 [${new Date().toLocaleTimeString()}]`);
    console.log(`   Dari: ${senderName} (${sender})`);
    console.log(`   Pesan: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

    try {
      const isGroup = sender.endsWith('@g.us');
      
      if (isGroup) {
        const isMentioned = text.includes(`@${BOT_NUMBER}`) || 
                          text.toLowerCase().includes('bot') ||
                          text.toLowerCase().includes('asisten');
        
        if (!isMentioned) {
          console.log('   ℹ️ Pesan grup tanpa mention, diabaikan.');
          return;
        }
      }

      await sock.sendPresenceUpdate('composing', sender);

      const delay = Math.floor(Math.random() * 2000) + 1000;
      await new Promise(resolve => setTimeout(resolve, delay));

      let response;
      const intent = detectIntent(text);

      if (intent === 'identity' || intent === 'goodbye') {
        response = quickResponses[intent];
      } else {
        response = await getAIResponse(text, senderName, sender);
      }

      await sock.sendMessage(sender, { text: response });

      console.log(`🤖 Balasan: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);

      await sock.sendPresenceUpdate('available', sender);

    } catch (error) {
      console.error('❌ Error memproses pesan:', error);
      
      try {
        await sock.sendMessage(sender, { text: quickResponses.error });
      } catch (sendError) {
        console.error('❌ Gagal kirim pesan error:', sendError);
      }
    }
  });

  sock.ev.on('message.delete', (item) => {
    console.log('🗑️ Pesan dihapus:', item);
  });
}

// ==================== HELPERS ====================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractText(message) {
  const msg = message.message;
  
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;
  
  return null;
}

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGINT', () => {
  console.log('\n👋 Bot dimatikan. Sampai jumpa!');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Bot dimatikan (SIGTERM). Sampai jumpa!');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// ==================== START ====================
startBot().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
