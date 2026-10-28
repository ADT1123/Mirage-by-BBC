# Brow Wall

A live wallpaper that sits **behind your desktop icons** and that you can actually use:
click sticky notes and type on them, tick to-dos, open a macOS-style Control Center from
the menu bar, launch apps from a dock, and search everything with Spotlight. It also shows
your real GitHub contribution graph, live weather and daily quotes, with 11 theme packs,
a drag-and-drop editor and a Claude Code–style CLI.

No app window opens. It just becomes your desktop.

> The project name lives in `brand.json`. Rename everything (title, CLI command, logo,
> settings folder) with `npm run rename -- "Your Name" yourcommand`.

---

## Quick start

```bash
git clone <this repo>
cd <this repo>
npm install
npm start            # puts it on your desktop (npm run stop removes it)
```

Want the CLI everywhere?

```bash
npm link             # now `brow` works in any terminal
brow                 # opens the interactive shell
```

Without `npm link` you can use `npm run cli` (or `npm run cli -- theme bhakti`).

Requirements: Node 22+ and Windows 10/11. macOS and Linux are experimental; they use
Electron's desktop window type.

---

## The CLI

Run `brow` with no arguments for the interactive shell: a welcome screen, a `>` prompt,
and a `/` menu you drive with ↑ ↓ and Tab. `/theme` opens a picker that **previews each
theme live on your desktop** as you arrow through it.

Or run one command at a time:

```bash
brow start                       # put it on your desktop
brow theme synthwave             # switch theme
brow pack terminal               # theme + its own layout
brow note ship the reel --pink   # pin a sticky note
brow todo record voiceover       # add a task, `brow done 1` ticks it
brow countdown 2026-12-31 Launch # count down to a date
brow city Mumbai                 # weather city (default: detected from your network)
brow sky snow                    # force the Weather theme's sky (great for reels)
brow bg ~/Pictures/wall.jpg      # your own background image
brow edit                        # open the visual editor
brow spotlight                   # open Spotlight
brow player                      # full-screen Now Playing
brow appearance dark             # light / dark / auto (follows Windows)
brow dock add "C:/path/app.exe"   # put an app in the dock (brow dock reset = automatic)
brow taskbar hide                # auto-hide the Windows taskbar so the dock takes over
brow github ADT1123              # whose contribution graph to show (auto-detected)
brow stop                        # restore your normal wallpaper
```

`brow --help` lists everything.

## Use it like a desktop

Clicks on empty desktop space go to the wallpaper, so the widgets work like apps:

| Click | What happens |
| --- | --- |
| The Now Playing widget / menu-bar track | Full-screen Now Playing |
| A sticky note | It opens right where it is: type, pick a color, delete it |
| A to-do checkbox | Ticks it. Click the card to add, rename or remove tasks |
| Wi-Fi or battery in the menu bar | **Control Center**: Wi-Fi, Bluetooth, focus, dark mode, hide taskbar, brightness, volume + mute, media keys, screenshot, lock |
| The clock in the menu bar | A calendar with your countdowns |
| The `>_` logo or your name | App menu: Spotlight, edit, new note, themes, quit |
| The theme name | Switch theme |
| The repo name / a commit | Opens that repo in VS Code |
| The contribution graph | Opens your GitHub profile |
| A dock icon | Launches the app |

## Now Playing

Whatever your PC is playing (Spotify, Apple Music, YouTube or Prime Video in a browser…)
shows up in the **Now Playing** widget, the menu bar and the Control Center. Click it for
the full-screen player:

- big artwork on a living background made from the artwork's own colors
- a live progress bar (drag to seek when the player supports it), shuffle, repeat,
  previous / play-pause / next, and the real system volume
- a visualizer that reacts to your PC's audio output
- keys: **Space** play/pause, **← →** seek 10s, **N / P** next / previous, **Esc** close

