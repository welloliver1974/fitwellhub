import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/treinos")({
  component: () => <Outlet />,
});