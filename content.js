// Content script: injects per-site CSS to adjust chat width and code wrapping.
//
// Width is driven by a CSS custom property `--ai-chat-width`, registered via
// @property as a <length> so it participates in transitions (without @property,
// CSS variables change instantaneously and transitions don't apply). The style
// tag is injected once; width updates only flip the custom property value via
// setProperty, which lets the browser animate smoothly without re-parsing CSS.

const STYLE_WIDTH_ID = 'ai-chat-width-style';
const STYLE_WRAP_ID = 'ai-chat-wrap-style';
const STYLE_PRINT_ID = 'ai-chat-print-style';
const WIDTH_VAR = '--ai-chat-width';
const DURATION_VAR = '--ai-chat-duration';
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DEFAULT_DURATION_MS = 420;

// Print mode works by cloning the site's conversation root into a full-screen
// overlay, then using @media print to hide the original page and show only the
// overlay. This avoids trying to selectively hide every site's chrome — we
// just render a clean copy that has nothing but conversation content.
const PRINT_OVERLAY_ID = 'ai-chat-print-overlay';

// CSS used by the "overlay" print strategy (Claude, Gemini). The cloned
// conversation is placed inside the host document under this ID, and these
// rules govern its on-screen preview + @media print output. ChatGPT uses a
// separate "iframe" strategy because its page stylesheets interfere with
// print rendering even through !important overrides.
const PRINT_OVERLAY_CSS = `
    #${PRINT_OVERLAY_ID} {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        background: #ffffff !important;
        color: #000 !important;
        overflow: auto !important;
        padding: 24px 40px !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
            "Helvetica Neue", "PingFang SC", "Hiragino Sans GB",
            "Microsoft YaHei", sans-serif !important;
        font-size: 14px !important;
        line-height: 1.6 !important;
    }
    #${PRINT_OVERLAY_ID}::before {
        content: "Preparing PDF — the print dialog will open in a moment…";
        display: block;
        padding: 8px 12px;
        margin-bottom: 16px;
        background: #F2F2F7;
        border-radius: 8px;
        font-size: 12px;
        color: #666;
    }
    @media print {
        #${PRINT_OVERLAY_ID}::before { display: none !important; }
        body > *:not(#${PRINT_OVERLAY_ID}) { display: none !important; }
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            color: #000 !important;
            height: auto !important;
            overflow: visible !important;
        }
        #${PRINT_OVERLAY_ID} {
            position: static !important;
            inset: auto !important;
            width: auto !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            font-size: 11pt !important;
        }
        #${PRINT_OVERLAY_ID} pre,
        #${PRINT_OVERLAY_ID} table,
        #${PRINT_OVERLAY_ID} blockquote {
            break-inside: avoid;
            page-break-inside: avoid;
        }
        #${PRINT_OVERLAY_ID} h1, #${PRINT_OVERLAY_ID} h2,
        #${PRINT_OVERLAY_ID} h3, #${PRINT_OVERLAY_ID} h4 {
            break-after: avoid;
            page-break-after: avoid;
        }
        #${PRINT_OVERLAY_ID} pre,
        #${PRINT_OVERLAY_ID} code {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        #${PRINT_OVERLAY_ID} a[href^="http"]::after {
            content: " (" attr(href) ")";
            font-size: 9pt;
            color: #555;
        }
        #${PRINT_OVERLAY_ID} img { max-width: 100% !important; height: auto !important; }
    }
`;

