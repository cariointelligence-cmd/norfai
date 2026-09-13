import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/duplicates")({ component: Duplicates });

function Duplicates() {
  return <Navigate to="/review" replace />;
}
