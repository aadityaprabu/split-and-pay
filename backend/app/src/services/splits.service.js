const { SplitType, Percent } = require("../constants/constants");
const HttpError = require("../models/httpError.model");
const { formatMinor } = require("../utils/money.util");

/**
 * Works out how much of `amountMinor` each participant owes. Every result is a whole number of
 * minor units (cents / paise) and the shares always add up to exactly `amountMinor`.
 * `currency` is only used to format amounts in error messages.
 *
 * participants: [{ userId, basisPoints? (percent), amountMinor? (exact) }], in display order.
 * Returns [{ userId, amountMinor, basisPoints }] in the same order.
 */
function computeShares({ amountMinor, currency, splitType, participants }) {
  switch (splitType) {
    case SplitType.EQUAL:
      return withPositiveShares(splitEqually(amountMinor, participants));
    case SplitType.PERCENT:
      return withPositiveShares(splitByPercent(amountMinor, participants));
    case SplitType.EXACT:
      return withPositiveShares(splitByExactAmounts(amountMinor, currency, participants));
    default:
      throw new HttpError(400, "Choose how to split: equally, by percentage or by exact amounts");
  }
}

// 100.00 between 3 is 33.34 + 33.33 + 33.33: the leftover cents / paise go to the first participants
function splitEqually(amountMinor, participants) {
  const baseShare = Math.floor(amountMinor / participants.length);
  const leftoverPaise = amountMinor - baseShare * participants.length;
  return participants.map((participant, index) => ({
    userId: participant.userId,
    amountMinor: baseShare + (index < leftoverPaise ? 1 : 0),
    basisPoints: null,
  }));
}

// Each share is rounded down, then the leftover cents / paise go to whoever lost the most to rounding
function splitByPercent(amountMinor, participants) {
  for (const participant of participants) {
    if (!Number.isInteger(participant.basisPoints) || participant.basisPoints <= 0) {
      throw new HttpError(400, "Every percentage must be more than 0");
    }
  }
  const totalBasisPoints = participants.reduce((total, participant) => total + participant.basisPoints, 0);
  if (totalBasisPoints !== Percent.TOTAL_BASIS_POINTS) {
    throw new HttpError(400, `Percentages add up to ${totalBasisPoints / 100}%, not 100%`);
  }

  const shares = participants.map((participant, index) => {
    const exactShareTimesTotal = amountMinor * participant.basisPoints;
    return {
      index,
      userId: participant.userId,
      amountMinor: Math.floor(exactShareTimesTotal / Percent.TOTAL_BASIS_POINTS),
      roundingLoss: exactShareTimesTotal % Percent.TOTAL_BASIS_POINTS,
      basisPoints: participant.basisPoints,
    };
  });

  let leftoverPaise = amountMinor - shares.reduce((total, share) => total + share.amountMinor, 0);
  const byRoundingLoss = [...shares].sort((a, b) => b.roundingLoss - a.roundingLoss || a.index - b.index);
  for (const share of byRoundingLoss) {
    if (leftoverPaise === 0) break;
    share.amountMinor += 1;
    leftoverPaise -= 1;
  }

  return shares.map(({ userId, amountMinor: share, basisPoints }) => ({ userId, amountMinor: share, basisPoints }));
}

function splitByExactAmounts(amountMinor, currency, participants) {
  for (const participant of participants) {
    if (!Number.isInteger(participant.amountMinor) || participant.amountMinor <= 0) {
      throw new HttpError(400, "Every amount must be more than 0");
    }
  }
  const totalMinor = participants.reduce((total, participant) => total + participant.amountMinor, 0);
  if (totalMinor !== amountMinor) {
    throw new HttpError(
      400,
      `The amounts add up to ${formatMinor(totalMinor, currency)}, not ${formatMinor(amountMinor, currency)}`
    );
  }
  return participants.map((participant) => ({
    userId: participant.userId,
    amountMinor: participant.amountMinor,
    basisPoints: null,
  }));
}

// A ₹0 share means that person isn't really part of the expense
function withPositiveShares(shares) {
  if (shares.some((share) => share.amountMinor <= 0)) {
    throw new HttpError(400, "The amount is too small to split between that many people");
  }
  return shares;
}

module.exports = { computeShares };
