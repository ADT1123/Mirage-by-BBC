// The real night sky over your city: the brightest stars and a few constellations placed by
// your latitude, longitude and the current time, and the Moon in its true position and phase.
// Low-precision formulas (good to a fraction of a degree), plenty for a wallpaper.

const RAD = Math.PI / 180;

// [name, right ascension (hours), declination (degrees), magnitude]
const STARS = [
  ['Sirius', 6.7525, -16.716, -1.46], ['Canopus', 6.3992, -52.696, -0.74], ['Arcturus', 14.261, 19.182, -0.05],
  ['Vega', 18.6156, 38.784, 0.03], ['Capella', 5.2781, 45.998, 0.08], ['Rigel', 5.2423, -8.202, 0.13],
  ['Procyon', 7.655, 5.225, 0.34], ['Betelgeuse', 5.9195, 7.407, 0.5], ['Achernar', 1.6286, -57.237, 0.46],
  ['Hadar', 14.0637, -60.373, 0.61], ['Altair', 19.8464, 8.868, 0.76], ['Acrux', 12.4433, -63.099, 0.76],
  ['Aldebaran', 4.5987, 16.509, 0.86], ['Antares', 16.4901, -26.432, 0.96], ['Spica', 13.4199, -11.161, 0.97],
  ['Pollux', 7.7553, 28.026, 1.14], ['Fomalhaut', 22.9608, -29.622, 1.16], ['Deneb', 20.6905, 45.28, 1.25],
  ['Mimosa', 12.7953, -59.689, 1.25], ['Regulus', 10.1395, 11.967, 1.35], ['Adhara', 6.9771, -28.972, 1.5],
  ['Castor', 7.5767, 31.888, 1.58], ['Shaula', 17.56, -37.104, 1.62], ['Gacrux', 12.5194, -57.113, 1.64],
  ['Bellatrix', 5.4188, 6.35, 1.64], ['Elnath', 5.4382, 28.608, 1.65], ['Alnilam', 5.6036, -1.202, 1.69],
  ['Alnitak', 5.6793, -1.943, 1.77], ['Mintaka', 5.5334, -0.299, 2.23], ['Saiph', 5.7959, -9.67, 2.09],
  ['Alioth', 12.9005, 55.96, 1.77], ['Dubhe', 11.0621, 61.751, 1.79], ['Mirfak', 3.4054, 49.861, 1.79],
  ['Wezen', 7.1399, -26.393, 1.83], ['Kaus Australis', 18.4029, -34.385, 1.85], ['Alkaid', 13.7923, 49.313, 1.86],
  ['Menkalinan', 5.9921, 44.948, 1.9], ['Alhena', 6.6285, 16.399, 1.93], ['Polaris', 2.5302, 89.264, 1.98],
  ['Mirzam', 6.3783, -17.956, 1.98], ['Alphard', 9.4598, -8.659, 1.99], ['Hamal', 2.1196, 23.462, 2.01],
  ['Diphda', 0.7265, -17.987, 2.04], ['Nunki', 18.9211, -26.297, 2.05], ['Mizar', 13.3988, 54.925, 2.04],
  ['Merak', 11.0307, 56.382, 2.37], ['Phecda', 11.8972, 53.695, 2.44], ['Megrez', 12.2571, 57.033, 3.31],
  ['Schedar', 0.6751, 56.537, 2.24], ['Caph', 0.1529, 59.15, 2.28], ['Navi', 0.9451, 60.717, 2.15],
  ['Ruchbah', 1.4302, 60.235, 2.68], ['Segin', 1.9066, 63.67, 3.35], ['Rasalhague', 17.5822, 12.56, 2.07],
  ['Algol', 3.1361, 40.956, 2.12], ['Denebola', 11.8177, 14.572, 2.14], ['Alpheratz', 0.1398, 29.091, 2.06],
  ['Scheat', 23.0629, 28.083, 2.42], ['Markab', 23.0793, 15.205, 2.49], ['Algenib', 0.2206, 15.184, 2.83],
  ['Enif', 21.7364, 9.875, 2.38], ['Kochab', 14.8451, 74.155, 2.08], ['Sadr', 20.3705, 40.257, 2.23],
  ['Albireo', 19.512, 27.96, 3.05], ['Gienah', 20.7702, 33.97, 2.48], ['Eltanin', 17.9434, 51.489, 2.24],
];