const SITES = {
    gemini: {
        match: (host) => host.includes('gemini.google.com'),
        storageKey: 'geminiWidth',
        defaultWidth: 1200,
        printStrategy: 'overlay',
        getPrintRoot: () =>
            document.querySelector('#chat-history') ||
            document.querySelector('infinite-scroller') ||
            document.querySelector('.chat-history-scroll-container'),
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
        printStrategy: 'overlay',
        getPrintRoot: () => document.querySelector('[data-autoscroll-container="true"]'),
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
        // Build a synthetic root containing only message turns. Cloning the
        // live main/thread container breaks because ChatGPT resolves text
        // color via CSS custom properties set on ancestors; once detached
        // from that chain, prose renders with unresolved variables and can
        // disappear. Rebuilding from scratch avoids any ancestor dependency.
        // ChatGPT uses the iframe strategy — its page stylesheets interfere
        // with the overlay approach even with maximal !important overrides.
        printStrategy: 'iframe',
        getPrintRoot: () => {
            const turns = document.querySelectorAll('[data-message-author-role]');
            if (!turns.length) return null;
            const wrapper = document.createElement('div');
            wrapper.setAttribute('data-ai-chat-print-root', 'chatgpt');
            // Rebuild each turn from scratch — iterate the live DOM and emit
            // new elements that carry only structural tags and text. This
            // severs every possible style inheritance chain when transplanted
            // into the isolated iframe document.
            for (const turn of turns) {
                const clean = sanitizeToPrintable(turn);
                if (!clean) continue;
                const role = turn.getAttribute('data-message-author-role') || '';
                clean.setAttribute('data-role', role);
                wrapper.appendChild(clean);
            }
            return wrapper;
        },
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
    // Print rules are always-injected but dormant outside @media print.
    ensureStyle(STYLE_PRINT_ID, PRINT_OVERLAY_CSS);

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

// --- Conversation export ------------------------------------------------
// Per-site conversation extractor. Returns an array of { role, element } where
// `element` is the root DOM node whose text content should be converted to MD.
// Only Claude is implemented for now; Gemini and ChatGPT extractors can be
// added later without touching the converter.

const EXTRACTORS = {
    claude: () => {
        const container = document.querySelector('[data-autoscroll-container="true"]');
        if (!container) return [];
        // Each message turn is a direct child block. Assistant turns contain
        // .font-claude-response; user turns don't.
        const turns = container.querySelectorAll('.font-claude-response, [data-testid="user-message"]');
        const messages = [];
        for (const el of turns) {
            const role = el.classList.contains('font-claude-response') ? 'Assistant' : 'User';
            messages.push({ role, element: el });
        }
        return messages;
    },

    chatgpt: () => {
        // ChatGPT tags every turn with data-message-author-role. Iterating in
        // document order preserves the conversation order.
        const turns = document.querySelectorAll('[data-message-author-role]');
        const messages = [];
        for (const el of turns) {
            const author = el.getAttribute('data-message-author-role');
            if (author !== 'user' && author !== 'assistant') continue;
            const role = author === 'user' ? 'User' : 'Assistant';
            // Prefer the prose container when present; falls back to the turn
            // wrapper so user messages (which don't have .markdown) still work.
            const content = el.querySelector('.markdown') || el;
            messages.push({ role, element: content });
        }
        return messages;
    },

    gemini: () => {
        // Gemini uses custom elements <user-query> and <model-response>.
        // Selecting both at once and iterating in document order keeps turns
        // interleaved correctly.
        const turns = document.querySelectorAll('user-query, model-response');
        const messages = [];
        for (const el of turns) {
            const tag = el.tagName.toLowerCase();
            const role = tag === 'user-query' ? 'User' : 'Assistant';
            // For assistants, use the rendered markdown block if available to
            // skip chrome like sources/attribution UI. Users usually have their
            // text in a .query-text container.
            const content = role === 'Assistant'
                ? (el.querySelector('.markdown, .model-response-text, message-content') || el)
                : (el.querySelector('.query-text, [class*="query-text"]') || el);
            messages.push({ role, element: content });
        }
        return messages;
    },
};

// --- HTML → Markdown ----------------------------------------------------
// Scoped to the subset of tags Claude (and later Gemini/ChatGPT) emit:
// headings, paragraphs, lists, blockquotes, code (inline + block), tables,
// links, emphasis, images, horizontal rules.

function htmlToMarkdown(root) {
    const out = [];
    const ctx = { listStack: [], inPre: false };
    walk(root, out, ctx);
    return out.join('')
        // Collapse lines that only contain whitespace (HTML formatting text
        // nodes between block elements create these).
        .replace(/\n[ \t]+\n/g, '\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function pushText(out, text, ctx) {
    if (ctx.inPre) { out.push(text); return; }
    let s = text.replace(/\s+/g, ' ');
    // Drop leading whitespace whenever the previous chunk already ends in
    // whitespace — covers both block boundaries (\n) and post-marker states
    // like '- ', '> ', '**', so we don't end up with '-  **bold**'.
    const last = out[out.length - 1];
    if (!last || /\s$/.test(last)) s = s.replace(/^\s+/, '');
    if (s) out.push(s);
}

function walk(node, out, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
        pushText(out, node.textContent, ctx);
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    // Skip UI chrome embedded in the response DOM (thinking expander,
    // copy/retry buttons, etc.). Their labels otherwise end up in the output.
    if (shouldSkipElement(node)) return;

    // KaTeX / MathJax rendered math. Extract the original LaTeX from the
    // <annotation> element (KaTeX puts it in .katex-mathml) and emit it as a
    // $...$ span; without this the visible formula is missed because the
    // .katex-html rendering is aria-hidden and gets skipped.
    const mathOut = tryExtractMath(node);
    if (mathOut !== null) {
        out.push(mathOut);
        return;
    }

    const tag = node.tagName.toLowerCase();
    switch (tag) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
            out.push('\n\n' + '#'.repeat(Number(tag[1])) + ' ');
            walkChildren(node, out, ctx);
            out.push('\n\n');
            return;
        }
        case 'p': {
            walkChildren(node, out, ctx);
            out.push('\n\n');
            return;
        }
        case 'strong': case 'b':
            out.push('**'); walkChildren(node, out, ctx); out.push('**'); return;
        case 'em': case 'i':
            out.push('*'); walkChildren(node, out, ctx); out.push('*'); return;
        case 'del': case 's': case 'strike':
            out.push('~~'); walkChildren(node, out, ctx); out.push('~~'); return;
        case 'code': {
            if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
                // handled by <pre>
                walkChildren(node, out, { ...ctx, inPre: true });
            } else {
                out.push('`'); out.push(node.textContent); out.push('`');
            }
            return;
        }
        case 'pre': {
            const codeEl = node.querySelector('code');
            const lang = extractLang(codeEl || node);
            const text = (codeEl ? codeEl.textContent : node.textContent).replace(/\n+$/, '');
            out.push('\n\n```' + lang + '\n' + text + '\n```\n\n');
            return;
        }
        case 'a': {
            const href = node.getAttribute('href') || '';
            out.push('[');
            walkChildren(node, out, ctx);
            out.push(`](${href})`);
            return;
        }
        case 'ul':
            ctx.listStack.push({ type: 'ul' });
            walkChildren(node, out, ctx);
            ctx.listStack.pop();
            out.push('\n');
            return;
        case 'ol':
            ctx.listStack.push({ type: 'ol', index: 1 });
            walkChildren(node, out, ctx);
            ctx.listStack.pop();
            out.push('\n');
            return;
        case 'li': {
            const stack = ctx.listStack;
            const depth = Math.max(0, stack.length - 1);
            const current = stack[stack.length - 1];
            const indent = '  '.repeat(depth);
            const marker = current && current.type === 'ol' ? `${current.index++}.` : '-';
            out.push('\n' + indent + marker + ' ');
            walkChildren(node, out, ctx);
            return;
        }
        case 'blockquote':
            out.push('\n> ');
            walkChildren(node, out, ctx);
            out.push('\n\n');
            return;
        case 'br':
            out.push('  \n');
            return;
        case 'hr':
            out.push('\n\n---\n\n');
            return;
        case 'table':
            out.push('\n\n' + tableToMd(node) + '\n\n');
            return;
        case 'img': {
            const alt = node.getAttribute('alt') || '';
            const src = node.getAttribute('src') || '';
            out.push(`![${alt}](${src})`);
            return;
        }
        case 'script': case 'style': case 'noscript':
            return;
        default:
            walkChildren(node, out, ctx);
    }
}

