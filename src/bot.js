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
const PAIRING_CODE = process.env.PAIRING_CODE === 'true'; // Aktifkan pairing code

// In-memory storage
const processedMessages = new Set();
const chatContexts = new Map();

// ==================== MAIN BOT ====================
async function startBot() {
  console.log('🚀 Memulai WhatsApp Bot...');
  console.log('📱 Nomor Bot:', BOT_NUMBER);
  console.log('🔑 Mode:', PAIRING_CODE ? 'PAIRING CODE' : 'QR CODE');

  // Auth state
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  // Fetch latest version
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📦 Baileys v${version.join('.')}, Latest: ${isLatest}`);

  // Buat socket
  const sock = makeWASocket({
    version,
    printQRInTerminal: false, // Matikan QR
    auth: state,
    browser: ['Chrome (Linux)', '', ''], // Browser agar pairing code work
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    // Pairing code config
    shouldSyncHistoryMessage: () => false,
    shouldIgnoreJid: () => false,
    linkPreviewImageThumbnailWidth: 192,
    transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    maxMsgRetryCount: 5,
    msgRetryCounterMap: {},
    fireInitQueries: true,
    auth: {
      creds: state.creds,
      keys: state.keys,
    }
  });

  // ==================== PAIRING CODE ====================
  if (PAIRING_CODE && !sock.authState.creds.registered) {
    console.log('\n📲 MENGHUBUNGKAN DENGAN PAIRING CODE...');
    console.log('⏳ Mohon tunggu sebentar...\n');

    const phoneNumber = BOT_NUMBER.replace(/\D/g, ''); // Hapus semua non-digit
    
    try {
      // Request pairing code
      const code = await sock.requestPairingCode(phoneNumber);
      
      console.log('═══════════════════════════════════════════');
      console.log('  🔑 PAIRING CODE ANDA:');
      console.log('');
      console.log(`       ${code}`);
      console.log('');
      console.log('  📱 CARA MENGGUNAKAN:');
      console.log('  1. Buka WhatsApp di HP kamu');
      console.log('  2. Menu → Perangkat Tertaut → Tautkan Perangkat');
      console.log('  3. Pilih "Tautkan dengan nomor telepon"');
      console.log('  4. Masukkan kode di atas');
      console.log('═══════════════════════════════════════════\n');

    } catch (err) {
      console.error('❌ Gagal generate pairing code:', err.message);
      console.log('💡 Tips: Pastikan nomor valid dan belum terdaftar di Baileys lain.');
      process.exit(1);
    }
  }

  // ==================== EVENT HANDLERS ====================

  // Save credentials
  sock.ev.on('creds.update', saveCreds);

  // Connection update
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log('❌ Koneksi terputus:', lastDisconnect?.error?.message);
      console.log('   Status Code:', statusCode);

      if (shouldReconnect) {
        console.log('🔄 Mencoba reconnect dalam 5 detik...');
        setTimeout(startBot, 5000);
      } else {
        console.log('🚪 Logged out.');
        console.log('💡 Solusi: Hapus folder auth_info dan restart bot.');
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
    
    // Skip jika pesan dari bot sendiri atau status broadcast
    if (!message.message || message.key.fromMe || message.key.remoteJid === 'status@broadcast') {
      return;
    }

    const sender = message.key.remoteJid;
    const senderName = message.pushName || 'Seseorang';
    const messageId = message.key.id;
    
    // Hindari pesan duplikat
    if (processedMessages.has(messageId)) return;
    processedMessages.add(messageId);
    
    // Bersihkan cache pesan
    if (processedMessages.size > 1000) {
      processedMessages.clear();
    }

    // Extract text
    const text = extractText(message);
    if (!text) {
      console.log(`📎 Pesan non-text dari ${senderName}, diabaikan.`);
      return;
    }

    console.log(`\n📩 [${new Date().toLocaleTimeString()}]`);
    console.log(`   Dari: ${senderName} (${sender})`);
    console.log(`   Pesan: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

    try {
      // Cek grup
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

      // Typing indicator
      await sock.sendPresenceUpdate('composing', sender);

      // Delay natural (1-3 detik)
      const delay = Math.floor(Math.random() * 2000) + 1000;
      await new Promise(resolve => setTimeout(resolve, delay));

      // Generate response
      let response;
      const intent = detectIntent(text);

      if (intent === 'identity' || intent === 'goodbye') {
        response = quickResponses[intent];
      } else {
        response = await getAIResponse(text, senderName, sender);
      }

      // Kirim balasan
      await sock.sendMessage(sender, { text: response });

      console.log(`🤖 Balasan: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);

      // Update presence
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

  // Log event lain
  sock.ev.on('message.delete', (item) => {
    console.log('🗑️ Pesan dihapus:', item);
  });
}

// ==================== HELPERS ====================

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
