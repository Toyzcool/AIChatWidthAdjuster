# Chrome Web Store Release Playbook

This document is the single source of truth for publishing AIToolbox to the
Chrome Web Store. On every release, follow this doc top-to-bottom. When the
feature set changes, update the relevant section here first, then use it to
fill the Dashboard.

---

## 0. Release Checklist

1. **Run `npm test`** — all green is mandatory
2. Bump `version` in `manifest.json` and `popup.html` (§1)
3. Update §2 (Store listing copy) if new features
4. Update §3 (Permission justifications) if new permissions
5. Update §6 (Screenshots) if UI changed
6. Update `PRIVACY.md` at repo root if data handling changed
7. Package the zip per §8
8. Upload zip → fill listing from this doc → submit for review

---

## 1. Version Numbering

| Change size | Example | Bump |
|---|---|---|
| Full new feature complete | Bookmarks system done | `3.0 → 3.1` |
| Feature stage / small UX change | Bubble delay tweak | `3.0 → 3.0.1` |
| Pure bug fix | Icon tweak | `3.0 → 3.0.1` |
| Major refactor / breaking | Shortcut scheme change | `3.x → 4.0` |

Store publishes need strictly increasing versions. If internal iteration bumps
version many times between releases, the release version can skip ahead — but
never go backward.

---

## 2. Store Listing Copy

### 2.1 Summary (≤132 characters, shown in search results)

**English (default)**
```
ChatGPT / Claude / Gemini all-in-one: adjust chat width, export to MD/PDF, bookmark any selection for precise jump-back.
```

**中文 (zh_CN)**
```
ChatGPT / Claude / Gemini 三端通用：一键调节对话宽度、导出 MD/PDF、选中添加书签精准跳转。
```

### 2.2 Detailed Description

#### English
```
AIToolbox — A four-in-one companion for AI chat

One extension, three platforms (ChatGPT, Claude, Gemini). Four core capabilities:
1. Adjust chat width (tables widen along with it — no more horizontal scrolling)
2. Export conversations as Markdown or PDF
3. Bookmark any selected text, jump back to it with one click
4. Auto-wrap long code blocks — no more dragging side to side

Chat Width Control
The problem: the default chat column only uses a narrow strip in the middle of the screen, leaving huge margins on both sides; any moderately complex table gets squeezed into "please scroll horizontally".
Click the extension icon and drag the slider to adjust the active site's chat width — ChatGPT / Claude / Gemini. Each site remembers its own preference and applies automatically when you switch tabs. Tables expand with the column, so horizontal scrolling is gone.

Conversation Bookmarks
The problem: after dozens of exchanges with an AI, finding "that one solution" or "that code snippet from earlier" means hammering Ctrl+F or scrolling back a full page at a time.
Select any passage inside a message and a black "Bookmark" button fades in below — one click saves it. A right-side panel manages bookmarks per conversation; you can add a note, edit it, or delete. Click any bookmark — the page jumps straight to the original text with a brief highlight. Precise even when your selection spans a heading and the paragraph after it. Works on all three platforms. Stored locally, nothing uploaded.

Export Conversations
The problem: everything lives inside a browser tab. Switching models, devices, archiving, or sending it to a teammate all mean manual copy-paste — and the formatting breaks along the way.
Click "Export as Markdown" to save the conversation as a .md file — headings, lists, tables, code blocks, and KaTeX math all preserved as-is, drop it straight into your notes app. Or click "Export as PDF" to open the browser's print dialog and produce a clean, print-optimized layout. Works on all three platforms.

Auto-Wrap Code Blocks
Toggle "Code Auto Wrap" in the extension popup — every code block on every supported platform immediately wraps to the container width, breaking long lines onto the next row. Indentation stays intact; logic structure stays readable.

Quality-of-life touches
The side panel and bookmark button follow the host site's theme.
Every setting change applies instantly — no page reload needed.
Fully local. Conversation data is never transmitted or collected.
```

