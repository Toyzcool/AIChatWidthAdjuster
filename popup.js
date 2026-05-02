// Per-site config: storage key, default width, and host matcher for auto-detect.
const SITES = {
    gemini:  { storageKey: 'geminiWidth',  defaultWidth: 1200, hosts: ['gemini.google.com'] },
    claude:  { storageKey: 'claudeWidth',  defaultWidth: 1000, hosts: ['claude.ai'] },
    chatgpt: { storageKey: 'chatgptWidth', defaultWidth: 1000, hosts: ['chatgpt.com', 'chat.openai.com'] },
};

// Match the page-side CSS transition so the popup slider and the page width
// animate in lockstep. Keep the easing identical to content.js's cubic-bezier.
const TWEEN_DURATION = 420; // ms
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('[data-panel]');
const wrapToggle = document.getElementById('wrapToggle');

// Per-site control state (slider, display, presets, tween id).
const controls = {};
for (const id of Object.keys(SITES)) {
    controls[id] = {
        slider: document.querySelector(`[data-slider="${id}"]`),
        display: document.querySelector(`[data-value="${id}"]`),
        presets: document.querySelectorAll(`[data-presets="${id}"] .preset-btn`),
        tweenId: null,
    };
}

function updatePresets(siteId, width) {
    const w = Number(width);
    controls[siteId].presets.forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.width) === w);
    });
}

function setWidthUI(siteId, width) {
    const c = controls[siteId];
    c.slider.value = width;
    c.display.textContent = `${Math.round(width)} px`;
    updatePresets(siteId, width);
}

function cancelTween(siteId) {
    const c = controls[siteId];
    if (c.tweenId !== null) {
        cancelAnimationFrame(c.tweenId);
        c.tweenId = null;
    }
}

function tweenSliderTo(siteId, target) {
    cancelTween(siteId);
    const c = controls[siteId];
    const from = Number(c.slider.value);
    // Commit storage with the animation duration so the page's CSS transition
    // runs in parallel with the popup slider tween (avoids sequential choppiness).
    chrome.storage.local.set({
        [SITES[siteId].storageKey]: target,
        widthAnimMs: TWEEN_DURATION,
    });
    if (from === target) return;
    const start = performance.now();
    updatePresets(siteId, target);
    const step = (now) => {
        const t = Math.min(1, (now - start) / TWEEN_DURATION);
        const current = from + (target - from) * easeOutQuint(t);
        c.slider.value = current;
        c.display.textContent = `${Math.round(current)} px`;
        if (t < 1) {
            c.tweenId = requestAnimationFrame(step);
        } else {
            c.tweenId = null;
            setWidthUI(siteId, target);
        }
    };
    c.tweenId = requestAnimationFrame(step);
}

function showPanel(siteId) {
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.site === siteId));
    panels.forEach(p => { p.hidden = p.dataset.panel !== siteId; });
    // Show site-specific export cards only when the active tab matches.
    // data-export-for may list multiple sites (space-separated).
    document.querySelectorAll('[data-export-for]').forEach(card => {
        const sites = (card.dataset.exportFor || '').split(/\s+/).filter(Boolean);
        card.hidden = !sites.includes(siteId);
    });
}

// Wire slider + preset + tab events for each site.
for (const siteId of Object.keys(SITES)) {
    const c = controls[siteId];
    const key = SITES[siteId].storageKey;

    c.slider.addEventListener('input', () => {
        cancelTween(siteId);
        const w = Number(c.slider.value);
        setWidthUI(siteId, w);
        // During drag, disable the page-side CSS transition so width tracks
        // the thumb 1:1 with no lag.
        chrome.storage.local.set({ [key]: w, widthAnimMs: 0 });
    });
    // When the drag ends, restore the animated duration so the next preset
    // click (or any future change) gets the smooth transition again.
    c.slider.addEventListener('change', () => {
        chrome.storage.local.set({ widthAnimMs: TWEEN_DURATION });
    });

    c.presets.forEach(btn => {
        btn.addEventListener('click', () => tweenSliderTo(siteId, Number(btn.dataset.width)));
    });
}

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => showPanel(btn.dataset.site));
});

