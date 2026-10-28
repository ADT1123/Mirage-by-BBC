// Renders the app/tray icon from SVG to PNG:  npx electron scripts/make-icon.cjs
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="2" y="2" width="60" height="60" rx="16" fill="#8b7bff"/>
  <path d="M18 22l11 10-11 10" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M34 44h13" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
</svg>`;

app.whenReady().then(async () => {
  const out = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(out, { recursive: true });
  const size = 256;
  const win = new BrowserWindow({ width: size, height: size, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}" style="width:${size}px;height:${size}px;display:block"></body></html>`;
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = (await win.webContents.capturePage()).resize({ width: size, height: size, quality: 'best' });
  for (const [name, px] of [['icon.png', 256], ['tray.png', 32]]) {
    fs.writeFileSync(path.join(out, name), img.resize({ width: px, height: px, quality: 'best' }).toPNG());
    console.log('wrote', name, px);
  }
  win.destroy();
  app.quit();
});