function walkChildren(node, out, ctx) {
    for (const child of node.childNodes) walk(child, out, ctx);
}

function tryExtractMath(el) {
    const tag = el.tagName.toLowerCase();
    const classes = typeof el.className === 'string' ? el.className : '';
    const hasDataMath = el.hasAttribute && el.hasAttribute('data-math');
    const isKatex = /(^|\s)katex(\s|$)/.test(classes);
    const isMathML = tag === 'math';
    const isMathJax = /MathJax/.test(classes);
    const isMathBlock = /(^|\s)math-block(\s|$)/.test(classes);
    if (!hasDataMath && !isKatex && !isMathML && !isMathJax && !isMathBlock) return null;

    // Only act at the outermost math wrapper to avoid emitting the formula
    // twice when walk recurses into nested .katex-display > .katex etc.
    if (el.parentElement && el.parentElement.closest('[data-math], .math-block, .katex, .MathJax, math')) {
        return ''; // suppress children; outer call already handled it
    }

    // Preferred sources, in order:
    //   1. data-math attribute on self (Gemini's div.math-block)
    //   2. data-math attribute on a descendant (rare)
    //   3. <annotation> element (standard KaTeX/MathJax with MathML)
    let tex = '';
    if (hasDataMath) tex = (el.getAttribute('data-math') || '').trim();
    if (!tex) {
        const inner = el.querySelector('[data-math]');
        if (inner) tex = (inner.getAttribute('data-math') || '').trim();
    }
    if (!tex) {
        const annotation = el.querySelector('annotation[encoding="application/x-tex"], annotation');
        if (annotation) tex = annotation.textContent.trim();
    }
    if (!tex) return '';

    const isDisplay = isMathBlock
        || classes.includes('katex-display')
        || !!(el.closest && el.closest('.katex-display, .MathJax_Display, .math-block'))
        || !!el.querySelector('.katex-display, .MathJax_Display');
    return isDisplay ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;
}

function shouldSkipElement(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return true;
    const role = el.getAttribute('role');
    if (role === 'button') return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    // Common Claude thinking-expander patterns: a collapsible with label.
    const testid = el.getAttribute('data-testid') || '';
    if (/thinking|expandable|tool-?use/i.test(testid)) return true;
    return false;
}

function extractLang(el) {
    if (!el) return '';
    const classes = (el.getAttribute('class') || '') + ' ' + (el.className || '');
    const m = classes.match(/(?:language|lang|hljs-)-?([A-Za-z0-9+#-]+)/);
    return m ? m[1] : '';
}

function tableToMd(table) {
    const rows = [...table.querySelectorAll('tr')];
    if (!rows.length) return '';
    const lines = [];
    rows.forEach((row, i) => {
        const cells = [...row.querySelectorAll('th, td')].map(c =>
            c.textContent.trim().replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')
        );
        lines.push('| ' + cells.join(' | ') + ' |');
        if (i === 0) lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
    });
    return lines.join('\n');
}

// --- Export orchestration ----------------------------------------------

function extractorKeyForSite(s) {
    if (!s) return null;
    if (s.storageKey === 'claudeWidth') return 'claude';
    if (s.storageKey === 'geminiWidth') return 'gemini';
    if (s.storageKey === 'chatgptWidth') return 'chatgpt';
    return null;
}

function buildConversationMarkdown() {
    const key = extractorKeyForSite(site);
    const extractor = key && EXTRACTORS[key];
    if (!extractor) return null;
    const messages = extractor();
    if (!messages.length) return null;
    const parts = [];
    for (const { role, element } of messages) {
        const body = htmlToMarkdown(element);
        if (!body) continue;
        parts.push(`## ${role}\n\n${body}`);
    }
    return parts.join('\n\n') + '\n';
}

function triggerDownload(filename, text) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'export-markdown') {
        try {
            const key = extractorKeyForSite(site);
            if (!key) { sendResponse({ ok: false, reason: 'unsupported-site' }); return; }
            const md = buildConversationMarkdown();
            if (!md) { sendResponse({ ok: false, reason: 'no-conversation' }); return; }
            triggerDownload(`${key}-${timestamp()}.md`, md);
            sendResponse({ ok: true, bytes: md.length });
        } catch (e) {
            sendResponse({ ok: false, reason: 'error', message: String(e) });
        }
        return true;
    }

    if (msg?.type === 'export-pdf') {
        try {
            const root = site.getPrintRoot && site.getPrintRoot();
            if (!root) {
                sendResponse({ ok: false, reason: 'no-conversation' });
                return true;
            }
            mountPrintOverlay(root, site.printStrategy || 'overlay');
            sendResponse({ ok: true });
            // The chosen strategy (overlay or iframe) owns its own print
            // timing and cleanup.
        } catch (e) {
            console.error('[AI Chat Width] PDF export failed:', e);
            unmountPrintOverlay();
            sendResponse({ ok: false, reason: 'error', message: String(e && e.message || e) });
        }
        return true;
    }
});