wrapToggle.addEventListener('change', () => {
    chrome.storage.local.set({ codeAutoWrap: wrapToggle.checked });
});

// Export: ask the active tab's content script to build the output and
// trigger the action in-page (download for MD, print dialog for PDF).
const exportMdBtn = document.getElementById('exportMdBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportStatus = document.getElementById('exportStatus');

function setExportStatus(text, kind) {
    exportStatus.textContent = text;
    exportStatus.classList.toggle('error', kind === 'error');
    exportStatus.classList.toggle('success', kind === 'success');
}

function setExportBusy(busy) {
    exportMdBtn.disabled = busy;
    exportPdfBtn.disabled = busy;
}

function sendToActiveTab(type, onResponse) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab) {
            setExportBusy(false);
            setExportStatus('No active tab.', 'error');
            return;
        }
        chrome.tabs.sendMessage(tab.id, { type }, (resp) => {
            onResponse(resp, chrome.runtime.lastError);
        });
    });
}

exportMdBtn.addEventListener('click', () => {
    setExportBusy(true);
    setExportStatus('Exporting…');
    sendToActiveTab('export-markdown', (resp, err) => {
        setExportBusy(false);
        if (err || !resp) {
            setExportStatus('Reload this tab and try again.', 'error');
            return;
        }
        if (resp.ok) {
            setExportStatus('Downloaded.', 'success');
            setTimeout(() => setExportStatus(''), 2500);
        } else if (resp.reason === 'no-conversation') {
            setExportStatus('No conversation found on this page.', 'error');
        } else {
            setExportStatus('Export failed.', 'error');
        }
    });
});

exportPdfBtn.addEventListener('click', () => {
    setExportBusy(true);
    setExportStatus('Opening print dialog…');
    sendToActiveTab('export-pdf', (resp, err) => {
        setExportBusy(false);
        if (err) {
            setExportStatus('Reload this tab and try again.', 'error');
            console.error('[AI Chat Width] PDF export messaging error:', err);
            return;
        }
        if (!resp) {
            setExportStatus('No response from page. Reload and retry.', 'error');
            return;
        }
        if (!resp.ok) {
            if (resp.reason === 'no-conversation') {
                setExportStatus('No messages found. Scroll through the chat first.', 'error');
            } else {
                setExportStatus(`Export failed: ${resp.message || resp.reason || 'unknown'}`, 'error');
                console.error('[AI Chat Width] PDF export error:', resp);
            }
            return;
        }
        setExportStatus('Pick “Save as PDF” in the dialog.', 'success');
        // Close the popup so the print dialog gets focus cleanly.
        setTimeout(() => window.close(), 150);
    });
});

// Detect active tab's site, then load all widths + wrap preference.
function detectActiveSite(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url ?? '';
        for (const [id, { hosts }] of Object.entries(SITES)) {
            if (hosts.some(h => url.includes(h))) return cb(id);
        }
        cb('gemini'); // fallback
    });
}

const storageKeys = Object.values(SITES).map(s => s.storageKey).concat('codeAutoWrap');
chrome.storage.local.get(storageKeys, (result) => {
    for (const [id, { storageKey, defaultWidth }] of Object.entries(SITES)) {
        setWidthUI(id, result[storageKey] ?? defaultWidth);
    }
    wrapToggle.checked = !!result.codeAutoWrap;
    detectActiveSite(showPanel);
});

// Clean up storage from the removed Expand Input Box toggle (v2.3).
chrome.storage.local.remove('expandInput');

