import { createFileRoute } from "@tanstack/react-router";
import { PhysioPanel } from "./paneli";

export const Route = createFileRoute("/profili-profesional")({
  head: () => ({
    meta: [
      { title: "Profili profesional | PhysioPlus" },
      {
        name: "description",
        content: "Menaxho profilin, shërbimet dhe orarin profesional.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PhysioPanel,
});
