import { describe, expect, it } from "bun:test";
import {
  deleteMemberPositionResponseSchema,
  deleteProjectResponseSchema,
  errorResponseSchema,
  memberPositionSchema,
  projectListResponseSchema,
  projectSchema,
} from "@internal-tool/shared";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../src/app";
import { env } from "../src/env";
import { ApiError } from "../src/lib/errors";
import type { ProjectsStore } from "../src/services/projects";
import { createProjectsService } from "../src/services/projects";
import type { MemberPosition, Project } from "@internal-tool/shared";

const semesterId = "00000000-0000-4000-8000-000000000001";
const otherSemesterId = "00000000-0000-4000-8000-000000000002";
const projectId = "00000000-0000-4000-8000-000000000003";
const otherProjectId = "00000000-0000-4000-8000-000000000004";
const memberId = "00000000-0000-4000-8000-000000000005";
const otherMemberId = "00000000-0000-4000-8000-000000000006";
const developerId = "00000000-0000-4000-8000-000000000007";
const managerId = "00000000-0000-4000-8000-000000000008";
const limitedPositionId = "00000000-0000-4000-8000-000000000009";
const execPositionId = "00000000-0000-4000-8000-000000000010";
const assignmentId = "00000000-0000-4000-8000-000000000011";

const now = "2026-01-01T00:00:00.000Z";

