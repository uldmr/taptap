# taptap

Tap any element on a page, write what should change, and get one prompt that an agent
can act on. A separate MV3 extension that lives next to `prototype/` (the bopbop MCP
relay) and does not touch it.

```
tap element → card with its attributes → your request → HUD → Submit → prompt → clipboard
```

## What it does

- **Annotation mode** on the current tab, from the toolbar button or `Alt+A`.
- A **brand frame** around the viewport, a **replaced cursor**, and a **hover box** with
  the element's name, so the mode is impossible to mistake for the page.
- **Tap to select**: page clicks are swallowed while the mode is on, so links and
  buttons never fire.
- A **card** with the element's `id`, `name`, `type`, `role`, test id, classes and
  component name, plus the textarea for the request. It follows its element while you
  scroll and picks the side with room (top by default, then bottom, right, left).
- **Many annotations per page**, each with a numbered marker; edit or delete any of them.
- A **draggable HUD** with the list, `Reset` (two clicks) and `Submit`.
- **Submit** builds one Markdown prompt — page, stack, selector, attributes, classes,
  component chain, parent, text, HTML, and your request per element — and copies it to
  the clipboard. No agent connection is needed for that.
- **Persistence**: annotations live in `chrome.storage.local`, keyed by origin + path,
  and come back after a reload or an SPA navigation. The mode itself survives a reload
  of the tab and is dropped when the browser closes.

## Install

```bash
npm install          # once
npm run build        # writes dist/
```

Then `chrome://extensions` → *Developer mode* → *Load unpacked* → pick `dist/`.

Google Chrome (branded) refuses `--load-extension` since 137, which is why the smoke
test drives a Chrome for Testing build instead. Loading unpacked by hand works as usual.

## Keys

| Key | Action |
|---|---|
| `Alt+A` | toggle annotation mode |
| `Esc` | close the card, then the prompt, then leave the mode |
| `⌘↵` / `Ctrl+↵` | save the request in the card |

Rebind `Alt+A` at `chrome://extensions/shortcuts` if it clashes.

## How an element is anchored

The annotation stores an ordered list of candidate selectors, not one string, and a
fingerprint (tag, role, accessible name, text). On load the resolver takes the first
candidate that finds exactly one element whose tag matches:

1. `#id`
2. `data-testid` / `data-test` / `data-cy` / `data-qa` / `data-pw` / `data-e2e`
3. `[name]`, `[aria-label]`, `[role][aria-label]`, `a[href]` (same-origin paths)
4. a stable class — the local part of a CSS-module class (`HeaderSearch_input__VSV_n`
   becomes `HeaderSearch_input`), never a build hash, never an atomic `css-1x2a3b`,
   never a Tailwind variant (`@md:text-*`)
5. a positional path (`body > form:nth-of-type(1) > input:nth-of-type(3)`)

An element that no candidate finds again is reported in the HUD instead of being
silently re-attached to a lookalike.

## What goes into the prompt

```markdown
## 3. input [data-testid="email"]

- selector: `[data-testid="email"]`
- attributes: id `email` · name `email` · type `email` · role `textbox`
- classes: `EmailField_input` (+2 more)
- component: React 19.1.0 · `EmailField` ← `CheckoutForm`
- name: "Email address"
- path: `body > form:nth-of-type(1) > input:nth-of-type(3)`
- text: "Email address"
- parent: `form` · `[data-testid="checkout-form"]` · component `CheckoutForm`
- html: `<input id="email" name="email" type="email">`

**Request:** Make the label float above the field and mark the error state in red.
```

The header carries the page URL, the detected stack (Next.js, Nuxt, SvelteKit, Astro,
Gatsby, Angular, Vue, Svelte, React, Solid, Alpine.js), the component of the last
selection and the viewport size.

## How it is built

| File | Role |
|---|---|
| `src/sw.js` | toolbar action, keyboard command, the per-tab "mode is on" flag, probe injection |
| `src/content/main.js` | engine: activation, hover, selection, cards, markers, HUD, prompt, SPA tracking |
| `src/content/overlay.js` | the whole UI inside a closed shadow root; `place()` is the panel placement rule |
| `src/content/anchor.js` | attribute digest and the ordered anchor candidates |
| `src/content/dom.js` | role, accessible name, text, visibility, shadow-piercing query (from bopbop's page agent, MIT) |
| `src/content/stack.js` | framework detection from the DOM, and the page-world probe for component names |
| `src/content/prompt.js` | the Markdown prompt and the JSON payload |
| `src/content/store.js` | `chrome.storage.local` records per page |

Three decisions worth knowing:

- **Closed shadow root.** A page's Tailwind reset cannot reach the card, and the page
  cannot query our UI. The content script runs in an isolated world, so `__taptapEngine`
  is invisible to the page as well.
- **The content script is dormant.** It ships on every http(s) page but does nothing
  until the tab is switched on: no listeners, no DOM, no requests.
- **Component names come from a page-world probe.** React fibers and Vue instances are
  expandos on page-world wrappers an isolated script cannot read, so on activation the
  service worker injects a tiny MAIN-world listener; the content script asks it about
  the element under the pointer by coordinates and gets plain data back. Minified
  production names are dropped rather than passed along as `x ← m ← n`.

## Development

```bash
npm test          # unit tests: prompt building, panel placement, class names, page keys
npm run build     # dist/
npm run smoke     # real Chrome + real extension, 39 end-to-end checks, screenshots in .tmp/smoke
npm run icons     # redraw icons/ from scripts/make-icons.mjs
```

`npm run smoke` needs a Chromium or Chrome for Testing binary; it looks in
`CHROME_PATH`, `/Applications`, and Playwright's browser cache. It covers: dormant
page, activation, cursor, hover label, card attributes, saving two annotations (one
anchored by `id`, one by `data-testid`), persistence, re-anchoring after a reload,
the prompt content, component names from a React fiber, `Esc` back to a normal page.

## Not here yet

- Sending the prompt straight into an agent session (the bopbop WebSocket relay + an
  `annotations.submit` MCP tool) — stage 4. Until then, `Submit` → clipboard.
- An options page with an origin blocklist (the `BBM_ALLOW` idea), so the mode cannot
  be switched on where it should not be.
- Annotations inside iframes and closed shadow roots; touch gestures.
- A screenshot with the markers attached to the prompt.
