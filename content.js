// Content script: injects per-site CSS to adjust chat width and code wrapping.
//
// Width is driven by a CSS custom property `--ai-chat-width`, registered via
// @property as a <length> so it participates in transitions (without @property,
// CSS variables change instantaneously and transitions don't apply). The style
// tag is injected once; width updates only flip the custom property value via
// setProperty, which lets the browser animate smoothly without re-parsing CSS.

const STYLE_WIDTH_ID = 'ai-chat-width-style';
const STYLE_WRAP_ID = 'ai-chat-wrap-style';
const WIDTH_VAR = '--ai-chat-width';
const DURATION_VAR = '--ai-chat-duration';
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DEFAULT_DURATION_MS = 420;

const SITES = {
    gemini: {
        match: (host) => host.includes('gemini.google.com'),
        storageKey: 'geminiWidth',
        defaultWidth: 1200,
        css: `
            .conversation-container,
            main > div:has(.conversation-container),
            chat-window-content,
            infinite-scroller,
            #chat-history,
            .chat-history-scroll-container {
                max-width: var(${WIDTH_VAR}) !important;
                width: 100% !important;
                margin-left: auto !important;
                margin-right: auto !important;
            }
            .conversation-container user-query,
            user-query {
                max-width: var(${WIDTH_VAR}) !important;
                width: 100% !important;
            }
            [class*="user-query-container"] {
                padding-bottom: 0 !important;
            }
            /* Table fix: break out of wrapper constraints */
            .markdown div:has(table),
            div:has(> table),
            .table-wrapper,
            .table-container,
            .table-content,
            [role="grid"],
            [role="table"],
            .ms-table,
            .markdown > div:has(table),
            .markdown table-container,
            model-response table-container {
                max-width: none !important;
                width: 100% !important;
                min-width: 100% !important;
                overflow-x: visible !important;
                overflow-y: hidden !important;
                display: block !important;
                background: transparent !important;
            }
            table,
            .ms-table table,
            [role="table"] table,
            [role="grid"] table,
            .table-content table,
            model-response table {
                width: 100% !important;
                min-width: 100% !important;
                max-width: none !important;
                table-layout: auto !important;
                border-collapse: collapse !important;
            }
            .markdown,
            .model-response-text,
            model-response > div {
                max-width: 100% !important;
                width: 100% !important;
            }
        `,
    },

    claude: {
        match: (host) => host.includes('claude.ai'),
        storageKey: 'claudeWidth',
        defaultWidth: 1000,
        css: `
            /* Claude layout is constrained by Tailwind's max-w-3xl (768px).
               Widen messages… */
            [data-autoscroll-container="true"] .max-w-3xl {
                max-width: var(${WIDTH_VAR}) !important;
            }
            /* …but keep the composer pinned at its native width. It has w-full
               and lives inside the widened column, so without this it would
               stretch to fill. 48rem matches Tailwind's original max-w-3xl. */
            [data-chat-input-container="true"] {
                max-width: 48rem !important;
                margin-left: auto !important;
                margin-right: auto !important;
            }
            [data-autoscroll-container="true"] .font-claude-response,
            [data-autoscroll-container="true"] .standard-markdown {
                max-width: 100% !important;
                width: 100% !important;
            }
            [data-autoscroll-container="true"] table {
                width: 100% !important;
                max-width: none !important;
                table-layout: auto !important;
            }
        `,
    },

    chatgpt: {
        match: (host) => host.includes('chatgpt.com') || host.includes('chat.openai.com'),
        storageKey: 'chatgptWidth',
        defaultWidth: 1000,
        css: `
            /* ChatGPT drives both column and composer through --thread-content-max-width.
               Scoping to <section> restricts the override to message turns, keeping
               the composer at its native width. We route it through our animated
               var so width changes inherit the smooth transition. */
            main section [class*="--thread-content-max-width"] {
                --thread-content-max-width: var(${WIDTH_VAR}) !important;
            }
            main .markdown {
                max-width: 100% !important;
            }
            main .markdown table {
                width: 100% !important;
                max-width: none !important;
                table-layout: auto !important;
            }
        `,
    },
};

// Code wrap CSS is site-agnostic — selectors target generic Markdown code blocks.
const CODE_WRAP_CSS = `
    pre, code, .code-block, pre > code, .markdown pre, .font-claude-response pre, .prose pre {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-word !important;
        overflow-x: hidden !important;
    }
`;

function detectSite() {
    const host = location.hostname;
    return Object.values(SITES).find(s => s.match(host)) || null;
}

function buildSiteCSS(site) {
    // @property registration lets the custom property animate as a <length>.
    // The transition lives on :root so any descendant resolving var(--ai-chat-width)
    // inherits a smoothly interpolating value — no per-selector transitions needed.
    // Duration is itself a var so popup can flip it to 0ms during slider drag
    // (for instant tracking) and back to the default for preset clicks.
    return `
        @property ${WIDTH_VAR} {
            syntax: '<length>';
            inherits: true;
            initial-value: ${site.defaultWidth}px;
        }
        :root {
            ${WIDTH_VAR}: ${site.defaultWidth}px;
            ${DURATION_VAR}: ${DEFAULT_DURATION_MS}ms;
            transition: ${WIDTH_VAR} var(${DURATION_VAR}) ${EASING};
        }
        ${site.css}
    `;
}

function ensureStyle(id, css) {
    let tag = document.getElementById(id);
    if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
        (document.head || document.documentElement).appendChild(tag);
    }
    if (tag.textContent !== css) tag.textContent = css;
    return tag;
}

function removeStyle(id) {
    const tag = document.getElementById(id);
    if (tag) tag.remove();
}

const site = detectSite();
if (site) {
    ensureStyle(STYLE_WIDTH_ID, buildSiteCSS(site));

    const applyWidth = (width) => {
        const px = `${Number(width) || site.defaultWidth}px`;
        document.documentElement.style.setProperty(WIDTH_VAR, px);
    };
    const applyDuration = (ms) => {
        const n = Number(ms);
        const val = Number.isFinite(n) ? `${Math.max(0, n)}ms` : `${DEFAULT_DURATION_MS}ms`;
        document.documentElement.style.setProperty(DURATION_VAR, val);
    };
    const applyCodeWrap = (isEnabled) => {
        if (isEnabled) ensureStyle(STYLE_WRAP_ID, CODE_WRAP_CSS);
        else removeStyle(STYLE_WRAP_ID);
    };

    chrome.storage.local.get([site.storageKey, 'codeAutoWrap', 'widthAnimMs'], (result) => {
        applyDuration(result.widthAnimMs ?? DEFAULT_DURATION_MS);
        applyWidth(result[site.storageKey] ?? site.defaultWidth);
        applyCodeWrap(!!result.codeAutoWrap);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        // Duration must be applied before width so the CSS transition picks up
        // the new duration for this change.
        if (changes.widthAnimMs) applyDuration(changes.widthAnimMs.newValue);
        if (changes[site.storageKey]) applyWidth(changes[site.storageKey].newValue);
        if (changes.codeAutoWrap) applyCodeWrap(!!changes.codeAutoWrap.newValue);
    });
}
