import { checkPositionAssignment } from "./access";
import type {
  AssignPositionRequest,
  CreateProjectRequest,
  DeleteProjectResponse,
  MemberPosition,
  PatchProjectRequest,
  Project,
} from "@internal-tool/shared";
import { ApiError } from "../lib/errors";
import type { db } from "../db";
import { memberPositions, positions, projects } from "../db/schema";
import { DrizzleQueryError, eq } from "drizzle-orm";
import { diffChanges, recordAudit } from "./audit";
import type { AuditEntry } from "./audit";

type Database = typeof db;
type AssignmentCaller = { isSuperuser: boolean };

type AssignmentPosition = {
  id: string;
  name: string;
  category: "exec" | "project" | "education";
  grantsExec: boolean;
  seatLimit: number | null;
  perProject: boolean;
  isArchived: boolean;
};

type ExistingAssignment = {
  memberId: string;
  positionId: string;
  category: "exec" | "project" | "education";
  projectId: string | null;
};

type PositionLockContext = {
  position?: AssignmentPosition;
  existingAssignments: ExistingAssignment[];
  projectById(
    projectId: string
  ): Promise<{ semesterId: string; status: "active" | "archived" } | undefined>;
  insertAssignment(values: {
    memberId: string;
    positionId: string;
    semesterId: string;
    projectId: string | null;
    devSubrole: NonNullable<AssignPositionRequest["devSubrole"]> | null;
    assignedBy: string | null;
  }): Promise<MemberPosition>;
  // Written in the same transaction as the assignment (TDD 2.5).
  recordAudit(entry: AuditEntry): Promise<void>;
};

type MemberPositionRemovalContext = {
  grantsExec: boolean;
  // What's being removed, for the audit entry.
  assignment: Pick<
    MemberPosition,
    "memberId" | "positionId" | "semesterId" | "projectId" | "devSubrole"
  >;
  remove(): Promise<boolean>;
  recordAudit(entry: AuditEntry): Promise<void>;
};

export interface ProjectsStore {
  listProjects(semesterId?: string): Promise<Project[]>;
  createProject(input: CreateProjectRequest): Promise<Project>;
  patchProject(id: string, input: PatchProjectRequest): Promise<Project | undefined>;
  deleteProject(id: string): Promise<DeleteProjectResponse | undefined>;
  withPositionLock<T>(
    positionId: string,
    semesterId: string,
    run: (context: PositionLockContext) => Promise<T>
  ): Promise<T>;
  withMemberPositionLock<T>(
    id: string,
    run: (context: MemberPositionRemovalContext | undefined) => Promise<T>
  ): Promise<T>;
}