// --- History search ------------------------------------------------------
// Reads conversation indexes captured by the content script (one per site)
// and runs the pure searchIndex helper from lib/pure.js. Results across
// the three sites are pooled, ranked, and clicked through to the canonical
// conversation URL on each platform.

const HISTORY_KEYS = {
    chatgpt: 'historyIndex:chatgpt',
    claude: 'historyIndex:claude',
    gemini: 'historyIndex:gemini',
};

const SITE_URL_BUILDERS = {
    chatgpt: (id) => `https://chatgpt.com/c/${id}`,
    claude: (id) => `https://claude.ai/chat/${id}`,
    gemini: (id) => `https://gemini.google.com/app/${id}`,
};

const SITE_LABELS = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
};

function loadAllHistoryEntries(cb) {
    const keys = Object.values(HISTORY_KEYS);
    chrome.storage.local.get(keys, (result) => {
        const all = [];
        for (const [siteName, storageKey] of Object.entries(HISTORY_KEYS)) {
            const list = Array.isArray(result[storageKey]) ? result[storageKey] : [];
            for (const entry of list) {
                if (entry && entry.id) {
                    // Tag the site so the renderer can build the URL and badge.
                    all.push({ ...entry, _site: siteName });
                }
            }
        }
        cb(all);
    });
}

function escapeHtmlSafe(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function renderSearchResults(results) {
    const container = document.getElementById('searchResults');
    if (!container) return;
    if (!results.length) {
        container.innerHTML = `<div class="search-empty">No matches in your visited conversations.</div>`;
        return;
    }
    container.innerHTML = results.map(r => `
        <div class="search-result" data-id="${escapeHtmlSafe(r.id)}" data-site="${escapeHtmlSafe(r._site)}">
            <div class="search-result-meta">
                <span class="search-result-site">${escapeHtmlSafe(SITE_LABELS[r._site] || r._site)}</span>
                <span class="search-result-title">${escapeHtmlSafe(r.title || 'Untitled')}</span>
            </div>
            ${r.snippet ? `<div class="search-result-snippet">${escapeHtmlSafe(r.snippet)}</div>` : ''}
        </div>
    `).join('');

    container.querySelectorAll('.search-result').forEach((el) => {
        el.addEventListener('click', () => {
            const id = el.getAttribute('data-id');
            const siteName = el.getAttribute('data-site');
            openConversation(siteName, id);
        });
    });
}

function openConversation(siteName, id) {
    const builder = SITE_URL_BUILDERS[siteName];
    if (!builder || !id) return;
    const url = builder(id);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        // If the active tab is already on the same AI site, navigate it
        // (in-place feels more natural). Otherwise open a fresh tab so we
        // don't disrupt the user's current page.
        const onSameSite = tab && tab.url && tab.url.includes(
            { chatgpt: 'chatgpt.com', claude: 'claude.ai', gemini: 'gemini.google.com' }[siteName]
        );
        if (onSameSite) {
            chrome.tabs.update(tab.id, { url });
        } else {
            chrome.tabs.create({ url });
        }
        // Close the popup so focus lands on the navigated tab cleanly.
        window.close();
    });
}

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const searchCard = document.getElementById('searchCard');

let searchDebounce = null;
function runSearch(query) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
        searchCard.setAttribute('data-has-query', 'false');
        return;
    }
    searchCard.setAttribute('data-has-query', 'true');
    if (typeof AIToolboxPure === 'undefined' || !AIToolboxPure.searchIndex) {
        // Defensive: lib/pure.js failed to load. Don't crash the popup —
        // just show a neutral empty state.
        renderSearchResults([]);
        return;
    }
    loadAllHistoryEntries((entries) => {
        const results = AIToolboxPure.searchIndex(entries, trimmed, { limit: 10 });
        renderSearchResults(results);
    });
}

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => runSearch(e.target.value), 80);
    });
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        runSearch('');
        searchInput.focus();
    });
    // Pressing Esc clears + drops focus.
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            runSearch('');
        }
    });
}
