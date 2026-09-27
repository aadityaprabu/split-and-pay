import { describe, expect, it } from "vitest";
import { equalBasisPoints, previewShares } from "../../utils/splits";

const amounts = (preview) => preview.shares.map((share) => share.amountMinor);

describe("previewShares", () => {
  it("splits equally, giving leftover paise to the first people", () => {
    const preview = previewShares({
      amountMinor: 10000,
      splitType: "equal",
      participants: [{ userId: "a" }, { userId: "b" }, { userId: "c" }],
    });
    expect(amounts(preview)).toEqual([3334, 3333, 3333]);
    expect(preview.error).toBeNull();
  });

  it("splits by percent the same way the backend does", () => {
    const preview = previewShares({
      amountMinor: 10001,
      splitType: "percent",
      participants: [
        { userId: "a", basisPoints: 3333 },
        { userId: "b", basisPoints: 3333 },
        { userId: "c", basisPoints: 3334 },
      ],
    });
    expect(amounts(preview)).toEqual([3333, 3333, 3335]);
    expect(preview.error).toBeNull();
  });

  it("explains a percentage total that isn't 100%", () => {
    const preview = previewShares({
      amountMinor: 10000,
      splitType: "percent",
      participants: [
        { userId: "a", basisPoints: 5000 },
        { userId: "b", basisPoints: 4000 },
      ],
    });
    expect(preview.error).toBe("Percentages add up to 90%, not 100%");
  });

  it("says how much is left or too much for exact amounts", () => {
    const split = (first, second) =>
      previewShares({
        amountMinor: 10000,
        currency: "USD",
        splitType: "exact",
        participants: [
          { userId: "a", amountMinor: first },
          { userId: "b", amountMinor: second },
        ],
      }).error;
    expect(split(6000, 3000)).toBe("$10 left to assign");
    expect(split(6000, 5000)).toBe("$10 too much");
    expect(split(6000, 4000)).toBeNull();
  });
});

describe("equalBasisPoints", () => {
  it("always adds up to 100%", () => {
    expect(equalBasisPoints(3)).toEqual([3334, 3333, 3333]);
    expect(equalBasisPoints(4)).toEqual([2500, 2500, 2500, 2500]);
  });
});