// Rebuild a printable DOM tree by walking the source and emitting only
// structural tags/text. This is much more aggressive than strip-classes:
// the output element NEVER carries any class or style attribute and lives
// in its own fresh DOM, so no page CSS (Tailwind prose, oklch palettes,
// -webkit-text-fill-color gradients, CSS custom-property theming) can
// follow it into the print overlay.
//
// Preserves: block/flow tags, lists, tables, code, inline emphasis,
// links (href), images (src/alt). Everything else becomes a plain <div>.
const PRINTABLE_TAGS = new Set([
    'DIV', 'P', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'UL', 'OL', 'LI', 'BLOCKQUOTE',
    'CODE', 'PRE', 'KBD', 'SAMP',
    'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION',
    'STRONG', 'B', 'EM', 'I', 'U', 'DEL', 'S', 'MARK', 'SUB', 'SUP',
    'BR', 'HR', 'A', 'SPAN', 'IMG',
    // KaTeX-rendered math (MathML + SVG visuals):
    'MATH', 'SEMANTICS', 'MROW', 'MI', 'MN', 'MO', 'MFRAC', 'MSUP',
    'MSUB', 'MSQRT', 'MTEXT', 'ANNOTATION',
    'SVG', 'G', 'PATH', 'LINE', 'RECT', 'CIRCLE', 'TEXT', 'TSPAN',
]);

function sanitizeToPrintable(src) {
    if (!src) return null;
    if (src.nodeType === 3) { // text node
        const text = src.nodeValue;
        return text ? document.createTextNode(text) : null;
    }
    if (src.nodeType !== 1) return null;
    const tag = src.tagName;
    // Skip elements that are decorative chrome.
    if (tag === 'BUTTON' || src.getAttribute('role') === 'button') return null;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return null;

    const outTag = PRINTABLE_TAGS.has(tag) ? tag.toLowerCase() : 'div';
    const out = document.createElement(outTag);

    // Preserve a small set of meaningful attributes only.
    if (tag === 'A') {
        const href = src.getAttribute('href');
        if (href) out.setAttribute('href', href);
    } else if (tag === 'IMG') {
        const s = src.getAttribute('src');
        const a = src.getAttribute('alt');
        if (s) out.setAttribute('src', s);
        if (a) out.setAttribute('alt', a);
    } else if (tag === 'TD' || tag === 'TH') {
        const cs = src.getAttribute('colspan');
        const rs = src.getAttribute('rowspan');
        if (cs) out.setAttribute('colspan', cs);
        if (rs) out.setAttribute('rowspan', rs);
    }

    for (const child of src.childNodes) {
        const clean = sanitizeToPrintable(child);
        if (clean) out.appendChild(clean);
    }
    // Drop wrapper elements that ended up empty (e.g. icon-only buttons).
    if (!out.childNodes.length && outTag !== 'br' && outTag !== 'hr' && outTag !== 'img') {
        return null;
    }
    return out;
}

// Dispatch to the strategy the active site picked:
//   - 'overlay': clone into host document under #print-overlay, use @media
//                print to hide siblings. Works when the host's stylesheets
//                don't fight the print output (Claude, Gemini).
//   - 'iframe':  write content into a fresh iframe document, print from the
//                iframe's own window. Required when host CSS interferes with
//                printing overlay descendants (ChatGPT).
function mountPrintOverlay(root, strategy) {
    unmountPrintOverlay();
    if (strategy === 'iframe') mountPrintIframe(root);
    else mountPrintInlineOverlay(root);
}

function mountPrintInlineOverlay(root) {
    const overlay = document.createElement('div');
    overlay.id = PRINT_OVERLAY_ID;
    // Clone the rendered conversation subtree — this preserves KaTeX, tables,
    // code highlighting, and images exactly as they look on screen.
    overlay.appendChild(root.cloneNode(true));
    document.body.appendChild(overlay);

    const cleanup = () => {
        window.removeEventListener('afterprint', cleanup);
        unmountPrintOverlay();
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);

    setTimeout(() => window.print(), 50);
}