function project(id: string, semester: string, name: string, slug: string): Project {
  return {
    id,
    semesterId: semester,
    name,
    slug,
    description: null,
    notionUrl: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function assignment(values: Partial<MemberPosition> = {}): MemberPosition {
  return {
    id: assignmentId,
    memberId: otherMemberId,
    positionId: developerId,
    semesterId,
    projectId,
    devSubrole: null,
    assignedBy: null,
    createdAt: now,
    ...values,
  };
}

function setup(options: { isSuperuser?: boolean; assignments?: MemberPosition[] } = {}) {
  const projectRows = [
    project(projectId, semesterId, "Project One", "project-one"),
    project(otherProjectId, semesterId, "Project Two", "project-two"),
    project("00000000-0000-4000-8000-000000000012", otherSemesterId, "Other Semester", "other"),
  ];
  const assignments = [...(options.assignments ?? [])];
  const positions = new Map([
    [
      developerId,
      {
        id: developerId,
        name: "Developer",
        category: "project" as const,
        grantsExec: false,
        seatLimit: null,
        perProject: false,
        isArchived: false,
      },
    ],
    [
      managerId,
      {
        id: managerId,
        name: "Project Manager",
        category: "project" as const,
        grantsExec: false,
        seatLimit: 1,
        perProject: true,
        isArchived: false,
      },
    ],
    [
      limitedPositionId,
      {
        id: limitedPositionId,
        name: "Lead Engineer",
        category: "project" as const,
        grantsExec: false,
        seatLimit: 1,
        perProject: false,
        isArchived: false,
      },
    ],
    [
      execPositionId,
      {
        id: execPositionId,
        name: "VP of Strategy",
        category: "exec" as const,
        grantsExec: true,
        seatLimit: 1,
        perProject: false,
        isArchived: false,
      },
    ],
  ]);
  const store: ProjectsStore = {
    async listProjects(filterSemesterId) {
      return projectRows.filter(
        (row) => filterSemesterId === undefined || row.semesterId === filterSemesterId
      );
    },
    async createProject(input) {
      if (
        projectRows.some((row) => row.semesterId === input.semesterId && row.slug === input.slug)
      ) {
        throw Object.assign(new Error("duplicate slug"), { code: "23505" });
      }
      const row = project(crypto.randomUUID(), input.semesterId, input.name, input.slug);
      row.description = input.description ?? null;
      row.notionUrl = input.notionUrl ?? null;
      projectRows.push(row);
      return row;
    },
    async patchProject(id, input) {
      const row = projectRows.find((candidate) => candidate.id === id);
      if (!row) return undefined;
      Object.assign(row, input, { updatedAt: new Date().toISOString() });
      return row;
    },
    async deleteProject(id) {
      const index = projectRows.findIndex((row) => row.id === id);
      if (index < 0) return undefined;
      const held = assignments.some((row) => row.projectId === id);
      if (held) {
        projectRows[index]!.status = "archived";
        return { id, archived: true };
      }
      projectRows.splice(index, 1);
      return { id, archived: false };
    },
    async withPositionLock(positionId, _semesterId, run) {
      return run({
        position: positions.get(positionId),
        existingAssignments: assignments.flatMap((row) => {
          const position = positions.get(row.positionId);
          return position
            ? [
                {
                  memberId: row.memberId,
                  positionId: row.positionId,
                  category: position.category,
                  projectId: row.projectId,
                },
              ]
            : [];
        }),
        async projectById(id) {
          const row = projectRows.find((candidate) => candidate.id === id);
          return row && { semesterId: row.semesterId, status: row.status };
        },
        async insertAssignment(values) {
          if (
            assignments.some(
              (row) =>
                row.memberId === values.memberId &&
                row.positionId === values.positionId &&
                row.semesterId === values.semesterId
            )
          ) {
            throw Object.assign(new Error("duplicate assignment"), { code: "23505" });
          }
          const row: MemberPosition = {
            id: crypto.randomUUID(),
            ...values,
            createdAt: new Date().toISOString(),
          };
          assignments.push(row);
          return row;
        },
      });
    },
    async withMemberPositionLock(id, run) {
      const row = assignments.find((candidate) => candidate.id === id);
      if (!row) return run(undefined);
      const position = positions.get(row.positionId);
      if (!position) throw new Error("Assignment position not found.");
      return run({
        grantsExec: position.grantsExec,
        async remove() {
          const index = assignments.findIndex((candidate) => candidate.id === id);
          if (index < 0) return false;
          assignments.splice(index, 1);
          return true;
        },
      });
    },
  };

  const service = createProjectsService(store);
  const app = createApp({
    projectsService: service,
    assignmentCaller: () => ({ isSuperuser: options.isSuperuser ?? true }),
  });
  return { app, assignments, projectRows };
}

describe("projects endpoints", () => {
  it("filters projects by semester", async () => {
    const { app } = setup();
    const response = await app.request(`/api/v1/projects?semesterId=${semesterId}`);
    expect(response.status).toBe(200);
    const projects = projectListResponseSchema.parse(await response.json());
    expect(projects).toHaveLength(2);
    expect(projects.every((row) => row.semesterId === semesterId)).toBe(true);
  });

  it("creates, updates, and deletes a project without assignment history", async () => {
    const { app, projectRows } = setup();
    const created = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semesterId, name: "New Project", slug: "new-project" }),
    });
    expect(created.status).toBe(201);
    const createdProject = projectSchema.parse(await created.json());
    expect(createdProject.description).toBeNull();
    expect(createdProject.status).toBe("active");

    const patched = await app.request(`/api/v1/projects/${createdProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Project" }),
    });
    expect(patched.status).toBe(200);
    expect(projectSchema.parse(await patched.json()).name).toBe("Renamed Project");

    const deleted = await app.request(`/api/v1/projects/${createdProject.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    expect(deleteProjectResponseSchema.parse(await deleted.json())).toEqual({
      id: createdProject.id,
      archived: false,
    });
    expect(projectRows.some((row) => row.id === createdProject.id)).toBe(false);
  });

  it("archives a project that has an assigned position", async () => {
    const { app, projectRows } = setup({ assignments: [assignment()] });
    const response = await app.request(`/api/v1/projects/${projectId}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(deleteProjectResponseSchema.parse(await response.json())).toEqual({
      id: projectId,
      archived: true,
    });
    expect(projectRows.find((row) => row.id === projectId)?.status).toBe("archived");
  });

  it("validates project bodies and reports duplicate slugs as a conflict", async () => {
    const { app } = setup();
    const invalid = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semesterId, name: " ", slug: "Bad Slug" }),
    });
    expect(invalid.status).toBe(400);
    expect(errorResponseSchema.parse(await invalid.json()).error.code).toBe("VALIDATION");

    const duplicate = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semesterId, name: "Duplicate", slug: "project-one" }),
    });
    expect(duplicate.status).toBe(409);
    expect(errorResponseSchema.parse(await duplicate.json()).error.code).toBe("CONFLICT");
  });
});

describe("member position endpoints", () => {
  it("assigns and removes a Developer position", async () => {
    const { app, assignments } = setup();
    const response = await app.request(`/api/v1/members/${memberId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positionId: developerId,
        semesterId,
        projectId,
        devSubrole: "backend",
      }),
    });
    expect(response.status).toBe(201);
    const created = memberPositionSchema.parse(await response.json());
    expect(created.memberId).toBe(memberId);
    expect(created.devSubrole).toBe("backend");
    expect(assignments).toHaveLength(1);

    const removed = await app.request(`/api/v1/member-positions/${created.id}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect(deleteMemberPositionResponseSchema.parse(await removed.json())).toEqual({
      id: created.id,
      removed: true,
    });
    expect(assignments).toHaveLength(0);
  });

  it("rejects missing project ids and non-Developer subroles", async () => {
    const { app } = setup();
    const missingProject = await app.request(`/api/v1/members/${memberId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: managerId, semesterId }),
    });
    expect(missingProject.status).toBe(400);
    expect(errorResponseSchema.parse(await missingProject.json()).error.code).toBe("VALIDATION");

    const invalidSubrole = await app.request(`/api/v1/members/${memberId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positionId: managerId,
        semesterId,
        projectId,
        devSubrole: "frontend",
      }),
    });
    expect(invalidSubrole.status).toBe(400);
    expect(errorResponseSchema.parse(await invalidSubrole.json()).error.code).toBe("VALIDATION");
  });

  it("maps existing seat and project restrictions to their API errors", async () => {
    const { app: alreadyOnProject } = setup({
      assignments: [assignment({ memberId, projectId })],
    });
    const differentProject = await alreadyOnProject.request(
      `/api/v1/members/${memberId}/positions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId: developerId, semesterId, projectId: otherProjectId }),
      }
    );
    expect(differentProject.status).toBe(409);
    expect(errorResponseSchema.parse(await differentProject.json()).error.code).toBe(
      "ALREADY_ON_PROJECT"
    );

    const { app: seatFull } = setup({
      assignments: [assignment({ memberId: otherMemberId, positionId: limitedPositionId })],
    });
    const fullSeat = await seatFull.request(`/api/v1/members/${memberId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: limitedPositionId, semesterId, projectId }),
    });
    expect(fullSeat.status).toBe(409);
    expect(errorResponseSchema.parse(await fullSeat.json()).error.code).toBe("CONFLICT");

    const { app: projectSeatFull } = setup({
      assignments: [assignment({ memberId: otherMemberId, positionId: managerId })],
    });
    const fullProjectSeat = await projectSeatFull.request(`/api/v1/members/${memberId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: managerId, semesterId, projectId }),
    });
    expect(fullProjectSeat.status).toBe(409);
    expect(errorResponseSchema.parse(await fullProjectSeat.json()).error.code).toBe("CONFLICT");
  });

  it("requires a superuser for an Exec-granting position", async () => {
    const { app } = setup({ isSuperuser: false });
    const response = await app.request(`/api/v1/members/${memberId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: execPositionId, semesterId }),
    });
    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe("FORBIDDEN");
  });

  it("returns 409 when an assignment insert hits a unique constraint", async () => {
    const { app } = setup({
      assignments: [assignment({ memberId, positionId: developerId })],
    });
    const response = await app.request(`/api/v1/members/${memberId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: developerId, semesterId, projectId }),
    });
    expect(response.status).toBe(409);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe("CONFLICT");
  });

  it("returns 404 when an assignment to remove does not exist", async () => {
    const { app } = setup();
    const response = await app.request(`/api/v1/member-positions/${assignmentId}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("allows only superusers to remove Exec-granting position assignments", async () => {
    const execAssignment = assignment({ positionId: execPositionId });
    const { app: nonSuperuserApp, assignments: retained } = setup({
      isSuperuser: false,
      assignments: [execAssignment],
    });
    const denied = await nonSuperuserApp.request(`/api/v1/member-positions/${execAssignment.id}`, {
      method: "DELETE",
    });
    expect(denied.status).toBe(403);
    expect(errorResponseSchema.parse(await denied.json()).error.code).toBe("FORBIDDEN");
    expect(retained).toHaveLength(1);

    const { app: superuserApp, assignments: removed } = setup({
      isSuperuser: true,
      assignments: [execAssignment],
    });
    const allowed = await superuserApp.request(`/api/v1/member-positions/${execAssignment.id}`, {
      method: "DELETE",
    });
    expect(allowed.status).toBe(200);
    expect(deleteMemberPositionResponseSchema.parse(await allowed.json())).toEqual({
      id: execAssignment.id,
      removed: true,
    });
    expect(removed).toHaveLength(0);
  });
});

describe.skipIf(!env.DATABASE_URL)("position assignment transaction", () => {
  it("serializes concurrent assignments competing for a one-seat position", async () => {
    const { db } = await import("../src/db");
    const { memberPositions, members, positions, projects, semesters } =
      await import("../src/db/schema");

    const raceSemesterId = crypto.randomUUID();
    const raceProjectId = crypto.randomUUID();
    const racePositionId = crypto.randomUUID();
    const firstMemberId = crypto.randomUUID();
    const secondMemberId = crypto.randomUUID();
    const emailPrefix = crypto.randomUUID();

    try {
      await db.insert(semesters).values({
        id: raceSemesterId,
        name: `Assignment race ${emailPrefix}`,
        term: "fall",
        year: 2998,
        startsOn: "2998-08-20",
        endsOn: "2998-12-10",
      });
      await db.insert(projects).values({
        id: raceProjectId,
        semesterId: raceSemesterId,
        name: "Assignment race",
        slug: `assignment-race-${emailPrefix}`,
      });
      await db.insert(members).values([
        {
          id: firstMemberId,
          firstName: "Test",
          lastName: "Member One",
          email: `${emailPrefix}-one@example.test`,
        },
        {
          id: secondMemberId,
          firstName: "Test",
          lastName: "Member Two",
          email: `${emailPrefix}-two@example.test`,
        },
      ]);
      await db.insert(positions).values({
        id: racePositionId,
        name: `Race Position ${emailPrefix}`,
        category: "project",
        grantsExec: false,
        seatLimit: 1,
      });

      const service = createProjectsService();
      const outcomes = await Promise.allSettled([
        service.assignPosition(
          firstMemberId,
          { positionId: racePositionId, semesterId: raceSemesterId, projectId: raceProjectId },
          { isSuperuser: false }
        ),
        service.assignPosition(
          secondMemberId,
          { positionId: racePositionId, semesterId: raceSemesterId, projectId: raceProjectId },
          { isSuperuser: false }
        ),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find((outcome) => outcome.status === "rejected");
      expect(rejected?.status).toBe("rejected");
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(ApiError);
        expect(rejected.reason.status).toBe(409);
        expect(rejected.reason.code).toBe("CONFLICT");
      }
      const stored = await db
        .select({ id: memberPositions.id })
        .from(memberPositions)
        .where(eq(memberPositions.positionId, racePositionId));
      expect(stored).toHaveLength(1);
    } finally {
      await db.delete(memberPositions).where(eq(memberPositions.semesterId, raceSemesterId));
      await db.delete(projects).where(eq(projects.id, raceProjectId));
      await db.delete(members).where(inArray(members.id, [firstMemberId, secondMemberId]));
      await db.delete(positions).where(eq(positions.id, racePositionId));
      await db.delete(semesters).where(eq(semesters.id, raceSemesterId));
    }
  });
});
