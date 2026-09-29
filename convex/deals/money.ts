const MAD_MINOR_UNITS = 100;

/**
 * Convex stores monetary snapshots as MAD numbers normalized to centimes.
 * Round-trip through integer centimes to avoid rejecting valid decimals because
 * of binary floating-point artifacts such as `0.29 * 100`.
 */
export function isCentimePrecisionMadAmount(value: number, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    return false;
  }
  const centimes = Math.round(value * MAD_MINOR_UNITS);
  return Number.isSafeInteger(centimes) && centimes / MAD_MINOR_UNITS === value;
}

export function hasCompleteCommissionSnapshot(snapshot: {
  agreedAmountMad: number;
  commissionRateBps: number;
  commissionAmountMad: number;
  commissionConfigVersion: number;
}) {
  return (
    isCentimePrecisionMadAmount(snapshot.agreedAmountMad) &&
    Number.isSafeInteger(snapshot.commissionRateBps) &&
    snapshot.commissionRateBps >= 0 &&
    snapshot.commissionRateBps <= 3_000 &&
    isCentimePrecisionMadAmount(snapshot.commissionAmountMad, true) &&
    Number.isSafeInteger(snapshot.commissionConfigVersion) &&
    snapshot.commissionConfigVersion > 0
  );
}