// constellation stick figures, by star name
const LINES = [
  ['Betelgeuse', 'Bellatrix'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'],
  ['Alnitak', 'Saiph'], ['Saiph', 'Rigel'], ['Rigel', 'Mintaka'], ['Betelgeuse', 'Alnitak'],
  ['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'], ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid'],
  ['Caph', 'Schedar'], ['Schedar', 'Navi'], ['Navi', 'Ruchbah'], ['Ruchbah', 'Segin'],
  ['Alpheratz', 'Scheat'], ['Scheat', 'Markab'], ['Markab', 'Algenib'], ['Algenib', 'Alpheratz'],
  ['Acrux', 'Gacrux'], ['Mimosa', 'Hadar'],
  ['Deneb', 'Sadr'], ['Sadr', 'Albireo'], ['Sadr', 'Gienah'],
  ['Castor', 'Pollux'], ['Antares', 'Shaula'],
];

const julian = (date) => date.getTime() / 864e5 + 2440587.5;

// local sidereal time in degrees
function lst(date, lon) {
  const d = julian(date) - 2451545;
  return (((280.46061837 + 360.98564736629 * d + lon) % 360) + 360) % 360;
}

// equatorial (RA hours, Dec deg) -> altitude/azimuth (degrees) for this place and time
function altAz(raH, dec, date, lat, lon) {
  const ha = (lst(date, lon) - raH * 15) * RAD;
  const d = dec * RAD;
  const l = lat * RAD;
  const alt = Math.asin(Math.sin(l) * Math.sin(d) + Math.cos(l) * Math.cos(d) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha) * Math.cos(d), Math.cos(l) * Math.sin(d) - Math.sin(l) * Math.cos(d) * Math.cos(ha));
  return { alt: alt / RAD, az: ((az / RAD) + 360) % 360 };
}

// the Moon: position (approximate ecliptic → equatorial) and phase
export function moon(date = new Date()) {
  const d = julian(date) - 2451545;
  const L = (218.316 + 13.176396 * d) * RAD;
  const M = (134.963 + 13.064993 * d) * RAD;
  const F = (93.272 + 13.22935 * d) * RAD;
  const lam = L + 6.289 * RAD * Math.sin(M);
  const beta = 5.128 * RAD * Math.sin(F);
  const eps = 23.439 * RAD;
  const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lam));
  const dec = Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lam));
  // phase from the synodic month, counted from a known new moon (2000-01-06 18:14 UTC)
  const age = ((((julian(date) - 2451550.26) % 29.530588853) + 29.530588853) % 29.530588853) / 29.530588853;
  const illum = (1 - Math.cos(2 * Math.PI * age)) / 2;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return { raH: ((ra / RAD + 360) % 360) / 15, dec: dec / RAD, age, illum, waxing: age < 0.5, name: names[Math.round(age * 8) % 8] };
}

// Project the sky onto a W×H rectangle: horizon along the bottom (at `horizon` × H), zenith at
// the top, a 200° wide view centred on the south (north for the southern hemisphere).
export function realSky(date, lat, lon, W, H, horizon = 0.92) {
  const center = lat >= 0 ? 180 : 0;
  const fov = 200;
  const place = ({ alt, az }) => {
    let dx = ((az - center + 540) % 360) - 180;
    return { x: W / 2 + (dx / fov) * W, y: H * horizon * (1 - alt / 90), alt, onScreen: alt > 0 && Math.abs(dx) < fov / 2 };
  };
  const stars = STARS.map(([name, ra, dec, mag]) => ({ name, mag, ...place(altAz(ra, dec, date, lat, lon)) })).filter((s) => s.onScreen);
  const byName = new Map(stars.map((s) => [s.name, s]));
  const lines = LINES.map(([a, b]) => [byName.get(a), byName.get(b)]).filter(([a, b]) => a && b);
  const m = moon(date);
  const mp = place(altAz(m.raH, m.dec, date, lat, lon));
  return { stars, lines, moon: { ...m, ...mp } };
}

// Draw a moon disc with the correct lit shape (the bright limb faces the Sun).
export function drawMoon(g, x, y, r, m, dark = 'rgba(20,24,40,0.85)', light = '#eef1fb') {
  g.save();
  g.fillStyle = dark;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  const side = m.waxing ? 1 : -1; // waxing: lit on the right (northern hemisphere view)
  const k = Math.cos(2 * Math.PI * m.age); // 1 at new, -1 at full
  g.fillStyle = light;
  g.beginPath();
  g.arc(x, y, r, -Math.PI / 2, Math.PI / 2, side < 0); // the lit half
  g.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === (side > 0));
  g.fill();
  g.restore();
}

// where the user is, from the weather data ("lat,lon" key) or their chosen city
export function whereAmI(ctx) {
  const k = ctx.store.weather?.key;
  if (k && /^-?[\d.]+,-?[\d.]+$/.test(k)) {
    const [lat, lon] = k.split(',').map(Number);
    return { lat, lon };
  }
  return ctx.cfg.city ? { lat: ctx.cfg.city.lat, lon: ctx.cfg.city.lon } : null;
}
