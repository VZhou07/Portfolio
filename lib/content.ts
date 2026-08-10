/* ============================================================================
   CONTENT SOURCE OF TRUTH
   ----------------------------------------------------------------------------
   Everything user-facing lives here — profile, missions, waypoints, skills,
   comms channels, and onboard footage metadata.

   Links that are empty, "#", or otherwise unset are rendered as disabled chips
   instead of anchors, so the site never ships a dead link.
   ========================================================================== */

export type StatusCode =
  | "DEPLOYED"
  | "FLIGHT-VERIFIED"
  | "COMPLETE"
  | "INTEGRATION"
  | "IN PROGRESS";

export type Domain =
  | "AUTONOMY"
  | "PERCEPTION"
  | "SIMULATION"
  | "MACHINE LEARNING"
  | "FULL-STACK";

export interface ExternalLink {
  label: string;
  href: string;
}

export interface Mission {
  /** Stable mission id, also used as the DOM id for deep links. */
  id: string;
  name: string;
  subtitle: string;
  status: StatusCode;
  /** False renders an explicit unverified caution flag. */
  verified: boolean;
  /**
   * True when the mission is flight software that can be proven on an airframe.
   * Ground-segment and non-flight work is described as tested, not flown, so the
   * verification chip never overclaims.
   */
  airborne: boolean;
  domain: Domain;
  org: string;
  window: string;
  /** Drives the instrument panel signal levels — keep tokens consistent. */
  stack: string[];
  brief: string;
  /** Expanded flight log: what was actually built. */
  log: string[];
  impact: string;
  links: ExternalLink[];
  /** True for the mission that owns the onboard landing footage. */
  hasFootage?: boolean;
}

export interface Waypoint {
  role: string;
  org: string;
  dates: string;
  location: string;
  kind: "OPERATIONS" | "TRAINING";
  details: string[];
  tags: string[];
}

export interface Skill {
  name: string;
  /** Stack tokens that count as "used" — matched against Mission.stack. */
  matches: string[];
  /** First year you used it in anger. Shown as "SINCE". */
  since: string;
}

export interface SkillGroup {
  code: string;
  label: string;
  unit: string;
  skills: Skill[];
}

export interface SectionDef {
  id: string;
  code: string;
  label: string;
  /** Compass bearing shown on the HUD when this section is active. */
  bearing: number;
}

/* -------------------------------------------------------------------------- */
/* PROFILE                                                                    */
/* -------------------------------------------------------------------------- */

export const PROFILE = {
  name: "Vincent Zhou",
  callsign: "VZHOU",
  title: "Computer Engineering student building things that think and sometimes fly",
  tagline:
    "Autonomy software for UAVs — simulation-in-the-loop, precision landing, and the full stack around it.",
  location: "Waterloo, ON",
  /** Origin the boot sequence sets EKF home to. Waterloo by default. */
  homeLat: 43.4723,
  homeLon: -80.5449,
  about: [
    "Computer Engineering at the University of Waterloo (class of 2030). I fly with UWARG Autonomy — simulation ranges, precision landing, and the ground segment that turns detections into mapped targets.",
    "Working on autonomous systems, perception, machine learning, backend systems, and the full stack around it.",
  ],
  resumeUrl: "/resume.pdf",
} as const;

/* -------------------------------------------------------------------------- */
/* NAV / SECTIONS                                                             */
/* -------------------------------------------------------------------------- */

export const SECTIONS: SectionDef[] = [
  { id: "preflight", code: "01", label: "PREFLIGHT", bearing: 0 },
  { id: "dossier", code: "02", label: "DOSSIER", bearing: 45 },
  { id: "missions", code: "03", label: "MISSIONS", bearing: 90 },
  { id: "approach", code: "04", label: "APPROACH", bearing: 135 },
  { id: "waypoints", code: "05", label: "WAYPOINTS", bearing: 180 },
  { id: "instruments", code: "06", label: "INSTRUMENTS", bearing: 225 },
  { id: "comms", code: "07", label: "COMMS", bearing: 270 },
];

