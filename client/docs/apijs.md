# Calling the RSS.chat network from the browser

[api.js](https://github.com/scripting/rss.chat/blob/main/client/code/api.js) is how the rss.chat client talks to its server, and you can use it in your own pages. Every endpoint in [the API](../../server/docs/api.md) is a one-line method call, with the query strings, the authentication, and the response handling done for you.

It's for browser-based JavaScript only. From Node, call the HTTP interface directly -- the [easyblogger](https://github.com/scripting/rss.chat/tree/main/examples/easyblogger) and [getthread](https://github.com/scripting/rss.chat/tree/main/examples/getthread) examples show how.

### A complete page

This is a whole working web page. Save it as an .html file, open it in a browser, and it writes dave's recent posts to the console.

```html
<script src="https://code.scripting.com/includes/basic/code.js"></script>
<script src="https://code.scripting.com/rsschat/api.js"></script>
<script>
	const myServer = new rssNetworkServer ({serverAddress: "https://rss.chat/"});
	myServer.getRecentUserItems ("dave", function (err, theItems) {
		if (err) {
			console.log (err.message);
			}
		else {
			theItems.forEach (function (item) {
				console.log (item.pubDate + " -- " + item.description);
				});
			}
		});
</script>
```

Three things to notice:

1. The first script is a small utilities bundle api.js depends on. Include it first, always.
2. You create one `rssNetworkServer` object and make every call through it. The `serverAddress` names the server you're talking to, and it ends with a slash.
3. Every method takes a callback as its last parameter, called as `callback (err, data)`. When something went wrong, `err` is an object and `err.message` is a plain sentence saying what and why. When it worked, `err` is undefined and `data` is the result.

To talk to a different server, change the address: `new rssNetworkServer ({serverAddress: "https://demo.rss.chat/"})`.

### Reading

None of these require the user to be signed in.

* `getRecentItems (ct, callback)` -- the most recent posts on the server, newest first. `ct` is how many you want.
* `getRecentUserItems (name, callback)` -- the most recent posts by one user.
* `getItemByGuid (guid, callback)` -- one post, by its permalink.
* `getItemAndReplies (screenname, idparent, callback)` -- a post and the replies under it.
* `getMostActiveToday (callback)` -- today's most active conversations.
* `getLikersList (id, callback)` -- who liked a post.
* `getFeed (screenname, callback)` -- a user's RSS feed, as XML text.
* `getSubscriptionList (callback)` -- every user on the server, as OPML text.
* `getVersion (callback)` -- the server's version.

### Signing in

There are no passwords on rss.chat -- a user proves who they are by clicking a link the server emails them. api.js runs the whole dance; your page does two things:

1. Call `signIn (email, callback)`. The server emails a confirmation link, and the callback tells you the mail went out -- tell your user to go click it.
2. The link brings the user back to your page. The `rssNetworkServer` constructor notices the confirmation in the address, saves the credential in localStorage, and reloads the page clean. From then on `userIsSignedIn ()` answers true -- across visits, until `signOut ()` is called.

For someone who doesn't have an account yet, call `createAccount (email, name, callback)` instead -- same dance, and the account is created when they click. `checkWhitelist (emailaddress, callback)` tells you in advance whether the server will take the signup.

Once signed in, `getScreenname ()` and `getEmail ()` answer immediately -- no callback, no server call.

### Writing

These require the user to be signed in; called before that, they answer with a can't-because error.

* `newPost (postRec, callback)` -- publish a post. The minimal `postRec` is `{description: "The text of the post."}`; add `title` if there is one, `inReplyTo` with a post's id to make it a reply. The callback gets the full item record the server created.
* `updatePost (postRec, callback)` -- edit a post. Same shape, plus `id` saying which post.
* `deletePost (id, callback)` -- delete a post.
* `toggleLike (id, callback)` -- like a post, or take the like back.
* `uploadMedia (type, base64text, callback)` -- upload an image: its MIME type and its bytes as base64. The callback gets the address the server will serve it from.

### Working examples, one per method

The bottom half of [api.js itself](https://github.com/scripting/rss.chat/blob/main/client/code/api.js) is a set of `testXxx` functions -- one for nearly every method, each a complete working call with its error handling. When you want to see how a call is really used, read its test. That's what they're there for.
