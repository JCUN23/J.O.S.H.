// Sunrise/sunset from latitude/longitude (NOAA solar calculator, simplified).
// Accurate to about a minute at mid-latitudes; no API, works offline.
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// Returns { sunrise: Date, sunset: Date } for the calendar day containing `date`
// (in the server's local timezone), or null values during polar day/night.
function sunTimes(date, lat, lon) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());   // local midnight
  const start = new Date(day.getFullYear(), 0, 0);
  const n = Math.floor((day - start) / 86400000);                            // day of year

  const gamma = (2 * Math.PI / 365) * (n - 1);                               // fractional year
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));      // minutes
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);         // radians

  const cosHa = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
  if (cosHa > 1 || cosHa < -1) return { sunrise: null, sunset: null };
  const ha = deg(Math.acos(cosHa));

  const utcMidnight = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  const at = (minutesUtc) => new Date(utcMidnight + minutesUtc * 60000);
  return {
    sunrise: at(720 - 4 * (lon + ha) - eqTime),
    sunset: at(720 - 4 * (lon - ha) - eqTime),
  };
}

module.exports = { sunTimes };
