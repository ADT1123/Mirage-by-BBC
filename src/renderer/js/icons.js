// Minimal line icons (24px grid, stroke = currentColor).

const P = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.3 8.3 0 1 0 10.5 10.5Z"/>',
  cloud: '<path d="M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.56A6 6 0 0 0 6.3 11a3.8 3.8 0 0 0 .7 7.5Z"/>',
  partly: '<path d="M8.5 3.5v1.6M3.6 8.4h1.6M4.9 4.8l1.1 1.1M12.3 4.8l-1.1 1.1"/><path d="M5.9 11.3a3.3 3.3 0 0 1 5.7-3.1"/><path d="M8.6 20h8.9a3.7 3.7 0 0 0 .5-7.37A5.2 5.2 0 0 0 8 13.6a3.2 3.2 0 0 0 .6 6.4Z"/>',
  rain: '<path d="M7 15.5h10.2a4.3 4.3 0 0 0 .6-8.56A6 6 0 0 0 6.3 8a3.8 3.8 0 0 0 .7 7.5Z"/><path d="M8.5 18.5l-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5"/>',
  snow: '<path d="M7 14.5h10.2a4.3 4.3 0 0 0 .6-8.56A6 6 0 0 0 6.3 7a3.8 3.8 0 0 0 .7 7.5Z"/><path d="M8.5 18v.01M12 19.5v.01M15.5 18v.01M10 21.5v.01M14 21.5v.01" stroke-width="2.4"/>',
  storm: '<path d="M7 14.5h10.2a4.3 4.3 0 0 0 .6-8.56A6 6 0 0 0 6.3 7a3.8 3.8 0 0 0 .7 7.5Z"/><path d="M12.5 13l-2.5 4h3.5l-2 4"/>',
  fog: '<path d="M7 12.5h10.2a4.3 4.3 0 0 0 .6-8.56A6 6 0 0 0 6.3 5a3.8 3.8 0 0 0 .7 7.5Z"/><path d="M4 16h16M6 19.5h12"/>',
  sparkle: '<path d="M12 3.5l1.9 5.2a2 2 0 0 0 1.2 1.2l5.2 1.9-5.2 1.9a2 2 0 0 0-1.2 1.2L12 20.1l-1.9-5.2a2 2 0 0 0-1.2-1.2l-5.2-1.9 5.2-1.9a2 2 0 0 0 1.2-1.2Z"/><path d="M19 3v3M17.5 4.5h3"/>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.6 9.6 0 0 1 13 0M8.6 15.6a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19" r=".9" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2a1.8 1.8 0 0 1 1.3-3H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10" cy="7" r="1.1" fill="currentColor"/><circle cx="14.5" cy="7" r="1.1" fill="currentColor"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  commits: '<rect x="3.5" y="3.5" width="4" height="4" rx="1"/><rect x="10" y="3.5" width="4" height="4" rx="1"/><rect x="16.5" y="3.5" width="4" height="4" rx="1"/><rect x="3.5" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor"/><rect x="16.5" y="10" width="4" height="4" rx="1"/><rect x="3.5" y="16.5" width="4" height="4" rx="1" fill="currentColor"/><rect x="10" y="16.5" width="4" height="4" rx="1"/><rect x="16.5" y="16.5" width="4" height="4" rx="1" fill="currentColor"/>',
  feed: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M6 8v8M10 6h10M10 18h10M10 12h7"/>',
  note: '<path d="M5 3.5h14v11l-6 6H5z"/><path d="M13 20.5v-6h6"/>',
  todo: '<rect x="3.5" y="4" width="5" height="5" rx="1.3"/><path d="M4.7 6.5l1.2 1.2 2-2.2"/><rect x="3.5" y="15" width="5" height="5" rx="1.3"/><path d="M12 6.5h8.5M12 17.5h8.5"/>',
  weather: '<path d="M8.5 3.5v1.6M3.6 8.4h1.6M4.9 4.8l1.1 1.1M12.3 4.8l-1.1 1.1"/><path d="M5.9 11.3a3.3 3.3 0 0 1 5.7-3.1"/><path d="M8.6 20h8.9a3.7 3.7 0 0 0 .5-7.37A5.2 5.2 0 0 0 8 13.6a3.2 3.2 0 0 0 .6 6.4Z"/>',
  year: '<path d="M3.5 12h17"/><rect x="3.5" y="8.5" width="17" height="7" rx="3.5"/><path d="M3.5 12h11" stroke-width="7" stroke-linecap="round" opacity=".35"/>',
  system: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/><circle cx="12" cy="12" r="4.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  countdown: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5M16 3.5c0 2-1.5 3.3-3 4.4"/>',
  quote: '<path d="M10 7H6.5a2 2 0 0 0-2 2v3h5.5v6H4.5M19.5 7H16a2 2 0 0 0-2 2v3h5.5v6H14"/>',
  menubar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 8.5h18"/><circle cx="6" cy="6.3" r=".5" fill="currentColor"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5"/>',
  bluetooth: '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>',
  taskbar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 16h18M7 18h.01M10 18h.01"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="3"/>',
  next: '<path d="M5 6v12l8.5-6zM13.5 6v12l8.5-6z" fill="currentColor" stroke-width="1"/>',
  prev: '<path d="M19 6v12l-8.5-6zM10.5 6v12L2 12z" fill="currentColor" stroke-width="1"/>',
  camera: '<path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 7a8 8 0 1 0 11.4 0"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  sun2: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
  app: '<rect x="4" y="4" width="16" height="16" rx="4.5"/>',
  dock: '<rect x="3" y="14" width="18" height="6" rx="3"/><rect x="6" y="6" width="4" height="5" rx="1.2"/><rect x="14" y="6" width="4" height="5" rx="1.2"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  check2: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export function weatherIcon(kind, isDay = true) {
  const map = { clear: isDay ? 'sun' : 'moon', partly: isDay ? 'partly' : 'cloud', cloudy: 'cloud', fog: 'fog', rain: 'rain', snow: 'snow', storm: 'storm' };
  return icon(map[kind] || 'cloud', 'wx-ico');
}

export function batteryIcon(level = 1, charging = false) {
  const w = Math.max(1.5, Math.round(13 * level * 10) / 10);
  return `<svg class="ico batt" viewBox="0 0 28 14" aria-hidden="true"><rect x="1" y="1" width="22" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.2"/><rect x="24.5" y="4.6" width="2" height="4.8" rx="1" fill="currentColor" fill-opacity=".55"/><rect x="3" y="3" width="${(w / 13) * 18}" height="8" rx="2" fill="currentColor"/>${charging ? '<path d="M13 2.5l-3 5h3l-1.5 4.5 4-6h-3l1.5-3.5z" fill="var(--bolt, #fff)" stroke="none"/>' : ''}</svg>`;
}
