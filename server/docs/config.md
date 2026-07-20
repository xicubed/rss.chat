# About config.json

`config.json` holds the values you provide to run an rss.chat server. It lives in the app's folder (e.g. `pagepark/domains/myserver.chat/config.json`) and is read once at startup. daveappserver reads the same file and fills in operational defaults for anything you leave out, so you only need the fields below.

The settings divide into two groups. The first group is the values you must change -- they identify your server, your database, your storage. The second group is values that work as-is for almost every installation; read through them once, but expect to leave them alone.

## Settings you must change

Every value in this section is specific to your installation. Going down this list, replacing each example with your own value, is the heart of the install.

### productNameForDisplay

The name users see in the UI (the title at the top of the page, for example).

`"productNameForDisplay": "myserver.chat"`

### myDomain

The domain the server runs under, no scheme. In production it's your real domain; on a dev box it's `localhost` plus the port.

`"myDomain": "myserver.chat"`

### urlServerForClient

The base URL the browser uses to reach the server. Item permalinks (guids) are derived from this value, so changing it changes the guids of future posts.

`"urlServerForClient": "https://myserver.chat/"`

### urlServerForEmail

The base URL used to build the magic links in confirmation emails. Normally the same as `urlServerForClient`.

`"urlServerForEmail": "https://myserver.chat/"`

### database

The MySQL connection. `database` is the schema name you created at install time (see [install.md](install.md)). Keep `charset` at `utf8mb4` to match the schema.

```json
"database": {
	"host": "your-cluster.db.ondigitalocean.com",
	"port": 25060,
	"user": "doadmin",
	"password": "your-db-password",
	"charset": "utf8mb4",
	"connectionLimit": 100,
	"database": "myRssChat",
	"debug": false
	}
```

Never commit a real password. Keep `config.json` out of any public repo.

### Where feeds live

The server publishes an RSS feed for every user, plus a subscription list of all its feeds. One setting says where they go.

#### flFeedsInDatabase

When true, the server stores the feeds and the subscription list in its database and serves them itself, from your own domain -- a user's feed is at `https://myserver.chat/users/dave/rss.xml`, the subscription list at `https://myserver.chat/data/subs.opml`. This is what the example config uses, and the right choice for a new server: there's nothing else to set up. The four settings below aren't needed and should be left out.

`"flFeedsInDatabase": true`

The built-in default is false, which means the alternative: publishing the feeds as static files on Amazon S3. If you go that way, these four settings say where. Each pair is a location: the S3 path the server writes to, and the public URL readers fetch from -- they must point at the same place. Every server must have its own locations; there are no built-in defaults.

#### rssS3Path

The S3 folder the server writes user feeds into. Each user gets a subfolder named for their screenname.

`"rssS3Path": "/myBucket/myserver.chat/users/"`

#### rssFeedUrl

The public base URL of that same folder -- feed addresses are built from it, e.g. `https://users.myserver.chat/dave/rss.xml`.

`"rssFeedUrl": "https://users.myserver.chat/"`

#### opmlS3Path

The S3 address the server writes its subscription list to -- an OPML file listing every user's feed.

`"opmlS3Path": "/myBucket/myserver.chat/data/subs.opml"`

#### opmlListUrl

The public URL of that subscription list.

`"opmlListUrl": "https://data.myserver.chat/subs.opml"`

### Email sign-in

Sign-in is a magic link: the user enters an email, the server mails a confirmation link. These three fields shape that email, and each one names your server.

#### mailSender

The From address on confirmation emails.

`"mailSender": "admin@myserver.chat"`

#### confirmEmailSubject

The subject line of the confirmation email.

`"confirmEmailSubject": "myserver.chat confirmation"`

#### operationToConfirm

The phrase used in the body of the confirmation email to describe what the user is confirming.

`"operationToConfirm": "sign in to myserver.chat"`

## Settings you'll rarely change

These work as shipped for almost every installation. The websocket group is the one you're most likely to visit, when you turn on live updates in production.

### productName

The internal name of the product. Used in logging and as the app's identity, not shown to users.

`"productName": "rssChat"`

### urlServerHomePageSource

The URL the server pulls the client's home page HTML from. Every installation currently pulls from the same place on scripting.com.

`"urlServerHomePageSource": "https://code.scripting.com/rsschat/index.html"`

### urlFavicon

The icon the browser shows in the tab for your server. When the browser asks for `/favicon.ico`, the server redirects it to this URL. The default is the "moof" icon you'll recognize from scripting.com -- set your own to give your server its own face.

`"urlFavicon": "https://myserver.chat/images/favicon.ico"`

