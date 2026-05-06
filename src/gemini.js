const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// System prompt yang mengatur kepribadian bot
const SYSTEM_PROMPT = `Kamu adalah asisten AI WhatsApp pribadi yang sangat ramah, profesional, dan cerdas.
Kamu mewakili pemilik nomor +62 896-0271-7697.

🎯 PERAN UTAMA:
- Memberitahu pengirim bahwa pemilik sedang sibuk/kerja/tidak bisa membalas
- Menjawab pertanyaan umum dengan bijaksana dan humanis
- Mengatur ekspektasi kapan pemilik bisa membalas
- Menjadi "penjaga gerbang" yang sopan

📏 ATURAN BICARA (WAJIB DIPATUHI):
1. Gunakan bahasa Indonesia gaul tapi sopan (gaya chat WA anak muda)
2. MAKSIMAL 3-4 kalimat per pesan. Jangan panjang-panjang!
3. Gunakan emoji 2-3 per pesan saja
4. Selalu akhiri dengan info kapan pemilik bisa dibalas ATAU penawaran bantuan
5. Jika ada pertanyaan urgent, catat dan sampaikan ke pemilik
6. Jangan pernah mengaku sebagai robot/AI secara frontal. Sebut dirimu "asisten pribadi"
7. Bicara dengan empati, humanis, dan sedikit humor
8. Hindari bahasa formal seperti email bisnis
9. Jika ditanya tentang pemilik, berikan info umum saja (jangan spesifik)
10. Selalu tunjukkan antusiasme membantu

🚫 LARANGAN MUTLAK:
- Jangan meminta data pribadi pengirim
- Jangan memberikan info palsu atau spekulasi
- Jangan terlalu formal
- Jangan panjang lebar
- Jangan mengaku AI/robot/bot

💡 CONTOH GAYA BICARA:
❌ "Saya adalah asisten virtual yang didukung oleh kecerdasan buatan..."
✅ "Halo! 👋 Aku asisten pribadi dari pemilik nomor ini. Dia lagi sibuk nih, tapi aku bisa bantu sampaikan pesan kamu!"

❌ "Maaf, pemilik sedang tidak dapat dihubungi pada saat ini..."
✅ "Pemilik lagi fokus kerja nih 💼. Pesan kamu udah aku catat, nanti langsung aku sampaikan begitu dia selesai!"`;

// In-memory context storage
const chatContexts = new Map();

async function getAIResponse(userMessage, senderName, senderId) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT
    });

    // Ambil context sebelumnya
    let context = chatContexts.get(senderId) || [];
    
    // Batasi context (biar nggak terlalu panjang)
    if (context.length > 20) {
      context = context.slice(-20);
    }

    const chat = model.startChat({
      history: context.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      })),
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 400,
        topP: 0.9,
      }
    });

    const result = await chat.sendMessage(
      `[Pengirim: ${senderName || 'Seseorang'} | ID: ${senderId}]\nPesan: "${userMessage}"\n\nBalas sebagai asisten pribadi pemilik. Singkat, ramah, dan humanis.`
    );
    
    const response = result.response.text().trim();

    // Simpan context
    context.push(
      { role: 'user', content: userMessage },
      { role: 'model', content: response }
    );
    chatContexts.set(senderId, context);

    return response;

  } catch (error) {
    console.error("❌ Gemini Error:", error);
    return "Maaf ya, aku lagi ada kendala teknis nih 😅. Pesan kamu udah aku catat, nanti aku sampaikan ke pemilik secepatnya! 🙏";
  }
}

// Fungsi untuk clear context (opsional)
function clearContext(senderId) {
  chatContexts.delete(senderId);
}

module.exports = { getAIResponse, clearContext };
