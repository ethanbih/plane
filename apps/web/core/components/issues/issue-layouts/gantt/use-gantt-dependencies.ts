/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { TIssue, TIssuesResponse } from "@plane/types";
import type { TGanttDependency } from "@/components/gantt-chart/dependencies/dependency-utils";
import { extractBlockedByDependencies } from "@/components/gantt-chart/dependencies/dependency-utils";
import { IssueService } from "@/services/issue";

const issueService = new IssueService();

export function useGanttDependencies(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  enabled: boolean
): TGanttDependency[] | undefined {
  const [dependencies, setDependencies] = useState<TGanttDependency[]>([]);
  const requestCounter = useRef(0);

  useEffect(() => {
    setDependencies([]);
    if (!enabled || !workspaceSlug || !projectId) return;
    const invalidateRequests = () => {
      requestCounter.current++;
    };

    const fetchDependencies = async () => {
      const request = ++requestCounter.current;
      try {
        const issues: Parameters<typeof extractBlockedByDependencies>[0] = [];
        // shortcut: fetch at most 10,000 work items, raise the cap if larger projects need complete arrows.
        for (let page = 0; page < 10; page++) {
          // oxlint-disable-next-line no-await-in-loop -- Each response decides whether another page exists.
          const response: TIssuesResponse | TIssue[] = await issueService.getIssuesFromServer(
            workspaceSlug,
            projectId,
            {
              expand: "issue_relation",
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
        if (request === requestCounter.current) setDependencies(extractBlockedByDependencies(issues, projectId));
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

  return !enabled || !workspaceSlug || !projectId ? undefined : dependencies;
}
