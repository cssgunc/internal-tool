import { app } from "./app";
import { env } from "./env";

console.log(`API listening on http://localhost:${env.PORT}/api/v1`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
