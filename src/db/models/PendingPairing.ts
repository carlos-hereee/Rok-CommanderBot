// src/db/models/PendingPairing.ts
import mongoose from "mongoose";

// ── pairing claim codes (FUTURE_PLANS item 63) ─────────────────────────
// One short-lived, single-use code per guild that the bot DMs the owner on
// guildCreate. The owner pastes it into the plugin dashboard, the platform
// redeems it through the signed proxy path, and the guildId lands in the
// app's pluginConfig. Rows are write-light and worthless once expired or
// consumed, so a TTL index lets Mongo reap them instead of a cleanup job.
export interface IPendingPairing {
	code: string;
	guildId: string;
	ownerUserId: string;
	expiresAt: Date;
	// null until redeemed. Set to the redemption time by the atomic
	// findOneAndUpdate in pendingPairingStore.redeem, which is what makes a
	// code single-use: once consumedAt is non-null the row no longer matches
	// the redeem filter.
	consumedAt: Date | null;
}

const pendingPairingSchema = new mongoose.Schema<IPendingPairing>({
	// uppercase:true normalizes on write so the stored value always matches the
	// uppercased lookup in redeem. unique guards against the astronomically rare
	// generator collision against a consumed but not yet reaped row.
	code: { type: String, required: true, unique: true, uppercase: true },
	guildId: { type: String, required: true, index: true },
	ownerUserId: { type: String, required: true },
	expiresAt: { type: Date, required: true },
	consumedAt: { type: Date, default: null },
});

// TTL index: Mongo's background monitor deletes a row once expiresAt is in the
// past (expireAfterSeconds:0 means expire exactly at expiresAt). The monitor
// runs about once a minute, so redeem re-checks expiresAt itself rather than
// trusting the row's mere presence.
pendingPairingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingPairing = mongoose.model<IPendingPairing>("PendingPairing", pendingPairingSchema);
