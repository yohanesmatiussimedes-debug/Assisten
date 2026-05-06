const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { getAIResponse } = require('./gemini');
const { detectIntent, quickResponses } = require('./utils/responses');

require('dotenv').config();

// Konfigurasi
const BOT_NUMBER = process.env.BOT_NUMBER || '6289602717697';
const OWNER_JID = `${BOT_NUMBER}@s.whatsapp.net`;

// In-memory storage
const processedMessages = new Set(); // Hindari duplikat
const userStates = new Map(); // Track status user

async function startBot() {
  console.log('🚀 Memulai WhatsApp Bot...');
  console.log('📱 Nomor Bot:', BOT_NUMBER);

  // Auth state
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  // Fetch latest version
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📦 Baileys v${version.join('.')}, Latest: ${isLatest}`);

  // Buat socket
  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
    browser: ['WhatsApp AI Bot', 'Chrome', '1.0.0'],
    markOnlineOnConnect: true,
    // Retry logic
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
  });

  // Save credentials
  sock.ev.on('creds.update', saveCreds);

  // Connection update
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📲 Scan QR Code ini dengan WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('❌ Koneksi terputus:', lastDisconnect?.error?.message);
      
      if (shouldReconnect) {
        console.log('🔄 Mencoba reconnect...');
        setTimeout(startBot, 5000);
      } else {
        console.log('🚪 Logged out. Hapus folder auth_info dan scan ulang.');
      }
    } else if (connection === 'open') {
      console.log('✅ Bot terhubung!');
      console.log(`🤖 Bot siap melayani! Kirim pesan ke ${BOT_NUMBER}`);
    }
  });

  // Handle incoming messages
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
    
    // Bersihkan cache pesan (biar nggak bengkak)
    if (processedMessages.size > 1000) {
      processedMessages.clear();
    }

    // Extract text dari berbagai tipe pesan
    const text = extractText(message);
    if (!text) {
      console.log(`📎 Pesan non-text dari ${senderName}, diabaikan.`);
      return;
    }

    console.log(`\n📩 [${new Date().toLocaleTimeString()}]`);
    console.log(`   Dari: ${senderName} (${sender})`);
    console.log(`   Pesan: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

    try {
      // Cek apakah ini chat pribadi atau grup
      const isGroup = sender.endsWith('@g.us');
      
      if (isGroup) {
        // Di grup, hanya balas jika di-mention atau reply ke bot
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

      // Delay random biar kelihatan natural (1-3 detik)
      const delay = Math.floor(Math.random() * 2000) + 1000;
      await new Promise(resolve => setTimeout(resolve, delay));

      // Generate response
      let response;
      const intent = detectIntent(text);

      // Jika user tanya identitas atau greeting, bisa pakai quick response
      if (intent === 'identity' || intent === 'goodbye') {
        response = quickResponses[intent];
      } else {
        // Gunakan AI Gemini
        response = await getAIResponse(text, senderName, sender);
      }

      // Kirim balasan
      await sock.sendMessage(sender, { text: response });

      console.log(`🤖 Balasan: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);

      // Update presence
      await sock.sendPresenceUpdate('available', sender);

    } catch (error) {
      console.error('❌ Error memproses pesan:', error);
      
      // Kirim pesan error
      try {
        await sock.sendMessage(sender, { 
          text: quickResponses.error 
        });
      } catch (sendError) {
        console.error('❌ Gagal kirim pesan error:', sendError);
      }
    }
  });

  // Log semua event (debug)
  sock.ev.on('message.delete', (item) => {
    console.log('🗑️ Pesan dihapus:', item);
  });
}

// Helper: Extract text dari pesan
function extractText(message) {
  const msg = message.message;
  
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;
  
  return null;
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Bot dimatikan. Sampai jumpa!');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Bot dimatikan (SIGTERM). Sampai jumpa!');
  process.exit(0);
});

// Start bot
startBot().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
