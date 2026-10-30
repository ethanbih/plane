/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { addDays, diffDays, scheduleSuccessors } from "./scheduling.ts";

const task = (id, start, end) => ({ id, start, end });
const edge = (predecessorId, successorId) => ({ predecessorId, successorId });
const tasks = [
  task("A", "2026-11-01", "2026-11-03"),
  task("B", "2026-11-04", "2026-11-06"),
  task("C", "2026-11-07", "2026-11-09"),
];
const chain = [edge("A", "B"), edge("B", "C")];
const change = task("A", "2026-11-01", "2026-11-05");

test("pushes the chain preserving inclusive durations and excluding the dragged task", () => {
  assert.deepEqual(scheduleSuccessors(tasks, chain, change), {
    updates: [
      { id: "B", oldStart: "2026-11-04", oldEnd: "2026-11-06", newStart: "2026-11-06", newEnd: "2026-11-08" },
      { id: "C", oldStart: "2026-11-07", oldEnd: "2026-11-09", newStart: "2026-11-09", newEnd: "2026-11-11" },
    ],
    warnings: [],
    cycle: null,
  });
  assert.equal(tasks[1].start, "2026-11-04");
});

test("uses all predecessors, including those outside the downstream subgraph", () => {
  const result = scheduleSuccessors(
    [...tasks, task("P", "2026-11-01", "2026-11-10")],
    [...chain, edge("P", "B")],
    change
  );
  assert.deepEqual(
    result.updates.map(({ id, newStart, newEnd }) => ({ id, newStart, newEnd })),
    [
      { id: "B", newStart: "2026-11-11", newEnd: "2026-11-13" },
      { id: "C", newStart: "2026-11-14", newEnd: "2026-11-16" },
    ]
  );
});

test("stops at an unchanged successor even if its own successor has an existing violation", () => {
  assert.deepEqual(scheduleSuccessors([tasks[0], task("B", "2026-11-10", "2026-11-12"), tasks[2]], chain, change), {
    updates: [],
    warnings: [],
    cycle: null,
  });
});

test("handles milestones, start-only tasks, and missing dates without propagating through them", () => {
  const result = scheduleSuccessors(
    [
      tasks[0],
      task("B", null, "2026-11-04"),
      task("C", "2026-11-04", null),
      task("D", null, null),
      task("E", "2026-11-01", "2026-11-02"),
    ],
    [edge("A", "D"), edge("A", "C"), edge("A", "B"), edge("D", "E")],
    change
  );
  assert.deepEqual(result, {
    updates: [
      { id: "B", oldStart: null, oldEnd: "2026-11-04", newStart: null, newEnd: "2026-11-06" },
      { id: "C", oldStart: "2026-11-04", oldEnd: null, newStart: "2026-11-06", newEnd: null },
    ],
    warnings: [{ id: "D", reason: "missing_dates" }],
    cycle: null,
  });
});

test("warns once for a missing predecessor end and uses remaining usable predecessors", () => {
  const result = scheduleSuccessors([...tasks, task("P", "2026-11-01", null)], [...chain, edge("P", "B")], change);
  assert.equal(result.updates[0].newStart, "2026-11-06");
  assert.deepEqual(result.warnings, [{ id: "B", reason: "missing_predecessor_end" }]);
  assert.deepEqual(scheduleSuccessors(tasks, chain, task("A", "2026-11-01", null)), {
    updates: [],
    warnings: [{ id: "B", reason: "missing_predecessor_end" }],
    cycle: null,
  });
});

test("uses UTC calendar days across month, year and leap-day boundaries", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(diffDays("2026-12-30", "2027-01-02"), 3);
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(
    scheduleSuccessors(
      [task("A", "2026-12-29", "2026-12-30"), task("B", "2026-12-31", "2027-01-02")],
      [edge("A", "B")],
      task("A", "2026-12-29", "2027-01-02")
    ).updates[0].newEnd,
    "2027-01-05"
  );
});

test("rejects reachable cycles even past unchanged or undated tasks", () => {
  for (const edges of [
    [...chain, edge("B", "A")],
    [...chain, edge("C", "B")],
  ]) {
    const result = scheduleSuccessors(tasks, edges, change);
    assert.ok(result.cycle?.length);
    assert.deepEqual(result.updates, []);
    assert.deepEqual(result.warnings, []);
  }
});

test("never pulls earlier or touches unrelated tasks and ignores unrelated cycles", () => {
  assert.deepEqual(
    scheduleSuccessors(
      [...tasks, task("X", null, null)],
      [...chain, edge("X", "X")],
      task("A", "2026-10-30", "2026-11-01")
    ),
    { updates: [], warnings: [], cycle: null }
  );
});

test("evaluates a shared successor reached by another moved predecessor with deterministic ties", () => {
  const result = scheduleSuccessors(
    [
      tasks[0],
      task("B", "2026-11-10", "2026-11-12"),
      task("C", "2026-11-04", "2026-11-06"),
      task("D", "2026-11-07", "2026-11-09"),
    ],
    [edge("A", "C"), edge("A", "B"), edge("B", "D"), edge("C", "D")],
    change
  );
  assert.deepEqual(
    result.updates.map(({ id, newStart }) => [id, newStart]),
    [
      ["C", "2026-11-06"],
      ["D", "2026-11-13"],
    ]
  );
});

test("schedules a 500-item chain in less than 100 ms", () => {
  const items = Array.from({ length: 500 }, (_, i) => task(String(i), "2026-11-01", "2026-11-01"));
  const edges = items.slice(1).map((item, i) => edge(String(i), item.id));
  const start = performance.now();
  const result = scheduleSuccessors(items, edges, task("0", "2026-11-01", "2026-11-05"));
  assert.equal(result.updates.length, 499);
  assert.ok(performance.now() - start < 100);
});