function toProject(row: typeof projects.$inferSelect): Project {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMemberPosition(row: typeof memberPositions.$inferSelect): MemberPosition {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

// Drizzle wraps driver errors in DrizzleQueryError; the Postgres error is its cause.
function uniqueViolation(error: unknown): { constraint_name?: unknown } | undefined {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  if (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === "23505"
  ) {
    return cause as { constraint_name?: unknown };
  }
  return undefined;
}

function conflictOnUniqueViolation(error: unknown): never {
  const violation = uniqueViolation(error);
  // Assignments to different project positions take different locks, so the
  // one-project-per-semester index is what stops a member landing on two projects at once.
  if (violation?.constraint_name === "member_positions_one_project_per_semester") {
    throw new ApiError(
      409,
      "ALREADY_ON_PROJECT",
      "The member is already assigned to another project."
    );
  }
  if (violation) {
    throw new ApiError(409, "CONFLICT", "The requested assignment or slug is already in use.");
  }
  throw error;
}

function createProjectsStore(database: Database): ProjectsStore {
  const projectColumns = {
    id: projects.id,
    semesterId: projects.semesterId,
    name: projects.name,
    slug: projects.slug,
    description: projects.description,
    notionUrl: projects.notionUrl,
    status: projects.status,
    createdAt: projects.createdAt,
    updatedAt: projects.updatedAt,
  };

  return {
    async listProjects(semesterId) {
      const rows = await database
        .select(projectColumns)
        .from(projects)
        .where(semesterId === undefined ? undefined : eq(projects.semesterId, semesterId))
        .orderBy(projects.name);
      return rows.map(toProject);
    },

    async createProject(input) {
      const [row] = await database
        .insert(projects)
        .values({
          ...input,
          description: input.description ?? null,
          notionUrl: input.notionUrl ?? null,
        })
        .returning();
      if (!row) throw new Error("Project insert returned no row.");
      return toProject(row);
    },

    async patchProject(id, input) {
      const [row] = await database
        .update(projects)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      return row && toProject(row);
    },

    async deleteProject(id) {
      return database.transaction(async (tx) => {
        const [project] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, id))
          .for("update");
        if (!project) return undefined;

        const [heldPosition] = await tx
          .select({ id: memberPositions.id })
          .from(memberPositions)
          .where(eq(memberPositions.projectId, id))
          .limit(1);
        if (heldPosition) {
          await tx
            .update(projects)
            .set({ status: "archived", updatedAt: new Date() })
            .where(eq(projects.id, id));
          return { id, archived: true };
        }

        await tx.delete(projects).where(eq(projects.id, id));
        return { id, archived: false };
      });
    },

    async withPositionLock(positionId, semesterId, run) {
      return database.transaction(async (tx) => {
        const [position] = await tx
          .select({
            id: positions.id,
            name: positions.name,
            category: positions.category,
            grantsExec: positions.grantsExec,
            seatLimit: positions.seatLimit,
            perProject: positions.perProject,
            isArchived: positions.isArchived,
          })
          .from(positions)
          .where(eq(positions.id, positionId))
          .for("update");
        const existingAssignments = await tx
          .select({
            memberId: memberPositions.memberId,
            positionId: memberPositions.positionId,
            category: positions.category,
            projectId: memberPositions.projectId,
          })
          .from(memberPositions)
          .innerJoin(positions, eq(memberPositions.positionId, positions.id))
          .where(eq(memberPositions.semesterId, semesterId));

        return run({
          position,
          existingAssignments,
          async projectById(projectId) {
            const [project] = await tx
              .select({ semesterId: projects.semesterId, status: projects.status })
              .from(projects)
              .where(eq(projects.id, projectId))
              .limit(1);
            return project;
          },
          async insertAssignment(values) {
            const [row] = await tx.insert(memberPositions).values(values).returning();
            if (!row) throw new Error("Position assignment insert returned no row.");
            return toMemberPosition(row);
          },
          async recordAudit(entry) {
            await recordAudit(entry, tx);
          },
        });
      });
    },

    async withMemberPositionLock(id, run) {
      return database.transaction(async (tx) => {
        const [assignment] = await tx
          .select({
            id: memberPositions.id,
            grantsExec: positions.grantsExec,
            memberId: memberPositions.memberId,
            positionId: memberPositions.positionId,
            semesterId: memberPositions.semesterId,
            projectId: memberPositions.projectId,
            devSubrole: memberPositions.devSubrole,
          })
          .from(memberPositions)
          .innerJoin(positions, eq(memberPositions.positionId, positions.id))
          .where(eq(memberPositions.id, id))
          .for("update");
        if (!assignment) return run(undefined);

        const { grantsExec, memberId, positionId, semesterId, projectId, devSubrole } = assignment;
        return run({
          grantsExec,
          assignment: { memberId, positionId, semesterId, projectId, devSubrole },
          async recordAudit(entry) {
            await recordAudit(entry, tx);
          },
          async remove() {
            const [removed] = await tx
              .delete(memberPositions)
              .where(eq(memberPositions.id, id))
              .returning({ id: memberPositions.id });
            return removed !== undefined;
          },
        });
      });
    },
  };
}

function auditFields(
  assignment: Pick<
    MemberPosition,
    "memberId" | "positionId" | "semesterId" | "projectId" | "devSubrole"
  >
) {
  const { memberId, positionId, semesterId, projectId, devSubrole } = assignment;
  return { memberId, positionId, semesterId, projectId, devSubrole };
}

async function defaultStore(): Promise<ProjectsStore> {
  const { db: database } = await import("../db");
  return createProjectsStore(database);
}

