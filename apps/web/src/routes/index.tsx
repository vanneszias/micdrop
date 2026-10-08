import { createFileRoute } from "@tanstack/react-router";
import { Songbook } from "#/features/songbook";

export const Route = createFileRoute("/")({ component: Songbook });
