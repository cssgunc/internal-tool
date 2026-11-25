import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { csvResponse, escapeCell, toCsv, type CsvColumn } from "./csv";

type Member = { id: number; name: string; email: string; secret?: string };

const columns: CsvColumn<Member>[] = [
  { key: "id", header: "ID" },
  { key: "name", header: "Name" },
  { key: "email", header: "Email" },
];

describe("toCsv", () => {
  test("writes a header row then one row per record, CRLF separated", () => {
    const csv = toCsv([{ id: 1, name: "Ana", email: "ana@x.org" }], columns);
    expect(csv).toBe("ID,Name,Email\r\n1,Ana,ana@x.org");
  });

  test("empty list gives the header row only", () => {
    expect(toCsv([], columns)).toBe("ID,Name,Email");
  });

  test("only allowlisted columns appear, in column order", () => {
    const rows = [{ id: 1, name: "Ana", email: "a@x.org", secret: "hunter2" }];
    const csv = toCsv(rows, [
      { key: "email", header: "Email" },
      { key: "id", header: "ID" },
    ]);
    expect(csv).toBe("Email,ID\r\na@x.org,1");
    expect(csv).not.toContain("hunter2");
  });

  test("null and undefined values become empty cells", () => {
    const rows = [{ id: 1, name: null, email: undefined }] as unknown as Member[];
    expect(toCsv(rows, columns)).toBe("ID,Name,Email\r\n1,,");
  });

  test("headers are escaped too", () => {
    expect(toCsv([], [{ key: "name", header: 'Name, "full"' }])).toBe('"Name, ""full"""');
  });
});

describe("RFC 4180 escaping", () => {
  test("comma is quoted", () => {
    expect(escapeCell("Smith, Jo")).toBe('"Smith, Jo"');
  });
  test("double quote is doubled and quoted", () => {
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
  });
  test("LF is quoted", () => {
    expect(escapeCell("line1\nline2")).toBe('"line1\nline2"');
  });
  test("CRLF inside a value is quoted", () => {
    expect(escapeCell("a\r\nb")).toBe('"a\r\nb"');
  });
  test("plain text is left alone", () => {
    expect(escapeCell("José")).toBe("José");
  });
});

describe("formula injection", () => {
  test.each(["=", "+", "-", "@"])("string starting with %s gets ' prefix", (ch) => {
    expect(escapeCell(`${ch}SUM(A1:A2)`)).toBe(`'${ch}SUM(A1:A2)`);
  });
  test("leading tab gets ' prefix", () => {
    expect(escapeCell("\tx")).toBe("'\tx");
  });
  test("leading carriage return gets ' prefix and is quoted", () => {
    expect(escapeCell("\rx")).toBe('"\'\rx"');
  });
  test("prefix is applied before quoting", () => {
    expect(escapeCell('=HYPERLINK("http://evil","click")')).toBe(
      `"'=HYPERLINK(""http://evil"",""click"")"`
    );
  });
  test("trigger characters later in the string are fine", () => {
    expect(escapeCell("a=b")).toBe("a=b");
  });
  test("negative numbers stay numbers", () => {
    expect(escapeCell(-5)).toBe("-5");
  });
});

describe("csvResponse", () => {
  const app = new Hono().get("/export.csv", (c) => csvResponse(c, "members", "ID,Name\r\n1,José"));

  test("sets headers and prepends a UTF-8 BOM", async () => {
    const res = await app.request("/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="members.csv"; filename*=UTF-8''members.csv`
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe("ID,Name\r\n1,José");
  });

  test("unsafe filename characters can't break the header", async () => {
    const app2 = new Hono().get("/x", (c) => csvResponse(c, 'a"b\r\nc é.csv', ""));
    const cd = (await app2.request("/x")).headers.get("Content-Disposition")!;
    expect(cd).toBe(
      `attachment; filename="a_b__c _.csv"; filename*=UTF-8''a%22b%0D%0Ac%20%C3%A9.csv`
    );
  });
});