export function createProjectsService(store?: ProjectsStore) {
  async function getStore() {
    return store ?? defaultStore();
  }

  return {
    async listProjects(semesterId?: string): Promise<Project[]> {
      return (await getStore()).listProjects(semesterId);
    },

    async createProject(input: CreateProjectRequest): Promise<Project> {
      try {
        return await (await getStore()).createProject(input);
      } catch (error) {
        conflictOnUniqueViolation(error);
      }
    },

    async patchProject(id: string, input: PatchProjectRequest): Promise<Project> {
      let project: Project | undefined;
      try {
        project = await (await getStore()).patchProject(id, input);
      } catch (error) {
        conflictOnUniqueViolation(error);
      }
      if (!project) throw new ApiError(404, "NOT_FOUND", "Project not found.");
      return project;
    },

    async deleteProject(id: string): Promise<DeleteProjectResponse> {
      const result = await (await getStore()).deleteProject(id);
      if (!result) throw new ApiError(404, "NOT_FOUND", "Project not found.");
      return result;
    },

    async assignPosition(
      memberId: string,
      input: AssignPositionRequest,
      caller: AssignmentCaller
    ): Promise<MemberPosition> {
      const repository = await getStore();
      try {
        return await repository.withPositionLock(input.positionId, input.semesterId, async (tx) => {
          const position = tx.position;
          if (!position || position.isArchived) {
            throw new ApiError(404, "NOT_FOUND", "Position not found.");
          }
          if (position.category === "project" && !input.projectId) {
            throw new ApiError(400, "VALIDATION", "Project positions require a project.", {
              projectId: "A project is required for this position.",
            });
          }
          if (position.category !== "project" && input.projectId) {
            throw new ApiError(
              400,
              "VALIDATION",
              "Only project positions can be assigned to a project.",
              {
                projectId: "This position does not belong to a project.",
              }
            );
          }
          if (input.devSubrole && position.name !== "Developer") {
            throw new ApiError(
              400,
              "VALIDATION",
              "A developer subrole is only valid for Developer.",
              {
                devSubrole: "Only Developer assignments can have a subrole.",
              }
            );
          }
          if (input.projectId) {
            const project = await tx.projectById(input.projectId);
            if (
              !project ||
              project.semesterId !== input.semesterId ||
              project.status !== "active"
            ) {
              throw new ApiError(
                400,
                "VALIDATION",
                "Project must be active in the selected semester.",
                {
                  projectId: "Choose an active project from this semester.",
                }
              );
            }
          }

          const check = checkPositionAssignment({
            memberId,
            assignedByIsSuperuser: caller.isSuperuser,
            position,
            projectId: input.projectId ?? null,
            existingAssignments: tx.existingAssignments,
          });
          if (!check.allowed) {
            if (check.code === "FORBIDDEN") {
              throw new ApiError(403, "FORBIDDEN", "Only a superuser can assign an Exec position.");
            }
            if (check.code === "ALREADY_ON_PROJECT") {
              throw new ApiError(
                409,
                "ALREADY_ON_PROJECT",
                "The member is already assigned to another project."
              );
            }
            throw new ApiError(409, "CONFLICT", "The position has no available seats.");
          }

          const assigned = await tx.insertAssignment({
            memberId,
            positionId: input.positionId,
            semesterId: input.semesterId,
            projectId: input.projectId ?? null,
            devSubrole: input.devSubrole ?? null,
            assignedBy: null,
          });
          // TODO(auth): pass the signed-in member as the audit actor; until then it's System.
          await tx.recordAudit({
            action: "position.assign",
            targetType: "member_position",
            targetId: assigned.id,
            changes: diffChanges(null, auditFields(assigned)),
          });
          return assigned;
        });
      } catch (error) {
        conflictOnUniqueViolation(error);
      }
    },

    async removePositionAssignment(
      id: string,
      caller: AssignmentCaller
    ): Promise<{ id: string; removed: true }> {
      return (await getStore()).withMemberPositionLock(id, async (assignment) => {
        if (!assignment) throw new ApiError(404, "NOT_FOUND", "Position assignment not found.");
        if (assignment.grantsExec && !caller.isSuperuser) {
          throw new ApiError(403, "FORBIDDEN", "Only a superuser can remove an Exec position.");
        }

        if (!(await assignment.remove())) {
          throw new ApiError(404, "NOT_FOUND", "Position assignment not found.");
        }
        // TODO(auth): pass the signed-in member as the audit actor; until then it's System.
        await assignment.recordAudit({
          action: "position.remove",
          targetType: "member_position",
          targetId: id,
          changes: diffChanges(auditFields(assignment.assignment), null),
        });
        return { id, removed: true };
      });
    },
  };
}

export type ProjectsService = ReturnType<typeof createProjectsService>;
