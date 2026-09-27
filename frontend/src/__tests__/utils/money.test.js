import { describe, expect, it } from "vitest";
import { formatBasisPoints, formatMinor, hundredthsToText, parseHundredths } from "../../utils/money";

describe("parseHundredths", () => {
  it("turns typed amounts into whole hundredths", () => {
    expect(parseHundredths("450")).toBe(45000);
    expect(parseHundredths("33.5")).toBe(3350);
    expect(parseHundredths("0.07")).toBe(7);
    expect(parseHundredths(".5")).toBe(50);
    expect(parseHundredths("12.")).toBe(1200);
    expect(parseHundredths(" 1,200.05 ")).toBe(120005);
  });

  it("rejects anything that isn't a plain amount with up to 2 decimals", () => {
    for (const bad of ["", " ", ".", "-5", "1.234", "abc", "1e3", "1.2.3", undefined]) {
      expect(parseHundredths(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("round-trips through hundredthsToText", () => {
    for (const value of [1, 50, 3333, 45000]) {
      expect(parseHundredths(hundredthsToText(value))).toBe(value);
    }
  });
});

describe("formatting", () => {
  it("shows rupees in the Indian style, with paise only when there are some", () => {
    expect(formatMinor(45000, "INR")).toBe("₹450");
    expect(formatMinor(3334, "INR")).toBe("₹33.34");
    expect(formatMinor(12345600, "INR")).toBe("₹1,23,456");
  });

  it("shows dollars in the US style, with cents only when there are some", () => {
    expect(formatMinor(45000, "USD")).toBe("$450");
    expect(formatMinor(3334, "USD")).toBe("$33.34");
    expect(formatMinor(12345600, "USD")).toBe("$123,456");
  });

  it("shows basis points as a percentage", () => {
    expect(formatBasisPoints(3333)).toBe("33.33%");
    expect(formatBasisPoints(5000)).toBe("50%");
  });
});
