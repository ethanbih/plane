/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TGanttDependency } from "./dependency-utils";

export type TScheduleTask = { id: string; start: string | null; end: string | null };
export type TScheduleChange = TScheduleTask;
export type TScheduleUpdate = {
  id: string;
  oldStart: string | null;
  oldEnd: string | null;
  newStart: string | null;
  newEnd: string | null;
};
export type TScheduleWarning = { id: string; reason: "missing_dates" | "missing_predecessor_end" };

const dayMs = 86_400_000;
const utc = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

export const addDays = (date: string, days: number): string =>
  new Date(utc(date) + days * dayMs).toISOString().slice(0, 10);
export const diffDays = (from: string, to: string): number => (utc(to) - utc(from)) / dayMs;

export function scheduleSuccessors(
  tasks: TScheduleTask[],
  dependencies: TGanttDependency[],
  change: TScheduleChange
): { updates: TScheduleUpdate[]; warnings: TScheduleWarning[]; cycle: string[] | null } {
  const current = new Map(tasks.map((task) => [task.id, { ...task }]));
  current.set(change.id, { ...change });
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const { predecessorId, successorId } of dependencies) {
    if (!outgoing.has(predecessorId)) outgoing.set(predecessorId, new Set());
    if (!incoming.has(successorId)) incoming.set(successorId, new Set());
    outgoing.get(predecessorId)!.add(successorId);
    incoming.get(successorId)!.add(predecessorId);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    if (visiting.has(id)) return [...path.slice(path.indexOf(id)), id];
    if (visited.has(id)) return null;
    visiting.add(id);
    path.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  const cycle = visit(change.id);
  if (cycle) return { updates: [], warnings: [], cycle };

  const indegree = new Map(
    [...visited].map((id) => [id, [...(incoming.get(id) ?? [])].filter((pred) => visited.has(pred)).length])
  );
  const ready = [...visited].filter((id) => indegree.get(id) === 0);
  ready.sort();
  const moved = new Set([change.id]);
  const updates: TScheduleUpdate[] = [];
  const warnings: TScheduleWarning[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    const task = current.get(id);
    if (id !== change.id && task && [...(incoming.get(id) ?? [])].some((pred) => moved.has(pred))) {
      if (!task.start && !task.end) {
        warnings.push({ id, reason: "missing_dates" });
      } else {
        let earliest: string | null = null;
        let missingEnd = false;
        for (const pred of incoming.get(id) ?? []) {
          const end = current.get(pred)?.end;
          if (!end) {
            missingEnd = true;
            continue;
          }
          const nextDay = addDays(end, 1);
          if (!earliest || nextDay > earliest) earliest = nextDay;
        }
        if (missingEnd) warnings.push({ id, reason: "missing_predecessor_end" });
        const date = task.start ?? task.end;
        if (earliest && date && date < earliest) {
          const newStart = task.start ? earliest : null;
          const newEnd = task.end ? (task.start ? addDays(task.end, diffDays(task.start, earliest)) : earliest) : null;
          updates.push({ id, oldStart: task.start, oldEnd: task.end, newStart, newEnd });
          current.set(id, { id, start: newStart, end: newEnd });
          moved.add(id);
        }
      }
    }
    for (const next of outgoing.get(id) ?? []) {
      const remaining = indegree.get(next)! - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  return { updates, warnings, cycle: null };
}
