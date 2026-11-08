# Moving Sentinel to the Raspberry Pi

Goal: Sentinel runs 24/7 on the Pi at the **same URL** the tablet already uses
(`https://sentinel.tail24ef52.ts.net`), so the tablet, OAuth redirects and the
installed app never notice the move.

Layout on the Pi:

```
/opt/sentinel/
  dist/            built frontend (served by Express)
  backend/         API + .env + data/tokens.json (logins)
  deploy/ scripts/
```

## 0. Hardware

- Active Cooler on the board. The official case's own fan **clashes** with it:
  remove the case fan and keep the Active Cooler.
- Power: 5V/5A (27W) USB-C is ideal. A 5V/3A supply works for Sentinel (the Pi
  limits USB power and warns at boot, which is fine with nothing plugged in).

## 1. Flash the SD card (on the Mac)

Raspberry Pi Imager → **Raspberry Pi OS Lite (64-bit)**. In settings, before writing:

- Hostname: `sentinel-pi`
- Enable SSH (password, or your Mac's public key)
- Username and password
- Wi-Fi (or use Ethernet)
- Time zone: America/Detroit

Boot it, wait about 2 minutes, then from the Mac:

```bash
ssh <user>@sentinel-pi.local
```

Tip: add this to `~/.ssh/config` on the Mac so every command below is shorter:

```
Host sentinel-pi
  HostName sentinel-pi.local
  User <user>
```

## 2. Copy the app over and bootstrap (once)

From the Mac, in `batcomputer-hub`:

```bash
ssh -t sentinel-pi 'sudo mkdir -p /opt/sentinel && sudo chown $USER:$USER /opt/sentinel'   # -t: sudo asks for your Pi password
rsync -az deploy scripts sentinel-pi:/opt/sentinel/
ssh -t sentinel-pi 'bash /opt/sentinel/scripts/pi-bootstrap.sh'
```

The bootstrap installs Node 24, the systemd service (enabled, not started) and Tailscale.

## 3. Join the tailnet

```bash
ssh -t sentinel-pi 'sudo tailscale up --operator=$USER'
```

Open the login link it prints and approve with the same account. `--operator` lets
Sentinel (which runs as your user, not root) use `tailscale ping` for presence.

## 4. First deploy

**Stop Sentinel on the Mac first** (Ctrl+C on `npm run panel`). Two copies running
means every rule, Game Day and notification fires twice; deploy refuses while the
Mac's port 3001 answers.

```bash
npm run deploy
```

First run only, this also copies the Mac's `backend/.env` and `backend/data/`
state to the Pi: logins (`tokens.json`, including the Frame TV pairing), registered
faces, the rules you enabled and what already fired today, scenes, Game Day's
triggered games, and the activity log. After that the Pi's copies are the source of
truth and deploys never overwrite them. It ends with a health check.

Anytime later, edit secrets on the Pi directly:
`ssh sentinel-pi nano /opt/sentinel/backend/.env`, then
`ssh sentinel-pi sudo systemctl restart sentinel`.

## 5. Hostname swap (the URL moves to the Pi)

Machine names are unique per tailnet, so free the name first:

1. **Mac:** stop serving: `tailscale serve --https=443 off` (`npm run panel` is already stopped).
2. **Admin console** (login.tailscale.com → Machines): rename the Mac to
   something like `josh-mbp`, then rename the Pi to **`sentinel`**.
3. **Pi:** `ssh sentinel-pi 'sudo tailscale serve --bg 3001'`
4. Open `https://sentinel.tail24ef52.ts.net` and check `/api/health`.

The tablet just keeps working: same URL, same certificate name, same OAuth redirects.

## Day to day

| Task | Command |
|---|---|
| Ship changes | `npm run deploy` |
| Live logs | `ssh sentinel-pi journalctl -u sentinel -f` |
| Restart | `ssh sentinel-pi sudo systemctl restart sentinel` |
| Status | `ssh sentinel-pi systemctl status sentinel` |

## If something's off

- **Health check fails:** `journalctl -u sentinel -n 50 --no-pager`. The startup
  integrations table shows which keys are missing.
- **`sharp` errors:** `node_modules` was copied from the Mac. Deploy excludes it,
  so run `npm ci --omit=dev` in `/opt/sentinel/backend` on the Pi.
- **Logged out of everything / lock screen has no faces:** check
  `/opt/sentinel/backend/data/` (`tokens.json`, `faces.json`) exists and is owned by the service user.
