#!/usr/bin/env bash
#
# Mirage one-command installer for Linux.
#
# Checks Git and Node 22+, clones (or updates) the repo, installs it,
# turns on the `bro` command and starts Mirage.
#
# It never installs Git, Node or anything else for you. If something is
# missing it tells you the command to get it and stops.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ADT1123/Mirage-by-BBC/main/scripts/install.sh | bash
#
# With options:
#   curl -fsSL .../install.sh | bash -s -- --dir ~/apps/Mirage-by-BBC
#   curl -fsSL .../install.sh | bash -s -- --no-start

set -e

REPO_URL="https://github.com/ADT1123/Mirage-by-BBC.git"
REPO_NAME="Mirage-by-BBC"
MIN_NODE=22

DIR=""
START=1

# ---------------------------------------------------------------- output ----

if [ -t 1 ]; then
  C_STEP="$(printf '\033[1;36m')"
  C_WARN="$(printf '\033[1;33m')"
  C_ERR="$(printf '\033[1;31m')"
  C_OK="$(printf '\033[1;32m')"
  C_OFF="$(printf '\033[0m')"
else
  C_STEP=""; C_WARN=""; C_ERR=""; C_OK=""; C_OFF=""
fi

step() { printf '\n%s==> %s%s\n' "$C_STEP" "$1" "$C_OFF"; }
note() { printf '    %s\n' "$1"; }
warn() { printf '%s    %s%s\n' "$C_WARN" "$1" "$C_OFF"; }

die() {
  printf '\n%s----------------------------------------------------------------%s\n' "$C_ERR" "$C_OFF"
  for line in "$@"; do
    printf '%s%s%s\n' "$C_ERR" "$line" "$C_OFF"
  done
  printf '%s----------------------------------------------------------------%s\n\n' "$C_ERR" "$C_OFF"
  exit 1
}

usage() {
  cat <<'USAGE'
Mirage installer

  --dir <path>   where to put Mirage (default: $HOME/Mirage-by-BBC)
  --no-start     install but do not start Mirage
  -h, --help     this text
USAGE
}

# ----------------------------------------------------------------- flags ----

while [ $# -gt 0 ]; do
  case "$1" in
    --dir)
      if [ $# -lt 2 ]; then
        die "--dir needs a folder after it, for example:  --dir \$HOME/apps/Mirage-by-BBC"
      fi
      DIR="$2"
      shift 2
      ;;
    --dir=*)
      DIR="${1#--dir=}"
      shift
      ;;
    --no-start)
      START=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1"
      usage
      exit 1
      ;;
  esac
done

printf '\n%sMirage installer%s\n' "$C_STEP" "$C_OFF"
printf 'A live wallpaper you can actually use.\n'

# --------------------------------------------------------- prerequisites ----

# The command this distro uses to install a package, or "" if we don't know it.
pm_install() {
  if command -v apt-get >/dev/null 2>&1; then
    printf 'sudo apt install %s' "$1"
  elif command -v dnf >/dev/null 2>&1; then
    printf 'sudo dnf install %s' "$1"
  elif command -v pacman >/dev/null 2>&1; then
    printf 'sudo pacman -S %s' "$1"
  elif command -v zypper >/dev/null 2>&1; then
    printf 'sudo zypper install %s' "$1"
  else
    printf ''
  fi
}

step "Checking what you already have"

if ! command -v git >/dev/null 2>&1; then
  GIT_CMD="$(pm_install git)"
  if [ -n "$GIT_CMD" ]; then
    die "Git is not installed, so Mirage cannot be downloaded or updated." \
        "" \
        "Install it with:" \
        "  $GIT_CMD" \
        "" \
        "Then run this command again."
  else
    die "Git is not installed, so Mirage cannot be downloaded or updated." \
        "" \
        "Install it with your package manager, or from  https://git-scm.com/downloads" \
        "" \
        "Then run this command again."
  fi
fi
note "Git found: $(git --version)"

if ! command -v node >/dev/null 2>&1; then
  die "Node.js is not installed. Mirage needs Node $MIN_NODE or newer." \
      "" \
      "Get it from  https://nodejs.org/en/download  (choose Linux and follow the steps)." \
      "Your distro's own nodejs package is often older than $MIN_NODE, so check" \
      "with  node --version  afterwards." \
      "" \
      "Then open a new terminal and run this command again."
fi

NODE_VERSION="$(node --version)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
case "$NODE_MAJOR" in
  ''|*[!0-9]*) NODE_MAJOR=0 ;;
esac

if [ "$NODE_MAJOR" -lt "$MIN_NODE" ]; then
  die "Node.js $NODE_VERSION is too old. Mirage needs $MIN_NODE or newer." \
      "" \
      "Get a current version from  https://nodejs.org/en/download" \
      "(choose Linux and follow the steps it shows)." \
      "" \
      "Then open a new terminal and run this command again."
fi
note "Node.js found: $NODE_VERSION"

