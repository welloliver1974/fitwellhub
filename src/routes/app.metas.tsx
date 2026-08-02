import { createFileRoute } from "@tanstack/react-router";
import { GoalsPage } from "@/components/goals-page";

export const Route = createFileRoute("/app/metas")({
  component: GoalsPage,
});