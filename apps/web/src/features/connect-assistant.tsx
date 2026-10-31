import { Button } from "@chords/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@chords/ui/components/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@chords/ui/components/input-group";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

function mcpUrl() {
	return typeof window === "undefined" ? "" : `${window.location.origin}/mcp`;
}

// Claude's documented install link only prefills the dialog; the user still confirms it.
function claudeInstallLink(url: string) {
	return `https://claude.ai/customize/connectors?${new URLSearchParams({
		modal: "add-custom-connector",
		connectorName: "Mic Drop",
		connectorUrl: url,
	})}`;
}

export function ConnectAssistantDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const url = mcpUrl();
	const copy = async () => {
		await navigator.clipboard.writeText(url);
		toast.success("Server URL copied");
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Connect an AI assistant</DialogTitle>
					<DialogDescription>
						Let Claude or ChatGPT search, add, and edit songs in your songbooks.
						You sign in to Mic Drop and approve access once.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-5 text-sm">
					<section className="space-y-2">
						<h3 className="font-medium">Claude</h3>
						<Button asChild className="w-full">
							<a href={claudeInstallLink(url)} target="_blank" rel="noreferrer">
								Add to Claude
								<ExternalLink />
							</a>
						</Button>
						<p className="text-muted-foreground">
							Confirm the connector in Claude, then click Connect.
						</p>
					</section>
					<section className="space-y-2">
						<h3 className="font-medium">ChatGPT</h3>
						<ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
							<li>
								In ChatGPT settings, open Apps &amp; Connectors and turn on
								Developer mode under Advanced settings.
							</li>
							<li>
								Create a connector named Mic Drop with the URL below and OAuth
								authentication.
							</li>
						</ol>
						<Button asChild variant="outline" className="w-full">
							<a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
								Open ChatGPT
								<ExternalLink />
							</a>
						</Button>
					</section>
					<section className="space-y-2">
						<h3 className="font-medium">Server URL</h3>
						<InputGroup>
							<InputGroupInput readOnly value={url} aria-label="Server URL" />
							<InputGroupAddon align="inline-end">
								<InputGroupButton
									size="icon-xs"
									aria-label="Copy server URL"
									onClick={() => void copy()}
								>
									<Copy />
								</InputGroupButton>
							</InputGroupAddon>
						</InputGroup>
						<p className="text-muted-foreground">
							Works with any assistant that supports remote MCP servers.
						</p>
					</section>
				</div>
			</DialogContent>
		</Dialog>
	);
}
