import { describe, expect, expectTypeOf, it } from "bun:test";
import { errorResponseSchema } from "@internal-tool/shared";
import type { ErrorResponse } from "@internal-tool/shared";
import { Hono } from "hono";
import { hc } from "hono/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import { z } from "zod";
import { app } from "../src/app";
import type { api as webApi } from "../../web/src/lib/api";
import type { AppType } from "../src/app";
import { handleError, handleNotFound } from "../src/lib/errors";
import { validate } from "../src/lib/validation";

// Test-only schemas: real endpoint schemas belong in packages/shared.
const bodySchema = z.object({
  email: z.email("Enter a valid email."),
  profile: z.object({ name: z.string().min(1, "Name is required.") }),
});
const querySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, "Use a positive integer.")
    .transform(Number)
    .pipe(z.number().int().positive())
    .default(1),
});
const testApp = new Hono()
  .onError(handleError)
  .notFound(handleNotFound)
  .post("/body", validate("json", bodySchema), (c) => {
    const body = c.req.valid("json");
    expectTypeOf(body).toEqualTypeOf<z.output<typeof bodySchema>>();
    return c.json({ email: body.email, name: body.profile.name }, 201);
  })
  .get("/query", validate("query", querySchema), (c) => {
    const query = c.req.valid("query");
    expectTypeOf(query.page).toEqualTypeOf<number>();
    return c.json({ page: query.page }, 200);
  })
  .get("/tags", validate("query", z.object({ tag: z.array(z.string()) })), (c) =>
    c.json(c.req.valid("query"))
  )
  .post(
    "/root",
    validate(
      "json",
      z.object({}).refine(() => false, "Invalid combination.")
    ),
    (c) => c.json(c.req.valid("json"))
  )
  .post(
    "/async",
    validate(
      "json",
      z.string().refine(async (value) => value === "allowed", "Not allowed.")
    ),
    (c) => c.json({ value: c.req.valid("json") })
  )
  .post("/nullable", validate("json", z.string().nullable()), (c) => {
    const value = c.req.valid("json");
    expectTypeOf(value).toEqualTypeOf<string | null>();
    return c.json({ value }, 200);
  })
  .post("/combined", validate("json", bodySchema), validate("query", querySchema), (c) => {
    const body = c.req.valid("json");
    const query = c.req.valid("query");
    expectTypeOf(body).toEqualTypeOf<z.output<typeof bodySchema>>();
    expectTypeOf(query).toEqualTypeOf<z.output<typeof querySchema>>();
    return c.json({ email: body.email, page: query.page }, 200);
  })
  .post(
    "/messages",
    validate(
      "json",
      z.object({
        name: z
          .string()
          .min(3, "At least three characters.")
          .regex(/^[A-Z]/, "Start with a capital."),
        members: z.array(z.object({ email: z.email("Enter a valid email.") })),
      })
    ),
    (c) => c.json(c.req.valid("json"), 200)
  );

const client = hc<typeof testApp>("http://localhost", {
  fetch: testApp.request.bind(testApp),
});

