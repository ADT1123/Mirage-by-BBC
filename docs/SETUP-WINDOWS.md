# Mirage on Windows: setup guide

This guide takes you from nothing to Mirage running on your desktop. You don't need to be a developer.
You'll type a few commands into PowerShell. Copy and paste them exactly.

Works on **Windows 10** and **Windows 11** (including the newer 24H2 desktop).

---

## 1. What you need

| Thing | Why | Where to get it |
| --- | --- | --- |
| **Node.js 22 or newer** | Runs Mirage | [nodejs.org](https://nodejs.org) (pick the LTS installer) |
| **Git** | Downloads Mirage and keeps it updated | [git-scm.com](https://git-scm.com/downloads) |
| About 1 GB of free space | Mirage plus its parts | |
| An internet connection | For the first install and for updates | |

Ollama (for the local AI) is optional. See [Optional: the local AI](#optional-the-local-ai).

### Check what you already have

1. Open **PowerShell**: press the Windows key, type `PowerShell`, press Enter.
2. Paste this and press Enter:

   ```powershell
   node --version
   git --version
   ```

3. What you should see:
   - `node --version` prints something like `v22.x.x` or higher. The first number must be **22 or more**.
   - `git --version` prints `git version ...`.

If either says *"is not recognized as the name of a cmdlet"*, or Node shows a number below 22, install it:

- **Node.js:** go to [nodejs.org](https://nodejs.org), download the Windows installer (LTS), run it, keep the default options.
- **Git:** go to [git-scm.com](https://git-scm.com/downloads), download Git for Windows, run it, keep the default options.

After installing, **close PowerShell and open a new one**, then run the two commands again.

---

## 2. Get Mirage

1. In PowerShell, go to your home folder (a good place to keep it):

   ```powershell
   cd $HOME
   ```

2. Download Mirage with Git:

   ```powershell
   git clone https://github.com/ADT1123/Mirage-by-BBC.git
   ```

   You should see `Cloning into 'Mirage-by-BBC'...` and a few progress lines.

3. Go into the new folder:

   ```powershell
   cd Mirage-by-BBC
   ```

> **Use `git clone`, not "Download ZIP".** Mirage updates itself through Git. A ZIP copy can't update.
>
> **Pick the folder once and leave it there.** "Start with Windows" points to this folder. If you move it later, turn autostart off and on again.

---

## 3. Install Mirage's parts

Still inside the `Mirage-by-BBC` folder, run:

```powershell
npm install
```

This downloads Electron and the other parts Mirage needs. It can take a few minutes the first time.

**What you should see:** a summary like `added ... packages` at the end. Warnings (`npm warn ...`) are fine.

**If you see** *"npm.ps1 cannot be loaded because running scripts is disabled on this system"*, see
[PowerShell says scripts are disabled](#powershell-says-scripts-are-disabled) below, then run `npm install` again.

---

## 4. Start it

```powershell
npm start
```

**What you should see** within about 10 seconds:

```
⏺ Mirage is live on your desktop
  ⎿  Press Alt+W (or /edit) to drag things around
     Look for the tray icon to switch themes or quit
```

Then minimize your windows. Your desktop is now the Mirage wallpaper, with your icons still on top.

- You can close PowerShell now. Mirage keeps running.
- Look for the Mirage icon in the system tray (bottom right, near the clock; it may be hidden under the `^` arrow).
- On first run there's a small how-to hint on the wallpaper. It goes away once you open edit mode.

If it says *"It did not start in time"*, see [Troubleshooting](#troubleshooting).

---

## 5. Turn on the `bro` command

`bro` lets you control Mirage from any PowerShell window. Inside the `Mirage-by-BBC` folder, run once:

```powershell
npm link
```

Then test it from anywhere:

```powershell
bro status
```

**What you should see:** `Mirage is running`, followed by your wallpaper, style, widgets, city and clock settings.

Don't want to use `npm link`? Every command also works from inside the Mirage folder as
`npm run cli -- <command>`, for example `npm run cli -- status`.

---

## 6. Start Mirage when you log in

```powershell
bro autostart on
```

If Mirage is running, this is applied right away. If not, it's applied the next time Mirage starts.
You can also flip the **Start with Windows** switch in Settings (see [Settings](#settings)).

To test it, sign out and sign back in. The wallpaper should appear on its own.

To turn it off: `bro autostart off`.

---

## 7. Everyday use

### Shortcuts

| Key | Does |
| --- | --- |
| `Alt+W` | Edit mode: drag, resize and restyle widgets |
| `Ctrl+Space` | Spotlight: apps, files, settings, math, web, AI |
| Click on the wallpaper | Notes, to-dos, Wi-Fi (Control Center), dock, music all work |
| `•••` on a widget | Edit that widget (style, color, size, options) |

If another app already uses `Alt+W`, Mirage tries `Alt+Shift+W`, then `Ctrl+Alt+W`, then `Ctrl+Shift+Alt+E`.
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
- **Control Center** (the toggles icon): Wi-Fi, Bluetooth, dark mode, hide taskbar, animations, screenshot,
  rearrange, wallpaper picker, lock, settings, plus sliders for brightness, volume and wallpaper blur.
- **The date**: opens the calendar.
- **Update**: only shows when a new version is ready (see [Updating](#8-updating)).

### Settings

Open **Control Center → Settings**, or the logo menu → **Settings**. Click **More settings** for:

- **Performance**: Auto, Battery saver, Full quality.
- **Wallpaper quality**: Auto, Low, Balanced, High.
- **Graphics**: Fast GPU or Power saving (for laptops with two graphics chips).
- Season, desktop pet, widget style, corners and font.
- Switches for animations, live weather, menu bar, album art wallpaper, music visualizer, 24-hour clock,
  hide taskbar, and **Start with Windows**.
- Your own **Rearrange** and **Spotlight** shortcuts. Click one, press the new keys. Mirage tells you right away if the keys are taken.
- Your name and city.

### The tray icon

Right-click the tray icon for: Edit wallpaper, Spotlight, Now Playing, Weekly Wrapped, Check for updates,
Wallpaper, Widget style, Motion, Restart wallpaper and Quit.

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
| `bro taskbar hide\|show` | Auto-hide the Windows taskbar so the dock takes over |
| `bro reset` | Put the widgets back to the current theme's layout |
| `bro config` | Show where your settings file is |
| `bro doctor` | Check what works on this PC |
| `bro help` | Everything else |

### Optional: the local AI

The Assistant runs on your PC with [Ollama](https://ollama.com). Install Ollama from its site, then:

```powershell
ollama pull llama3.1:8b
```

That's a one-time download of about 5 GB. Then press `Ctrl+Space` and type `ask plan my evening`, or run `bro ai <question>`.

---

## 8. Updating

### The easy way: the Update pill

Mirage checks GitHub for a new version shortly after it starts, then every 5 minutes, and again when your PC wakes up.

When there's a new version:

1. An **Update ready** pill appears on the wallpaper, an **Update** item appears in the menu bar, and Windows shows a notification.
2. Click **Install** on the pill. A panel shows what's new.
3. Click **Update now**. Mirage downloads the update, installs new parts if needed, and restarts itself.

Click the **x** on the pill to hide it until the next update. You can also check any time: tray icon → **Check for updates**.

The in-app update only works when:

- Your copy came from `git clone` (not a ZIP). Otherwise it says *"This copy was not cloned with git"*.
- You haven't changed any files in the Mirage folder. A changed `package-lock.json` is fine; Mirage resets it for you.
  Any other changed file gives *"You have changed files in this folder. Commit or undo them first, then update"*.

### The manual way

In PowerShell:

```powershell
cd $HOME\Mirage-by-BBC
git pull
npm install
bro restart
```

**If `git pull` complains** that your local changes to `package-lock.json` would be overwritten, run:

```powershell
git checkout package-lock.json
git pull
```

If it lists other files, run `git status` to see them. `git stash` puts your changes aside so the pull can go ahead.

---

## 9. Stopping Mirage and getting your normal wallpaper back

```powershell
bro stop
```

You should see `Stopped` and `Your normal wallpaper is back`. Mirage never replaces your Windows wallpaper; it just sits on top of it.

Other ways to stop it: tray icon → **Quit Mirage**, logo menu → **Quit Mirage**, or `npm run stop` inside the folder.

If you used **Hide taskbar** (`bro taskbar hide`), that's a Windows setting and stays on after Mirage stops.
Run `bro taskbar show` while Mirage is running to bring the taskbar back.

To start again later: `bro start`.

---

## 10. Uninstalling

Do these in order:

1. **Make sure Mirage is running** (`bro start`), then turn off autostart and bring back the taskbar:

   ```powershell
   bro autostart off
   bro taskbar show
   ```

2. **Stop Mirage:**

   ```powershell
   bro stop
   ```

3. **Remove the `bro` command:**

   ```powershell
   npm unlink -g mirage
   ```

4. **Delete the Mirage folder** (step out of it first):

   ```powershell
   cd $HOME
   Remove-Item -Recurse -Force "$HOME\Mirage-by-BBC"
   ```

5. **Delete your settings and data** (notes, to-dos, song history, screen time, log):

   ```powershell
   Remove-Item -Recurse -Force "$HOME\.mirage"
   ```

6. **Optional leftovers:**
   - The **Mirage** entry in the Start menu (it's what lets notifications show Mirage's name and logo).
     Remove with `Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Mirage.lnk"`.
   - `$env:APPDATA\mirage`: Mirage's browser data, including any high-quality planet maps Mirage downloaded.
     Remove with `Remove-Item -Recurse -Force "$env:APPDATA\mirage"`.
   - `Pictures\Mirage`: Weekly Wrapped images you shared. Keep or delete them yourself.
   - Node.js, Git and Ollama are separate apps. Uninstall them from Windows Settings → Apps if you don't need them.

If you deleted the folder before turning autostart off, Windows may still try to start Mirage at login.
Open **Task Manager → Startup apps** and disable the leftover **Mirage** entry.

---

## Troubleshooting

### First, run the check-up

```powershell
bro doctor
```

On Windows it shows your Node version and whether **Updates** (needs Git) and the **Assistant** (needs Ollama, optional) will work.

### Where's the log?

When Mirage is started with `bro start`, `bro restart`, `bro edit` or `npm start`, it writes a log to:

```
$HOME\.mirage\app.log
```

Show the last lines:

```powershell
Get-Content "$HOME\.mirage\app.log" -Tail 40
```

When Mirage starts on its own at login, nothing is written to this log. Use `bro restart` to get a fresh log.

### PowerShell says scripts are disabled

The error looks like: *"npm.ps1 cannot be loaded because running scripts is disabled on this system"* (or the same for `bro.ps1`).

Allow scripts for your own account (no admin needed):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Answer `Y` if asked, then try again. Or skip the setting and type `npm.cmd` instead of `npm` (for example `npm.cmd install`).

### `node`, `git` or `bro` "is not recognized"

- Close PowerShell and open a new one. New installs only show up in new windows.
- For `bro`: run `npm link` inside the Mirage folder again, or use `npm run cli -- <command>` from inside the folder.

### "It did not start in time"

1. Run `bro restart`.
2. If it still fails, read the log (see above).
3. Make sure `npm install` finished without errors. Run it again inside the Mirage folder if unsure.

### The wallpaper is blank or black

Try these one at a time:

1. `bro restart` (or tray icon → **Restart wallpaper**).
2. Settings → More settings → **Wallpaper quality** → **Low**, and **Performance** → **Battery saver**.
3. Settings → More settings → **Graphics**: switch between **Fast GPU** and **Power saving**. Mirage restarts.
4. Update your graphics driver from your PC or GPU maker.
5. Test without the graphics card. This lasts only for this run:

   ```powershell
   bro stop
   $env:WALL_NO_GPU = "1"; bro start
   ```

   If the wallpaper shows now, the problem is the graphics driver or setting.
   To go back to normal, close that PowerShell window, open a new one, and run `bro restart`.

### The wallpaper vanished after Explorer restarted

Mirage checks every few seconds and puts itself back. If it doesn't, run `bro restart`.

### `Alt+W` or `Ctrl+Space` does nothing

Another app probably uses that key. Run `bro status` to see the edit key Mirage got,
or set your own in Settings → More settings → **Rearrange shortcut** / **Spotlight shortcut**.
You can always use the tray icon, the logo menu, `bro edit` or `bro spotlight`.

### Update problems

| Message | Fix |
| --- | --- |
| *This copy was not cloned with git* | Uninstall, then get Mirage again with `git clone` (step 2). |
| *Couldn't reach GitHub* / *Could not download the update* | Check your internet, then try again. |
| *You have changed files in this folder* | See [The manual way](#the-manual-way): `git status`, then `git stash` or `git checkout <file>`. |
| *Downloaded, but installing new parts failed. Run npm install* | Run `npm install` inside the Mirage folder, then `bro restart`. |

### Start over with fresh settings

```powershell
bro stop
Rename-Item "$HOME\.mirage" ".mirage-backup"
bro start
```

Mirage creates new default settings. Delete `.mirage-backup` later if you don't need it.
To reset only the widget layout, use `bro reset` instead.

### More fixes

- **Commit graph is empty:** `bro github <your-username>` or `bro repo scan <projects-folder>`.
- **AI says Ollama is missing:** install it from [ollama.com](https://ollama.com), then `ollama pull llama3.1:8b`.
- **Wrong weather city:** `bro city <your city>`.
