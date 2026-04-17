# Self-Hosting Guide: Oracle Cloud Free Tier

A complete, end-to-end guide for hosting multiple Node.js / WebSocket hobby projects (Endead and similar) on a single **Oracle Cloud Always Free** VM with automatic HTTPS and per-app subdomains on a custom domain.

**What you get at the end:**

- One Oracle ARM VM (4 cores, 24 GB RAM, 100 GB disk) — genuinely free forever.
- `https://endead.yourdomain.com`, `https://other-game.yourdomain.com`, etc. — each routed to a separate Node process.
- Automatic SSL certificates (renewed by Caddy).
- WebSocket support for all apps (`wss://`).
- Per-app logs and independent restart via `systemd`.

**Estimated time:** 60–90 minutes for the first app, ~5 minutes per additional app.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Create the Oracle Cloud Account](#3-create-the-oracle-cloud-account)
4. [Provision the VM](#4-provision-the-vm)
5. [Open the Network](#5-open-the-network)
6. [First SSH & Base Setup](#6-first-ssh--base-setup)
7. [Install Node.js](#7-install-nodejs)
8. [Install and Configure Caddy](#8-install-and-configure-caddy)
9. [Point Your Domain at the VM](#9-point-your-domain-at-the-vm)
10. [Deploy Your First App (Endead)](#10-deploy-your-first-app-endead)
11. [Add Additional Apps](#11-add-additional-apps)
12. [Operations: Logs, Updates, Backups](#12-operations-logs-updates-backups)
13. [Troubleshooting](#13-troubleshooting)
14. [Appendix: Quick Command Reference](#14-appendix-quick-command-reference)

---

## 1. Architecture Overview

```
             Internet
                │
                ▼
   ┌────────────────────────┐
   │   Your domain (DNS)    │
   │  *.yourdomain.com      │
   └──────────┬─────────────┘
              │  (A record → VM IP)
              ▼
   ┌────────────────────────────────────┐
   │   Oracle Cloud VM (Ubuntu ARM)     │
   │                                    │
   │   ┌──────────────────────────┐     │
   │   │  Caddy (ports 80, 443)   │     │
   │   │  auto-SSL + reverse proxy│     │
   │   └──┬────────┬────────┬─────┘     │
   │      │        │        │           │
   │      ▼        ▼        ▼           │
   │   :3000    :3001    :3002          │
   │   endead   other    api            │
   │  (systemd)(systemd)(systemd)       │
   └────────────────────────────────────┘
```

- **Caddy** is a web server that auto-provisions Let's Encrypt certs and reverse-proxies to local ports. It's the only process listening on 80/443.
- Each app runs under its own **`systemd`** unit on an internal port (`3000`, `3001`, …). Apps only need to bind to `localhost` — they're not exposed directly to the internet.
- Each app has its own directory, its own SQLite file, and its own logs.

---

## 2. Prerequisites

- A domain you control (e.g., `yourdomain.com`). Registrar must allow editing DNS records (all common ones do: Namecheap, Cloudflare, Porkbun, Google Domains, etc.).
- An SSH client. macOS and Linux have `ssh` built in. On Windows use WSL or the built-in OpenSSH (`ssh` in PowerShell).
- A credit card for Oracle's signup (not charged — required for identity verification on the free tier).
- Your app's source on GitHub (or any git remote) so you can `git clone` it onto the VM.

---

## 3. Create the Oracle Cloud Account

1. Go to **https://www.oracle.com/cloud/free/** and click **Start for free**.
2. Select **Brazil East (São Paulo)** as your home region if your players are in South America. **This choice is permanent** — the home region cannot be changed later.
3. Complete identity + credit card verification. Oracle will place a small temporary authorization hold (~$1) and release it.
4. Wait for the confirmation email ("Your account is ready") — usually 5 minutes, occasionally a few hours.

**Gotchas:**

- Some email providers and payment card combinations get flagged during signup. If you're rejected, try a different card or a different email — there's no detailed error message. This is the single most painful step.
- The **home region** is permanent; free-tier resources live only in that region. Pick carefully.

---

## 4. Provision the VM

### 4.1. Create a compartment (optional but recommended)

Compartments are Oracle's way of grouping resources. Creating one called `hobby` keeps your hobby stuff separate from anything else you might do later.

**Menu:** Identity & Security → Compartments → Create Compartment. Name: `hobby`. Parent: root.

### 4.2. Create a VCN (Virtual Cloud Network)

**Menu:** Networking → Virtual Cloud Networks → **Start VCN Wizard** → **Create VCN with Internet Connectivity**.

- VCN Name: `hobby-vcn`
- Compartment: `hobby`
- Leave default CIDRs (`10.0.0.0/16`, public subnet `10.0.0.0/24`).
- Click **Next** → **Create**.

This creates the VCN, a public subnet, an internet gateway, and default routing. You only do this once.

### 4.3. Create the compute instance

**Menu:** Compute → Instances → **Create Instance**.

- **Name:** `hobby-host`
- **Compartment:** `hobby`
- **Image:** Click **Change Image** → **Canonical Ubuntu** → latest LTS (24.04 at time of writing).
- **Shape:** Click **Change Shape** → **Ampere** → **VM.Standard.A1.Flex**.
  - OCPUs: `4`
  - Memory: `24 GB`
  - This is the full Always Free ARM allowance. Use all of it — it's free regardless, and you can rebuild smaller later if needed.
- **Networking:**
  - Select the VCN you just created (`hobby-vcn`) and the public subnet.
  - **Assign a public IPv4 address:** yes.
- **SSH keys:** **Generate a key pair for me** (if you don't already have one) and **download both** the public and private keys. If you do have a key, paste your public key (`~/.ssh/id_ed25519.pub` or similar).
- **Boot volume:** leave default (47 GB is fine; expandable to ~200 GB total across all free volumes).

Click **Create**. Wait ~1 minute for state to become **RUNNING**.

**Capacity gotcha:** Ampere A1 capacity is sometimes unavailable in popular free-tier regions (São Paulo is usually fine; Ashburn can be dry). If provisioning fails with "Out of host capacity", either retry every few hours or switch to **VM.Standard.E2.1.Micro** (AMD, 1/8 OCPU, 1 GB RAM — much weaker but always available). Two E2.1.Micro instances are also free, which can substitute for one A1.

### 4.4. Reserve the public IP

By default the public IP is **ephemeral** — it can change if you reboot in certain ways. Promote it:

**Menu:** Compute → Instances → click your instance → **Attached VNICs** → click the VNIC → **IPv4 Addresses** → click the three-dot menu on the public IP → **Edit** → **Reserved public IP** → **Create a new reserved IP** → give it a name (`hobby-ip`) → **Update**.

Copy this IP — you'll use it for DNS in step 9.

---

## 5. Open the Network

Oracle has **two** layers of firewall that both must allow traffic. New users miss the second one and spend hours debugging.

### 5.1. VCN Security List (cloud-level firewall)

**Menu:** Networking → Virtual Cloud Networks → `hobby-vcn` → **Security Lists** → **Default Security List for hobby-vcn** → **Add Ingress Rules**.

Add two rules:

| Source Type | Source CIDR | IP Protocol | Dest Port |
|---|---|---|---|
| CIDR | `0.0.0.0/0` | TCP | `80` |
| CIDR | `0.0.0.0/0` | TCP | `443` |

(SSH on 22 is already allowed by default.)

### 5.2. Instance iptables (OS-level firewall)

Ubuntu images on Oracle ship with a strict `iptables` config that blocks everything except SSH. You must open 80 and 443 on the instance itself as well.

You'll do this in the next section once you've SSH'd in. Don't forget it.

---

## 6. First SSH & Base Setup

### 6.1. Connect

From your local machine (substitute the private key path and the reserved IP):

```bash
chmod 600 ~/Downloads/ssh-key-*.key     # permissions must be strict
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<YOUR_RESERVED_IP>
```

Accept the host key fingerprint. You're now in.

**Tip:** add an alias to `~/.ssh/config` on your local machine so you don't retype:

```
Host hobby
    HostName <YOUR_RESERVED_IP>
    User ubuntu
    IdentityFile ~/.ssh/oracle-hobby.key
```

Then it's just `ssh hobby`.

### 6.2. Open iptables (critical)

```bash
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

If `netfilter-persistent` is missing:

```bash
sudo apt update && sudo apt install -y iptables-persistent
# It will prompt to save current rules — say yes.
```

Verify: `sudo iptables -L INPUT -n --line-numbers` — you should see `ACCEPT tcp dpt:80` and `ACCEPT tcp dpt:443`.

### 6.3. System updates

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git build-essential ufw
sudo reboot
```

Wait 30 seconds and SSH back in.

### 6.4. (Optional but recommended) Add swap

24 GB RAM is plenty, but Node builds and `npm install` can momentarily spike. A swap file is cheap insurance:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 6.5. Create a deploy user (optional)

You can run everything as `ubuntu`, which is fine for a hobby setup. If you prefer a dedicated service user:

```bash
sudo useradd -m -s /bin/bash -U deploy
sudo usermod -aG sudo deploy
```

The rest of this guide uses `ubuntu` for simplicity. Substitute `deploy` throughout if you went that route.

---

## 7. Install Node.js

Use the official NodeSource repo — Ubuntu's packaged Node is usually too old.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # should print v22.x.x
npm --version
```

(Replace `22` with whatever major version your apps need.)

---

## 8. Install and Configure Caddy

Caddy is a single binary that handles TLS, HTTP/2, HTTP/3, reverse proxying, and WebSockets with essentially no configuration.

### 8.1. Install

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Caddy is now running as a systemd service: `sudo systemctl status caddy`.

### 8.2. Initial Caddyfile

Edit `/etc/caddy/Caddyfile`:

```bash
sudo nano /etc/caddy/Caddyfile
```

Replace the contents with:

```
# Global options
{
    email you@yourdomain.com
}

# Apps go below. Each block is one subdomain → one local port.
# We'll add real entries after DNS propagates.
```

The `email` is used by Let's Encrypt for cert expiry notices.

Reload Caddy:

```bash
sudo systemctl reload caddy
```

---

## 9. Point Your Domain at the VM

At your domain registrar's DNS control panel, create these records. Use your **reserved public IP** from step 4.4.

| Type | Host / Name | Value | TTL |
|---|---|---|---|
| A | `endead` | `<YOUR_RESERVED_IP>` | 300 |
| A | `other-game` | `<YOUR_RESERVED_IP>` | 300 |

Optional but convenient — a wildcard so any future subdomain just works without adding a DNS record:

| Type | Host / Name | Value | TTL |
|---|---|---|---|
| A | `*` | `<YOUR_RESERVED_IP>` | 300 |

**Verify propagation** (from your local machine, not the VM):

```bash
dig endead.yourdomain.com +short
# should return your reserved IP
```

If it returns nothing, wait 2–10 minutes and retry. Some registrars need an explicit "save" after each record.

---

## 10. Deploy Your First App (Endead)

### 10.1. Clone the repo

```bash
cd /opt
sudo mkdir endead
sudo chown ubuntu:ubuntu endead
cd endead
git clone https://github.com/<you>/endead.git .
```

If the repo is private, set up a deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/endead-deploy -N ""
cat ~/.ssh/endead-deploy.pub    # copy the output
```

Add the public key as a **Deploy Key** on the GitHub repo (Settings → Deploy keys → Add deploy key), then clone with:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/endead-deploy -o IdentitiesOnly=yes' \
    git clone git@github.com:<you>/endead.git .
```

### 10.2. Install and build

```bash
npm ci
npm run build    # if the project has a build step; skip if not
```

### 10.3. Pick a port

Endead reads `PORT` from the environment. Use `3000` for it.

### 10.4. Create the systemd unit

```bash
sudo nano /etc/systemd/system/endead.service
```

Contents:

```ini
[Unit]
Description=Endead game server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/endead
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Basic hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/endead/data

[Install]
WantedBy=multi-user.target
```

Note the `ReadWritePaths=/opt/endead/data` — with `ProtectSystem=strict` the filesystem is read-only except paths listed here. Endead writes its SQLite DB to `data/`, so only that directory needs write access. Adjust to match your app's writable paths.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now endead
sudo systemctl status endead       # should be active (running)
```

Check logs if anything's off:

```bash
journalctl -u endead -f -n 100
```

### 10.5. Tell Caddy about it

Edit `/etc/caddy/Caddyfile` and append:

```
endead.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Reload:

```bash
sudo systemctl reload caddy
```

Caddy will now fetch a Let's Encrypt cert automatically on the first request. Watch it happen:

```bash
sudo journalctl -u caddy -f
```

Visit `https://endead.yourdomain.com` in your browser. You should see the app, served over HTTPS, with WebSockets upgrading to `wss://` automatically — Caddy's `reverse_proxy` handles the `Upgrade` header transparently.

---

## 11. Add Additional Apps

The template for app #2 and beyond:

```bash
# 1. Clone into its own directory
cd /opt
sudo mkdir other-game && sudo chown ubuntu:ubuntu other-game
cd other-game
git clone <repo> .
npm ci && npm run build

# 2. systemd unit — pick the next free port
sudo nano /etc/systemd/system/other-game.service
```

```ini
[Unit]
Description=Other Game server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/other-game
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
ReadWritePaths=/opt/other-game/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now other-game
```

Append to `/etc/caddy/Caddyfile`:

```
other-game.yourdomain.com {
    reverse_proxy localhost:3001
}
```

```bash
sudo systemctl reload caddy
```

DNS: add an `A` record for `other-game` (skip this if you set up the `*` wildcard earlier).

Done. New apps take roughly 5 minutes each.

**Conventions to follow:**

- Assign ports sequentially: `3000`, `3001`, `3002`, ... Keep a note.
- Each app gets its own `/opt/<app-name>` directory.
- Each app gets its own systemd unit named `<app-name>.service`.
- Subdomains match app names where possible.

---

## 12. Operations: Logs, Updates, Backups

### 12.1. Viewing logs

```bash
# Live tail for one app
journalctl -u endead -f

# Last 200 lines
journalctl -u endead -n 200

# Since last hour
journalctl -u endead --since "1 hour ago"

# Caddy's logs (cert issuance, routing errors)
journalctl -u caddy -f
```

### 12.2. Updating an app

```bash
cd /opt/endead
git pull
npm ci
npm run build
sudo systemctl restart endead
journalctl -u endead -n 50    # verify it came back up cleanly
```

Consider scripting this once you've done it twice. Put `/opt/endead/bin/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/endead
git pull
npm ci
npm run build
sudo systemctl restart endead
```

```bash
chmod +x /opt/endead/bin/deploy.sh
```

### 12.3. Backups (SQLite)

SQLite files can be copied while the app is running as long as you use the right command. A nightly cron works fine for hobby use:

```bash
sudo nano /etc/cron.daily/backup-games
```

```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=/var/backups/games
DATE=$(date +%Y%m%d)
mkdir -p "$BACKUP_DIR"

for app in endead other-game; do
    if [ -f "/opt/$app/data/$app.db" ]; then
        sqlite3 "/opt/$app/data/$app.db" ".backup '$BACKUP_DIR/${app}-${DATE}.db'"
    fi
done

# Keep last 14 days
find "$BACKUP_DIR" -name '*.db' -mtime +14 -delete
```

```bash
sudo chmod +x /etc/cron.daily/backup-games
sudo apt install -y sqlite3
```

Adjust the DB filenames to match each app. For off-site backups, `rsync` or `rclone` the backup directory to S3/B2/Google Drive nightly.

### 12.4. Monitoring resource usage

```bash
htop            # live CPU/RAM; install with: sudo apt install -y htop
df -h           # disk usage
systemctl list-units --type=service --state=running   # what's running
```

### 12.5. Automatic security updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 13. Troubleshooting

### "Connection refused" when visiting the subdomain

1. Is DNS pointing at the right IP? `dig endead.yourdomain.com +short`
2. Is Caddy running? `sudo systemctl status caddy`
3. Is the app running and listening on the right port? `sudo ss -tlnp | grep 3000`
4. **Did you open iptables?** `sudo iptables -L INPUT -n | grep -E '80|443'`. This is the #1 forgotten step.
5. Did you open the VCN security list on 80/443? (Oracle console, step 5.1.)

### "Your connection is not private" / cert errors

- Caddy provisions certs on the first request. First-time load takes 5–15 seconds.
- If it stays broken, check `journalctl -u caddy -n 100` for Let's Encrypt errors. The most common cause is DNS not yet pointing at the VM — Let's Encrypt hits the domain from the outside to validate.
- Rate-limited? Let's Encrypt allows 5 failures per hour per domain. Wait an hour and retry.

### App crashes immediately on start

```bash
journalctl -u endead -n 200 --no-pager
```

Look for Node errors. Common causes:
- Missing environment variable (add `Environment=FOO=bar` to the systemd unit).
- Wrong port (something else already on `3000` — try `3100`).
- Permissions on `data/` (the service user can't write; adjust `ReadWritePaths`).

### WebSocket connection fails

Caddy's `reverse_proxy` handles WebSocket upgrades automatically — no special config. If `wss://` fails:

- Check that the app is actually listening on the port Caddy proxies to.
- Confirm the browser console's exact error. `wss://` requires `https://` on the page — mixed content will fail silently.

### Out of memory during `npm ci` on ARM

Some native modules (sharp, canvas, sqlite3) build from source on ARM. If the build OOMs, make sure you added the swap file in step 6.4, and try `npm ci --maxsockets=1` to reduce parallelism.

### Oracle "reclaims" my instance for inactivity

Oracle will stop Always Free compute instances that are idle for 7+ consecutive days of low CPU, low network, low memory. For a game server this essentially never triggers, but if you're paranoid, a cron job that pings an external endpoint every hour is enough activity:

```
0 * * * * curl -s https://endead.yourdomain.com > /dev/null
```

---

## 14. Appendix: Quick Command Reference

```bash
# SSH into the VM
ssh hobby

# App lifecycle (replace endead with any app name)
sudo systemctl start endead
sudo systemctl stop endead
sudo systemctl restart endead
sudo systemctl status endead
sudo systemctl reload caddy    # after editing Caddyfile

# Logs
journalctl -u endead -f
journalctl -u caddy -f

# Update an app
cd /opt/endead && git pull && npm ci && npm run build && sudo systemctl restart endead

# Edit routing
sudo nano /etc/caddy/Caddyfile && sudo systemctl reload caddy

# Add a new app service
sudo nano /etc/systemd/system/<name>.service
sudo systemctl daemon-reload
sudo systemctl enable --now <name>

# See all apps
systemctl list-units --type=service --state=running | grep -E '(endead|other-game|caddy)'

# Disk / memory
df -h
free -h
htop

# Firewall sanity check
sudo iptables -L INPUT -n --line-numbers | head -20

# Backup SQLite live
sqlite3 /opt/endead/data/endead.db ".backup '/tmp/endead.db'"
```

### Port registry (keep this updated as you add apps)

| App | Port | Subdomain | Dir |
|---|---|---|---|
| endead | 3000 | endead.yourdomain.com | /opt/endead |
| other-game | 3001 | other-game.yourdomain.com | /opt/other-game |
| | 3002 | | |
| | 3003 | | |

---

## Resource Budget Reality Check

For reference, an Ampere A1 free VM (4 OCPU, 24 GB RAM) can comfortably run:

- 5–10 small Node.js game servers (each idle: ~80 MB RAM, active: ~150–300 MB).
- A Postgres or Redis instance if you need one later (~200 MB idle).
- Caddy (~30 MB).
- Plenty of headroom for `npm install` spikes.

You will run out of **developer time** to build games long before you run out of VM.
