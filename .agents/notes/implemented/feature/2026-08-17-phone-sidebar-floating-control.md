# Agent Note: Phone Sidebar Floating Control and Overlay Drawer

Status: implemented

English | [中文](2026-08-17-phone-sidebar-floating-control.zh.md)

## Problem

On a phone the sidebar consumed the conversation in both fold states. Expanded, a re-expansion below the 1024px auto-collapse breakpoint rendered as an inline grid track: it passed the 280px default (or a desktop-dragged preference up to 420px) through the concession solver, whose sidebar track never concedes, so the center shrank to `viewport − sidebar` — under 100px on a 375px screen. Collapsed, the 56px control rail still held a full-height grid track, spending a sixth of the viewport on five icons while the reader only wanted the chat.

## Decision

Below 640px (`SIDEBAR_OVERLAY_BREAKPOINT`) the sidebar takes **no grid track in either fold state** (the grid template's first track is 0px), so the center always spans the viewport. AppFrame decides the phone shape before solving, keeping the solver breakpoint-free, and publishes it as `data-sidebar-floating` / `data-sidebar-overlay`.

**Collapsed → one floating button.** The column is absolutely positioned over the center's leading corner at `SIDEBAR_FLOATING_INSET` (36px) with `height: auto`, no fill and no border, so it is only the button's box and every pixel around it stays the conversation's. ui-sidebar renders a single open-the-drawer control for this state (`floating && collapsed`) instead of the rail: painting the rail's other controls over the chat is the very problem, and each one is reachable a tap later inside the drawer. The button carries its own resting fill and rekeys the rail's whale/panel icon swap off `.floatingToggle`, since this state carries no `.collapsed` class.

**Expanded → drawer.** The re-expanded sidebar floats over a full-width center, capped at `min(preference, round(viewport × SIDEBAR_OVERLAY_MAX_RATIO))` (0.85) so a desktop-dragged 420px preference never overflows and a scrim strip stays tappable. A mask scrim (the settings modal's `--dsw-alias-bg-mask-1` + `--dsw-mask-blur`) closes it on tap through `toggleSidebar`. Neither phone state has a resize handle: the drawer's width is capped rather than dragged, and the floating control is not a column edge.

Row chrome that starts at the center's leading edge would otherwise sit under the floating button, so the frame publishes its width as `--dsh-frame-leading-inset` while (and only while) the control floats; the conversation header adds it to its leading pad. The scrollport keeps the full width — reserving space only in the one row that collides is what makes the floating control cheaper than the rail track it replaces.

The `sidebar` owner share gains `floating`. `width` continues to carry the rendered width (the inset while floating, the capped width while open), so ui-workspace and the `sidebar.workspaces`/`sidebar.settings` contracts are untouched.

Between 640px and 1024px the inline behavior is unchanged: a 56px rail and a 280px expanded track both still leave a readable center. `SIDEBAR_AUTO_COLLAPSE` (1024) and the `narrow`/`narrowExpanded` store semantics are untouched.

## Alternatives considered

**Grid auto-placement with an out-of-flow sidebar.** Taking the sidebar column out of flow (`position: absolute`, which both phone states need so the center spans the viewport) also removes it from grid auto-placement, which then shifted every later child up one track: the conversation landed on the 0px sidebar track and the details panel inherited the `1fr` center, so a phone rendered a full-width Details pane and no chat at all. All three columns now pin `grid-column` explicitly (1/2/3), which makes placement independent of which siblings are positioned. jsdom applies no CSS-module styles, so the DOM tests could not see this; `app-frame-styles.client.spec.ts` asserts the pinning against the stylesheet source instead, and it fails if any of the three declarations is dropped.


**Cap the inline width on phones.** The 264px drag floor already exceeds half a 375px screen, so a cap small enough to leave a readable center would truncate the workspace rows; an inline track cannot work below the floor.

**Keep the 56px rail and only float the expanded drawer.** This was the first cut, and it left the reported problem in place: the rail still ate a sixth of a 375px viewport in the state phones spend all their time in.

**Render the floating button in the conversation header instead.** It belongs to the sidebar's fold state, and putting it there would make ui-layout depend on ui-conversation's header slot and duplicate the toggle wiring. Keeping it in the sidebar column leaves the button where its owner already lives; only a CSS custom property crosses to the header.

**Overlay at every narrow width (< 1024px).** Tablets (640–1024px) still get a usable inline center (700 − 280 = 420px), and two narrow-viewport e2e scenarios re-open the sidebar while interacting with the center; a full-viewport scrim there would block those interactions for no phone benefit.

**Auto-close the drawer on session selection.** This would thread a collapse action into the `sidebar.workspaces` contract across ui-sidebar and ui-workspace; the scrim and the toggle already dismiss it, so it is deferred.

## Consequences

- Phones keep a full-width conversation in both fold states; closed costs one 36px button, and open is the standard drawer + scrim pattern.
- The drawer stays open after navigation; the scrim or the collapse toggle dismisses it (recorded as a Known Limitation in the README).
- Three layout constants (`SIDEBAR_OVERLAY_BREAKPOINT`, `SIDEBAR_OVERLAY_MAX_RATIO`, `SIDEBAR_FLOATING_INSET`) live in columns.ts; the concession solver remains breakpoint-free.
- One additive contract field (`SidebarOwnerProps.floating`) and one CSS custom property (`--dsh-frame-leading-inset`, unset off-phone so desktop geometry is byte-identical) cross package boundaries.
- The phone-collapsed state deliberately shows no New Session, search or settings control; all three are one tap away inside the drawer.

## Testing

`app-frame.client.spec.tsx` adds a floating-control describe block beside the drawer one: a phone mounts with a 0px sidebar track, `data-sidebar-floating`, no scrim and no drag handle, and an owner share of `{ collapsed: true, width: 36, floating: true }`; the leading inset is published only while the control floats (dropped once the drawer covers the header); tablets at 700px keep the inline rail with no inset; and widening a phone past the breakpoint restores the rail track. The drawer tests now assert that closing returns to the floating control rather than a 56px rail.

`sidebar-root.client.spec.tsx` adds a phone describe block: the floating state renders exactly one button (routed through `toggleSidebar`) with no New Session capsule and no region/settings/footer seats; opening while still floating restores the full wide shell; and collapsed-without-floating keeps the inline rail's controls. `sidebar-styles.client.spec.ts` covers the floating button's own fill and its rekeyed icon swap.
