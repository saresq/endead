# Endead — Design System Tokens

Single source of truth: `src/styles/tokens.css`.

The PIXI canvas renderer uses a parallel hex-literal table at
`src/client/config/BoardTheme.ts`. CSS vars are unreadable from PIXI, so the
two are hand-kept in sync — the comments in `BoardTheme.ts` reference the
matching CSS token name. When you change a palette anchor in `tokens.css`,
update the corresponding entry in `BoardTheme.ts`.

## Naming

The Field Manual palette uses a `--{role}-{step}` convention. **Use these
canonical names in all new code.** The deprecated aliases at the bottom of
`tokens.css` (`--surface-0..5`, `--accent`, `--accent-bright`,
`--accent-hover`, `--text-primary`, `--text-secondary`) are a migration
shim only and will be removed in a future cleanup.

```css
/* OLD — do not use in new code */
color: var(--text-primary);
background: var(--surface-2);

/* NEW — canonical Field Manual names */
color: var(--bone-100);
background: var(--bg-2);
```

> **Not deprecated:** the four alpha-tinted tokens `--accent-muted`,
> `--accent-glow`, `--accent-border`, and `--surface-inset` are
> **canonical semantic tokens**, not legacy aliases. They encode an
> opacity tint that has no direct role/step equivalent. Keep using them
> and do not rename.

### Role / step palette

| Role        | Steps                              | Purpose                          |
|-------------|------------------------------------|----------------------------------|
| `--bg-*`    | `bg-0` (body) → `bg-3` (input)     | Background surface tiers.        |
| `--olive-*` | `olive-300`, `500`, `700`, `900`   | Cool olive structural ramp.      |
| `--rust-*`  | `rust-300`, `400`, `500`, `700`    | Warning / corrosion ramp.        |
| `--amber-*` | `amber-200`, `400`, `500`          | Brand accent ramp (amber CTAs).  |
| `--bone-*`  | `bone-100` (text), `300`, `500`    | Bone-white text ramp.            |

The number is a luminance step, not a saturation step — higher = brighter.

### Semantic tokens (canonical)

Layered on top of the role/step palette. Use these when the role IS the
meaning, not a raw color:

- Status: `--success`, `--danger`, `--warning`, `--info`
- HUD: `--hud-phosphor`, `--hud-amber`, `--hud-readout-bg`
- Surfaces: `--card-bg`, `--modal-bg`, `--menu-bg`
- Text: `--text-muted`, `--text-disabled`, `--text-inverse`, `--text-danger-red`
- Alpha tints: `--accent-muted`, `--accent-glow`, `--accent-border`,
  `--surface-inset` (these encode an opacity, not a hue step — keep using them)
- Atmosphere: `--hazard`, `--ready`, `--grain-url`, `--rust-url`

### Deprecated aliases (migration shim)

The token file keeps a wired-up alias block so any unmigrated surface still
resolves. Do **not** target these in new code:

| Deprecated         | Canonical replacement |
|--------------------|-----------------------|
| `--surface-0`–`-3` | `--bg-0`–`-3`         |
| `--surface-4`      | `--olive-700`         |
| `--surface-5`      | `--olive-500`         |
| `--accent`         | `--amber-400`         |
| `--accent-bright`  | `--amber-200`         |
| `--accent-hover`   | `--amber-500`         |
| `--text-primary`   | `--bone-100`          |
| `--text-secondary` | `--bone-300`          |

Component CSS under `src/styles/components/`, `src/styles/base.css`,
`src/styles/layout.css`, and `src/styles/utilities.css` has been migrated.
The aliases survive only for reference assets in `handoff/` and any
third-party-shaped overlay we may wire in later.

## Noise overlay coverage

Comment block in `tokens.css` lists which surfaces get the grain overlay
and which intentionally don't. Mirror those rules in any component that
applies grain locally (don't redefine the policy per file).

## Animation

- Compositor-friendly only: `transform`, `opacity`, `clip-path`, sparingly
  `filter`.
- Respect `prefers-reduced-motion` — the global rule in `base.css` neutralises
  durations; new animations should not bypass it.
- Standard durations live in tokens (`--duration-fast`, `-normal`, `-slow`).
