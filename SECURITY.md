# Security

## Reporting a problem

Please don't open a public issue for security problems. Use GitHub's private reporting instead:
**Security tab → Report a vulnerability**. You'll get a reply within a few days.

## How Mirage protects you

- **No accounts, no keys.** Mirage needs no API keys or passwords. Your settings, notes, chats and
  history stay in `~/.mirage` on your own computer and are never uploaded.
- **The AI is local.** The Assistant runs through Ollama on your machine; nothing you type leaves it.
- **Sandboxed windows.** Every Mirage window is sandboxed, can't open new windows, and can't
  navigate to websites. Links open in your normal browser.
- **Local control only.** The `bro` command talks to Mirage over `127.0.0.1` only, and requests
  must carry a special header and a localhost address, so web pages can't reach it.
- **Updates come only from this repository**, as fast-forward `git pull`s you approve with a click.
  They never overwrite files you changed.

## Network requests Mirage makes

Weather (Open-Meteo), city lookup (ipapi.co), quotes (ZenQuotes), Gita verses (vedicscriptures),
paintings (Wikimedia Commons), stocks (Yahoo Finance), album art (Apple iTunes Search),
lyrics (LRCLIB), your public GitHub contribution graph, and `git fetch` for updates.
None of these receive personal data beyond what the request itself needs (for example a city name).
