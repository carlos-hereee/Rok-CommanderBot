import { createHash, createHmac, timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import { apiKeyAuth } from "./auth.js";
import { dashboardApiKey, dashboardSigningSecret } from "@utils/config.js";

// ── verifySignature ──
// What: authenticates inbound dashboard proxy requests by recomputing the HMAC-SHA256
//   signature the Heroku server stamped onto every forwarded request and comparing it
//   constant-time against the header value.
// Who: every API route mounted under /api/* goes through this middleware. Upstream caller
//   is nexious-server's forwardToBot which signs each request via signRequest.ts.
// When: runs on every inbound request. During rollout the signing secret may not yet be
//   configured on both sides; the middleware falls back to apiKeyAuth so we can deploy one
//   side at a time without taking the API offline.
// Where: sits after express.json({ verify }) in server.ts so req.rawBody is populated with
//   the exact UTF-8 bytes the server signed. If we signed req.body after parsing we would
//   risk whitespace/key-order drift between the two sides.
// How:
//   ① Read x-timestamp, x-signature, and x-api-key headers. If the server did not send
//      signing headers (rollout, or secret not yet configured on server side), fall back
//      to apiKeyAuth so the request still passes.
//   ② Reject on clock skew beyond ±5 minutes. This is the replay window — an attacker who
//      steals a signed request has only this window to reuse it before the timestamp check
//      rejects it.
//   ③ Rebuild the canonical string the server signed: METHOD + "\n" + path(?sortedQuery)
//      + "\n" + timestamp + "\n" + sha256(rawBody). Both sides must use identical
//      canonicalization or the HMACs will diverge and every request will 401.
//   ④ HMAC-SHA256 the canonical string with the shared secret, compare the hex digest to
//      the header value with crypto.timingSafeEqual to avoid leaking signature prefixes
//      through response-time side channels.
//   ⑤ On any mismatch return 401 without detail. The server logs enough context to debug;
//      the response body is intentionally sparse so a blind attacker cannot distinguish
//      "wrong signature" from "wrong timestamp".

// Five minute window on either side of now. Generous enough to tolerate cloud clock drift
// between Heroku and Railway (they do not share an NTP source), tight enough that a
// captured request becomes useless well before most humans notice they were phished.
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

// Extend Express's Request type with rawBody. Populated by the express.json verify callback
// in server.ts. We type it as optional because the health check route does not parse JSON
// and therefore never has rawBody attached.
declare module "express-serve-static-core" {
	interface Request {
		rawBody?: string;
	}
}

// Mirror of nexious-server/src/features/plugin-proxy/signRequest.ts canonicalizeQuery.
// Both sides must use the same sort order or same-query-different-order requests will
// fail verification. Kept in lockstep by the format-pinning test on the server side.
const canonicalizeQuery = (query: string): string => {
	if (!query) return "";
	const params = new URLSearchParams(query);
	const entries = [...params.entries()];
	entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const rebuilt = new URLSearchParams();
	for (const [k, v] of entries) rebuilt.append(k, v);
	return rebuilt.toString();
};

const hashBody = (body: string): string => createHash("sha256").update(body, "utf8").digest("hex");

// Exported for unit tests so we can assert the canonical shape without going through
// an Express request. Not used anywhere else in the runtime path.
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

// Constant-time hex comparison. timingSafeEqual throws if the buffers differ in length,
// so we pre-check length and fall through to a safe "false" result in that case. An
// attacker brute-forcing a signature could otherwise distinguish "wrong length" from
// "wrong bytes" through the thrown error path.
const safeHexEqual = (a: string, b: string): boolean => {
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
	} catch {
		return false;
	}
};

export function verifySignature(req: Request, res: Response, next: NextFunction): void {
	// ① If the server is not yet configured to sign (rollout window), or the client is a
	//    legacy caller that never signs, fall through to API key auth. This keeps the bot
	//    operational while the signing rollout lands on both sides.
	if (!dashboardSigningSecret) {
		apiKeyAuth(req, res, next);
		return;
	}

	const timestamp = req.headers["x-timestamp"];
	const signature = req.headers["x-signature"];

	// Same rollout safety: if the server is signing-capable but this specific request has
	// no signing headers (e.g. curl from an operator, old server binary), fall back to
	// apiKeyAuth. Once every caller is signed we can tighten this to a hard 401.
	if (typeof timestamp !== "string" || typeof signature !== "string") {
		apiKeyAuth(req, res, next);
		return;
	}

	// ② Replay window check. Parse once; reject any non-numeric timestamp outright to
	//    avoid NaN sliding past the Math.abs comparison (NaN compares false either way).
	const tsNum = Number(timestamp);
	if (!Number.isFinite(tsNum)) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}
	if (Math.abs(Date.now() - tsNum) > MAX_TIMESTAMP_SKEW_MS) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}

	// ③ Rebuild the canonical string. Three notes:
	//    a) originalUrl preserves the raw path+query the server forwarded; req.path drops
	//       the query which would silently diverge the signature.
	//    b) We split on the FIRST "?" so paths with embedded query separators survive. For
	//       the plugin proxy all paths are known-safe, but this avoids a future foot-gun.
	//    c) rawBody is whatever express.json({ verify }) captured. Empty string for
	//       GET/DELETE. Same default ("") as the server uses when body is undefined.
	const originalUrl = req.originalUrl || req.url;
	const qIdx = originalUrl.indexOf("?");
	const path = qIdx === -1 ? originalUrl : originalUrl.slice(0, qIdx);
	const query = qIdx === -1 ? "" : originalUrl.slice(qIdx + 1);
	const bodyHash = hashBody(req.rawBody ?? "");
	const canonical = buildCanonicalString({
		method: req.method,
		path,
		query,
		timestamp,
		bodyHash,
	});

	// ④ HMAC and constant-time compare.
	const expected = createHmac("sha256", dashboardSigningSecret).update(canonical, "utf8").digest("hex");
	if (!safeHexEqual(expected, signature)) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}

	// Signature is valid. We additionally require the x-api-key to match as defense in depth
	// during the rollout: even if an attacker somehow forges a signature against a leaked
	// secret, they still need the separate API key. Once we trust HMAC fully we can drop
	// this check, but rotating both secrets independently is cheap insurance.
	const apiKey = req.headers["x-api-key"];
	if (!apiKey || apiKey !== dashboardApiKey) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}

	next();
}
