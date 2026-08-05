//extrafeeds.js -- 7/19/26 by CC -- interleave outside feeds into the timeline.
//
//The server polls a configured list of RSS feeds -- another rss.chat instance's
//everyone-feed, Wired, anything with a feed -- converts entries into the same
//item-record shape the rest of the system speaks, and:
//  1. merges them, date-sorted, into /getrecentitems responses (mergeRecent), and
//  2. broadcasts newly-discovered items over the websocket, so they appear in
//     open timelines live, exactly like local posts do.
//
//Foreign items are marked flExtra: true and carry extraFeedName, so clients can
//filter them per-user (the checkbox list) and route actions (reply, like) to the
//item's home site instead of our API. Their HTML is sanitized at ingest with the
//same rules AsciiDoc output gets. Nothing is written to the database -- the
//cache is in memory and rebuilds on restart from the next poll.

const Parser = require ("rss-parser");
const opml = require ("opml"); //8/4/26 by CC -- the feed list can live in an outline on the web
const asciidoc = require ("./asciidoc.js");

const maxItemsPerFeed = 50; //7/19/26 by CC -- was 25; deeper cache feeds the timeline's infinite scroll
const pollEveryMinutes = 5;

var theFeeds = []; //one entry per configured feed: {config, items, seenGuids, flFirstPoll}
var notifyCallback = undefined;
var staticConfigs = []; //8/4/26 by CC -- the extraFeeds array from config.json; always first in the list
var urlFeedListOpml = undefined; //8/4/26 by CC -- when set, an outline on the web extends the list, re-read every poll cycle

const parser = new Parser ({
	timeout: 15000,
	headers: {"User-Agent": "rsschat-extrafeeds/0.1"},
	customFields: {item: [["source", "sourceAttribution", {keepArray: true}], ["media:thumbnail", "mediaThumbnail"]]}
	});

//avatars: an rss.chat-style feed names each item's author feed in <source url="...">,
//and that feed's channel <image> is the author's avatar. Fetch each author feed
//once and remember what we learned -- real faces on interleaved posts.
var avatarCache = new Map (); //source feed url -> image url (or undefined when the feed has none)
function getSourceInfo (entry) { //the item's <source> element: author name and their feed url
	const source = (entry.sourceAttribution !== undefined) ? entry.sourceAttribution [0] : undefined;
	if (source === undefined) {
		return ({});
		}
	if (typeof source === "string") {
		return ({name: source});
		}
	return ({name: source._, feedUrl: (source.$ !== undefined) ? source.$.url : undefined});
	}
function fetchAvatar (sourceFeedUrl) { //resolves and caches; safe to call repeatedly
	if (avatarCache.has (sourceFeedUrl)) {
		return (Promise.resolve ());
		}
	avatarCache.set (sourceFeedUrl, undefined); //so a slow fetch isn't started twice
	return (parser.parseURL (sourceFeedUrl) .then (function (channel) {
		if ((channel.image !== undefined) && (channel.image.url !== undefined)) {
			avatarCache.set (sourceFeedUrl, channel.image.url);
			}
		}) .catch (function (err) {
		console.log ("extrafeeds: no avatar from " + sourceFeedUrl + " -- " + err.message);
		}));
	}

function hashGuid (guid) { //a stable synthetic id, well clear of local database ids
	var theHash = 5381;
	for (var i = 0; i < guid.length; i++) {
		theHash = ((theHash * 33) + guid.charCodeAt (i)) % 1000000000;
		}
	return (2000000000 + theHash);
	}
function getAuthor (entry, channelTitle) {
	if ((entry.creator !== undefined) && (entry.creator.length > 0)) {
		return (entry.creator);
		}
	const sourceName = getSourceInfo (entry).name; //rss.chat feeds: <source url="...">Dave Winer</source>
	if ((sourceName !== undefined) && (sourceName.length > 0)) {
		return (sourceName);
		}
	return (channelTitle);
	}
function getImageUrl (feedConfig, channel, entry) { //the author's real avatar when we know it, then the configured image, the story's thumbnail, the channel's image
	const sourceFeedUrl = getSourceInfo (entry).feedUrl;
	if ((sourceFeedUrl !== undefined) && (avatarCache.get (sourceFeedUrl) !== undefined)) {
		return (avatarCache.get (sourceFeedUrl));
		}
	if (feedConfig.imageUrl !== undefined) {
		return (feedConfig.imageUrl);
		}
	const thumb = entry.mediaThumbnail;
	if ((thumb !== undefined) && (thumb.$ !== undefined) && (thumb.$.url !== undefined)) {
		return (thumb.$.url);
		}
	if ((channel.image !== undefined) && (channel.image.url !== undefined)) {
		return (channel.image.url);
		}
	return (undefined);
	}