/* -------------------------------------------------------------------------- */
/* MISSIONS — ordered most recent first (order drives radar range)             */
/* -------------------------------------------------------------------------- */

export const MISSIONS: Mission[] = [
  {
    id: "msn-01",
    name: "SITL RANGE",
    subtitle: "SIMULATION-IN-THE-LOOP TEST ENVIRONMENT",
    status: "DEPLOYED",
    verified: true,
    airborne: true,
    domain: "SIMULATION",
    org: "UWARG · Autonomy",
    window: "May 2026 – Present",
    stack: [
      "Python",
      "ArduPilot SITL",
      "MAVLink",
      "OpenCV",
      "Docker",
      "Linux",
      "Git / CI",
    ],
    brief:
      "A full software-in-the-loop range that flies the autonomy stack against a synthetic camera and physics model, so behaviour is proven before anything spins a real propeller.",
    log: [
      "Wired the flight controller SITL binary, the simulator and the autonomy stack into one launchable range — one command brings up vehicle, camera feed and ground link.",
      "Rendered the synthetic payload camera in multiple passes (RGB, depth, mask) so perception nodes get the same tensors they see in flight.",
      "Exposed the whole thing over MAVLink so the existing ground station and mission scripts run unmodified against sim or hardware.",
      "Containerised the range so every team member and CI runner gets a byte-identical environment.",
    ],
    impact:
      "Perception and landing changes can be iterated locally against sim instead of booking airframe time — the range is what the rest of the autonomy stack tests against.",
    links: [
      {
        label: "PULL REQUEST #134",
        href: "https://github.com/UWARG/autonomy-monorepo/pull/134",
      },
    ],
  },
  {
    id: "msn-02",
    name: "PRECISION LANDING · APRILTAG",
    subtitle: "OPTIMAL-TARGET TOUCHDOWN, FLIGHT VERIFIED",
    status: "FLIGHT-VERIFIED",
    verified: true,
    airborne: true,
    domain: "PERCEPTION",
    org: "UWARG · Autonomy",
    window: "Jun 2026 – Jul 2026",
    stack: [
      "Python",
      "OpenCV",
      "AprilTag",
      "MAVLink",
      "Camera Calibration",
      "Homography / PnP",
      "ArduPilot SITL",
    ],
    brief:
      "Closed-loop precision landing on a fiducial target: detect the tag in the downward camera, solve relative pose, and stream velocity corrections to the flight controller all the way to touchdown.",
    log: [
      "Tag detection and pose solve on the downward payload camera, with intrinsics from a calibration pass.",
      "Converted tag-frame pose into body-frame corrections and fed the controller a landing target stream, with a hold-and-retry ladder when the tag drops out of frame.",
      "Tuned the descent profile so the vehicle keeps the target inside the frame as the tag scales up in the last few metres.",
      "Verified in the SITL range first, then on the airframe — the onboard footage in section 04 is that flight.",
    ],
    impact:
      "Flight-verified closed-loop landing on an AprilTag pad; the SITL-first path is what made the airframe attempt safe to attempt.",
    links: [
      {
        label: "PULL REQUEST #73",
        href: "https://github.com/UWARG/autonomy-monorepo/pull/73",
      },
    ],
    hasFootage: true,
  },
  {
    id: "msn-03",
    name: "PRECISION LANDING · ORB",
    subtitle: "NON-OPTIMAL TARGETS, CLASSICAL FEATURES",
    status: "INTEGRATION",
    verified: false,
    airborne: true,
    domain: "PERCEPTION",
    org: "UWARG · Autonomy",
    window: "Jul 2026 – Present",
    stack: [
      "Python",
      "OpenCV",
      "ORB Features",
      "Homography / PnP",
      "MAVLink",
      "ArduPilot SITL",
    ],
    brief:
      "Landing on targets that were never designed to be landed on. Swaps the fiducial for ORB keypoint matching against a reference image, so the pad can be any textured surface.",
    log: [
      "Reference-image keypoint pipeline: ORB detect / describe, ratio-test matching, RANSAC homography, then pose recovery to the same interface the AprilTag path already uses.",
      "Kept the downstream landing controller untouched by matching the existing target-estimate contract — the perception front end is swappable.",
      "Architecturally and functionally complete; awaiting bench and flight verification before it is trusted with an airframe.",
    ],
    impact:
      "Removes the fiducial requirement so competition landing pads can be arbitrary textured surfaces instead of printed tags.",
    links: [
      {
        label: "BRANCH · non-optimal-targets",
        href: "https://github.com/UWARG/autonomy-monorepo/tree/non-optimal-targets",
      },
    ],
  },
  {
    id: "msn-04",
    name: "PRECISION LANDING · XFEAT",
    subtitle: "NON-OPTIMAL TARGETS, LEARNED FEATURES",
    status: "IN PROGRESS",
    verified: false,
    airborne: true,
    domain: "MACHINE LEARNING",
    org: "UWARG · Autonomy",
    window: "Jul 2026 – Present",
    stack: [
      "Python",
      "PyTorch",
      "XFeat",
      "OpenCV",
      "Homography / PnP",
      "ArduPilot SITL",
    ],
    brief:
      "The learned-feature counterpart to the ORB path: lightweight deep local features for matching a landing pad under viewpoint and lighting change that breaks classical descriptors.",
    log: [
      "Dropped a learned local-feature extractor in behind the same target-estimate interface, so ORB and XFeat can be A/B compared on identical logs.",
      "Measuring the real trade: match quality under scale and illumination change versus inference cost on the companion computer.",
      "Work in progress — tracked in the linked pull request.",
    ],
    impact:
      "Aims to hold lock through viewpoint and lighting change that drops classical descriptors below a usable match count.",
    links: [
      {
        label: "PULL REQUEST #130",
        href: "https://github.com/UWARG/autonomy-monorepo/pull/130",
      },
    ],
  },
  {
    id: "msn-05",
    name: "AEAC TARGET MAPPING STACK",
    subtitle: "COMPETITION GROUND SEGMENT, END TO END",
    status: "IN PROGRESS",
    verified: false,
    airborne: false,
    domain: "FULL-STACK",
    org: "UWARG · AEAC 2026 Task 1",
    window: "Mar 2026 – Present",
    stack: [
      "TypeScript",
      "React / Next.js",
      "Python",
      "Linear Algebra",
      "REST APIs",
      "Docker",
      "Git / CI",
    ],
    brief:
      "Ground-segment web stack that turns detections from the air into mapped targets on the ground, using camera geometry and linear algebra to project pixels to world coordinates.",
    log: [
      "Built the stack end to end: projection maths, the service that serves it, and the operator UI that draws the result.",
      "Pixel-to-world projection from camera intrinsics plus vehicle pose — the same geometry the landing solvers use, applied to mapping instead of control.",
      "Operator-facing UI scaffold so a non-engineer can run the task under competition time pressure.",
    ],
    impact:
      "Gives the AEAC Task 1 crew a single operator surface from airborne detections to a mapped target list.",
    links: [
      {
        label: "REPO · Auto-AEAC-2026-Task-1-MVP",
        href: "https://github.com/UWARG/Auto-AEAC-2026-Task-1-MVP/tree/UI-improvement-scaffold",
      },
    ],
  },
  {
    id: "msn-06",
    name: "NEURAL NETWORK FROM SCRATCH",
    subtitle: "FEED-FORWARD ANN IN C++ / EIGEN, NO FRAMEWORK",
    status: "COMPLETE",
    verified: true,
    airborne: false,
    domain: "MACHINE LEARNING",
    org: "Personal",
    window: "Jun 2026 – Jul 2026",
    stack: ["C++", "Eigen", "Linear Algebra", "CMake", "Git / CI"],
    brief:
      "A working artificial neural network written from first principles — forward pass, backprop and gradient descent implemented directly on Eigen matrices with no ML framework involved.",
    log: [
      "Implemented layers, activations, loss and backpropagation by hand; gradients derived on paper and checked numerically.",
      "Vectorised the whole forward/backward pass with Eigen expressions instead of element loops.",
      "Trains and runs inference end to end in C++ — the point was to own every line of the maths.",
    ],
    impact:
      "A from-scratch C++ / Eigen network that trains and infers without a framework — useful as a reference for how the maths actually works.",
    links: [
      {
        label: "REPO · Neural-Network",
        href: "https://github.com/VZhou07/Neural-Network",
      },
    ],
  },
  {
    id: "msn-07",
    name: "CLASSLY",
    subtitle: "DEPLOYED FULL-STACK PRODUCT, FRONT + BACK",
    status: "DEPLOYED",
    verified: true,
    airborne: false,
    domain: "FULL-STACK",
    org: "Personal",
    window: "Apr 2026 – Aug 2026",
    stack: [
      "TypeScript",
      "React / Next.js",
      "Node.js",
      "REST APIs",
      "Databases",
      "Git / CI",
    ],
    brief:
      "Classroom management app for teachers and students — attendance, class organisation, and the day-to-day ops of a classroom. Shipped as a separate frontend and backend, deployed and reachable in production.",
    log: [
      "Designed the API surface and data model, then built the client against it.",
      "Auth, persistence and deployment handled end to end — the whole thing is mine.",
      "Deployed and live on Vercel; frontend and backend repos linked below.",
    ],
    impact:
      "Live full-stack product at classly-black.vercel.app — a working classroom tool, not a demo shell.",
    links: [
      {
        label: "LIVE SITE",
        href: "https://classly-black.vercel.app",
      },
      {
        label: "FRONTEND",
        href: "https://github.com/VZhou07/Classly",
      },
      {
        label: "BACKEND",
        href: "https://github.com/VZhou07/Classly-Backend",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* WAYPOINTS (experience)                                                     */
/* -------------------------------------------------------------------------- */

export const WAYPOINTS: Waypoint[] = [
  {
    role: "Autonomy Software Engineering Intern",
    org: "UWARG — Waterloo Aerial Robotics Group",
    dates: "May 2026 – Sept 2026",
    location: "Waterloo, ON",
    kind: "OPERATIONS",
    details: [
      "Own the simulation-in-the-loop range the autonomy team tests against — see MSN-01.",
      "Ship precision-landing perception: fiducial path flight-verified, non-optimal-target paths in integration — see MSN-02 through MSN-04.",
      "Contribute to the AEAC 2026 Task 1 ground segment — detection-to-map projection and operator UI.",
    ],
    tags: ["Python", "OpenCV", "MAVLink", "ArduPilot SITL"],
  },
  {
    role: "B.A.Sc. Computer Engineering",
    org: "University of Waterloo",
    dates: "Sep 2025 – Apr 2030",
    location: "Waterloo, ON",
    kind: "TRAINING",
    details: [
      "Core coursework in programming, linear algebra, circuits and digital systems — the foundation under the autonomy work.",
    ],
    tags: ["Computer Engineering", "Linear Algebra", "Systems", "Calculus", "Circuits and Digital Systems"],
  },
];

/* -------------------------------------------------------------------------- */
/* INSTRUMENT PANEL (skills)                                                  */
/* Levels are NOT hand-set. Each skill's signal strength is computed from how  */
/* many missions above actually list it — see lib/derive.ts.                   */
/* -------------------------------------------------------------------------- */

export const SKILL_GROUPS: SkillGroup[] = [
  {
    code: "AUT",
    label: "AUTONOMY & CONTROL",
    unit: "MISSIONS FLOWN",
    skills: [
      { name: "ArduPilot SITL", matches: ["ArduPilot SITL"], since: "2025" },
      { name: "MAVLink", matches: ["MAVLink"], since: "2025" },
      {
        name: "Homography / PnP",
        matches: ["Homography / PnP"],
        since: "2026",
      },
      {
        name: "Camera Calibration",
        matches: ["Camera Calibration"],
        since: "2026",
      },
    ],
  },
  {
    code: "PER",
    label: "PERCEPTION & ML",
    unit: "MISSIONS FLOWN",
    skills: [
      { name: "OpenCV", matches: ["OpenCV"], since: "2025" },
      { name: "ORB Features", matches: ["ORB Features"], since: "2026" },
      { name: "AprilTag", matches: ["AprilTag"], since: "2026" },
      { name: "XFeat", matches: ["XFeat"], since: "2026" },
      { name: "PyTorch", matches: ["PyTorch"], since: "2026" },
      { name: "Eigen", matches: ["Eigen"], since: "2026" },
    ],
  },
  {
    code: "LNG",
    label: "LANGUAGES",
    unit: "MISSIONS FLOWN",
    skills: [
      { name: "Python", matches: ["Python"], since: "2025" },
      { name: "C++", matches: ["C++"], since: "2026" },
      { name: "TypeScript", matches: ["TypeScript"], since: "2026" },
    ],
  },
  {
    code: "SYS",
    label: "SOFTWARE & INFRA",
    unit: "MISSIONS FLOWN",
    skills: [
      { name: "Docker", matches: ["Docker"], since: "2025" },
      { name: "Git / CI", matches: ["Git / CI"], since: "2025" },
      { name: "React / Next.js", matches: ["React / Next.js"], since: "2026" },
      { name: "Node.js", matches: ["Node.js"], since: "2026" },
      { name: "REST APIs", matches: ["REST APIs"], since: "2026" },
      { name: "Databases", matches: ["Databases"], since: "2026" },
      { name: "Linux", matches: ["Linux"], since: "2025" },
      { name: "Linear Algebra", matches: ["Linear Algebra"], since: "2025" },
      { name: "CMake", matches: ["CMake"], since: "2026" },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* COMMS                                                                      */
/* -------------------------------------------------------------------------- */

export interface CommsChannel {
  code: string;
  label: string;
  value: string;
  href: string;
}

export const COMMS: CommsChannel[] = [
  {
    code: "PRI",
    label: "EMAIL",
    value: "v23zhou@uwaterloo.ca",
    href: "mailto:v23zhou@uwaterloo.ca",
  },
  {
    code: "SEC",
    label: "GITHUB",
    value: "github.com/VZhou07",
    href: "https://github.com/VZhou07",
  },
  {
    code: "TER",
    label: "LINKEDIN",
    value: "linkedin.com/in/vincent-zhou-6aa06b383",
    href: "https://linkedin.com/in/vincent-zhou-6aa06b383",
  },
  {
    code: "AUX",
    label: "CLASSLY",
    value: "classly-black.vercel.app",
    href: "https://classly-black.vercel.app",
  },
];

/* -------------------------------------------------------------------------- */
/* ONBOARD FOOTAGE                                                            */
/* Drop your landing clip at public/media/ using these exact names. Until then */
/* the downlink panel reports NO SIGNAL instead of faking a video.             */
/* -------------------------------------------------------------------------- */

export const FOOTAGE = {
  src: "/media/landing.mp4",
  poster: "/media/landing-poster.jpg",
  /** Shown under the player as the accessible description of the clip. */
  caption:
    "Onboard downward camera, autonomous AprilTag landing. Raw and unstabilised — recorded off the airframe, not a produced clip.",
  missionId: "msn-02",
} as const;

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

/** True when a value is still an unreplaced placeholder or an empty anchor. */
export function isPlaceholder(value: string): boolean {
  const v = value.trim();
  if (!v || v === "#") return true;
  if (v.includes("[") || v.includes("]")) return true;
  return (
    v.includes("example.com") ||
    v.includes("yourhandle") ||
    v.includes("your-handle")
  );
}
