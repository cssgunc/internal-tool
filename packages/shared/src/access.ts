import type { AccessRole, PositionCategory } from "./enums";

export type AccessPosition = {
  category: PositionCategory;
  grantsExec: boolean;
};

export type DeriveAccessRoleInput = {
  isSuperuser: boolean;
  positions: readonly AccessPosition[];
};

export type DeriveAccessRoleOutput = AccessRole | null;

export type AssignmentPosition = AccessPosition & {
  id: string;
  seatLimit: number | null;
  perProject: boolean;
};

export type ExistingPositionAssignment = {
  memberId: string;
  positionId: string;
  category: PositionCategory;
  projectId: string | null;
};

export type CheckPositionAssignmentInput = {
  memberId: string;
  assignedByIsSuperuser: boolean;
  position: AssignmentPosition;
  projectId: string | null;
  existingAssignments: readonly ExistingPositionAssignment[];
};

export type PositionAssignmentCheck =
  | { allowed: true }
  | {
      allowed: false;
      code: "FORBIDDEN";
      reason: "EXEC_POSITION_REQUIRES_SUPERUSER";
    }
  | {
      allowed: false;
      code: "ALREADY_ON_PROJECT";
      reason: "ALREADY_ON_DIFFERENT_PROJECT";
    }
  | {
      allowed: false;
      code: "CONFLICT";
      reason: "SEAT_LIMIT_REACHED" | "PROJECT_SEAT_TAKEN";
    };
