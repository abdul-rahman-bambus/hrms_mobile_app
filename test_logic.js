const checkinStr = "2026-09-23 07:32:23";
let ciDateUtc = new Date(checkinStr.replace(" ", "T") + "Z");

console.log("Check-in UTC:", ciDateUtc.toISOString());
console.log("Local Hours:", ciDateUtc.getHours());
console.log("Local Minutes:", ciDateUtc.getMinutes());

let fallbackHours = 8;
const schedule = {
  hours_per_day: 8,
  attendances: [
    { dayofweek: 2, hour_from: 13, hour_to: 17 }
  ]
};

const dayOfWeek = ciDateUtc.getDay();
let odooDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
const dayAttendances = schedule.attendances.filter(a => a.dayofweek === odooDay);

if (dayAttendances.length > 0) {
  const maxHourTo = Math.max(...dayAttendances.map(a => a.hour_to));
  const localHour = ciDateUtc.getHours() + ciDateUtc.getMinutes() / 60;
  console.log("localHour:", localHour, "maxHourTo:", maxHourTo);
  if (localHour < maxHourTo) {
    fallbackHours = maxHourTo - localHour;
  }
}

console.log("Fallback Hours:", fallbackHours);
ciDateUtc.setMinutes(ciDateUtc.getMinutes() + Math.round(fallbackHours * 60));
let checkOutStr = ciDateUtc.toISOString().replace('T', ' ').substring(0, 19);
console.log("CheckOutStr (UTC):", checkOutStr);
