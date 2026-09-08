/* ============================================================================
   CONTENT SOURCE OF TRUTH
   ----------------------------------------------------------------------------
   Everything user-facing lives here — profile, missions, waypoints, skills,
   comms channels, and flight-footage metadata.

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
  /** True for the mission that owns the flight-test footage. */
  hasFootage?: boolean;
}

export interface Waypoint {
  role: string;
  org: string;
  dates: string;
  location: string;
  kind: "COMMAND" | "OPERATIONS" | "TRAINING";
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
  title: "Computer Engineering student building autonomy that flies",
  tagline:
    "I write the flight software that lands a drone on its own launch point using nothing but what the camera remembers.",
  location: "Waterloo, ON",
  /** Origin the boot sequence sets EKF home to. Waterloo by default. */
  homeLat: 43.4723,
  homeLon: -80.5449,
  about: [
    "Computer Engineering at the University of Waterloo. I run the autonomy subteam at the Waterloo Aerial Robotics Group — thirty people, one flight-software stack, and a competition airframe that has to work on the day.",
    "The work I care most about is precision landing without a marker: record what the ground looks like on the way up, match it on the way down, and put the aircraft back where it started. It landed inside 15 cm on the airframe.",
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
  { id: "teach-repeat", code: "04", label: "TEACH & REPEAT", bearing: 135 },
  { id: "baseline", code: "05", label: "TAG BASELINE", bearing: 180 },
  { id: "waypoints", code: "06", label: "WAYPOINTS", bearing: 225 },
  { id: "instruments", code: "07", label: "INSTRUMENTS", bearing: 270 },
  { id: "comms", code: "08", label: "COMMS", bearing: 315 },
];

/**
 * Section lookup by id. Sections are referenced by name rather than by array
 * index so inserting one cannot silently repoint another section's chrome.
 */
export function sectionOf(id: string): SectionDef {
  const found = SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown section id: ${id}`);
  return found;
}

/** Position of a section in the scroll order — used by scroll-driven panels. */
export function sectionSlot(id: string): number {
  return SECTIONS.findIndex((s) => s.id === id);
}

/* -------------------------------------------------------------------------- */
/* MISSIONS — ordered most recent first (order drives radar range)             */
/* -------------------------------------------------------------------------- */

export const MISSIONS: Mission[] = [
  {
    id: "msn-01",
    name: "PRECISION LANDING · TEACH & REPEAT",
    subtitle: "NO MARKER, NO GPS FIX — LANDED INSIDE 15 cm",
    status: "FLIGHT-VERIFIED",
    verified: true,
    airborne: true,
    domain: "PERCEPTION",
    org: "UWARG · Autonomy",
    window: "May 2026 – Sept 2026",
    stack: [
      "Python",
      "ROS 2",
      "OpenCV",
      "ORB Features",
      "MAVROS",
      "CUDA",
      "NVIDIA Jetson",
      "Camera Calibration",
      "Homography / RANSAC",
      "NumPy",
      "Linux / systemd",
      "Bash",
    ],
    brief:
      "A visual teach-and-repeat precision landing built and flight-tested end to end. On the way up it records an altitude-keyed map of ORB features; on the way down it matches each live frame against the nearest teach frame and flies the aircraft back onto its own launch point. 15 cm in flight test, 2 cm in simulation.",
    log: [
      "Teach pass: every fixed rise in altitude the descent will care about gets its own keyframe — keypoints, descriptors and the attitude they were shot at — stored in a sorted map keyed by height above ground from the downward rangefinder.",
      "Repeat pass: the live frame is matched against the teach frame immediately below the aircraft using Lowe-ratio-filtered kNN matching, both sets are back-projected to metric ground coordinates with roll and pitch compensation, and a RANSAC partial-affine fit gives the lateral correction directly in metres.",
      "Descent authority is not a hard gate: it tapers with match quality inside an alignment cone that tightens as the ground approaches, so a marginal fix slows the descent instead of stopping it dead.",
      "Field failure modes are handled explicitly — teach frames with too few keypoints are rejected rather than stored, degenerate transforms are thrown out on inlier ratio and scale, and a stale-vision state machine climbs to widen the camera footprint and re-acquire instead of hovering blind.",
      "Runs on an NVIDIA Jetson in a 10 Hz control loop with a CUDA brute-force matcher and a CPU fallback; I also wrote the Arducam V4L2 driver, its systemd unit and the Bash provisioning scripts.",
      "Touchdown is handed to ArduPilot's LAND mode with debounced ground confirmation rather than driving velocity setpoints into the dirt.",
    ],
    impact:
      "Removes the printed marker from the landing problem entirely: the aircraft can return to any textured surface it took off from. Flight-verified inside 15 cm — section 04 takes the recovered flight frames apart.",
    links: [
      {
        label: "BRANCH · non-optimal-targets",
        href: "https://github.com/UWARG/autonomy-monorepo/tree/non-optimal-targets",
      },
    ],
    hasFootage: true,
  },
  {
    id: "msn-02",
    name: "AUTONOMY STACK · ARCHITECTURE & REVIEW",
    subtitle: "30-PERSON SUBTEAM, ONE FLIGHT-SOFTWARE STACK",
    status: "IN PROGRESS",
    verified: true,
    airborne: true,
    domain: "AUTONOMY",
    org: "UWARG · Autonomy",
    window: "Sept 2026 – Present",
    stack: ["Python", "ROS 2", "MAVLink", "Git / CI", "Docker"],
    brief:
      "Running the autonomy subteam: thirty contributors split into parallel project groups, a flight-software backlog scoped into issues small enough to onboard on, and an architecture that lets those groups land work without stepping on each other.",
    log: [
      "Set the ROS 2 node and message boundaries between the perception, GNC and obstacle-avoidance packages, so work split across groups integrates instead of being rewritten at merge time.",
      "Run code review for the stack — the architectural decisions and the review bar are mine to hold.",
      "Scoped the backlog into issues sized for onboarding, and track them through to flight readiness for the 2027 AEAC competition.",
      "Organised contributors into parallel project groups so several efforts can run at once against one shared airframe and one shared simulator.",
    ],
    impact:
      "Thirty people can ship into the same flight-software stack because the interfaces between their packages are decided up front rather than negotiated in review.",
    links: [
      {
        label: "REPO · autonomy-monorepo",
        href: "https://github.com/UWARG/autonomy-monorepo",
      },
    ],
  },
  {
    id: "msn-03",
    name: "SITL-PLUS",
    subtitle: "UAV SIMULATOR WRITTEN FROM SCRATCH",
    status: "DEPLOYED",
    verified: true,
    airborne: false,
    domain: "SIMULATION",
    org: "UWARG · Autonomy",
    window: "May 2026 – Present",
    stack: [
      "Python",
      "PyBullet",
      "ArduPilot SITL",
      "MAVLink",
      "Rerun",
      "NumPy",
      "Docker",
      "pytest",
      "Git / CI",
    ],
    brief:
      "A software-in-the-loop range built from scratch: PyBullet rigid-body physics for the quadcopter's flight dynamics, bridged to ArduPilot's SITL binary over a UDP JSON protocol so the real flight controller flies a simulated airframe at full rate.",
    log: [
      "Modelled the quadcopter's dynamics on PyBullet rigid bodies and exchanged physics and flight-controller state with ArduPilot SITL over UDP JSON at high rate.",
      "Simulated the onboard sensor suite: downward and forward RGB-D cameras through PyBullet's OpenGL renderer plus a ray-cast rangefinder/LiDAR — the same tensors the perception nodes see in flight.",
      "Streamed the whole scene to Rerun over gRPC for live 3D visualisation, so a failing descent can be watched rather than inferred from logs.",
      "Containerised physics engine, ArduPilot SITL and MAVProxy with Docker Compose, and covered the sensor and dynamics models with a pytest suite.",
      "Used the range to tune the precision-landing pipeline to 2 cm before ever booking airframe time.",
    ],
    impact:
      "The landing pipeline was tuned to 2 cm in simulation before the first flight test — which is the only reason the first flight test was safe to attempt.",
    links: [
      {
        label: "PULL REQUEST #134",
        href: "https://github.com/UWARG/autonomy-monorepo/pull/134",
      },
      {
        label: "PROJECT · SITL-Plus",
        href: "https://github.com/UWARG/autonomy-monorepo/tree/non-optimal-targets/SITL-Plus",
      },
    ],
  },
  {
    id: "msn-04",
    name: "PRECISION LANDING · APRILTAG BASELINE",
    subtitle: "THE CONTROL LOOP, PROVEN BEFORE THE PERCEPTION CHANGED",
    status: "FLIGHT-VERIFIED",
    verified: true,
    airborne: true,
    domain: "PERCEPTION",
    org: "UWARG · Autonomy",
    window: "May 2026 – Jul 2026",
    stack: [
      "Python",
      "ROS 2",
      "OpenCV",
      "AprilTag",
      "MAVROS",
      "Camera Calibration",
      "ArduPilot SITL",
    ],
    brief:
      "Closed-loop descent onto an AprilTag, flown first and deliberately: with a fiducial in the frame the target estimate is effectively ground truth, so any bad behaviour left over belongs to the controller and not to the perception.",
    log: [
      "Detected the tag in the downward camera and solved its relative pose against intrinsics from a calibration pass.",
      "Fed the descent controller the same target-estimate contract the feature-based path would later fill, so the front end became swappable without touching control.",
      "Confirmed landings on the marker before substituting feature-based localisation — which is what made a control fault and a perception fault distinguishable later.",
      "Verified in the SITL range first, then on the airframe.",
    ],
    impact:
      "Made control and perception failures diagnosable separately. Every gain in the velocity controller was already trusted by the time the fiducial came out of the frame.",
    links: [
      {
        label: "PULL REQUEST #73",
        href: "https://github.com/UWARG/autonomy-monorepo/pull/73",
      },
    ],
  },
  {
    id: "msn-05",
    name: "CNN FEATURE MATCHING",
    subtitle: "LEARNED DESCRIPTORS WHERE ORB GIVES UP",
    status: "IN PROGRESS",
    verified: false,
    airborne: true,
    domain: "MACHINE LEARNING",
    org: "UWARG · Autonomy",
    window: "Sept 2026 – Present",
    stack: [
      "Python",
      "PyTorch",
      "XFeat",
      "OpenCV",
      "NumPy",
      "NVIDIA Jetson",
      "Homography / RANSAC",
    ],
    brief:
      "A lightweight 2D convolutional detector–descriptor network (XFeat) with parallel keypoint-detection and 64-dimensional dense-descriptor heads, aimed squarely at the conditions where hand-engineered ORB degrades on the landing pipeline.",
    log: [
      "Targeting the two failures the flight data actually shows: the scale gap between a teach frame and a repeat frame taken much lower, and the exposure and contrast shift between takeoff and landing.",
      "Training on a self-captured aerial dataset with ground-truth correspondences generated from known homographies plus photometric augmentation.",
      "Benchmarking match precision, RANSAC inlier ratio and final landing error against the ORB baseline over identical replayed trajectories.",
      "Scored against the Jetson's 10 Hz inference budget — a descriptor that cannot hold the control loop rate is not a candidate, however good its matches are.",
    ],
    impact:
      "The recovered flight frames in section 04 show ORB's match count collapsing as the scale gap widens. This is the direct answer to that measurement.",
    links: [
      {
        label: "PULL REQUEST #130",
        href: "https://github.com/UWARG/autonomy-monorepo/pull/130",
      },
    ],
  },
  {
    id: "msn-06",
    name: "AEAC TARGET GEOLOCATION PLATFORM",
    subtitle: "PIXELS TO GROUND COORDINATES, LIVE, UNDER 0.5 m",
    status: "IN PROGRESS",
    verified: true,
    airborne: false,
    domain: "FULL-STACK",
    org: "UWARG · AEAC 2026 Firefighting",
    window: "Mar 2026 – Sept 2026",
    stack: [
      "TypeScript",
      "React / Next.js",
      "Python",
      "Flask",
      "REST APIs",
      "Linear Algebra",
      "NumPy",
      "Docker",
      "Git / CI",
    ],
    brief:
      "Full-stack, real-time UAV geolocation platform for the 2026 AEAC Firefighting competition: a React/TypeScript operator console over a Flask REST API that turns a target spotted mid-flight into a 3D ground coordinate.",
    log: [
      "Operators capture, annotate and geolocate targets while the aircraft is still flying — the console is built to be run by a non-engineer under competition time pressure.",
      "Localisation is a pinhole camera model plus a ray–plane intersection against live telemetry, resolving targets in 3D to better than 0.5 m.",
      "Same projection geometry the landing solvers use, pointed at mapping instead of control.",
    ],
    impact:
      "Gives the competition crew one surface from an airborne detection to a mapped target, accurate to under half a metre.",
    links: [
      {
        label: "REPO · Auto-AEAC-2026-Task-1-MVP",
        href: "https://github.com/UWARG/Auto-AEAC-2026-Task-1-MVP/tree/UI-improvement-scaffold",
      },
    ],
  },
  {
    id: "msn-07",
    name: "CLASSLY",
    subtitle: "CLASSROOM PLATFORM, SHIPPED AND SERVERLESS",
    status: "DEPLOYED",
    verified: true,
    airborne: false,
    domain: "FULL-STACK",
    org: "Personal",
    window: "Apr 2026 – Aug 2026",
    stack: [
      "TypeScript",
      "React / Next.js",
      "Node.js / Express",
      "PostgreSQL",
      "Drizzle ORM",
      "SQL",
      "REST APIs",
      "Cloudflare Workers",
      "Git / CI",
    ],
    brief:
      "A classroom management platform in production: role-based access for admins, teachers and students over a Postgres/Drizzle schema, session auth with OAuth, and an invite-based onboarding flow built on cryptographically secure tokens.",
    log: [
      "Designed the Postgres/Drizzle schema and the role-based access control (admin / teacher / student) around it, with Better-Auth sessions over email-password plus Google and GitHub OAuth.",
      "Migrated the backend off a long-running Render container onto Cloudflare Workers with serverless Postgres over WebSockets — which meant scoping connection-pool lifetime to the request to stop pools leaking across transactions, and adding a cron-triggered session-cleanup job.",
      "Hardened the API with Arcjet bot detection and rate limiting, parameterised queries throughout, and row-level locking with transactional rollback so concurrent enrolment cannot race.",
    ],
    impact:
      "Live at classly-black.vercel.app. The interesting part was not the features — it was the serverless migration, where the old connection-pool assumptions quietly broke and had to be re-scoped per request.",
    links: [
      { label: "LIVE SITE", href: "https://classly-black.vercel.app" },
      { label: "FRONTEND", href: "https://github.com/VZhou07/Classly" },
      { label: "BACKEND", href: "https://github.com/VZhou07/Classly-Backend" },
    ],
  },
  {
    id: "msn-08",
    name: "NEURAL NETWORK FROM SCRATCH",
    subtitle: "C++ / EIGEN MLP, NO FRAMEWORK, 95.4% ON MNIST",
    status: "COMPLETE",
    verified: true,
    airborne: false,
    domain: "MACHINE LEARNING",
    org: "Personal",
    window: "Jun 2026 – Jul 2026",
    stack: ["C++", "Eigen", "Linear Algebra", "Git / CI"],
    brief:
      "A multilayer perceptron implemented with no ML framework at all: forward pass and backpropagation derived by hand and written straight onto Eigen matrices.",
    log: [
      "Derived forward and backward passes by hand and checked the gradients numerically.",
      "Mini-batch SGD with early stopping that checkpoints the best weights when validation plateaus, rather than keeping whatever the last epoch produced.",
      "Reaches 95.4% test accuracy on MNIST.",
    ],
    impact:
      "95.4% on MNIST with every line of the maths owned. Useful afterwards as a reference for what the frameworks are actually doing.",
    links: [
      { label: "REPO · Neural-Network", href: "https://github.com/VZhou07/Neural-Network" },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* WAYPOINTS (experience)                                                     */
/* -------------------------------------------------------------------------- */

export const WAYPOINTS: Waypoint[] = [
  {
    role: "Autonomy Project Manager",
    org: "UWARG — Waterloo Aerial Robotics Group",
    dates: "Sept 2026 – Present",
    location: "Waterloo, ON",
    kind: "COMMAND",
    details: [
      "Lead a 30-member autonomy subteam: contributors organised into parallel project groups, the flight-software backlog scoped into issues sized for onboarding, tracked through to flight readiness for the 2027 AEAC competition.",
      "Run code review for the autonomy stack and set its architectural direction — the ROS 2 node and message boundaries between the perception, GNC and obstacle-avoidance packages, so work split across groups integrates without rework.",
      "See MSN-02 for the architecture itself.",
    ],
    tags: ["ROS 2", "Code Review", "Architecture", "Technical Leadership"],
  },
  {
    role: "Software Engineering Intern",
    org: "UWARG — Waterloo Aerial Robotics Group",
    dates: "May 2026 – Sept 2026",
    location: "Waterloo, ON",
    kind: "OPERATIONS",
    details: [
      "Independently designed, built and flight-tested the visual teach-and-repeat precision-landing system — 15 cm in flight test, 2 cm in simulation. See MSN-01.",
      "Validated the descent controller against an AprilTag baseline first, so control and perception failures stayed separable. See MSN-04.",
      "Built SITL-Plus, the from-scratch PyBullet simulator the landing pipeline was tuned in. See MSN-03.",
      "Architected the AEAC 2026 Firefighting geolocation platform, localising targets in 3D to under 0.5 m. See MSN-06.",
    ],
    tags: ["Python", "ROS 2", "OpenCV", "MAVROS", "NVIDIA Jetson", "PyBullet"],
  },
  {
    role: "Software Developer",
    org: "UW Orbital — Waterloo Satellite Design Team",
    dates: "Sept 2025 – Apr 2026",
    location: "Waterloo, ON",
    kind: "OPERATIONS",
    details: [
      "Built a RESTful command management API (FastAPI, SQLModel) for the satellite ground-station system: CRUD endpoints with request validation, and Loguru-based logging middleware for real-time performance monitoring.",
    ],
    tags: ["Python", "FastAPI", "SQLModel", "REST APIs", "Loguru"],
  },
  {
    role: "B.A.Sc. Computer Engineering, Honours Co-op",
    org: "University of Waterloo",
    dates: "Sept 2025 – June 2030",
    location: "Waterloo, ON",
    kind: "TRAINING",
    details: [
      "Core coursework in programming, linear algebra, circuits and digital systems — the foundation under the autonomy work.",
    ],
    tags: [
      "Computer Engineering",
      "Linear Algebra",
      "Digital Systems",
      "Verilog / Quartus",
      "Calculus",
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* INSTRUMENT PANEL (skills)                                                  */
/* Levels are NOT hand-set. Each skill's signal strength is computed from how  */
/* many missions above actually list it — see lib/derive.ts. A skill only      */
/* appears here if a logged mission used it; everything else goes in           */
/* ALSO_RUNNING, without a fabricated level.                                   */
/* -------------------------------------------------------------------------- */

export const SKILL_GROUPS: SkillGroup[] = [
  {
    code: "LNG",
    label: "LANGUAGES",
    unit: "MISSIONS FLOWN",
    skills: [
      { name: "Python", matches: ["Python"], since: "2025" },
      { name: "C++", matches: ["C++"], since: "2026" },
      { name: "TypeScript", matches: ["TypeScript"], since: "2026" },
      { name: "SQL", matches: ["SQL"], since: "2026" },
      { name: "Bash", matches: ["Bash"], since: "2026" },
    ],
  },
  {
    code: "ROB",
    label: "ROBOTICS & FLIGHT",
    unit: "MISSIONS FLOWN",
    skills: [
      { name: "ROS 2", matches: ["ROS 2"], since: "2026" },
      { name: "MAVROS", matches: ["MAVROS"], since: "2026" },
      { name: "MAVLink", matches: ["MAVLink"], since: "2025" },
      { name: "ArduPilot SITL", matches: ["ArduPilot SITL"], since: "2025" },
      { name: "NVIDIA Jetson", matches: ["NVIDIA Jetson"], since: "2026" },
      { name: "PyBullet", matches: ["PyBullet"], since: "2026" },
      { name: "Rerun", matches: ["Rerun"], since: "2026" },
    ],
  },
  {
    code: "VIS",
    label: "VISION & LEARNING",
    unit: "MISSIONS FLOWN",
    skills: [
      { name: "OpenCV", matches: ["OpenCV"], since: "2025" },
      { name: "ORB Features", matches: ["ORB Features"], since: "2026" },
      { name: "AprilTag", matches: ["AprilTag"], since: "2026" },
      { name: "Homography / RANSAC", matches: ["Homography / RANSAC"], since: "2026" },
      { name: "Camera Calibration", matches: ["Camera Calibration"], since: "2026" },
      { name: "CUDA", matches: ["CUDA"], since: "2026" },
      { name: "PyTorch", matches: ["PyTorch"], since: "2026" },
      { name: "XFeat", matches: ["XFeat"], since: "2026" },
      { name: "NumPy", matches: ["NumPy"], since: "2025" },
      { name: "Eigen", matches: ["Eigen"], since: "2026" },
      { name: "Linear Algebra", matches: ["Linear Algebra"], since: "2025" },
    ],
  },
  {
    code: "SYS",
    label: "BACKEND, DATA & INFRA",
    unit: "MISSIONS FLOWN",
    skills: [
      { name: "Docker", matches: ["Docker"], since: "2025" },
      { name: "Git / CI", matches: ["Git / CI"], since: "2025" },
      { name: "React / Next.js", matches: ["React / Next.js"], since: "2026" },
      { name: "Node.js / Express", matches: ["Node.js / Express"], since: "2026" },
      { name: "Flask", matches: ["Flask"], since: "2026" },
      { name: "REST APIs", matches: ["REST APIs"], since: "2026" },
      { name: "PostgreSQL", matches: ["PostgreSQL"], since: "2026" },
      { name: "Drizzle ORM", matches: ["Drizzle ORM"], since: "2026" },
      { name: "Cloudflare Workers", matches: ["Cloudflare Workers"], since: "2026" },
      { name: "Linux / systemd", matches: ["Linux / systemd"], since: "2026" },
      { name: "pytest", matches: ["pytest"], since: "2026" },
    ],
  },
];

/**
 * Used, but not by anything in the mission log above — so it gets a name and no
 * signal bar. Inventing a level for these would break the one rule the
 * instrument panel has.
 */
export const ALSO_RUNNING: { group: string; items: string[] }[] = [
  { group: "LANGUAGES", items: ["Java", "JavaScript", "Lua", "Verilog"] },
  { group: "HARDWARE", items: ["Raspberry Pi", "Quartus / FPGA"] },
  { group: "BACKEND & DATA", items: ["FastAPI", "SQLModel", "Pydantic", "Zod", "Neon"] },
  { group: "INFRA & TESTING", items: ["Cloudflare Pages", "Wrangler", "GitHub Actions CI", "Vitest", "Loguru"] },
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
/* FLIGHT FOOTAGE                                                             */
/* Both clips are ground-observer video of real flight tests, tone-mapped from */
/* the original 10-bit HLG phone capture and trimmed to the descent. Neither   */
/* is onboard video — the onboard imagery is the recovered frame set in        */
/* lib/teach-repeat.ts, which is a different and better kind of evidence.      */
/* -------------------------------------------------------------------------- */

export interface Footage {
  /** H.264 source; every browser can play this one. */
  src: string;
  /** VP9 alternative, offered first where it is supported. */
  webm: string;
  poster: string;
  /** Accessible description of the clip, shown under the player. */
  caption: string;
  missionId: string;
  /** Where and when it was shot, straight out of the capture metadata. */
  shot: string;
}

export const FOOTAGE: Footage = {
  src: "/media/non-optimal-landing.mp4",
  webm: "/media/non-optimal-landing.webm",
  poster: "/media/non-optimal-landing-poster.jpg",
  caption:
    "The teach-and-repeat landing, from the ground. The aircraft is descending on vision alone at 0.1 m/s onto the taped launch point it mapped on the way up; ArduPilot's LAND mode takes the last metre. Unstabilised phone video, tone-mapped and trimmed to the touchdown.",
  missionId: "msn-01",
  shot: "2026-08-19 19:49 EDT · 43.4354 N 80.5783 W",
};

export const APRILTAG_FOOTAGE: Footage = {
  src: "/media/apriltag-landing.mp4",
  webm: "/media/apriltag-landing.webm",
  poster: "/media/apriltag-landing-poster.jpg",
  caption:
    "The AprilTag baseline descent, from the ground. Same controller, same airframe, but with a fiducial in the frame so the target estimate is effectively ground truth — this is the run that proved the control loop before the marker came out.",
  missionId: "msn-04",
  shot: "Ground observer · unstabilised, tone-mapped from 10-bit HLG",
};

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
