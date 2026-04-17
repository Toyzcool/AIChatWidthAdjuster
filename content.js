// Content script: injects per-site CSS to adjust chat width and code wrapping.
// Site is detected from location.hostname; each site has its own storage key
// and CSS builder. Settings sync via chrome.storage.onChanged.

const STYLE_WIDTH_ID = 'ai-chat-width-style';
const STYLE_WRAP_ID = 'ai-chat-wrap-style';

const SITES = {
    gemini: {
        match: (host) => host.includes('gemini.google.com'),
        storageKey: 'geminiWidth',
        defaultWidth: 1200,
        css: (width) => `
            .conversation-container,
            main > div:has(.conversation-container),
            chat-window-content,
            infinite-scroller,
            #chat-history,
            .chat-history-scroll-container {
                max-width: ${width}px !important;
                width: 100% !important;
                margin-left: auto !important;
                margin-right: auto !important;
                transition: max-width 0.25s ease;
            }
            .conversation-container user-query,
            user-query {
                max-width: ${width}px !important;
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
        css: (width) => `
            /* Claude layout is constrained by Tailwind's max-w-3xl (768px).
               Override within the scroll area and the sticky input container. */
            [data-autoscroll-container="true"] .max-w-3xl,
            [data-chat-input-container="true"],
            [data-chat-input-container="true"] .max-w-3xl {
                max-width: ${width}px !important;
                transition: max-width 0.25s ease;
            }
            /* Ensure inner content fills the widened column. */
            [data-autoscroll-container="true"] .font-claude-response,
            [data-autoscroll-container="true"] .standard-markdown {
                max-width: 100% !important;
                width: 100% !important;
            }
            /* Tables should use all available width. */
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
        css: (width) => `
            /* ChatGPT drives both message column and composer width through the
               CSS variable --thread-content-max-width (default 40rem, 48rem on lg).
               Overriding the variable on every element that defines it widens
               messages and input together. */
            main [class*="--thread-content-max-width"] {
                --thread-content-max-width: ${width}px !important;
                transition: max-width 0.25s ease;
            }
            /* Let markdown body and tables fill the widened column. */
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

function upsertStyle(id, css) {
    let tag = document.getElementById(id);
    if (css == null) {
        if (tag) tag.remove();
        return;
    }
    if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
        (document.head || document.documentElement).appendChild(tag);
    }
    if (tag.textContent !== css) tag.textContent = css;
}

const site = detectSite();
if (site) {
    const applyWidth = (width) => {
        upsertStyle(STYLE_WIDTH_ID, site.css(Number(width) || site.defaultWidth));
    };
    const applyCodeWrap = (isEnabled) => {
        upsertStyle(STYLE_WRAP_ID, isEnabled ? CODE_WRAP_CSS : null);
    };

    chrome.storage.local.get([site.storageKey, 'codeAutoWrap'], (result) => {
        applyWidth(result[site.storageKey] ?? site.defaultWidth);
        applyCodeWrap(!!result.codeAutoWrap);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[site.storageKey]) applyWidth(changes[site.storageKey].newValue);
        if (changes.codeAutoWrap) applyCodeWrap(!!changes.codeAutoWrap.newValue);
    });
}
