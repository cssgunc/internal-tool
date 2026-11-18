import { and, asc, count, DrizzleQueryError, eq, ilike, or, sql } from "drizzle-orm";
import postgres from "postgres";
import { memberSchema } from "@internal-tool/shared";
import type {
  CreateMemberRequest,
  Member,
  MemberList,
  MemberListQuery,
  UpdateMemberRequest,
} from "@internal-tool/shared";
import type { db } from "../db";
import { members } from "../db/schema";
import { ApiError } from "../lib/errors";
import { diffChanges, recordAudit } from "./audit";

type Database = Pick<typeof db, "select">;

// Select only API fields, so internal auth identifiers never leave the database.
const memberColumns = {
  id: members.id,
  firstName: members.firstName,
  lastName: members.lastName,
  displayName: members.displayName,
  email: members.email,
  otherEmails: members.otherEmails,
  pronouns: members.pronouns,
  gradYear: members.gradYear,
  majors: members.majors,
  minors: members.minors,
  githubUsername: members.githubUsername,
  linkedinUrl: members.linkedinUrl,
  portfolioUrl: members.portfolioUrl,
  isSuperuser: members.isSuperuser,
  status: members.status,
  invitedAt: members.invitedAt,
  activatedAt: members.activatedAt,
  createdAt: members.createdAt,
  updatedAt: members.updatedAt,
};

type MemberRow = Omit<Member, "invitedAt" | "activatedAt" | "createdAt" | "updatedAt"> & {
  invitedAt: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function serializeMember(row: MemberRow): Member {
  return memberSchema.parse({
    ...row,
    invitedAt: row.invitedAt?.toISOString() ?? null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listMembers(
  { page, pageSize, search, status }: MemberListQuery,
  database?: Database
): Promise<MemberList> {
  const conn = database ?? (await import("../db")).db;
  const pattern = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : undefined;
  const filter = and(
    status ? eq(members.status, status) : undefined,
    pattern
      ? or(
          ilike(members.firstName, pattern),
          ilike(members.lastName, pattern),
          ilike(sql`${members.email}::text`, pattern)
        )
      : undefined
  );
  const rows = await conn
    .select(memberColumns)
    .from(members)
    .where(filter)
    .orderBy(asc(members.lastName), asc(members.firstName), asc(members.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [totals] = await conn.select({ total: count() }).from(members).where(filter);
  return { items: rows.map(serializeMember), total: totals?.total ?? 0 };
}

export async function getMember(id: string, database?: Database): Promise<Member> {
  const conn = database ?? (await import("../db")).db;
  const [row] = await conn.select(memberColumns).from(members).where(eq(members.id, id)).limit(1);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Member not found.");
  return serializeMember(row);
}

function rethrowMemberWriteError(error: unknown): never {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  if (cause instanceof postgres.PostgresError && cause.code === "23505") {
    if (cause.constraint_name === "members_email_unique") {
      throw new ApiError(409, "CONFLICT", "A member with this email already exists.", {
        email: "Already in use.",
      });
    }
    if (cause.constraint_name === "members_github_username_unique") {
      throw new ApiError(409, "CONFLICT", "A member with this GitHub username already exists.", {
        githubUsername: "Already in use.",
      });
    }
  }
  throw error;
}

export async function createMember(
  request: CreateMemberRequest,
  database?: Pick<typeof db, "transaction">
): Promise<Member> {
  const conn = database ?? (await import("../db")).db;
  // The audit entry (TDD 2.5) is written in the same transaction, so it's saved if and
  // only if the member is.
  // TODO(auth): pass the signed-in member as the audit actor; until then it's System.
  return conn.transaction(async (tx) => {
    // Unique constraints, including citext case folding, arbitrate concurrent inserts.
    // Leave status, privilege, auth linkage, and timestamps to their database defaults.
    const [row] = await tx
      .insert(members)
      .values(request)
      .returning(memberColumns)
      .catch(rethrowMemberWriteError);
    if (!row) throw new Error("Member insert returned no row.");
    const member = serializeMember(row);
    await recordAudit(
      {
        action: "member.create",
        targetType: "member",
        targetId: member.id,
        changes: diffChanges(null, request),
      },
      tx
    );
    return member;
  });
}

export async function updateMember(
  id: string,
  request: UpdateMemberRequest,
  database?: Pick<typeof db, "transaction">
): Promise<Member> {
  const conn = database ?? (await import("../db")).db;
  // TODO(auth): pass the signed-in member as the audit actor; until then it's System.
  return conn.transaction(async (tx) => {
    // Locked so the audit entry's old values are the ones this update replaced.
    const [before] = await tx
      .select(memberColumns)
      .from(members)
      .where(eq(members.id, id))
      .for("update");
    if (!before) throw new ApiError(404, "NOT_FOUND", "Member not found.");

    // Drizzle omits undefined values; explicit null clears nullable columns.
    // The strict request schema permits only editable fields, never auth or status fields.
    const [row] = await tx
      .update(members)
      .set(request)
      .where(eq(members.id, id))
      .returning(memberColumns)
      .catch(rethrowMemberWriteError);
    if (!row) throw new ApiError(404, "NOT_FOUND", "Member not found.");

    // Only the fields the request touched, and only if they actually changed.
    const fields = Object.keys(request).filter(
      (key) => request[key as keyof UpdateMemberRequest] !== undefined
    ) as (keyof MemberRow)[];
    const pick = (source: MemberRow) =>
      Object.fromEntries(fields.map((field) => [field, source[field]]));
    const changes = diffChanges(pick(before), pick(row));
    if (Object.keys(changes).length > 0) {
      await recordAudit(
        { action: "member.update", targetType: "member", targetId: id, changes },
        tx
      );
    }
    return serializeMember(row);
  });
}
