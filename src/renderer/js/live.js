// Live wallpaper interactions. Clicks reach this page because the main process forwards
// clicks on the bare desktop. Anything that needs typing opens a small focused popup.

import { pokePet } from './ambient.js';

export function enableLive(app) {
  document.body.classList.add('live');

  // "New sticky note" from the menu or Spotlight: open its editor straight away
  window.wall.onLiveOpen((id) => {
    const target = app.recs.get(id)?.el.querySelector('[data-act="note"], [data-act="todo"]');
    target?.click();
  });

  // the menu bar hides itself (unless pinned) and slides down when the mouse reaches the top edge.
  // Only real positions on the desktop count: moving into a popup (Control Center, calendar)
  // sends no position here, so the bar stays while you use it.
  let barTimer = 0;
  document.addEventListener('mousemove', (e) => {
    if (!document.body.classList.contains('mb-auto') || e.clientX < 0 || e.clientY < 0) return;
    const bar = document.querySelector('.w-menubar');
    const h = bar ? bar.getBoundingClientRect().height : 32;
    if (e.clientY <= 4) {
      clearTimeout(barTimer);
      document.body.classList.add('mb-show');
    } else if (e.clientY > h + 24 && document.body.classList.contains('mb-show')) {
      clearTimeout(barTimer);
      barTimer = setTimeout(() => document.body.classList.remove('mb-show'), 500);
    } else if (e.clientY <= h + 24) clearTimeout(barTimer);
  });

  // website links light up only while Ctrl is held
  const ctrlHeld = (on) => document.body.classList.toggle('ctrl-held', on);
  document.addEventListener('mousemove', (e) => ctrlHeld(e.ctrlKey));
  document.addEventListener('mouseleave', () => ctrlHeld(false));

  app.stage.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const el = t.closest('.w');
    // links that leave for a website need Ctrl+click, so a stray click never opens the browser
    if (['url', 'github'].includes(t.dataset.act) && !e.ctrlKey) return;
    const id = el?.dataset.id;
    const act = t.dataset.act;
    const arg = t.dataset.arg;
    const r = t.getBoundingClientRect();

    switch (act) {
      case 'note':
      case 'todo': {
        const w = app.cfg.widgets.find((x) => x.id === id);
        const box = el.getBoundingClientRect();
        return window.wall.popup(act, { id, scale: w?.scale || 1, anchor: { x: box.x, y: box.y, w: box.width, h: box.height } });
      }
      case 'todo-toggle':
        return app.commit((c) => {
          const w = c.widgets.find((x) => x.id === id);
          const it = w?.items?.[Number(t.dataset.i)];
          if (it) it.done = !it.done;
        });
      case 'settings-panel':
        return window.wall.popup('settings', { y: Math.round(r.bottom + 6) });
      case 'control':
      case 'calendar':
        return window.wall.popup(act, { y: Math.round(r.bottom + 6) });
      case 'projects':
        return window.wall.popup('projects', { x: Math.max(6, Math.round(r.x - 10)), y: Math.round(r.bottom + 6), at: 'left' });
      case 'menu':
      case 'themes':
        return window.wall.popup('menu', { id: act === 'themes' ? 'themes' : '', x: Math.max(6, Math.round(r.x - 10)), y: Math.round(r.bottom + 6), at: 'left' });
      case 'weather': {
        const box = (el.querySelector('.weather') || el).getBoundingClientRect();
        const right = box.right + 12;
        const x = right + 440 < innerWidth ? right : Math.max(8, box.x - 452);
        return window.wall.popup('weather', { x: Math.round(x), y: Math.round(Math.max(36, Math.min(box.y, innerHeight - 640))) });
      }
      case 'stack-go':
        return app.stackGo(id, Number(t.dataset.i));
      case 'widget-edit': {
        const box = el.getBoundingClientRect();
        const right = box.right + 12;
        const x = right + 330 < innerWidth ? right : Math.max(8, box.x - 342);
        return window.wall.popup('widget', { id, x: Math.round(x), y: Math.round(Math.max(36, box.y)) });
      }
      case 'media':
        return window.wall.mediaCmd(arg);
      case 'player':
        return window.wall.openPlayer();
      case 'chat': {
        const box = (el?.querySelector('.card') || el || t).getBoundingClientRect();
        const right = box.right + 12;
        const x = right + 380 < innerWidth ? right : Math.max(8, box.x - 392);
        return window.wall.popup('chat', { id: arg || '', x: Math.round(x), y: Math.round(Math.max(36, Math.min(box.y, innerHeight - 560))) });
      }
      case 'pet':
        return pokePet();
      case 'github':
        return window.wall.action('url', `https://github.com/${arg}`);
      default:
        // repo, url, launch, spotlight
        return window.wall.action(act, arg);
    }
  });
}
