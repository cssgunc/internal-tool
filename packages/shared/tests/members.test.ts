import { describe, expect, expectTypeOf, it } from "bun:test";
import {
  createMemberRequestSchema,
  githubUsernameSchema,
  gradYearSchema,
  MAX_GRAD_YEAR,
  MEMBER_STATUSES,
  memberIdParamsSchema,
  memberIdSchema,
  memberListQuerySchema,
  memberListSchema,
  memberSchema,
  memberStatusSchema,
  MIN_GRAD_YEAR,
  SELF_EDITABLE_MEMBER_FIELDS,
  updateMemberProfileRequestSchema,
  updateMemberRequestSchema,
} from "../src";
import type { Member, MemberListQuery, UpdateMemberProfileRequest } from "../src";

const minimalMember = { firstName: "Fake", lastName: "Member", email: "fake@example.com" };
const profile = {
  displayName: "Example",
  pronouns: "they/them",
  githubUsername: "fake-member",
  linkedinUrl: "https://www.linkedin.com/in/fake-member",
  portfolioUrl: "https://example.com/portfolio",
  gradYear: 2030,
};
const member = {
  ...minimalMember,
  ...profile,
  id: "00000000-0000-4000-8000-000000000001",
  otherEmails: [],
  majors: ["Computer Science"],
  minors: [],
  isSuperuser: false,
  status: "active",
  invitedAt: null,
  activatedAt: null,
  createdAt: "2026-11-11T12:00:00Z",
  updatedAt: "2026-11-11T12:00:00Z",
} satisfies Member;

describe("member query and ID schemas", () => {
  it("reuses pagination defaults and parses query strings", () => {
    expect(memberListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 50 });
    expect(
      memberListQuerySchema.parse({
        page: "2",
        pageSize: "200",
        search: " FAKE ",
        status: "alumni",
      })
    ).toEqual({ page: 2, pageSize: 200, search: "FAKE", status: "alumni" });
    expect(memberListQuerySchema.parse({ search: "  " }).search).toBe("");
  });

  it("accepts exactly the database's active and alumni statuses", () => {
    expect(MEMBER_STATUSES).toEqual(["active", "alumni"]);
    for (const status of MEMBER_STATUSES) {
      expect(memberStatusSchema.parse(status)).toBe(status);
      expect(memberListQuerySchema.parse({ status }).status).toBe(status);
    }
    for (const query of [
      { status: "inactive" },
      { status: "ACTIVE" },
      { status: null },
      { page: "0" },
      { page: "1.5" },
      { page: "abc" },
      { pageSize: "201" },
      { pageSize: "0" },
      { search: "x".repeat(255) },
      { search: ["fake"] },
    ])
      expect(memberListQuerySchema.safeParse(query).success).toBe(false);
  });

  it("requires a UUID for member route parameters", () => {
    expect(memberIdSchema.parse(member.id)).toBe(member.id);
    expect(memberIdParamsSchema.parse({ id: member.id })).toEqual({ id: member.id });
    for (const id of ["", "not-a-uuid", 123, null, undefined]) {
      expect(memberIdSchema.safeParse(id).success).toBe(false);
      expect(memberIdParamsSchema.safeParse({ id }).success).toBe(false);
    }
  });
});

