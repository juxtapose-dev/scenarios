# Juxtapose Scenarios capture consumer protocol

Protocol version 1 is a read-only JavaScript bridge in the isolated Storybook
preview document. It is available after Juxtapose Scenarios starts preparing a story or
after explicitly calling `installScenariosBridge()` from preview configuration.
No Juxtapose dependency or integration patch is required.

`window.__JUXTAPOSE_SCENARIOS__?.getActive()` returns null, or:

```json
{
  "storyId": "billing--success",
  "execution": {
    "protocolVersion": 1,
    "scenarioId": "billing-success",
    "executionId": "opaque-runtime-identity",
    "status": "ready",
    "disposed": false,
    "descriptor": {},
    "fixtureKeys": ["customer:primary", "invoice:primary"],
    "checkpoints": [
      { "name": "loaded", "status": "ready", "timeoutMs": 5000 },
      { "name": "play-complete", "status": "ready", "timeoutMs": 5000 }
    ],
    "diagnostics": []
  }
}
```

The descriptor is abbreviated above; actual output includes seed algorithm,
Faker version, locale, fixed instant, seed, flags, experiments, and environment
metadata. A descriptor is not a content hash of callbacks or fixtures. Consumers
must separately record the build/source revision and capture environment.

## Capture algorithm

1. Select the expected Storybook story and wait for a matching active snapshot.
2. Record its execution ID. Reject unsupported protocol versions.
3. Wait for the required checkpoint and `play-complete`. A running checkpoint
   or a missing checkpoint is not readiness. Fail on diagnostics or `failed`.
4. Apply the capture tool's own font, asset, animation, layout, and paint checks.
5. Read again immediately before capture. Require the same story/execution IDs,
   ready status, no diagnostics, and `disposed: false`.
6. Capture. Read again afterward and invalidate the evidence if the execution
   changed, disposed, or failed during capture.

Bound the consumer's wait. Report missing instrumentation separately from a failed
scenario. Never accept a previous story's retained failure or ready record. This
protocol reduces races; it is not an atomic transaction with a browser screenshot.

## Failure and teardown

Failures latch: a later successful predicate does not reset the status. Disposal
aborts the signal and runs cleanup; a failed disposed execution retains failed
status. Late callbacks cannot revive it. The bridge retains the last failed
record for diagnosis until a newer active execution replaces it.

Application requests must be aborted on unmount or execution disposal. MSW cannot
identify an old application's late request once a new handler lease owns the host.
The package does not intercept server-side requests or stop arbitrary asynchronous
code that ignores the abort signal.

## Data handling

Snapshots exclude fixture values, HTTP bodies, headers, query values, and absolute
source paths. They include project-authored metadata and diagnostic messages;
these can contain sensitive data if the application puts it there. Consumers must
apply their own artifact retention and publication policies. Juxtapose Scenarios never
uploads snapshots or communicates with a hosted service.
