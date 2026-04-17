const slider = document.getElementById('widthSlider');
const valueDisplay = document.getElementById('widthValue');
const presetBtns = document.querySelectorAll('.preset-btn');
const wrapToggle = document.getElementById('wrapToggle');

const DEFAULT_WIDTH = 1200;
const TWEEN_DURATION = 320; // ms

function updatePresetButtons(currentWidth) {
    const w = Number(currentWidth);
    presetBtns.forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.width) === w);
    });
}

function setWidthUI(width) {
    slider.value = width;
    valueDisplay.textContent = `${Math.round(width)} px`;
    updatePresetButtons(width);
}

// Apple-like ease-out cubic for a natural, settled feel.
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

let tweenId = null;
function cancelTween() {
    if (tweenId !== null) {
        cancelAnimationFrame(tweenId);
        tweenId = null;
    }
}

function tweenSliderTo(target) {
    cancelTween();
    const from = Number(slider.value);
    if (from === target) {
        chrome.storage.local.set({ geminiWidth: target });
        return;
    }
    const start = performance.now();
    const step = (now) => {
        const t = Math.min(1, (now - start) / TWEEN_DURATION);
        const eased = easeOutCubic(t);
        const current = from + (target - from) * eased;
        slider.value = current;
        valueDisplay.textContent = `${Math.round(current)} px`;
        if (t < 1) {
            tweenId = requestAnimationFrame(step);
        } else {
            tweenId = null;
            setWidthUI(target);
            chrome.storage.local.set({ geminiWidth: target });
        }
    };
    // Highlight target preset immediately so the segmented control feels responsive.
    updatePresetButtons(target);
    tweenId = requestAnimationFrame(step);
}

chrome.storage.local.get(['geminiWidth', 'codeAutoWrap'], (result) => {
    setWidthUI(result.geminiWidth ?? DEFAULT_WIDTH);
    wrapToggle.checked = !!result.codeAutoWrap;
});

slider.addEventListener('input', () => {
    cancelTween();
    const width = Number(slider.value);
    setWidthUI(width);
    chrome.storage.local.set({ geminiWidth: width });
});

presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tweenSliderTo(Number(btn.dataset.width));
    });
});

wrapToggle.addEventListener('change', () => {
    chrome.storage.local.set({ codeAutoWrap: wrapToggle.checked });
});
