/* ============================================================================
   DERIVED DATA
   ----------------------------------------------------------------------------
   Nothing in the UI hand-waves a number. Skill levels, radar contact positions
   and dossier stats are all computed from MISSIONS, so editing content.ts moves
   the instruments.
   ========================================================================== */

import {
  MISSIONS,
  SKILL_GROUPS,
  type Domain,
  type Mission,
  type SkillGroup,
  type StatusCode,
} from "./content";

/* -------------------------------------------------------------------------- */
/* STATUS PRESENTATION                                                        */
/* -------------------------------------------------------------------------- */

export interface StatusStyle {
  text: string;
  border: string;
  dot: string;
  /** Plain-language expansion, used as the chip's title/aria text. */
  note: string;
}

const STATUS_STYLES: Record<StatusCode, StatusStyle> = {
  DEPLOYED: {
    text: "text-nominal",
    border: "border-nominal/40",
    dot: "bg-nominal",
    note: "Running in production or in the team's main branch.",
  },
  "FLIGHT-VERIFIED": {
    text: "text-nominal",
    border: "border-nominal/40",
    dot: "bg-nominal",
    note: "Proven on the airframe, not just in simulation.",
  },
  COMPLETE: {
    text: "text-data",
    border: "border-data/40",
    dot: "bg-data",
    note: "Finished and working; not an ongoing programme.",
  },
  INTEGRATION: {
    text: "text-caution",
    border: "border-caution/40",
    dot: "bg-caution",
    note: "Feature-complete and wired in, awaiting verification.",
  },
  "IN PROGRESS": {
    text: "text-caution",
    border: "border-caution/40",
    dot: "bg-caution",
    note: "Active development.",
  },
};

export function statusStyle(status: StatusCode): StatusStyle {
  return STATUS_STYLES[status];
}

/**
 * Honest verification wording. Flight software can be flown; a C++ neural net or
 * a web app cannot, so those are reported as tested rather than airborne.
 */
export function verification(mission: Mission): {
  label: string;
  detail: string;
  ok: boolean;
} {
  if (mission.airborne) {
    return mission.verified
      ? {
          label: "FLOWN ON AIRFRAME",
          detail: "Proven on the vehicle, not only in simulation.",
          ok: true,
        }
      : {
          label: "NOT FLIGHT-TESTED",
          detail: "Written and integrated, but not yet verified on hardware.",
          ok: false,
        };
  }
  return mission.verified
    ? {
        label: "TESTED / RUNNING",
        detail: "Builds, runs and does what it claims — ground software.",
        ok: true,
      }
    : {
        label: "UNVERIFIED",
        detail: "Still being built; results not confirmed yet.",
        ok: false,
      };
}

/* -------------------------------------------------------------------------- */
/* SKILL SIGNAL STRENGTH                                                      */
/* Level = how many missions actually list the skill. Real, checkable, and it  */
/* changes when you add a mission.                                            */
/* -------------------------------------------------------------------------- */

export interface SkillStat {
  name: string;
  since: string;
  /** Missions whose stack lists this skill. */
  missions: Mission[];
  count: number;
  /** count / max count across the whole panel, 0..1 — drives bar fill. */
  normalised: number;
  /** count / total missions, 0..1 — shown as the raw fraction. */
  coverage: number;
}

export interface SkillGroupStat {
  code: string;
  label: string;
  unit: string;
  skills: SkillStat[];
  /** Distinct missions touched by anything in this group. */
  missionCount: number;
}

const TOTAL_MISSIONS = MISSIONS.length;

function missionsUsing(tokens: readonly string[]): Mission[] {
  const wanted = tokens.map((t) => t.toLowerCase());
  return MISSIONS.filter((m) =>
    m.stack.some((s) => wanted.includes(s.toLowerCase())),
  );
}