describe("member write schemas", () => {
  it("requires only first name, last name, and email for creation", () => {
    expect(createMemberRequestSchema.parse(minimalMember)).toEqual(minimalMember);
    expect(createMemberRequestSchema.safeParse({}).success).toBe(false);
    for (const field of Object.keys(minimalMember)) {
      const input: Record<string, unknown> = { ...minimalMember };
      delete input[field];
      expect(createMemberRequestSchema.safeParse(input).success).toBe(false);
    }
  });

  it("accepts all editable fields and normalizes names and emails", () => {
    const result = createMemberRequestSchema.parse({
      ...minimalMember,
      ...profile,
      firstName: " Fake ",
      lastName: " Member ",
      displayName: " Example ",
      email: " FAKE@EXAMPLE.COM ",
      otherEmails: [" OTHER@EXAMPLE.COM "],
      majors: [" Computer Science "],
      minors: [],
    });
    expect(result).toEqual({
      ...minimalMember,
      ...profile,
      otherEmails: ["other@example.com"],
      majors: ["Computer Science"],
      minors: [],
    });
    expect(updateMemberRequestSchema.parse({ firstName: " New " })).toEqual({ firstName: "New" });
  });

  it("rejects invalid emails, names, arrays, and excessive field lengths", () => {
    for (const input of [
      { email: "bad" },
      { email: null },
      { email: "x".repeat(255) + "@example.com" },
      { firstName: " " },
      { lastName: "x".repeat(101) },
      { firstName: null },
      { otherEmails: ["invalid"] },
      { otherEmails: null },
      { majors: [""] },
      { minors: [123] },
      { majors: Array(51).fill("CS") },
      { otherEmails: Array(51).fill("fake@example.com") },
      { pronouns: "x".repeat(101) },
      { displayName: "x".repeat(101) },
    ]) {
      expect(createMemberRequestSchema.safeParse({ ...minimalMember, ...input }).success).toBe(
        false
      );
      expect(updateMemberRequestSchema.safeParse(input).success).toBe(false);
    }
  });

  it("accepts valid GitHub username boundaries and rejects invalid formats", () => {
    for (const name of ["a", "9", "Fake-Member9", "a".repeat(39)])
      expect(githubUsernameSchema.parse(name)).toBe(name);
    for (const name of [
      "",
      "-fake",
      "fake-",
      "fake--member",
      "fake_member",
      "fake.member",
      "fake member",
      "@fake",
      "faké",
      "a".repeat(40),
    ]) {
      expect(githubUsernameSchema.safeParse(name).success).toBe(false);
      expect(
        createMemberRequestSchema.safeParse({ ...minimalMember, githubUsername: name }).success
      ).toBe(false);
      expect(updateMemberRequestSchema.safeParse({ githubUsername: name }).success).toBe(false);
    }
  });

  it("requires absolute HTTP or HTTPS profile links", () => {
    for (const field of ["linkedinUrl", "portfolioUrl"]) {
      for (const value of [profile.linkedinUrl, "http://example.com/profile"])
        expect(updateMemberRequestSchema.safeParse({ [field]: value }).success).toBe(true);
      for (const value of [
        "",
        "not a URL",
        "/profile",
        "javascript:alert(1)",
        "mailto:fake@example.com",
        "ftp://example.com",
        `https://example.com/${"x".repeat(2048)}`,
      ]) {
        expect(
          createMemberRequestSchema.safeParse({ ...minimalMember, [field]: value }).success
        ).toBe(false);
        expect(updateMemberRequestSchema.safeParse({ [field]: value }).success).toBe(false);
      }
    }
  });

  it("uses the documented inclusive graduation-year range without coercing JSON strings", () => {
    for (const year of [MIN_GRAD_YEAR, 2026, MAX_GRAD_YEAR])
      expect(gradYearSchema.parse(year)).toBe(year);
    for (const year of [MIN_GRAD_YEAR - 1, MAX_GRAD_YEAR + 1, 2026.5, "2026", NaN, Infinity]) {
      expect(gradYearSchema.safeParse(year).success).toBe(false);
      expect(updateMemberRequestSchema.safeParse({ gradYear: year }).success).toBe(false);
    }
  });

  it("allows nullable profile fields to be omitted or explicitly cleared", () => {
    for (const field of Object.keys(SELF_EDITABLE_MEMBER_FIELDS)) {
      const cleared = { [field]: null };
      expect(createMemberRequestSchema.safeParse({ ...minimalMember, ...cleared }).success).toBe(
        true
      );
      expect(updateMemberRequestSchema.parse(cleared)).toEqual(cleared);
      expect(updateMemberProfileRequestSchema.parse(cleared)).toEqual(cleared);
      if (field !== "gradYear")
        expect(updateMemberRequestSchema.safeParse({ [field]: " " }).success).toBe(false);
    }
    expect(updateMemberRequestSchema.parse({ majors: [], otherEmails: [] })).toEqual({
      majors: [],
      otherEmails: [],
    });
  });

  it("rejects unknown and protected fields on both POST and PATCH", () => {
    for (const [field, value] of Object.entries({
      status: "alumni",
      isSuperuser: true,
      userId: "auth-id",
      user_id: "auth-id",
      id: member.id,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      invitedAt: member.createdAt,
      activatedAt: member.createdAt,
      is_superuser: true,
      unknown: "extra",
      positions: [],
      projectId: member.id,
    })) {
      expect(
        createMemberRequestSchema.safeParse({ ...minimalMember, [field]: value }).success
      ).toBe(false);
      expect(
        updateMemberRequestSchema.safeParse({ firstName: "Fake", [field]: value }).success
      ).toBe(false);
    }
  });

  it("rejects empty PATCH requests including undefined-only updates", () => {
    for (const schema of [updateMemberRequestSchema, updateMemberProfileRequestSchema]) {
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ displayName: undefined }).success).toBe(false);
    }
  });

  it("defines exactly the self-service profile allowlist and rejects other edits", () => {
    expect(Object.keys(SELF_EDITABLE_MEMBER_FIELDS).sort()).toEqual(Object.keys(profile).sort());
    expect(updateMemberProfileRequestSchema.parse(profile)).toEqual(profile);
    for (const field of [
      "firstName",
      "lastName",
      "email",
      "otherEmails",
      "majors",
      "minors",
      "status",
      "isSuperuser",
      "userId",
      "user_id",
      "unknown",
    ])
      expect(
        updateMemberProfileRequestSchema.safeParse({ ...profile, [field]: "blocked" }).success
      ).toBe(false);
  });
});

