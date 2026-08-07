# Smart Attendance — Phase 1: Premium UI/UX Foundation

Design system, responsive layout, and animation foundation.
**No business logic or attendance features were changed in this phase.**

---

## Pick a theme first

Open **`theme-preview.html`** in a browser. It renders all three concepts
side by side using the production stylesheet at 360 px — the width of the most
common Android phone. Click one and the whole app switches to it.

The choice is saved per device (`localStorage` key `sa-theme`) and can be
changed again from the switcher at the bottom of the sidebar.

**Default: Modern Light.** See the recommendation at the end of this file.

---

## What changed

| File | Status |
| --- | --- |
| `css/design-system.css` | **new** — tokens, all three themes, reset, motion vocabulary |
| `css/style.css` | rebuilt on tokens; every original class name preserved |
| `js/ui.js` | **new** — interaction and animation layer |
| `theme-preview.html` | **new** — the theme chooser |
| `sw.js` (root) | **new** — see "Service worker fix" below |
| `js/sw.js` | cache bumped to v9, new assets added |
| `manifest.json` | theme colours, scope, install shortcut |
| `*.html` | `<head>` and script tail only — no markup touched |

**Byte-identical, untouched:** `attendance.js`, `admin.js`, `auth.js`,
`firebase.js`, `leave-holiday.js`, `firestore.rules`.

Verified: all **127 DOM ids** the existing scripts reference still exist.

---

## Architecture note — please read before Phase 2

The brief asked for Tailwind, shadcn/ui, Framer Motion and 21st.dev.
**shadcn/ui and Framer Motion are React-only**, and Tailwind needs a build step.
This app is vanilla HTML/CSS/JS + Firebase with no build pipeline, and roughly
4,000 lines of working business logic across five scripts.

Adopting them in Phase 1 would have meant rewriting every page as React
components — which means rewriting exactly the business logic this phase was
told not to touch.

So the design system is built on **native CSS custom properties + vanilla JS**,
with **GSAP** (which works fine without React) for orchestration. You get the
same result — tokens, components, spring motion, ripples, skeletons — with zero
risk to Firebase and nothing new to maintain.

If you want the React stack, that's a real and reasonable goal, but it belongs
in its own phase with the migration planned deliberately. The token layer
here ports across directly: `design-system.css` maps one-to-one onto a Tailwind
theme config, so nothing done in this phase is wasted.

**Lucide icons** are the one substitution still worth making. You're on Font
Awesome; swapping icon libraries touches every page for purely cosmetic gain,
so it wasn't worth doing mid-phase.

**Lottie** was not added. It ships ~250 KB of runtime for two animations, and
the shift ring plus the existing spinner already cover loading and success. On
a mid-range Android phone that trade is not worth making. Easy to add later if
you disagree.

---

## The design system

**Colour.** One brand hue (electric indigo-violet `#6B4EFF`), one accent
reserved for time and progress (teal `#00B8A9`), and one hue per attendance
state — present green, absent red, incomplete amber, holiday blue. Nothing
decorative reuses a state colour, because colour is the fastest read in a dense
table.

**Type.** **Plus Jakarta Sans** for the interface, **IBM Plex Mono** for every
number. A time clock should read like an instrument, and tabular figures stop
the live clock jittering as it ticks.

**Spacing** on a 4 px base. **Radius** from 6 px to 32 px. **Motion** uses two
curves only: `standard` for anything entering, `spring` for anything a finger
just touched. All animation is transform/opacity, so it composites on the GPU.

**Breakpoints** — four, used nowhere else in the system:

| Width | Change |
| --- | --- |
| 480 px | stats widen, buttons pair up |
| 768 px | stat scroller becomes a grid, tables become real tables |
| 1024 px | sidebar appears, bottom nav retires |
| 1280 px | shift ring grows |

---

## The shift ring

A day at work is a span, not a number. The ring draws that span: it fills from
check-in toward the end of the shift, ticks live while you're on the clock, and
settles to green on check-out.

It reads the values `attendance.js` already writes into `#checkInTime`,
`#checkOutTime` and `#workingHours` via `MutationObserver`, so it holds no data
of its own and cannot desynchronise. **No changes to `attendance.js` were
needed.**

