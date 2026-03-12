# Automating TikTok Video Upload & Scheduling with Playwright

I spent several hours inside TikTok Studio's developer console, inspecting elements, tracing event listeners, clicking through calendar widgets, and reverse-engineering the DOM structure that powers TikTok's desktop upload page. The result is a complete, step-by-step blueprint for automating the entire TikTok video upload and scheduling workflow — from handling first-time user modals to navigating date pickers, setting visibility, and verifying content check statuses.

This isn't a polished library with a clean API. It's the raw output of a research session: DOM queries tested one by one in the browser console, then documented in the order they need to execute. Every selector, every click, every edge case was discovered through trial and error. The value here isn't just the code — it's the **map of TikTok Studio's DOM structure** that makes programmatic automation possible.

If you've ever wanted to schedule TikTok posts programmatically — whether for content management, batch uploading, or building your own social media scheduler — this article gives you the complete picture, from first principles to the final post button.

---

## Table of Contents

- [Why Automate TikTok Uploads?](#why-automate-tiktok-uploads)
- [TikTok Studio: The Desktop Upload Interface](#tiktok-studio-the-desktop-upload-interface)
- [The Automation Approach: DOM Manipulation + Playwright](#the-automation-approach-dom-manipulation--playwright)
- [Understanding the DOM: Why Selectors Matter](#understanding-the-dom-why-selectors-matter)
- [TikTok's Scheduling Rules and Constraints](#tiktoks-scheduling-rules-and-constraints)
- [The Complete Upload Workflow](#the-complete-upload-workflow)
- [Step 1: Handling the Content Checking Modal](#step-1-handling-the-content-checking-modal)
- [Step 2: Uploading the Video File](#step-2-uploading-the-video-file)
- [Step 3: Detecting Upload Completion](#step-3-detecting-upload-completion)
- [Step 4: Setting the Caption and Hashtags](#step-4-setting-the-caption-and-hashtags)
- [Step 5: Activating the Schedule Option](#step-5-activating-the-schedule-option)
- [Step 6: Handling the Schedule Permission Modal](#step-6-handling-the-schedule-permission-modal)
- [Step 7: Setting the Time (Hour and Minute)](#step-7-setting-the-time-hour-and-minute)
- [Step 8: Setting the Date (Calendar Navigation)](#step-8-setting-the-date-calendar-navigation)
- [Step 9: Setting Video Visibility](#step-9-setting-video-visibility)
- [Step 10: Clicking Post/Schedule and Verifying the Result](#step-10-clicking-postschedule-and-verifying-the-result)
- [Step 11: Copyright Check Verification](#step-11-copyright-check-verification)
- [Step 12: Content Check State Machine](#step-12-content-check-state-machine)
- [Step 13: Handling Warning Modals](#step-13-handling-warning-modals)
- [The Dual-Layer Architecture: Console vs Playwright](#the-dual-layer-architecture-console-vs-playwright)
- [Factors That Affect Automation Reliability](#factors-that-affect-automation-reliability)
- [Edge Cases and Failure Modes](#edge-cases-and-failure-modes)
- [Limitations of This Approach](#limitations-of-this-approach)
- [Translating to a Full Playwright Script](#translating-to-a-full-playwright-script)
- [Ethical and Legal Considerations](#ethical-and-legal-considerations)
- [Final Thoughts](#final-thoughts)
- [References](#references)

---

## Why Automate TikTok Uploads?

TikTok's web interface — **TikTok Studio** (formerly TikTok Creator Center) — allows creators to upload videos, set captions, configure visibility, and schedule posts from a desktop browser. For a single upload, this works fine. But for content creators, marketing teams, or anyone managing multiple accounts or batch-uploading content, the manual process becomes a bottleneck.

Consider these real-world scenarios:

- **Batch scheduling** — You have 30 videos ready and want to schedule them across the next two weeks at optimal posting times. Doing this manually means navigating the same upload form 30 times.
- **Multi-account management** — You manage content for 5 different TikTok accounts. Each account needs its own upload session with separate login credentials.
- **Programmatic workflows** — You want to integrate TikTok posting into an existing content pipeline — perhaps triggered by a CMS, a cron job, or an API call from another service.
- **A/B testing** — You want to upload the same video with different captions, hashtags, or posting times to test engagement patterns.

TikTok does **not provide a public API** for uploading or scheduling content. The official TikTok API (TikTok for Developers) focuses on login, content display, and analytics — not content creation. This means browser automation is currently the **only programmatic path** to uploading and scheduling TikTok videos.

---

## TikTok Studio: The Desktop Upload Interface

TikTok Studio is the web-based dashboard available at `https://www.tiktok.com/tiktokstudio/upload`. It provides a full-featured upload interface that includes:

- **Video file upload** — Drag-and-drop or file picker for video files.
- **Caption editor** — A rich text `contenteditable` field that supports text, hashtags, and mentions.
- **Scheduling** — A date/time picker for scheduling posts up to one month in the future.
- **Visibility controls** — Dropdown for setting the video's audience: Everyone (public), Friends, or Only You (private).
- **Content checks** — An automated system that scans the video for Community Guidelines violations before posting.
- **Copyright checks** — An automated system that scans the video's audio for copyrighted music.

The interface is built with a modern React-based frontend. Components use CSS class names that include unique hashes (e.g., `class*="common-modal-footer"`) and a design system called **TUX** (TikTok UX). Understanding this structure is critical for building reliable selectors.

### TUX Component Library

TikTok's upload page uses an internal component library that appears throughout the DOM. You'll see class names like:

- `TUXText` — Text/span components
- `TUXTextInputCore-input` — Input fields
- `TUXButton` — Button components

These class name patterns are relatively stable across minor UI updates because they're tied to the component library's naming convention, not to randomly generated CSS module hashes. However, the hashed portions of class names (like `common-modal-footer-abc123`) **do change** across deployments. This is why the code uses **partial class matching** (`class*="..."`) rather than exact class matching (`class="..."`).

---

## The Automation Approach: DOM Manipulation + Playwright

The experiment uses a **two-layer approach**:

1. **Browser console (DOM manipulation)** — Direct JavaScript executed in the browser's developer console to identify and interact with page elements. This is the research/discovery phase where each DOM query is tested interactively.

2. **Playwright API** — A browser automation framework that can programmatically control a browser instance. Once the DOM structure is mapped via the console, the interactions are translated into Playwright commands for reproducible, headless automation.

### Why Playwright?

[Playwright](https://playwright.dev/) is a browser automation framework developed by Microsoft that supports Chromium, Firefox, and WebKit. It's the preferred tool for this kind of automation because:

- **It controls a real browser** — TikTok's frontend uses modern JavaScript features, WebSocket connections, and dynamic rendering that simple HTTP requests can't replicate. Playwright launches an actual browser instance.
- **File upload support** — Playwright provides `set_input_files()` for programmatic file uploads, which simulates the native file picker without requiring GUI interaction.
- **Wait mechanisms** — Playwright has built-in `wait_for_selector`, `wait_for_load_state`, and other waiting primitives that handle TikTok's asynchronous loading patterns.
- **Cross-browser support** — While TikTok Studio works best in Chromium, Playwright supports Firefox and WebKit as fallbacks.
- **Python and Node.js bindings** — The code comments reference Python-style syntax (`page.locator`, `await`), suggesting the final implementation targets Playwright for Python (`playwright-python`).

### Why Not Selenium?

Selenium is the older, more widely known browser automation tool. However, Playwright offers several advantages for this use case:

- **Auto-wait** — Playwright automatically waits for elements to be actionable before interacting with them. Selenium requires explicit waits.
- **Better handling of modern web apps** — Playwright handles shadow DOM, iframes, and dynamic content more reliably.
- **Faster execution** — Playwright uses the Chrome DevTools Protocol (CDP) directly, while Selenium uses the WebDriver protocol, which adds overhead.
- **Built-in file upload** — Playwright's `set_input_files()` works directly with the file input element, bypassing OS-level file dialogs.

---

## Understanding the DOM: Why Selectors Matter

Before diving into the workflow, it's important to understand why DOM selector strategy is critical for automation reliability.

### The Problem with Modern Frontend Selectors

TikTok's frontend uses **CSS Modules** or a similar CSS-in-JS solution that generates unique, hashed class names at build time. For example, a modal footer might have a class like:

```
common-modal-footer-3f8a2b1
```

The `common-modal-footer` part is the human-readable component name. The `3f8a2b1` part is a hash generated during the build process. **The hash changes every time TikTok deploys a new frontend build.** This means exact class selectors like `document.querySelector('.common-modal-footer-3f8a2b1')` would break after every deployment.

### The Solution: Partial Class Matching

The code consistently uses CSS **partial attribute selectors** to match only the stable part of the class name:

```javascript
// Partial match — survives deployments
document.querySelector('div[class*="common-modal-footer"]');

// Exact match — breaks on next deployment
document.querySelector("div.common-modal-footer-3f8a2b1");
```

The `class*="common-modal-footer"` selector matches any element whose class attribute **contains** the substring `"common-modal-footer"`. This is resilient to hash changes because the human-readable prefix remains stable across builds.

### Selector Strategy Hierarchy

The code uses several selector strategies, ranked from most to least reliable:

| Strategy             | Example                                                 | Reliability | Used For                                               |
| -------------------- | ------------------------------------------------------- | :---------: | ------------------------------------------------------ |
| Data attributes      | `button[data-e2e="post_video_button"]`                  |   Highest   | Post button (TikTok explicitly marks this for testing) |
| Partial class match  | `div[class*="common-modal-footer"]`                     |    High     | Modals, containers, wrappers                           |
| Element + class      | `input[class='TUXTextInputCore-input']`                 |    High     | TUX component inputs                                   |
| Tag + content filter | `Array.from(el.querySelectorAll("button")).filter(...)` |   Medium    | Buttons identified by text content                     |
| Structural class     | `.calendar-wrapper`, `.month-title`, `.arrow`           |   Medium    | Calendar components                                    |
| Content-based filter | `.filter(i => i.textContent === "Schedule")`            | Low-Medium  | Elements with no stable selector                       |

The most reliable selector in the entire codebase is `button[data-e2e="post_video_button"]` — the `data-e2e` attribute is explicitly added by TikTok's developers for their own end-to-end tests, making it extremely unlikely to change across deployments.

---

## TikTok's Scheduling Rules and Constraints

Before building the automation, it's essential to understand TikTok's scheduling constraints. The code documents three rules at the top:

```javascript
/**
 * TIKTOK SCHEDULE RULES:
 * minimum: 15 minute future
 * maximum: 1 month future
 * daily upload: depend the account quality
 */
```

### Minimum Scheduling Window: 15 Minutes

You cannot schedule a video less than **15 minutes** into the future. If you attempt to schedule a video for 10 minutes from now, TikTok will reject the scheduling. This constraint exists because TikTok needs processing time — even after upload, the video goes through encoding, content scanning, and distribution preparation.

**Cause and effect:** If your automation sets a time less than 15 minutes in the future, the schedule submission will either silently fail or produce an error toast. Your automation must calculate the target time as `now + at least 15 minutes` and validate this before interacting with the time picker.

**What would happen if you try to schedule exactly 15 minutes from now?** It would work, but it's risky. Network latency between setting the time and clicking "Schedule" could push the effective time below the 15-minute threshold. A safer buffer is **20-30 minutes** into the future.

### Maximum Scheduling Window: 1 Month

You cannot schedule a video more than **one month** (approximately 30-31 days) into the future. The calendar picker will not allow selecting dates beyond this range.

**Cause and effect:** If your automation navigates the calendar more than one month forward, the forward arrow will either become disabled or the available dates will not include the target day. Your automation must validate that the target date is within the one-month window before attempting calendar navigation, otherwise it could get stuck in an infinite loop clicking the forward arrow.

### Daily Upload Limit: Account-Dependent

TikTok imposes a **daily upload limit** that varies based on account quality, age, and activity. New accounts might be limited to 1-3 uploads per day, while established accounts may have limits of 10 or more. This limit is not publicly documented and can change without notice.

**Cause and effect:** If your automation exceeds the daily limit, the post/schedule action will fail. TikTok displays a toast message indicating the limit has been reached. The code explicitly checks for this condition in the toast verification step (Step 10). If this limit is hit mid-batch, the automation must stop, wait until the next day, and resume.

---

## The Complete Upload Workflow

The entire workflow follows a linear sequence of 13 steps. Each step must complete before the next one begins, because each step depends on UI state created by the previous step. Here's the high-level overview before we dive deep into each step:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TikTok Upload Workflow                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [1] Handle content checking modal (first-time users only)          │
│   │                                                                 │
│   ▼                                                                 │
│  [2] Upload video file via Playwright file input                    │
│   │                                                                 │
│   ▼                                                                 │
│  [3] Wait for upload completion indicator                           │
│   │                                                                 │
│   ▼                                                                 │
│  [4] Enter caption / description / hashtags                         │
│   │                                                                 │
│   ▼                                                                 │
│  [5] Click "Schedule" to switch from immediate post to scheduled    │
│   │                                                                 │
│   ▼                                                                 │
│  [6] Handle schedule permission modal (first-time users only)       │
│   │                                                                 │
│   ▼                                                                 │
│  [7] Set time: select hour and minute from time picker              │
│   │                                                                 │
│   ▼                                                                 │
│  [8] Set date: navigate calendar and select target day              │
│   │                                                                 │
│   ▼                                                                 │
│  [9] Set visibility: Everyone / Friends / Only You                  │
│   │                                                                 │
│   ▼                                                                 │
│  [10] Click Post/Schedule and verify toast message                  │
│   │                                                                 │
│   ▼                                                                 │
│  [11] Verify copyright check status                                 │
│   │                                                                 │
│   ▼                                                                 │
│  [12] Wait for and evaluate content check status                    │
│   │                                                                 │
│   ▼                                                                 │
│  [13] Handle warning modal if content check returns warnings        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Each step is a distinct DOM interaction with its own selectors, edge cases, and failure modes. Let's examine each one in detail.

---

## Step 1: Handling the Content Checking Modal

```javascript
const modalFooter = document.querySelector('div[class*="common-modal-footer"]');
if (modalFooter) {
  const turnOnBtn = Array.from(modalFooter.querySelectorAll("button")).filter(
    (i) => i.textContent.toLowerCase() == "turn on",
  )[0];
  if (turnOnBtn) {
    turnOnBtn.click();
  }
}
```

### What This Does

When a **new user** opens the TikTok Studio upload page for the **first time**, TikTok displays a modal dialog asking whether the user wants to enable **automatic content checking**. This is TikTok's system that pre-scans uploaded videos for Community Guidelines violations before they're published. The modal has a "Turn on" button and typically a "Not now" or dismiss option.

### Line-by-Line Cause and Effect

1. **`document.querySelector('div[class*="common-modal-footer"]')`** — Searches for any `<div>` element whose class attribute contains the substring `"common-modal-footer"`. This targets the footer area of TikTok's modal component, which contains the action buttons. The `class*=` partial match is used because TikTok's CSS modules append a unique hash to the class name (e.g., `common-modal-footer-a3b2c1`), and that hash changes across deployments. By matching only the stable prefix, this selector survives frontend updates.

   **If `modalFooter` is `null`:** This means either (a) the user has already seen and dismissed this modal in a previous session, or (b) the modal hasn't loaded yet. In case (a), the `if` block is skipped entirely and the workflow proceeds to the next step. In case (b), Playwright should use `wait_for_selector` with a timeout to wait for the modal to appear, and proceed without it if the timeout expires.

2. **`Array.from(modalFooter.querySelectorAll("button"))`** — Finds all `<button>` elements inside the modal footer and converts the `NodeList` to a standard `Array`. The conversion is necessary because `NodeList` doesn't support `Array.prototype.filter()` in all environments. The modal footer typically contains two buttons: "Turn on" and "Not now" (or similar). Since these buttons don't have unique `data-*` attributes or stable class names, the code identifies them by their **text content**.

3. **`.filter((i) => i.textContent.toLowerCase() == "turn on")[0]`** — Filters the buttons to find the one whose text content is "turn on" (case-insensitive). The `[0]` extracts the first (and presumably only) matching button. If no button matches — perhaps because TikTok changed the button text from "Turn on" to "Enable" — the result is `undefined`, and the subsequent `if (turnOnBtn)` check prevents a crash.

   **Why `toLowerCase()`?** TikTok's UI might render button text with different capitalizations depending on the locale or A/B test variant. Comparing in lowercase makes the match more resilient. However, this only covers capitalization differences — if TikTok changes the text entirely (e.g., "Activate"), the filter would fail silently.

4. **`turnOnBtn.click()`** — Programmatically clicks the "Turn on" button. This simulates a user click, triggering TikTok's event handlers which dismiss the modal and enable automatic content checking for the account. After this click, the modal disappears and the upload form becomes fully interactive.

### Why "Turn On" Is Chosen Over "Not Now"

The code opts to **turn on** content checking rather than dismiss it. This is a deliberate design choice:

- **Content checking provides feedback.** Once enabled, the upload page shows a status indicator (ready → checking → success/warn/error) that the automation can use to verify the video won't be flagged after posting. This is valuable for automated workflows that need to know whether a video is "safe" before scheduling it.
- **TikTok may require it.** Some accounts or regions may not allow posting without content checking enabled. Turning it on preemptively avoids potential blockers later in the workflow.
- **The modal won't appear again.** Once "Turn on" is clicked, TikTok remembers the preference for the account. Subsequent uploads won't show this modal, so the `if (modalFooter)` check will simply pass through.

### What Would Happen If This Modal Were Ignored

If the modal is present but not dismissed (neither "Turn on" nor "Not now" is clicked), it **blocks interaction** with the upload form behind it. Any attempt to interact with the file input, caption field, or other elements would fail because the modal overlay captures all click events. The automation would hang waiting for selectors that are visually present but not interactable.

---

## Step 2: Uploading the Video File

```javascript
file_input = page.locator("//input[@type='file']");
await file_input.set_input_files("sample.mp4");
```

### What This Does

This step locates the hidden file input element on the upload page and programmatically sets the file to be uploaded. This is purely a **Playwright API interaction** — it cannot be done from the browser console because the file input requires a real file path from the filesystem, which JavaScript in the browser sandbox cannot access.

### Line-by-Line Cause and Effect

1. **`page.locator("//input[@type='file']")`** — Uses an **XPath selector** to find an `<input>` element with `type="file"`. On TikTok's upload page, there is a hidden file input element that the drag-and-drop zone and "Select file" button both delegate to. The element is hidden via CSS (`display: none` or `opacity: 0`) because TikTok uses a custom-styled upload area rather than the browser's native file picker.

   **Why XPath instead of CSS?** This is a style preference from the original experiment. The equivalent CSS selector would be `input[type='file']`. Both work identically. XPath is sometimes preferred when navigating complex DOM hierarchies (e.g., selecting parent elements or using text-based queries), but for simple attribute matching, CSS selectors are more performant.

2. **`await file_input.set_input_files("sample.mp4")`** — This is a Playwright-specific method that **bypasses the native file dialog** entirely. Instead of simulating a click on the file input (which would open the OS file picker — something automation tools can't interact with), `set_input_files` directly sets the file input's value to the specified file path. Playwright handles the file reading, MIME type detection, and `change` event firing internally.

   **Cause:** Once the file is set, TikTok's JavaScript event handler on the file input fires (typically a `change` or `input` event). This triggers TikTok's upload pipeline: the file is read into memory, chunked, and streamed to TikTok's servers via XHR/Fetch requests.

   **Effect:** The upload begins immediately. The upload progress is shown in the UI (a progress bar or percentage). The upload time depends on file size and network speed. For a typical 1-minute TikTok video (~20-50MB), upload takes anywhere from 5 seconds to several minutes depending on the connection.

### File Validation Considerations

TikTok enforces several file constraints that your automation should validate **before** calling `set_input_files`:

| Constraint     | Limit                      | What Happens If Violated                    |
| -------------- | -------------------------- | ------------------------------------------- |
| File format    | MP4, WebM, MOV             | Upload is rejected with an error message    |
| File size      | Max ~10GB (varies)         | Upload fails or is extremely slow           |
| Video duration | Min 1s, Max 60min (varies) | Error after upload completes                |
| Resolution     | Min 720x720 recommended    | Video may be low quality but still accepted |
| Codec          | H.264 recommended          | Some codecs may fail processing             |

**What would happen if `set_input_files` is called with a non-video file (e.g., a `.txt` file)?** TikTok's frontend validates the file type after the `change` event fires. The upload would either be rejected immediately (with a UI error) or fail during server-side processing. The automation would need to handle this error state.

**What would happen if `set_input_files` is called while a previous upload is still in progress?** TikTok's behavior is undefined in this case. It might replace the current upload, queue the new file, or produce an error. The safe approach is to always wait for the current upload to complete (Step 3) before attempting another upload.

---

## Step 3: Detecting Upload Completion

```javascript
const uploaded = [...document.querySelectorAll('span[class*="TUXText"]')].filter((i) =>
  i.textContent.startsWith("Uploaded"),
);
if (uploaded.length !== 0) {
  uploaded = true;
}
```

### What This Does

After a file is uploaded via Step 2, TikTok processes the video and eventually displays a status message indicating the upload is complete. This step polls for that status message by searching for a `TUXText` span element whose text starts with "Uploaded".

### Line-by-Line Cause and Effect

1. **`document.querySelectorAll('span[class*="TUXText"]')`** — Selects all `<span>` elements whose class contains `"TUXText"`. The `TUXText` class is part of TikTok's internal component library (TUX) and is used for all text rendering. There are likely **dozens** of `TUXText` elements on the page — every label, heading, description, and button text is rendered through this component. The selector returns all of them, which is then filtered down.

2. **`[...document.querySelectorAll(...)]`** — The spread operator converts the `NodeList` to an `Array`, enabling the use of `.filter()`.

3. **`.filter((i) => i.textContent.startsWith("Uploaded"))`** — Filters the array to find spans whose text content begins with `"Uploaded"`. The typical text is something like `"Uploaded"` or `"Uploaded successfully"`. Using `startsWith` rather than exact equality makes the check resilient to minor text changes (e.g., if TikTok adds a checkmark or timestamp after "Uploaded").

4. **`if (uploaded.length !== 0) { uploaded = true; }`** — If at least one matching element is found, the upload is considered complete. The variable is reassigned to `true` as a boolean flag.

### Timing and Polling Considerations

This code snippet represents a **point-in-time check**. In a real automation, this check needs to be **polled repeatedly** until it succeeds or a timeout is reached. In Playwright, this would be implemented as:

```python
# Playwright (Python) equivalent
await page.wait_for_selector(
    'span:has-text("Uploaded")',
    timeout=120000  # 2 minutes max wait
)
```

**Why 2 minutes?** Large video files (100MB+) can take over a minute to upload on moderate internet connections. The timeout should be generous enough to accommodate slow uploads without hanging indefinitely.

**What would happen if the upload fails?** TikTok displays an error message instead of "Uploaded". The automation should also check for error states — for example, checking for spans containing "Upload failed" or "Network error". If an error is detected, the automation should retry the upload or abort gracefully.

**What would happen if the page is refreshed during upload?** The upload is lost. TikTok doesn't persist upload progress — refreshing the page resets the form. The automation must avoid any action that triggers a page navigation during the upload phase.

---

## Step 4: Setting the Caption and Hashtags

```javascript
locators = page.locator("//div[@contenteditable='true']").first;
page.keyboard.type(char, (delay = 50));
page.keyboard.press("Enter");
```

### What This Does

After the video is uploaded, the automation enters the **caption text** (description, hashtags, mentions) into TikTok's rich text editor. This is more complex than typing into a standard `<input>` field because TikTok uses a `contenteditable` div — a rich text editing surface that supports formatted text, hashtag autocompletion, and mention suggestions.

### Line-by-Line Cause and Effect

1. **`page.locator("//div[@contenteditable='true']").first`** — Locates the first `<div>` element with the `contenteditable="true"` attribute. The `contenteditable` attribute is an HTML standard that turns any element into a WYSIWYG text editor. TikTok's caption field is a `contenteditable` div rather than a standard `<input>` or `<textarea>` because it needs to support rich formatting — hashtags are rendered as styled badges, mentions trigger dropdown suggestions, and emojis are displayed inline.

   **Why `.first`?** There might be multiple `contenteditable` divs on the page (e.g., for different form fields or nested editors). `.first` ensures we target the primary caption field, which is the first one in DOM order.

2. **`page.keyboard.type(char, (delay = 50))`** — Types the caption text character by character with a 50ms delay between keystrokes. This simulates human typing behavior.

   **Why character-by-character with a delay?** There are two reasons:
   - **Hashtag autocompletion trigger.** When the user types `#`, TikTok's JavaScript listens for the `#` character and opens a suggestion dropdown showing matching hashtags. If the entire caption is pasted instantly (e.g., via `element.textContent = "..."` or `clipboard.paste()`), TikTok's event handlers might not fire, and hashtags won't be recognized as clickable tags. Typing character by character ensures each keystroke triggers the appropriate event handlers (`keydown`, `input`, `keyup`, `compositionend`).

   - **Rate limiting and bot detection.** Typing at inhuman speed (instantaneous paste) might trigger TikTok's anti-bot detection heuristics. A 50ms delay per character (~20 characters per second) is fast enough to be efficient but slow enough to appear human-like.

3. **`page.keyboard.press("Enter")`** — Presses the Enter key after the caption is typed. The purpose depends on context:
   - **After a hashtag:** Pressing Enter confirms the hashtag selection from the autocompletion dropdown. Without this, the hashtag might not be "committed" as a tag — it would remain as plain text.
   - **After the full caption:** Pressing Enter might add a line break, which may or may not be desired. In practice, the Enter press is typically used after each hashtag to confirm it.

### The `contenteditable` Challenge

Working with `contenteditable` elements is one of the most frustrating aspects of DOM automation. Unlike standard form inputs:

- **`element.value` doesn't work** — `contenteditable` divs don't have a `.value` property. Their content is accessed via `.innerHTML`, `.textContent`, or `.innerText`.
- **Setting content directly doesn't trigger events** — If you set `element.textContent = "Hello #viral"`, TikTok's React state won't update because no input events are fired. The form will appear to have a caption, but the internal state will be empty, and the post will fail.
- **Paste behavior varies** — Using `document.execCommand('insertText', false, 'text')` works in some browsers but is deprecated. Playwright's `keyboard.type()` is the most reliable approach.
- **Hashtag rendering** — TikTok transforms `#hashtag` text into a styled span element. This transformation happens asynchronously after the `#` character and subsequent text are typed. The automation must wait for this transformation before typing the next hashtag.

### What Would Happen If Hashtags Were Pasted Instead of Typed

If the entire caption (including hashtags) were pasted via clipboard:

```javascript
// This would likely NOT work correctly
await page.locator("//div[@contenteditable='true']").first.fill("#viral #fyp My caption");
```

TikTok's hashtag recognition system likely wouldn't activate because `fill()` replaces the content without firing the individual keystroke events that trigger the `#` character detection. The hashtags would appear as plain text, not as linked tags. They might still work when posted (TikTok server-side might parse them), but the UI would look incorrect and the behavior is unreliable.

---

## Step 5: Activating the Schedule Option

```javascript
var s = [...document.querySelectorAll("span")].filter((i) => i.textContent == "Schedule")[0];
s.click();
```

### What This Does

By default, the upload page is set to **publish immediately** when the post button is clicked. To schedule the video for a future time, you must first click the "Schedule" option, which reveals the date and time picker controls.

### Line-by-Line Cause and Effect

1. **`[...document.querySelectorAll("span")]`** — Selects **every `<span>` element** on the entire page and converts the `NodeList` to an array. This is a broad, potentially expensive query — on a complex page like TikTok Studio, there could be hundreds or even thousands of `<span>` elements.

2. **`.filter((i) => i.textContent == "Schedule")`** — Filters the array to find the span(s) whose text is exactly `"Schedule"`. Note the use of strict equality (`==`) rather than `startsWith` or `includes` — this is because "Schedule" is a common word that might appear in other contexts (e.g., "Schedule your video for later" in a help tooltip). Exact matching reduces false positives.

   **Why not use a more specific selector?** The "Schedule" option is typically rendered as a radio button label or toggle switch. Its parent container might have a specific class, but during the console research phase, the simplest reliable identifier was the text content itself. In a production Playwright script, you'd refine this to something like:

   ```python
   page.get_by_text("Schedule", exact=True).click()
   ```

3. **`[0]`** — Takes the first matching span. If multiple spans contain exactly "Schedule" (unlikely but possible), this takes the first one in DOM order, which is typically the correct one.

4. **`s.click()`** — Clicks the "Schedule" span element. This triggers a state change in TikTok's React component:

   **Before click:** The upload form shows a "Post" button and no date/time controls.
   **After click:** The form reveals date and time input fields, and the "Post" button changes to "Schedule". The page's internal state transitions from "immediate publish" mode to "scheduled publish" mode.

   **Cause and effect chain:** Clicking the "Schedule" span dispatches a click event → TikTok's React event handler catches it → React state is updated (e.g., `isScheduled: true`) → React re-renders the form → Date/time picker components are mounted into the DOM → The components become queryable via `document.querySelector`.

### Timing Dependency

After clicking "Schedule", the date/time picker elements are **dynamically rendered** — they don't exist in the DOM until the click event triggers their React component to mount. Any attempt to query for the time/date inputs (Step 7/8) before this rendering completes will return `null`.

**In Playwright:** Use `wait_for_selector` to wait for the time/date input to appear after clicking Schedule:

```python
await page.get_by_text("Schedule", exact=True).click()
await page.wait_for_selector("input[class='TUXTextInputCore-input']")
```

---

## Step 6: Handling the Schedule Permission Modal

```javascript
const scheduleModal = document.querySelector('div[class*="common-modal-footer"]');
if (scheduleModal) {
  const allowScheduleBtn = Array.from(scheduleModal.querySelectorAll("button")).filter(
    (i) => i.textContent.toLowerCase() == "allow",
  )[0];
  if (scheduleModal) {
    allowScheduleBtn.click();
  }
}
```

### What This Does

Similar to Step 1, **first-time users** who click "Schedule" for the first time encounter a **permission modal** asking them to allow TikTok to schedule videos on their behalf. This modal has an "Allow" button that must be clicked to proceed.

### Line-by-Line Cause and Effect

1. **`document.querySelector('div[class*="common-modal-footer"]')`** — Uses the same partial class match as Step 1 to find a modal footer. Note that this is the **same selector** as Step 1. This works because Step 1's modal has already been dismissed — only one modal is visible at a time.

   **Potential issue:** If TikTok shows the content checking modal (Step 1) and the schedule permission modal (Step 6) in the same session without a page refresh, and Step 1's modal was somehow not dismissed, this query would match Step 1's modal footer instead of Step 6's. The "Allow" text filter on the button would then fail (because Step 1's button says "Turn on", not "Allow"), and the automation would silently proceed without clicking anything. This is an edge case that's unlikely but worth noting.

2. **`Array.from(scheduleModal.querySelectorAll("button")).filter(...)`** — Same pattern as Step 1: find all buttons in the modal footer, then filter by text content ("allow", case-insensitive).

3. **`if (scheduleModal) { allowScheduleBtn.click(); }`** — There's a subtle bug in the original code: the `if` condition checks `scheduleModal` (the modal footer div) instead of `allowScheduleBtn` (the found button). Since `scheduleModal` is guaranteed to be truthy at this point (we're inside the outer `if (scheduleModal)` block), this condition always passes. If `allowScheduleBtn` is `undefined` (because no button with "allow" text was found), `allowScheduleBtn.click()` would throw a `TypeError: Cannot read properties of undefined (reading 'click')`.

   **The intended code was likely:**

   ```javascript
   if (allowScheduleBtn) {
     allowScheduleBtn.click();
   }
   ```

   This is a good example of the kind of bug that appears in console-tested code — it works during manual testing because the button is always present, but would fail in edge cases.

### When This Modal Does NOT Appear

This modal only appears **once per account**. After the user clicks "Allow", TikTok stores this preference server-side. On subsequent uploads, clicking "Schedule" immediately reveals the date/time picker without any modal. The `if (scheduleModal)` check correctly handles this — if no modal appears, the block is skipped entirely.

---

## Step 7: Setting the Time (Hour and Minute)

```javascript
const [eljam, tanggal] = document.querySelectorAll("input[class='TUXTextInputCore-input']");

eljam.click();

const [hour, minute] = document.querySelectorAll('div[class="tiktok-timepicker-option-list"]');
var listjam = [...hour.querySelectorAll("div")];
var listmenit = [...minute.querySelectorAll("div")];

var INPUT_JAM_USER = "03";
var INPUT_MENIT_USER = String(Math.round(parseInt("17") / 5) * 5);

listjam
  .filter((i) => i.textContent === INPUT_JAM_USER)[0]
  .querySelector("span")
  .click();

listmenit
  .filter((i) => i.textContent === "30")[0]
  .querySelector("span")
  .click();
```

### What This Does

This is one of the most intricate parts of the workflow. TikTok's time picker is a custom component — not a native `<input type="time">`. It consists of two scrollable lists: one for **hours** (00-23) and one for **minutes** (00, 05, 10, ... 55). This step opens the time picker, scrolls to the desired hour and minute, and clicks them.

### Line-by-Line Cause and Effect

1. **`document.querySelectorAll("input[class='TUXTextInputCore-input']")`** — Selects all input elements with the exact class `TUXTextInputCore-input`. After clicking "Schedule" (Step 5), two inputs appear: one for **time** and one for **date**. Note the use of **exact class matching** (`class=`) rather than partial matching (`class*=`). This works because `TUXTextInputCore-input` is a TUX component class that is consistent and not hashed.

2. **`const [eljam, tanggal] = ...`** — Destructures the two inputs into named variables. `eljam` is Indonesian for "element hour" (the time input), and `tanggal` is Indonesian for "date" (the date input). The variable naming reveals the developer's native language and adds a personal touch to the research code. The order matters: the time input comes first in DOM order, followed by the date input.

   **What would happen if the order changed in a future TikTok update?** The variables would be swapped — `eljam` would reference the date input, and `tanggal` would reference the time input. Clicking `eljam.click()` would open the calendar instead of the time picker, and subsequent time-related queries would fail. A more robust approach would query by placeholder text or aria-label rather than relying on DOM order.

3. **`eljam.click()`** — Clicking the time input opens the **time picker dropdown**. This is a custom TikTok component that renders two scrollable columns: hours and minutes.

   **Cause and effect:** The click event triggers TikTok's React state to toggle the time picker's visibility (`isTimePickerOpen: true`). React mounts the time picker component into the DOM. The `tiktok-timepicker-option-list` divs become queryable only after this rendering completes.

4. **`document.querySelectorAll('div[class="tiktok-timepicker-option-list"]')`** — After the time picker opens, this query finds the two option lists. The first list contains hours (00 through 23), and the second contains minutes (00 through 55, in increments of 5).

5. **`const [hour, minute] = ...`** — Destructures the two lists into named variables. Again, the order is based on DOM position: the hour list comes first, the minute list second.

6. **`[...hour.querySelectorAll("div")]`** — Converts all `<div>` children of the hour list into an array. Each div represents one hour option and contains a `<span>` with the hour text (e.g., "00", "01", ... "23").

### The Minute Rounding Logic

```javascript
var INPUT_MENIT_USER = String(Math.round(parseInt("17") / 5) * 5);
```

This line handles a critical constraint: **TikTok's minute picker only accepts multiples of 5**. The available minute options are: 00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55. If the user wants to schedule at minute 17, the automation must round to the nearest valid value.

**Step-by-step evaluation:**

1. `parseInt("17")` → `17` (parse string to integer)
2. `17 / 5` → `3.4`
3. `Math.round(3.4)` → `3` (rounds to nearest integer)
4. `3 * 5` → `15`
5. `String(15)` → `"15"`

So minute 17 rounds **down** to minute 15. Here's how different input minutes would resolve:

| Input Minute | Calculation    | Rounded To |
| :----------: | -------------- | :--------: |
|      0       | round(0/5)\*5  |     00     |
|      2       | round(0.4)\*5  |     00     |
|      3       | round(0.6)\*5  |     05     |
|      7       | round(1.4)\*5  |     05     |
|      8       | round(1.6)\*5  |     10     |
|      17      | round(3.4)\*5  |     15     |
|      22      | round(4.4)\*5  |     20     |
|      23      | round(4.6)\*5  |     25     |
|      58      | round(11.6)\*5 |     60     |

**Edge case bug:** If the input minute is 58, 59, or any value that rounds to 60, the result is `"60"` — which doesn't exist in the minute picker (options go up to "55"). The filter would fail to find a match, and the code would throw a `TypeError` when trying to `.querySelector("span")` on `undefined`. A robust implementation should handle this by wrapping around: if the rounded minute is 60, set minute to "00" and increment the hour by 1.

### Clicking the Hour and Minute Options

```javascript
listjam
  .filter((i) => i.textContent === INPUT_JAM_USER)[0]
  .querySelector("span")
  .click();
```

**Why `.querySelector("span").click()` instead of just `.click()` on the div?** TikTok's time picker options are structured as a `<div>` containing a `<span>`. The click event handler is likely attached to the `<span>` element (or a React event handler on the span), not the wrapping div. Clicking the div directly might not trigger the selection because the event target wouldn't match the expected element. By navigating to the inner `<span>` and clicking it, the automation fires the event on the exact element that TikTok's code listens on.

**What would happen if the target hour doesn't exist in the list?** The `.filter(...)` would return an empty array, `[0]` would be `undefined`, and `.querySelector("span")` would throw a `TypeError`. This could happen if the hour format is mismatched — for example, if `INPUT_JAM_USER` is `"3"` but the picker shows `"03"` (zero-padded). The code uses `"03"` (zero-padded), which matches TikTok's default format.

---

## Step 8: Setting the Date (Calendar Navigation)

```javascript
tanggal.click();

var TANGGAL = 23;
var BULAN = 2;
var TAHUN = 2026;

const month = {
  "01": "January",
  "02": "February",
  "03": "March",
  "04": "April",
  "05": "May",
  "06": "June",
  "07": "July",
  "08": "August",
  "09": "September",
  10: "October",
  11: "November",
  12: "December",
};

var monthstr = month[String(BULAN).padStart(2, 0)];

var calender = document.querySelector(".calendar-wrapper");
while (1) {
  var monthtitle = calender.querySelector(".month-title").textContent;
  if (monthtitle.trim() !== monthstr) {
    var [sleft, sright] = calender.querySelectorAll(".arrow");
    sright.click();
    await new Promise(resolve, setTimeout(resolve, 1000));
  } else {
    break;
  }
}

[...calender.querySelectorAll('span[class*="day"]')]
  .filter((i) => i.textContent === String(TANGGAL))[0]
  .click();
```

### What This Does

This is the most complex interaction in the entire workflow. TikTok's date picker is a **custom calendar component** with month navigation arrows. The automation must:

1. Open the calendar by clicking the date input.
2. Determine which month is currently displayed.
3. Navigate forward (clicking the right arrow) until the target month is displayed.
4. Click the target day within that month.

### Line-by-Line Cause and Effect

1. **`tanggal.click()`** — Clicks the date input field (the second `TUXTextInputCore-input` from Step 7). This opens the calendar dropdown component.

   **Cause and effect:** The click triggers React to mount the calendar component (`calendar-wrapper`). The calendar initially shows the **current month** with today's date highlighted. All calendar-related elements (`.month-title`, `.arrow`, day spans) only exist in the DOM after this click.

2. **Month mapping object** — The `month` object maps numeric month strings to full English month names. TikTok's calendar displays month names as text (e.g., "February"), but programmatic date handling uses numbers (e.g., 2). The map bridges this gap.

   **Note the inconsistency in key types:** Keys `"01"` through `"09"` are strings, but keys `10`, `11`, `12` are numbers. This works in JavaScript because object keys are always coerced to strings, so `month[10]` and `month["10"]` both resolve to `"October"`. However, `String(BULAN).padStart(2, 0)` for `BULAN = 10` produces `"10"` (a string), which correctly matches the numeric key `10` after coercion. This is an accidental correctness — the code works despite the inconsistency, but it would be cleaner to use string keys consistently.

3. **`String(BULAN).padStart(2, 0)`** — Converts the month number to a zero-padded string. `BULAN = 2` becomes `"02"`, which maps to `"February"`. The `padStart(2, 0)` ensures single-digit months get a leading zero. Note that `0` (a number) is passed instead of `"0"` (a string), but JavaScript coerces it to the string `"0"` inside `padStart`, so it works correctly.

4. **The `while(1)` loop** — This is an infinite loop that keeps clicking the forward arrow until the target month is displayed. Let's trace a specific scenario:

   **Scenario:** Current month is January 2026, target month is March 2026.
   - **Iteration 1:** `monthtitle` = "January", `monthstr` = "March" → not equal → click right arrow → wait 1 second → calendar shows February.
   - **Iteration 2:** `monthtitle` = "February", `monthstr` = "March" → not equal → click right arrow → wait 1 second → calendar shows March.
   - **Iteration 3:** `monthtitle` = "March", `monthstr` = "March" → equal → `break` → loop exits.

5. **`await new Promise(resolve, setTimeout(resolve, 1000))`** — Waits 1 second after each arrow click. This delay is necessary because the calendar animation (month transition) takes time. Without the delay, the next loop iteration would read the `monthtitle` before the transition completes, potentially reading the old month name and clicking the arrow again unnecessarily.

   **There is actually a bug in this line.** The correct syntax for a delay promise is:

   ```javascript
   await new Promise((resolve) => setTimeout(resolve, 1000));
   ```

   The original code uses `new Promise(resolve, setTimeout(resolve, 1000))`, which passes `setTimeout(resolve, 1000)` as the **second argument** to the `Promise` constructor (which is the `reject` function). The `resolve` variable would not be the Promise resolver but whatever `resolve` was in the outer scope. In a browser console with manual testing, this might coincidentally work or the delay might not actually function as intended. In a production Playwright script, this should be replaced with `await page.waitForTimeout(1000)`.

6. **Day selection** — `calender.querySelectorAll('span[class*="day"]')` finds all day spans in the calendar. These are the clickable day numbers (1-31). The filter finds the span matching the target day number, and `.click()` selects it.

### Critical Edge Cases in Calendar Navigation

**What if the target month is in the past?** The code only clicks the **right** (forward) arrow. If the calendar is showing March but the target is January, the loop would click forward indefinitely — cycling through April, May, June, and so on until it wraps around to January of the next year (if TikTok even allows navigation that far). This would take 10+ iterations and almost certainly exceed the 1-month scheduling maximum, causing the selected date to be rejected. A robust implementation should:

- Check if the target month is before the current month and click the **left** arrow instead.
- Or calculate the minimum number of forward clicks needed.

**What if the target day doesn't exist in the target month?** For example, scheduling for February 30th. The day `30` wouldn't exist in the February calendar, so the `.filter(...)` would return an empty array and `[0]` would be `undefined`, causing a crash. The automation must validate the date before attempting to set it.

**What about months with duplicate day numbers?** If the calendar displays days from the previous and next month (grayed out), the day number might appear multiple times. For example, a February calendar might show "28" from January and "28" from February. The filter `i.textContent === String(TANGGAL)` would match both. Taking `[0]` would select the first one (likely the previous month's day), which would be incorrect. A more robust selector would also check that the day span has an "active" or "current-month" class:

```javascript
.filter((i) => i.textContent === String(TANGGAL) && !i.classList.contains("disabled"))
```

**What about the year?** The code defines `TAHUN = 2026` (Indonesian for "year") but **never uses it**. The calendar navigation only matches by month name, not by year. If the target date is in February 2027 but the calendar currently shows January 2026, the code would navigate forward to February 2026 (13 clicks forward) — which is the wrong February. A production implementation must also verify the year displayed in the calendar header.

---

## Step 9: Setting Video Visibility

```javascript
document.querySelector('div[class*="view-auth-container"]').querySelector("button").click();

var visibility = {
  private: "Only you",
  public: "Everyone",
  friends: "Friends",
};

var VISIBILITY_USER = "private";

var options_visibility = document.querySelectorAll('div[class*="select-option"]');
[...options_visibility]
  .filter((i) => i.textContent.startsWith(visibility[VISIBILITY_USER]))[0]
  .click();
```

### What This Does

TikTok allows creators to set the visibility of each video. This step opens the visibility dropdown and selects the desired audience.

### Line-by-Line Cause and Effect

1. **`document.querySelector('div[class*="view-auth-container"]').querySelector("button").click()`** — Finds the visibility settings container (identified by the partial class `"view-auth-container"`) and clicks the button inside it. This button is the dropdown trigger — it displays the current visibility setting (e.g., "Everyone") and, when clicked, opens a dropdown menu with all available options.

   **Cause and effect:** Clicking the button dispatches a click event → TikTok's React handler toggles the dropdown state → React renders the dropdown options into the DOM → The `select-option` divs become queryable.

   **What would happen if `"view-auth-container"` is not found?** `querySelector` returns `null`, and `.querySelector("button")` on `null` throws a `TypeError`. This could happen if TikTok redesigns the visibility section or changes the container class name. A defensive approach would add a null check.

2. **Visibility mapping object** — Maps programmer-friendly keys (`private`, `public`, `friends`) to TikTok's display text (`"Only you"`, `"Everyone"`, `"Friends"`). This abstraction allows the automation's API to accept simple string arguments while the implementation handles the UI text matching.

3. **`document.querySelectorAll('div[class*="select-option"]')`** — After the dropdown opens, this query finds all option divs. Each option div contains text describing the visibility level and sometimes additional description text (e.g., "Everyone - Anyone on or off TikTok").

4. **`.filter((i) => i.textContent.startsWith(visibility[VISIBILITY_USER]))[0].click()`** — Filters options by text and clicks the matching one. The use of `startsWith` rather than exact equality is important because each option might contain additional descriptive text after the primary label. For example, the "Everyone" option might have text like "Everyone Anyone on or off TikTok can view this video". Using `startsWith("Everyone")` correctly matches this.

### Visibility Options and Their Implications

| Key       | Display Text | Meaning                       | Impact on Scheduling                     |
| --------- | ------------ | ----------------------------- | ---------------------------------------- |
| `public`  | "Everyone"   | Anyone can see the video      | Full distribution, For You Feed eligible |
| `friends` | "Friends"    | Only mutual followers can see | Limited distribution                     |
| `private` | "Only you"   | Only the uploader can see     | No distribution, useful for drafts       |

**What would happen if the visibility is set to "private" and the video is scheduled?** TikTok accepts this — the video will be published at the scheduled time but will only be visible to the uploader. This is useful for verifying that the scheduling mechanism works without actually publishing content to the public.

**What would happen if a new visibility option is added by TikTok (e.g., "Close Friends")?** The `visibility` map wouldn't include it, and attempting to use it would cause `visibility[VISIBILITY_USER]` to return `undefined`. The `startsWith(undefined)` call would always return `false`, so no option would match, and `[0]` would be `undefined`, causing a crash. The automation should validate that `VISIBILITY_USER` is a valid key before proceeding.

---

## Step 10: Clicking Post/Schedule and Verifying the Result

```javascript
document.querySelector('button[data-e2e="post_video_button"]').click();

let toast = document.querySelector('div[class*="Toast-content"]');
if (toast) {
  toast = toast.textContent.trim();
  if (!/video\s+published/is.test(toast) && !/video\s+has\s+been\s+uploaded/is.test(toast)) {
    // upload limit
  }
}
```

### What This Does

This is the **final action** — clicking the post/schedule button and then checking the toast notification to determine whether the submission succeeded or failed.

### Line-by-Line Cause and Effect

1. **`document.querySelector('button[data-e2e="post_video_button"]').click()`** — Clicks the post button using the most reliable selector in the entire codebase: `data-e2e="post_video_button"`. This is a **data attribute specifically placed by TikTok's developers** for their own end-to-end tests. It's extremely unlikely to change across deployments because doing so would break TikTok's own test suite.

   **Cause and effect:** Clicking this button triggers the following chain:
   - TikTok's frontend validates all form fields (caption, visibility, schedule time/date).
   - If validation passes, a POST request is sent to TikTok's backend with the video metadata and scheduling configuration.
   - The backend processes the request, validates the scheduling constraints (15-min minimum, 1-month maximum, daily limit), and either accepts or rejects the submission.
   - A **toast notification** appears at the top of the page with the result.

2. **`document.querySelector('div[class*="Toast-content"]')`** — After clicking the post button, a toast message appears briefly at the top of the page. This query finds the toast content div. The toast is a transient element — it appears for a few seconds and then automatically disappears.

   **Timing dependency:** The toast doesn't appear instantly. There's a brief delay (typically 500ms-2s) between clicking the button and the toast appearing, because TikTok needs to send the request to the server and receive a response. In Playwright, you'd need:

   ```python
   await page.wait_for_selector('div[class*="Toast-content"]', timeout=10000)
   ```

3. **Regex-based toast verification:**

   ```javascript
   !/video\s+published/is.test(toast);
   ```

   This regex checks if the toast text contains "video published" (with flexible whitespace). The `i` flag makes it case-insensitive, and the `s` flag makes `.` match newlines (though it's not needed here since `\s+` already handles whitespace).

   ```javascript
   !/video\s+has\s+been\s+uploaded/is.test(toast);
   ```

   This regex checks for the alternative success message "video has been uploaded".

   **The logic is negated (`!`)** — if the toast **does not** match either success pattern, the code enters the `// upload limit` branch. This means the toast contains an error message, most likely indicating that the daily upload limit has been reached.

### Understanding the Toast Messages

| Toast Message Pattern     | Meaning                     | Action                       |
| ------------------------- | --------------------------- | ---------------------------- |
| "Video published"         | Immediate publish succeeded | Done, proceed to next upload |
| "Video has been uploaded" | Scheduled post accepted     | Done, proceed to next upload |
| Anything else             | Error (likely upload limit) | Stop, wait, or retry         |

**What would happen if the toast disappears before the query runs?** The `querySelector` would return `null`, and the subsequent `.textContent` access would throw a `TypeError`. Toast notifications are typically shown for 3-5 seconds. If there's a significant delay between clicking the button and querying the toast, it might have already disappeared. A Playwright implementation should capture the toast immediately after it appears using an event-based approach or a short timeout.

**What would happen if no toast appears at all?** This could indicate a frontend error, a network failure, or a validation issue that prevented the request from being sent. The automation should have a timeout — if no toast appears within 10 seconds of clicking the button, treat it as a failure and log the current page state for debugging.

---

## Step 11: Copyright Check Verification

```javascript
document.querySelector('div[class*="status-success"]').querySelector("span").textContent;
```

### What This Does

Before or after posting, TikTok's upload page includes a **copyright check** status indicator. This checks whether the video's audio contains copyrighted music that might cause issues (muted audio, video takedown, or limited distribution).

### Cause and Effect

The selector `div[class*="status-success"]` finds the copyright check status div with a "success" status. The inner `<span>` contains the status text, which should be `"No issues found."` for a clean copyright check.

**What would happen if the copyright check finds issues?** The status class would be something other than `status-success` — possibly `status-warn` or `status-error`. The query would return `null`, and the code would need to handle this case. Common copyright issues include:

- **Music identified** — The video uses a copyrighted song. TikTok might allow the video but with limited distribution.
- **Claim detected** — A rights holder has claimed the audio. The video might be muted or blocked in certain regions.

The copyright check runs **asynchronously** after the video is uploaded. It might not be complete at the time this query runs. A robust implementation should wait for the status to transition from "checking" to a final state before reading the result.

---

## Step 12: Content Check State Machine

```javascript
let stat = {
  statuses: {
    "status-ready": {
      state: "ready",
      severity: "neutral",
      message: "We'll check your content for For You Feed eligibility.",
      action: null,
      retry: false,
      loading: false,
    },
    "status-checking": {
      state: "checking",
      severity: "info",
      message:
        "Checking in progress. This usually takes about 10 minutes. Longer videos may take more time.",
      action: null,
      retry: false,
      loading: true,
    },
    "status-success": {
      state: "success",
      severity: "success",
      message:
        "No issues detected. However, your video may still be removed later if it violates Community Guidelines.",
      action: null,
      retry: false,
      loading: false,
    },
    "status-warn": {
      state: "warning",
      severity: "warning",
      message:
        "Content may be restricted. You can still post, but modifying it to follow guidelines may improve visibility.",
      action: { label: "View details", type: "link" },
      retry: false,
      loading: false,
    },
    "status-error": {
      state: "error",
      severity: "error",
      message: "Something went wrong. Please try again later.",
      action: { label: "Retry", type: "button" },
      retry: true,
      loading: false,
    },
    "status-limit": {
      state: "limitReached",
      severity: "warning",
      message: "You've reached your check limit for today. Please try again tomorrow.",
      action: null,
      retry: false,
      loading: false,
    },
    "status-not-eligible": {
      state: "notEligible",
      severity: "warning",
      message:
        "This feature isn't available for government, politician, or political party accounts.",
      action: null,
      retry: false,
      loading: false,
    },
  },
};
```

### What This Does

This is a comprehensive **state machine** that documents every possible status of TikTok's content checking system. The content check is a separate process from the copyright check — it scans the video for Community Guidelines violations, including violent content, nudity, hate speech, and other policy violations.

### The State Transitions

The content check follows a linear state flow with multiple terminal states:

```
                                    ┌──────────────────┐
                                    │   status-ready    │
                                    │  "We'll check..." │
                                    └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │ status-checking   │
                                    │ "Checking in      │
                                    │  progress..."     │
                                    │  (loading: true)  │
                                    └────────┬─────────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         ▼                   ▼                   ▼
                ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
                │ status-success  │ │  status-warn    │ │  status-error   │
                │ "No issues      │ │ "Content may    │ │ "Something went │
                │  detected..."   │ │  be restricted" │ │  wrong..."      │
                │ (Terminal)      │ │ (Terminal)      │ │ (retry: true)   │
                └─────────────────┘ └─────────────────┘ └────────┬────────┘
                                                                 │
                                                                 ▼
                                                        ┌─────────────────┐
                                                        │  (Back to       │
                                                        │  status-checking│
                                                        │  on retry)      │
                                                        └─────────────────┘

  Special states (no transition from checking):

                ┌─────────────────┐       ┌─────────────────────┐
                │  status-limit   │       │ status-not-eligible  │
                │ "Check limit    │       │ "Not available for   │
                │  reached..."    │       │  government/         │
                │ (Terminal)      │       │  political accounts" │
                └─────────────────┘       │ (Terminal)           │
                                          └─────────────────────┘
```

### Detailed State Analysis

**`status-ready`** — The initial state before the check begins. The system is waiting to start scanning the video. This state appears immediately after upload completion.

- **`loading: false`** — No spinner or progress indicator.
- **`action: null`** — No user action available.
- **Automation behavior:** Wait. The check will start automatically after a brief delay.

**`status-checking`** — The check is actively running. TikTok's servers are analyzing the video frames, audio, and metadata.

- **`loading: true`** — A spinner or progress indicator is shown.
- **Duration:** The message says "usually takes about 10 minutes. Longer videos may take more time." For a 1-minute video, it might complete in 2-3 minutes. For a 10-minute video, it could take 15-20 minutes.
- **Automation behavior:** Poll periodically (every 10-30 seconds) until the status changes. Do **not** proceed with the next upload until this check completes, as a content violation might require the video to be edited and re-uploaded.

**`status-success`** — The check completed with no issues found. However, the message includes an important caveat: "your video may still be removed later if it violates Community Guidelines." This means the automated check is not definitive — TikTok may still manually review the video after publication.

- **`loading: false`**, **`retry: false`** — Terminal state.
- **Automation behavior:** Proceed with confidence. The video is likely safe.

**`status-warn`** — The check found potential issues. The video can still be posted, but visibility may be restricted (e.g., not shown on the For You Feed).

- **`action: { label: "View details", type: "link" }`** — A "View details" link is available that shows what issues were detected.
- **Automation behavior:** Depends on the use case. For automated batch uploads, you might still proceed (accepting reduced visibility). For quality-sensitive workflows, you'd flag the video for manual review.

**`status-error`** — Something went wrong with the check itself (not a content violation, but a system error).

- **`retry: true`** — The check can be retried.
- **`action: { label: "Retry", type: "button" }`** — A retry button is available.
- **Automation behavior:** Click the retry button and wait for the check to restart. If retries consistently fail, abort and log the error.

**`status-limit`** — The daily content check quota has been reached. This is a separate limit from the daily upload limit — it specifically applies to the pre-upload content scanning feature.

- **Automation behavior:** Cannot check more content today. The video can still be posted, but without the pre-publication content check.

**`status-not-eligible`** — The account type doesn't support content checking. This applies specifically to government, politician, and political party accounts, which likely have separate content review processes.

- **Automation behavior:** Skip the content check entirely. The video can still be posted.

### Detecting the Active Status

```javascript
let statusActiveKey;
let keystatus = document.querySelector('div[class*="status-result"][data-show="true"]');
if (/try\s+again\s+tomorrow/is.test(keystatus.textContent)) {
  statusActiveKey = "status-limit";
} else {
  statusActiveKey = Array.from(keystatus.classList).filter(
    (i) => i.startsWith("status") && !i.endsWith("result"),
  )[0];
}
```

**Line-by-line cause and effect:**

1. **`document.querySelector('div[class*="status-result"][data-show="true"]')`** — Finds the active status result element. TikTok uses `data-show="true"` to mark which status is currently visible. Multiple status elements might exist in the DOM (one for each possible state), but only one has `data-show="true"`.

2. **The `status-limit` vs `status-ready` disambiguation** — The code comments note that `status-ready` and `status-limit` share the same CSS class key (`"status-ready"`). This means the standard class-based detection can't distinguish between them. The workaround is clever: check the **text content** for the phrase "try again tomorrow". If it matches, the status is `status-limit`; otherwise, it's `status-ready` (or another status).

   This is an important finding from the research: TikTok reuses the same CSS class for two semantically different states, requiring a text-based heuristic to differentiate them.

3. **`Array.from(keystatus.classList).filter(...)`** — For all other statuses, the active status key is extracted from the element's class list by finding the class that starts with "status" but doesn't end with "result". This filters out the `status-result` class (which is the container class) and extracts the state-specific class (e.g., `status-success`, `status-warn`).

---

## Step 13: Handling Warning Modals

```javascript
if (statusActiveKey === "status-warn") {
  const modal_warning = document.querySelector('div[class*="common-modal-close-icon"]');
  if (modal_warning) {
    modal_warning.click();
    return true;
  }
}
```

### What This Does

When the content check returns a `status-warn` result, TikTok sometimes displays a **warning modal** with additional details about the detected issues. This modal must be dismissed before the automation can proceed with the next upload or action.

### Cause and Effect

1. **`statusActiveKey === "status-warn"`** — Only triggers for warning statuses. Success, error, and limit statuses don't produce modals.

2. **`document.querySelector('div[class*="common-modal-close-icon"]')`** — Finds the modal's close button (the "X" icon in the corner). This uses the same modal component as Steps 1 and 6, but targets the close icon rather than a specific button in the footer.

3. **`modal_warning.click()`** — Dismisses the modal. The code includes a 2-3 second wait (noted in the comment) before checking for the modal, because the modal doesn't appear instantaneously — there's a brief delay between the status changing to `status-warn` and the modal rendering.

4. **`return true`** — Returns `true` to signal to the calling code that the warning was handled. In a full automation framework, this return value would indicate "warning occurred but was dismissed — the video was still posted."

### The Warning Modal's Timing

The comment "wait 2-3s and then close it!" is critical. The modal animation (fade-in, slide-in) takes time. If the automation tries to close the modal before it's fully rendered, the click might miss the close button or hit a transparent overlay that doesn't respond to clicks. A Playwright implementation should wait for the modal to be visible:

```python
await page.wait_for_selector('div[class*="common-modal-close-icon"]', state="visible")
await page.click('div[class*="common-modal-close-icon"]')
```

---

## The Dual-Layer Architecture: Console vs Playwright

The code in this experiment operates across two distinct execution environments, and understanding this boundary is critical for translating the research into a working automation script.

### Browser Console (DOM Queries)

Most of the code runs in the **browser's developer console** — direct JavaScript executed within the page's context. This means:

- `document.querySelector(...)` queries the live DOM of the TikTok page.
- `element.click()` fires a synthetic click event that TikTok's React event handlers process.
- Variables are scoped to the console session and lost on page refresh.
- The code has full access to the page's JavaScript environment, including TikTok's own global variables (if any are exposed).

### Playwright API

Certain operations require **Playwright's external API** because they can't be performed from within the browser sandbox:

- **File upload** (`page.locator(...).set_input_files(...)`) — Browser JavaScript cannot access the local filesystem for security reasons. Playwright bypasses this by directly setting the file input's files property through the DevTools Protocol.
- **Keyboard simulation** (`page.keyboard.type(...)`) — While `element.dispatchEvent(new KeyboardEvent(...))` can simulate key events from the console, TikTok's `contenteditable` editor often doesn't respond to synthetic events. Playwright's keyboard simulation operates at the OS input level, producing events that are indistinguishable from real keystrokes.
- **Waiting** (`page.wait_for_selector(...)`) — The console doesn't have built-in polling/waiting primitives. Playwright provides intelligent auto-waiting that monitors DOM changes via MutationObserver internally.

### Translating Console Code to Playwright

Each console-based DOM query can be translated to Playwright using `page.evaluate()`:

```python
# Console: document.querySelector('div[class*="common-modal-footer"]')
# Playwright equivalent:
modal = await page.query_selector('div[class*="common-modal-footer"]')

# Console: Array.from(el.querySelectorAll("button")).filter(i => i.textContent.toLowerCase() == "turn on")[0]
# Playwright equivalent:
turn_on_btn = await page.evaluate('''
    const footer = document.querySelector('div[class*="common-modal-footer"]');
    if (footer) {
        const btn = Array.from(footer.querySelectorAll("button"))
            .find(i => i.textContent.toLowerCase() === "turn on");
        if (btn) btn.click();
        return true;
    }
    return false;
''')
```

Or more idiomatically in Playwright:

```python
# Using Playwright's built-in locators (preferred):
await page.locator('div[class*="common-modal-footer"] button', has_text="Turn on").click()
```

---

## Factors That Affect Automation Reliability

### TikTok Frontend Updates

TikTok deploys frontend updates **frequently** — often multiple times per week. Each deployment can:

- **Change CSS class hashes** — The random suffixes on class names change, but partial class matching (`class*=`) survives this.
- **Rename component class prefixes** — If TikTok renames `"common-modal-footer"` to `"dialog-actions"`, all selectors targeting it would break. This is rare but possible during major redesigns.
- **Restructure DOM hierarchy** — If a button moves from being a child of the modal footer to a sibling, structural queries like `.querySelector("button")` within the footer would stop finding it.
- **Change text content** — If "Turn on" becomes "Enable" or is localized to a different language, text-based filters would fail.
- **Add/remove data attributes** — If `data-e2e="post_video_button"` is removed, the most reliable selector in the codebase would break.

### Network Conditions

- **Slow uploads** — On slow connections, the upload might take several minutes. Timeouts must be generous enough to accommodate this.
- **Timeouts** — TikTok's backend might time out during processing, causing the content check to return `status-error`.
- **CDN variations** — Different CDN edges might serve slightly different frontend bundles, leading to inconsistent DOM structures across sessions.

### Account State

- **New vs established accounts** — New accounts see more modals (content checking, schedule permission) and may have stricter upload limits.
- **Region** — TikTok's features and constraints vary by region. Some features (like scheduling) might not be available in all markets.
- **Account type** — Business accounts, creator accounts, and personal accounts may have different upload interfaces.
- **Verification status** — Verified accounts might have higher upload limits or additional features.

### Anti-Bot Detection

TikTok employs various anti-automation measures:

- **Behavioral analysis** — Perfectly consistent timing between actions (exactly 50ms between keystrokes, exactly 1000ms between clicks) is a bot signal. Adding randomized delays helps: `delay = 50 + Math.random() * 30`.
- **Browser fingerprinting** — Headless browsers have detectable characteristics (missing browser plugins, specific JavaScript property values). Using `playwright.chromium.launch(headless=False)` (headed mode) or tools like `playwright-stealth` reduces detection risk.
- **CAPTCHA challenges** — TikTok may present CAPTCHAs during upload, especially from new accounts or suspicious IPs. The automation must either solve these programmatically (difficult) or pause for manual intervention.
- **Rate limiting** — Rapid successive uploads from the same account trigger rate limiting, even before the daily upload limit is reached.

---

## Edge Cases and Failure Modes

### 1. Session Expiration

TikTok sessions expire after a period of inactivity. If the automation is running batch uploads over several hours, the session might expire mid-workflow. Symptoms include:

- Redirects to the login page.
- API requests returning 401/403 errors.
- UI elements becoming unresponsive.

**Mitigation:** Check for login state before each upload cycle. If the session has expired, re-authenticate before proceeding.

### 2. Slow Internet Causing Scheduling Conflicts

If the automation sets a schedule time 15 minutes in the future but the upload takes 20 minutes, the scheduled time will be in the past by the time the form is submitted. TikTok will reject the scheduling.

**Mitigation:** Calculate the schedule time dynamically — set it to `upload_end_time + 20 minutes` rather than `script_start_time + 15 minutes`.

### 3. Calendar Month Boundary

If today is January 31st and you want to schedule for February 1st, the calendar navigation must handle the month transition. The code handles this correctly (it navigates forward until the target month matches), but the 1-second delay between clicks might not be sufficient if TikTok's calendar animation is slow.

### 4. Concurrent Tab/Window Interference

If the user (or another automation instance) opens TikTok Studio in another tab while the automation is running, TikTok's backend might invalidate the current session or produce unexpected state.

### 5. Video Processing Delays

After upload, TikTok processes the video (encoding, thumbnail generation, content scanning). This processing can take anywhere from 30 seconds to 30+ minutes depending on video length and server load. The content check (Step 12) cannot complete until processing finishes. If the automation doesn't wait long enough, it might proceed with an incomplete or inaccurate content check status.

---

## Limitations of This Approach

### 1. Fragile Selectors

Despite using partial class matching and data attributes, DOM-based automation is inherently fragile. Any TikTok frontend update could break selectors. This approach requires **ongoing maintenance** — someone must periodically verify that the selectors still work and update them when they don't.

### 2. No Official API Backing

This automation relies on reverse-engineering TikTok's frontend, which violates TikTok's Terms of Service. There's no guarantee of stability, no support, and no deprecation warnings. TikTok could change their entire upload interface overnight.

### 3. Single-Page Application Complexity

TikTok Studio is a React SPA (Single Page Application). React's virtual DOM means that:

- Elements are frequently unmounted and remounted (causing stale references).
- Event handlers are delegated to the root element (not attached directly to buttons).
- State changes trigger full subtree re-renders, which can invalidate previously queried elements.

### 4. No Batch Upload Support Built-In

The code handles a single upload workflow. Batch uploading (multiple videos) requires wrapping this workflow in a loop with page refresh/navigation between uploads. TikTok doesn't support queuing multiple uploads on the same page.

### 5. Variable Naming and Code Comments in Mixed Languages

The code uses Indonesian variable names (`eljam`, `tanggal`, `bulan`, `tahun`, `listjam`, `listmenit`) alongside English code comments. While this works functionally and reflects the developer's natural thought process during the research session, a production codebase would benefit from consistent English naming for international maintainability.

### 6. Error Handling Is Minimal

The research code uses `if` checks to guard against null elements, but doesn't implement comprehensive error handling (try/catch, retry logic, graceful degradation). A production automation would need robust error handling at every step, with logging, screenshots on failure, and automatic retry for transient errors.

---

## Translating to a Full Playwright Script

The console research code provides the DOM map. Here's how the complete workflow translates to a structured Playwright automation in Python:

```python
from playwright.async_api import async_playwright
import asyncio

async def upload_tiktok_video(
    video_path: str,
    caption: str,
    schedule_hour: str,
    schedule_minute: int,
    schedule_day: int,
    schedule_month: int,
    visibility: str = "public"
):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            storage_state="tiktok_session.json"  # pre-saved login session
        )
        page = await context.new_page()
        await page.goto("https://www.tiktok.com/tiktokstudio/upload")

        # Step 1: Handle content checking modal
        modal = await page.query_selector('div[class*="common-modal-footer"]')
        if modal:
            turn_on = await modal.query_selector('button:has-text("Turn on")')
            if turn_on:
                await turn_on.click()

        # Step 2: Upload file
        file_input = page.locator("input[type='file']")
        await file_input.set_input_files(video_path)

        # Step 3: Wait for upload completion
        await page.wait_for_selector(
            'span:has-text("Uploaded")',
            timeout=180000
        )

        # Step 4: Set caption (character by character)
        editor = page.locator("div[contenteditable='true']").first
        await editor.click()
        await page.keyboard.type(caption, delay=50)

        # Step 5: Click Schedule
        await page.get_by_text("Schedule", exact=True).click()

        # Step 6: Handle schedule permission modal
        modal = await page.query_selector('div[class*="common-modal-footer"]')
        if modal:
            allow_btn = await modal.query_selector('button:has-text("Allow")')
            if allow_btn:
                await allow_btn.click()

        # Step 7-8: Set time and date via page.evaluate()
        # ... (translate DOM interactions)

        # Step 9: Set visibility
        # ... (translate DOM interactions)

        # Step 10: Click post
        await page.click('button[data-e2e="post_video_button"]')
        toast = await page.wait_for_selector('div[class*="Toast-content"]')
        # ... verify toast

        await browser.close()
```

This skeleton shows the translation pattern: each console DOM query becomes either a Playwright locator, a `page.evaluate()` call, or a Playwright-native method. The Playwright version adds proper waiting, error handling, and session management that the console research code doesn't need.

---

## Ethical and Legal Considerations

Before building and deploying TikTok upload automation, consider the following:

### Terms of Service

TikTok's Terms of Service prohibit automated access to their platform without prior written consent. Using browser automation to upload content **may violate TikTok's ToS** and could result in account suspension or permanent ban. This article documents the technical mechanism for educational purposes — use this knowledge responsibly.

### Content Responsibility

Automating uploads doesn't absolve you of responsibility for the content being posted. All videos must comply with TikTok's Community Guidelines, local laws, and copyright regulations. Automated systems should include content validation steps (like the content check in Step 12) to catch potential violations before posting.

### Rate Limiting and Platform Health

Aggressive automation (uploading dozens of videos per hour) puts strain on TikTok's infrastructure and degrades the experience for other users. Respect the platform's rate limits and add reasonable delays between uploads (5-10 minutes minimum).

### Data Privacy

Automation scripts that handle login credentials must store them securely. Playwright's `storage_state` feature stores cookies and local storage data in a JSON file — this file should be encrypted at rest and never committed to version control.

---

## Final Thoughts

What started as several hours of poking around in the developer console produced something genuinely useful: a **complete map of TikTok Studio's upload DOM structure** that can power fully automated video scheduling. Every selector, every edge case, every modal, and every state transition is documented.

The key insight from this research isn't any single DOM query — it's the **methodology**. Modern web applications hide their complexity behind polished UIs, but underneath they're just HTML elements with classes, attributes, and event handlers. By systematically inspecting each UI interaction and documenting the corresponding DOM operations, you can automate virtually any web workflow.

But automation is only as reliable as its selectors. TikTok will update their frontend, class names will change, modals will be redesigned, and new edge cases will appear. The value of this research isn't a permanent automation script — it's the **understanding of the workflow structure** that allows you to quickly update the selectors when they inevitably break.

If you're building on this work, focus on three things:

1. **Robust waiting** — Never assume an element is present. Always wait for it with a timeout.
2. **Graceful failure** — Every DOM query can return `null`. Handle it.
3. **Regular maintenance** — Check your selectors against the live site at least monthly. When something breaks, the DOM map in this article tells you exactly where to look.

---

## References

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Playwright for Python](https://playwright.dev/python/)
- [Playwright File Upload API](https://playwright.dev/docs/input#upload-files)
- [Playwright Locators](https://playwright.dev/docs/locators)
- [MDN — contenteditable](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/contenteditable)
- [MDN — CSS Attribute Selectors](https://developer.mozilla.org/en-US/docs/Web/CSS/Attribute_selectors)
- [MDN — Document.querySelector()](https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector)
- [MDN — NodeList](https://developer.mozilla.org/en-US/docs/Web/API/NodeList)
- [MDN — MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [TikTok Studio Upload Page](https://www.tiktok.com/tiktokstudio/upload)
- [TikTok Community Guidelines](https://www.tiktok.com/community-guidelines)
- [TikTok Terms of Service](https://www.tiktok.com/legal/terms-of-service)
- [TikTok for Developers (Official API)](https://developers.tiktok.com/)
- [React Reconciliation and Virtual DOM](https://react.dev/learn/preserving-and-resetting-state)
- [CSS Modules — GitHub](https://github.com/css-modules/css-modules)
- [Playwright Stealth Plugin](https://github.com/nicedayfor/playwright-stealth)