function getRemoteScreenname (entry) { //"dave@rss.chat" for an item whose source feed is an rss.chat-style user feed; the client routes clicks on the name to that site's profile page
	const sourceFeedUrl = getSourceInfo (entry).feedUrl;
	if (sourceFeedUrl === undefined) {
		return (undefined);
		}
	const m = sourceFeedUrl.match (/^https?:\/\/([^\/]+)\/users\/([^\/]+)\/rss\.xml$/);
	return ((m !== null) ? (m [2] + "@" + m [1]) : undefined);
	}
function absolutizeUrls (htmltext, baseUrl) { //8/4/26 by CC -- feeds in the wild carry relative addresses; resolve them against the item's own page so images and links work away from home
	if ((htmltext === undefined) || (baseUrl === undefined)) {
		return (htmltext);
		}
	return (htmltext.replace (/(src|href)="([^"]+)"/gi, function (theMatch, attname, url) {
		if (/^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/\/|^#/.test (url)) { //already absolute, protocol-relative, or a fragment -- leave it alone
			return (theMatch);
			}
		try {
			return (attname + "=\"" + new URL (url, baseUrl).href + "\"");
			}
		catch (err) {
			return (theMatch);
			}
		}));
	}
function convertEntry (feedConfig, channel, entry) {
	const guid = entry.guid || entry.link;
	const link = entry.link || ((typeof guid === "string" && guid.indexOf ("http") === 0) ? guid : undefined);
	const item = {
		id: hashGuid (guid),
		guid,
		link,
		title: entry.title,
		description: absolutizeUrls (asciidoc.sanitize (entry.content || entry.contentSnippet || ""), link || channel.link || feedConfig.xmlUrl), //absolutize after sanitizing: sanitize-html normalizes attributes to double quotes
		pubDate: entry.isoDate || entry.pubDate,
		author: getAuthor (entry, channel.title),
		feedUrl: feedConfig.xmlUrl,
		feedTitle: feedConfig.name,
		feedLink: channel.link,
		imageUrl: getImageUrl (feedConfig, channel, entry),
		screenname: getRemoteScreenname (entry), //7/19/26 by CC -- remote handle, e.g. "dave@rss.chat"
		flExtra: true,
		extraFeedName: feedConfig.name
		};
	var theConvertedItem = new Object ();
	for (var x in item) {
		if (item [x] !== undefined) {
			theConvertedItem [x] = item [x];
			}
		}
	return (theConvertedItem);
	}
function pollFeed (theFeed) {
	parser.parseURL (theFeed.config.xmlUrl) .then (function (channel) {
		const entries = (channel.items || []).slice (0, maxItemsPerFeed);
		const avatarFetches = []; //learn the authors' avatars before converting, so the items carry them
		entries.forEach (function (entry) {
			const sourceFeedUrl = getSourceInfo (entry).feedUrl;
			if ((sourceFeedUrl !== undefined) && !avatarCache.has (sourceFeedUrl)) {
				avatarFetches.push (fetchAvatar (sourceFeedUrl));
				}
			});
		return (Promise.all (avatarFetches) .then (function () {
			return (channel);
			}));
		}) .then (function (channel) {
		const entries = (channel.items || []).slice (0, maxItemsPerFeed);
		entries.forEach (function (entry) {
			const guid = entry.guid || entry.link;
			if (guid === undefined) {
				return;
				}
			if (!theFeed.seenGuids.has (guid)) {
				theFeed.seenGuids.add (guid);
				const item = convertEntry (theFeed.config, channel, entry);
				theFeed.items.unshift (item);
				if (!theFeed.flFirstPoll && (notifyCallback !== undefined)) { //the first poll is backfill, not news
					notifyCallback ("newItem", {item});
					}
				}
			});
		theFeed.items = theFeed.items.slice (0, maxItemsPerFeed);
		theFeed.flFirstPoll = false;
		}) .catch (function (err) {
		console.log ("extrafeeds: error polling \"" + theFeed.config.name + "\" -- " + err.message);
		});
	}
function notComment (node) { //8/4/26 by CC
	return (!(node.isComment === "true" || node.isComment === true));
	}
function feedConfigsFromOpml (theOutline) { //8/4/26 by CC -- outline conventions: a top-level node with an xmlUrl is a feed; a container's children are a group named for it
	var theList = [];
	(theOutline.opml.body.subs || []).forEach (function (node) {
		if (!notComment (node)) {
			return;
			}
		if (node.xmlUrl !== undefined) {
			theList.push ({name: (node.name !== undefined) ? node.name : node.text, xmlUrl: node.xmlUrl, imageUrl: node.imageUrl});
			}
		else {
			(node.subs || []).forEach (function (sub) {
				if (notComment (sub) && (sub.xmlUrl !== undefined)) { //a name attribute overrides the label items carry as their source; text stays the checkbox label
					theList.push ({name: (sub.name !== undefined) ? sub.name : sub.text, shortName: sub.text, group: node.text, groupUrl: node.htmlUrl, xmlUrl: sub.xmlUrl, imageUrl: sub.imageUrl});
					}
				});
			}
		});
	return (theList);
	}
