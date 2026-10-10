---
version: alpha
name: OpenCode-design-analysis
description: |
  A terminal-native marketing system rendered entirely in JetBrains Mono — every word on the page, from the hero headline down to the footer fine print, is monospaced. The page itself reads like a manpage or a static-site README: deep blue-black canvas (`#050810`), near-white ink (`#f8f7f7`), 4px-radius rectangles for the few interactive elements, and bracketed `[+]`/`[-]` ASCII markers used as bullets. Surfaces are glassmorphic: translucent white fills at 8–12% opacity, backdrop blur from 20px to 40px that strengthens with elevation, thin 15–20% white borders, and soft drop shadows. The brand's main "visual moment" is a single glass hero card, set over the elevated background (`#0a0f1e`), that mocks up the OpenCode TUI itself — monospaced terminal output, ASCII pipe characters, and a wordmark rendered as block-pixel ASCII. Every section sits as a hairline-bordered text block on the canvas with no gradients, no decorative imagery, and no non-monospaced character anywhere in the system.

colors:
  primary: "#fdfcfc"
  on-primary: "#201d1d"
  ink: "#f8f7f7"
  ink-deep: "#dcd8d8"
  charcoal: "#e8e5e5"
  body: "#d2d2d7"
  mute: "#bdbbbb"
  stone: "#aeadb2"
  ash: "#9a9898"
  canvas: "#050810"
  surface-soft: "rgba(255,255,255,0.08)"
  surface-card: "rgba(255,255,255,0.10)"
  surface-dark: "#0a0f1e"
  surface-dark-elevated: "rgba(255,255,255,0.12)"
  hairline: "rgba(255,255,255,0.15)"
  hairline-strong: "rgba(255,255,255,0.20)"
  on-dark: "#fdfcfc"
  on-dark-mute: "#9a9898"
  accent: "#007aff"
  accent-hover: "#0056b3"
  accent-active: "#004085"
  warning: "#ff9f0a"
  warning-hover: "#cc7f08"
  warning-active: "#995f06"
  danger: "#ff3b30"
  danger-hover: "#d70015"
  danger-active: "#a50011"
  success: "#30d158"

typography:
  display-xl:
    fontFamily: JetBrains Mono
    fontSize: 38px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0
  heading-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-strong:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  body-tight:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0
  link-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  button-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: 500
    lineHeight: 2
    letterSpacing: 0
  caption-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 2
    letterSpacing: 0

rounded:
  none: 0px
  sm: 4px
  full: 9999px

spacing:
  xxs: 1px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 96px

elevation:
  glass-1:
    backgroundColor: "{colors.surface-soft}"
    backdropFilter: blur(20px)
    borderColor: "{colors.hairline}"
    boxShadow: 0 2px 8px rgba(0,0,0,0.24)
  glass-2:
    backgroundColor: "{colors.surface-card}"
    backdropFilter: blur(28px)
    borderColor: "rgba(255,255,255,0.17)"
    boxShadow: 0 8px 24px rgba(0,0,0,0.32)
  glass-3:
    backgroundColor: "{colors.surface-dark-elevated}"
    backdropFilter: blur(40px)
    borderColor: "{colors.hairline-strong}"
    boxShadow: 0 16px 48px rgba(0,0,0,0.40)

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: 4px 20px
    height: 36px
  button-primary-active:
    backgroundColor: "{colors.ink-deep}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "{colors.surface-soft}"
    elevation: "{elevation.glass-1}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: 4px 20px
  button-tab:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
    typography: "{typography.button-md}"
    rounded: "{rounded.none}"
    padding: 8px 16px
  button-tab-active:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.none}"
  button-disabled:
    backgroundColor: "{colors.surface-card}"
    elevation: "{elevation.glass-2}"
    textColor: "{colors.ash}"
    rounded: "{rounded.sm}"
  badge-news:
    backgroundColor: "{colors.surface-card}"
    elevation: "{elevation.glass-2}"
    textColor: "{colors.on-dark}"
    typography: "{typography.caption-md}"
    rounded: "{rounded.sm}"
    padding: 2px 8px
  text-input:
    backgroundColor: "{colors.surface-soft}"
    elevation: "{elevation.glass-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    height: 40px
  text-input-focused:
    backgroundColor: "{colors.surface-card}"
    elevation: "{elevation.glass-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  textarea:
    backgroundColor: "{colors.surface-soft}"
    elevation: "{elevation.glass-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 12px
  install-snippet:
    backgroundColor: "{colors.surface-card}"
    elevation: "{elevation.glass-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
  hero-tui-mockup:
    backgroundColor: "{colors.surface-dark-elevated}"
    elevation: "{elevation.glass-3}"
    backdropColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 64px 32px
  tui-prompt-row:
    backgroundColor: "{colors.surface-dark-elevated}"
    elevation: "{elevation.glass-3}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  list-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 8px 0px
  faq-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 12px 0px
  testimonial-row:
    backgroundColor: "{colors.surface-soft}"
    elevation: "{elevation.glass-1}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 16px 20px
  chart-tile:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.caption-md}"
    rounded: "{rounded.none}"
    padding: 16px
  primary-nav:
    backgroundColor: "{colors.surface-dark-elevated}"
    elevation: "{elevation.glass-3}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.none}"
    height: 56px
  footer-section:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.caption-md}"
    rounded: "{rounded.none}"
    padding: 32px 0px
  link-inline:
    textColor: "{colors.ink}"
    typography: "{typography.link-md}"
  badge-section-label:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.heading-md}"
    rounded: "{rounded.none}"
