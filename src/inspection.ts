import type { ExecutionSnapshot, ScenarioDescriptor } from "./core/core.js";

export interface ScenarioCatalogEntry {
  readonly storyId: string;
  readonly scenario: ScenarioDescriptor;
  readonly title?: string;
  readonly name?: string;
}
export interface ScenarioCatalog {
  readonly protocolVersion: 1;
  readonly entries: readonly ScenarioCatalogEntry[];
}

/** Explicit metadata only: does not import stories, build fixtures or run setup. */
export function createScenarioCatalog(entries: readonly ScenarioCatalogEntry[]): ScenarioCatalog {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.storyId.trim() || entry.storyId.trim() !== entry.storyId || ids.has(entry.storyId))
      throw new Error(`Missing or duplicate catalog story ID: ${entry.storyId}`);
    if (entry.scenario.protocolVersion !== 1) throw new Error("Unsupported descriptor protocol");
    ids.add(entry.storyId);
  }
  return structuredClone({
    protocolVersion: 1,
    entries: [...entries].sort((a, b) =>
      a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0,
    ),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Enrich explicit catalog entries from the tested Storybook public index-v5 format. */
export function resolveScenarioCatalog(catalog: ScenarioCatalog, index: unknown): ScenarioCatalog {
  if (!isRecord(index) || index.v !== 5 || !isRecord(index.entries))
    throw new Error("Expected a Storybook index.json with version 5 and entries");
  const stories = index.entries;
  return createScenarioCatalog(
    catalog.entries.map((entry) => {
      const story = Object.hasOwn(stories, entry.storyId) ? stories[entry.storyId] : undefined;
      if (
        !isRecord(story) ||
        story.type !== "story" ||
        story.id !== entry.storyId ||
        typeof story.title !== "string" ||
        typeof story.name !== "string"
      )
        throw new Error(
          `Catalog story is missing or invalid in the Storybook index: ${entry.storyId}`,
        );
      return { ...entry, title: story.title, name: story.name };
    }),
  );
}

export interface ObservedScenario {
  readonly storyId: string;
  readonly execution: ExecutionSnapshot;
}
export interface InspectionTarget {
  readonly storyId: string;
  readonly executionId?: string;
  /** Defaults to the declaration's checkpoints, plus play-complete. */
  readonly checkpoints?: readonly string[];
}
export type InspectionCode =
  | "instrumentation-missing"
  | "no-execution"
  | "unsupported-protocol"
  | "wrong-story"
  | "execution-replaced"
  | "execution-failed"
  | "execution-disposed"
  | "checkpoint-failed"
  | "checkpoints-pending"
  | "execution-pending"
  | "ready";
export interface ScenarioInspection {
  readonly status: "waiting" | "blocked" | "ready";
  readonly code: InspectionCode;
  readonly message: string;
  readonly executionId?: string;
  readonly pendingCheckpoints: readonly string[];
}

/** Pure assessment of a typed protocol-v1 observation, not a browser wait or a JSON parser. */
export function inspectScenario(
  observed: ObservedScenario | null | undefined,
  target: InspectionTarget,
): ScenarioInspection {
  function result(
    status: ScenarioInspection["status"],
    code: InspectionCode,
    message: string,
    pendingCheckpoints: readonly string[] = [],
  ): ScenarioInspection {
    return {
      status,
      code,
      message,
      pendingCheckpoints,
      ...(observed ? { executionId: observed.execution.executionId } : {}),
    };
  }
  if (observed === undefined)
    return result(
      "blocked",
      "instrumentation-missing",
      "Scenarios bridge is absent; install it in the preview or select an instrumented story.",
    );
  if (observed === null)
    return result("waiting", "no-execution", "No mounted scenario execution is available.");
  const run = observed.execution;
  if (run.protocolVersion !== 1 || run.descriptor.protocolVersion !== 1)
    return result(
      "blocked",
      "unsupported-protocol",
      "The observation uses an unsupported protocol version.",
    );
  if (observed.storyId !== target.storyId)
    return result(
      "waiting",
      "wrong-story",
      `Waiting for story ${target.storyId}; observed ${observed.storyId}.`,
    );
  if (target.executionId !== undefined && run.executionId !== target.executionId)
    return result(
      "blocked",
      "execution-replaced",
      "The selected execution was replaced; discard its evidence and select the new run.",
    );
  if (run.status === "failed" || run.diagnostics.length > 0)
    return result(
      "blocked",
      "execution-failed",
      "The execution failed; inspect its diagnostics and remount for a fresh run.",
    );
  if (run.disposed || run.status === "disposed")
    return result(
      "blocked",
      "execution-disposed",
      "The execution was disposed; select a mounted run.",
    );
  const required = new Set([
    ...(target.checkpoints ?? run.descriptor.checkpoints ?? []),
    "play-complete",
  ]);
  const pending = [
    ...new Set([
      ...[...required].filter(
        (name) =>
          !run.checkpoints.some(
            (checkpoint) => checkpoint.name === name && checkpoint.status === "ready",
          ),
      ),
      ...run.checkpoints
        .filter((checkpoint) => checkpoint.status === "running")
        .map((checkpoint) => checkpoint.name),
    ]),
  ];
  if (run.checkpoints.some((checkpoint) => checkpoint.status === "failed"))
    return result(
      "blocked",
      "checkpoint-failed",
      "A checkpoint failed; remount for a fresh run.",
      pending,
    );
  if (pending.length > 0)
    return result(
      "waiting",
      "checkpoints-pending",
      `Waiting for checkpoints: ${pending.join(", ")}.`,
      pending,
    );
  if (run.status !== "ready")
    return result("waiting", "execution-pending", `Execution is ${run.status}.`);
  return result(
    "ready",
    "ready",
    "Required checkpoints are ready; apply the capture tool's paint and asset barriers.",
  );
}

export interface ScenarioEvidence {
  readonly protocolVersion: 1;
  readonly storyId: string;
  readonly executionId: string;
  readonly sourceRevision: string;
  readonly descriptor: ScenarioDescriptor;
  readonly factories: ExecutionSnapshot["factories"];
  readonly checkpoints: readonly string[];
}

/** Metadata to associate with externally captured evidence; never includes fixture payloads. */
export function createScenarioEvidence(
  observed: ObservedScenario,
  options: { readonly sourceRevision?: string; readonly checkpoints?: readonly string[] } = {},
): ScenarioEvidence {
  const inspection = inspectScenario(observed, {
    storyId: observed.storyId,
    ...(options.checkpoints !== undefined ? { checkpoints: options.checkpoints } : {}),
  });
  if (inspection.status !== "ready") throw new Error(inspection.message);
  const declaredRevision = observed.execution.sourceRevision;
  if (
    declaredRevision !== undefined &&
    options.sourceRevision !== undefined &&
    declaredRevision !== options.sourceRevision
  )
    throw new Error("Evidence source revision conflicts with the execution's source revision");
  const sourceRevision = options.sourceRevision ?? declaredRevision;
  if (!sourceRevision || sourceRevision.trim() !== sourceRevision || sourceRevision.length > 200)
    throw new Error(
      "Evidence requires a nonempty, trimmed source revision of at most 200 characters",
    );
  return structuredClone({
    protocolVersion: 1,
    storyId: observed.storyId,
    executionId: observed.execution.executionId,
    sourceRevision,
    descriptor: observed.execution.descriptor,
    factories: observed.execution.factories,
    checkpoints: [
      ...new Set([
        ...(options.checkpoints ?? observed.execution.descriptor.checkpoints ?? []),
        "play-complete",
      ]),
    ],
  });
}
