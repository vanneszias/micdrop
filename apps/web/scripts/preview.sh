#!/usr/bin/env bash
# Pull request environments on Workers Previews, each with its own D1 database.
#
#   scripts/preview.sh deploy <name>   create or update Preview <name> from the current build
#   scripts/preview.sh delete <name>   delete Preview <name> and its database
#
# Run from apps/web after `bun run build` (deploy only). Needs CLOUDFLARE_API_TOKEN and
# CLOUDFLARE_ACCOUNT_ID. Deploy also needs PREVIEW_BETTER_AUTH_SECRET.
set -euo pipefail

command="${1:?usage: preview.sh deploy|delete <name>}"
name="${2:?usage: preview.sh deploy|delete <name>}"
worker="chords"
database="$worker-$name"
wrangler=(bunx --no-install wrangler)
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

database_id() {
	"${wrangler[@]}" d1 list --json | jq -r --arg name "$database" '.[] | select(.name == $name) | .uuid'
}

deploy() {
	: "${PREVIEW_BETTER_AUTH_SECRET:?Set the PREVIEW_BETTER_AUTH_SECRET secret}"
	local built="dist/server/wrangler.json"
	test -f "$built" || { echo "Run bun run build first" >&2; exit 1; }

	local id
	id="$(database_id)"
	if [[ -z "$id" ]]; then
		"${wrangler[@]}" d1 create "$database"
		id="$(database_id)"
	fi
	test -n "$id" || { echo "Could not find D1 database $database" >&2; exit 1; }

	# Migrations read top-level d1_databases, so point a throwaway config at the Preview database.
	jq -n --arg name "$database" --arg id "$id" --arg dir "$PWD/migrations" \
		'{name: "chords-migrations", d1_databases: [{binding: "DB", database_name: $name, database_id: $id, migrations_dir: $dir}]}' \
		>"$tmp/migrations.json"
	"${wrangler[@]}" d1 migrations apply DB --remote --config "$tmp/migrations.json"

	jq --arg name "$database" --arg id "$id" \
		'.previews.d1_databases = [{binding: "DB", database_name: $name, database_id: $id}]' \
		"$built" >"$tmp/wrangler.json"
	mv "$tmp/wrangler.json" "$built"

	jq -n --arg secret "$PREVIEW_BETTER_AUTH_SECRET" '{BETTER_AUTH_SECRET: $secret}' >"$tmp/secrets.json"

	# Better Auth needs its public URL up front: <preview>-<worker>.<subdomain>.workers.dev.
	local subdomain url
	subdomain="$(curl --fail --silent --show-error \
		-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
		"https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" |
		jq -er '.result.subdomain')"
	url="https://$name-$worker.$subdomain.workers.dev"

	# `--json` still mixes progress lines into stdout, so read the result from Wrangler's
	# output file instead.
	local output="$tmp/output.ndjson" actual
	for _ in 1 2; do
		rm -f "$output"
		WRANGLER_OUTPUT_FILE_PATH="$output" "${wrangler[@]}" preview --config "$built" --name "$name" \
			--message "${GITHUB_SHA:-local}" \
			--var "BETTER_AUTH_URL:$url" --secrets-file "$tmp/secrets.json"
		actual="$(jq -sr 'map(select(.type == "preview")) | last | .preview_urls[0] // empty' "$output")"
		if [[ -z "$actual" ]]; then
			echo "Preview $name has no URL. Deploy production with preview_urls enabled first." >&2
			exit 1
		fi
		actual="${actual%/}"
		[[ "$actual" == https://* ]] || actual="https://$actual"
		[[ "$actual" == "$url" ]] && break
		echo "Preview is served from $actual, redeploying with that BETTER_AUTH_URL" >&2
		url="$actual"
	done

	echo "Preview: $url"
	if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "url=$url" >>"$GITHUB_OUTPUT"; fi
}

delete() {
	"${wrangler[@]}" preview delete --name "$name" --worker-name "$worker" --skip-confirmation ||
		echo "Preview $name was already gone" >&2
	if [[ -n "$(database_id)" ]]; then
		"${wrangler[@]}" d1 delete "$database" --skip-confirmation
	fi
}

case "$command" in
deploy) deploy ;;
delete) delete ;;
*) echo "usage: preview.sh deploy|delete <name>" >&2; exit 1 ;;
esac