// Render the printable content in a fresh iframe document. Used for sites
// whose stylesheets break the simpler overlay strategy.
function mountPrintIframe(root) {
    const iframe = document.createElement('iframe');
    iframe.id = PRINT_OVERLAY_ID;
    // Fullscreen fixed so user can see the preview before print dialog takes over.
    iframe.style.cssText = [
        'position: fixed',
        'inset: 0',
        'width: 100%',
        'height: 100%',
        'border: 0',
        'z-index: 2147483647',
        'background: #ffffff',
    ].join(';');
    document.body.appendChild(iframe);

    const cloned = root.cloneNode(true);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Conversation</title></head><body></body></html>');
    doc.close();

    // Style inside the iframe document. Because there's no host CSS here,
    // these rules are the ONLY things shaping the printed page.
    const style = doc.createElement('style');
    style.textContent = `
        html, body { margin: 0; padding: 0; background: #fff; color: #000; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
                "Helvetica Neue", "PingFang SC", "Hiragino Sans GB",
                "Microsoft YaHei", sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            padding: 16pt 24pt;
        }
        h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
        pre, table, blockquote, figure {
            break-inside: avoid;
            page-break-inside: avoid;
        }
        pre, code { white-space: pre-wrap; word-wrap: break-word; font-family: SFMono-Regular, Menlo, Consolas, monospace; }
        pre { background: #f6f6f6; padding: 8pt; border-radius: 4pt; }
        code { background: #f1f1f1; padding: 0 3pt; border-radius: 2pt; }
        blockquote {
            border-left: 3pt solid #ddd;
            margin: 8pt 0;
            padding: 4pt 12pt;
            color: #333;
        }
        table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
        th, td { border: 1pt solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
        th { background: #f5f5f5; font-weight: 600; }
        ul, ol { padding-left: 24pt; }
        a { color: #1155cc; text-decoration: underline; }
        a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; color: #666; }
        img { max-width: 100%; height: auto; }
        hr { border: none; border-top: 1pt solid #ddd; margin: 12pt 0; }
        [data-role="user"] { font-weight: 500; margin-top: 18pt; padding-bottom: 6pt; border-bottom: 0.5pt solid #eee; }
        [data-role="assistant"] { margin-top: 12pt; }
        @media print {
            body { padding: 0; }
        }
    `;
    doc.head.appendChild(style);
    doc.body.appendChild(cloned);

    // Trigger print from within the iframe, not the top window, so the print
    // target is the iframe document alone.
    const cleanup = () => {
        iframe.contentWindow && iframe.contentWindow.removeEventListener('afterprint', cleanup);
        unmountPrintOverlay();
    };
    iframe.contentWindow.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);

    // Give the iframe a beat to lay out before printing.
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 1500);
}

function unmountPrintOverlay() {
    const existing = document.getElementById(PRINT_OVERLAY_ID);
    if (existing) existing.remove();
}

// --- Bookmarks panel -----------------------------------------------------
// Right-side collapsible panel that lists bookmarks for the active
// conversation. Stage 1 scope: UI shell only (frame + collapse/expand,
// persisted state). Storage, context menu, and message anchoring land in
// subsequent commits.
//
// Scoped to ChatGPT for the MVP — Claude and Gemini will be added once the
// ChatGPT flow is proven.

const BOOKMARKS_PANEL_ID = 'ai-toolbox-bookmarks-panel';
const BOOKMARKS_STATE_KEY = 'bookmarksPanelCollapsed';
const BOOKMARKS_SUPPORTED_SITES = new Set(['chatgptWidth']);
const BOOKMARKS_STORAGE_PREFIX = 'bookmarks:';

function bookmarksSupportedForCurrentSite() {
    return !!site && BOOKMARKS_SUPPORTED_SITES.has(site.storageKey);
}

// Extract the conversation identifier the active site exposes in the URL.
// ChatGPT uses /c/{uuid}; a brand-new conversation without an id yet returns
// null, which the panel treats as "no bookmarks storage available yet".
function getConversationId() {
    if (!site) return null;
    if (site.storageKey === 'chatgptWidth') {
        const m = location.pathname.match(/^\/c\/([0-9a-f-]+)/i);
        return m ? m[1] : null;
    }
    return null;
}

function bookmarksStorageKey(convId) {
    return `${BOOKMARKS_STORAGE_PREFIX}${convId}`;
}

function loadBookmarks(convId, cb) {
    if (!convId) { cb([]); return; }
    const key = bookmarksStorageKey(convId);
    chrome.storage.local.get(key, (r) => cb(Array.isArray(r[key]) ? r[key] : []));
}

function saveBookmarks(convId, list) {
    if (!convId) return;
    chrome.storage.local.set({ [bookmarksStorageKey(convId)]: list });
}

// SPA route watcher — content scripts run in an isolated world, so patching
// history.pushState here does NOT observe the page's own navigation. The
// reliable cross-world signal is simply the URL itself, so we poll. popstate
// covers back/forward immediately; the 500ms poll catches pushState/
// replaceState within half a second of the page performing them.
function onUrlChange(cb) {
    let last = location.href;
    const fire = () => {
        if (location.href === last) return;
        last = location.href;
        cb();
    };
    window.addEventListener('popstate', fire);
    setInterval(fire, 500);
}

function mountBookmarksPanel() {
    if (!bookmarksSupportedForCurrentSite()) return;
    if (document.getElementById(BOOKMARKS_PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = BOOKMARKS_PANEL_ID;
    panel.setAttribute('data-collapsed', 'true');
    panel.innerHTML = `
        <button class="aitb-bm-toggle" type="button" aria-label="Toggle bookmarks">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
        </button>
        <div class="aitb-bm-body">
            <div class="aitb-bm-header">
                <span class="aitb-bm-title">Bookmarks</span>
                <button class="aitb-bm-collapse" type="button" aria-label="Collapse">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 18l6-6-6-6"/>
                    </svg>
                </button>
            </div>
            <div class="aitb-bm-list">
                <div class="aitb-bm-empty">No bookmarks yet. Select text or right-click a message to add one.</div>
            </div>
        </div>
    `;

    ensureStyle('ai-toolbox-bookmarks-style', BOOKMARKS_CSS);
    document.body.appendChild(panel);

    const toggle = () => setPanelCollapsed(!isPanelCollapsed());
    panel.querySelector('.aitb-bm-toggle').addEventListener('click', toggle);
    panel.querySelector('.aitb-bm-collapse').addEventListener('click', toggle);

    chrome.storage.local.get(BOOKMARKS_STATE_KEY, (r) => {
        setPanelCollapsed(r[BOOKMARKS_STATE_KEY] !== false);
    });

    refreshBookmarkList();
    onUrlChange(refreshBookmarkList);

    // Storage-level updates from another tab or future in-page writes should
    // re-render immediately so bookmarks stay in sync without a manual reload.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const convId = getConversationId();
        if (convId && changes[bookmarksStorageKey(convId)]) refreshBookmarkList();
    });

    attachBookmarkContextMenu();
}