The shift length is `SHIFT_HOURS` at the top of `js/ui.js` (currently 9). It
affects the ring only — never any calculation, total or stored record.

---

## Mobile decisions worth knowing

- **The check-in button never falls below the fold.** On mobile the action card
  is reordered by CSS to ring → button → details. Source order is untouched.
  Measured at 360/393/430 px: the button ends at 502 px on an 800 px screen.
- **Tables stop being tables below 768 px.** A 7-column grid can't be read at
  360 px and horizontal scrolling was off-limits, so each row becomes a stacked
  record. `ui.js` copies each `<th>` into the matching cell's `data-label`.
- **Stats scroll horizontally on mobile.** Six stacked cards would push the
  check-in action off-screen.
- **Modals are bottom sheets below 640 px**, with a grab handle, swipe-down to
  dismiss, and focus landing on the first field — not the close button.
- **Inputs are 16 px everywhere.** Anything smaller makes Chrome for Android
  zoom the viewport on focus.
- **Bottom nav builds itself** from the sidebar's own items, so the two can't
  drift apart. Admin's six sections collapse to four plus "More".

---

## Service worker fix

Your pages register `sw.js` from the site root, but the file lived at
`js/sw.js`. Registration was 404ing, so **the PWA was never installable.**

A copy now sits at the root. Both paths work; `js/sw.js` is unchanged apart
from the cache bump. Verified: registers at scope `/`, precaches 21 files
including the new CSS and JS.

---

## Verified in Chromium

- 54 combinations — 9 pages × 3 themes × 2 widths: **no horizontal overflow,
  no JS errors**
- Widths 360 / 393 / 430 / 820 / 1440 px
- No touch target under 40 px
- No truncated labels at any width
- `prefers-reduced-motion` honoured (animations drop to ~0 s, nothing becomes
  invisible)
- Theme switch persists across pages and updates the Android status bar
- Modals: bottom sheet on mobile, centred on desktop, Escape closes, focus
  trapped, body scroll locked
- Service worker registers; manifest valid with 3 icons and 1 shortcut

One pre-existing error surfaces on `admin-register.html`
(`onAuthStateChanged is not defined`, from `auth.js` line 226). It appears only
because Firebase's CDN is unreachable in the test sandbox, and it exists in the
original code. It resolves in production. It was left alone — it's business
logic.

---

## For Phase 2

`window.SmartUI` is available on every page:

```js
SmartUI.setLoading(button, true);   // inline spinner, disables the button
SmartUI.skeleton(element, true);    // shimmer placeholder
SmartUI.theme.set('dark');          // 'light' | 'dark' | 'glass'
SmartUI.setMotion('off');           // user-level motion toggle
SmartUI.refreshRing();              // force the shift ring to re-read
```

Toasts still go through the existing `showToast()` in `auth.js` — `ui.js` only
adds the exit animation and screen-reader announcement.

---

## Recommendation: Modern Light

You said most users are on Android phones. That's the whole argument.

**Glassmorphism** is the most striking of the three and I'd happily ship it on
a marketing site. But every frosted panel is a separate GPU compositor layer,
and `backdrop-filter` is the single most expensive thing you can ask a
mid-range Android GPU to do. With a dozen blurred surfaces scrolling on a
budget phone, 60 FPS is not realistic. It's also the hardest to read in
daylight — and an attendance app gets opened outdoors, at a gate, on the way in.

**Premium Dark** is a genuinely strong second, and the right default if your
users mostly check in early or late. Cheapest on OLED battery, comfortable at
night.

**Modern Light** wins because it's the fastest to paint, the most legible in
sunlight, and the most credible as enterprise software — which is what "built
by a professional product company" actually looks like in this category. The
violet accent still carries the brand; it just isn't doing the work alone.

The real point: **all three ship.** The theme is one attribute on `<html>`, so
defaulting to Light costs nothing — Dark and Glass are both live in the
switcher, and the choice persists per device.

---

*Phase 1. Foundation only — no new attendance features.*