if ! command -v npm >/dev/null 2>&1; then
  die "npm is missing. It normally comes with Node.js." \
      "" \
      "Install Node.js from  https://nodejs.org/en/download  and try again."
fi
note "npm found: $(npm --version)"

# ------------------------------------------------------------ the folder ----

if [ -z "$DIR" ]; then
  DIR="$HOME/$REPO_NAME"
fi

step "Putting Mirage in  $DIR"

IS_MIRAGE=0
if [ -d "$DIR/.git" ]; then
  ORIGIN="$(git -C "$DIR" config --get remote.origin.url || true)"
  case "$ORIGIN" in
    *"$REPO_NAME"*) IS_MIRAGE=1 ;;
  esac
fi

if [ "$IS_MIRAGE" -eq 1 ]; then
  note "That folder is already a Mirage clone, so it gets updated instead of downloaded again."
  if ! git -C "$DIR" pull --ff-only; then
    die "Could not update the copy that is already there (git pull --ff-only failed)." \
        "" \
        "Most likely you have your own changes in that folder." \
        "Open it, sort them out, then run this again:  $DIR" \
        "Or install somewhere else with  --dir <another folder>"
  fi
else
  if [ -e "$DIR" ]; then
    if [ -n "$(ls -A "$DIR" 2>/dev/null || true)" ]; then
      die "$DIR already exists and is not a Mirage clone." \
          "" \
          "Rename or move it, or install somewhere else:" \
          "  --dir <another folder>"
    fi
  fi

  PARENT="$(dirname "$DIR")"
  mkdir -p "$PARENT"

  note "Downloading Mirage with Git."
  if ! git clone "$REPO_URL" "$DIR"; then
    die "The download failed (git clone)." \
        "" \
        "Check your internet connection and that you can reach github.com," \
        "then run this command again."
  fi
fi

cd "$DIR"

# ------------------------------------------------------------- the parts ----

step "Installing the parts Mirage needs (npm install)"
note "This downloads Electron and the rest. The first time it takes a few minutes."
note "Do not use sudo for this step."

if ! npm install; then
  die "npm install failed." \
      "" \
      "Scroll up for the reason. The usual ones are no internet, a company" \
      "proxy, or not enough disk space. Mirage needs about 1 GB." \
      "" \
      "You can retry it yourself:  cd $DIR  &&  npm install"
fi

# ----------------------------------------------------------- bro command ----

step "Turning on the  bro  command (npm link)"

LINK_LOG="$(mktemp)"
set +e
npm link >"$LINK_LOG" 2>&1
LINK_RC=$?
set -e
cat "$LINK_LOG"

if [ "$LINK_RC" -ne 0 ]; then
  if grep -qiE 'eacces|permission denied' "$LINK_LOG"; then
    printf '\n'
    warn "npm link needs permission to write where your Node keeps global commands."
    warn "Mirage itself is fine. To get the  bro  command, run this once yourself:"
    warn ""
    warn "    cd $DIR  &&  sudo npm link"
    warn ""
    warn "This installer does not run sudo for you."
    warn "If you would rather not, every command also works from the folder as:"
    warn "    cd $DIR  &&  npm run cli -- status"
  else
    printf '\n'
    warn "npm link failed, so the  bro  command is not available yet."
    warn "Mirage itself is fine. Run commands from the folder instead:"
    warn "    cd $DIR  &&  npm run cli -- status"
  fi
else
  note "Done. The  bro  command works in any new terminal."
fi
rm -f "$LINK_LOG"

# ---------------------------------------------------------------- start ----

if [ "$START" -eq 0 ]; then
  step "Not starting Mirage, because --no-start was used"
  note "Start it yourself with:  cd $DIR  &&  npm start"
else
  step "Starting Mirage"
  if ! node cli/main.mjs start; then
    die "Mirage did not start." \
        "" \
        "The log says why:  $HOME/.mirage/app.log" \
        "Try again with:  cd $DIR  &&  npm start" \
        "" \
        "More fixes: https://github.com/ADT1123/Mirage-by-BBC/blob/main/docs/SETUP-LINUX.md#troubleshooting"
  fi
fi

# --------------------------------------------------------------- summary ----

printf '\n%sAll set.%s\n\n' "$C_OK" "$C_OFF"
printf '  Alt+W         edit mode: drag, resize and restyle widgets\n'
printf '  Ctrl+Space    Spotlight: apps, files, settings, math, web, AI\n'
printf '  bro help      every other command\n\n'
printf '  Mirage lives in    %s\n' "$DIR"
printf '  Settings live in   %s\n\n' "$HOME/.mirage"
printf '  bro doctor         check which features work on this machine\n'
printf '  bro shortcuts      add Alt+W and Ctrl+Space on Wayland (Ubuntu 26.04)\n'
printf '  bro autostart on   start Mirage when you log in\n'
printf '  bro stop           bring your normal wallpaper back\n\n'
printf '  Guide: https://github.com/ADT1123/Mirage-by-BBC/blob/main/docs/SETUP-LINUX.md\n\n'
