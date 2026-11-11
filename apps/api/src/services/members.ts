import { and, asc, count, DrizzleQueryError, eq, ilike, or, sql } from "drizzle-orm";
import postgres from "postgres";
import { memberSchema } from "@internal-tool/shared";
import type {
  CreateMemberRequest,
  Member,
  MemberList,
  MemberListQuery,
} from "@internal-tool/shared";
import type { db } from "../db";
import { members } from "../db/schema";
import { ApiError } from "../lib/errors";

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
  database?: Pick<typeof db, "insert">
): Promise<Member> {
  const conn = database ?? (await import("../db")).db;
  // Unique constraints, including citext case folding, arbitrate concurrent inserts.
  // Leave status, privilege, auth linkage, and timestamps to their database defaults.
  const [row] = await conn
    .insert(members)
    .values(request)
    .returning(memberColumns)
    .catch(rethrowMemberWriteError);
  if (!row) throw new Error("Member insert returned no row.");
  return serializeMember(row);
}
