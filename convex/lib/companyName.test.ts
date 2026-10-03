import { describe, expect, test } from "vitest";
import { companyNameForAudience, companyPdfFileNameForAudience, maskCompanyName, maskCompanyNamesInText, maskPublicCompanyText } from "./companyName";

describe("Company name masking", () => {
  test.each([
    ["S2MBOU SARL", "S2**** SA**"],
    ["Atlas Construction Maroc", "At*** Co********** Ma***"],
    ["A AB CD", "A AB CD"],
    ["  Atlas   Maroc\tSARL\n", "At*** Ma*** SA**"],
    ["Élévation Béton", "Él******* Bé***"],
    ["E\u0301le\u0301vation Be\u0301ton", "Él******* Bé***"],
    ["12345 S2MBOU", "12*** S2****"],
    ["L'Atlas BTP-MAROC S.A.R.L.", "L'***** BT******* S.******"],
    ["🏗️ Bâtir", "🏗️ Bâ***"],
    ["", ""],
    [" \t\n", ""],
  ])("masks %j", (name, expected) => {
    expect(maskCompanyName(name)).toBe(expected);
    expect(maskCompanyName(expected)).toBe(expected);
  });

  test.each([null, undefined, 123, false, {}, [], { toString: () => "secret" }])(
    "fails closed for invalid value %j", (name) => expect(maskCompanyName(name)).toBe(""),
  );

  test("full names require an explicit privileged audience", () => {
    expect(companyNameForAudience("S2MBOU SARL", "public")).toBe("S2**** SA**");
    expect(companyNameForAudience("S2MBOU SARL", "client")).toBe("S2**** SA**");
    expect(companyNameForAudience("S2MBOU SARL", "admin")).toBe("S2MBOU SARL");
    expect(companyNameForAudience("S2MBOU SARL", "own_company")).toBe("S2MBOU SARL");
  });

  test("redacts exact aliases in text, including accents, whitespace and regex punctuation", () => {
    expect(maskCompanyNamesInText("S2MBOU SARL: s2mbou  sarl. Atlas+ (SARL)", ["S2MBOU", "S2MBOU SARL", "Atlas+ (SARL)"]))
      .toBe("S2**** SA**: s2**** sa**. At**** (S****");
    expect(maskCompanyNamesInText("E\u0301lévation and Atlantis", ["Élévation", "Atlas"]))
      .toBe("Él******* and Atlantis");
    expect(maskCompanyNamesInText("Unchanged text", [null, "", undefined])).toBe("Unchanged text");
  });
});

