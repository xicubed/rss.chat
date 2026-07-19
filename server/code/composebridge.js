//composebridge.js -- 7/19/26 by CC -- served by the rss.chat server and injected
//into the home page it serves. Bridges the shipped client to /compose, the
//AsciiDoc composer: posts that carry AsciiDoc source open there for editing,
//instead of in the regular editor -- editing the source is the only way to edit
//an AsciiDoc post without losing it (the regular editor would replace the body
//with HTML, and the server would clear the stored source).
//
//This runs after globals.js has defined the icon and menu arrays, and before
//startup () builds the UI from them, so patching the arrays here changes what
//gets built. If a name changes upstream, the patch quietly does nothing and the
//client behaves as shipped.

(function () {
	function openInCompose (item) {
		location.href = "/compose?id=" + item.id;
		}
	function patchClick (theArray, itemName) {
		try {
			theArray.forEach (function (theEntry) {
				if (theEntry.name === itemName) {
					const originalClick = theEntry.click;
					theEntry.click = function (ev) {
						if ((ev !== undefined) && (ev.item !== undefined) && (ev.item.asciidoctext !== undefined) && (ev.item.asciidoctext.length > 0)) {
							openInCompose (ev.item);
							}
						else {
							originalClick (ev);
							}
						};
					}
				});
			}
		catch (err) {
			console.log ("composebridge: couldn't patch " + itemName + " -- " + err.message);
			}
		}
	if (typeof insideItemIcons !== "undefined") {
		patchClick (insideItemIcons, "pencil"); //the pencil icon on a timeline post
		}
	if (typeof timelineItemMenu !== "undefined") {
		patchClick (timelineItemMenu, "edit"); //the Edit command on a post's popup menu
		}
	})();