// Wire a capture-phase contextmenu listener so we can pre-empt the page's
// own handlers when the click lands inside a message. Falls through to the
// native menu in every other case.
function attachBookmarkContextMenu() {
    document.addEventListener('contextmenu', (e) => {
        const msgEl = findMessageElement(e.target);
        if (!msgEl) return;
        const sel = window.getSelection();
        const selectedText = sel ? sel.toString().trim() : '';

        // If the click didn't land inside the selection, treat it as a
        // whole-message right-click even when text is selected elsewhere.
        let inSelection = false;
        if (selectedText && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            inSelection = range.intersectsNode(e.target) || msgEl.contains(range.commonAncestorContainer);
        }

        e.preventDefault();
        if (selectedText && inSelection) {
            openBookmarkMenu(e.clientX, e.clientY, {
                kind: 'selection', el: msgEl, text: selectedText,
            });
        } else {
            openBookmarkMenu(e.clientX, e.clientY, { kind: 'message', el: msgEl });
        }
    }, true);

    // Any left click dismisses an open menu.
    document.addEventListener('click', (e) => {
        const menu = document.getElementById(BOOKMARK_MENU_ID);
        if (menu && !menu.contains(e.target)) closeBookmarkMenu();
    }, true);
    document.addEventListener('scroll', closeBookmarkMenu, true);
}

const BOOKMARK_MENU_ID = 'ai-toolbox-bookmark-menu';

// Find the nearest ChatGPT message container. data-message-id is on the
// element that wraps a single turn; data-message-author-role lives on the
// same node and tells us user vs assistant.
function findMessageElement(node) {
    if (!(node instanceof Element)) return null;
    return node.closest('[data-message-id]');
}

