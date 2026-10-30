/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TGanttDependency = { predecessorId: string; successorId: string };

export function extractBlockedByDependencies(
  issues: { id: string; issue_relation?: { id: string; project_id: string; relation_type: string }[] }[],
  projectId: string
): TGanttDependency[] {
  const dependencies: TGanttDependency[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    for (const relation of issue.issue_relation ?? []) {
      if (relation.relation_type !== "blocked_by" || relation.project_id !== projectId || relation.id === issue.id)
        continue;
      const key = JSON.stringify([relation.id, issue.id]);
      if (seen.has(key)) continue;
      seen.add(key);
      dependencies.push({ predecessorId: relation.id, successorId: issue.id });
    }
  }
  return dependencies;
}

export function isDependencyViolated(
  predTargetDate: string | null | undefined,
  succStartDate: string | null | undefined
): boolean {
  return !!predTargetDate && !!succStartDate && succStartDate <= predTargetDate;
}

const round = (value: number) => Math.round(value * 10) / 10;

export function getDependencyPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rowHeight: number
): string {
  const start = `M ${round(from.x)} ${round(from.y)}`;
  if (to.x - from.x >= 16) {
    if (from.y === to.y) return `${start} H ${round(to.x)}`;
    return `${start} H ${round(from.x + 8)} V ${round(to.y)} H ${round(to.x)}`;
  }
  const midY = to.y > from.y ? to.y - rowHeight / 2 : to.y + rowHeight / 2;
  return `${start} H ${round(from.x + 8)} V ${round(midY)} H ${round(to.x - 8)} V ${round(to.y)} H ${round(to.x)}`;
}
