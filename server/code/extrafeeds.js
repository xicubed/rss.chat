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
const asciidoc = require ("./asciidoc.js");

const maxItemsPerFeed = 50; //7/19/26 by CC -- was 25; deeper cache feeds the timeline's infinite scroll
const pollEveryMinutes = 5;

var theFeeds = []; //one entry per configured feed: {config, items, seenGuids, flFirstPoll}
var notifyCallback = undefined;

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
function convertEntry (feedConfig, channel, entry) {
	const guid = entry.guid || entry.link;
	const link = entry.link || ((typeof guid === "string" && guid.indexOf ("http") === 0) ? guid : undefined);
	const item = {
		id: hashGuid (guid),
		guid,
		link,
		title: entry.title,
		description: asciidoc.sanitize (entry.content || entry.contentSnippet || ""),
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
function pollAll () {
	theFeeds.forEach (pollFeed);
	}

function start (extraFeedsConfig, theNotifyCallback) {
	if ((extraFeedsConfig === undefined) || (extraFeedsConfig.length === 0)) {
		return; //no extra feeds configured -- the feature stays dormant
		}
	notifyCallback = theNotifyCallback;
	theFeeds = extraFeedsConfig.map (function (feedConfig) {
		return ({config: feedConfig, items: [], seenGuids: new Set (), flFirstPoll: true});
		});
	console.log ("extrafeeds: polling " + theFeeds.length + " feeds every " + pollEveryMinutes + " minutes.");
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
