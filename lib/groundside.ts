interface DesignNote {
  title: string;
  status: string;
  paragraphs: string[];
}

export const GROUNDSIDE_FLOW = [
  { title: "Plan coverage", detail: "Camera footprint, overlap and sweep routes define the work." },
  { title: "Assign tasks", detail: "The scheduler selects work using eligible drones and route costs." },
  { title: "Track execution", detail: "The state manager owns connectivity, ACKs and fleet availability." },
  { title: "Validate the map", detail: "Image quality and usable coverage determine what still needs scanning." },
];

export const GROUNDSIDE_NOTES: DesignNote[] = [
  {
    title: "Coverage geometry → fleet assignment",
    status: "ALGORITHM SELECTION · NEXT-STAGE DESIGN",
    paragraphs: [
      "I’m comparing Uber’s H3 geographic grid with boustrophedon decomposition: splitting a survey region into cells that can be flown in back-and-forth sweeps. H3 offers stable geographic IDs and neighbour lookup for coverage tracking. For flight tasks, hexagon boundaries can introduce short passes, extra turns and repeated overlap. My proposed split is to track coverage geographically while assigning cells or adjacent sweep strips that follow the flight geometry.",
      "A task needs valid entry and exit routes. The nearest point inside a polygon does not capture the cost of flying to a useful starting point and completing the sweep. I’m proposing route variants scored by approach plus execution cost, building on the coverage planner’s footprint, spacing and turn-cost work. Its current flattened route does not yet expose those per-cell variants.",
      "I’m keeping nearest-drone assignment as the MVP baseline so the team can establish the dispatch and execution contracts before adding optimization. I’m comparing it with full batch minimum-cost matching, assigning one task per available drone per batch. The comparison needs to measure approach travel, turn overhead and fleet completion time: minimizing the modeled batch total does not necessarily minimize when the last drone finishes. Multi-task routes would add another layer of routing decisions.",
      "I also explored restricting comparisons to drones competing for nearby cells. Competition can propagate through a chain, so the unit to solve is a connected component of the drone–task graph. Uncontested alternatives still matter. Keeping only the nearest few candidates can lose the best assignment or even prevent a complete one; component solutions are exact only for the retained graph when constraints separate. I would benchmark full matching first, cache route costs and update affected costs on meaningful fleet events before pruning candidates.",
    ],
  },
  {
    title: "MVP architecture & distributed task ownership",
    status: "SYSTEM BOUNDARIES · EXECUTION CONTRACTS",
    paragraphs: [
      "I’m structuring the MVP around a central groundside coordinator with separate planning, scheduling, fleet-state and mapping responsibilities. This keeps assignment decisions and the shared map in one place while giving contributors explicit interfaces to build against. It also makes coordinator availability and processing capacity constraints that need to be measured as the fleet grows.",
      "I scoped a mock fleet with one process per drone, persistent WebSocket connections, registration, task IDs, command ACKs and periodic telemetry. This establishes a low-cost integration environment before airframe testing. Straight-line motion is sufficient for exercising dispatch and state transitions at this stage; realistic flight dynamics are a separate validation concern. I require ARRIVED to persist until the next command so completion remains observable between state updates.",
      "My execution contract separates choosing work from owning it: the scheduler selects assignments, while the state manager must maintain pending and accepted reservations across polls. Successful assignments must survive a later failure in the same dispatch pass without returning to the queue. An explicit rejection can permit another candidate; an ACK timeout leaves acceptance uncertain and needs reconciliation before reassignment. These requirements prevent an optimizer from making efficient plans on top of ambiguous task ownership.",
      "I’m defining completion across the full pipeline: reaching a waypoint, capturing an image and producing usable coverage are distinct milestones. That distinction determines when a drone becomes available, when a task can be retired and what should be scheduled again. It also keeps the planning algorithm independent of network delivery and image-quality policy.",
    ],
  },
  {
    title: "Image admission → trustworthy coverage",
    status: "PERCEPTION ARCHITECTURE · QUALITY CONTRACTS",
    paragraphs: [
      "I scoped the mapping pipeline around asynchronous, out-of-order images from multiple drones. GPS narrows the neighbour search; XFeat and RANSAC establish relative alignment; separate clusters can merge when a later image connects them. This supports independent fleet progress without requiring each incoming photo to extend one continuous flight path.",
      "My processing boundary puts raw-image undistortion on groundside, using calibration matched to the actual camera and resolution. This centralizes calibration and image-processing policy, with image transport and groundside throughput as explicit integration costs. I require known camera intrinsics for footprint estimates and separate blur, exposure and tilt checks: geometrically consistent feature matches alone do not establish visual quality. Unusable frames must be rejected before GPS fallback; usable unmatched frames can remain provisional.",
      "The integration requirement I’m working toward is pose associated with frame acquisition time, including camera orientation and the mounting transform. Attaching the latest telemetry when an image arrives does not synchronize the measurements. Lens correction also does not remove the perspective effects of camera tilt, so the current flat-ground similarity model needs a supported operating envelope.",
      "I’m prioritizing incoming-image processing for the MVP and evaluating bounded idle-time rematching as a later quality improvement. The tradeoff is refinement quality against ingestion latency: re-solving existing alignments is cheaper but does not discover new matches. Progressive map snapshots are part of my observability requirements so the team can trace when map quality improves or degrades and decide where further processing is worthwhile.",
    ],
  },
];
