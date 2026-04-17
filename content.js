// Content script: injects CSS to adjust Gemini chat width and code wrapping.
// Syncs with popup via chrome.storage.onChanged (no runtime messaging needed).

const STYLE_WIDTH_ID = 'gemini-wide-style';
const STYLE_WRAP_ID = 'gemini-code-wrap-style';
const DEFAULT_WIDTH = 1200;

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

function widthCSS(width) {
    return `
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
    `;
}

const CODE_WRAP_CSS = `
    pre, code, .code-block, pre > code, .markdown pre {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-word !important;
        overflow-x: hidden !important;
    }
`;

function applyWidth(width) {
    upsertStyle(STYLE_WIDTH_ID, widthCSS(Number(width) || DEFAULT_WIDTH));
}

function applyCodeWrap(isEnabled) {
    upsertStyle(STYLE_WRAP_ID, isEnabled ? CODE_WRAP_CSS : null);
}

// Load initial settings and apply immediately (runs at document_start).
chrome.storage.local.get(['geminiWidth', 'codeAutoWrap'], (result) => {
    applyWidth(result.geminiWidth ?? DEFAULT_WIDTH);
    applyCodeWrap(!!result.codeAutoWrap);
});

// React to changes from the popup without runtime messaging.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.geminiWidth) applyWidth(changes.geminiWidth.newValue);
    if (changes.codeAutoWrap) applyCodeWrap(!!changes.codeAutoWrap.newValue);
});
