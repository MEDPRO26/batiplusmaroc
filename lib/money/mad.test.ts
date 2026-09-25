import { describe, expect, test } from "vitest";
import { parseMadInput } from "./mad";

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
