# Morocco administrative reference — GEO1

This pure TypeScript module is a **versioned HCP RGPH 2024 snapshot**, not a live
administrative service. It contains country `MA`, 12 regions, 62 provinces and
13 prefectures. Communes, cities, villages, douars and Company coverage are outside
this catalogue.

## Provenance

- [HCP publication, 7 November 2024](https://www.hcp.ma/Population-legale-du-Royaume-du-Maroc-repartie-par-regions-provinces-et-prefectures-et-communes-selon-les-resultats-du_a3974.html)
- [Official Excel workbook](https://www.hcp.ma/file/242341/)
- [Official PDF](https://www.hcp.ma/file/242342/), printed pages 1 and 4–8
- Census reference date: 1 September 2024. Source reviewed: 8 October 2026.
- Catalogue version: `hcp-rgph-2024-v1`.
- Excel SHA-256: `7e9d3d402cc2fd0d9c4fc941c4f23c6a5e5ddcbefbba80b7540267f8e2728dca`.
- Worksheet: `Population_légale`; region summary rows 9–20, province/prefecture
  summary rows 49–134, with region headers between them.

The workbook stores geographic codes as numbers with the custom display formats
`00` and `00"."000`. Canonical string identifiers preserve that display:
`01` and `01.511`, for example. The PDF confirms the padded/dotted codes.
They are HCP identifiers, not ISO codes or identifiers derived from array positions.

The test fixture was extracted directly from worksheet columns A and G,
independently of the TypeScript catalogue. It retains the original French label,
source row, type and observed region header. Repeated urban/rural totals,
Casablanca prefectures of arrondissements and all lower subdivisions are excluded.
Tests compare the complete identifier/type/parent sets and per-region contents,
rather than deriving expected membership from production data.

## Naming and compatibility

French labels remove only the administrative prefix (`Région de`,
`Province d'`, etc.). English labels use those same geographic proper names,
including accents; **they are not certified official English translations**.
Source spellings such as `Mohammadia` and `El Kelâa Des-Sraghna` are retained.
Names or aliases never validate as codes; no alias resolution is implemented.

This snapshot does not promise that future administrative changes are reflected
automatically. A later update must review authoritative data, keep provenance and
tests, bump the version and explicitly assess persisted-code compatibility.
The public government portal also reports 12 regions and 75 provinces/prefectures:
[territorial authorities](https://gouvernement-ouvert.ma/pan-engagement.php?engagement=24&lang=fr).

## API

Import from `@/lib/geography/morocco` in Next.js, or by a relative path in
Convex. There are no framework, Node, network or database runtime imports.

`getRegions`, `getRegion`, `getProvince`, `getProvincesByRegion`,
`isValidRegion`, `isValidProvince`, `isProvinceInRegion` and
`validateAdministrativePair` operate only on canonical codes. Code inputs are
`unknown`; malformed values and unknown codes fail without coercion.
The pair validator returns a discriminated result with machine-readable errors.

Records and arrays are frozen. Maps remain private. Lookups and parent validation
are O(1) average; listing retrieves a pre-grouped readonly array in O(1), whose
enumeration costs O(K). Initialization and memory are O(R + P).

For a future rural project in Azilal, the administrative pair is `05` / `05.081`.
The Client's douar name remains separate free text handled by later GEO tasks;
it need not appear in this catalogue or match a major city.

`assertAdministrativeCatalogueIntegrity` validates reference definitions in
O(R + P), including duplicate/malformed codes, empty names, missing parents,
invalid types and inconsistent code prefixes. It runs once during module
initialization; request validation never scans the full catalogue.

No publication, location disclosure, legacy-city mapping or coverage policy is
implemented here. Those Product decisions and later GEO tasks remain separate.
