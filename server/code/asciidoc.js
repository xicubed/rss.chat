//asciidoc.js -- render AsciiDoc posts to sanitized, feed-safe HTML. //7/18/26 by CC
//
//Pipeline: AsciiDoc -> HTML (Asciidoctor, secure mode) -> inline-styled syntax
//highlighting of code blocks (Shiki) -> sanitized (sanitize-html).
//
//Highlighting uses INLINE styles on purpose: posts are RSS items that travel to
//any feed reader, and inline color styles render everywhere with no external CSS,
//where class-based highlighters (highlight.js, Prism) would come out colorless.
//
//Sanitizing is REQUIRED, not optional: Asciidoctor passthrough (+++...+++) emits
//raw HTML -- including <script> -- even in secure mode, so we scrub the output.

const asciidoctor = require ("@asciidoctor/core"); //CommonJS
const sanitizeHtml = require ("sanitize-html");
//shiki is ESM-only; loaded on first use via dynamic import() -- see getHighlighter

const highlightTheme = "github-light"; //light background, matches the default timeline
const highlightLangs = [
	"js", "ts", "jsx", "tsx", "json", "html", "xml", "css", "scss",
	"bash", "shell", "python", "ruby", "php", "go", "rust", "java",
	"c", "cpp", "csharp", "sql", "yaml", "toml", "markdown", "diff", "dockerfile",
	"clojure", "elixir", "erlang", "kotlin", "swift", "scala", "haskell", "lua", "perl", "r" //7/19/26 by CC -- aliases (clj, sh, ...) resolve automatically
	];

var highlighterPromise = undefined; //built once, lazily, on the first post that needs it
function getHighlighter () {
	if (highlighterPromise === undefined) {
		highlighterPromise = import ("shiki") .then (function (shiki) {
			return (shiki.createHighlighter ({themes: [highlightTheme], langs: highlightLangs}));
			});
		}
	return (highlighterPromise);
	}

function decodeEntities (s) { //Asciidoctor HTML-escapes source; undo it before re-highlighting
	return (s
		.replace (/&lt;/g, "<")
		.replace (/&gt;/g, ">")
		.replace (/&quot;/g, "\"")
		.replace (/&#39;/g, "'")
		.replace (/&amp;/g, "&")
		);
	}

const sanitizeOptions = {
	allowedTags: sanitizeHtml.defaults.allowedTags.concat ([
		"pre", "code", "span", "img", "h1", "h2", "details", "summary",
		"figure", "figcaption", "mark", "col", "colgroup", "caption", "sup", "sub"
		]),
	allowedAttributes: {
		"*": ["class"],
		span: ["style"],
		pre: ["style", "tabindex"],
		code: ["style", "data-lang"],
		a: ["href", "title"],
		img: ["src", "alt", "title"],
		td: ["colspan", "rowspan"],
		th: ["colspan", "rowspan"],
		col: ["style"],
		table: ["style"]
		},
	allowedStyles: {
		"*": {
			"color": [/^#[0-9a-f]{3,8}$/i, /^rgb/i],
			"background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb/i],
			"width": [/^\d+(\.\d+)?(px|%|em)$/]
			}
		},
	allowedSchemes: ["http", "https", "mailto"]
	};

const highlightRe = /<pre class="highlight"><code class="language-([^"]+)"[^>]*>([\s\S]*?)<\/code><\/pre>/g;

function importantizeStyles (html) { //7/19/26 by CC -- the classic theme flattens post HTML with `color: inherit !important`, which beats plain inline styles; an inline style that is itself !important is the one thing that outranks it, so highlighted code keeps its colors in the timeline
	return (html.replace (/style="([^"]*)"/g, function (match, decls) {
		const boosted = decls.split (";")
			.map (function (d) {
				d = d.trim ();
				return ((d.length === 0 || d.indexOf ("!important") !== -1) ? d : d + " !important");
				})
			.filter (function (d) {
				return (d.length > 0);
				})
			.join (";");
		return ("style=\"" + boosted + "\"");
		}));
	}

async function renderAsciidoc (asciidoctext) { //7/18/26 by CC
	let html = asciidoctor.convert (asciidoctext, {safe: "secure"});
	if (html && typeof html.then === "function") { //this Asciidoctor.js build returns a Promise
		html = await html;
		}
	var hl = undefined;
	try {
		hl = await getHighlighter ();
		}
	catch (err) { //if Shiki can't load, still return the (sanitized) unhighlighted HTML
		console.log ("renderAsciidoc: highlighter unavailable, err.message == " + err.message);
		}
	if (hl !== undefined) {
		const loaded = hl.getLoadedLanguages ();
		html = html.replace (highlightRe, function (match, lang, body) {
			if (!loaded.includes (lang)) {
				return (match); //unknown language -> leave as a plain code block
				}
			try {
				return (importantizeStyles (hl.codeToHtml (decodeEntities (body), {lang, theme: highlightTheme})));
				}
			catch (err) {
				return (match);
				}
			});
		}
	return (sanitizeHtml (html, sanitizeOptions));
	}

exports.render = renderAsciidoc;
exports.sanitize = function (html) { //7/19/26 by CC -- the same scrubbing the AsciiDoc pipeline gets, for other HTML that arrives from outside (extra feeds)
	return (sanitizeHtml (html, sanitizeOptions));
	};
