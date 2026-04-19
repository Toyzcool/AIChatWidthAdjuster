# Privacy Policy for AIToolbox

Last updated: April 19, 2026

## 1. Overview
AIToolbox is a Chrome extension that enhances the reading and organization
experience on ChatGPT, Claude, and Gemini. It runs entirely on the user's
own device; no data is transmitted to any server.

## 2. What We Do Not Collect
AIToolbox does not collect, transmit, sell, or share any personal
information. Specifically:

- We do not track browsing history.
- We do not read or transmit user queries or AI responses automatically.
- We do not use analytics, ad networks, or third-party trackers.
- We do not require an account, login, or contact information.

## 3. What Is Stored Locally
The following data is saved only in the browser via `chrome.storage.local`
on the user's own device:

- Chat width preferences for each supported site
- The "Code Auto Wrap" toggle state
- The bookmark panel's collapsed/expanded state
- Bookmarks the user creates, including the selected text snippet, an
  optional note, and metadata identifying which conversation/message the
  bookmark points back to

None of this data ever leaves the user's device. It is not synced across
devices and is not accessible to the extension author or any third party.

## 4. How We Access Website Content
The content script reads the visible conversation DOM on the three
supported AI chat services in the following scenarios, all initiated by
the user:

- Adjusting chat width via CSS injection (no text is read).
- Creating a bookmark: when the user clicks the "Bookmark" button that
  appears near a text selection, the selected text is stored locally as
  described above.
- Exporting a conversation: when the user clicks "Export as Markdown" or
  "Export as PDF" in the popup, the conversation content is read to
  produce the exported file, which is saved directly to the user's local
  Downloads folder or opened in the browser's print dialog.

No content is transmitted anywhere.

## 5. Permissions
- `storage`: for the local-only preferences and bookmarks listed above.
- `tabs`: to identify the active tab's site and send export commands when
  the user clicks an export button.
- Host permissions for the three AI chat services: to inject the CSS and
  content script that power the features.

## 6. Third Parties
We do not sell, trade, rent, or share any user data with any third party.

## 7. Changes
If this policy is updated, the "Last updated" date above will change.

## 8. Contact
For questions, open an issue on the project's GitHub page or contact the
developer via the Chrome Web Store listing's support link.
