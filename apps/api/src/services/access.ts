import type {
  CheckPositionAssignmentInput,
  DeriveAccessRoleInput,
  DeriveAccessRoleOutput,
  PositionAssignmentCheck,
} from "@internal-tool/shared";

export function deriveAccessRole({
  isSuperuser,
  positions,
}: DeriveAccessRoleInput): DeriveAccessRoleOutput {
  if (isSuperuser) return "superuser";
  if (positions.some((position) => position.grantsExec)) return "exec";
  if (positions.some((position) => position.category === "project")) return "project_member";
  return null;
}

export function checkPositionAssignment({
  memberId,
  assignedByIsSuperuser,
  position,
  projectId,
  existingAssignments,
}: CheckPositionAssignmentInput): PositionAssignmentCheck {
  if (position.grantsExec && !assignedByIsSuperuser) {
    return {
      allowed: false,
      code: "FORBIDDEN",
      reason: "EXEC_POSITION_REQUIRES_SUPERUSER",
    };
  }

  if (
    position.category === "project" &&
    existingAssignments.some(
      (assignment) =>
        assignment.memberId === memberId &&
        assignment.category === "project" &&
        assignment.projectId !== projectId
    )
  ) {
    return {
      allowed: false,
      code: "ALREADY_ON_PROJECT",
      reason: "ALREADY_ON_DIFFERENT_PROJECT",
    };
  }

  if (position.seatLimit === null) return { allowed: true };

  const positionAssignments = existingAssignments.filter(
    (assignment) => assignment.positionId === position.id
  );

  if (position.perProject) {
    const projectSeatCount = positionAssignments.filter(
      (assignment) => assignment.projectId === projectId
    ).length;
    if (projectSeatCount >= position.seatLimit) {
      return {
        allowed: false,
        code: "CONFLICT",
        reason: "PROJECT_SEAT_TAKEN",
      };
    }
  } else if (positionAssignments.length >= position.seatLimit) {
    return {
      allowed: false,
      code: "CONFLICT",
      reason: "SEAT_LIMIT_REACHED",
    };
  }

  return { allowed: true };
}