describe("request validation", () => {
  it("returns all invalid body fields with nested paths", async () => {
    const res = await client.body.$post({ json: { email: "bad", profile: { name: "" } } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "Request validation failed.",
        fields: { email: "Enter a valid email.", "profile.name": "Name is required." },
      },
    });
  });

  it("rejects malformed or empty JSON bodies with a root field error", async () => {
    for (const body of ["{", ""]) {
      const res = await testApp.request("/body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(res.status).toBe(400);
      const result = errorResponseSchema.parse(await res.json());
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fields?._root).toBe("Expected valid JSON.");
    }
  });

  it("returns a field error for an invalid query", async () => {
    const res = await client.query.$get({ query: { page: "no" } });
    expect(res.status).toBe(400);
    const result = errorResponseSchema.parse(await res.json());
    expect(result.error.code).toBe("VALIDATION");
    expect(result.error.fields?.page).toBe("Use a positive integer.");
  });

  it("passes valid body data and transformed/default query values to handlers", async () => {
    const body = await client.body.$post({
      json: { email: "fake@example.com", profile: { name: "Fake" } },
    });
    expect(body.status).toBe(201);
    expect(await body.json()).toEqual({ email: "fake@example.com", name: "Fake" });
    const query = await client.query.$get({ query: { page: "2" } });
    expect(query.status).toBe(200);
    expect(await query.json()).toEqual({ page: 2 });
    const defaults = await client.query.$get({ query: {} });
    expect(await defaults.json()).toEqual({ page: 1 });
  });

  it("preserves repeated query parameters", async () => {
    const res = await testApp.request("/tags?tag=one&tag=two");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tag: ["one", "two"] });
  });

  it("uses _root for schema errors without a field path", async () => {
    const res = await testApp.request("/root", { method: "POST", body: "{}" });
    expect(res.status).toBe(400);
    const result = errorResponseSchema.parse(await res.json());
    expect(result.error.fields).toEqual({ _root: "Invalid combination." });
  });

  it("supports Zod 4 asynchronous refinements", async () => {
    const valid = await client.async.$post({ json: "allowed" });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ value: "allowed" });
    const invalid = await client.async.$post({ json: "denied" });
    expect(invalid.status).toBe(400);
    const result = errorResponseSchema.parse(await invalid.json());
    expect(result.error.fields).toEqual({ _root: "Not allowed." });
  });

  it("supports nullable parsed outputs without changing their types", async () => {
    const res = await client.nullable.$post({ json: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: null });
  });

  it("combines body and query validation on the same route", async () => {
    const res = await client.combined.$post({
      json: { email: "fake@example.com", profile: { name: "Fake" } },
      query: { page: "3" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "fake@example.com", page: 3 });
    const defaults = await client.combined.$post({
      json: { email: "fake@example.com", profile: { name: "Fake" } },
      query: {},
    });
    expect(defaults.status).toBe(200);
    expect(await defaults.json()).toEqual({ email: "fake@example.com", page: 1 });
    const invalid = await client.combined.$post({
      json: { email: "fake@example.com", profile: { name: "Fake" } },
      query: { page: "invalid" },
    });
    expect(invalid.status).toBe(400);
  });

  it("keeps the first message per field and includes array indices in paths", async () => {
    const res = await client.messages.$post({
      json: { name: "a", members: [{ email: "bad" }] },
    });
    expect(res.status).toBe(400);
    const result = errorResponseSchema.parse(await res.json());
    expect(result.error.fields).toEqual({
      name: "At least three characters.",
      "members.0.email": "Enter a valid email.",
    });
  });

  it("preserves client request, success, and validation-error types", () => {
    expectTypeOf<InferRequestType<typeof client.body.$post>["json"]>().toEqualTypeOf<
      z.input<typeof bodySchema>
    >();
    expectTypeOf<InferRequestType<typeof client.query.$get>["query"]>().toEqualTypeOf<
      z.input<typeof querySchema>
    >();
    expectTypeOf<InferResponseType<typeof client.body.$post, 201>>().toEqualTypeOf<{
      email: string;
      name: string;
    }>();
    expectTypeOf<InferResponseType<typeof client.body.$post, 400>>().toEqualTypeOf<ErrorResponse>();
    expectTypeOf<InferResponseType<typeof client.query.$get, 200>>().toEqualTypeOf<{
      page: number;
    }>();
    expectTypeOf<InferRequestType<typeof client.combined.$post>["json"]>().toEqualTypeOf<
      z.input<typeof bodySchema>
    >();
    expectTypeOf<InferRequestType<typeof client.combined.$post>["query"]>().toEqualTypeOf<
      z.input<typeof querySchema>
    >();
    expectTypeOf<InferResponseType<typeof webApi.api.v1.health.$get, 200>>().toEqualTypeOf<{
      status: "ok";
    }>();
    expectTypeOf<
      InferResponseType<typeof webApi.api.v1.health.$get, 400>
    >().toEqualTypeOf<ErrorResponse>();
  });

  it("keeps the production client's success and global error responses typed", async () => {
    const productionClient = hc<AppType>("http://localhost", {
      fetch: app.request.bind(app),
    });
    expectTypeOf<
      InferResponseType<typeof productionClient.api.v1.health.$get, 200>
    >().toEqualTypeOf<{ status: "ok" }>();
    expectTypeOf<
      InferResponseType<typeof productionClient.api.v1.health.$get, 500>
    >().toEqualTypeOf<ErrorResponse>();
    expectTypeOf<
      InferResponseType<typeof productionClient.api.v1.health.$get, 409>
    >().toEqualTypeOf<ErrorResponse>();
    const res = await productionClient.api.v1.health.$get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