function openBookmarkMenu(x, y, ctx) {
    closeBookmarkMenu();
    const menu = document.createElement('div');
    menu.id = BOOKMARK_MENU_ID;
    const label = ctx.kind === 'selection' ? 'Bookmark selected text' : 'Bookmark this message';
    menu.innerHTML = `
        <button type="button" data-action="add">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            <span>${label}</span>
        </button>
    `;
    menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 60)}px`;
    document.body.appendChild(menu);

    menu.querySelector('[data-action="add"]').addEventListener('click', async () => {
        closeBookmarkMenu();
        if (ctx.kind === 'selection') await addSelectionBookmark(ctx.el, ctx.text);
        else await addMessageBookmark(ctx.el);
    });
}

function closeBookmarkMenu() {
    const menu = document.getElementById(BOOKMARK_MENU_ID);
    if (menu) menu.remove();
}

async function addMessageBookmark(msgEl) {
    const convId = getConversationId();
    if (!convId) return;
    const messageId = msgEl.getAttribute('data-message-id');
    const role = msgEl.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
    const text = (msgEl.innerText || msgEl.textContent || '').trim().replace(/\s+/g, ' ');
    const snippet = text.length > 200 ? text.slice(0, 200) + '…' : text;

    // Optional note — prompt() is deliberate for the MVP; a proper inline
    // editor lands in stage 5 along with delete/edit affordances.
    const note = window.prompt('Optional note for this bookmark:', '') || '';

    const bookmark = {
        id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        messageId,
        role,
        snippet,
        note: note.trim(),
    };

    loadBookmarks(convId, (existing) => {
        saveBookmarks(convId, [...existing, bookmark]);
    });

    setPanelCollapsed(false);
}

async function addSelectionBookmark(msgEl, selectionText) {
    const convId = getConversationId();
    if (!convId) return;
    const messageId = msgEl.getAttribute('data-message-id');
    const role = msgEl.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
    const note = window.prompt('Optional note for this selection:', '') || '';
    const trimmed = selectionText.replace(/\s+/g, ' ').trim();

    const bookmark = {
        id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        messageId,
        role,
        snippet: trimmed.length > 200 ? trimmed.slice(0, 200) + '…' : trimmed,
        note: note.trim(),
        selection: { text: trimmed },
    };

    loadBookmarks(convId, (existing) => {
        saveBookmarks(convId, [...existing, bookmark]);
    });

    setPanelCollapsed(false);
}

// Locate a message node in the DOM. ChatGPT sometimes re-renders messages
// (regenerate response, edit), so a saved data-message-id may not currently
// be mounted. Return null in that case — caller decides how to handle.
function findMessageById(messageId) {
    if (!messageId) return null;
    return document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
}

// Scroll the message into view, then (if the bookmark captured a selection)
// walk the text nodes inside the message to find that substring and visually
// highlight the matching range for ~2s.
function scrollToBookmark(bm) {
    const msgEl = findMessageById(bm.messageId);
    if (!msgEl) {
        // Message currently unmounted (virtualization) or removed. Best
        // effort: do nothing. A future stage could trigger site-specific
        // lazy-load before giving up.
        return;
    }
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const targetText = bm.selection?.text;
    const wanted = targetText ? targetText.toLowerCase() : '';
    if (!wanted) {
        flashHighlight(msgEl);
        return;
    }

    // Build the concatenated innerText and a mapping back to the underlying
    // text nodes so we can construct a Range once we find the substring.
    const walker = document.createTreeWalker(msgEl, NodeFilter.SHOW_TEXT);
    const segments = [];
    let joined = '';
    let node;
    while ((node = walker.nextNode())) {
        const text = node.nodeValue;
        if (!text) continue;
        segments.push({ node, start: joined.length, end: joined.length + text.length });
        joined += text;
    }
    const idx = joined.toLowerCase().indexOf(wanted);
    if (idx === -1) {
        flashHighlight(msgEl);
        return;
    }

    const range = document.createRange();
    const startSeg = segments.find(s => idx >= s.start && idx < s.end);
    const endSeg = segments.find(s => (idx + wanted.length) > s.start && (idx + wanted.length) <= s.end);
    if (!startSeg || !endSeg) {
        flashHighlight(msgEl);
        return;
    }
    range.setStart(startSeg.node, idx - startSeg.start);
    range.setEnd(endSeg.node, (idx + wanted.length) - endSeg.start);

    flashHighlightRange(range);
}

// Full-message flash — used when no selection was captured or re-location
// failed. A CSS class cycles in and fades, avoiding any DOM mutation.
function flashHighlight(el) {
    el.classList.add('aitb-bm-flash');
    setTimeout(() => el.classList.remove('aitb-bm-flash'), 1800);
}

// Range flash — wrap the matched range with a <mark> that has our highlight
// styling, then unwrap after the animation. We keep the wrap tiny and remove
// it cleanly to avoid polluting the host DOM with residual nodes.
function flashHighlightRange(range) {
    const mark = document.createElement('mark');
    mark.className = 'aitb-bm-mark';
    try {
        range.surroundContents(mark);
    } catch {
        // Range spans element boundaries — fall back to flashing the closest
        // block container so we still give visual feedback.
        const fallback = range.commonAncestorContainer.nodeType === 1
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentElement;
        if (fallback) flashHighlight(fallback);
        return;
    }
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
    }, 1800);
}

function refreshBookmarkList() {
    const panel = document.getElementById(BOOKMARKS_PANEL_ID);
    if (!panel) return;
    const list = panel.querySelector('.aitb-bm-list');
    if (!list) return;

    const convId = getConversationId();
    if (!convId) {
        list.innerHTML = `
            <div class="aitb-bm-empty">
                Start or open a conversation to begin bookmarking.
            </div>`;
        return;
    }

    loadBookmarks(convId, (bookmarks) => {
        if (!bookmarks.length) {
            list.innerHTML = `
                <div class="aitb-bm-empty">
                    No bookmarks yet. Select text or right-click a message to add one.
                </div>`;
            return;
        }
        list.innerHTML = bookmarks.map(renderBookmarkItem).join('');
        // Click-to-jump wiring — event delegation keeps handler lifetime tied
        // to the list container, so innerHTML rewrites don't leak listeners.
        list.querySelectorAll('.aitb-bm-item').forEach((item) => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                const bm = bookmarks.find(b => b.id === id);
                if (bm) scrollToBookmark(bm);
            });
        });
    });
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function renderBookmarkItem(bm) {
    const body = bm.selection?.text || bm.snippet || '';
    const note = bm.note ? `<div class="aitb-bm-note">${escapeHtml(bm.note)}</div>` : '';
    const roleLabel = bm.role === 'assistant' ? 'Assistant' : 'User';
    return `
        <div class="aitb-bm-item" data-id="${escapeHtml(bm.id)}">
            <div class="aitb-bm-item-role" data-role="${escapeHtml(bm.role)}">${roleLabel}</div>
            <div class="aitb-bm-item-body">${escapeHtml(body)}</div>
            ${note}
        </div>
    `;
}

function isPanelCollapsed() {
    const panel = document.getElementById(BOOKMARKS_PANEL_ID);
    return !panel || panel.getAttribute('data-collapsed') === 'true';
}

function setPanelCollapsed(collapsed) {
    const panel = document.getElementById(BOOKMARKS_PANEL_ID);
    if (!panel) return;
    panel.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
    chrome.storage.local.set({ [BOOKMARKS_STATE_KEY]: collapsed });
}

// Panel CSS is scoped under the fixed ID — we don't leak styles to the host
// page. Color values follow Apple-ish semantic tokens similar to popup.html.
const BOOKMARKS_CSS = `
    #${BOOKMARKS_PANEL_ID} {
        position: fixed;
        top: 0;
        right: 0;
        height: 100vh;
        z-index: 2147483646;
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
            "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", sans-serif;
        font-size: 13px;
        pointer-events: none;
    }
    #${BOOKMARKS_PANEL_ID} > * { pointer-events: auto; }

    #${BOOKMARKS_PANEL_ID} .aitb-bm-toggle {
        position: absolute;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        width: 32px;
        height: 56px;
        border: none;
        border-radius: 10px 0 0 10px;
        background: rgba(255, 255, 255, 0.92);
        color: #1d1d1f;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease, background 0.2s ease, opacity 0.2s ease;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
    }
    #${BOOKMARKS_PANEL_ID} .aitb-bm-toggle:hover { transform: translateY(-50%) translateX(-2px); }
    #${BOOKMARKS_PANEL_ID}[data-collapsed="false"] .aitb-bm-toggle { opacity: 0; pointer-events: none; }

    #${BOOKMARKS_PANEL_ID} .aitb-bm-body {
        position: absolute;
        top: 0;
        right: 0;
        width: 320px;
        height: 100vh;
        background: rgba(255, 255, 255, 0.96);
        border-left: 0.5px solid rgba(0, 0, 0, 0.1);
        box-shadow: -8px 0 30px rgba(0, 0, 0, 0.08);
        display: flex;
        flex-direction: column;
        transform: translateX(100%);
        transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
    }
    #${BOOKMARKS_PANEL_ID}[data-collapsed="false"] .aitb-bm-body { transform: translateX(0); }

    #${BOOKMARKS_PANEL_ID} .aitb-bm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 14px 10px;
        border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
    }
    #${BOOKMARKS_PANEL_ID} .aitb-bm-title {
        font-size: 14px;
        font-weight: 600;
        color: #1d1d1f;
        letter-spacing: -0.01em;
    }
    #${BOOKMARKS_PANEL_ID} .aitb-bm-collapse {
        background: transparent;
        border: none;
        color: rgba(60, 60, 67, 0.6);
        padding: 4px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        transition: background 0.15s ease;
    }
    #${BOOKMARKS_PANEL_ID} .aitb-bm-collapse:hover {
        background: rgba(0, 0, 0, 0.05);
    }

    #${BOOKMARKS_PANEL_ID} .aitb-bm-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
    }
    #${BOOKMARKS_PANEL_ID} .aitb-bm-empty {
        padding: 32px 16px;
        text-align: center;
        color: rgba(60, 60, 67, 0.55);
        font-size: 12px;
        line-height: 1.5;
    }

    #${BOOKMARKS_PANEL_ID} .aitb-bm-item {
        padding: 10px 12px;
        margin-bottom: 6px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.03);
        cursor: pointer;
        transition: background 0.12s ease;
    }
    #${BOOKMARKS_PANEL_ID} .aitb-bm-item:hover { background: rgba(0, 0, 0, 0.06); }

    #${BOOKMARKS_PANEL_ID} .aitb-bm-item-role {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: rgba(60, 60, 67, 0.55);
        margin-bottom: 4px;
    }
    #${BOOKMARKS_PANEL_ID} .aitb-bm-item-role[data-role="assistant"] { color: #AF52DE; }
    #${BOOKMARKS_PANEL_ID} .aitb-bm-item-role[data-role="user"] { color: #007AFF; }

    #${BOOKMARKS_PANEL_ID} .aitb-bm-item-body {
        font-size: 12.5px;
        line-height: 1.45;
        color: #1d1d1f;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    #${BOOKMARKS_PANEL_ID} .aitb-bm-note {
        margin-top: 6px;
        padding: 4px 8px;
        font-size: 11.5px;
        color: rgba(60, 60, 67, 0.7);
        background: rgba(0, 122, 255, 0.08);
        border-radius: 6px;
        border-left: 2px solid rgba(0, 122, 255, 0.4);
    }

    .aitb-bm-flash {
        animation: aitb-bm-flash-anim 1.6s ease-out;
    }
    @keyframes aitb-bm-flash-anim {
        0%   { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0); }
        15%  { box-shadow: 0 0 0 6px rgba(0, 122, 255, 0.35); }
        100% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0); }
    }
    mark.aitb-bm-mark {
        background: linear-gradient(180deg, rgba(255, 214, 10, 0.7), rgba(255, 159, 10, 0.6));
        color: inherit;
        padding: 0 2px;
        border-radius: 3px;
        animation: aitb-bm-mark-fade 1.8s ease-out forwards;
    }
    @keyframes aitb-bm-mark-fade {
        0%   { background: rgba(255, 214, 10, 0.85); }
        70%  { background: rgba(255, 214, 10, 0.7); }
        100% { background: transparent; }
    }

    #${BOOKMARK_MENU_ID} {
        position: fixed;
        z-index: 2147483647;
        min-width: 200px;
        padding: 4px;
        background: rgba(255, 255, 255, 0.98);
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.08);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
        font-size: 13px;
        color: #1d1d1f;
        animation: aitb-menu-in 0.12s ease-out;
    }
    @keyframes aitb-menu-in {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
    }
    #${BOOKMARK_MENU_ID} button {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 10px;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background 0.1s ease;
    }
    #${BOOKMARK_MENU_ID} button:hover { background: rgba(0, 122, 255, 0.12); }

    @media (prefers-color-scheme: dark) {
        #${BOOKMARK_MENU_ID} {
            background: rgba(44, 44, 46, 0.98);
            color: rgba(255, 255, 255, 0.92);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }
        #${BOOKMARK_MENU_ID} button:hover { background: rgba(10, 132, 255, 0.22); }
    }

    @media (prefers-color-scheme: dark) {
        #${BOOKMARKS_PANEL_ID} .aitb-bm-toggle {
            background: rgba(44, 44, 46, 0.9);
            color: rgba(255, 255, 255, 0.92);
        }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-body {
            background: rgba(28, 28, 30, 0.96);
            border-left-color: rgba(255, 255, 255, 0.08);
        }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-title { color: rgba(255, 255, 255, 0.95); }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-header { border-bottom-color: rgba(255, 255, 255, 0.08); }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-collapse { color: rgba(235, 235, 245, 0.5); }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-collapse:hover { background: rgba(255, 255, 255, 0.06); }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-empty { color: rgba(235, 235, 245, 0.45); }

        #${BOOKMARKS_PANEL_ID} .aitb-bm-item { background: rgba(255, 255, 255, 0.04); }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-item:hover { background: rgba(255, 255, 255, 0.08); }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-item-role { color: rgba(235, 235, 245, 0.45); }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-item-body { color: rgba(255, 255, 255, 0.92); }
        #${BOOKMARKS_PANEL_ID} .aitb-bm-note {
            color: rgba(235, 235, 245, 0.72);
            background: rgba(10, 132, 255, 0.14);
            border-left-color: rgba(10, 132, 255, 0.5);
        }
    }
`;

// Mount after DOM is ready. content_scripts runs at document_start so body
// may not exist yet.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBookmarksPanel);
} else {
    mountBookmarksPanel();
}
