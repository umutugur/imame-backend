// backend/utils/calculateEndsAt.js

function calculateEndsAt() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  const todayAt2230 = new Date(year, month, day, 22, 30, 0);
  const todayAt2200 = new Date(year, month, day, 22, 0, 0);
  const tomorrowAt2200 = new Date(year, month, day + 1, 22, 0, 0);

  if (now < todayAt2230) {
    return todayAt2200;
  } else {
    return tomorrowAt2200;
  }
}

module.exports = calculateEndsAt;
