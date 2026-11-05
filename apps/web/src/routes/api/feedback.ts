import { createFileRoute } from "@tanstack/react-router";
import { endpoint, requireUser } from "#/server/auth";
import { Feedback, submitFeedback } from "#/server/feedback";

export const Route = createFileRoute("/api/feedback")({
	server: {
		handlers: {
			POST: endpoint(async (request) => {
				const user = await requireUser(request);
				const input = Feedback.parse(await request.json());
				return Response.json(await submitFeedback(request, user.id, input));
			}),
		},
	},
});
