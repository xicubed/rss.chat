# getthread

Fetches a whole rss.chat conversation with one API call, and prints it as an indented outline.

### Why it exists

The [threadwalker](../threadwalker/) example shows that a conversation is walkable from the RSS feeds alone -- every post's feed item points at a comments feed, every level the same shape. That door is always open, and it works with no API at all.

This is the other door. The `/getthread` endpoint does the walk on the server, where the whole conversation lives in one database, and answers with the tree in one response: the post's item record with a `replies` array, each reply the same shape, nested all the way down. One call instead of one fetch per post.

Both doors open onto the same conversation. Which one you use depends on what you're building -- a feed reader already speaks RSS and may prefer the feeds; an app that wants a thread right now wants this.

### How to run it

You'll need Node. No packages to install.

```
node thread.js
```

It prints the conversation as an outline -- one line per post, each reply indented under the post it answers.

### Pointing it at another thread

Pass any rss.chat post's permalink as an argument:

```
node thread.js "https://rss.chat/?id=204"
```

You get that post and everything under it. Ask about a reply and you get just its branch; ask about the root and you get the whole thread.

### The API entry

The endpoint is documented in [api.md](../../server/docs/api.md) -- see `/getthread`.
