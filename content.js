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
