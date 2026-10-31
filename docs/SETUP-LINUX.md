# Mirage on Linux: setup guide

This guide takes you from nothing to Mirage running on your desktop. You don't need to be a developer.
You'll type a few commands into a terminal. Copy and paste them exactly.

Mirage works on mainstream desktops: **Ubuntu 24.04 / 26.04, Fedora, Linux Mint, Pop!_OS** (GNOME), and **KDE Plasma**.
Nothing extra is installed; Mirage uses the tools your distro already has.

---

## 1. What you need

| Thing | Why | Where to get it |
| --- | --- | --- |
| **Node.js 22 or newer** | Runs Mirage | [nodejs.org](https://nodejs.org/en/download) or your package manager (check the version) |
| **Git** | Downloads Mirage and keeps it updated | Your package manager, or [git-scm.com](https://git-scm.com/downloads) |
| About 1 GB of free space | Mirage plus its parts | |
| An internet connection | For the first install and for updates | |

Ollama (for the local AI) is optional. See [Optional: the local AI](#optional-the-local-ai).

### Check what you already have

1. Open a **terminal** (on Ubuntu: `Ctrl+Alt+T`).
2. Paste this and press Enter:

   ```bash
   node --version
   git --version
   ```

3. What you should see:
   - `node --version` prints something like `v22.x.x` or higher. The first number must be **22 or more**.
   - `git --version` prints `git version ...`.

### Install Git (if missing)

```bash
# Ubuntu, Linux Mint, Pop!_OS
sudo apt install git

# Fedora
sudo dnf install git
```

### Install Node.js 22+ (if missing or too old)

The `nodejs` package that comes with some distros is older than 22. Ubuntu's built-in one often is.
Always check with `node --version` after installing.

- **Recommended:** go to [nodejs.org/en/download](https://nodejs.org/en/download), choose Linux, and follow the steps it shows.
- **Fedora:** `sudo dnf install nodejs` may already give you 22 or newer. Check the version. If it's older, use nodejs.org.

After installing, **close the terminal and open a new one**, then run `node --version` again.

---

## Steps 2 to 5 in one command

Have Git and Node 22+? Then you can skip steps 2, 3, 4 and 5. Paste this into your terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/ADT1123/Mirage-by-BBC/main/scripts/install.sh | bash
```

It does what those four steps do, in order: downloads Mirage into `$HOME/Mirage-by-BBC`, runs
`npm install`, runs `npm link` so the `bro` command works, and starts Mirage. It prints each step as
it goes and stops with a plain explanation if one fails.

It installs nothing on its own, and it never runs `sudo`. If Git or Node 22+ is missing it shows you
the command for your distro and stops, so you stay in charge of what lands on your PC. If `npm link`
hits a permission error it prints the `sudo npm link` line for you to run yourself.

Options go after `--`:

```bash
curl -fsSL https://raw.githubusercontent.com/ADT1123/Mirage-by-BBC/main/scripts/install.sh | bash -s -- --dir ~/apps/Mirage-by-BBC
curl -fsSL https://raw.githubusercontent.com/ADT1123/Mirage-by-BBC/main/scripts/install.sh | bash -s -- --no-start
```

`--dir <folder>` picks where Mirage goes. `--no-start` installs it without starting it.

When it prints **All set**, carry on at [6. Check your PC and set up shortcuts](#6-check-your-pc-and-set-up-shortcuts).

**Rather not pipe a script into bash?** Fair enough. Steps 2 to 5 below are the same commands, one at
a time, so you can see each one before you run it. You can also read the script first:
`curl -fsSL <that URL> | less`.

---

## 2. Get Mirage

1. Go to your home folder:

   ```bash
   cd ~
   ```

2. Download Mirage with Git:

   ```bash
   git clone https://github.com/ADT1123/Mirage-by-BBC.git
   ```

   You should see `Cloning into 'Mirage-by-BBC'...` and a few progress lines.

3. Go into the new folder:

   ```bash
   cd Mirage-by-BBC
   ```

> **Use `git clone`, not "Download ZIP".** Mirage updates itself through Git. A ZIP copy can't update.
>
> **Pick the folder once and leave it there.** The login autostart and the GNOME shortcuts point to this folder.
> If you move it later, turn autostart off and on again, and run `bro shortcuts` again.

---

## 3. Install Mirage's parts

Still inside the `Mirage-by-BBC` folder:

```bash
npm install
```

This downloads Electron and the other parts Mirage needs. It can take a few minutes the first time.

**What you should see:** a summary like `added ... packages` at the end. Warnings (`npm warn ...`) are fine.
Don't use `sudo` for this step.

---

## 4. Start it

```bash
npm start
```

**What you should see** within about 10 seconds:

```
⏺ Mirage is live on your desktop
  ⎿  Press Alt+W (or /edit) to drag things around
     Look for the tray icon to switch themes or quit
```

Then show your desktop. It's now the Mirage wallpaper.

- You can close the terminal now. Mirage keeps running.
- Mirage's menu bar starts just below your desktop's own top panel.

**The first time only**, a short setup panel opens after a couple of seconds:

1. **Pick a look** — eight live wallpapers, one from each pack. The small previews are the real thing.
2. **What goes on it** — tick the widgets you want. You can add the rest later.
3. **About you** — your name for the greeting, your city for weather and sunset times.
4. **How hard should it work** — Automatic, Balanced or High.

**Skip** leaves the default desktop. Either way the panel does not come back. To change any of it
later, press `Alt+W` or run `bro settings`.

In your app menu and system monitor Mirage shows up as **Mirage**, with its own icon, rather than
as "Electron".

**On Wayland** (the default on recent Ubuntu and Fedora), Mirage runs through XWayland automatically. You don't need to change anything.

If it says *"It did not start in time"*, see [Troubleshooting](#troubleshooting).

---

## 5. Turn on the `bro` command

`bro` lets you control Mirage from any terminal. Inside the `Mirage-by-BBC` folder, run once:

```bash
npm link
```

Then test it from anywhere:

```bash
bro status
```

**What you should see:** `Mirage is running`, followed by your wallpaper, style, widgets, city and clock settings.

**If `npm link` fails with `EACCES` / permission denied**, your Node install keeps global commands in a system folder.
Run `sudo npm link` instead, or skip it. Every command also works from inside the Mirage folder as
`npm run cli -- <command>`, for example `npm run cli -- status`.

---

## 6. Check your PC and set up shortcuts

### See which features work here

```bash
bro doctor
```

(or `npm run cli -- doctor` without `npm link`)

It shows your desktop, whether you're on Wayland or X11, and a line for each feature.
`✓` means it works. `·` means it's off, with the reason in brackets. A missing tool only turns that one feature off.

| Feature | Uses | Notes |
| --- | --- | --- |
| Now Playing + brightness | `gdbus` (part of GLib) | Brightness can also use `brightnessctl` if you have it |
| Volume | `wpctl` (PipeWire) or `pactl` (PulseAudio) | |
| Sound output picker | `pactl` | |
| Wi-Fi list and connect | `nmcli` (NetworkManager) | |
| Dark mode, dock auto-hide, shortcuts | `gsettings` | GNOME only |
| Power mode | `powerprofilesctl` (power-profiles-daemon) | |
| Lock screen | `loginctl` (systemd) | |
| Dock and Spotlight app launching | `gtk-launch` | Falls back to running the app directly |
| Updates | `git` | |
| Assistant (local AI) | `ollama` | Optional |

### Make `Alt+W` and `Ctrl+Space` work on Wayland (GNOME)

On Wayland, apps can't grab keyboard shortcuts for the whole system. So on GNOME, run this once:

```bash
bro shortcuts
```

**What you should see:**

```
⏺ Added to GNOME keyboard shortcuts
  ⎿  Alt+W  rearrange
     Ctrl+Space  Spotlight
     Change them in Settings → Keyboard → Custom Shortcuts
```

This adds two custom shortcuts, *Mirage: rearrange* and *Mirage: Spotlight*. Nothing else is touched.

- On an **X11** session the shortcuts already work without this step.
- On **KDE Plasma (Wayland)** or other desktops, `bro shortcuts` can't add them for you. Add two custom shortcuts
  in your desktop's settings that run `bro edit` and `bro spotlight`. If the shortcut does nothing,
  use the full path that `command -v bro` prints.

---

## 7. Start Mirage when you log in

```bash
bro autostart on
```

If Mirage is running, this is applied right away. If not, it's applied the next time Mirage starts.
In Settings the same switch is labelled **Start with Windows**; on Linux it does the same job.

This creates a small file at `~/.config/autostart/mirage.desktop`. Check it's there:

```bash
ls ~/.config/autostart/mirage.desktop
```

Log out and back in to test it.

To turn it off: `bro autostart off`.

---

## 8. Everyday use

### Shortcuts

| Key | Does |
| --- | --- |
| `Alt+W` | Edit mode: drag, resize and restyle widgets |
| `Ctrl+Space` | Spotlight: apps, files, settings, math, web, AI |
| Click on the wallpaper | Notes, to-dos, Wi-Fi (Control Center), dock, music all work |
| `•••` on a widget | Edit that widget (style, color, size, options) |

On X11, if another app already uses `Alt+W`, Mirage tries `Alt+Shift+W`, then `Ctrl+Alt+W`, then `Ctrl+Shift+Alt+E`.
If `Ctrl+Space` is taken, it tries `Alt+Space`, `Ctrl+Shift+Space`, then `Ctrl+Alt+Space`.
Run `bro status` to see which edit key you got.

### Edit mode (`Alt+W`)

- Drag a widget to move it. Drag its corner to resize.
- Double-click a widget to edit it.
- `Ctrl+D` duplicates, `+` and `−` change size, `Ctrl+Z` / `Ctrl+Y` undo and redo.
- The bar at the bottom has **Wallpapers**, **Widgets**, **Settings**, a reset button, and **Done**.
- Press `Esc` or click **Done** when you're finished.

### The menu bar

The bar along the top of the wallpaper has:

- **The logo** (top left): Search, New note, Rearrange, Wallpapers, Settings, Restart wallpaper, Quit Mirage.
- **Battery, sound, Wi-Fi**: click each for a quick menu.
- **Search**: opens Spotlight.
- **Control Center** (the toggles icon): Wi-Fi, Bluetooth, dark mode, dock auto-hide, animations, screenshot,
  rearrange, wallpaper picker, lock, settings, plus sliders for brightness, volume and wallpaper blur.
- **The date**: opens the calendar.
- **Update**: only shows when a new version is ready (see [Updating](#9-updating)).

On Linux, the Control Center's buttons use your desktop's tools:

- **Dark mode** changes GNOME's own dark style setting.
- **Taskbar** hides or pins the Ubuntu Dock.
- **Snip** opens GNOME Screenshot, or Spectacle on KDE.
- **Settings pages** (Wi-Fi, Bluetooth, Display, Sound, Power) open GNOME Settings, or System Settings on KDE.

### Settings

Open **Control Center → Settings**, or the logo menu → **Settings**. Click **More settings** for:

- **Performance**: Auto, Battery saver, Full quality. On **Auto**, a laptop running on battery drops
  the wallpaper a quality step, and below 20% charge the wallpaper stops animating until you plug in.
  **Full quality** turns both off.
- **Wallpaper quality**: Auto, Low, Balanced, High.
- **Graphics**: Fast GPU or Power saving (for laptops with two graphics chips).
- Season, desktop pet, widget style, corners and font.
- Switches for animations, live weather, menu bar, album art wallpaper, music visualizer, 24-hour clock,
  hide taskbar, and autostart.
- Your own **Rearrange** and **Spotlight** shortcuts (these are Mirage's own keys; on Wayland use `bro shortcuts` instead).
- Your name and city.
- **Photo drifts and tilts** (only when you use your own photo as the background): the photo moves
  slowly and leans a little towards the pointer.

Control Center also shows a small row with what the wallpaper is costing right now — its quality,
frame rate, how sharp it is rendering and its share of the graphics card.

### The tray icon

Right-click the Mirage tray icon for: Edit wallpaper, Spotlight, Now Playing, Weekly Wrapped, Check for updates,
Wallpaper, Widget style, Motion, Restart wallpaper and Quit.
Some desktops (plain GNOME without a tray extension) don't show tray icons. Everything is also in the logo menu and in `bro`.

### Useful `bro` commands

Run `bro` alone for the interactive shell (type `/` for the menu, `Ctrl+C` to leave).
Or run one command at a time:

| Command | Does |
| --- | --- |
| `bro start` / `bro stop` / `bro restart` | Start, stop (normal wallpaper comes back), restart |
| `bro status` | Is it running, and what's on it |
| `bro edit` | Open edit mode |
| `bro spotlight` | Open Spotlight |
| `bro walls` then `bro wall <name>` | List wallpapers, then pick one |
| `bro themes` then `bro theme <name>` | List styles, then pick one |
| `bro widgets`, `bro add <widget>`, `bro remove <widget>` | Show, add or remove widgets |
| `bro note <text>` | Pin a sticky note (add `--pink`, `--blue`, `--green` or `--purple`) |
| `bro todo <task>`, `bro done <number>` | Add a to-do, tick one off |
| `bro city <name>` | Weather location (`bro city auto` to detect it) |
| `bro appearance auto\|light\|dark\|sun` | Light or dark version of every theme |
| `bro motion on\|off` | Animations on or off (saves battery) |
| `bro taskbar hide\|show` | Hide or pin the Ubuntu Dock |
| `bro reset` | Put the widgets back to the current theme's layout |
| `bro settings`, `bro set <name> <value>` | See every setting, or change one |
| `bro export` | Pack your whole look into one code to send a friend |
| `bro import <code>` | Put on a setup someone sent you (your notes and details stay yours) |
| `bro config` | Show where your settings file is |
| `bro doctor` | Check what works on this PC |
| `bro shortcuts` | GNOME: add `Alt+W` and `Ctrl+Space` as system shortcuts |
| `bro help` | Everything else |

### Good to know

- Screen time in Wrapped and "pause when an app is maximized" are Windows-only for now.

### Optional: the local AI

The Assistant runs on your PC with [Ollama](https://ollama.com). Install Ollama from its site, then:

```bash
ollama pull llama3.1:8b
```

That's a one-time download of about 5 GB. Then press `Ctrl+Space` and type `ask plan my evening`, or run `bro ai <question>`.

---

## 9. Updating

### The easy way: the Update pill

Mirage checks GitHub for a new version shortly after it starts, then every 5 minutes, and again when your PC wakes up.

When there's a new version:

1. An **Update ready** pill appears on the wallpaper, an **Update** item appears in the menu bar, and you get a desktop notification.
2. Click **Install** on the pill. A panel shows what's new.
3. Click **Update now**. Mirage downloads the update, installs new parts if needed, and restarts itself.

Click the **x** on the pill to hide it until the next update. You can also check any time: tray icon → **Check for updates**.

The in-app update only works when:

- Your copy came from `git clone` (not a ZIP). Otherwise it says *"This copy was not cloned with git"*.
- You haven't changed any files in the Mirage folder. A changed `package-lock.json` is fine; Mirage resets it for you.
  Any other changed file gives *"You have changed files in this folder. Commit or undo them first, then update"*.

### The manual way

```bash
cd ~/Mirage-by-BBC
git pull
npm install
bro restart
```

**If `git pull` complains** that your local changes to `package-lock.json` would be overwritten, run:

```bash
git checkout package-lock.json
git pull
```

If it lists other files, run `git status` to see them. `git stash` puts your changes aside so the pull can go ahead.

---

## 10. Stopping Mirage and getting your normal wallpaper back

```bash
bro stop
```

You should see `Stopped` and `Your normal wallpaper is back`. Mirage never replaces your desktop wallpaper; it just sits on top of it.

Other ways to stop it: tray icon → **Quit Mirage**, logo menu → **Quit Mirage**, or `npm run stop` inside the folder.

A few switches change your desktop's own settings and stay as they are after Mirage stops:

- **Taskbar / dock hide:** run `bro taskbar show` while Mirage is running, or change it back in GNOME Settings → Ubuntu Desktop → Dock.
- **Dark mode** from the Control Center: change it back in your desktop's Appearance settings if you like.

To start again later: `bro start`.

---

## 11. Uninstalling

Do these in order:

1. **Make sure Mirage is running** (`bro start`), then turn off autostart and pin the dock again:

   ```bash
   bro autostart off
   bro taskbar show
   ```

2. **Stop Mirage:**

   ```bash
   bro stop
   ```

3. **Remove the autostart file and the app-menu entry** (Mirage adds a "Mirage" launcher to your app menu):

   ```bash
   rm -f ~/.config/autostart/mirage.desktop ~/.local/share/applications/mirage.desktop
   ```

4. **Remove the GNOME shortcuts** (only if you ran `bro shortcuts`): open Settings → Keyboard → Custom Shortcuts
   and delete *Mirage: rearrange* and *Mirage: Spotlight*.

5. **Remove the `bro` command:**

   ```bash
   npm unlink -g mirage
   ```

   Use `sudo npm unlink -g mirage` if you needed `sudo` for `npm link`.

6. **Delete the Mirage folder:**

   ```bash
   cd ~
   rm -rf ~/Mirage-by-BBC
   ```

7. **Delete your settings and data** (notes, to-dos, song history, log):

   ```bash
   rm -rf ~/.mirage
   ```

8. **Optional leftovers:**
   - `~/.config/mirage`: Mirage's browser data, including any high-quality planet maps Mirage downloaded. Remove with `rm -rf ~/.config/mirage`.
   - `~/Pictures/Mirage`: Weekly Wrapped images you shared. Keep or delete them yourself.
   - Node.js, Git and Ollama are separate. Remove them with your package manager if you don't need them.

---

## Troubleshooting

### First, run the check-up

```bash
bro doctor
```

It lists every feature and the tool it needs. See [step 6](#6-check-your-pc-and-set-up-shortcuts).

### Where's the log?

When Mirage is started with `bro start`, `bro restart`, `bro edit` or `npm start`, it writes a log to:

```
~/.mirage/app.log
```

Show the last lines:

```bash
tail -n 40 ~/.mirage/app.log
```

When Mirage starts on its own at login, nothing is written to this log. Use `bro restart` to get a fresh log.

### "It did not start in time"

1. Run `bro restart`.
2. If it still fails, read the log (see above).
3. Make sure `npm install` finished without errors. Run it again inside the Mirage folder if unsure.

### The log mentions `chrome-sandbox`

Some systems (recent Ubuntu in particular) block Electron's sandbox helper. If the log says the
`chrome-sandbox` helper "is not configured correctly", run this inside the Mirage folder:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
bro restart
```

You may need to do this again after an update that reinstalls Electron.

### Ubuntu's desktop icons cover the wallpaper

Turn off **Desktop Icons** in the **Extensions** app. Then run `bro restart`.

### The wallpaper is blank or black

Try these one at a time:

1. `bro restart` (or logo menu → **Restart wallpaper**).
2. Settings → More settings → **Wallpaper quality** → **Low**, and **Performance** → **Battery saver**.
3. Settings → More settings → **Graphics**: switch between **Fast GPU** and **Power saving**. Mirage restarts.
4. Make sure your graphics drivers are installed and up to date (your distro's "Additional Drivers" or driver tool).
5. Test without the graphics card. This lasts only for this run:

   ```bash
   bro stop
   WALL_NO_GPU=1 bro start
   ```

   If the wallpaper shows now, the problem is the graphics driver or setting. Run `bro restart` to go back to normal.

### Wayland notes

- Mirage always runs through XWayland. Recent GNOME and KDE sessions include it, so there's nothing to set up.
- Keyboard shortcuts for the whole system don't work for apps on Wayland. Run `bro shortcuts` on GNOME,
  or add custom shortcuts by hand on other desktops (see [step 6](#make-altw-and-ctrlspace-work-on-wayland-gnome)).
- Check your session type with `echo $XDG_SESSION_TYPE`, or look at the "session" line in `bro doctor`.

### `Alt+W` or `Ctrl+Space` does nothing

- On Wayland: run `bro shortcuts` (GNOME) or add the shortcuts by hand (other desktops).
- On X11: another app probably uses that key. Run `bro status` to see the edit key Mirage got,
  or set your own in Settings → More settings → **Rearrange shortcut** / **Spotlight shortcut**.
- You can always use the logo menu, `bro edit` or `bro spotlight`.

### A feature shows as off in `bro doctor`

Each feature uses a standard tool (see the table in [step 6](#6-check-your-pc-and-set-up-shortcuts)).
If yours is missing, that feature stays off and everything else keeps working.
Dark mode, dock auto-hide and `bro shortcuts` need GNOME.

### `node`, `git` or `bro`: "command not found"

- Close the terminal and open a new one. New installs only show up in new windows.
- For `bro`: run `npm link` inside the Mirage folder again, or use `npm run cli -- <command>` from inside the folder.

### Update problems

| Message | Fix |
| --- | --- |
| *This copy was not cloned with git* | Uninstall, then get Mirage again with `git clone` (step 2). |
| *Couldn't reach GitHub* / *Could not download the update* | Check your internet, then try again. |
| *You have changed files in this folder* | See [The manual way](#the-manual-way): `git status`, then `git stash` or `git checkout <file>`. |
| *Downloaded, but installing new parts failed. Run npm install* | Run `npm install` inside the Mirage folder, then `bro restart`. |

### Start over with fresh settings

```bash
bro stop
mv ~/.mirage ~/.mirage-backup
bro start
```

Mirage creates new default settings. Delete `~/.mirage-backup` later if you don't need it.
To reset only the widget layout, use `bro reset` instead.

### More fixes

- **Commit graph is empty:** `bro github <your-username>` or `bro repo scan <projects-folder>`.
- **AI says Ollama is missing:** install it from [ollama.com](https://ollama.com), then `ollama pull llama3.1:8b`.
- **Wrong weather city:** `bro city <your city>`.
