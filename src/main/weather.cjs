// Weather from Open-Meteo (free, no API key). Without a saved city we use your IP's city.

const feeds = require('./feeds.cjs');

const TTL = 15 * 60 * 1000;
let cache = null;

// WMO weather codes -> a label and a scene "kind" the sky renderer understands.
function describe(code) {
  if (code === 0) return { label: 'Clear', kind: 'clear' };
  if (code <= 2) return { label: 'Partly cloudy', kind: 'partly' };
  if (code === 3) return { label: 'Overcast', kind: 'cloudy' };
  if (code === 45 || code === 48) return { label: 'Fog', kind: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', kind: 'rain' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', kind: 'rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', kind: 'snow' };
  if (code >= 95) return { label: 'Thunderstorm', kind: 'storm' };
  return { label: 'Cloudy', kind: 'cloudy' };
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000); // generous: slow networks and busy startups
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function geocode(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(name)}`;
  const data = await fetchJson(url);
  const r = data.results?.[0];
  if (!r) return null;
  return { name: r.name, country: r.country_code || r.country || '', lat: r.latitude, lon: r.longitude };
}

async function get(cfg, force = false) {
  const city = cfg.city || (await feeds.locate());
  if (!city) return { ok: false, reason: 'no-city' };
  const key = `${city.lat},${city.lon}`;
  if (!force && cache && cache.key === key && Date.now() - cache.updated < TTL) return cache;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=1`;
    const d = await fetchJson(url);
    const cur = d.current;
    const info = describe(cur.weather_code);
    cache = {
      ok: true,
      key,
      city: city.name,
      auto: !!city.auto,
      temp: Math.round(cur.temperature_2m),
      feels: Math.round(cur.apparent_temperature),
      humidity: cur.relative_humidity_2m,
      wind: Math.round(cur.wind_speed_10m),
      code: cur.weather_code,
      isDay: !!cur.is_day,
      label: info.label,
      kind: info.kind,
      high: Math.round(d.daily.temperature_2m_max[0]),
      low: Math.round(d.daily.temperature_2m_min[0]),
      // Open-Meteo returns local wall-clock strings; keep them as minutes since midnight.
      sunrise: toMinutes(d.daily.sunrise[0]),
      sunset: toMinutes(d.daily.sunset[0]),
      updated: Date.now(),
    };
    return cache;
  } catch (e) {
    return cache && cache.key === key ? cache : { ok: false, reason: 'offline', error: String(e) };
  }
}

function toMinutes(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Full forecast for the weather panel: next 24 hours and 7 days.
let fcCache = null;
async function forecast(cfg) {
  const city = cfg.city || (await feeds.locate());
  if (!city) return { ok: false, reason: 'no-city' };
  const key = `${city.lat},${city.lon}`;
  if (fcCache && fcCache.key === key && Date.now() - fcCache.at < TTL) return fcCache.data;
  try {
    const d = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
        '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m,uv_index' +
        '&hourly=temperature_2m,precipitation_probability,weather_code,is_day' +
        '&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,precipitation_probability_max&timezone=auto&forecast_days=7',
    );
    const nowIdx = Math.max(0, d.hourly.time.findIndex((t) => t >= d.current.time.slice(0, 13)));
    const data = {
      ok: true,
      city: city.name,
      current: { ...describe(d.current.weather_code), temp: Math.round(d.current.temperature_2m), feels: Math.round(d.current.apparent_temperature), humidity: d.current.relative_humidity_2m, wind: Math.round(d.current.wind_speed_10m), uv: d.current.uv_index, isDay: !!d.current.is_day },
      hourly: d.hourly.time.slice(nowIdx, nowIdx + 24).map((t, i) => ({ hour: Number(t.slice(11, 13)), temp: Math.round(d.hourly.temperature_2m[nowIdx + i]), rain: d.hourly.precipitation_probability[nowIdx + i] ?? 0, ...describe(d.hourly.weather_code[nowIdx + i]), isDay: !!d.hourly.is_day[nowIdx + i] })),
      daily: d.daily.time.map((t, i) => ({ date: t, high: Math.round(d.daily.temperature_2m_max[i]), low: Math.round(d.daily.temperature_2m_min[i]), rain: d.daily.precipitation_probability_max[i] ?? 0, ...describe(d.daily.weather_code[i]) })),
      sunrise: d.daily.sunrise[0].slice(11, 16),
      sunset: d.daily.sunset[0].slice(11, 16),
    };
    fcCache = { key, at: Date.now(), data };
    return data;
  } catch (e) {
    return fcCache?.data || { ok: false, reason: 'offline' };
  }
}

module.exports = { get, geocode, describe, forecast };