function buildGroupStats(groups: SkillGroup[]): SkillGroupStat[] {
  const raw = groups.map((g) => ({
    group: g,
    skills: g.skills.map((s) => ({
      name: s.name,
      since: s.since,
      missions: missionsUsing(s.matches),
    })),
  }));

  const peak = Math.max(
    1,
    ...raw.flatMap((g) => g.skills.map((s) => s.missions.length)),
  );

  return raw.map(({ group, skills }) => {
    const touched = new Set<string>();
    for (const s of skills) for (const m of s.missions) touched.add(m.id);

    return {
      code: group.code,
      label: group.label,
      unit: group.unit,
      missionCount: touched.size,
      skills: skills
        .map((s) => ({
          name: s.name,
          since: s.since,
          missions: s.missions,
          count: s.missions.length,
          normalised: s.missions.length / peak,
          coverage: s.missions.length / TOTAL_MISSIONS,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  });
}

export const SKILL_STATS: SkillGroupStat[] = buildGroupStats(SKILL_GROUPS);

/** Peak signal across the panel — the bar scale's reference. */
export const SKILL_PEAK = Math.max(
  1,
  ...SKILL_STATS.flatMap((g) => g.skills.map((s) => s.count)),
);

/* -------------------------------------------------------------------------- */
/* RADAR CONTACTS                                                             */
/* bearing  = engineering domain (fixed sectors, so the scope reads as a map)  */
/* range    = position in the mission list (index 0 = most recent = closest)   */
/* -------------------------------------------------------------------------- */

const DOMAIN_BEARING: Record<Domain, number> = {
  SIMULATION: 12,
  PERCEPTION: 78,
  AUTONOMY: 140,
  "MACHINE LEARNING": 212,
  "FULL-STACK": 292,
};

export interface Contact {
  mission: Mission;
  /** Degrees clockwise from scope north. */
  bearing: number;
  /** 0 (centre) .. 1 (scope edge). */
  range: number;
}

export const CONTACTS: Contact[] = MISSIONS.map((mission, i) => {
  const sector = DOMAIN_BEARING[mission.domain];
  /* Spread same-domain contacts deterministically so none overlap. */
  const siblings = MISSIONS.filter((m) => m.domain === mission.domain);
  const ordinal = siblings.findIndex((m) => m.id === mission.id);
  const spread = (ordinal - (siblings.length - 1) / 2) * 17;

  return {
    mission,
    bearing: (sector + spread + 360) % 360,
    range: 0.32 + (i / Math.max(1, TOTAL_MISSIONS - 1)) * 0.58,
  };
});

/* -------------------------------------------------------------------------- */
/* DOSSIER STATS                                                              */
/* -------------------------------------------------------------------------- */

export const FLEET = {
  missions: TOTAL_MISSIONS,
  verified: MISSIONS.filter((m) => m.verified).length,
  active: MISSIONS.filter(
    (m) => m.status === "IN PROGRESS" || m.status === "INTEGRATION",
  ).length,
  deployed: MISSIONS.filter(
    (m) => m.status === "DEPLOYED" || m.status === "FLIGHT-VERIFIED",
  ).length,
  stackDepth: new Set(MISSIONS.flatMap((m) => m.stack)).size,
  domains: new Set(MISSIONS.map((m) => m.domain)).size,
  orgs: new Set(MISSIONS.map((m) => m.org)).size,
} as const;

/** Every stack token in use, most-used first — powers the mission filter. */
export const STACK_INDEX: { token: string; count: number }[] = Object.entries(
  MISSIONS.reduce<Record<string, number>>((acc, m) => {
    for (const s of m.stack) acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {}),
)
  .map(([token, count]) => ({ token, count }))
  .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));

export const STATUS_INDEX: { status: StatusCode; count: number }[] =  Object.entries(
    MISSIONS.reduce<Record<string, number>>((acc, m) => {
      acc[m.status] = (acc[m.status] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([status, count]) => ({ status: status as StatusCode, count }))
    .sort((a, b) => b.count - a.count);

/* -------------------------------------------------------------------------- */
/* DOMAIN DISTRIBUTION — where the work actually sits                          */
/* -------------------------------------------------------------------------- */

export const DOMAIN_INDEX: {
  domain: Domain;
  count: number;
  share: number;
  bearing: number;
}[] = (Object.keys(DOMAIN_BEARING) as Domain[])
  .map((domain) => {
    const count = MISSIONS.filter((m) => m.domain === domain).length;
    return {
      domain,
      count,
      share: count / TOTAL_MISSIONS,
      bearing: DOMAIN_BEARING[domain],
    };
  })
  .filter((d) => d.count > 0)
  .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));

/* -------------------------------------------------------------------------- */
/* SMALL NUMERIC HELPERS (used by the flight computer + instruments)          */
/* -------------------------------------------------------------------------- */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Pads a number for fixed-width HUD readouts, e.g. 7.4 -> "007.4". */
export function pad(value: number, intDigits: number, decimals = 1): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const body = int.padStart(intDigits, "0") + (dec ? `.${dec}` : "");
  return (value < 0 ? "-" : "") + body;
}
