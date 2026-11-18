import { defineForm } from "../definition";
import { YES_NO } from "./common";

// Returning-member form (TDD 2.3), behind login. Name, UNC email, and this semester's
// team come from the member's record and are shown pre-filled by the page, along with
// a link to their original application, so they aren't questions here.
export const returningMemberForm = defineForm({
  sections: [
    {
      id: "returning",
      title: "Next semester",
      fields: [
        {
          id: "returning",
          type: "select",
          label: "Are you returning next semester?",
          required: true,
          ...YES_NO,
        },
      ],
    },
    {
      id: "next_team",
      title: "Your team",
      showIf: { field: "returning", in: ["yes"] },
      fields: [
        {
          id: "team_choice",
          type: "select",
          label: "Do you want to stay on the same project team or join a new one?",
          required: true,
          options: ["same", "new"],
          optionLabels: { same: "Same project team", new: "A new project team" },
        },
      ],
    },
  ],
});
