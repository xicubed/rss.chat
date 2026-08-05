//getthread -- Node.js code that fetches a whole rss.chat conversation with one API call, and prints it as an indented outline.
	//An example app from the rss.chat repo: https://github.com/scripting/rss.chat/tree/main/examples/getthread
	//Same output as the threadwalker example, which assembles the thread from the RSS feeds alone --
	//this is the other door: one call to /getthread and the server hands you the tree.

const https = require ("https");

const urlPost = getPostUrl ();
const theServer = new URL (urlPost).origin; //the API lives on the server the post lives on

function getPostUrl () { //first thing on the command line, or a good example thread
	if (process.argv [2] === undefined) {
		return ("https://rss.chat/?id=204");
		}
	else {
		return (process.argv [2]);
		}
	}

function servercall (thePath, callback) {
	https.get (theServer + thePath, function (response) {
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

function printItem (item, indentlevel) {
	var theText = item.description;
	if (item.markdowntext !== undefined) {
		theText = item.markdowntext;
		}
	console.log ("\t".repeat (indentlevel) + item.author + ": " + theText.split ("\n") [0]);
	(item.replies || []).forEach (function (reply) {
		printItem (reply, indentlevel + 1);
		});
	}

servercall ("/getthread?guid=" + encodeURIComponent (urlPost), function (thread) {
	printItem (thread, 0);
	});
