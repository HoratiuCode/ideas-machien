# 👾 EyeStar

EyeStar is a Chrome extension that reads the active X/Twitter or GitHub page and helps with two things:

1. Validate a user idea against the page signal.
2. Generate a fresh idea from the current trend or repo context.

## What it uses

- Active tab page text and metadata.
- Lightweight local scoring rules.
- No external trend API.

## What happens when you click it

- The icon opens a dedicated EyeStar window.
- The window is larger than a normal Chrome popup.
- EyeStar keeps reading the tab you clicked from.

## Load it locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this folder: `/Users/horatiubudai/ceo/Hacker/ideas-machien`

## Notes

- On GitHub pages, EyeStar favors repo, topic, language, and workflow signals.
- On X/Twitter pages, EyeStar favors hashtags, handles, and repeated feed terms.
- The UI is intentionally white-first with orange and black glass styling.
