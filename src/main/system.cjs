// System state for the Control Center: Wi-Fi, brightness, dark mode, battery-free bits.
// Uses built-in Windows tools only (netsh, reg, PowerShell CIM); no admin rights needed.

const os = require('os');
const { execFile } = require('child_process');
const native = require('./native.cjs');

const WIN = os.platform() === 'win32';
const linux = os.platform() === 'linux' ? require('./linux.cjs') : null; // same features, Linux tools
const PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';

function run(cmd, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout }, (err, out) => resolve(err ? '' : String(out)));
  });
}

const ps = (script) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 8000);

async function wifi() {
  if (linux) return linux.wifi();
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
  if (linux) return linux.brightness();
  if (!WIN) return null;
  const out = (await ps('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness')).trim();
  return /^\d+$/.test(out) ? Number(out) : null;
}

let pendingBrightness = null;
async function setBrightness(pct) {
  if (linux) return linux.setBrightness(pct);
  if (!WIN) return null;
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  pendingBrightness = v;
  await ps(`Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout=0;Brightness=${v}} | Out-Null`);
  return pendingBrightness === v ? v : pendingBrightness;
}

async function darkMode() {
  if (linux) return linux.darkMode();
  if (!WIN) return null;
  const out = await run('reg', ['query', PERSONALIZE, '/v', 'AppsUseLightTheme']);
  const m = /AppsUseLightTheme\s+REG_DWORD\s+0x(\d+)/i.exec(out);
  return m ? m[1] === '0' : null;
}

async function setDarkMode(on) {
  if (linux) return linux.setDarkMode(on);
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

// nearby networks, strongest first; "known" = Windows has a saved profile, so one click connects
async function wifiNetworks() {
  if (linux) return linux.wifiNetworks();
  if (!WIN) return [];
  const [scan, profiles, now] = await Promise.all([run('netsh', ['wlan', 'show', 'networks', 'mode=bssid']), run('netsh', ['wlan', 'show', 'profiles']), wifi()]);
  const known = new Set([...profiles.matchAll(/All User Profile\s*:\s*(.+)/g)].map((m) => m[1].trim()));
  const nets = [];
  for (const block of scan.split(/\n(?=SSID \d+ :)/)) {
    const ssid = /^SSID \d+ : ?(.*)$/m.exec(block)?.[1]?.trim();
    if (!ssid || !ssid.replace(/[\s​-‏⁠﻿]/g, '')) continue; // hidden or invisible names
    const signal = Math.max(0, ...[...block.matchAll(/Signal\s*:\s*(\d+)%/g)].map((m) => Number(m[1])));
    const secure = !/Authentication\s*:\s*Open/i.test(block);
    nets.push({ ssid, signal, secure, known: known.has(ssid), connected: !!now?.connected && now.ssid === ssid });
  }
  return nets.sort((a, b) => b.connected - a.connected || b.signal - a.signal);
}

async function wifiConnect(ssid) {
  if (linux) return linux.wifiConnect(ssid);
  if (!WIN || !ssid) return false;
  const out = await run('netsh', ['wlan', 'connect', `name=${ssid}`, `ssid=${ssid}`]);
  return /success/i.test(out);
}

const AUDIO = require('path').join(__dirname, 'audio.ps1');
const audioPs = (...args) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', AUDIO, ...args], 12000);

async function audioOutputs() {
  if (linux) return linux.audioOutputs();
  if (!WIN) return [];
  try {
    const list = JSON.parse((await audioPs('list')).trim() || '[]');
    return Array.isArray(list) ? list : [list];
  } catch {
    return [];
  }
}

async function setAudioOutput(id) {
  if (linux) return linux.setAudioOutput(id);
  if (!WIN || !/^\{[\d.]+\}\.\{[0-9A-F-]+\}$/i.test(id || '')) return audioOutputs();
  await audioPs('set', id);
  return audioOutputs();
}

module.exports = { state, wifi, setBrightness, setDarkMode, wifiNetworks, wifiConnect, audioOutputs, setAudioOutput };
