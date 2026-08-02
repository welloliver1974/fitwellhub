import { createFileRoute } from "@tanstack/react-router";
import { RemindersPage } from "@/components/reminders-page";

export const Route = createFileRoute("/app/lembretes")({
  component: RemindersPage,
});