describe("Company PDF filename privacy", () => {
  test.each(["---", "___", " -_ _- ", "   ", "\t\n", "---.pdf", "___.PDF"])(
    "separator-only alias %j cannot consume ordinary spaces or bypass name masking", fileName => {
      const files = [{ originalFileName: fileName, kind: "final-quote" as const }];
      expect(maskCompanyNamesInText("Supply  materials and labour.", [], files)).toBe("Supply  materials and labour.");
      expect(maskCompanyNamesInText("Work by S2MBOU SARL.", ["S2MBOU SARL"], files)).toBe("Work by S2**** SA**.");
      if (fileName.trim()) {
        expect(maskCompanyNamesInText(`See ${fileName}.`, [], files)).toBe(`See final-quote${/\.pdf$/i.exec(fileName)?.[0] ?? ".pdf"}.`);
      }
    },
  );

  test("meaningful extensionless aliases still recognize separator equivalents", () => {
    expect(maskCompanyNamesInText("See devis_final; ordinary spaces stay intact.", [], [
      { originalFileName: "devis-final", kind: "final-quote" },
    ])).toBe("See final-quote.pdf; ordinary spaces stay intact.");
  });

  test("uses actual spans instead of spelling length for normalized overlapping aliases", () => {
    const files = [
      { originalFileName: `report${"-".repeat(30)}`, kind: "final-quote" as const },
      { originalFileName: "report S2MBOU SARL2026.pdf", kind: "attachment" as const },
      { originalFileName: "2026.pdf", kind: "attachment" as const },
    ];
    for (const references of [files, [...files].reverse()]) {
      expect(maskCompanyNamesInText("Please see report S2MBOU SARL2026.pdf and 2026.pdf.", ["S2MBOU SARL"], references))
        .toBe("Please see attachment.pdf and attachment.pdf.");
    }
  });

  test("the longest actual span wins across alias ordering and separator normalization", () => {
    const files = [
      { originalFileName: `report${"-".repeat(30)}`, kind: "final-quote" as const },
      { originalFileName: "report S2MBOU SARL2026.pdf", kind: "attachment" as const },
      { originalFileName: "S2MBOU SARL2026.pdf", kind: "final-quote" as const },
    ];
    for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      for (const reference of [
        "report S2MBOU SARL2026.pdf",
        "report---S2MBOU_SARL2026.PdF",
        `report${"-".repeat(60)}S2MBOU   SARL2026.pdf`,
      ]) {
        expect(maskCompanyNamesInText(`Please see ${reference}.`, ["S2MBOU SARL"], order.map(index => files[index])))
          .toBe("Please see attachment.pdf.");
      }
    }
  });

  test.each(["---.pdf", "___.PDF", "-_.pdf"])("legacy separator basename %s has a literal extensionless alias", originalFileName => {
    const basename = originalFileName.replace(/\.pdf$/iu, "");
    const files = [{ originalFileName, kind: "attachment" as const }];
    const safeName = `attachment${/\.pdf$/iu.exec(originalFileName)![0]}`;
    expect(maskCompanyNamesInText(`See ${basename}; then ${originalFileName}.`, [], files))
      .toBe(`See ${safeName}; then ${safeName}.`);
    expect(maskCompanyNamesInText("Work by S2MBOU SARL; ordinary  spaces remain.", ["S2MBOU SARL"], files))
      .toBe("Work by S2**** SA**; ordinary  spaces remain.");
    for (const separator of ["\\", "/"]) {
      const uploadFileName = `S2MBOU SARL2026${separator}${basename}`;
      expect(() => maskCompanyNamesInText(`See ${uploadFileName}.`, ["S2MBOU SARL"], files))
        .toThrow("COMPANY_FILE_PRIVACY_LIMIT");
      expect(maskCompanyNamesInText(`See ${uploadFileName}.`, ["S2MBOU SARL"], [{ ...files[0], uploadFileName }]))
        .toBe(`See ${safeName}.`);
    }
  });

  test("a legacy empty PDF stem cannot become a zero-width or whitespace alias", () => {
    expect(maskCompanyNamesInText("Work by S2MBOU SARL; ordinary  spaces remain.", ["S2MBOU SARL"], [
      { originalFileName: ".pdf", kind: "attachment" },
    ])).toBe("Work by S2**** SA**; ordinary  spaces remain.");
  });

  test.each(["\\", "/"])("legacy basename whitespace cannot hide an unknown path prefix (%s)", separator => {
    const files = [{ originalFileName: "plans.pdf", kind: "attachment" as const }];
    for (const whitespace of [" ", "   ", "\t", " \t "]) {
      const uploadFileName = `S2MBOU SARL2026${separator}${whitespace}plans.pdf`;
      expect(() => maskCompanyNamesInText(`See ${uploadFileName}.`, ["S2MBOU SARL"], files))
        .toThrow("COMPANY_FILE_PRIVACY_LIMIT");
      expect(maskCompanyNamesInText(`See ${uploadFileName}.`, ["S2MBOU SARL"], [{ ...files[0], uploadFileName }]))
        .toBe("See attachment.pdf.");
    }
    expect(maskCompanyNamesInText("See   plans.pdf; ordinary spaces are preserved.", [], files))
      .toBe("See   attachment.pdf; ordinary spaces are preserved.");
  });

  test("covers overlapping occurrences of the same alias and crossing aliases", () => {
    expect(maskCompanyNamesInText("ababa", [], [{ originalFileName: "aba", kind: "final-quote" }]))
      .toBe("final-quote.pdf");
    expect(maskCompanyNamesInText("abcdefgh", [], [
      { originalFileName: "abcdef", kind: "final-quote" },
      { originalFileName: "defgh", kind: "attachment" },
    ])).toBe("final-quote.pdf");
  });

  test.each(["\\", "/"])("fails closed for an unreconstructable legacy path (%s)", separator => {
    const files = [{ originalFileName: "plans.pdf", kind: "attachment" as const }];
    expect(() => maskCompanyNamesInText(`Please see S2MBOU SARL2026${separator}plans.pdf.`, ["S2MBOU SARL"], files))
      .toThrow("COMPANY_FILE_PRIVACY_LIMIT");
    expect(maskCompanyNamesInText("Please see plans.pdf.", [], files)).toBe("Please see attachment.pdf.");
  });

  test.each(["\\", "/"])("reconstructs retained full paths and their basenames (%s)", separator => {
    const uploadFileName = `S2MBOU SARL2026${separator}plans?.PDF`;
    const files = [{ originalFileName: "plans-.PDF", uploadFileName, kind: "attachment" as const }];
    const pathVariant = uploadFileName.replace(/[\\/]/g, separator === "\\" ? "/" : "\\");
    expect(maskCompanyNamesInText(`See ${uploadFileName}. Then ${pathVariant}. Then plans?.PDF and plans-.PDF.`, [], files))
      .toBe("See attachment.PDF. Then attachment.PDF. Then attachment.PDF and attachment.PDF.");
  });

  test("a retained partial path cannot authorize an unknown identifying prefix", () => {
    expect(() => maskCompanyNamesInText("See S2MBOU SARL2026\\plans.pdf.", [], [
      { originalFileName: "plans.pdf", uploadFileName: "\\plans.pdf", kind: "attachment" },
    ])).toThrow("COMPANY_FILE_PRIVACY_LIMIT");
  });

  test("reconstructs a legacy full path only when it was actually retained", () => {
    expect(maskCompanyNamesInText("See S2MBOU SARL2026\\plans.pdf and plans.pdf.", [], [
      { originalFileName: "S2MBOU SARL2026\\plans.pdf", kind: "attachment" },
    ])).toBe("See attachment.pdf and attachment.pdf.");
  });

  test("fails closed on excessive aliases, text or actual matches", () => {
    expect(() => maskCompanyNamesInText("text", [], Array.from({ length: 1_101 }, () => ({
      originalFileName: "a", kind: "final-quote" as const,
    })))).toThrow("COMPANY_FILE_PRIVACY_LIMIT");
    expect(() => maskCompanyNamesInText("a".repeat(20_001), [], [
      { originalFileName: "a", kind: "final-quote" },
    ])).toThrow("COMPANY_FILE_PRIVACY_LIMIT");
    expect(() => maskCompanyNamesInText("a".repeat(15_000), [], [
      { originalFileName: "a", kind: "final-quote" }, { originalFileName: "aa", kind: "final-quote" },
    ])).toThrow("COMPANY_FILE_PRIVACY_LIMIT");
  });

  test.each([
    ["S2MBOU SARL2026?.pdf", "S2MBOU SARL2026-.pdf"],
    ["S2MBOU-SARL2026?.pdf", "S2MBOU-SARL2026-.pdf"],
    ["S2MBOU_SARL2026?.pdf", "S2MBOU_SARL2026-.pdf"],
    ["Élévation & Béton2026?.pDf", "Élévation & Béton2026-.pDf"],
    ["S2MBOU  SARL2026.pdf", "S2MBOU SARL2026.pdf"],
    ["S2MBOU SARL2026", "S2MBOU SARL2026.pdf"],
  ])("recognizes legacy sanitizer equivalents of %s", (uploadFileName, originalFileName) => {
    const references = [{ originalFileName, kind: "attachment" as const }];
    const extension = /\.pdf$/i.exec(originalFileName)![0];
    expect(maskCompanyNamesInText(`See ${uploadFileName}. Then ${originalFileName}.`, [], references))
      .toBe(`See attachment${extension}. Then attachment${extension}.`);
  });

  test("recognizes preserved upload aliases, Unicode forms and separator variants", () => {
    const references = [{
      originalFileName: "Élévation-SARL2026-.PDF", uploadFileName: "E\u0301lévation-SARL2026?.PDF", kind: "attachment" as const,
    }];
    expect(maskCompanyNamesInText("See Élévation_SARL2026?.PDF and E\u0301lévation-SARL2026?.PDF.", [], references))
      .toBe("See attachment.PDF and attachment.PDF.");
    expect(maskCompanyNamesInText("Ordinary text without references.", [], references))
      .toBe("Ordinary text without references.");
  });

  test("fails closed when legacy truncation lost aliases, but supports preserved long uploads", () => {
    const uploadFileName = `S2MBOU SARL2026-${"supporting-document-".repeat(12)}.pdf`;
    const originalFileName = `${uploadFileName.slice(0, 180)}.pdf`;
    expect(() => maskCompanyNamesInText(`See ${uploadFileName}.`, [], [{ originalFileName, kind: "attachment" }]))
      .toThrow("COMPANY_FILE_PRIVACY_LIMIT");
    expect(maskCompanyNamesInText(`See ${uploadFileName}.`, [], [{ originalFileName, uploadFileName, kind: "attachment" }]))
      .toBe("See attachment.pdf.");
    const atLimit = `${"x".repeat(176)}.pdf`;
    expect(() => maskCompanyNamesInText(atLimit, [], [{ originalFileName: atLimit, kind: "attachment" }]))
      .toThrow("COMPANY_FILE_PRIVACY_LIMIT");
  });

  test.each([
    "S2MBOU SARL2026.pdf",
    "S2MBOU-SARL.pdf",
    "S2MBOU_SARL.pdf",
    "project-DevisS2MBOU SARL2026-revision.pdf",
    "Élévation & Béton (S.A.R.L.)-2026.pDf",
  ])("replaces known filename references before Company-name masking: %s", (fileName) => {
    const extension = /\.pdf$/i.exec(fileName)![0];
    const references = [{ originalFileName: fileName, kind: "attachment" as const }];
    const text = `Please see ${fileName}. Again: ${fileName.toUpperCase()}.`;
    expect(maskCompanyNamesInText(text, ["S2MBOU SARL"], references))
      .toBe(`Please see attachment${extension}. Again: attachment${extension}.`);
    expect(maskCompanyNamesInText("Ordinary text without filenames.", [], references))
      .toBe("Ordinary text without filenames.");
  });

  test("replaces overlapping references once, and keeps unrelated text unchanged", () => {
    const references = [
      { originalFileName: "SARL.pdf", kind: "attachment" as const },
      { originalFileName: "S2MBOU-SARL.pdf", kind: "final-quote" as const },
    ];
    expect(maskCompanyNamesInText("See S2MBOU-SARL.pdf and SARL.pdf.", [], references))
      .toBe("See final-quote.pdf and attachment.pdf.");
    expect(maskCompanyNamesInText("Please see quote.pdf.", [], []))
      .toBe("Please see quote.pdf.");
  });

  test.each([
    ["S2MBOU SARL2026.pdf", ".pdf"],
    ["S2MBOU-SARL.pdf", ".pdf"],
    ["S2MBOU_SARL.pdf", ".pdf"],
    ["project-DevisS2MBOU SARL2026-revision.pdf", ".pdf"],
    ["S2MBOU Construction SARL2026.pdf", ".pdf"],
    ["Élévation & Béton (S.A.R.L.)-2026.PDF", ".PDF"],
    ["quote.pDf", ".pDf"],
    ["quote.S2MBOU", ".pdf"],
    ["no-extension", ".pdf"],
    ["", ".pdf"],
  ])("generates safe public/Client names and preserves privileged originals for %s", (fileName, extension) => {
    for (const kind of ["attachment", "final-quote", "company-document"] as const) {
      for (const audience of ["client", "public"] as const) {
        expect(companyPdfFileNameForAudience(fileName, audience, kind)).toBe(`${kind}${extension}`);
      }
      for (const audience of ["admin", "own_company"] as const) {
        expect(companyPdfFileNameForAudience(fileName, audience, kind)).toBe(fileName);
      }
    }
  });
});

