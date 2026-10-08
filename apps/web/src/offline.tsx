import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { Songbook } from "./features/songbook";
import "./styles.css";

const element = document.getElementById("offline-root");
if (element)
	createRoot(element).render(
		<QueryClientProvider client={new QueryClient()}>
			<Songbook />
		</QueryClientProvider>,
	);
