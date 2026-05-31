# Tencent Lighthouse Deploy: SIAGA

Target server:

- Tencent Lighthouse Ubuntu
- 2 vCPU, 2GB RAM, 30GB disk
- Public IPv4: `43.156.117.49`
- Web app: SIAGA

This plan treats the server as a small production VPS. Hermes setup is skipped for now; the bootstrap script only installs Hermes if you explicitly set `INSTALL_HERMES=1`.

## Architecture

```text
Internet
  |
  | 80/443
  v
Nginx
  |
  | http://127.0.0.1:3999
  v
SIAGA Node service
  |
  v
SQLite / uploads
```

Rules:

- SIAGA runs as a systemd service under the `siaga` Linux user.
- Nginx is the public entrypoint on port `80`, and later `443` after HTTPS.
- The Node app listens only behind Nginx on `127.0.0.1:3999` through the reverse proxy.

## One-Time Bootstrap

If the SIAGA repository is private, prepare SSH access for the `siaga` user before cloning. One simple path is to create a deploy key on the server, add the public key to GitHub, then use the SSH repo URL:

```bash
sudo adduser --system --group --home /opt/siaga siaga || true
sudo -iu siaga
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "siaga-tencent" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Add that public key as a GitHub deploy key for `hjeruk1/siaga`, then test:

```bash
ssh -T git@github.com
```

Copy the script to the server, then run it as root.

From your local machine:

```bash
scp scripts/tencent-lighthouse-bootstrap.sh ubuntu@43.156.117.49:/tmp/tencent-lighthouse-bootstrap.sh
ssh ubuntu@43.156.117.49
```

On the server:

```bash
sudo chmod +x /tmp/tencent-lighthouse-bootstrap.sh
sudo SIAGA_REPO_URL="git@github.com:hjeruk1/siaga.git" \
  SIAGA_DOMAIN="43.156.117.49" \
  /tmp/tencent-lighthouse-bootstrap.sh
```

If this is the first production database and you intentionally want to reset/seed it:

```bash
sudo INIT_DB=1 \
  ADMIN_PASSWORD="change-this-password" \
  SIAGA_REPO_URL="git@github.com:hjeruk1/siaga.git" \
  SIAGA_DOMAIN="43.156.117.49" \
  /tmp/tencent-lighthouse-bootstrap.sh
```

Do not use `INIT_DB=1` on a live database unless you mean to wipe and reseed it.

## Access After Deploy

Open this in your browser:

```text
http://43.156.117.49
```

If you later attach a domain, point an `A` record to:

```text
43.156.117.49
```

Then open:

```text
http://your-domain.example
```

The default admin login exists only if you initialized the database with `INIT_DB=1`. Use:

```text
username: admin
password: the ADMIN_PASSWORD you set
```

If you deploy without `INIT_DB=1`, keep the existing database state from the repo/server and use its existing users.

## Verify From Server

Run:

```bash
curl -I http://127.0.0.1:3999
curl -I http://43.156.117.49
```

## SIAGA Operations

Check status:

```bash
sudo systemctl status siaga --no-pager
sudo journalctl -u siaga -n 100 --no-pager
```

Deploy latest code safely:

```bash
sudo mkdir -p /opt/siaga/backups
sudo systemctl stop siaga
sudo cp /opt/siaga/app/backend/siaga.db /opt/siaga/backups/siaga-$(date +%Y%m%d-%H%M%S).db
sudo tar -C /opt/siaga/app/backend -czf /opt/siaga/backups/uploads-$(date +%Y%m%d-%H%M%S).tar.gz uploads
sudo systemctl start siaga

sudo -iu siaga
cd /opt/siaga/app
git pull --ff-only
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm run build
exit

sudo systemctl restart siaga
curl -I http://127.0.0.1:3999
```

Do not run `npm run init` during normal updates. It drops and reseeds production data.

If the app does not recover after an update, inspect logs:

```bash
sudo journalctl -u siaga -n 200 --no-pager
```

Rollback to the previous commit if the last pull is the problem:

```bash
sudo -iu siaga
cd /opt/siaga/app
git log --oneline -5
git reset --hard HEAD~1
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm run build
exit
sudo systemctl restart siaga
```

If data itself was damaged, stop SIAGA and restore the newest known-good backup:

```bash
sudo systemctl stop siaga
sudo cp /opt/siaga/backups/siaga-YYYYMMDD-HHMMSS.db /opt/siaga/app/backend/siaga.db
sudo chown siaga:siaga /opt/siaga/app/backend/siaga.db
sudo systemctl start siaga
```

Check Nginx:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
```

## HTTPS

After you point a real domain to `43.156.117.49`, install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

Then edit `/etc/siaga/siaga.env`:

```text
FRONTEND_URL=https://your-domain.example
```

Restart:

```bash
sudo systemctl restart siaga nginx
```

## Safety Notes

- Add at least 4GB swap. The bootstrap script does this.
- Do not expose database files, `.env`, or upload backup folders through Nginx.
- Back up `backend/siaga.db` and `backend/uploads` before every major deploy.
- Never run `INIT_DB=1` or `npm run init` on a live database unless you intentionally want to wipe and reseed it.
- Keep direct Node port access closed; public access should go through Nginx.

## Optional Hermes Later

When you are ready to install Hermes on the same VPS, rerun the bootstrap with:

```bash
sudo INSTALL_HERMES=1 \
  SIAGA_REPO_URL="git@github.com:hjeruk1/siaga.git" \
  SIAGA_DOMAIN="43.156.117.49" \
  /tmp/tencent-lighthouse-bootstrap.sh
```

Then run Hermes setup manually.

## References

- Hermes Agent: https://github.com/NousResearch/hermes-agent
- Hermes docs: https://hermes-agent.nousresearch.com/
