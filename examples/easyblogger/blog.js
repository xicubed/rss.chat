//easyblogger -- Node.js code that renders a user's recent rss.chat posts as a simple blog page.
	//An example app from the rss.chat repo: https://github.com/scripting/rss.chat/tree/main/examples/easyblogger
	//Two API calls: /getuserdata names the blog, /getrecentuseritems fills it. The output is blog.html.

const https = require ("https");
const http = require ("http");
const fs = require ("fs");

const ctPostsToShow = 25;
const theScreenname = getScreenname ();
const theServer = getServer ();

function getScreenname () { //first thing on the command line, or dave
	if (process.argv [2] === undefined) {
		return ("dave");
		}
	else {
		return (process.argv [2]);
		}
	}

function getServer () { //second thing on the command line, or rss.chat
	if (process.argv [3] === undefined) {
		return ("https://rss.chat");
		}
	else {
		return (process.argv [3]);
		}
	}

function servercall (thePath, callback) {
	const theProtocol = (theServer.indexOf ("https:") === 0) ? https : http;
	theProtocol.get (theServer + thePath, function (response) {
		var body = "";
		response.on ("data", function (chunk) {
			body += chunk;
			});
		response.on ("end", function () {
			if (response.statusCode !== 200) {
				console.log (body); //the server explains what went wrong in a plain sentence
				process.exit (1);
				}
			var jstruct;
			try {
				jstruct = JSON.parse (body);
				}
			catch (err) {
				console.log ("Can't read the response because it isn't JSON. " + err.message);
				process.exit (1);
				}
			callback (jstruct);
			});
		}).on ("error", function (err) {
			console.log (err.message);
			process.exit (1);
			});
	}

function encodeHtml (theString) {
	return (theString.replace (/&/g, "&amp;").replace (/</g, "&lt;").replace (/>/g, "&gt;"));
	}

servercall ("/getuserdata?screenname=" + encodeURIComponent (theScreenname), function (userData) {
	const blogTitle = (userData.prefs !== undefined && userData.prefs.myFeedTitle !== undefined && userData.prefs.myFeedTitle.length > 0) ? userData.prefs.myFeedTitle : theScreenname;
	const blogDescription = (userData.prefs !== undefined && userData.prefs.myFeedDescription !== undefined) ? userData.prefs.myFeedDescription : "";
	servercall ("/getrecentuseritems?name=" + encodeURIComponent (theScreenname), function (theItems) {
		var htmltext = "";
		function add (theString) {
			htmltext += theString + "\n";
			}
		add ("<html>");
		add ("<head>");
		add ("<meta charset=\"utf-8\">");
		add ("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
		add ("<title>" + encodeHtml (blogTitle) + "</title>");
		add ("<style>");
		add ("body {font-family: georgia, serif; max-width: 640px; margin: 2em auto; padding: 0 1em; line-height: 1.5;}");
		add ("h1 {font-size: 1.6em; margin-bottom: 0;}");
		add (".description {color: #666; margin-top: 0.25em;}");
		add (".post {margin: 2em 0; border-bottom: 1px solid #eee; padding-bottom: 1.5em;}");
		add (".when {font-size: 0.85em; color: #999;}");
		add (".when a {color: #999; text-decoration: none;}");
		add (".title {font-weight: bold; font-size: 1.2em; margin: 0.25em 0;}");
		add ("img {max-width: 100%;}");
		add ("</style>");
		add ("</head>");
		add ("<body>");
		add ("<h1>" + encodeHtml (blogTitle) + "</h1>");
		if (blogDescription.length > 0) {
			add ("<div class=\"description\">" + encodeHtml (blogDescription) + "</div>");
			}
		var ctPosts = 0;
		theItems.forEach (function (item) {
			if (ctPosts >= ctPostsToShow) {
				return;
				}
			ctPosts++;
			add ("<div class=\"post\">");
			const theDate = new Date (item.pubDate);
			add ("<div class=\"when\"><a href=\"" + item.guid + "\">" + theDate.toDateString () + "</a></div>");
			if (item.title !== undefined) { //titles are optional here -- most posts don't have one
				add ("<div class=\"title\">" + encodeHtml (item.title) + "</div>");
				}
			add (item.description); //already clean -- the server sanitizes every post as it's written
			add ("</div>");
			});
		add ("</body>");
		add ("</html>");
		fs.writeFileSync ("blog.html", htmltext);
		console.log ("Wrote blog.html -- " + ctPosts + " posts by " + theScreenname + " from " + theServer + ". Open it in your browser.");
		});
	});
