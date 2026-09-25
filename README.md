# rss.chat

A simple chat network, client and server, based on RSS 2.0 feeds and websockets.

This is a fork of Dave Winer's [scripting/rss.chat](https://github.com/scripting/rss.chat).
It runs at [perstitio.us](https://perstitio.us/) and adds its own features on top
(interleaved outside feeds, AsciiDoc posts, cross-posting). Changes are logged,
newest first, in [server/code/worknotes.md](server/code/worknotes.md).

## ⚠️ Pushing to `main` deploys the live server

Every push to `main` -- including merging a pull request -- runs
[.github/workflows/deploy.yml](.github/workflows/deploy.yml), which updates
perstitio.us and **restarts it** within about 30 seconds. On the server it runs:

```bash
cd ~/rss.chat
git fetch origin main
git reset --hard origin/main      # any hand edits to tracked files on the box are wiped
cd server/code
npm install
sudo systemctl restart rsschat
```

Your real `config.json`, `prefs.json` and `data/` are gitignored, so a deploy
never touches them.

Check a deploy in the repo's **Actions** tab. Re-run the latest one from there
("Run workflow") if you ever need to redeploy without a new commit.

## Making a change

1. Work on a branch, never directly on `main`.
2. Open a pull request into `main`.
3. Merge it when you're ready for it to go live -- **merging is deploying.**

To undo a bad deploy, revert the merge on GitHub (or `git revert` it and push
to `main`); that deploys the previous code.

## Pulling in Dave's changes (upstream)

One-time setup in your local clone:

```bash
git remote add upstream https://github.com/scripting/rss.chat
```

Each time:

```bash
git fetch upstream
git log --oneline main..upstream/main     # what's new
git checkout -b upstream-sync origin/main
git merge upstream/main                   # fix any conflicts, keeping both sides where you can
git push -u origin upstream-sync          # then open a PR, review, merge = deploy
```

Always use a real merge (not squash or rebase) so git remembers what's already
been brought in, and the next sync only shows new commits. Read the new entries
at the top of upstream's `server/code/worknotes.md` -- Dave notes there when an
update needs a new setting or an `npm install`.

## Where things are

| | |
| --- | --- |
| [server/deploy/deploy.md](server/deploy/deploy.md) | How perstitio.us is set up: host, systemd, Apache, secrets, logs |
| [server/docs/install.md](server/docs/install.md) | Installing a server from scratch |
| [server/docs/config.md](server/docs/config.md) | Every `config.json` setting |
| [server/docs/api.md](server/docs/api.md) | Server HTTP API |
| [client/docs/](client/docs/readme.md) | The browser client |
| [server/code/worknotes.md](server/code/worknotes.md) | Change log, newest first |
