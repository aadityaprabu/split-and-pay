import { Percent, SplitType } from "../constants/constants";
import { formatMinor } from "./money";

/**
 * Preview of how an expense will be split, mirroring the backend's computeShares (which has the
 * final say). participants: [{ userId, basisPoints?, amountMinor? }] in display order.
 * Returns { shares: [{ userId, amountMinor }], error } where error is a message to show, or null.
 */
export function previewShares({ amountMinor, currency, splitType, participants }) {
  if (participants.length === 0) return { shares: [], error: "Add at least one participant" };

  if (splitType === SplitType.EQUAL) {
    const baseShare = Math.floor(amountMinor / participants.length);
    const leftoverPaise = amountMinor - baseShare * participants.length;
    const shares = participants.map((participant, index) => ({
      userId: participant.userId,
      amountMinor: baseShare + (index < leftoverPaise ? 1 : 0),
    }));
    return { shares, error: baseShare === 0 ? "The amount is too small to split between that many people" : null };
  }

  if (splitType === SplitType.PERCENT) {
    const totalBasisPoints = participants.reduce((total, participant) => total + (participant.basisPoints ?? 0), 0);
    const shares = participants.map((participant) => ({
      userId: participant.userId,
      amountMinor: Math.floor((amountMinor * (participant.basisPoints ?? 0)) / Percent.TOTAL_BASIS_POINTS),
    }));
    if (participants.some((participant) => !(participant.basisPoints > 0))) {
      return { shares, error: "Give everyone a percentage more than 0" };
    }
    if (totalBasisPoints !== Percent.TOTAL_BASIS_POINTS) {
      return { shares, error: `Percentages add up to ${totalBasisPoints / 100}%, not 100%` };
    }
    // Hand out the paise lost to rounding the same way the backend does
    let leftoverPaise = amountMinor - shares.reduce((total, share) => total + share.amountMinor, 0);
    const byRoundingLoss = participants
      .map((participant, index) => ({ index, loss: (amountMinor * participant.basisPoints) % Percent.TOTAL_BASIS_POINTS }))
      .sort((a, b) => b.loss - a.loss || a.index - b.index);
    for (const { index } of byRoundingLoss) {
      if (leftoverPaise === 0) break;
      shares[index].amountMinor += 1;
      leftoverPaise -= 1;
    }
    return { shares, error: null };
  }

  const shares = participants.map((participant) => ({
    userId: participant.userId,
    amountMinor: participant.amountMinor ?? 0,
  }));
  if (participants.some((participant) => !(participant.amountMinor > 0))) {
    return { shares, error: "Give everyone an amount more than 0" };
  }
  const totalMinor = shares.reduce((total, share) => total + share.amountMinor, 0);
  if (totalMinor !== amountMinor) {
    const difference = amountMinor - totalMinor;
    const message =
      difference > 0
        ? `${formatMinor(difference, currency)} left to assign`
        : `${formatMinor(-difference, currency)} too much`;
    return { shares, error: message };
  }
  return { shares, error: null };
}

/** Basis points that split 100% as evenly as possible: 3 people → 3334, 3333, 3333 */
export function equalBasisPoints(count) {
  const base = Math.floor(Percent.TOTAL_BASIS_POINTS / count);
  const leftover = Percent.TOTAL_BASIS_POINTS - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < leftover ? 1 : 0));
}