#### 中文
```
AIToolbox — 为 AI 对话打造的四件套

一个插件，三个平台（ChatGPT、Claude、Gemini）通用。四个核心能力：
1. 调节对话宽度（表格一起变宽，不再横向拖动）
2. 导出对话为 Markdown 或 PDF
3. 选中文字添加书签，点一下精准跳回原文
4. 长代码自动换行，不再左右滑动

调节对话宽度
痛点：默认对话框只用屏幕中间一小条，两侧大片留白；稍微复杂点的表格直接被挤成"待横向滚动"。
点开插件图标，拖动滑块即可调节当前站点的对话宽度——ChatGPT / Claude / Gemini。每个站点的偏好独立记忆，切换 Tab 自动应用。表格会跟着整体宽度一起铺开，不再需要横向拖动。

对话书签
痛点：和 AI 来回几十轮后，想回头看「那段方案建议」、「那个代码示例」，只能靠 Ctrl+F 关键词硬搜，或滚动翻一整页。
选中消息里的任意一段文字，下方浮出黑色「Bookmark」按钮，点击即存。右侧侧栏按当前对话独立管理，条目上可以写备注、改备注、删除。点任何一个书签——页面立刻滚到原文，选中的部分高亮一下。即使选中内容跨了标题和正文也能精准定位。三端全部支持，本地存储不上传。

导出对话
痛点：内容全在浏览器里。换 AI 模型、设备、存档、发同事，都得手动复制粘贴，格式还全乱。
点插件里的「Export as Markdown」导出为 .md 文件——标题、列表、表格、代码块、KaTeX 公式原样保留，直接可以丢进笔记软件。或者「Export as PDF」调用浏览器打印对话框，生成排版干净的 PDF。三端全部支持。

代码自动换行
打开插件里的「Code Auto Wrap」开关——所有平台的代码块立即按容器宽度换行，长行自动折回下一行。保留缩进，不破坏逻辑结构。

其他小细节
侧栏和书签按钮的深浅色跟随站点本身。
所有设置变更实时生效，无需刷新页面。
纯本地，对话数据从不上传、从不收集。
```

### 2.3 manifest.json `description` field
Max 132 chars. Should mirror §2.1 summary:
```
ChatGPT / Claude / Gemini all-in-one: adjust chat width, export to MD/PDF, bookmark any selection for precise jump-back.
```

---

## 3. Permission Justifications

### Single purpose statement
```
AIToolbox is a display and organization helper for AI chat conversations on ChatGPT, Claude, and Gemini. It lets users widen the chat column, auto-wrap long code blocks, bookmark selected passages for quick jump-back, and export conversations as Markdown or PDF — all performed locally on the user's own device.
```

### `storage`
```
Used to persist user preferences locally on the user's device: per-site chat width values, the code auto-wrap toggle, the bookmark panel collapsed/expanded state, and the user's bookmark entries for each conversation. All data is stored via chrome.storage.local; nothing is synced or uploaded.
```

### `tabs`
```
Used by the popup to identify the active site (ChatGPT / Claude / Gemini) and apply the correct width slider, and to send a message to the active tab's content script when the user clicks "Export as Markdown" or "Export as PDF". No browsing history or tab metadata is read beyond the active tab's URL at the moment of a user-initiated action.
```

### Host permissions (`*://gemini.google.com/*`, `*://claude.ai/*`, `*://chatgpt.com/*`, `*://chat.openai.com/*`)
```
Required to inject the CSS and content script that power the extension's features on exactly these three AI chat services. The content script adjusts chat width via CSS, wraps long code blocks, renders the bookmark panel, and — only when the user explicitly clicks "Export" or "Bookmark" — reads the visible conversation DOM to produce the requested output. No data leaves the user's device.
```

### Remote code
Answer: **No, I am not using remote code.**
Rationale: all JS ships inside the package; no `eval()`, no external `<script src>`, no runtime-fetched modules.

---

## 4. Data Usage Form

Check **only** this box:
- ✅ **Website content** — the extension reads visible conversation DOM when the user explicitly clicks Bookmark or Export, and stores user-created bookmark snippets locally in `chrome.storage.local`.

Do **not** check: Personally identifiable information, Health, Financial, Authentication, Personal communications, Location, Web history, User activity.

Confirm all three certifications:
- ✅ I do not sell or transfer user data to third parties, outside of the approved use cases
- ✅ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## 5. Privacy Policy

Policy lives at repo root: [`/PRIVACY.md`](../PRIVACY.md).
Public URL for Dashboard:

```
https://raw.githubusercontent.com/Toyzcool/AIToolbox/main/PRIVACY.md
```

When behavior changes (new permissions, new data handling), edit `PRIVACY.md`
and update the "Last updated" date. Push to `main` — the raw URL always serves
the latest version.

---

## 6. Screenshots

Chrome accepts up to 5 screenshots, 1280×800 or 640×400, 24-bit PNG/JPEG,
no alpha. Always use 1280×800.

