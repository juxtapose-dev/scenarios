# Mounted scenario lifecycle

Use `withScenario` when setup resources, mock handlers or named checkpoints must
survive through rendering. Use `withFixtures` when a story only needs data.

## Reset contract

| Action                                                | Fixtures and resources                      | Execution identity | Verification                                     |
| ----------------------------------------------------- | ------------------------------------------- | ------------------ | ------------------------------------------------ |
| Initial Canvas mount                                  | Fresh setup                                 | New                | Play and checkpoints run                         |
| Ordinary Controls/args update                         | Preserved                                   | Same               | Existing result preserved; play is not restarted |
| Reset Controls                                        | Args reset; fixtures/resources preserved    | Same               | Existing result preserved                        |
| Storybook Reload story / remount / Interactions Rerun | Previous run disposed; fresh setup          | New                | Play and checkpoints run again                   |
| Navigate to another story, then return                | Previous run disposed; fresh setup          | New                | Play and checkpoints run again                   |
| Late callback from a previous mount                   | Cannot access or ready the replacement      | Old only           | Rejected or cancelled                            |
| Args update after a run failed or was disposed        | Does not create an unverified replacement   | No new run         | Remount required                                 |
| Setup code changed through HMR                        | Automatic reset is not a verified guarantee | Not guaranteed     | Reload the preview document                      |

Prefer Storybook's existing Reload/Rerun controls over a second reset API. A
Controls reset changes args; it is not a fixture reset. Fixture-only stories have
loader-based lifetime instead; see the fixture-loading guide for that contract.

## How ownership is bound

Storybook 10.6.5 supplies a public `abortSignal` in the render context. It remains
stable during ordinary args rerenders and changes for a fresh mount. The adapter
binds setup and play to that signal, rather than a mutable context object, a
reused DOM element, or a story ID. Two renders of one mount reuse setup and its
cleanup. Stale same-story contexts cannot accidentally select the replacement run.

Play is performed once per mount. Concurrent or repeated direct calls reuse the
same play operation; a fresh replay uses Storybook's remount behavior. Failures
latch to their execution. Cleanup is registered once and runs once. Calls using
an ended binding explain that a remount is required.

This is still single-active-canvas ownership. It does not enable concurrent inline
Docs lifecycles or conflicting MSW handler leases. The inspection protocol and
`current()` retain their unambiguous single-canvas meaning.

When calling the returned hooks directly in a test harness, supply the same
`AbortSignal` to `beforeEach` and `play` for one mount. Supply a new signal for a
remount. Normal Storybook use supplies this automatically.

## Core cancellation

`prepareScenario(definition, { signal })` accepts an application-owned signal.
Cancellation before preparation rejects without building fixtures. Cancellation
during setup aborts the execution and starts its registered cleanup; cancellation
after preparation disposes it. Successful preparation cannot revive an execution
that was disposed while its setup was completing.

The adapter connects Storybook's mount signal to core preparation and disposal.
Application requests and asynchronous work should use `execution.signal` too.
Arbitrary code that ignores cancellation can continue running; it cannot update
the replacement execution through the adapter's stale binding.

## Hooks and failures

Put mounted setup and interaction work in the `withScenario` callbacks. Spreading
another `beforeEach` or `play` over the generated annotations replaces those hooks
and bypasses the contract. Compose ordinary preview/meta setup through Storybook's
normal hook order; avoid shared mutable resources unless their ownership is clear.

A failed preparation retains a detached diagnostic snapshot. A cancelled or
superseded execution cannot replace a newer active record. External capture tools
must still match story and execution IDs and reject failed or disposed runs.
Named readiness does not replace font, asset, animation or paint checks.
