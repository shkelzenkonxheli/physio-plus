import { createFileRoute } from "@tanstack/react-router";
import { ClinicWorkspace } from "@/components/clinic/ClinicWorkspace";

export const Route = createFileRoute("/klinika")({
  head: () => ({
    meta: [
      { title: "Paneli i klinikës | PhysioPlus" },
      { name: "description", content: "Menaxho klinikën, ekipin, shërbimet dhe terminet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClinicWorkspace,
});