Each screenshot has two parts: **what to capture** (you do the screen grab),
and **AI prompt** (attach the grabs, feed to an image AI like Nano Banana /
GPT-4o image / Ideogram to produce the final tile).

Header pattern on every tile:
- Line 1 (Chinese, bold ~36pt, `#202124`): purpose statement
- Line 2 (English, medium ~22pt, `#5F6368`): same purpose in English
- Bottom 40px: logo + "AIToolbox" signature strip

### #1 — Landing (most important; shown in listings)

**Capture**
1. Open ChatGPT with a conversation containing both prose and code.
2. Screenshot the default layout (narrow center, wide empty margins).
3. Screenshot the same page with AIToolbox active — width widened, right-side bookmark panel open with 2–3 bookmarks.

**AI prompt**
```
Create a Chrome Web Store screenshot, canvas exactly 1280×800 pixels,
24-bit PNG (no alpha), pure white background.

Top 80 pixels: bilingual header text, centered.
Line 1 (Chinese, bold, ~36pt, #202124): "一站搞定 AI 对话增强"
— highlight "AI" in bright blue #1A73E8.
Line 2 (English, medium, ~22pt, #5F6368): "All-in-One AI Chat Enhancement"
— highlight "AI" in #1A73E8.

Main area (below the header): place the two attached screenshots side
by side with a 24-pixel gap. Left screenshot shows the default ChatGPT
layout with narrow content and wide empty side margins; right
screenshot shows the extension active — a widened chat column, a
bookmark panel visible on the right. Round the corners of both
screenshots to 12px and add a soft drop shadow. Scale both to fit
within the main area vertically.

Under each screenshot, add a short label in #5F6368 14pt:
- Left: "默认 · Default"
- Right: "AIToolbox · Widened + Bookmarks"

Bottom 40 pixels: a thin horizontal line in #E8EAED at the top edge,
followed by a small centered logo placeholder and the extension name
"AIToolbox" in #202124 medium 14pt.

Chinese font: PingFang SC / Source Han Sans.
English font: Inter / SF Pro Display.
Follow Google Material Design, generous whitespace.
```

### #2 — Bookmark feature

**Capture**
1. In Claude or ChatGPT, have a text selection visible in a message.
2. AIToolbox's black "Bookmark" bubble visible below the selection.
3. Right-side bookmark panel expanded, containing 3–4 pre-saved bookmarks with role badges and note snippets.

**AI prompt**
```
Create a Chrome Web Store screenshot, canvas exactly 1280×800 pixels,
24-bit PNG (no alpha), pure white background.

Top 80 pixels: bilingual header.
Line 1 (Chinese, bold, ~36pt, #202124): "选中加书签，一点跳回原文"
— highlight "选中加书签" in bright blue #1A73E8.
Line 2 (English, medium, ~22pt, #5F6368): "Select → Bookmark → Jump Back"
— highlight "Bookmark" in #1A73E8.

Main area: center the attached screenshot, round corners to 12px, add
a soft drop shadow. Scale to fit with 40px margins.

Overlay three arrows (stroke #1A73E8, 3px, rounded caps) with short
labels pointing to:
1. The highlighted text selection — label "① 选中文字 / Select text"
2. The black floating "Bookmark" button — label "② 点一下保存 / One click to save"
3. An item in the right-side bookmark panel — label "③ 点条目跳回 / Click to jump back"

Labels: 14pt, #202124 on a white pill with #E8EAED border, 6px
padding.

Bottom 40 pixels: logo placeholder + "AIToolbox" in #202124 14pt.
Follow Google Material Design, generous whitespace.
```

### #3 — Width adjustment (table scenario)

**Capture**
1. Ask AI for a 5-column comparison table (e.g. "compare 5 features of Python vs Go").
2. Two screenshots of the same conversation:
   - Default width → table truncated into horizontal scroll
   - AIToolbox at 1500px → full table visible