function setFeedList (feedConfigs) { //8/4/26 by CC -- reconcile: feeds that stay keep their poll state, arrivals start fresh, departures drop
	var byUrl = new Map ();
	theFeeds.forEach (function (theFeed) {
		byUrl.set (theFeed.config.xmlUrl, theFeed);
		});
	const seenUrls = new Set (); //the same feed can appear in config.json and the outline -- first one wins
	theFeeds = [];
	feedConfigs.forEach (function (feedConfig) {
		if ((feedConfig.xmlUrl === undefined) || seenUrls.has (feedConfig.xmlUrl)) {
			return;
			}
		seenUrls.add (feedConfig.xmlUrl);
		const existing = byUrl.get (feedConfig.xmlUrl);
		if (existing !== undefined) {
			existing.config = feedConfig; //its name or group may have changed in the outline
			theFeeds.push (existing);
			}
		else {
			theFeeds.push ({config: feedConfig, items: [], seenGuids: new Set (), flFirstPoll: true});
			}
		});
	}
function readFeedListOpml (callback) { //8/4/26 by CC -- extend the static list with the outline's feeds; on error the list stands as it was
	opml.readOutline (urlFeedListOpml, function (err, theOutline) {
		if (err) {
			console.log ("extrafeeds: can't read the feed-list outline because " + err.message);
			}
		else {
			try {
				setFeedList (staticConfigs.concat (feedConfigsFromOpml (theOutline)));
				}
			catch (err) {
				console.log ("extrafeeds: can't use the feed-list outline because " + err.message);
				}
			}
		callback ();
		});
	}
function pollAll () {
	if (urlFeedListOpml !== undefined) { //8/4/26 by CC -- the mix can change between polls; an outline edit is all it takes
		readFeedListOpml (function () {
			theFeeds.forEach (pollFeed);
			});
		}
	else {
		theFeeds.forEach (pollFeed);
		}
	}

function start (extraFeedsConfig, theNotifyCallback, urlOpml) { //urlOpml added 8/4/26 by CC -- an outline on the web that extends the feed list
	staticConfigs = (extraFeedsConfig !== undefined) ? extraFeedsConfig : [];
	urlFeedListOpml = ((urlOpml !== undefined) && (urlOpml.length > 0)) ? urlOpml : undefined;
	if ((staticConfigs.length === 0) && (urlFeedListOpml === undefined)) {
		return; //no extra feeds configured -- the feature stays dormant
		}
	notifyCallback = theNotifyCallback;
	setFeedList (staticConfigs);
	console.log ("extrafeeds: polling " + theFeeds.length + " feeds every " + pollEveryMinutes + " minutes" + ((urlFeedListOpml !== undefined) ? ", list extended by " + urlFeedListOpml : "") + ".");
	pollAll ();
	setInterval (pollAll, pollEveryMinutes * 60 * 1000);
	}
function mergeRecent (localItems, maxCt) { //merge the cached foreign items into a timeline response, newest first
	if (theFeeds.length === 0) {
		return (localItems);
		}
	var merged = localItems.slice ();
	theFeeds.forEach (function (theFeed) {
		merged = merged.concat (theFeed.items);
		});
	const seenKeys = new Set (); //the same story can arrive via two feeds (a Wired story in both Top Stories and AI) -- first configured feed wins
	merged = merged.filter (function (item) {
		const theKey = item.guid || item.id;
		if (seenKeys.has (theKey)) {
			return (false);
			}
		seenKeys.add (theKey);
		return (true);
		});
	merged.sort (function (a, b) {
		return (new Date (b.pubDate) - new Date (a.pubDate));
		});
	return (merged.slice (0, maxCt));
	}
function getFeedList () { //what the client needs to draw the checkbox list
	return (theFeeds.map (function (theFeed) {
		return ({
			name: theFeed.config.name,
			xmlUrl: theFeed.config.xmlUrl,
			group: theFeed.config.group, //7/19/26 by CC -- feeds sharing a group render under one heading
			shortName: theFeed.config.shortName, //the label inside the group ("Backchannel" under "Wired")
			groupUrl: theFeed.config.groupUrl //when set, the group heading links here (wired.com for "Wired")
			});
		}));
	}

exports.start = start;
exports.mergeRecent = mergeRecent;
exports.getFeedList = getFeedList;
