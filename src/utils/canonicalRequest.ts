import { createHash } from "crypto";

// ── canonical request signing helpers (audit M1, bot-side dedup) ──────
// Shared HMAC canonicalization for the dashboard <-> bot signing contract.
// The inbound verifier (api/middleware/verifySignature.ts) and the outbound
// signer (utils/serverApi.ts) build the SAME canonical string, so this logic
// lived duplicated in both files and could silently drift. It now lives here
// and both import it.
//
// IMPORTANT: there is a THIRD copy on the server (nexious-server
// signRequest.ts). That is a separate git repo with no shared package, so it
// still must be kept byte-identical BY HAND. If you change the format here,
// change it there too. The format-pinning test in verifySignature.test.ts
// guards the bot side (it recreates the canonical string inline, so a drift in
// this module fails the test).

// Sort query params so the same params in any order sign identically. MUST
// match the server's sort or every request with more than one query param 401s.
export const canonicalizeQuery = (query: string): string => {
	if (!query) return "";
	const params = new URLSearchParams(query);
	const entries = [...params.entries()];
	entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const rebuilt = new URLSearchParams();
	for (const [k, v] of entries) rebuilt.append(k, v);
	return rebuilt.toString();
};

export const hashBody = (body: string): string => createHash("sha256").update(body, "utf8").digest("hex");

// METHOD\npath?sortedQuery\ntimestamp\nsha256(body). The single source of truth
// for the wire contract on the bot side.
export const buildCanonicalString = ({
	method,
	path,
	query,
	timestamp,
	bodyHash,
}: {
	method: string;
	path: string;
	query: string;
	timestamp: string;
	bodyHash: string;
}): string => {
	const canonicalQuery = canonicalizeQuery(query);
	const pathWithQuery = canonicalQuery ? `${path}?${canonicalQuery}` : path;
	return `${method.toUpperCase()}\n${pathWithQuery}\n${timestamp}\n${bodyHash}`;
};
