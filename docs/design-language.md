# Design Language — HTML Games Collection

Shared token reference for the retro-arcade look. Derived from the root landing
page (`index.html`) and the strongest existing game styles (Snake, 2048, Pong).
Apply these tokens when restyling a game; keep each game's own accent color.

## Neutrals & background treatment

| Token | Value | Use |
|---|---|---|
| `--bg-top` | `#1a0e00` | top of page gradient |
| `--bg-bottom` | `#080400` | bottom of page gradient, canvas backdrop |
| `--panel` | `rgba(20, 10, 0, 0.78)` | topbar / playfield / control panels |
| `--panel-strong` | `rgba(25, 12, 0, 0.92)` | stat cards, nested surfaces |
| `--panel-border` | `rgba(<accent-rgb>, 0.28)` | 1px borders on every panel |
| `--text-main` | `#fef9f0` | titles, HUD values, body text |
| `--text-dim` | `#c4a46b` | labels, hints, secondary text (AA on all panels) |
| `--shadow` | `0 18px 40px rgba(8, 3, 0, 0.34)` | panel drop shadow |

Page background (every page):

```css
background:
  radial-gradient(circle at top, rgba(var(--accent-rgb), 0.12), transparent 34%),
  radial-gradient(120% 70% at 50% 110%, rgba(var(--accent-rgb), 0.05), transparent 60%),
  linear-gradient(180deg, var(--bg-top) 0%, var(--bg-bottom) 100%);
```

Do not use `--text-faint` (`#8a6939`) for text — it fails WCAG AA on the dark
panels. Minimum text color is `--text-dim`.

## Per-game accent colors

Each game keeps one accent (`--accent` + `--accent-rgb` in its `src/styles.css`).
Current values:

| Game | Accent | Notes |
|---|---|---|
| Landing page | `#f59e0b` amber | collection identity color |
| Brick Breaker | `#f59e0b` amber | |
| Tetris | `#f59e0b` amber | |
| 2048 | `#f59e0b` amber | gold tile ramp `#3d2a0a → #fffbeb` |
| Snake | `#f59e0b` amber | canvas snake drawn in `#f59e0b`/`#d97706` |
| Asteroids | `#f59e0b` amber | |
| Pinball | `#f59e0b` amber | |
| Space Invaders | `#22d3ee` cyan | |
| Sokoban | `#f59e0b` amber | |
| Pong | `#f59e0b` amber | warm button ramp `#fb923c → #c2410c` |
| Pac-Man | `#ffff00` yellow | |
| Minesweeper | `#f59e0b` amber | |

The accent drives: panel borders, canvas frame + glow, button gradient
(`linear-gradient(180deg, var(--accent), <darker shade>)`), focus rings, title
glow, and milestone status tones. Warning/danger tone is `#fb7185` everywhere.

## Type scale

Font stack: `"Trebuchet MS", "Segoe UI", sans-serif`.

| Role | Size / weight | Treatment |
|---|---|---|
| Landing page title | `clamp(28px, 8vw, 48px)` / 700 | uppercase, `letter-spacing: 0.06em`, accent + glow |
| Game title (topbar) | `22px` desktop, `19px` mobile / 700 | `line-height: 1` |
| Tagline / page subtitle | `14px` / 400 | `--text-dim` |
| Eyebrow / HUD label / control label | `11px` / 700 | uppercase, `letter-spacing: 0.12em`, `--text-dim` |
| HUD value | `18px` desktop, `16px` mobile / 700 | `font-variant-numeric: tabular-nums` |
| Status line | `16px` desktop, `14px` mobile / 700 | `line-height: 1.25` |
| Button | inherit (≈14–15px) / 700 | sentence case |
| Hint / fine print | `12px` / 400 | `--text-dim` |

Always set `font-variant-numeric: tabular-nums` on numeric HUD values so
scores do not jitter as digits change.

## Spacing scale

8px rhythm with a 4px half-step: **4, 8, 12, 16, 24, 32**.

- Shell padding: `12px` desktop, `8px` mobile; shell gap `8px` (mobile `6px` is
  an allowed compression step on `100svh` layouts).
- Panel padding: `12px` desktop, `8px` mobile. Stat-card padding `8px 12px`.
- HUD grid gap: `8px` desktop, `4px` mobile.
- Section gaps on the landing page: `32px`.

## Border-radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `8px` | inner cells, tiles |
| `--radius-md` | `12px` | buttons, stat cards (mobile) |
| `--radius-lg` | `14px` | stat cards, control buttons |
| `--radius-xl` | `16px` | canvas / board frame, panels (mobile) |
| `--radius-panel` | `18px` | topbar, playfield, thumb zones (desktop) |
| pill | `999px` | round d-pad buttons, pill actions |

## Button states

Base: 1px accent border, accent gradient fill, `--text-main`-on-accent ink
(`#fff7ed`), `inset 0 1px 0 rgba(255,255,255,0.18)` top highlight,
`min-height: 44px` and `min-width: 44px` for any touch control.

| State | Treatment |
|---|---|
| default | as above; `cursor: pointer` |
| hover | `filter: brightness(1.08)`; panels/cards may lift `translateY(-1px)` with stronger glow |
| active / pressed | `transform: translateY(1px)`; remove top highlight (`inset 0 1px 2px rgba(0,0,0,0.35)`); `filter: brightness(0.95)` |
| focus-visible | `outline: 2px solid var(--accent); outline-offset: 2px` (never remove outline without replacement) |
| disabled | `opacity: 0.45; cursor: not-allowed; filter: none; transform: none` |

Secondary/ghost buttons (e.g. "Back"): transparent fill, `--panel-border`
border, `--text-dim` ink; hover raises ink to `--text-main` and border to
accent.

## Canvas / board framing

```css
border: 1px solid rgba(var(--accent-rgb), 0.35);
border-radius: 16px;
background: var(--bg-bottom);
box-shadow:
  inset 0 0 0 1px rgba(var(--accent-rgb), 0.06),
  0 0 18px rgba(var(--accent-rgb), 0.1);
```

The glow stays subtle (alpha ≤ 0.12). Never draw page chrome over the canvas;
touch controls live in their own zones outside the board.

## Motion rules

- Transition only `transform`, `box-shadow`, `border-color`, `filter`,
  `background-color`, `color`, `opacity` — never layout properties.
- Durations: 120–180ms, `ease` / `ease-out`. Gameplay feedback animations
  (tile pop/merge) ≤ 200ms.
- Hover lifts are ≤ 2px translateY; no looping or attention-seeking animation.
- Respect reduced motion in every stylesheet:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