---

## Attribution

Adapted from OpenCode DESIGN.md for VibeMail Glass. Surface treatment replaced with glassmorphism. Typography replaced with JetBrains Mono (SIL OFL). All other tokens from OpenCode.

## Overview

This system is rendered entirely in JetBrains Mono — every word on the page, from the 38px hero headline down to the 14px footer fine print, sits in the same monospaced face. The visual identity comes from that single typographic decision: the page reads like a manpage or a static-site README, complete with bracketed `[+]` / `[-]` / `[x]` ASCII markers used in place of icons or bullets, and a wordmark rendered as block-pixel ASCII art at the top of the nav. There is no sans-serif anywhere, no display face, no italics, no decorative ornament — the system is one font and one weight away from being a 1990s `whatis` page rendered at modern resolutions.

The chrome is austere: deep blue-black canvas (`{colors.canvas}` — `#050810`), near-white ink (`{colors.ink}` — `#f8f7f7`), and a 4-tier neutral gray ladder for body, metadata, and disabled text. Raised elements are glass panes: translucent white fills (8–12%), backdrop blur that strengthens with elevation (20px → 40px), a thin 15–20% white border, and a soft drop shadow. Sections are hairline-bordered text blocks (`{colors.hairline}` 1px) sitting directly on the canvas with `{spacing.section}` (96px) air between them. The single "visual" moment in the entire system is a full-bleed glass hero card over the elevated background (`{colors.surface-dark}` — `#0a0f1e`) that mocks up the OpenCode TUI itself: a terminal frame with `tab` / `ctrl-p` keybinding hints, a "Build" command line, and the OpenCode wordmark rendered as a pixel-block ASCII title.

The semantic palette is unusual for a brand-marketing site: it ships the full Apple Human Interface Guidelines accent ramp — `{colors.accent}` (Apple Blue `#007aff`), `{colors.danger}` (`#ff3b30`), `{colors.warning}` (`#ff9f0a`), `{colors.success}` (`#30d158`) plus their hover/active deepenings — even though the marketing surfaces themselves only use these colors in the hero TUI mockup as syntax-highlight stand-ins. The wider palette belongs to the in-product TUI; the marketing pages mostly stay in monochrome.

