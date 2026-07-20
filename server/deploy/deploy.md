# Deploying this server (perstitio.us)

How the perstitio.us instance is set up and how it ships. This is one concrete
deployment of the install described in [../docs/install.md](../docs/install.md);
read that for the meaning of each config value and the database schema.

Standing up your own copy? Everything here is reusable: the systemd unit
([rsschat.service](rsschat.service)) needs only its `User` and
`WorkingDirectory` changed to your account and clone path, the Apache vhost
([perstitio.us-le-ssl.conf](perstitio.us-le-ssl.conf)) needs your domain and
cert paths, and every site-specific value (database password, mail
credentials, feed mix, WordPress site id) lives in the gitignored
`config.json` -- copy [config.example.json](../code/config.example.json) and
fill in yours. Nothing personal is baked into the code.

## The shape of it

- **Host**: AWS Lightsail, Debian 12, one clone of this repo at `/home/admin/rss.chat`.
- **App**: `server/code/rssnetwork.js` runs under **systemd** as the `rsschat`
  service, on `127.0.0.1:1420` (HTTP) and `127.0.0.1:1462` (websocket firehose).
- **Front door**: the box's existing **Apache** terminates TLS for `perstitio.us`
  (Let's Encrypt) and reverse-proxies everything to the Node app; websocket
  upgrades go to `:1462`. `/.well-known/` stays local so cert renewals keep
  working. See [perstitio.us-le-ssl.conf](perstitio.us-le-ssl.conf).
- **Database**: MariaDB on the box, database `rsschat`, a dedicated
  `rsschat@localhost` user. Feeds are served from the database
  (`flFeedsInDatabase: true`) — no S3.
- **Client**: not deployed here. The default config pulls the browser app from
  `code.scripting.com`; the server injects this instance's settings into it.

Note: this box runs **MariaDB**, not MySQL. The app's prefs-extraction queries
use `json_unquote(json_extract(...))` rather than the MySQL-only `->>` operator,
so they run on both engines.

## Config and secrets

The real `config.json` lives only on the server at `server/code/config.json` and
is **gitignored** — it holds the database password. The committed template is
[../code/config.example.json](../code/config.example.json); copy it to
`config.json` and fill in real values. `prefs.json` and `data/` are gitignored too.

## Deploying updates (GitHub Actions)

Pushing to `main` triggers [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml).
Because the box's public port 22 is locked to the owner's IP, the runner reaches
it over **Tailscale**: it joins the tailnet with an ephemeral key, then SSHes to
the box's private `100.x` address and runs:

```bash
cd ~/rss.chat && git pull --ff-only origin main
cd server/code && npm install
sudo systemctl restart rsschat
```

You can also trigger it by hand from the Actions tab (`workflow_dispatch`).

### Repo secrets the workflow needs

| Secret | What it is |
| --- | --- |
| `TAILSCALE_AUTHKEY` | A **reusable, ephemeral** auth key (Tailscale admin → Settings → Keys). Puts the runner on the tailnet for the run. |
| `DEPLOY_HOST` | The box's Tailscale IP (`100.x`). |
| `DEPLOY_USER` | `admin`. |
| `DEPLOY_SSH_KEY` | Private half of a deploy-only SSH key; the public half is in the box's `~/.ssh/authorized_keys`. |

Two independent factors gate a deploy: tailnet membership (the auth key) **and**
the SSH key. Neither alone reaches the box.

## First-time server setup (already done for perstitio.us)

```bash
# swap (little RAM), Node 22, git
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs git

# database — schema is in install.md
sudo mysql < schema.sql
sudo mysql -e "create user 'rsschat'@'localhost' identified by '...'; grant all on rsschat.* to 'rsschat'@'localhost';"

# app
git clone https://github.com/xicubed/rss.chat.git ~/rss.chat
cd ~/rss.chat/server/code && cp config.example.json config.json   # edit with real values
npm install

# systemd
sudo cp ~/rss.chat/server/deploy/rsschat.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now rsschat

# Apache reverse proxy
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite
sudo cp ~/rss.chat/server/deploy/perstitio.us-le-ssl.conf /etc/apache2/sites-available/
sudo apache2ctl configtest && sudo systemctl reload apache2

# Tailscale (for CI reachability without opening public SSH)
curl -fsSL https://tailscale.com/install.sh | sudo sh
sudo tailscale up --hostname=perstitio-rsschat --accept-dns=false
```

## Logs and control

```bash
sudo systemctl status rsschat
sudo journalctl -u rsschat -f
sudo systemctl restart rsschat
```
