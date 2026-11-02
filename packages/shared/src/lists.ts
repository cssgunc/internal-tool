import { z } from "zod";

// Every list endpoint pages the same way (TDD 3.2 Lists): ?page=1&pageSize=50, max 200.
// Query strings arrive as text, so the numbers are coerced.
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type PageQuery = z.output<typeof pageQuerySchema>;
