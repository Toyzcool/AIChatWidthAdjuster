// Per-site config: storage key, default width, and host matcher for auto-detect.
const SITES = {
    gemini:  { storageKey: 'geminiWidth',  defaultWidth: 1200, hosts: ['gemini.google.com'] },
    claude:  { storageKey: 'claudeWidth',  defaultWidth: 1000, hosts: ['claude.ai'] },
    chatgpt: { storageKey: 'chatgptWidth', defaultWidth: 1000, hosts: ['chatgpt.com', 'chat.openai.com'] },
};

const TWEEN_DURATION = 320; // ms
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

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
    if (from === target) {
        chrome.storage.local.set({ [SITES[siteId].storageKey]: target });
        return;
    }
    const start = performance.now();
    updatePresets(siteId, target);
    const step = (now) => {
        const t = Math.min(1, (now - start) / TWEEN_DURATION);
        const current = from + (target - from) * easeOutCubic(t);
        c.slider.value = current;
        c.display.textContent = `${Math.round(current)} px`;
        if (t < 1) {
            c.tweenId = requestAnimationFrame(step);
        } else {
            c.tweenId = null;
            setWidthUI(siteId, target);
            chrome.storage.local.set({ [SITES[siteId].storageKey]: target });
        }
    };
    c.tweenId = requestAnimationFrame(step);
}

function showPanel(siteId) {
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.site === siteId));
    panels.forEach(p => { p.hidden = p.dataset.panel !== siteId; });
}

// Wire slider + preset + tab events for each site.
for (const siteId of Object.keys(SITES)) {
    const c = controls[siteId];
    const key = SITES[siteId].storageKey;

    c.slider.addEventListener('input', () => {
        cancelTween(siteId);
        const w = Number(c.slider.value);
        setWidthUI(siteId, w);
        chrome.storage.local.set({ [key]: w });
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
