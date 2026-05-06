// Deteksi intent sederhana
function detectIntent(message) {
  const lowerMsg = message.toLowerCase().trim();
  
  // Greeting
  if (/^(halo|hi|hey|permisi|assalamualaikum|pagi|siang|sore|malam|hallo|helo)\b/.test(lowerMsg)) {
    return 'greeting';
  }
  
  // Thanks
  if (/^(terima kasih|makasih|thanks|thx|thank you| trims)\b/.test(lowerMsg)) {
    return 'thanks';
  }
  
  // Tanya sibuk/kerja
  if (/(sibuk|kerja|ngapain|mana|kemana|offline|tidur|lagi apa|lagi ngapain|lagi dimana)\b/.test(lowerMsg)) {
    return 'busy';
  }
  
  // Tanya identitas
  if (/(siapa kamu|kamu siapa|lu siapa|anda siapa|ini siapa|bot|robot|ai)\b/.test(lowerMsg)) {
    return 'identity';
  }
  
  // Goodbye
  if (/^(dadah|bye|selamat tinggal|sampai jumpa|see you|daa)\b/.test(lowerMsg)) {
    return 'goodbye';
  }
  
  return 'general';
}

// Template respons cepat (fallback jika AI error)
const quickResponses = {
  greeting: "Halo! 👋 Aku asisten pribadi dari pemilik nomor ini. Dia lagi sibuk nih, tapi aku bisa bantu sampaikan pesan kamu! Ada yang bisa aku bantu? 😊",
  thanks: "Sama-sama! 🙏 Pesan kamu udah aku catat dengan baik. Nanti aku kabarin pemilik ya. Have a great day! ✨",
  busy: "Pemilik lagi fokus kerja nih 💼. Pesan kamu udah aku catat, nanti langsung aku sampaikan begitu dia selesai! Ada yang urgent? 🏃‍♂️",
  identity: "Aku asisten pribadi dari pemilik nomor ini! 😊 Aku bantu jawab chat saat dia lagi sibuk. Ada yang bisa aku sampaikan? 📝",
  goodbye: "Dadah! 👋 Semoga harimu menyenangkan ya. Pesan kamu aman sama aku, bakal aku sampaikan ke pemilik! 🙌",
  error: "Maaf ya, aku lagi ada kendala teknis nih 😅. Pesan kamu udah aku catat, nanti aku sampaikan ke pemilik secepatnya! 🙏"
};

module.exports = { detectIntent, quickResponses };
