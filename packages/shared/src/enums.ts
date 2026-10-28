// Access roles are derived from positions, never stored (TDD 2.1).
export const ACCESS_ROLES = ["superuser", "exec", "project_member"] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

export const POSITION_CATEGORIES = ["exec", "project", "education"] as const;
export type PositionCategory = (typeof POSITION_CATEGORIES)[number];

export const DEV_SUBROLES = ["backend", "frontend", "fullstack"] as const;
export type DevSubrole = (typeof DEV_SUBROLES)[number];
