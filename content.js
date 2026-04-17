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
        // Gemini's CSS doesn't currently target the input composer, so
        // expandInput is accepted for API symmetry but unused.
        css: (width, _expandInput) => `
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
        css: (width, expandInput) => `
            /* Claude layout is constrained by Tailwind's max-w-3xl (768px).
               Override within the scroll (messages) area. */
            [data-autoscroll-container="true"] .max-w-3xl {
                max-width: ${width}px !important;
                transition: max-width 0.25s ease;
            }
            ${expandInput ? `
            /* Widen composer to match message column. */
            [data-chat-input-container="true"],
            [data-chat-input-container="true"] .max-w-3xl {
                max-width: ${width}px !important;
                transition: max-width 0.25s ease;
            }
            ` : ''}
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
        css: (width, expandInput) => `
            /* ChatGPT uses --thread-content-max-width CSS variable for both
               message column and composer. Scoping to <section> targets only
               message turns; dropping the scope also widens the composer. */
            main ${expandInput ? '' : 'section '}[class*="--thread-content-max-width"] {
                --thread-content-max-width: ${width}px !important;
                transition: max-width 0.25s ease;
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
    let currentWidth = site.defaultWidth;
    let currentExpandInput = false;

    const renderWidth = () => {
        upsertStyle(STYLE_WIDTH_ID, site.css(currentWidth, currentExpandInput));
    };
    const applyCodeWrap = (isEnabled) => {
        upsertStyle(STYLE_WRAP_ID, isEnabled ? CODE_WRAP_CSS : null);
    };

    chrome.storage.local.get([site.storageKey, 'codeAutoWrap', 'expandInput'], (result) => {
        currentWidth = Number(result[site.storageKey]) || site.defaultWidth;
        currentExpandInput = !!result.expandInput;
        renderWidth();
        applyCodeWrap(!!result.codeAutoWrap);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        let widthDirty = false;
        if (changes[site.storageKey]) {
            currentWidth = Number(changes[site.storageKey].newValue) || site.defaultWidth;
            widthDirty = true;
        }
        if (changes.expandInput) {
            currentExpandInput = !!changes.expandInput.newValue;
            widthDirty = true;
        }
        if (widthDirty) renderWidth();
        if (changes.codeAutoWrap) applyCodeWrap(!!changes.codeAutoWrap.newValue);
    });
}
