---
name: cdp-verification
description: Verify UI behavior end-to-end by driving the running desktop app over the Chrome DevTools Protocol. Use when asked to verify, reproduce, or confirm a UI change, bug, or regression in the real app rather than in tests.
---

# CDP UI Verification

"Rules" below is what counts as valid evidence. "Mechanics" is how to attach to the right renderer
and repair auth. 

## Rules

1. **Target the correct app instance.** Confirm and report the worktree, renderer URL/port, and
   active route before testing. Follow any task-provided CDP/auth guidance and verify the expected
   signed-in session. Another running desktop instance is not equivalent.

2. **Reproduce the exact user journey.** Use real browser input and visible UI navigation for the
   steps the user performs. Assigning DOM properties, invoking internal app APIs, or running
   component-only scripts is diagnostic support, not proof of end-to-end behavior.

3. **Capture visual and numeric evidence.** Take before/after screenshots paired with relevant CDP
   measurements (`scrollTop`, focused element, route, persisted state). Confirm the screenshot and
   the measured state agree.

4. **Exercise the relevant lifecycle.** Include the actual route change, workspace/pane/file switch,
   remount, or close/reopen from the report. A narrower synthetic flow cannot substitute for the
   reported interaction.

5. **Treat a mismatch as an incomplete reproduction.** If the test passes but the user still observes
   the bug, re-check the target instance, exact steps, input method, persisted keys, and lifecycle
   timing. Reproduce the failure before changing code; a synthetic smoke test does not disprove the
   report.

6. **Use an evidence gate.** For a reported bug or regression, do not claim verification until the
   original interaction demonstrably fails before the fix and passes after it under the same
   observations. For a new feature, record equivalent baseline evidence and demonstrate the expected
   behavior. State clearly which checks were end-to-end, which were synthetic, and whether
   screenshots were actually captured.

7. **Test in the real layout, not a staged one.** Do not rearrange the UI to make coordinates
   convenient (e.g. moving a target project next to the section under test) and then generalize from
   that pass. Layout-dependent failures live exactly in the configurations a staged setup removes:
   elements far apart, ambiguous zones between valid targets, scrolled containers, collapsed/empty
   states. Verify in the user's actual data shape; if a mutation was needed for setup, rerun the key
   journey in the unstaged arrangement too.

   Case study: sidebar drag-and-drop passed every staged test, then crashed with "Maximum update
   depth exceeded" in the real layout because closest-target collision oscillated across the large
   gap between the Pinned section and a bottom-of-list project.

8. **Drive interactions adversarially, not just happy-path.** A scripted A-to-B gesture proves the
   feature works once, not that it is stable. For anything continuous (drag-and-drop, resize,
   scroll-linked UI), also test: back-and-forth oscillation across boundaries, mid-gesture dwells
   (hold still 0.5-1s where layout can shift under a stationary pointer), long sweeps that trigger
   autoscroll, repeats of the same gesture, and runs with induced main-thread stalls
   (`setInterval` busy-loop, e.g. 120ms every 400ms) to force event batching. Watch for feedback
   loops where the interaction's own state change re-triggers its trigger (transfer → layout shift →
   re-measure → transfer). Capture `console.error` (hook it and assert empty afterward): "Maximum
   update depth exceeded" and "Cannot update a component while rendering" are regressions even when
   the screenshot looks fine.

## Mechanics

These apply to the Electron desktop app in `apps/desktop` (subsuperset fork, v1 architecture).

1. Launch the dev app with CDP enabled on an unused port: `DESKTOP_AUTOMATION_PORT=9333 bun dev`. The switch is only honored when `NODE_ENV=development` (see `lib/electron-app/factories/app/setup.ts`).
2. Never assume the port. Confirm the Electron process belongs to this checkout (`lsof -nP -iTCP:<port> -sTCP:LISTEN`, then check the PID's command path).
3. Fetch `http://127.0.0.1:<port>/json/list`, pick the `page` target for the app window, and attach to its `webSocketDebuggerUrl` over a WebSocket (Bun built-in, no deps).
4. Use `Runtime.evaluate`, `Input.dispatch*Event` and `Page.captureScreenshot` for the journey and evidence. The app uses local auth only; there is no API/DB stack to repair.
