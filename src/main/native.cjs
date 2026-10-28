// Small Win32 toolbox for the interactive desktop: where the cursor is and whether it's
// over the bare desktop, media/volume keys, taskbar auto-hide, lock, and the system
// master volume through Core Audio (COM, called directly through its vtable).

const os = require('os');

const WIN = os.platform() === 'win32';
let w = null;

function load() {
  if (w) return w;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const shell32 = koffi.load('shell32.dll');
  const ole32 = koffi.load('ole32.dll');
  const kernel32 = koffi.load('kernel32.dll');

  const POINT = koffi.struct('WALL_POINT', { x: 'int32', y: 'int32' });
  const RECT = koffi.struct('WALL_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const LASTINPUT = koffi.struct('WALL_LASTINPUT', { cbSize: 'uint32', dwTime: 'uint32' });
  const APPBARDATA = koffi.struct('WALL_APPBARDATA', {
    cbSize: 'uint32',
    hWnd: 'intptr_t',
    uCallbackMessage: 'uint32',
    uEdge: 'uint32',
    rc: RECT,
    lParam: 'intptr_t',
  });

  w = {
    koffi,
    APPBARDATA,
    GetCursorPos: user32.func('bool __stdcall GetCursorPos(_Out_ WALL_POINT *p)'),
    GetAsyncKeyState: user32.func('int16_t __stdcall GetAsyncKeyState(int vk)'),
    WindowFromPoint: user32.func('intptr_t __stdcall WindowFromPoint(WALL_POINT p)'),
    GetAncestor: user32.func('intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32_t flags)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint16_t *buf, int max)'),
    keybd_event: user32.func('void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)'),
    LockWorkStation: user32.func('bool __stdcall LockWorkStation()'),
    FindWindowW: user32.func('intptr_t __stdcall FindWindowW(str16 cls, str16 name)'),
    SendMessageTimeoutW: user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wParam, str16 lParam, uint32_t flags, uint32_t timeout, void *result)'),
    SHAppBarMessage: shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32_t msg, _Inout_ WALL_APPBARDATA *data)'),
    GetForegroundWindow: user32.func('intptr_t __stdcall GetForegroundWindow()'),
    GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
    GetLastInputInfo: user32.func('bool __stdcall GetLastInputInfo(_Inout_ WALL_LASTINPUT *info)'),
    GetTickCount: kernel32.func('uint32_t __stdcall GetTickCount()'),
    OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
    QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t proc, uint32_t flags, _Out_ uint16_t *buf, _Inout_ uint32_t *size)'),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t h)'),
    CoInitializeEx: ole32.func('int32_t __stdcall CoInitializeEx(void *reserved, uint32_t coinit)'),
    CoCreateInstance: ole32.func('int32_t __stdcall CoCreateInstance(void *clsid, void *outer, uint32_t ctx, void *iid, _Out_ void **out)'),
  };
  return w;
}

function className(hwnd) {
  const buf = new Uint16Array(128);
  const n = load().GetClassNameW(hwnd, buf, 128);
  return String.fromCharCode(...buf.slice(0, n));
}

// Cursor position in physical pixels, whether the left button is down, and whether the
// cursor is over the bare desktop (not over some app window).
function pointer() {
  if (!WIN) return null;
  const k = load();
  const p = {};
  k.GetCursorPos(p);
  const hwnd = k.WindowFromPoint(p);
  const root = hwnd ? k.GetAncestor(hwnd, 2 /* GA_ROOT */) : 0;
  const cls = root ? className(root) : '';
  return {
    x: p.x,
    y: p.y,
    down: (k.GetAsyncKeyState(0x01) & 0x8000) !== 0,
    overDesktop: cls === 'Progman' || cls === 'WorkerW',
  };
}

// ---------------------------------------------------------------- keys

const VK = { next: 0xb0, prev: 0xb1, playpause: 0xb3, mute: 0xad, voldown: 0xae, volup: 0xaf };

function tapKey(name) {
  if (!WIN || !VK[name]) return;
  const k = load();
  k.keybd_event(VK[name], 0, 0, 0);
  k.keybd_event(VK[name], 0, 2 /* KEYEVENTF_KEYUP */, 0);
}

function lock() {
  if (WIN) load().LockWorkStation();
}

// Tell Windows (and apps) that the light/dark theme changed.
function broadcastThemeChange() {
  if (!WIN) return;
  load().SendMessageTimeoutW(0xffff, 0x001a, 0, 'ImmersiveColorSet', 0x2, 300, null);
}

// ---------------------------------------------------------------- taskbar

function taskbarData(lParam = 0) {
  const k = load();
  return { cbSize: k.koffi.sizeof(k.APPBARDATA), hWnd: k.FindWindowW('Shell_TrayWnd', null), uCallbackMessage: 0, uEdge: 0, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam };
}

function taskbarAutoHide() {
  if (!WIN) return false;
  const state = Number(load().SHAppBarMessage(0x4 /* ABM_GETSTATE */, taskbarData()));
  return (state & 0x1) !== 0;
}

