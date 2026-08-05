# easyblogger

Node.js code that renders a user's recent rss.chat posts as a simple blog page -- one HTML file, ready to open in a browser or put on a server. [blog.html](blog.html) is a sample of the output, from a real run, so you can see what it makes without running it.

### Why it exists

Everything you write on rss.chat is data you can have back, any way you like. This app shows how little it takes to turn a stream of posts into something with a different shape -- in this case a blog: your posts, newest first, in a clean readable column, each one linked to its permalink.

It's also a tour of the read API in about fifty lines. Two calls do all the work:

* **`/getuserdata`** names the blog -- the page's title and description come from the user's feed settings, the same ones their RSS feed carries.
* **`/getrecentuseritems`** fills it -- the item records arrive with everything the page needs: the body as ready-to-use HTML (the server cleans every post as it's written), the optional title, the publication date, the permalink. Posts with pictures just work; the images ride along in the HTML.

No account, no key, no packages -- both calls are open reads.

### How to run it

You'll need Node.

```
node blog.js
```

It writes `blog.html` in the current folder -- the last 25 posts by dave on rss.chat. Open it in your browser.

### Pointing it at another writer, or another server

The first argument is a screenname, the second a server:

```
node blog.js jenny
node blog.js oldman https://demo.rss.chat
```

### Ideas from here

Change the stylesheet and it's your design. Run it from cron and you have a blog that updates itself. Feed it `/getrecentitems` instead and it's the whole community's front page. The point of the exercise: the API hands you clean material, and what it becomes is up to you.

### The API entries

Both calls are documented in [api.md](../../server/docs/api.md).