**Key Characteristics:**
- 100% JetBrains Mono typography across every text role — no sans-serif fallback anywhere in the chrome
- Deep blue-black `{colors.canvas}` (#050810) as the only body background — no surface alternation across sections
- Elevated background (`{colors.surface-dark}` — #0a0f1e) reserved exclusively for the band behind the hero TUI mockup
- Glassmorphic surfaces in three elevation levels (`{elevation.glass-1}` → `{elevation.glass-3}`): 8/10/12% white fill, 20/28/40px backdrop blur, 15–20% white border, soft drop shadow
- 4px radius (`{rounded.sm}`) on every interactive element; sections themselves are sharp rectangles bordered in 1px hairline
- ASCII bracket markers (`[+]`, `[-]`, `[x]`) used as bullet glyphs in feature lists and FAQ rows
- Block-pixel ASCII wordmark in the primary nav and inside the hero TUI — the brand identity is its own ASCII art
- 96px `{spacing.section}` rhythm between every section, with no decorative dividers; only thin 1px `{colors.hairline}` rules separate content blocks

## Colors

> **Source pages:** `/` (home), `/zen`, `/enterprise`. The chrome palette is identical across all three.

### Brand & Accent
- **Primary** (`{colors.primary}` — `#fdfcfc`): the primary CTA fill, the brand's signature warm white. A light fill is the one solid shape that stands out against the dark canvas and the glass.
- **Ink** (`{colors.ink}` — `#f8f7f7`): the brand's text "color." Headlines, body text, nav links, and every solid icon. Near-white rather than pure white, mirroring the primary fill.
- **Ink Deep** (`{colors.ink-deep}` — `#dcd8d8`): pressed-state for the primary CTA. One step dimmer than the primary fill, keeping its warm cast.
- **On Primary** (`{colors.on-primary}` — `#201d1d`): near-black label text on the primary CTA fill.

### Surface
- **Canvas** (`{colors.canvas}` — `#050810`): base background for every page body.
- **Elevated Background** (`{colors.surface-dark}` — `#0a0f1e`): the full-bleed band behind the hero TUI mockup — the opaque layer the hero glass blurs against.
- **Glass 1 — Soft Surface** (`{colors.surface-soft}` — `rgba(255,255,255,0.08)`, blur 20px): text-input default background, testimonial row fill, secondary button.
- **Glass 2 — Surface Card** (`{colors.surface-card}` — `rgba(255,255,255,0.10)`, blur 28px): install-snippet pill, disabled button fill, news badge, focused input.
- **Glass 3 — Surface Elevated** (`{colors.surface-dark-elevated}` — `rgba(255,255,255,0.12)`, blur 40px): the hero TUI mockup, the prompt-row inside it, and the primary nav.
- **Hairline** (`{colors.hairline}` — `rgba(255,255,255,0.15)`): 1px section divider and the border on level-1 glass.
- **Hairline Strong** (`{colors.hairline-strong}` — `rgba(255,255,255,0.20)`): tab strip's bottom rule, stronger inline divider, and the border on level-3 glass.

### Text
- **Ink** (`{colors.ink}` — `#f8f7f7`): headlines, body text, primary nav links, button text on glass surfaces.
- **Charcoal** (`{colors.charcoal}` — `#e8e5e5`): subtly softer body where pure ink is too heavy.
- **Body** (`{colors.body}` — `#d2d2d7`): default paragraph text and FAQ answers.
- **Mute** (`{colors.mute}` — `#bdbbbb`): tab labels (default state), metadata, footer link text, in-list secondary annotations.
- **Stone** (`{colors.stone}` — `#aeadb2`): least-emphasis utility text, breadcrumb separators.
- **Ash** (`{colors.ash}` — `#9a9898`): disabled text and secondary annotation in dark TUI mockup, also TUI mockup secondary color.

### Semantic
The full Apple Human Interface Guidelines semantic ramp ships with the system. On marketing pages these colors appear primarily inside the hero TUI mockup as syntax-highlight stand-ins; in the in-product TUI they carry their conventional meaning.

- **Accent** (`{colors.accent}` — `#007aff`): primary informational signal, in-product link color, TUI command highlight.
- **Accent Hover** (`{colors.accent-hover}` — `#0056b3`): pressed informational link.
- **Accent Active** (`{colors.accent-active}` — `#004085`): deeply-pressed informational state.
- **Danger** (`{colors.danger}` — `#ff3b30`): destructive confirmation, error state.
- **Danger Hover** (`{colors.danger-hover}` — `#d70015`): pressed destructive.
- **Danger Active** (`{colors.danger-active}` — `#a50011`): deeply-pressed destructive.
- **Warning** (`{colors.warning}` — `#ff9f0a`): caution callouts.
- **Warning Hover** (`{colors.warning-hover}` — `#cc7f08`): pressed caution.
- **Warning Active** (`{colors.warning-active}` — `#995f06`): deeply-pressed caution.
- **Success** (`{colors.success}` — `#30d158`): positive confirmation, in-TUI success indicator.

## Typography

### Font Family
**JetBrains Mono** is the monospaced face used across every text role in the system, licensed under the SIL Open Font License 1.1. Use the variable font `JetBrainsMono[wght].ttf` from Google Fonts; its weight axis (100–800) covers the 400 (regular), 500 (medium), and 700 (bold) weights the system uses. It falls back through a long monospace stack — IBM Plex Mono → ui-monospace → SFMono-Regular → Menlo → Monaco → Consolas → Liberation Mono → Courier New.

The single-font decision is the brand. There is no display face, no body sans, no italic alternative, and no fallback to a proportional font anywhere — even the legal copyright row uses JetBrains Mono at 14px. This is the most aggressive typographic restraint of any site in the marketing-tools category: the identity is "the marketing page is a man page."

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 38px | 700 | 1.5 | 0 | Hero headline ("The open source AI coding agent") |
| `{typography.heading-md}` | 16px | 700 | 1.5 | 0 | Section label ("What is OpenCode?", "FAQ", "Built for privacy first") |
| `{typography.body-md}` | 16px | 400 | 1.5 | 0 | Body copy, paragraph text, list-row text, install-snippet code |
| `{typography.body-strong}` | 16px | 500 | 1.5 | 0 | Inline emphasis, primary nav link, tab-label active |
| `{typography.body-tight}` | 16px | 500 | 1 | 0 | Compact label rendered without breathing room |
| `{typography.link-md}` | 16px | 400 | 1.5 | 0 | Inline anchor link in body prose |
| `{typography.button-md}` | 16px | 500 | 2 | 0 | Every button label across the system |
| `{typography.caption-md}` | 14px | 400 | 2 | 0 | Footer link text, badge label, copyright row, chart caption |

### Principles
The hierarchy is built almost entirely from size and weight contrast on a single face. The display headline (38px / 700) and the heading-md label (16px / 700) share a weight; the difference is just size. Body and link share size, weight, and line-height — only context distinguishes them. Buttons get a deliberately tall line-height (2.0) so labels feel calmly spaced inside the 4px-radius rectangle.

### Note on Font Substitutes
JetBrains Mono is free and open source (SIL OFL), so no substitute is needed for licensing reasons. If it fails to load, the fallback stack takes over:
- **IBM Plex Mono** — first fallback in the documented font stack; slightly more open counters but matches line-height behavior.
- **Geist Mono** — modern alternative with similar geometric construction.

When substituting, line-height behavior is preserved by keeping `lineHeight: 1.5` for body and `lineHeight: 2` for buttons — adjusting weight is rarely needed.

## Layout

### Spacing System
- **Base unit:** 8px (with finer 1/2/4px steps available for tight inline gaps).
- **Tokens (front matter):** `{spacing.xxs}` (1px) · `{spacing.xs}` (4px) · `{spacing.sm}` (8px) · `{spacing.md}` (12px) · `{spacing.lg}` (16px) · `{spacing.xl}` (24px) · `{spacing.xxl}` (32px) · `{spacing.section}` (96px).
- **Universal section rhythm:** every page in the set uses `{spacing.section}` (96px) as the vertical gap between major content blocks. This is the largest spacing token in the system and is the dominant layout cue across the home, `/zen`, and `/enterprise` pages.
- **Section internal padding:** content rows inside a section sit at `{spacing.lg}` (16px) vertical with no horizontal padding — text starts flush at the section's left edge.

### Grid & Container
- **Max width:** ~960px content column for body sections; the hero TUI mockup is full-bleed within an outer ~1100px content frame.
- **Two-column split:** `/enterprise` pairs a left text block (~360px wide) with a right-aligned form column (~480px wide). The home page is single-column reading.
- **Footer:** 5-up horizontal link row (GitHub / Docs / Changelog / Discord / X) at desktop, collapsing to 2-up at tablet and 1-up at mobile.

### Whitespace Philosophy
Whitespace is structural and generous. Sections sit 96px apart with no decorative dividers between them — the `{colors.hairline}` 1px rule is the only signal of separation. Inside a section, content is left-flush against the column edge with no internal indentation; bullets use ASCII bracket prefixes (`[+]` / `[-]`) instead of indent-based layout. The result is a page that feels like a printed code listing rather than a styled marketing layout.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | No fill, no border, no shadow; sits directly on `{colors.canvas}` | Default for body sections, list rows, hero text block, footer |
| 1 — Glass low (`{elevation.glass-1}`) | `rgba(255,255,255,0.08)` fill, `backdrop-filter: blur(20px)`, 1px `rgba(255,255,255,0.15)` border, `0 2px 8px rgba(0,0,0,0.24)` shadow | Text inputs, textarea, secondary button, testimonial rows |
| 2 — Glass mid (`{elevation.glass-2}`) | `rgba(255,255,255,0.10)` fill, `backdrop-filter: blur(28px)`, 1px `rgba(255,255,255,0.17)` border, `0 8px 24px rgba(0,0,0,0.32)` shadow | Install snippet, news badge, disabled button, focused input |
| 3 — Glass high (`{elevation.glass-3}`) | `rgba(255,255,255,0.12)` fill, `backdrop-filter: blur(40px)`, 1px `rgba(255,255,255,0.20)` border, `0 16px 48px rgba(0,0,0,0.40)` shadow | Hero TUI mockup, TUI prompt row, primary nav |

Higher elevation means a denser fill, a stronger blur, a brighter border, and a deeper, softer shadow. Section dividers stay 1px `{colors.hairline}` rules (Level 0 content separated by a line, not lifted). Always pair `backdrop-filter` with `-webkit-backdrop-filter` for Safari. Glass needs something behind it to blur: the hero glass sits over the `{colors.surface-dark}` (#0a0f1e) elevated-background band, and the nav blurs page content as it scrolls beneath.

### Decorative Depth
Depth comes from typography density, the glass elevation ladder, and the single TUI mockup:
- **ASCII block-pixel wordmark** — the OpenCode brand name rendered as a 5-row block of monospaced character cells, used in the primary nav and as the centerpiece of the hero TUI mockup.
- **Hero TUI mockup** — full-bleed level-3 glass rectangle over the elevated background, containing a faux terminal interface: ASCII wordmark, a `tui-prompt-row` showing a Build command line, and `tab switch agent` / `ctrl-p commands` keybinding hints in `{colors.ash}` at the bottom edge.
- **Chart tiles** — three thin-line ASCII charts inside the home page's "open source AI coding agent" stat block, with abstract dotted/sparse-line plots in `{colors.body}` against the canvas. Captions sit beneath in `{typography.caption-md}` (`Fig 1. 150K GitHub Stars`, `Fig 2. 850 Contributors`, `Fig 3. 6.5M Monthly Devs`).

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Sections, hero TUI mockup, primary nav, footer, list rows — every container that isn't a button |
| `{rounded.sm}` | 4px | Every interactive element — primary CTA, secondary CTA, text inputs, install snippet, badges, prompt rows |
| `{rounded.full}` | 9999px | Avatar circles in testimonials |

The radius vocabulary is two values: 4px for interactive elements and 0px for everything else. Avatar circles in testimonial rows are the only fully-rounded element in the system.

### Photography Geometry
There is no photography. Visual elements are limited to:
- **ASCII block-pixel wordmark** in the nav and hero TUI mockup.
- **Inline ASCII charts** inside the stat-block section — abstract sparse-line and dotted plots without specific data points.
- **Avatar dots** (~32px) inside testimonial rows on `/zen` — flat colored circles in `{rounded.full}`.
- **In-product icons** (kbd, A+, ⊕, ↻, K, Z) rendered as small monospaced character glyphs, not bitmaps or SVG.

## Components

> **No hover states documented** per system policy. Each spec covers Default and Active/Pressed only.

### Buttons

**`button-primary`** — the universal OpenCode CTA
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button-md}`, padding `4px 20px`, height ~36px, rounded `{rounded.sm}` (4px).
- Used for "Download" (top nav), "Get started with Zen", "Send" (enterprise contact form), "Subscribe" (newsletter footer), "Read docs →".
- Pressed state lives in `button-primary-active` — background dims to `{colors.ink-deep}`.

**`button-secondary`** — outlined alternative
- Level-1 glass: background `{colors.surface-soft}` (8% white), `blur(20px)`, 1px solid `{colors.hairline}` border, soft level-1 shadow; text `{colors.ink}`, type `{typography.button-md}`, padding `4px 20px`, rounded `{rounded.sm}`.
- Lower-emphasis CTA — appears beside the primary fill where two actions are paired.

**`button-tab`** + **`button-tab-active`** — install-tab strip
- Default: transparent background, text `{colors.mute}`, type `{typography.button-md}`, padding `8px 16px`, rounded `{rounded.none}`.
- Active: same surface, text `{colors.ink}`, with a 2px `{colors.ash}` bottom underline indicating selection.
- Used in the install-method tab strip on the home page (`curl` / `npm` / `bun` / `brew` / `yay`).

**`button-disabled`**
- Level-2 glass: background `{colors.surface-card}` (10% white), `blur(28px)`, 1px 17% white border; text `{colors.ash}`, rounded `{rounded.sm}`.

### Badges & Chips

**`badge-news`** — small glass chip in the news/announcement strip
- Level-2 glass: background `{colors.surface-card}` (10% white), `blur(28px)`, 1px 17% white border, soft level-2 shadow; text `{colors.on-dark}`, type `{typography.caption-md}`, padding `2px 8px`, rounded `{rounded.sm}`.
- Sits inline with body copy as a "News" / "Beta" / "Live now" tag on the home page above the hero headline.

**`badge-section-label`** — bracketed section header
- Background transparent, text `{colors.ink}`, type `{typography.heading-md}`, rounded `{rounded.none}`.
- Renders as a bare `**Heading**` line above a 1px `{colors.hairline}` rule with no chip background — but the way the text reads ("[+]", "[x]", `What is OpenCode?`) makes it function as a label component.

### Inputs & Forms

**`text-input`** + **`text-input-focused`**
- Default: level-1 glass — background `{colors.surface-soft}` (8% white), `blur(20px)`, 1px solid `{colors.hairline}`, soft level-1 shadow; text `{colors.ink}`, type `{typography.body-md}`, padding `8px 12px`, height ~40px, rounded `{rounded.sm}`.
- Focused: rises to level-2 glass — background `{colors.surface-card}` (10% white), `blur(28px)` — and the border becomes 1px solid `{colors.ink}` (a flat focus signal — no halo, no glow).
- Used for every contact-form field on `/enterprise` (Full name, Role, Company, Company email, Phone number) and the newsletter email field at the home page footer.

**`textarea`**
- Level-1 glass: background `{colors.surface-soft}` (8% white), `blur(20px)`, 1px solid `{colors.hairline}`, soft level-1 shadow; text `{colors.ink}`, type `{typography.body-md}`, padding `12px`, rounded `{rounded.sm}`.
- "What problem are you trying to solve?" multi-line textarea on `/enterprise`.

**`install-snippet`** — the home page's signature install code block
- Level-2 glass: background `{colors.surface-card}` (`rgba(255,255,255,0.10)`), `blur(28px)`, 1px 17% white border, soft level-2 shadow; text `{colors.ink}` rendered in `{typography.body-md}` (already monospaced — JetBrains Mono), padding `12px 16px`, rounded `{rounded.sm}`.
- Contains the literal `curl -fsSL https://opencode.ai/install | bash` command with a small copy-icon at the right edge. Sits below the install-method tab strip.

### Cards & Containers

**`hero-tui-mockup`** — the home page's signature TUI preview
- Container: full-bleed level-3 glass — background `{colors.surface-dark-elevated}` (12% white), `blur(40px)`, 1px `{colors.hairline-strong}` border, `0 16px 48px rgba(0,0,0,0.40)` shadow — set over a `{colors.surface-dark}` (#0a0f1e) elevated-background band; padding `64px 32px`, rounded `{rounded.none}`.
- Contents (top → bottom): ASCII block-pixel "OPENCODE" wordmark centered in `{colors.on-dark}`; a `{component.tui-prompt-row}` showing a "Build" command line with model selector text; an `tab switch agent  ctrl-p commands` keybinding hint row at the bottom in `{colors.ash}`.

**`tui-prompt-row`** — the inset command line inside the TUI mockup
- Level-3 glass: background `{colors.surface-dark-elevated}` (`rgba(255,255,255,0.12)`), `blur(40px)`, 1px 20% white border; text `{colors.on-dark}` in `{typography.body-md}`, padding `8px 12px`, rounded `{rounded.sm}`.
- Renders an inline command (`Build  Claude Opus 4.5  OpenCode Zen`) with a leading vertical pipe and the model name styled as a bracketed token.

**`list-row`** — feature/benefit row with ASCII bracket bullet
- Background `{colors.canvas}`, text `{colors.body}` in `{typography.body-md}`, padding `8px 0`.
- Each row begins with a `[+]` / `[-]` / `[x]` ASCII marker followed by a bold label and a regular description: e.g., `[+] LSP enabled    Automatically loads the right LSPs for the IDE`. The bracket marker is part of the text content, not a separate icon.

**`faq-row`** — FAQ entry with bracket toggle
- Background `{colors.canvas}`, text `{colors.ink}` in `{typography.body-md}`, padding `12px 0`, with a 1px `{colors.hairline}` bottom rule.
- Each row leads with `+` / `−` ASCII markers indicating expand/collapse state. Always rendered as plain text rows — no chevron icons, no animated accordion chrome.

**`testimonial-row`** — `/zen` peer-quote row
- Level-1 glass: background `{colors.surface-soft}` (8% white), `blur(20px)`, 1px `{colors.hairline}` border, soft level-1 shadow; text `{colors.body}` in `{typography.body-md}`, padding `16px 20px`, rounded `{rounded.sm}`.
- Layout: a 32px avatar circle (`{rounded.full}`) at left, name + role + company in `{typography.body-strong}` on the first line, quote in `{typography.body-md}` `{colors.body}` on the second line.

**`chart-tile`** — the stat-block sparse-line chart
- Background `{colors.canvas}`, text `{colors.body}` in `{typography.caption-md}`, rounded `{rounded.none}`, padding `16px`.
- Contains an inline SVG/CSS-drawn ASCII-style sparse-line plot (dotted, abstract — never specific data points) with a `Fig N. <stat label>` caption beneath in `{colors.mute}`.

### Navigation

**`primary-nav`**
- Level-3 glass: background `{colors.surface-dark-elevated}` (12% white), `blur(40px)`, 1px `{colors.hairline-strong}` bottom border, soft level-3 shadow; text `{colors.ink}` in `{typography.body-strong}`, height ~56px, rounded `{rounded.none}`.
- Layout (desktop): block-pixel ASCII OpenCode wordmark at left (~120×24px), nav links cluster center-right ("GitHub [150K] · Docs · Zen · Go · Enterprise"), `{component.button-primary}` "Download" CTA at the far right with a small download glyph.

**Top Nav (Mobile)**
- ASCII wordmark stays at left, nav links collapse into a hamburger drawer at the right. The Download CTA remains visible at every breakpoint.

### Footer

**`footer-section`**
- Background `{colors.canvas}`, text `{colors.body}` in `{typography.caption-md}`, padding `32px 0`, with a 1px `{colors.hairline}` top rule.
- Top row: 5-column horizontal link grid (GitHub [150K] · Docs · Changelog · Discord · X), each rendered as a centered cell separated by 1px `{colors.hairline}` vertical rules.
- Bottom row: `©2026 Anomaly` copyright at left, `Brand · Privacy · Terms · English ▼` utility cluster at right, all in `{typography.caption-md}` `{colors.mute}`.

### Inline

**`link-inline`** — body-prose anchor link
- `{colors.ink}` text with underline. The brand's only link affordance — even links inside body paragraphs use ink color rather than `{colors.accent}` blue. Apple Blue is reserved for the in-product TUI.

## Do's and Don'ts

### Do
- Render every text role in JetBrains Mono (variable font, `JetBrainsMono[wght].ttf`). The single-font decision is the entire identity.
- Keep `{colors.canvas}` (`#050810`) as the only body background. Don't introduce gray section bands.
- Use ASCII bracket markers (`[+]`, `[-]`, `[x]`, `+`, `−`) as bullets, toggles, and section glyphs. They are the brand's only iconography.
- Anchor the `{component.hero-tui-mockup}` exactly once per landing page as the hero centerpiece. Never use the elevated-background band for body content.
- Reserve `{colors.accent}` (Apple Blue) and the rest of the semantic ramp for in-TUI states; marketing chrome stays monochrome.
- Use `{rounded.sm}` (4px) on every interactive element and `{rounded.none}` (0px) on every container.
- Stack content sections at `{spacing.section}` (96px) rhythm with only 1px `{colors.hairline}` rules between them.
- Pick the glass level by elevation: stronger blur, denser fill, brighter border, and deeper shadow as an element rises.

### Don't
- Don't introduce a sans-serif body font, a display face, or an italic style. JetBrains Mono carries everything.
- Don't use opaque surface fills, gradients, or atmospheric backgrounds for raised elements. Surfaces are glass on the `#050810` canvas.
- Don't replace the ASCII bracket markers with SVG icons. The brackets are the icons.
- Don't use the semantic accent ramp (`{colors.accent}`, `{colors.warning}`, `{colors.danger}`, `{colors.success}`) on marketing CTAs. They belong to the in-product TUI.
- Don't pad cards with 24px+ internal padding. List rows sit at 8px vertical; FAQ rows at 12px.
- Don't render the OpenCode wordmark as a vector logo. It is always block-pixel ASCII.
- Don't fill the hero TUI mockup with photography or illustration. It is text-only and always shows a faux terminal command line.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| desktop-large | 1280px+ | Default — 960px content column, 5-up footer link grid |
| desktop | 1024px | Same layout; nav remains horizontal |
| tablet | 850px | Footer collapses to 2-up grid; `/enterprise` two-column form stacks |
| tablet-narrow | 768px | Primary nav becomes hamburger drawer; Download CTA stays visible |
| mobile | 640px | Single-column everything; hero display drops 38px → ~28px; section padding tightens |

### Touch Targets
All interactive elements meet WCAG AA at the ~36–40px height range. `{component.button-primary}` sits at ~36px with 20px horizontal padding. `{component.text-input}` and `{component.textarea}` sit at ~40px. `{component.button-tab}` rows in the install-method strip sit at ~32–36px depending on label length but extend to a full 44px tappable cell via inline padding. Footer links use `{typography.caption-md}` (14px) but receive ~28px line-height (caption-md is 2.0) plus 8px vertical padding for a comfortable ~44px tappable row.

### Collapsing Strategy
- **Primary nav:** desktop horizontal cluster → tablet-narrow hamburger drawer at 768px. The light "Download" CTA stays visible at all widths.
- **Hero TUI mockup:** maintains its full-bleed glass surface at every breakpoint; the ASCII wordmark scales proportionally and the keybinding-hint row may wrap to two lines on narrow screens.
- **Install snippet + tab strip:** desktop fixed-width pill → mobile full-width pill with horizontal scroll on the tab strip if labels overflow.
- **Footer:** 5-up horizontal link grid → 2-up at tablet → 1-up at mobile (each link becomes a full-width row).
- **`/enterprise` two-column layout:** desktop 50/50 → tablet stacks to single-column with the form below the text block.
- **Section padding:** `{spacing.section}` (96px) desktop → 64px tablet → 48px mobile.
- **Hero headline:** `{typography.display-xl}` (38px) at desktop, scaling to ~28px at mobile, line-height holding at 1.5.

### Image Behavior
There are no raster images in the system aside from the favicon and OG share image. Every visual element — wordmarks, charts, icons — is rendered as type or inline SVG and scales without aspect-ratio considerations.

## Iteration Guide

1. Focus on ONE component at a time. Pull its YAML entry and verify every property resolves.
2. Reference component names and tokens directly (`{colors.ink}`, `{component.hero-tui-mockup}`, `{rounded.sm}`, `{elevation.glass-2}`) — do not paraphrase.
3. Run `npx @google/design.md lint DESIGN.md` after edits — `broken-ref`, `contrast-ratio`, and `orphaned-tokens` warnings flag issues automatically.
4. Add new variants as separate component entries (`-active`, `-disabled`) — do not bury them inside prose.
5. Default body to `{typography.body-md}`; reach for `{typography.body-strong}` for emphasis; reserve `{typography.display-xl}` strictly for the page-top hero headline.
6. Keep `{colors.surface-dark}` scarce — at most one full-bleed elevated-background band per page. It is a narrative device, not a chrome treatment.
7. When introducing a new component, ask whether it can be expressed with the existing ASCII-bracket + 4px-radius + JetBrains-Mono + three-level-glass vocabulary before adding new tokens. The system's strength is that it almost never needs new ones.

## Known Gaps

- **Mobile screenshots not captured** — responsive behavior synthesizes OpenCode's mobile pattern (hamburger drawer, single-column, footer accordion) from desktop evidence and the breakpoint stack.
- **Hover states not documented** by system policy.
- **In-product TUI screenshots** beyond the marketing hero mockup are not in the captured set; the actual `opencode` terminal interface (full keybindings, panels, status bar) is not documented here.
- **`/go` page** not extracted — the marketing page for the Go SDK likely shares the same chrome but introduces code-sample blocks not documented above.
- **Form validation state styling** (success / error inline messages) not present in the captured surfaces.