function setTaskbarAutoHide(on) {
  if (!WIN) return false;
  load().SHAppBarMessage(0xa /* ABM_SETSTATE */, taskbarData(on ? 0x1 : 0x2 /* ABS_ALWAYSONTOP */));
  return taskbarAutoHide();
}

// ---------------------------------------------------------------- volume (Core Audio)

function guid(str) {
  const h = str.replace(/[{}-]/g, '');
  const b = Buffer.alloc(16);
  b.writeUInt32LE(parseInt(h.slice(0, 8), 16), 0);
  b.writeUInt16LE(parseInt(h.slice(8, 12), 16), 4);
  b.writeUInt16LE(parseInt(h.slice(12, 16), 16), 6);
  Buffer.from(h.slice(16), 'hex').copy(b, 8);
  return b;
}

let endpoint = null;
let protos = null;

function vcall(obj, index, proto, ...args) {
  const { koffi } = load();
  const vtbl = koffi.decode(obj, 'void *');
  const fn = koffi.decode(vtbl, index * 8, 'void *');
  return koffi.call(fn, proto, obj, ...args);
}

function audio() {
  if (endpoint) return endpoint;
  const k = load();
  const { koffi } = k;
  protos ??= {
    getDefault: koffi.proto('int32_t __stdcall WallGetDefault(void *self, int flow, int role, _Out_ void **dev)'),
    activate: koffi.proto('int32_t __stdcall WallActivate(void *self, void *iid, uint32_t ctx, void *params, _Out_ void **out)'),
    setScalar: koffi.proto('int32_t __stdcall WallSetScalar(void *self, float level, void *ctx)'),
    getScalar: koffi.proto('int32_t __stdcall WallGetScalar(void *self, _Out_ float *level)'),
    setMute: koffi.proto('int32_t __stdcall WallSetMute(void *self, int mute, void *ctx)'),
    getMute: koffi.proto('int32_t __stdcall WallGetMute(void *self, _Out_ int *mute)'),
  };
  k.CoInitializeEx(null, 0x2); // fine if COM is already set up on this thread
  const out = [null];
  let hr = k.CoCreateInstance(guid('BCDE0395-E52F-467C-8E3D-C4579291692E'), null, 0x17, guid('A95664D2-9614-4F35-A746-DE8DB63617E6'), out);
  if (hr < 0 || !out[0]) throw new Error(`MMDeviceEnumerator failed (${hr})`);
  const dev = [null];
  hr = vcall(out[0], 4, protos.getDefault, 0 /* eRender */, 1 /* eMultimedia */, dev);
  if (hr < 0 || !dev[0]) throw new Error(`no default audio device (${hr})`);
  const vol = [null];
  hr = vcall(dev[0], 3, protos.activate, guid('5CDF2C82-841E-4546-9722-0CF74078229A'), 0x17, null, vol);
  if (hr < 0 || !vol[0]) throw new Error(`IAudioEndpointVolume failed (${hr})`);
  endpoint = vol[0];
  return endpoint;
}

function getVolume() {
  if (!WIN) return null;
  try {
    const v = [0];
    const m = [0];
    vcall(audio(), 9, protos.getScalar, v);
    vcall(audio(), 15, protos.getMute, m);
    return { level: Math.round(v[0] * 100), muted: !!m[0] };
  } catch {
    endpoint = null;
    return null;
  }
}

function setVolume(pct) {
  if (!WIN) return null;
  try {
    vcall(audio(), 7, protos.setScalar, Math.max(0, Math.min(100, pct)) / 100, null);
  } catch {
    endpoint = null;
  }
  return getVolume();
}

function setMute(on) {
  if (!WIN) return null;
  try {
    vcall(audio(), 14, protos.setMute, on ? 1 : 0, null);
  } catch {
    endpoint = null;
  }
  return getVolume();
}

// Seconds since the last keyboard or mouse input (for "active time").
function idleSeconds() {
  if (!WIN) return 0;
  const k = load();
  const li = { cbSize: 8, dwTime: 0 };
  if (!k.GetLastInputInfo(li)) return 0;
  return ((k.GetTickCount() - li.dwTime) >>> 0) / 1000;
}

// The app in front: its exe path and window class (Progman/WorkerW = the bare desktop).
function foregroundApp() {
  if (!WIN) return null;
  const k = load();
  const hwnd = k.GetForegroundWindow();
  if (!hwnd) return null;
  const pid = [0];
  k.GetWindowThreadProcessId(hwnd, pid);
  if (!pid[0]) return null;
  const proc = k.OpenProcess(0x1000, false, pid[0]); // PROCESS_QUERY_LIMITED_INFORMATION
  if (!proc) return null;
  try {
    const buf = new Uint16Array(520);
    const size = [520];
    if (!k.QueryFullProcessImageNameW(proc, 0, buf, size)) return null;
    return { exe: String.fromCharCode(...buf.slice(0, size[0])), cls: className(hwnd) };
  } finally {
    k.CloseHandle(proc);
  }
}

module.exports = { idleSeconds, foregroundApp, pointer, tapKey, lock, broadcastThemeChange, taskbarAutoHide, setTaskbarAutoHide, getVolume, setVolume, setMute };
