# Automating Facebook Unfollow with Pure DOM JavaScript

We've all been there. You scroll through your Facebook feed and realize it's completely unrecognizable — filled with posts from random pages, strangers you followed during a meme binge at 2 AM, and accounts you don't even remember subscribing to. The thought crosses your mind: _I should just unfollow all of these and start fresh._ Then you open your Following list, see **thousands** of entries, and realize that clicking the three-dot menu, then "Unfollow," then waiting, then repeating — for each one — would take hours of mind-numbing manual work.

This article documents a quick experiment born out of exactly that frustration. After less than two hours of poking around in the browser's developer console, the result was a **27-line JavaScript snippet** that automates the entire process. Paste it into the console, let it run, and watch your Following list shrink to zero.

It's not elegant. The opening comment in the source code literally reads: _"bosss im tired as hell."_ But it works. And understanding _how_ it works — the DOM traversal, the timing, the selector strategy — is a useful exercise in browser-level automation, even for something this small.

---

## Table of Contents

- [The Problem: Death by a Thousand Follows](#the-problem-death-by-a-thousand-follows)
- [Where This Script Runs](#where-this-script-runs)
- [Understanding Facebook's Following Page DOM](#understanding-facebooks-following-page-dom)
- [The Complete Script](#the-complete-script)
- [Breaking Down the Code](#breaking-down-the-code)
  - [The IIFE Wrapper](#the-iife-wrapper)
  - [Selecting All Followed Account Links](#selecting-all-followed-account-links)
  - [Navigating to the Three-Dot Menu](#navigating-to-the-three-dot-menu)
  - [Clicking the Three-Dot Menu](#clicking-the-three-dot-menu)
  - [Finding and Clicking "Unfollow"](#finding-and-clicking-unfollow)
  - [The Parent Chain Climb](#the-parent-chain-climb)
  - [Progress Logging](#progress-logging)
  - [The 2-Second Delays](#the-2-second-delays)
- [The Execution Flow Visualized](#the-execution-flow-visualized)
- [Why the Selectors Work](#why-the-selectors-work)
- [Factors That Affect the Script](#factors-that-affect-the-script)
- [Limitations and Edge Cases](#limitations-and-edge-cases)
- [Improvements You Could Make](#improvements-you-could-make)
- [Ethical Considerations](#ethical-considerations)
- [Final Thoughts](#final-thoughts)
- [References](#references)

---

## The Problem: Death by a Thousand Follows

Facebook makes it extremely easy to follow accounts — a single click on a "Follow" button anywhere on the platform. Over months or years of casual browsing, you accumulate hundreds or thousands of followed accounts: pages, public figures, groups, meme accounts, news outlets, and people you interacted with once and never thought about again.

The problem is that Facebook provides **no bulk unfollow feature**. The only official way to unfollow an account is:

1. Navigate to your Following list (or the account's profile page).
2. Click the three-dot options menu next to the account.
3. Click "Unfollow" from the dropdown menu.
4. Repeat for every single account.

For 50 accounts, this is tedious. For 500, it's unreasonable. For 2,000+, it's effectively impossible without automation. Facebook has no incentive to make this easy — every followed account is a potential engagement source that keeps you on the platform longer.

This is where a console script comes in. If the browser can render the "Unfollow" button, JavaScript can click it.

---

## Where This Script Runs

This script is designed to run on Facebook's **Following page**, accessible at:

```bash
https://www.facebook.com/profile.php?sk=following
```

Or equivalently:

```bash
https://www.facebook.com/<your-username>/following
```

This page displays a list of all accounts (people, pages, and other entities) that you currently follow. Each entry shows the account's profile picture, name (as a link), and a three-dot menu icon for actions like "Unfollow."

**Important:** The script must be run on **this specific page**. It relies on the DOM structure of the Following list — if you run it on your News Feed, Profile, or any other page, the selectors won't match anything and the script will simply exit without doing anything.

### The Infinite Scroll Factor

Facebook's Following page uses **infinite scroll** (also called lazy loading). It doesn't load all 2,000+ followed accounts at once — it loads a batch (roughly 10-20 entries), and as you scroll down, more entries are loaded dynamically via AJAX requests. This means the script can only process the entries that are **currently loaded in the DOM** at the time it runs.

This has a direct implication for the workflow: if you follow 2,000 accounts but only 15 are loaded, the script will unfollow those 15 and finish. You'd then need to scroll down to load more entries and run the script again. This is a deliberate trade-off — attempting to scroll programmatically introduces complexity (scroll detection, debouncing, waiting for new elements) that wasn't worth the effort for a quick console experiment.

---

## Understanding Facebook's Following Page DOM

Before analyzing the code, it helps to understand the DOM structure that Facebook renders for each entry in the Following list. Facebook uses React with a heavily abstracted component system, so the DOM is deeply nested and uses semantic HTML attributes for accessibility.

Each followed account entry has a structure roughly like this:

```bash
<div> (entry container)
  ├── <div> (left section: avatar + name)
  │     ├── <a aria-hidden="true" role="link" href="/profile-url">
  │     │     └── <img> (profile picture)
  │     └── <a> (name link, visible text)
  │
  └── <div> (right section: actions)
        └── <div>
              └── <div> (three-dot menu button)
                    └── <i> (icon element)
```

The key elements for the automation are:

1. **The profile link** — `<a aria-hidden="true" role="link">` — This is the hidden (screen-reader) link wrapping the profile picture. It serves as our anchor point for locating each entry.
2. **The three-dot menu icon** — `<i>` — The icon element inside the actions area. Clicking this opens a dropdown menu with options including "Unfollow."
3. **The "Unfollow" menu item** — A `<span dir="auto">` with text content "Unfollow" inside the dropdown that appears after clicking the three-dot icon.

The relationship between the profile link and the three-dot menu is **structural** — they're siblings at a certain nesting depth, connected through parent and nextSibling relationships in the DOM tree. This is why the code uses relative DOM traversal rather than independent selectors.

---

## The Complete Script

Here's the full 27-line script, exactly as written during the console experiment:

```javascript
// bosss im tired as hell
(async () => {
  var t = [...document.querySelectorAll('a[aria-hidden="true"][role="link"]')];
  if (t.length !== 0) {
    for (let [xx, x] of t.entries()) {
      var tridot = x.parentElement.parentElement.nextSibling.nextSibling.querySelector("i");
      if (tridot) {
        tridot.click();
        await new Promise((r) => setTimeout(r, 2000));

        // Unfollow
        var f = [...document.querySelectorAll('span[dir="auto"]')].filter(
          (i) => i.textContent === "Unfollow",
        );
        if (f.length > 0) {
          f[0].parentElement.parentElement.parentElement.parentElement.click();
          console.log(`[${xx}/${t.length}] Unfollowed -> ${x.href}`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    console.log("All is ok!!");
  }
})();
```

Don't let the brevity fool you — there's a lot happening in these 27 lines. Let's break down every piece.

---

## Breaking Down the Code

### The IIFE Wrapper

```javascript
(async () => {
  // ... entire script body ...
})();
```

The script is wrapped in an **IIFE** — an Immediately Invoked Function Expression. This is a common JavaScript pattern where a function is defined and executed in the same statement. The `async` keyword makes the function asynchronous, which is required because the script uses `await` for the timing delays between actions.

**Why an IIFE instead of just top-level code?** Two reasons:

1. **`await` support** — In most browser consoles (as of the experiment date), `await` can only be used inside an `async` function. Without the async IIFE wrapper, the `await new Promise(...)` calls would throw a `SyntaxError`. Some modern consoles support top-level `await`, but wrapping in an async IIFE guarantees compatibility across all browser versions.

2. **Scope isolation** — Variables declared with `var` inside the IIFE don't leak into the global scope (the `window` object). If the script were run as top-level code, variables like `t`, `f`, and `tridot` would become global properties, potentially conflicting with Facebook's own JavaScript variables. This isolation prevents accidental side effects.

**What would happen if the `async` keyword were removed?** The `await` expressions would cause syntax errors, and the script would fail to execute. Without `await`, the `setTimeout` promises would be created but not awaited — the loop would blaze through all entries instantly without the 2-second pauses, clicking three-dot menus and "Unfollow" buttons before the UI has time to render them. The result would be a cascade of failed clicks and missed unfollows.

### Selecting All Followed Account Links

```javascript
var t = [...document.querySelectorAll('a[aria-hidden="true"][role="link"]')];
```

**What this does:** Queries the entire page for all `<a>` elements that have both `aria-hidden="true"` and `role="link"` attributes, then converts the resulting `NodeList` into a standard `Array`.

**Why these specific attributes?**

- **`aria-hidden="true"`** — This is an ARIA (Accessible Rich Internet Applications) attribute that tells screen readers to **ignore** this element. Facebook uses it on the profile picture link because there's a separate, visible text link for the account name. Having two links to the same profile would confuse screen readers, so the image link is marked as hidden from assistive technology while remaining visually clickable for sighted users.

- **`role="link"`** — This ARIA role explicitly marks the element as a link. While `<a>` elements are inherently links, Facebook's React rendering sometimes uses `<a>` elements that don't behave as traditional links (e.g., they might use JavaScript `onClick` handlers instead of `href` navigation). The `role="link"` attribute reinforces the semantic meaning.

**Why this combination uniquely identifies Following list entries:** On the Following page, the only elements that have _both_ `aria-hidden="true"` and `role="link"` are the profile picture links in the Following list. Other links on the page (navigation bar, sidebar, etc.) typically don't have `aria-hidden="true"` because they need to be accessible to screen readers.

**The spread operator `[...]`:** `document.querySelectorAll` returns a `NodeList`, which is an array-like object but doesn't support all `Array` methods. The spread operator creates a true `Array` copy, enabling the use of `.entries()` in the `for...of` loop. An equivalent approach would be `Array.from(document.querySelectorAll(...))`.

**What would happen if this selector matched non-Following elements?** The script would attempt to find a three-dot menu relative to those elements. Since the DOM traversal (`.parentElement.parentElement.nextSibling.nextSibling`) is specific to the Following list entry structure, it would likely land on the wrong element or return `null`. The `if (tridot)` null check would then skip the entry, preventing a crash but also silently failing.

### Navigating to the Three-Dot Menu

```javascript
var tridot = x.parentElement.parentElement.nextSibling.nextSibling.querySelector("i");
```

This is the most brittle line in the entire script — and also the most interesting. It performs a **relative DOM traversal** from the profile link (`x`) to the three-dot menu icon. Let's trace each step:

**Starting point:** `x` is an `<a aria-hidden="true" role="link">` element — the profile picture link for one followed account.

```bash
x                              → <a aria-hidden="true" role="link">  (profile picture link)
x.parentElement                → <div>  (wrapper around the profile picture link)
x.parentElement.parentElement  → <div>  (the left section: avatar + name area)
  .nextSibling                 → <div>  (an intermediate sibling div)
  .nextSibling                 → <div>  (the right section: actions area)
  .querySelector("i")          → <i>    (the three-dot menu icon)
```

**Why `.nextSibling` twice?** The left section (avatar + name) and the right section (actions) are not immediate siblings. There's an intermediate `<div>` between them — possibly a spacer, a separator, or a container for additional metadata. The two `.nextSibling` calls skip over this intermediate element to reach the actions area.

**Why `.querySelector("i")` at the end?** The three-dot menu button contains an `<i>` (italic/icon) element that renders the three-dot icon via CSS (typically using a background image, SVG, or icon font). By querying for the `<i>` inside the actions area, the code finds the clickable icon regardless of its exact nesting depth within the actions container.

**What would happen if Facebook adds another sibling between the sections?** The second `.nextSibling` would land on the wrong element, and `.querySelector("i")` would either find the wrong icon or return `null`. The `if (tridot)` check would skip the entry. This is the primary fragility point of the script — any change to the number of sibling divs would break the traversal.

**A more resilient alternative would be:**

```javascript
// Instead of relative traversal, find the closest entry container
// and query directly within it
var entryContainer = x.closest("div[data-visualcompletion]");
var tridot = entryContainer?.querySelector('div[aria-label="Actions"] i');
```

However, during a quick console experiment, the relative traversal was the fastest approach to discover and verify — you can literally count the parent/sibling hops in the Elements inspector.

### Clicking the Three-Dot Menu

```javascript
if (tridot) {
  tridot.click();
  await new Promise((r) => setTimeout(r, 2000));
```

**What this does:** If the three-dot icon was found (not `null`), click it and wait 2 seconds.

**Cause and effect:** Clicking the `<i>` element dispatches a synthetic click event. Facebook's React event system catches this event (React uses event delegation — all events are handled at the root element and routed to the appropriate component handler). The handler toggles the visibility of a **dropdown menu** that contains options like "Unfollow," "Snooze for 30 days," "Add to Favorites," etc.

The dropdown menu is rendered as a **portal** — a React component that is mounted at the top level of the DOM (typically as a direct child of `<body>` or a dedicated portal container), not as a child of the three-dot button. This is why the next step uses a global `document.querySelectorAll` to find the "Unfollow" option rather than searching within the button's descendants.

**The 2-second wait:** The `await new Promise((r) => setTimeout(r, 2000))` creates a promise that resolves after 2000 milliseconds (2 seconds). This pause gives Facebook's frontend enough time to:

1. Process the click event through React's synthetic event system.
2. Update the component state (`isMenuOpen: true`).
3. Trigger a re-render that mounts the dropdown menu component.
4. Animate the dropdown's appearance (fade-in, scale-up, or similar CSS transition).
5. Make the dropdown's DOM elements queryable and clickable.

**What would happen with a shorter delay (e.g., 200ms)?** The dropdown might not have finished rendering. The subsequent `document.querySelectorAll('span[dir="auto"]')` query would either not find the "Unfollow" span (because it doesn't exist yet) or find it in a partially rendered state where the click event wouldn't register properly. The script would skip the unfollow action for that entry and move to the next one — effectively missing accounts.

**What would happen with no delay at all?** The dropdown would almost certainly not be rendered. Every single entry would be skipped, and the script would finish without unfollowing anything. The console would show no "Unfollowed" log messages — only the final "All is ok!!" (which would be misleading).

### Finding and Clicking "Unfollow"

```javascript
var f = [...document.querySelectorAll('span[dir="auto"]')].filter(
  (i) => i.textContent === "Unfollow"
);
if (f.length > 0) {
  f[0].parentElement.parentElement.parentElement.parentElement.click();
```

**What this does:** After the dropdown menu appears, this code finds all `<span>` elements with `dir="auto"` on the entire page, filters for the one that says "Unfollow," and then clicks it by navigating four levels up the parent chain.

**Why `span[dir="auto"]`?** Facebook uses the `dir="auto"` attribute on text elements to support **bidirectional text** (languages like Arabic, Hebrew that read right-to-left). The `auto` value tells the browser to determine the text direction from the content. Facebook applies this attribute to virtually all user-facing text elements. While not a unique identifier on its own (there are many `span[dir="auto"]` elements on the page), combined with the `.filter((i) => i.textContent === "Unfollow")` check, it reliably targets the "Unfollow" menu item.

**Why a global query instead of searching within the dropdown?** As mentioned above, the dropdown menu is rendered as a React portal — it's not a descendant of the three-dot button in the DOM tree. It's mounted at the root level of the document. This means the only way to find "Unfollow" is to search the entire document. The text-based filter (`i.textContent === "Unfollow"`) ensures we find the right element despite the broad search.

**What would happen if the word "Unfollow" appears elsewhere on the page?** The `.filter()` might return multiple matches. Taking `f[0]` would select the first one in DOM order. If the first match is not the dropdown's "Unfollow" option (e.g., it's a label on another part of the page), the click would hit the wrong element. In practice, the "Unfollow" text in the dropdown is typically the only exact match on the page at the time the dropdown is visible, because the dropdown is the most recently rendered element and other instances of "Unfollow" (if any) are rendered differently (e.g., as button labels with additional text).

### The Parent Chain Climb

```javascript
f[0].parentElement.parentElement.parentElement.parentElement.click();
```

This is perhaps the most unusual line in the script. Instead of clicking the `<span>` element directly, the code climbs **four parent levels** up the DOM tree and clicks the ancestor element.

**Why not click the span directly?** Facebook's dropdown menu items are structured with multiple nested wrapper elements:

```bash
<div role="menuitem">           ← 4th parent (the actual clickable menu item)
  └── <div>                     ← 3rd parent
       └── <div>                ← 2nd parent
            └── <div>           ← 1st parent
                 └── <span dir="auto">Unfollow</span>  ← f[0]
```

The **click event handler** is attached to the outermost `<div role="menuitem">` element (or a similar container), not to the inner `<span>`. React's event delegation means the click would technically bubble up from the span to the menu item container regardless — but Facebook's specific implementation might check `event.target` or `event.currentTarget` to determine which menu item was clicked. By clicking the container directly, the code ensures that the event target matches what Facebook's handler expects.

**What would happen if the nesting depth changed?** If Facebook adds or removes a wrapper div, the four-level climb would land on the wrong element. Clicking a non-interactive wrapper would produce no effect (no unfollow), and the script would silently skip that entry. If it landed on an element _above_ the menu item (e.g., the dropdown container itself), it might close the dropdown without performing any action.

**A more resilient approach would be:**

```javascript
// Find the closest ancestor with role="menuitem"
f[0].closest('[role="menuitem"]')?.click();
```

The `.closest()` method traverses up the DOM tree and returns the first ancestor matching the selector. This is independent of nesting depth and would survive structural changes as long as the `role="menuitem"` attribute is preserved.

### Progress Logging

```javascript
console.log(`[${xx}/${t.length}] Unfollowed -> ${x.href}`);
```

**What this does:** Logs a progress message to the browser console after each successful unfollow. The format is:

```bash
[0/47] Unfollowed -> https://www.facebook.com/SomeAccount
[1/47] Unfollowed -> https://www.facebook.com/AnotherAccount
...
```

- **`xx`** — The zero-based index of the current entry (from `.entries()`). This serves as a counter showing how many entries have been processed.
- **`t.length`** — The total number of entries found by the initial query. This gives a progress denominator.
- **`x.href`** — The URL of the profile link. Since `x` is an `<a>` element, `.href` returns the full URL. This lets you see _which_ account was unfollowed, which is useful for verification and debugging.

**Why this matters for practical use:** When unfollowing hundreds of accounts, the console log serves as a real-time progress tracker. If the script fails midway (due to a DOM change, rate limiting, or a page error), you can see exactly which entry it failed on and how many were successfully processed. Without logging, you'd have no visibility into the script's progress.

### The 2-Second Delays

The script uses two separate 2-second delays per iteration:

```javascript
// Delay 1: After clicking the three-dot menu (wait for dropdown to appear)
await new Promise((r) => setTimeout(r, 2000));

// Delay 2: After clicking "Unfollow" (wait for the action to complete)
await new Promise((r) => setTimeout(r, 2000));
```

**Total time per entry:** approximately **4 seconds** (2s for menu + 2s for unfollow + negligible processing time).

**For 100 followed accounts:** ~400 seconds ≈ **~6.7 minutes**.

**For 1,000 followed accounts:** ~4,000 seconds ≈ **~67 minutes** (over an hour).

**For 5,000 followed accounts:** ~20,000 seconds ≈ **~5.5 hours** — though you'd need to scroll and re-run the script many times due to infinite scroll.

**Why 2 seconds specifically?** This value was determined empirically during the console experiment — 2 seconds was consistently enough time for Facebook's UI to render the dropdown and process the unfollow action. It's a conservative estimate. A faster connection and machine might work with 1 second, while a slower setup might need 3 seconds. The value is a balance between reliability (higher values = more reliable) and speed (lower values = faster completion).

**Why `new Promise((r) => setTimeout(r, 2000))` instead of a simpler sleep function?** JavaScript doesn't have a built-in `sleep()` function. The `setTimeout` API is callback-based, not promise-based. Wrapping it in a `Promise` and using `await` is the standard pattern for creating an asynchronous delay in modern JavaScript. This pattern pauses the async function's execution for 2 seconds without blocking the browser's main thread (the UI remains responsive during the wait).

---

## The Execution Flow Visualized

Here's what happens for each entry in the Following list:

```bash
For each followed account:
│
├── [1] Find the <a> profile link (already selected)
│
├── [2] Traverse DOM: parentElement → parentElement → nextSibling → nextSibling → querySelector("i")
│        │
│        ├── Found <i>? ──► Yes ──► Continue
│        └── Not found? ──► Skip this entry, move to next
│
├── [3] Click the three-dot icon <i>
│        └── Effect: Dropdown menu appears (as a React portal)
│
├── [4] Wait 2 seconds (dropdown render time)
│
├── [5] Search entire document for <span dir="auto"> with text "Unfollow"
│        │
│        ├── Found? ──► Yes ──► Continue
│        └── Not found? ──► Skip this entry, move to next
│
├── [6] Climb 4 parent levels from the <span> and click the menu item container
│        └── Effect: Account is unfollowed. Facebook removes the entry from the list.
│
├── [7] Log: "[index/total] Unfollowed -> profile_url"
│
├── [8] Wait 2 seconds (action processing time)
│
└── [9] Move to next entry
│
After all entries processed:
└── Log: "All is ok!!"
```

---

## Why the Selectors Work

The selector strategy in this script is deliberately simple — it uses the minimum number of attributes needed to uniquely identify target elements on the Following page. Here's why each selector choice works:

| Selector                                                                        | Target                        | Why It Works                                                                             |
| ------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `a[aria-hidden="true"][role="link"]`                                            | Profile picture links         | Unique combination on the Following page: only avatar links have both attributes         |
| Relative DOM traversal (`.parentElement.parentElement.nextSibling.nextSibling`) | Three-dot menu area           | Based on the fixed structural relationship between the avatar and actions sections       |
| `querySelector("i")`                                                            | Three-dot icon                | The actions area contains exactly one `<i>` element (the menu icon)                      |
| `span[dir="auto"]` + text filter `"Unfollow"`                                   | Unfollow menu item            | The dropdown renders "Unfollow" as a `dir="auto"` span; text filtering ensures precision |
| `.parentElement` x4                                                             | Clickable menu item container | Climbs to the `role="menuitem"` ancestor that has the React click handler                |

### The Accessibility Attribute Advantage

Using accessibility attributes (`aria-hidden`, `role`, `dir`) as selectors is a somewhat underrated strategy in DOM automation. These attributes tend to be **more stable** than CSS class names because:

- They serve a **functional purpose** (accessibility compliance). Removing or changing them would break the page's accessibility, which Facebook actively maintains for legal and usability reasons.
- They are **standardized** by the WAI-ARIA specification. The attribute names and values are defined by a W3C standard, not by Facebook's internal naming conventions.
- They are **not hashed** like CSS module class names. `aria-hidden="true"` doesn't change across deployments the way `class="x1a2b3c4"` might.

That said, the attribute _values_ can change. If Facebook decides to make the avatar link accessible (removing `aria-hidden="true"`), the selector would stop matching.

---

## Factors That Affect the Script

### Facebook's React Architecture

Facebook's frontend is one of the most complex React applications in the world. The DOM structure is generated by React components, which means:

- **Elements are re-rendered frequently.** After each unfollow, React re-renders the Following list. If the re-render changes the DOM structure (e.g., removing the unfollowed entry and shifting subsequent entries), the `t` array (captured at the start) might hold **stale references** — pointers to DOM nodes that have been removed from the document. Attempting to traverse from a stale reference would produce `null` at some point in the parent/sibling chain.

- **The dropdown is a portal.** As discussed, the three-dot menu dropdown is rendered outside the Following list's DOM subtree. This forces the "Unfollow" search to be global.

- **Event handlers are delegated.** React attaches event listeners at the root, not on individual elements. This means synthetic `click()` calls on deeply nested elements do bubble correctly through React's event system, but the behavior depends on React's internal event routing, which can change between React versions.

### Network Speed and Server Response

Each "Unfollow" action sends an API request to Facebook's servers. The response must be received and processed before the UI updates. On a slow connection, the 2-second delay might not be sufficient — the API call might still be in flight when the script moves to the next entry. This could cause:

- **Race conditions** — The next three-dot menu click fires while the previous unfollow request is still pending.
- **Stale dropdown** — The dropdown from the previous entry might still be visible, causing the "Unfollow" search to find the _previous_ dropdown's option instead of the current one.

### Facebook Rate Limiting

Facebook monitors API request frequency. Rapidly unfollowing hundreds of accounts could trigger:

- **Temporary action blocks** — Facebook might temporarily prevent you from unfollowing more accounts, displaying a message like "You're going too fast. Slow down."
- **CAPTCHA challenges** — Facebook might present a CAPTCHA to verify you're human.
- **Account restrictions** — In extreme cases, Facebook might temporarily restrict account features.

The 2-second delay between actions provides some protection against rate limiting, but for very large lists (1,000+), you might still trigger throttling. Increasing the delay to 3-5 seconds would reduce this risk.

### Browser Memory

Each iteration of the loop creates DOM queries, promise objects, and string variables. For thousands of iterations, this can accumulate garbage that the browser's garbage collector needs to reclaim. While unlikely to cause issues for a few hundred entries, very large runs (5,000+) on memory-constrained devices could cause browser tab crashes.

### Page Language and Locale

The script filters for the exact text `"Unfollow"`. If the user's Facebook language is set to anything other than **English**, the menu item will display in the user's language (e.g., "Ne plus suivre" in French, "Entfolgen" in German, "Dejar de seguir" in Spanish). The text filter would fail, and the script would skip every entry without unfollowing anything.

**Fix for non-English users:** Change the filter to match the localized text:

```javascript
// For French:
.filter((i) => i.textContent === "Ne plus suivre")

// Or make it configurable:
const UNFOLLOW_TEXT = "Unfollow"; // Change this to your language
.filter((i) => i.textContent === UNFOLLOW_TEXT)
```

---

## Limitations and Edge Cases

### 1. Only Processes Currently Loaded Entries

As discussed, infinite scroll means only a subset of followed accounts are in the DOM at any time. The script processes what's loaded and stops. To unfollow all accounts, you need to:

1. Scroll down to load more entries.
2. Run the script again.
3. Repeat until the Following list is empty.

A more advanced version could automate the scrolling:

```javascript
// Scroll to bottom, wait for new entries, then process
window.scrollTo(0, document.body.scrollHeight);
await new Promise((r) => setTimeout(r, 3000));
// Re-query and process new entries
```

### 2. No Confirmation or Undo

The script unfollows accounts immediately with no confirmation prompt. Once an account is unfollowed, **there is no bulk undo**. You'd have to manually re-follow each account individually. Make sure you actually want to unfollow everything before running this.

### 3. The Index Counter Starts at 0

The progress log uses zero-based indexing (`[0/47]`, `[1/47]`, etc.). This is technically accurate for a zero-indexed array, but in human terms, the first unfollow is "1 of 47," not "0 of 47." This is a minor cosmetic issue that doesn't affect functionality but could be confusing when reading the logs.

**Fix:**

```javascript
console.log(`[${xx + 1}/${t.length}] Unfollowed -> ${x.href}`);
```

### 4. No Error Handling

The script has no `try...catch` blocks. If any DOM traversal returns `null` (and the null check misses it), the script throws an unhandled `TypeError` and stops. All remaining entries are left un-processed.

A more robust version:

```javascript
for (let [xx, x] of t.entries()) {
  try {
    var tridot = x.parentElement?.parentElement?.nextSibling?.nextSibling?.querySelector("i");
    // ... rest of the logic with optional chaining
  } catch (err) {
    console.error(`[${xx}] Error: ${err.message}`);
    continue; // Skip this entry and continue with the next
  }
}
```

### 5. Dropdown Might Not Contain "Unfollow"

Not every entry in the Following list has an "Unfollow" option in its dropdown. For example:

- **Pages you manage** might show different options.
- **Accounts that have blocked you** might show a limited menu.
- **Entries with loading errors** might not render a complete dropdown.

The `if (f.length > 0)` check correctly handles this — if "Unfollow" isn't found, the entry is skipped. However, the previously opened dropdown might remain visible, and the next iteration's three-dot click might interact with the stale dropdown rather than opening a new one. The 2-second delay partially mitigates this (the dropdown usually auto-closes), but it's not guaranteed.

### 6. Stale Element References After DOM Updates

When an account is successfully unfollowed, Facebook removes the entry from the Following list and re-renders the remaining entries. This can invalidate references in the `t` array — elements that were at positions 5, 6, 7 might shift to positions 4, 5, 6 after entry 4 is removed. The loop continues using the original references, which may now point to removed or shifted elements. The `.parentElement` traversal on a removed element returns `null`, which the `if (tridot)` check catches, causing the entry to be skipped.

**Net effect:** Some entries might be skipped, requiring a second run of the script to catch them. This is acceptable for a quick-and-dirty tool — you'd be running it multiple times anyway due to infinite scroll.

---

## Improvements You Could Make

If you wanted to turn this console snippet into a more robust tool, here are some enhancements:

### Add Automatic Scrolling

```javascript
(async () => {
  let totalUnfollowed = 0;
  while (true) {
    var t = [...document.querySelectorAll('a[aria-hidden="true"][role="link"]')];
    if (t.length === 0) {
      console.log(`Done! Total unfollowed: ${totalUnfollowed}`);
      break;
    }
    for (let [xx, x] of t.entries()) {
      // ... existing unfollow logic ...
      totalUnfollowed++;
    }
    // Scroll down to load more
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 3000));
  }
})();
```

### Add Selective Unfollowing

Instead of unfollowing everything, you could keep certain accounts:

```javascript
const KEEP_LIST = ["facebook.com/AccountToKeep", "facebook.com/AnotherOne"];

// Inside the loop:
if (KEEP_LIST.some((keep) => x.href.includes(keep))) {
  console.log(`[${xx}] Skipping (keep list) -> ${x.href}`);
  continue;
}
```

### Add Randomized Delays

To reduce the risk of rate limiting and appear more human-like:

```javascript
// Random delay between 1.5 and 3.5 seconds
const delay = 1500 + Math.random() * 2000;
await new Promise((r) => setTimeout(r, delay));
```

### Use Optional Chaining for Safety

```javascript
var tridot = x?.parentElement?.parentElement?.nextSibling?.nextSibling?.querySelector("i");
```

The `?.` operator short-circuits to `undefined` if any step in the chain is `null` or `undefined`, preventing `TypeError` crashes.

---

## Ethical Considerations

This script operates on **your own account** — it unfollows accounts from your personal Following list. You're not accessing anyone else's data, modifying other users' accounts, or scraping private information. In that sense, it's comparable to manually clicking "Unfollow" hundreds of times — just automated.

However, a few considerations apply:

- **Facebook's Terms of Service** prohibit automated interactions with the platform without prior authorization. Running console scripts that interact with the DOM technically violates this policy. The practical risk for a one-time personal cleanup is extremely low, but it's worth being aware of.
- **Rate limiting is there for a reason.** Facebook's rate limits protect their infrastructure and other users' experience. Respect the 2-second delays and don't try to speed them up aggressively.
- **This script could be modified for malicious purposes** (e.g., unfollowing accounts on someone else's logged-in session). Only run it on your own account, on your own device, with your own login session.

---

## Final Thoughts

Sometimes the best tools are the ones you throw together in an hour out of sheer frustration. This 27-line script isn't engineered for production use. It doesn't handle every edge case, it doesn't scale gracefully, and the variable names are a mix of English and Indonesian. But it does the one thing it was designed to do: **unfollow hundreds of accounts without clicking through three menus for each one.**

The broader takeaway is that any web interface that a human can interact with, JavaScript can automate. The browser console is your REPL for the web — any button you can click, any menu you can open, any list you can scroll through, you can script. The key skills are:

1. **Knowing how to identify elements** — `querySelector`, attribute selectors, text filtering.
2. **Understanding DOM relationships** — `parentElement`, `nextSibling`, `closest`.
3. **Respecting timing** — Async/await, delays between actions, waiting for UI rendering.
4. **Checking for null** — Every DOM query can fail. Handle it.

For a problem that would have taken hours of manual clicking, 27 lines of JavaScript and less than two hours of console exploration was a fair trade.

---

## References

- [MDN — Document.querySelectorAll()](https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll)
- [MDN — Element.parentElement](https://developer.mozilla.org/en-US/docs/Web/API/Node/parentElement)
- [MDN — Node.nextSibling](https://developer.mozilla.org/en-US/docs/Web/API/Node/nextSibling)
- [MDN — Element.closest()](https://developer.mozilla.org/en-US/docs/Web/API/Element/closest)
- [MDN — ARIA: aria-hidden attribute](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-hidden)
- [MDN — ARIA: link role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/link_role)
- [MDN — HTMLElement.dir](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dir)
- [MDN — Immediately Invoked Function Expression (IIFE)](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)
- [MDN — async function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)
- [MDN — Optional chaining (?.)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining)
- [WAI-ARIA Specification — W3C](https://www.w3.org/TR/wai-aria/)
- [React Event System — React Documentation](https://react.dev/reference/react-dom/components/common#react-event-object)
- [React Portals — React Documentation](https://react.dev/reference/react-dom/createPortal)
- [Facebook Terms of Service](https://www.facebook.com/terms.php)