### prefsPath

Filename where the server stores its prefs.

`"prefsPath": "prefs.json"`

### dataPath

Folder where the server keeps its data files.

`"dataPath": "data/"`

### WebSockets (live updates)

Live updates (a new post appearing in the timeline without a reload) run over a websocket. These four fields configure it. Leave `flWebsocketEnabled` false on a dev box that has no TLS/proxy in front of it; when you turn it on in production, `urlWebsocketServerForClient` gets your domain.

#### flWebsocketEnabled

Turns live updates on or off. Default: `false`.

`"flWebsocketEnabled": true`

#### websocketPort

The port the app's websocket server listens on. Your reverse proxy (Caddy) routes `wss://` upgrade requests to this port.

`"websocketPort": 1462`

#### flSecureWebsocket

Whether the client connects over secure websockets (`wss://`). True in production where TLS is terminated by the proxy. Default: `false`.

`"flSecureWebsocket": true`

#### urlWebsocketServerForClient

The websocket URL the client opens. Empty string when websockets are off.

`"urlWebsocketServerForClient": "wss://myserver.chat/"`

### extraFeeds

Optional. Outside feeds to interleave into the timeline -- another rss.chat instance's everyone-feed, a magazine, anything with an RSS feed. The server polls each feed every few minutes, merges its entries into the timeline date-sorted, and broadcasts new ones over the websocket so they appear live. The client shows a Feeds menu with a checkbox per feed, so each reader chooses their own mix. Items from these feeds are marked `flExtra` in API responses; actions on them (reply, like) link to the item's home site. Leave it out and the feature stays dormant -- that's the default.

```json
"extraFeeds": [
	{"name": "rss.chat", "xmlUrl": "https://rss.chat/users/rss.xml"},
	{"name": "Wired Top Stories", "xmlUrl": "https://www.wired.com/feed/rss"}
	]
```

Each entry is a display name and a feed address, plus an optional `imageUrl` used as the avatar for that feed's items (feeds that carry per-item thumbnails, like Wired's, supply their own). Feeds that belong together can share a `group` ("Wired") and carry a `shortName` ("Backchannel") -- the checkbox list renders them indented under one heading, which keeps long names from crowding the rail. A `groupUrl` on the group's feeds makes the heading a link to that publication's website. The order matters twice: it's the order of the checkboxes, and when the same story arrives through two feeds, the first configured feed gets the attribution.

### localSourceLabel

Optional, used with `extraFeeds`. The name shown as the source of this server's own posts -- next to the feed icon on each post, and on the local-posts checkbox. Defaults to `myDomain`.

`"localSourceLabel": "su.perstitio.us"`

### crossPostTargets

Optional. Other rss.chat servers the `/compose` page can also post to -- same software, same `/newpost`, called straight from the writer's browser. Each gets a checkbox in the composer; the writer's credentials for the other server are asked for once and kept in their browser's localStorage, never on this server. The first publish creates the post over there and the writer's browser remembers its id, so later updates mirror as updates.

A target can also be a WordPress site: give it `"type": "wordpress"` and the site's numeric `idSite` instead of a url. The composer signs the writer on through WordPress.com (via [wpIdentity](https://github.com/scripting/wpIdentity), the same way the wordpress examples do) and posts directly from the browser. A post with no markdown -- an AsciiDoc post -- crosses as its rendered HTML, syntax highlighting included. Adding `"flMirrorTimeline": true` to a wordpress target also puts the mirror in the timeline page itself: while the home page is open, every post of your own that crosses the websocket is mirrored automatically -- posts already cross-posted from the composer are updated, not duplicated (the two share one id map). A `WP mirror` checkbox in the left rail turns it on and off.

```json
"crossPostTargets": [
	{"name": "demo.rss.chat", "url": "https://demo.rss.chat/"},
	{"name": "my blog", "type": "wordpress", "idSite": 123456789}
	]
```

```json
"crossPostTargets": [
	{"name": "demo.rss.chat", "url": "https://demo.rss.chat/"}
	]
```

### whitelist

Optional. An array of email addresses allowed to sign in. Leave it out and anyone can join -- that's the default. Use it during an invite-only phase to limit who can create an account.

```json
"whitelist": [
	"you@example.com",
	"someone@example.com"
	]
```

### note

A free-text comment for whoever reads the file. Not used by the app. The convention is to say which install this is and where it runs.

`"note": "This is the configuration file for the myserver.chat server."`

## Example file

A ready-to-edit example config, with invented values and a placeholder password, is the [config.json](../code/config.json) in the server's code folder. Copy it to your app folder as `config.json` and replace the values with your own.