describe("member response schemas", () => {
  it("accepts both statuses and nullable database profile/timestamp fields", () => {
    expect(memberSchema.parse(member)).toEqual(member);
    const emptyProfile = Object.fromEntries(Object.keys(profile).map((key) => [key, null]));
    expect(memberSchema.safeParse({ ...member, ...emptyProfile, status: "alumni" }).success).toBe(
      true
    );
    expect(
      memberSchema.safeParse({
        ...member,
        invitedAt: member.createdAt,
        activatedAt: member.createdAt,
      }).success
    ).toBe(true);
  });

  it("strips internal auth identifiers and unlisted fields from single and list responses", () => {
    const unsafeMember = {
      ...member,
      userId: "private-auth-id",
      user_id: "private-auth-id",
      internalSecret: "private",
    };
    expect(memberSchema.parse(unsafeMember)).toEqual(member);
    const list = memberListSchema.parse({ items: [unsafeMember], total: 5, internal: "private" });
    expect(list).toEqual({ items: [member], total: 5 });
    expect(JSON.stringify(list)).not.toContain("private");
    expect(memberSchema.keyof().options).not.toContain("userId");
    expect(memberSchema.keyof().options).not.toContain("user_id");
  });

  it("validates member and paginated response shapes", () => {
    expect(memberListSchema.parse({ items: [], total: 0 })).toEqual({ items: [], total: 0 });
    for (const input of [
      { ...member, id: "invalid" },
      { ...member, status: "inactive" },
      { ...member, email: "bad" },
      { ...member, createdAt: new Date() },
      { ...member, updatedAt: "invalid" },
      { ...member, firstName: undefined },
    ])
      expect(memberSchema.safeParse(input).success).toBe(false);
    for (const input of [
      { items: [], total: -1 },
      { items: [], total: 1.5 },
      { items: [], total: "1" },
      { items: [{}], total: 1 },
    ])
      expect(memberListSchema.safeParse(input).success).toBe(false);
  });

  it("exports inferred types without auth identifiers", () => {
    expectTypeOf<MemberListQuery["page"]>().toEqualTypeOf<number>();
    expectTypeOf<MemberListQuery["status"]>().toEqualTypeOf<"active" | "alumni" | undefined>();
    expectTypeOf<Member>().not.toHaveProperty("userId");
    expectTypeOf<Member>().not.toHaveProperty("user_id");
    expectTypeOf<keyof UpdateMemberProfileRequest>().toEqualTypeOf<keyof typeof profile>();
  });
});
