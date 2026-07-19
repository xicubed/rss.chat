//composebridge.js -- 7/19/26 by CC -- served by the rss.chat server and injected
//into the home page it serves, right after a composeBridgeData script the server
//builds from config (the extra-feed list and the local source label). It bridges
//the shipped client to this server's fork features:
//
//1. AsciiDoc: a "New AsciiDoc" icon in the left rail opens /compose, and posts
//   that carry AsciiDoc source open there for editing -- the regular editor
//   would replace the body with HTML and the server would clear the source.
//
//2. Extra feeds: the server interleaves outside feeds into the timeline. The
//   left rail gets a checkbox per feed -- including one for this server's own
//   posts -- and the bridge filters the timeline and the websocket by them.
//   Actions on foreign posts (reply, like, edit) go to the post's home site.
//
//3. Source labels: every post's header names where it came from, next to the
//   feed icon -- this server's own label for local posts, the feed's name for
//   interleaved ones.
//
//This runs after globals.js has defined the icon and menu arrays, and before
//startup () builds the UI from them. Every patch is defensive: if a name or
//shape changes upstream, that patch quietly does nothing and the client
//behaves as shipped.

(function () {
	const bridgeData = (typeof composeBridgeData !== "undefined") ? composeBridgeData : {extraFeeds: [], localSourceLabel: undefined};
	const localKey = "__local__";

	//toggle state -- which feeds are on, per browser
		function getOffMap () {
			try {
				return (JSON.parse (localStorage.extraFeedsOff || "{}"));
				}
			catch (err) {
				return ({});
				}
			}
		function feedEnabled (theKey) {
			return (!getOffMap () [theKey]);
			}
		function toggleFeed (theKey) {
			const offMap = getOffMap ();
			if (offMap [theKey]) {
				delete offMap [theKey];
				}
			else {
				offMap [theKey] = true;
				}
			localStorage.extraFeedsOff = JSON.stringify (offMap);
			location.reload (); //rebuild the timeline under the new mix
			}
		function isKnownExtraFeed (feedUrl) {
			return (bridgeData.extraFeeds.some (function (theFeed) {
				return (theFeed.xmlUrl === feedUrl);
				}));
			}
		function isLocalItem (item) {
			return (item.flExtra === undefined);
			}

	//the left rail: New AsciiDoc after New post, then a checkbox per feed source
		function checkboxIcon (theKey) {
			return (feedEnabled (theKey) ? "<i class=\"far fa-check-square\"></i>" : "<i class=\"far fa-square\"></i>");
			}
		function makeToggleEntry (theKey, theTitle, theTooltip) {
			return ({
				name: "feedToggle_" + theKey,
				title: theTitle,
				icon: checkboxIcon (theKey),
				tooltip: theTooltip,
				enabled: true,
				click: function () {
					toggleFeed (theKey);
					}
				});
			}
		if (typeof leftColumnIcons !== "undefined") {
			try {
				const composeEntry = {
					name: "newAsciidoc",
					title: "New AsciiDoc",
					icon: "<i class=\"fas fa-pen-nib\"></i>",
					tooltip: "Write a new post in AsciiDoc, with live preview.",
					enabled: true,
					click: function () {
						location.href = "/compose";
						}
					};
				var ixInsert = 1;
				leftColumnIcons.forEach (function (theEntry, ix) {
					if (theEntry.name === "bigPlus") {
						ixInsert = ix + 1;
						}
					});
				leftColumnIcons.splice (ixInsert, 0, composeEntry);
				//replace the view-your-feed icon with the your-posts checkbox (viewing the feed stays on the Menu)
					const localTitle = (bridgeData.localSourceLabel !== undefined) ? bridgeData.localSourceLabel : "Your feed";
					const localEntry = makeToggleEntry (localKey, localTitle, "Show or hide this site's own posts in the timeline.");
					var flReplaced = false;
					leftColumnIcons.forEach (function (theEntry, ix) {
						if (theEntry.name === "feed") {
							leftColumnIcons [ix] = localEntry;
							flReplaced = true;
							}
						});
					if (!flReplaced) {
						leftColumnIcons.push (localEntry);
						}
				//one checkbox per interleaved feed, ahead of any trailing icons (the data icon stays last);
				//feeds sharing a group render under one heading, indented, with their short names
					var ixFeeds = leftColumnIcons.indexOf (localEntry) + 1;
					var currentGroup = undefined;
					bridgeData.extraFeeds.forEach (function (theFeed) {
						if ((theFeed.group !== undefined) && (theFeed.group !== currentGroup)) {
							leftColumnIcons.splice (ixFeeds++, 0, {
								name: "feedGroup_" + theFeed.group,
								title: theFeed.group,
								icon: "",
								enabled: false, //a heading, not a button -- the theme grays it and ignores clicks
								click: function () {
									}
								});
							}
						currentGroup = theFeed.group;
						const theEntry = makeToggleEntry (theFeed.xmlUrl, (theFeed.shortName !== undefined) ? theFeed.shortName : theFeed.name, "Show or hide " + theFeed.name + " in the timeline.");
						if (theFeed.group !== undefined) { //indent under the heading
							theEntry.icon = "<span style=\"padding-left: 14px\">" + theEntry.icon + "</span>";
							}
						leftColumnIcons.splice (ixFeeds++, 0, theEntry);
						});
				}
			catch (err) {
				console.log ("composebridge: couldn't build the icon bar -- " + err.message);
				}
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

	//respect the your-posts checkbox for live items too
		if (typeof socketItemHandler !== "undefined") {
			const originalSocketItemHandler = socketItemHandler;
			socketItemHandler = function (flNew, theFeed, theItem) {
				if (isLocalItem (theItem) && !feedEnabled (localKey)) {
					return;
					}
				originalSocketItemHandler (flNew, theFeed, theItem);
				};
			}

	//filter the timeline by the checkboxes
		const watchForApi = setInterval (function () {
			if ((typeof globals !== "undefined") && (globals.myRssNetwork !== undefined)) {
				clearInterval (watchForApi);
				try {
					const originalGetRecentItems = globals.myRssNetwork.getRecentItems;
					globals.myRssNetwork.getRecentItems = function (ct, callback) {
						originalGetRecentItems (ct, function (err, items) {
							if (!err && Array.isArray (items)) {
								items = items.filter (function (item) {
									if (isLocalItem (item)) {
										return (feedEnabled (localKey));
										}
									return (feedEnabled (item.feedUrl));
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

	//source labels: every post header names where the post came from, next to the feed icon
		function sourceLabelForFeedUrl (feedUrl) {
			for (var i = 0; i < bridgeData.extraFeeds.length; i++) {
				if (bridgeData.extraFeeds [i].xmlUrl === feedUrl) {
					return (bridgeData.extraFeeds [i].name);
					}
				}
			if (feedUrl.indexOf (location.origin) === 0) {
				return (bridgeData.localSourceLabel);
				}
			return (undefined);
			}
		function labelFeedIcons () {
			document.querySelectorAll ("a.aFeedIcon:not(.flSourceLabeled)") .forEach (function (node) {
				node.classList.add ("flSourceLabeled");
				const theLabel = sourceLabelForFeedUrl (node.getAttribute ("href") || "");
				if (theLabel !== undefined) {
					const spanLabel = document.createElement ("span");
					spanLabel.className = "spanFeedSource";
					spanLabel.textContent = theLabel;
					node.insertAdjacentElement ("afterend", spanLabel);
					}
				});
			}
	//the navbar Feeds dropdown mirrors the rail: same keys, same state, same reload
		document.addEventListener ("DOMContentLoaded", function () {
			document.querySelectorAll (".extraFeedToggle") .forEach (function (node) {
				const theKey = node.getAttribute ("data-feedkey");
				const icon = node.querySelector ("i");
				if (icon !== null) {
					icon.className = feedEnabled (theKey) ? "far fa-check-square" : "far fa-square";
					}
				node.addEventListener ("click", function (ev) {
					ev.preventDefault ();
					ev.stopPropagation ();
					toggleFeed (theKey);
					});
				});
			});

		document.addEventListener ("DOMContentLoaded", function () {
			const styleSourceLabels = document.createElement ("style");
			styleSourceLabels.textContent = ".spanFeedSource { font-size: 13px; color: #657786; margin-left: 5px; white-space: nowrap; }\n.divChat .divChatLeft { width: 155px; }"; //a little wider than the theme's 140px so the feed names fit
			document.head.appendChild (styleSourceLabels);
			labelFeedIcons ();
			const theObserver = new MutationObserver (function () {
				labelFeedIcons ();
				});
			theObserver.observe (document.body, {childList: true, subtree: true});
			});

	})();