**AI prompt**
```
Create a Chrome Web Store screenshot, canvas exactly 1280×800 pixels,
24-bit PNG (no alpha), pure white background.

Top 80 pixels: bilingual header.
Line 1 (Chinese, bold, ~36pt, #202124): "表格不再挤成滚动条"
— highlight "不再挤成滚动条" in #1A73E8.
Line 2 (English, medium, ~22pt, #5F6368): "Tables No Longer Squeezed"
— highlight "No Longer Squeezed" in #1A73E8.

Main area: stack the two attached screenshots vertically with 24px
gap, rounded corners 12px, soft drop shadow.
- Top image: default width — table shown in overflow-x scrollbar
- Bottom image: extension active — full table visible

On the LEFT of the top image, add a small red pill badge: "默认 · Default"
(background #FEE4E2, text #B42318, 6px radius).
On the LEFT of the bottom image, add a green pill: "AIToolbox"
(background #D1FADF, text #027A48).

Bottom 40 pixels: logo + "AIToolbox" label.
Follow Material Design, generous whitespace.
```

### #4 — Export (Markdown / PDF)

**Capture**
1. AIToolbox popup open showing "Export as Markdown" / "Export as PDF" buttons.
2. The exported .md file opened in VS Code, showing formatted headings, code blocks, tables.

**AI prompt**
```
Create a Chrome Web Store screenshot, canvas exactly 1280×800 pixels,
24-bit PNG (no alpha), pure white background.

Top 80 pixels: bilingual header.
Line 1 (Chinese, bold, ~36pt, #202124): "一键导出 Markdown / PDF"
— highlight "Markdown" and "PDF" in #1A73E8.
Line 2 (English, medium, ~22pt, #5F6368): "One-Click Export to Markdown / PDF"
— highlight "Markdown" and "PDF" in #1A73E8.

Main area: place the two attached screenshots side by side with a
large arrow pointing from left to right in between. Left screenshot
(the popup with the two export buttons) should be smaller (~30% of
width), right screenshot (the rendered .md file in VS Code) should be
larger (~60%). Round corners 12px, soft shadows.

Arrow: stroke #1A73E8, 4px, arrowhead at right end, centered between
the images.

Labels below each:
- Left: "① 点击导出 / Click Export"
- Right: "② 格式原样保留 / Formatting Preserved"
Labels: 14pt #5F6368.

Bottom 40 pixels: logo + "AIToolbox".
Follow Material Design, generous whitespace.
```

### #5 — Three-platform coverage

**Capture**
Three separate window screenshots, each with AIToolbox active (widened +
bookmark panel visible):
- ChatGPT
- Claude (dark mode recommended for visual variety)
- Gemini

**AI prompt**
```
Create a Chrome Web Store screenshot, canvas exactly 1280×800 pixels,
24-bit PNG (no alpha), pure white background.

Top 80 pixels: bilingual header.
Line 1 (Chinese, bold, ~36pt, #202124): "Claude · Gemini · ChatGPT 三端通用"
— highlight "Claude", "Gemini", "ChatGPT" each in #1A73E8.
Line 2 (English, medium, ~22pt, #5F6368): "Universal for Claude, Gemini, and ChatGPT"
— highlight "Claude", "Gemini", "ChatGPT" each in #1A73E8.

Main area: place the three attached screenshots side by side
horizontally, each taking ~30% of the width with 20px gaps. Round
corners 12px, soft drop shadow. Scale all three to the same height.

Under each screenshot add a small logo + platform name centered:
- "ChatGPT" with OpenAI mark
- "Claude" with Anthropic mark
- "Gemini" with Google mark
(Logos should be small, monochrome #5F6368, platform name 14pt #202124.)

Bottom 40 pixels: a single horizontal line with extension logo +
"AIToolbox" centered.
Follow Material Design, generous whitespace.
```

---

## 7. Promo Tiles

### 7.1 Small Promo Tile (440×280)

**AI prompt**
```
A Chrome Web Store-style product promo tile, canvas size 440×280 pixels.
Pure white background decorated with flowing blue abstract curves in the
top-left and bottom-right corners (soft gradient from deep blue #1A73E8
to light blue #4FC3F7), creating an elegant sense of motion. Center of
the canvas features four lines of centered bilingual text in the
following hierarchy:

Line 1 (Chinese headline, largest): "调宽度 · 加书签 · 导出 · 换行" —
dark gray #202124 bold sans-serif, with "调宽度", "加书签", "导出", and
"换行" each highlighted in bright blue #1A73E8.

Line 2 (English headline, slightly smaller than the Chinese headline):
"Widen · Bookmark · Export · Wrap" — dark gray #202124 bold sans-serif,
with "Widen", "Bookmark", "Export", and "Wrap" each highlighted in
bright blue #1A73E8.

(Appropriate spacing between headlines and subtitles)

Line 3 (Chinese subtitle, medium size): "Claude、Gemini、ChatGPT 三端通用"
— medium gray #5F6368 sans-serif medium weight, with "Claude", "Gemini",
and "ChatGPT" highlighted in bright blue #1A73E8.

Line 4 (English subtitle, same size or slightly smaller): "Universal for
Claude, Gemini, and ChatGPT" — medium gray #5F6368 sans-serif medium
weight, with "Claude", "Gemini", and "ChatGPT" highlighted in bright
blue #1A73E8.

Chinese font: PingFang SC Bold / Source Han Sans Heavy.
English font: Inter Bold / SF Pro Display Bold.
Clean, modern, bright, with generous whitespace and clear visual
hierarchy. Rounded canvas corners (approx. 12px radius).
```