Track info comes from Windows' own media controls. When an app doesn't share artwork or
the track length (browsers often don't), it's looked up on the iTunes Search API; video
without a match gets generated artwork instead.

## Light & dark

Every theme has a light and a dark version. **Auto** (the default) follows Windows, so
flipping Dark Mode in the Control Center restyles the wallpaper instantly. Force one with
`brow appearance light|dark|auto`, Settings in the editor, or the theme menu.

## Spotlight

Press **Ctrl+Space** (it falls back to Alt+Space and others if that's taken; `brow status`
shows the active key), click the search icon in the menu bar, or the one in the dock.

It searches your installed apps (including Store apps), files and folders in your user
folders, Windows settings pages, your git repos and the wallpaper's own actions. It
also does quick math (`12*(4+3)` then Enter copies `84`), and falls back to a web search.

- **Enter** opens, **Ctrl+Enter** shows the file in File Explorer
- **↑ ↓** move, **Esc** clears then closes
- Things you open often rise to the top

## The visual editor

Press **Ctrl+Alt+E** (or run `brow edit`, or click the tray icon). If another app already owns that shortcut, it falls back to **Ctrl+Shift+Alt+E**; `brow status` and the hint on your wallpaper show which one is active. The wallpaper lifts
up so you can:

- drag widgets around (pink guides snap to edges, centers and other widgets)
- drag the corner dot to resize
- type straight into notes, to-dos, quotes and countdown titles
- open **Themes**, **Widgets** and **Settings** from the dock at the bottom
- undo with Ctrl+Z, delete with Del, nudge with the arrow keys

Press **Esc** or **Done** to drop it back behind your icons.

## Theme packs

| Theme | Look |
| --- | --- |
| Aurora | Soft northern lights behind frosted glass |
| Midnight | Pure black, hairline type, an eclipse with a warm rim |
| Terminal | Phosphor-green CRT; the backdrop scrolls your real git log |
| Cartoon | Puffy clouds, rolling hills, chunky outlines |
| Blast | Pop-art comic panels and halftone explosions |
| Weather | A live sky that follows your real weather and the sun's position |
| Paper | Warm editorial paper; the masthead carries your name |
| Synthwave | Neon grid racing into a striped sun |
| Zen | Sand, sage, stones and a slowly breathing ensō |
| Retro | 90s desktop windows in pixel type |
| Bhakti | Diyas, a marigold toran, a Gita verse and a daily devotional painting |

`brow theme <name>` keeps your layout. `brow pack <name>` also applies the theme's own
arrangement.

## Widgets

Clock · Commit Graph · Commit Feed · Sticky Notes · To-do · Weather · Year Progress ·
System (CPU, memory, battery) · Calendar · Countdown · Quote · Menu Bar · Darshan
(daily painting) · Gita Verse.

## Where the data comes from

Everything on the wallpaper is live. Nothing is baked in.

| Widget | Source |
| --- | --- |
| Commit graph | Your public GitHub contribution calendar (same as your profile, no token). Falls back to local `git log` |
| Commit feed | `git log` from repos on your disk. Add folders with `brow repo scan <folder>` |
| Control Center | Windows itself: `netsh` for Wi-Fi, WMI for brightness, Core Audio for volume, the registry for dark mode |
| Spotlight | Start-menu apps (`Get-StartApps`), an in-memory index of your user folders, Windows settings |
| Weather | [Open-Meteo](https://open-meteo.com), free with no key |
| Your city (until you set one) | [ipapi.co](https://ipapi.co), approximate location from your IP |
| Quote of the day | [ZenQuotes](https://zenquotes.io) (an offline list is used when you're offline) |
| Gita verse | [vedicscriptures.github.io](https://vedicscriptures.github.io) |
| Darshan painting | [Wikimedia Commons](https://commons.wikimedia.org). Only files marked **public domain** are used (e.g. Raja Ravi Varma), and the artist is credited on screen |
| System + battery | your OS |

Daily content is cached in your settings folder, so the wallpaper still looks right
offline.

## Settings

Everything lives in one file, `~/.brow-wall/config.json`. The CLI, the editor and the
tray all write to it, and the wallpaper reloads the moment it changes. Edit it by hand
if you like. Logs go to `~/.brow-wall/app.log`.

## How it works

- **Electron** renders the wallpaper with plain HTML/CSS/JS (`src/renderer`).
- **Koffi** calls the Windows API directly (`src/main/desktop.cjs`) to parent the window
  between the desktop icons and the system wallpaper. It handles both the classic layout
  and the Windows 11 24H2+ "raised desktop".
- A tiny localhost server (requests must carry a custom header) lets the CLI start,
  stop and open the editor.
- **Ink** powers the terminal UI (`cli/`).

```
brand.json            project name, CLI command, settings folder
src/main/             Electron main: desktop pinning, tray, hotkey, data feeds
src/renderer/         wallpaper + editor (widgets, scenes, themes)
src/shared/           themes, widgets, layout packs, config (shared with the CLI)
cli/                  the interactive shell and one-shot commands
scripts/              snapshot (renders every theme to PNG), icon, rename
```

`npm run snapshot -- ./snapshots` renders every theme to a PNG without touching your
desktop. It's handy for previews and reels.

## Troubleshooting

- **Nothing shows behind the icons:** run `brow restart`. If it's still blank, try
  without GPU acceleration: set `WALL_NO_GPU=1` and run `npm run dev` (runs in the foreground with logs).
- **Explorer restarted:** the wallpaper re-attaches itself within a few seconds.
- **Commit graph is empty:** `brow repo scan <folder-with-your-projects>`.
- **Running from VS Code's terminal:** `brow start` takes care of the
  `ELECTRON_RUN_AS_NODE` variable VS Code sets.

## License

MIT
#   M i r a g e - b y - B B C  
 