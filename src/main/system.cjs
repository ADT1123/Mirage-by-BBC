// System state for the Control Center: Wi-Fi, brightness, dark mode, battery-free bits.
// Uses built-in Windows tools only (netsh, reg, PowerShell CIM); no admin rights needed.

const os = require('os');
const { execFile } = require('child_process');
const native = require('./native.cjs');

const WIN = os.platform() === 'win32';
const PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';

function run(cmd, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout }, (err, out) => resolve(err ? '' : String(out)));
  });
}

const ps = (script) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 8000);

async function wifi() {
  if (!WIN) return null;
  const out = await run('netsh', ['wlan', 'show', 'interfaces']);
  const field = (name) => new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, 'mi').exec(out)?.[1]?.trim();
  if (!out || !field('State')) return { available: false };
  return {
    available: true,
    connected: /^connected/i.test(field('State') || ''),
    ssid: field('SSID') || '',
    signal: parseInt(field('Signal') || '0', 10),
  };
}

async function brightness() {
  if (!WIN) return null;
  const out = (await ps('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness')).trim();
  return /^\d+$/.test(out) ? Number(out) : null;
}

let pendingBrightness = null;
async function setBrightness(pct) {
  if (!WIN) return null;
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  pendingBrightness = v;
  await ps(`Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout=0;Brightness=${v}} | Out-Null`);
  return pendingBrightness === v ? v : pendingBrightness;
}

async function darkMode() {
  if (!WIN) return null;
  const out = await run('reg', ['query', PERSONALIZE, '/v', 'AppsUseLightTheme']);
  const m = /AppsUseLightTheme\s+REG_DWORD\s+0x(\d+)/i.exec(out);
  return m ? m[1] === '0' : null;
}

async function setDarkMode(on) {
  if (!WIN) return null;
  const v = on ? '0' : '1';
  await run('reg', ['add', PERSONALIZE, '/v', 'AppsUseLightTheme', '/t', 'REG_DWORD', '/d', v, '/f']);
  await run('reg', ['add', PERSONALIZE, '/v', 'SystemUsesLightTheme', '/t', 'REG_DWORD', '/d', v, '/f']);
  native.broadcastThemeChange();
  return darkMode();
}

// One snapshot for the Control Center to render.
async function state() {
  const [net, bright, dark] = await Promise.all([wifi(), brightness(), darkMode()]);
  return {
    wifi: net,
    brightness: bright,
    dark,
    volume: native.getVolume(),
    taskbarHidden: native.taskbarAutoHide(),
    host: os.hostname(),
  };
}

module.exports = { state, wifi, setBrightness, setDarkMode };
