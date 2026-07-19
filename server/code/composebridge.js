//composebridge.js -- 7/19/26 by CC -- served by the rss.chat server and injected
//into the home page it serves. Two jobs, both bridges between the shipped client
//and this server's fork features:
//
//1. AsciiDoc: posts that carry AsciiDoc source open in /compose for editing --
//   the regular editor would replace the body with HTML and the server would
//   clear the stored source.
//
//2. Extra feeds: the server interleaves outside feeds (another rss.chat
//   instance, Wired, ...) into the timeline. This script wires the Feeds menu
//   checkboxes (state in localStorage, per browser), filters the timeline and
//   the websocket by them, and routes actions on foreign posts (reply, like,
//   edit) to the post's home site -- those actions aren't ours to perform.
//
//This runs after globals.js has defined the icon and menu arrays, and before
//startup () builds the UI from them. Every patch is defensive: if a name or
//shape changes upstream, the patch quietly does nothing and the client behaves
//as shipped.

(function () {

	//extra feed toggles -- which interleaved feeds are on, per browser
		function getOffMap () {
			try {
				return (JSON.parse (localStorage.extraFeedsOff || "{}"));
				}
			catch (err) {
				return ({});
				}
			}
		function feedEnabled (xmlUrl) {
			return (!getOffMap () [xmlUrl]);
			}
		var knownExtraFeeds = undefined; //lazily read from the server-injected Feeds menu
		function isKnownExtraFeed (feedUrl) {
			if (knownExtraFeeds === undefined) {
				knownExtraFeeds = [];
				document.querySelectorAll (".extraFeedToggle").forEach (function (node) {
					knownExtraFeeds.push (node.getAttribute ("data-xmlurl"));
					});
				}
			return (knownExtraFeeds.indexOf (feedUrl) !== -1);
			}

	//route foreign items home, and AsciiDoc posts to /compose
		function foreignUrl (item) {
			return (item.link || item.guid);
			}
		function openInCompose (item) {
			location.href = "/compose?id=" + item.id;
			}
		function patchClick (theArray, itemName, flComposeForAsciidoc) {
			try {
				theArray.forEach (function (theEntry) {
					if (theEntry.name === itemName) {
						const originalClick = theEntry.click;
						theEntry.click = function (ev) {
							const item = (ev !== undefined) ? ev.item : undefined;
							if ((item !== undefined) && item.flExtra) { //a foreign post: the action belongs to its home site
								window.open (foreignUrl (item), "_blank");
								return;
								}
							if (flComposeForAsciidoc && (item !== undefined) && (item.asciidoctext !== undefined) && (item.asciidoctext.length > 0)) {
								openInCompose (item);
								return;
								}
							originalClick (ev);
							};
						}
					});
				}
			catch (err) {
				console.log ("composebridge: couldn't patch " + itemName + " -- " + err.message);
				}
			}
		if (typeof insideItemIcons !== "undefined") {
			patchClick (insideItemIcons, "pencil", true);
			patchClick (insideItemIcons, "comment", false);
			patchClick (insideItemIcons, "like", false);
			}
		if (typeof timelineItemMenu !== "undefined") {
			patchClick (timelineItemMenu, "edit", true);
			patchClick (timelineItemMenu, "delete", false);
			}

	//let enabled extra feeds through the websocket filter (the shipped function is disabled)
		if (typeof isFeedInExtras !== "undefined") {
			isFeedInExtras = function (feedUrl) {
				return (isKnownExtraFeed (feedUrl) && feedEnabled (feedUrl));
				};
			}

	//filter the timeline: drop foreign items whose feed is toggled off
		const watchForApi = setInterval (function () {
			if ((typeof globals !== "undefined") && (globals.myRssNetwork !== undefined)) {
				clearInterval (watchForApi);
				try {
					const originalGetRecentItems = globals.myRssNetwork.getRecentItems;
					globals.myRssNetwork.getRecentItems = function (ct, callback) {
						originalGetRecentItems (ct, function (err, items) {
							if (!err && Array.isArray (items)) {
								items = items.filter (function (item) {
									return ((item.flExtra === undefined) || feedEnabled (item.feedUrl));
									});
								}
							callback (err, items);
							});
						};
					}
				catch (err) {
					console.log ("composebridge: couldn't wrap getRecentItems -- " + err.message);
					}
				}
			}, 25);

	//wire the Feeds menu checkboxes once the page exists
		document.addEventListener ("DOMContentLoaded", function () {
			function syncIcons () {
				document.querySelectorAll (".extraFeedToggle") .forEach (function (node) {
					const icon = node.querySelector ("i");
					if (icon !== null) {
						icon.className = feedEnabled (node.getAttribute ("data-xmlurl")) ? "far fa-check-square" : "far fa-square";
						}
					});
				}
			syncIcons ();
			document.querySelectorAll (".extraFeedToggle") .forEach (function (node) {
				node.addEventListener ("click", function (ev) {
					ev.preventDefault ();
					ev.stopPropagation ();
					const xmlUrl = node.getAttribute ("data-xmlurl");
					const offMap = getOffMap ();
					if (offMap [xmlUrl]) {
						delete offMap [xmlUrl];
						}
					else {
						offMap [xmlUrl] = true;
						}
					localStorage.extraFeedsOff = JSON.stringify (offMap);
					location.reload (); //rebuild the timeline under the new mix
					});
				});
			});

	})();
