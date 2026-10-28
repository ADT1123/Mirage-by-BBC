// Pins an Electron window behind the desktop icons (the "wallpaper layer").
//
// Windows has two desktop layouts:
//  - Classic (Win10 / Win11 before 24H2): Progman spawns a top-level WorkerW
//    behind the icon host; we parent our window into that WorkerW.
//  - Raised desktop (Win11 24H2+): Progman owns both SHELLDLL_DefView (icons)
//    and a WorkerW child; we become a layered child of Progman, sandwiched
//    between the icons and the WorkerW.

const os = require('os');

let api = null;

function load() {
  if (api) return api;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');

  const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(intptr_t hwnd, intptr_t lParam)');

  api = {
    FindWindowW: user32.func('intptr_t __stdcall FindWindowW(str16 cls, str16 name)'),
    FindWindowExW: user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 cls, str16 name)'),
    SendMessageTimeoutW: user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wParam, intptr_t lParam, uint32_t flags, uint32_t timeout, void *result)'),
    EnumWindows: user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)'),
    SetParent: user32.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
    GetParent: user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)'),
    GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
    SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
    SetLayeredWindowAttributes: user32.func('bool __stdcall SetLayeredWindowAttributes(intptr_t hwnd, uint32_t key, uint8_t alpha, uint32_t flags)'),
    ShowWindow: user32.func('bool __stdcall ShowWindow(intptr_t hwnd, int cmd)'),
    GetSystemMetrics: user32.func('int __stdcall GetSystemMetrics(int index)'),
    IsWindow: user32.func('bool __stdcall IsWindow(intptr_t hwnd)'),
    InvalidateRect: user32.func('bool __stdcall InvalidateRect(intptr_t hwnd, void *rect, bool erase)'),
  };
  return api;
}

const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const WS_CAPTION = 0x00c00000;
const WS_THICKFRAME = 0x00040000;
const WS_EX_LAYERED = 0x00080000;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_APPWINDOW = 0x00040000;
const LWA_ALPHA = 0x2;
const SMTO_NORMAL = 0x0;
const SWP_NOSIZE = 0x1;
const SWP_NOMOVE = 0x2;
const SWP_NOACTIVATE = 0x10;
const SWP_SHOWWINDOW = 0x40;
const SWP_FRAMECHANGED = 0x20;
const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;

function hwndOf(win) {
  const buf = win.getNativeWindowHandle();
  return Number(buf.length >= 8 ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0));
}

// Ask Progman to create the wallpaper WorkerW and figure out which layout we're on.
function findDesktopHost() {
  const w = load();
  const progman = w.FindWindowW('Progman', null);
  if (!progman) throw new Error('Progman window not found');

  w.SendMessageTimeoutW(progman, 0x052c, 0xd, 0x1, SMTO_NORMAL, 1000, null);
  w.SendMessageTimeoutW(progman, 0x052c, 0, 0, SMTO_NORMAL, 1000, null);

  const raisedWorker = w.FindWindowExW(progman, 0, 'WorkerW', null);
  if (raisedWorker) {
    const defView = w.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
    return { mode: 'raised', parent: progman, defView, workerw: raisedWorker };
  }

  let workerw = 0;
  w.EnumWindows((top) => {
    if (w.FindWindowExW(top, 0, 'SHELLDLL_DefView', null)) {
      workerw = w.FindWindowExW(0, top, 'WorkerW', null);
    }
    return true;
  }, 0);
  if (!workerw) throw new Error('Desktop WorkerW not found');
  return { mode: 'classic', parent: workerw };
}

// rect is in physical screen pixels.
function attach(win, rect) {
  if (os.platform() !== 'win32') return null;
  const w = load();
  const hwnd = hwndOf(win);
  const host = findDesktopHost();

  let style = Number(w.GetWindowLongPtrW(hwnd, GWL_STYLE));
  style = (style & ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME)) | WS_CHILD;
  w.SetWindowLongPtrW(hwnd, GWL_STYLE, style);

  let ex = Number(w.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  ex = (ex & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW;
  if (host.mode === 'raised') ex |= WS_EX_LAYERED;
  w.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
  if (host.mode === 'raised') w.SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);

  w.SetParent(hwnd, host.parent);

  // Child coordinates are relative to the host, which spans the virtual screen.
  const ox = w.GetSystemMetrics(SM_XVIRTUALSCREEN);
  const oy = w.GetSystemMetrics(SM_YVIRTUALSCREEN);
  const after = host.mode === 'raised' && host.defView ? host.defView : 0;
  const flags = SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED | (after ? 0 : 0x4 /* SWP_NOZORDER */);
  w.SetWindowPos(hwnd, after, rect.x - ox, rect.y - oy, rect.width, rect.height, flags);

  if (host.mode === 'raised') {
    // Keep the shell's own wallpaper WorkerW underneath us.
    w.SetWindowPos(host.workerw, hwnd, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }
  return { hwnd, mode: host.mode, parent: host.parent };
}

function isAttached(info) {
  if (!info) return false;
  const w = load();
  return w.IsWindow(info.parent) && w.GetParent(info.hwnd) === info.parent;
}

// Repaints the static wallpaper after we leave, so no stale frame stays on screen.
function refreshDesktop() {
  if (os.platform() !== 'win32') return;
  try {
    const w = load();
    const progman = w.FindWindowW('Progman', null);
    if (progman) w.InvalidateRect(progman, null, true);
  } catch {}
}

// Other wallpaper apps (Wallpaper Engine, Lively…) put their windows in the same place.
// Re-assert our spot every few seconds so Mirage stays on top of them, just under the icons.
function raise(info) {
  if (os.platform() !== 'win32' || !info?.hwnd) return;
  try {
    const w = load();
    const flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
    if (info.mode === 'raised') {
      const defView = w.FindWindowExW(info.parent, 0, 'SHELLDLL_DefView', null);
      if (defView) w.SetWindowPos(info.hwnd, defView, 0, 0, 0, 0, flags);
    } else {
      w.SetWindowPos(info.hwnd, 0 /* HWND_TOP among the desktop's children */, 0, 0, 0, 0, flags);
    }
  } catch {}
}

module.exports = { attach, isAttached, raise, refreshDesktop, findDesktopHost, hwndOf };
