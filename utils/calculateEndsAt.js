// backend/utils/calculateEndsAt.js

function calculateEndsAt() {
  // Şu anki UTC zamanı
  const now = new Date();

  // Şu anki Türkiye tarihi (UTC+3)
  const turkiyeNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const year = turkiyeNow.getFullYear();
  const month = turkiyeNow.getMonth();
  const day = turkiyeNow.getDate();

  // Türkiye'de bugün saat 22:00'ı UTC'ye çevir
  const todayAt2200TR = new Date(Date.UTC(year, month, day, 19, 0, 0)); // UTC 19:00 == TR 22:00

  if (now < todayAt2200TR) {
    return todayAt2200TR;
  } else {
    // Yarın için hesapla
    const tomorrow = new Date(turkiyeNow.getTime() + 24 * 60 * 60 * 1000);
    const yYear = tomorrow.getFullYear();
    const yMonth = tomorrow.getMonth();
    const yDay = tomorrow.getDate();
    return new Date(Date.UTC(yYear, yMonth, yDay, 19, 0, 0)); // UTC 19:00 == TR 22:00
  }
}

module.exports = calculateEndsAt;