describe("public Company text filename boundary", () => {
  test.each(["S2MBOU SARL2026.pdf", "S2MBOU-SARL2026.pdf", "S2MBOU_SARL2026?.pdf", "S2MBOU SARL2026", "S2MBOU SARL2026\\plans.pdf"])(
    "withholds unresolved %s without private filename lookups", fileName => {
      expect(maskPublicCompanyText(`Please see ${fileName}.`, ["S2MBOU SARL"])).toBe("");
    },
  );

  test("authorized references are generated before Company-name masking", () => {
    const files = [{ originalFileName: "S2MBOU SARL2026.pdf", kind: "company-document" as const }];
    expect(maskPublicCompanyText("S2MBOU SARL: see S2MBOU SARL2026.pdf.", ["S2MBOU SARL"], files))
      .toBe("S2**** SA**: see company-document.pdf.");
  });

  test("safe copy, short names, empty text and privileged caller copy remain intact", () => {
    expect(maskPublicCompanyText("Work by S2MBOU SARL; ordinary  spaces remain.", ["S2MBOU SARL"]))
      .toBe("Work by S2**** SA**; ordinary  spaces remain.");
    expect(maskPublicCompanyText("Work by AB CD.", ["AB CD"])).toBe("Work by AB CD.");
    expect(maskPublicCompanyText("", ["S2MBOU SARL"])).toBe("");
    expect(maskPublicCompanyText("Work by S2MBOU SARL.", [])).toBe("Work by S2MBOU SARL.");
  });

  test("unreconstructable public path copy fails closed", () => {
    expect(maskPublicCompanyText("See S2MBOU SARL2026\\plans.pdf.", ["S2MBOU SARL"], [
      { originalFileName: "plans.pdf", kind: "attachment" },
    ])).toBe("");
  });
});