### 7.2 Marquee Promo Tile (1400×560)

**AI prompt**
```
A Chrome Web Store Marquee Promo Tile, canvas size 1400×560 pixels.
Solid pure white background (no transparency, no alpha channel),
decorated with large flowing blue abstract curves in the top-left and
bottom-right corners (soft gradient from deep blue #1A73E8 to light
blue #4FC3F7), expansive and dynamic, filling the composition without
overpowering the text.

Composition uses a horizontally-centered vertical stack with four lines
of text in a clear hierarchy:

Line 1 (Chinese headline, largest, bold): "调宽度 · 加书签 · 导出 MD/PDF · 代码换行"
— dark gray #202124 bold sans-serif, with "调宽度", "加书签", "导出 MD/PDF",
and "代码换行" each highlighted in bright blue #1A73E8.

Line 2 (English headline, slightly smaller): "Widen · Bookmark ·
Export MD/PDF · Code Wrap" — dark gray #202124 bold sans-serif, with
"Widen", "Bookmark", "Export MD/PDF", and "Code Wrap" each highlighted
in bright blue #1A73E8.

(Larger visual spacing between headlines and subtitles, ~40–60 pixels)

Line 3 (Chinese subtitle, medium size): "Claude、Gemini、ChatGPT 三端通用
— 一次设置，长期生效" — medium gray #5F6368 sans-serif medium weight,
with "Claude", "Gemini", and "ChatGPT" highlighted in bright blue
#1A73E8.

Line 4 (English subtitle, same size or slightly smaller): "Universal
for Claude, Gemini, and ChatGPT — set it once, keep it forever" —
medium gray #5F6368 sans-serif medium weight, with "Claude", "Gemini",
and "ChatGPT" highlighted in bright blue #1A73E8.

Chinese font: PingFang SC Bold / Source Han Sans Heavy.
English font: Inter Bold / SF Pro Display Bold.
Clean, modern, bright, with generous whitespace and clear visual
hierarchy, following Google Material Design and Chrome Web Store
guidelines. Rounded canvas corners (approx. 16px radius). Export
format: 24-bit PNG or JPEG, no alpha channel.
```

---

## 8. Packaging

Run from the repo root. Zip contains exactly 9 runtime files — nothing else.
The `lib/pure.js` shared helpers must ship alongside `content.js` because
the manifest's `content_scripts.js` array loads them in order.

```bash
rm -f AIToolbox-<version>.zip
zip -r AIToolbox-<version>.zip \
  manifest.json content.js popup.html popup.js \
  lib/pure.js \
  icon16.png icon32.png icon48.png icon128.png
```

Verify contents:
```bash
unzip -l AIToolbox-<version>.zip
```

Expected output: 9 entries, total ~60KB. If anything else appears (`.claude/`,
`Icon.png`, `scripts/`, `.DS_Store`, `tests/`, `package.json`,
`node_modules/`) re-run the command above with the explicit file list —
**never** `zip -r * `.

### Pre-package check
Before zipping, run the test suite:
```bash
npm test
```
All tests must pass green. Failures are blocking — do not ship.

---

## 9. Other Listing Fields

| Field | Value |
|---|---|
| Category | Productivity |
| Support site | GitHub repo URL |
| Homepage | `https://github.com/Toyzcool/AIToolbox` |
| Languages | Default: English. Add Chinese (zh_CN) after first approval unlocks it. |

---

## 10. Post-Submit Notes

- Extensions with host permissions trigger in-depth review → expect 3–7 business days.
- If rejected, the dashboard lists the exact reason. Most common: permission justification too vague, privacy policy mismatch, screenshot privacy leak (real names/emails visible).
- Updates to listing text or screenshots usually re-review in <24h; code updates run the full review pipeline.
