/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createElement, useEffect, useRef, useState } from "react";
import type { TIssue, TIssuesResponse } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import type { TGanttDependency } from "@/components/gantt-chart/dependencies/dependency-utils";
import {
  dependencyValidationMessages,
  extractGanttRelations,
  validateNewDependency,
} from "@/components/gantt-chart/dependencies/dependency-utils";
import { IssueService } from "@/services/issue";

const issueService = new IssueService();

export function useGanttDependencies(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  enabled: boolean
) {
  const { relation } = useIssueDetail();
  const [relations, setRelations] = useState<ReturnType<typeof extractGanttRelations>>();
  const relationsRef = useRef(relations);
  const generation = useRef(0);
  const saving = useRef(false);
  const projectIssueIds = useRef(new Set<string>());
  const updateRelations = (next: ReturnType<typeof extractGanttRelations> | undefined) => {
    relationsRef.current = next;
    setRelations(next);
  };
  const requestCounter = useRef(0);

  useEffect(() => {
    generation.current++;
    saving.current = false;
    projectIssueIds.current.clear();
    updateRelations(undefined);
    if (!enabled || !workspaceSlug || !projectId) return;
    const invalidateRequests = () => {
      requestCounter.current++;
      generation.current++;
    };

    const fetchDependencies = async () => {
      if (saving.current) return;
      const request = ++requestCounter.current;
      try {
        const issues: Parameters<typeof extractGanttRelations>[0] = [];
        // shortcut: fetch at most 10,000 work items, raise the cap if larger projects need complete arrows.
        for (let page = 0; page < 10; page++) {
          // oxlint-disable-next-line no-await-in-loop -- Each response decides whether another page exists.
          const response: TIssuesResponse | TIssue[] = await issueService.getIssuesFromServer(
            workspaceSlug,
            projectId,
            {
              expand: "issue_relation,issue_related",
              per_page: 1000,
              cursor: `1000:${page}:0`,
            }
          );
          if (request !== requestCounter.current) return;
          const results = Array.isArray(response) ? response : response.results;
          if (!Array.isArray(results)) throw new Error("Expected ungrouped Gantt dependency results");
          issues.push(...results);
          if (Array.isArray(response) || !response.next_page_results) break;
        }
        if (request === requestCounter.current) {
          projectIssueIds.current = new Set(issues.map((issue) => issue.id));
          updateRelations(extractGanttRelations(issues, projectId));
        }
      } catch (error) {
        if (request === requestCounter.current) console.error("Failed to fetch Gantt dependencies", error);
      }
    };

    void fetchDependencies();
    window.addEventListener("focus", fetchDependencies);
    return () => {
      invalidateRequests();
      window.removeEventListener("focus", fetchDependencies);
    };
  }, [workspaceSlug, projectId, enabled]);

  const mutateDependency = async (predecessorId: string, successorId: string, remove: boolean) => {
    const current = relationsRef.current;
    if (!enabled || !workspaceSlug || !projectId || !current) return;
    if (!projectIssueIds.current.has(predecessorId) || !projectIssueIds.current.has(successorId)) return;
    if (saving.current) {
      setToast({ type: TOAST_TYPE.WARNING, title: "Đang lưu phụ thuộc" });
      return;
    }
    if (!remove) {
      const error = validateNewDependency(current.dependencies, current.otherPairs, predecessorId, successorId);
      if (error) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Không nối được", message: dependencyValidationMessages[error] });
        return;
      }
    } else if (
      !current.dependencies.some((dep) => dep.predecessorId === predecessorId && dep.successorId === successorId)
    ) {
      return;
    }
    const scope = generation.current;
    saving.current = true;
    requestCounter.current++;
    const dependency: TGanttDependency = { predecessorId, successorId };
    updateRelations({
      ...current,
      dependencies: remove
        ? current.dependencies.filter((dep) => dep.predecessorId !== predecessorId || dep.successorId !== successorId)
        : [...current.dependencies, dependency],
    });
    try {
      if (remove) {
        await relation.removeRelation(workspaceSlug, projectId, successorId, "blocked_by", predecessorId);
        // Refresh the inverse relation too: the shared store can leave its reverse list stale.
        await relation.fetchRelations(workspaceSlug, projectId, predecessorId).catch(console.error);
      } else {
        const created = await relation.createRelation(workspaceSlug, projectId, successorId, "blocked_by", [
          predecessorId,
        ]);
        if (!created.some((issue) => issue.id === predecessorId)) throw new Error("Dependency was not created");
      }
      if (scope !== generation.current) return;
      if (remove) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Đã xoá phụ thuộc",
          actionItems: createElement(
            "button",
            {
              type: "button",
              className: "text-accent-primary",
              onClick: () => {
                if (scope === generation.current) void mutateDependency(predecessorId, successorId, false);
              },
            },
            "Hoàn tác"
          ),
        });
      }
    } catch (error) {
      if (scope !== generation.current) return;
      updateRelations(current);
      setToast({ type: TOAST_TYPE.ERROR, title: "Không lưu được phụ thuộc" });
      console.error("Failed to save Gantt dependency", error);
    } finally {
      if (scope === generation.current) saving.current = false;
    }
  };

  return !enabled || !workspaceSlug || !projectId || !relations
    ? undefined
    : {
        ...relations,
        createDependency: (pred: string, succ: string) => mutateDependency(pred, succ, false),
        removeDependency: (pred: string, succ: string) => mutateDependency(pred, succ, true),
      };
}
