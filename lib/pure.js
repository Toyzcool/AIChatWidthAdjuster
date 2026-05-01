// Pure utility functions shared between the content script and unit tests.
//
// This file MUST stay free of DOM, chrome.*, and any browser-only globals so
// that Node's test runner can `require()` it directly. content.js loads this
// first via the manifest's content_scripts[].js array; it exposes the
// helpers on `globalThis.AIToolboxPure`.

(function (root, factory) {
    const lib = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = lib;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.AIToolboxPure = lib;
    } else if (typeof window !== 'undefined') {
        window.AIToolboxPure = lib;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    // djb2 — fast non-cryptographic hash. Used to detect "is this the same
    // message content" across DOM re-renders. Collisions are harmless because
    // they only cause a scroll to the wrong message, and an index is also
    // carried as a primary key.
    function hashText(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        }
        return String(h);
    }

    // Parse a CSS color value (rgb/rgba) and return Rec. 601 luma in [0, 1].
    // Returns null for unrecognized or fully-transparent colors so the caller
    // can fall through to other heuristics.
    function bgLuminance(str) {
        if (!str) return null;
        const m = str.match(/rgba?\(([^)]+)\)/i);
        if (!m) return null;
        const parts = m[1].split(',').map(s => parseFloat(s.trim()));
        const [r, g, b, a = 1] = parts;
        if (!Number.isFinite(r) || a === 0) return null;
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    // Per-site URL → conversation id extractors. Pulled out of the site
    // adapters so we can unit-test the regex behavior without bringing in
    // the rest of the bookmark engine.
    const conversationIdExtractors = {
        chatgpt(pathname) {
            const m = pathname.match(/\/c\/([0-9a-f-]+)/i);
            return m ? m[1] : null;
        },
        claude(pathname) {
            const m = pathname.match(/\/chat\/([0-9a-f-]+)/i);
            return m ? m[1] : null;
        },
        gemini(pathname) {
            const m = pathname.match(/\/app\/([^/?#]+)/i);
            return m ? m[1] : null;
        },
    };

    // Whitespace-flexible substring match. The bookmark store normalizes
    // whitespace at save time (\s+ → ' '), but Gemini's DOM preserves \n\t
    // between block elements; an exact indexOf would miss in that case. This
    // returns the index + matched length in `haystack`, or { index: -1 } if
    // no match.
    function findFlexibleMatch(haystack, needle) {
        if (!needle) return { index: -1, length: 0 };
        const lowerHay = haystack.toLowerCase();
        const lowerNeedle = needle.toLowerCase();
        const exact = lowerHay.indexOf(lowerNeedle);
        if (exact !== -1) return { index: exact, length: needle.length };

        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const loose = escaped.replace(/\s+/g, '\\s+');
        const re = new RegExp(loose, 'i');
        const match = haystack.match(re);
        if (!match) return { index: -1, length: 0 };
        return { index: match.index, length: match[0].length };
    }

    return {
        hashText,
        bgLuminance,
        conversationIdExtractors,
        findFlexibleMatch,
    };
});
