import { describe, expect, test } from "vitest";
import { formatMadAmount, parseMadCentimeInput, parseMadInput } from "./mad";

describe("parseMadInput", () => {
  test.each([
    ["300000", 300000],
    ["300,000", 300000],
    ["300 000", 300000],
    ["300\u00A0000", 300000],
    ["1,234,567", 1234567],
    ["300.00", 300],
    ["300", 300],
  ] as const)("parses %j as %d", (input, expected) => {
    expect(parseMadInput(input)).toBe(expected);
  });

  test("never turns 300,000 into 300 (unlike parseFloat)", () => {
    expect(parseFloat("300,000")).toBe(300);
    expect(Number("300,000")).toBeNaN();
    expect(parseMadInput("300,000")).toBe(300000);
  });

  test.each([
    "300.000",
    "300,00",
    "300,000.50",
    "abc",
    "",
    "  ",
    "12,34",
    "-300000",
    "0",
  ])("rejects ambiguous or invalid %j", (input) => {
    expect(parseMadInput(input)).toBeNull();
  });
});

describe("parseMadCentimeInput", () => {
  test.each([
    ["320000", 320000],
    ["320000.5", 320000.5],
    ["320000.50", 320000.5],
    ["320000,50", 320000.5],
    ["320 000,50", 320000.5],
    ["320\u202F000,50", 320000.5],
    ["45250.75", 45250.75],
    ["300,000", 300000],
    ["1,234,567.50", 1234567.5],
    ["1.234.567,50", 1234567.5],
    ["0.29", 0.29],
    ["0,01", 0.01],
  ] as const)("parses %j exactly as %d", (input, expected) => {
    expect(parseMadCentimeInput(input)).toBe(expected);
  });

  test.each([
    "320000.505",
    "320000,505",
    "0.001",
    "300.000",
    "1,234.567",
    "1,23,456",
    "12.34.56",
    "320000.",
    ".50",
    "1e5",
    "abc",
    "",
    "  ",
    "-320000.50",
    "0",
    "0.00",
    "99999999999999999999",
  ])("rejects over-precise, ambiguous or invalid %j", (input) => {
    expect(parseMadCentimeInput(input)).toBeNull();
  });

  test("never rounds a fractional amount to whole dirhams", () => {
    expect(parseMadInput("320000.50")).toBe(320001);
    expect(parseMadCentimeInput("320000.50")).toBe(320000.5);
  });
});

describe("formatMadAmount", () => {
  test("always shows exactly two decimals in FR and EN", () => {
    expect(formatMadAmount(320000.5, "en")).toBe("MAD\u00a0320,000.50");
    expect(formatMadAmount(16000.03, "en")).toBe("MAD\u00a016,000.03");
    expect(formatMadAmount(450000, "en")).toBe("MAD\u00a0450,000.00");
    expect(formatMadAmount(320000.5, "fr")).toBe("320\u202f000,50\u00a0MAD");
    expect(formatMadAmount(450000, "fr")).toBe("450\u202f000,00\u00a0MAD");
  });
});
