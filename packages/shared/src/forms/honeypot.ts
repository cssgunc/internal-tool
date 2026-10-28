import { z } from "zod";

/** Add to public-form schemas: clients must omit this field or send exactly "". */
export const honeypot = z.string().max(0, "Leave this field empty.").optional();
