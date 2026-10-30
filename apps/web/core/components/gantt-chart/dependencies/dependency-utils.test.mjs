/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { extractBlockedByDependencies, getDependencyPath, isDependencyViolated } from "./dependency-utils.ts";

test("extracts only unique same-project blocked_by predecessors", () => {
  const relation = { id: "A", project_id: "project", relation_type: "blocked_by" };
  assert.deepEqual(
    extractBlockedByDependencies(
      [
        {
          id: "B",
          issue_relation: [
            relation,
            relation,
            ...["relates_to", "duplicate", "blocking"].map((relation_type) => ({
              id: "A",
              project_id: "project",
              relation_type,
            })),
            { ...relation, project_id: "other" },
            { ...relation, id: "B" },
          ],
        },
        { id: "B", issue_relation: [relation] },
        { id: "C" },
        { id: "D", issue_relation: [relation] },
      ],
      "project"
    ),
    [
      { predecessorId: "A", successorId: "B" },
      { predecessorId: "A", successorId: "D" },
    ]
  );
});

test("equal or earlier successor dates violate Finish-to-Start", () => {
  assert.equal(isDependencyViolated("2026-10-20", "2026-10-20"), true);
  assert.equal(isDependencyViolated("2026-10-20", "2026-10-19"), true);
  assert.equal(isDependencyViolated("2026-10-20", "2026-10-21"), false);
  for (const missing of [null, undefined, ""]) {
    assert.equal(isDependencyViolated(missing, "2026-10-20"), false);
    assert.equal(isDependencyViolated("2026-10-20", missing), false);
  }
});

test("routes separated rows through a forward elbow", () => {
  assert.equal(getDependencyPath({ x: 10, y: 20 }, { x: 26, y: 60 }, 40), "M 10 20 H 18 V 60 H 26");
});

test("routes close or backward links through the gap between rows", () => {
  assert.equal(getDependencyPath({ x: 50, y: 20 }, { x: 10, y: 60 }, 40), "M 50 20 H 58 V 40 H 2 V 60 H 10");
  assert.equal(getDependencyPath({ x: 50, y: 60 }, { x: 55, y: 20 }, 40), "M 50 60 H 58 V 40 H 47 V 20 H 55");
});

test("draws a straight same-row link and rounds coordinates", () => {
  assert.equal(getDependencyPath({ x: 10.123, y: 20.456 }, { x: 40.789, y: 20.456 }, 40), "M 10.1 20.5 H 40.8");
});
