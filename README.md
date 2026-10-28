# Mirage

A live wallpaper you can actually use. It sits behind your desktop icons and turns the desktop into
a home screen: sticky notes, to-dos, your GitHub graph, weather, music, a dock, Spotlight search and
a local AI assistant. No app window, it just becomes your desktop.

## Quick start

Needs **Windows 10/11** or **Linux** (see below), and **Node 22+**.

```bash
git clone <this repo>
cd <this repo>
npm install
npm start          # puts it on your desktop
```

`npm run stop` brings your normal wallpaper back. Run `npm link` once to use the `brow` command anywhere.

### Linux

Works on mainstream desktops: **Ubuntu 24.04 / 26.04, Fedora, Linux Mint, Pop!_OS** (GNOME), and KDE Plasma.
Same steps (`npm install`, `npm start`). Nothing extra is installed; Mirage uses the tools your distro already has.

```bash
npm run cli -- doctor      # shows which features work on this machine
npm run cli -- shortcuts   # Wayland (Ubuntu 26.04): adds Alt+W and Ctrl+Space as GNOME shortcuts
```

Good to know:
- On Wayland sessions Mirage runs through XWayland automatically; you don't need to change anything.
- If Ubuntu's desktop icons cover the wallpaper, turn off "Desktop Icons" in the Extensions app.
- Screen time in Wrapped and "pause when an app is maximized" are Windows-only for now.

## Shortcuts

| Key | Does |
| --- | --- |
| `Alt+W` | Edit mode: drag, resize and restyle widgets |
| `Ctrl+Space` | Spotlight: apps, files, settings, math, web, AI |
| Click on the wallpaper | Notes, to-dos, Wi-Fi (Control Center), dock, music all work |
| `•••` on a widget | Edit that widget (style, color, size, options) |

## Features

- **17 themes**, each with light and dark: Aurora, Midnight, Terminal, Cartoon, Blast, Weather, Paper, Synthwave, Zen, Retro, Bhakti, Pastel, Ocean, Sakura, Orbit, Forest, Astronomy
- **Widgets**: clock, GitHub contributions, sticky notes, to-dos, weather (click for full forecast), calendar, countdown, quote, Gita verse, system stats, Smart Stack, Now Playing, dock
- **Now Playing**: full-screen player with live artwork backdrop, visualizer and recently played (`H`)
- **Spotlight quick actions**: `note buy milk`, `todo call mom`, `ask plan my evening`
- **Local AI**: answers questions and organizes your to-dos, notes and countdowns (see below)
- **Weekly Wrapped**: top songs, commits, active time and most-used apps, shareable as a PNG
- **Live weather on the desktop**: rain or snow over any theme when it's really happening
- **Desktop pet**: a cat or bird that walks along the bottom of your screen

## Local AI (optional)

Runs fully on your PC with [Ollama](https://ollama.com). Nothing is sent online.

```bash
ollama pull llama3.1:8b      # one-time download (~5 GB)
```

Then press `Ctrl+Space` and type `ask sort my to-dos by urgency`, or use `brow ai <question>`.
Switch models with `brow ai models` and `brow ai model <name>`.

## CLI

Run `brow` for the interactive shell (type `/` for the menu), or one command at a time:

```bash
brow theme zen               # switch theme (brow themes lists them)
brow note ship it --pink     # pin a sticky note
brow todo record voiceover   # add a task; brow done 1 ticks it off
brow city Mumbai             # weather location
brow appearance dark         # light | dark | auto
brow pet bird                # cat | bird | off
brow fx snow                 # desktop weather: auto | off | rain | snow | storm
brow wrapped                 # this week's summary
brow autostart on            # start with Windows
brow help                    # everything else
```

## Settings and data

Everything is in `~/.mirage/` (`config.json`, song history, screen time). It never leaves your PC,
except weather, quotes and GitHub contributions, which are fetched from public APIs.

## Troubleshooting

- **Wallpaper is blank:** run `brow restart`.
- **Commit graph is empty:** `brow github <your-username>` or `brow repo scan <projects-folder>`.
- **AI says Ollama is missing:** install it from ollama.com, then `ollama pull llama3.1:8b`.

## License

MIT
