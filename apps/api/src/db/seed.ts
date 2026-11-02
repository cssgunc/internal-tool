import { db } from "./index";
import { positions } from "./schema/positions";

const positionSeeds = [
  { name: "Co-President", category: "exec", grantsExec: true, seatLimit: 2 },
  { name: "VP of Strategy", category: "exec", grantsExec: true, seatLimit: 2 },
  { name: "Treasurer", category: "exec", grantsExec: true, seatLimit: 1 },
  { name: "VP of Outreach", category: "exec", grantsExec: true, seatLimit: 1 },
  { name: "Head of Design", category: "exec", grantsExec: true, seatLimit: 1 },
  { name: "Education Lead", category: "education", grantsExec: true, seatLimit: 1 },
  { name: "Education TA", category: "education", grantsExec: true, seatLimit: null },
  {
    name: "Project Manager (PM)",
    category: "project",
    grantsExec: true,
    seatLimit: 1,
    perProject: true,
  },
  {
    name: "Lead Engineer (TL)",
    category: "project",
    grantsExec: true,
    seatLimit: 1,
    perProject: true,
  },
  { name: "Developer", category: "project", grantsExec: false },
  { name: "UI", category: "project", grantsExec: false },
  {
    name: "Education Student",
    category: "education",
    grantsExec: false,
    requiresAccount: false,
  },
] satisfies (typeof positions.$inferInsert)[];

try {
  await db.insert(positions).values(positionSeeds).onConflictDoNothing({ target: positions.name });
} finally {
  await db.$client.end();
}
