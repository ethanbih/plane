/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useId } from "react";
import { observer } from "mobx-react";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { BLOCK_HEIGHT } from "../constants";
import type { TGanttDependency } from "./dependency-utils";
import { getDependencyPath, isDependencyViolated } from "./dependency-utils";

type Props = {
  blockIds: string[];
  dependencies: TGanttDependency[];
  showAllBlocks: boolean;
  width: number;
};

export const GanttDependencyLayer = observer(function GanttDependencyLayer(props: Props) {
  const { blockIds, dependencies, showAllBlocks, width } = props;
  const { getBlockById } = useTimeLineChartStore();
  const id = useId();
  const normalMarkerId = `${id}-dependency`;
  const violatedMarkerId = `${id}-dependency-violated`;
  const visibleBlocks = blockIds
    .map((blockId) => getBlockById(blockId))
    .filter((block) => block && block.data && (showAllBlocks || block.start_date || block.target_date));
  const rows = new Map(
    visibleBlocks.map((block, index) => [block.id, { block, y: index * BLOCK_HEIGHT + BLOCK_HEIGHT / 2 }])
  );

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 z-[4] overflow-visible"
      width={width}
      height={visibleBlocks.length * BLOCK_HEIGHT}
      aria-hidden="true"
    >
      <defs>
        <marker
          id={normalMarkerId}
          className="text-tertiary"
          markerWidth={6}
          markerHeight={6}
          refX={6}
          refY={3}
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
        </marker>
        <marker
          id={violatedMarkerId}
          className="text-danger-primary"
          markerWidth={6}
          markerHeight={6}
          refX={6}
          refY={3}
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
        </marker>
      </defs>
      {dependencies.map(({ predecessorId, successorId }) => {
        const pred = rows.get(predecessorId);
        const succ = rows.get(successorId);
        if (!pred?.block.position || !succ?.block.position) return null;
        const violated = isDependencyViolated(pred.block.target_date, succ.block.start_date);
        return (
          <path
            key={`${predecessorId}-${successorId}`}
            d={getDependencyPath(
              { x: pred.block.position.marginLeft + pred.block.position.width, y: pred.y },
              { x: succ.block.position.marginLeft, y: succ.y },
              BLOCK_HEIGHT
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className={violated ? "text-danger-primary" : "text-tertiary"}
            markerEnd={`url(#${violated ? violatedMarkerId : normalMarkerId})`}
          />
        );
      })}
    </svg>
  );
});
