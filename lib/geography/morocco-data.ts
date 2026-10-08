/**
 * HCP RGPH 2024 administrative snapshot. See README.md for extraction/provenance.
 * Codes are the displayed HCP geographic identifiers, including leading zeros.
 * English labels retain the French-source proper names; they are not claimed
 * to be official English translations. Aliases are not canonical identifiers.
 */
export interface RegionDefinition {
  readonly code: string;
  readonly nameFr: string;
  readonly nameEn: string;
}

export interface ProvinceDefinition extends RegionDefinition {
  readonly regionCode: string;
  readonly kind: "province" | "prefecture";
}

export const MOROCCO_CATALOGUE = Object.freeze({
  countryCode: "MA",
  version: "hcp-rgph-2024-v1",
  referenceDate: "2024-09-01",
  publishedAt: "2024-11-07",
  reviewedAt: "2026-10-08",
  sourceUrl: "https://www.hcp.ma/Population-legale-du-Royaume-du-Maroc-repartie-par-regions-provinces-et-prefectures-et-communes-selon-les-resultats-du_a3974.html",
  workbookUrl: "https://www.hcp.ma/file/242341/",
  pdfUrl: "https://www.hcp.ma/file/242342/",
  workbookSha256: "7e9d3d402cc2fd0d9c4fc941c4f23c6a5e5ddcbefbba80b7540267f8e2728dca",
  worksheet: "Population_légale",
});

/** Source order, independent of locale sorting; freeze records and the array. */
export const MOROCCO_REGIONS = Object.freeze(
  ([
    { code: "01", nameFr: "Tanger-Tétouan-Al Hoceima", nameEn: "Tanger-Tétouan-Al Hoceima" },
    { code: "02", nameFr: "Oriental", nameEn: "Oriental" },
    { code: "03", nameFr: "Fès-Meknès", nameEn: "Fès-Meknès" },
    { code: "04", nameFr: "Rabat-Salé-Kénitra", nameEn: "Rabat-Salé-Kénitra" },
    { code: "05", nameFr: "Béni Mellal-Khénifra", nameEn: "Béni Mellal-Khénifra" },
    { code: "06", nameFr: "Casablanca-Settat", nameEn: "Casablanca-Settat" },
    { code: "07", nameFr: "Marrakech-Safi", nameEn: "Marrakech-Safi" },
    { code: "08", nameFr: "Drâa-Tafilalet", nameEn: "Drâa-Tafilalet" },
    { code: "09", nameFr: "Souss-Massa", nameEn: "Souss-Massa" },
    { code: "10", nameFr: "Guelmim-Oued Noun", nameEn: "Guelmim-Oued Noun" },
    { code: "11", nameFr: "Laâyoune-Sakia El Hamra", nameEn: "Laâyoune-Sakia El Hamra" },
    { code: "12", nameFr: "Dakhla-Oued Ed-Dahab", nameEn: "Dakhla-Oued Ed-Dahab" },
  ] as const satisfies readonly RegionDefinition[]).map((region) => Object.freeze(region)),
);

export type RegionCode = (typeof MOROCCO_REGIONS)[number]["code"];

export const MOROCCO_PROVINCES = Object.freeze(
  ([
    { code: "01.511", regionCode: "01", kind: "prefecture", nameFr: "Tanger-Assilah", nameEn: "Tanger-Assilah" },
    { code: "01.573", regionCode: "01", kind: "prefecture", nameFr: "M'diq-Fnideq", nameEn: "M'diq-Fnideq" },
    { code: "01.571", regionCode: "01", kind: "province", nameFr: "Tétouan", nameEn: "Tétouan" },
    { code: "01.227", regionCode: "01", kind: "province", nameFr: "Fahs-Anjra", nameEn: "Fahs-Anjra" },
    { code: "01.331", regionCode: "01", kind: "province", nameFr: "Larache", nameEn: "Larache" },
    { code: "01.051", regionCode: "01", kind: "province", nameFr: "Al Hoceima", nameEn: "Al Hoceima" },
    { code: "01.151", regionCode: "01", kind: "province", nameFr: "Chefchaouen", nameEn: "Chefchaouen" },
    { code: "01.405", regionCode: "01", kind: "province", nameFr: "Ouezzane", nameEn: "Ouezzane" },
    { code: "02.411", regionCode: "02", kind: "prefecture", nameFr: "Oujda-Angad", nameEn: "Oujda-Angad" },
    { code: "02.381", regionCode: "02", kind: "province", nameFr: "Nador", nameEn: "Nador" },
    { code: "02.167", regionCode: "02", kind: "province", nameFr: "Driouch", nameEn: "Driouch" },
    { code: "02.275", regionCode: "02", kind: "province", nameFr: "Jerada", nameEn: "Jerada" },
    { code: "02.113", regionCode: "02", kind: "province", nameFr: "Berkane", nameEn: "Berkane" },
    { code: "02.533", regionCode: "02", kind: "province", nameFr: "Taourirt", nameEn: "Taourirt" },
    { code: "02.265", regionCode: "02", kind: "province", nameFr: "Guercif", nameEn: "Guercif" },
    { code: "02.251", regionCode: "02", kind: "province", nameFr: "Figuig", nameEn: "Figuig" },
    { code: "03.231", regionCode: "03", kind: "prefecture", nameFr: "Fès", nameEn: "Fès" },
    { code: "03.061", regionCode: "03", kind: "prefecture", nameFr: "Meknès", nameEn: "Meknès" },
    { code: "03.171", regionCode: "03", kind: "province", nameFr: "El Hajeb", nameEn: "El Hajeb" },
    { code: "03.271", regionCode: "03", kind: "province", nameFr: "Ifrane", nameEn: "Ifrane" },
    { code: "03.591", regionCode: "03", kind: "province", nameFr: "Moulay Yacoub", nameEn: "Moulay Yacoub" },
    { code: "03.451", regionCode: "03", kind: "province", nameFr: "Sefrou", nameEn: "Sefrou" },
    { code: "03.131", regionCode: "03", kind: "province", nameFr: "Boulemane", nameEn: "Boulemane" },
    { code: "03.531", regionCode: "03", kind: "province", nameFr: "Taounate", nameEn: "Taounate" },
    { code: "03.561", regionCode: "03", kind: "province", nameFr: "Taza", nameEn: "Taza" },
    { code: "04.421", regionCode: "04", kind: "prefecture", nameFr: "Rabat", nameEn: "Rabat" },
    { code: "04.441", regionCode: "04", kind: "prefecture", nameFr: "Salé", nameEn: "Salé" },
    { code: "04.501", regionCode: "04", kind: "prefecture", nameFr: "Skhirate-Témara", nameEn: "Skhirate-Témara" },
    { code: "04.281", regionCode: "04", kind: "province", nameFr: "Kénitra", nameEn: "Kénitra" },
    { code: "04.291", regionCode: "04", kind: "province", nameFr: "Khémisset", nameEn: "Khémisset" },
    { code: "04.481", regionCode: "04", kind: "province", nameFr: "Sidi Kacem", nameEn: "Sidi Kacem" },
    { code: "04.491", regionCode: "04", kind: "province", nameFr: "Sidi Slimane", nameEn: "Sidi Slimane" },
    { code: "05.091", regionCode: "05", kind: "province", nameFr: "Béni Mellal", nameEn: "Béni Mellal" },
    { code: "05.081", regionCode: "05", kind: "province", nameFr: "Azilal", nameEn: "Azilal" },
    { code: "05.255", regionCode: "05", kind: "province", nameFr: "Fquih Ben Salah", nameEn: "Fquih Ben Salah" },
    { code: "05.301", regionCode: "05", kind: "province", nameFr: "Khénifra", nameEn: "Khénifra" },
    { code: "05.311", regionCode: "05", kind: "province", nameFr: "Khouribga", nameEn: "Khouribga" },
    { code: "06.141", regionCode: "06", kind: "prefecture", nameFr: "Casablanca", nameEn: "Casablanca" },
    { code: "06.371", regionCode: "06", kind: "prefecture", nameFr: "Mohammadia", nameEn: "Mohammadia" },
    { code: "06.181", regionCode: "06", kind: "province", nameFr: "El Jadida", nameEn: "El Jadida" },
    { code: "06.385", regionCode: "06", kind: "province", nameFr: "Nouaceur", nameEn: "Nouaceur" },
    { code: "06.355", regionCode: "06", kind: "province", nameFr: "Médiouna", nameEn: "Médiouna" },
    { code: "06.111", regionCode: "06", kind: "province", nameFr: "Benslimane", nameEn: "Benslimane" },
    { code: "06.117", regionCode: "06", kind: "province", nameFr: "Berrechid", nameEn: "Berrechid" },
    { code: "06.461", regionCode: "06", kind: "province", nameFr: "Settat", nameEn: "Settat" },
    { code: "06.467", regionCode: "06", kind: "province", nameFr: "Sidi Bennour", nameEn: "Sidi Bennour" },
    { code: "07.351", regionCode: "07", kind: "prefecture", nameFr: "Marrakech", nameEn: "Marrakech" },
    { code: "07.161", regionCode: "07", kind: "province", nameFr: "Chichaoua", nameEn: "Chichaoua" },
    { code: "07.041", regionCode: "07", kind: "province", nameFr: "Al Haouz", nameEn: "Al Haouz" },
    { code: "07.191", regionCode: "07", kind: "province", nameFr: "El Kelâa Des-Sraghna", nameEn: "El Kelâa Des-Sraghna" },
    { code: "07.211", regionCode: "07", kind: "province", nameFr: "Essaouira", nameEn: "Essaouira" },
    { code: "07.427", regionCode: "07", kind: "province", nameFr: "Rehamna", nameEn: "Rehamna" },
    { code: "07.431", regionCode: "07", kind: "province", nameFr: "Safi", nameEn: "Safi" },
    { code: "07.585", regionCode: "07", kind: "province", nameFr: "Youssoufia", nameEn: "Youssoufia" },
    { code: "08.201", regionCode: "08", kind: "province", nameFr: "Errachidia", nameEn: "Errachidia" },
    { code: "08.401", regionCode: "08", kind: "province", nameFr: "Ouarzazate", nameEn: "Ouarzazate" },
    { code: "08.363", regionCode: "08", kind: "province", nameFr: "Midelt", nameEn: "Midelt" },
    { code: "08.577", regionCode: "08", kind: "province", nameFr: "Tinghir", nameEn: "Tinghir" },
    { code: "08.587", regionCode: "08", kind: "province", nameFr: "Zagora", nameEn: "Zagora" },
    { code: "09.001", regionCode: "09", kind: "prefecture", nameFr: "Agadir-Ida-Ou-Tanane", nameEn: "Agadir-Ida-Ou-Tanane" },
    { code: "09.273", regionCode: "09", kind: "prefecture", nameFr: "Inezgane-Aït Melloul", nameEn: "Inezgane-Aït Melloul" },
    { code: "09.163", regionCode: "09", kind: "province", nameFr: "Chtouka-Aït Baha", nameEn: "Chtouka-Aït Baha" },
    { code: "09.541", regionCode: "09", kind: "province", nameFr: "Taroudannt", nameEn: "Taroudannt" },
    { code: "09.581", regionCode: "09", kind: "province", nameFr: "Tiznit", nameEn: "Tiznit" },
    { code: "09.551", regionCode: "09", kind: "province", nameFr: "Tata", nameEn: "Tata" },
    { code: "10.261", regionCode: "10", kind: "province", nameFr: "Guelmim", nameEn: "Guelmim" },
    { code: "10.071", regionCode: "10", kind: "province", nameFr: "Assa-Zag", nameEn: "Assa-Zag" },
    { code: "10.521", regionCode: "10", kind: "province", nameFr: "Tan-Tan", nameEn: "Tan-Tan" },
    { code: "10.473", regionCode: "10", kind: "province", nameFr: "Sidi Ifni", nameEn: "Sidi Ifni" },
    { code: "11.321", regionCode: "11", kind: "province", nameFr: "Laâyoune", nameEn: "Laâyoune" },
    { code: "11.121", regionCode: "11", kind: "province", nameFr: "Boujdour", nameEn: "Boujdour" },
    { code: "11.537", regionCode: "11", kind: "province", nameFr: "Tarfaya", nameEn: "Tarfaya" },
    { code: "11.221", regionCode: "11", kind: "province", nameFr: "Es-Semara", nameEn: "Es-Semara" },
    { code: "12.391", regionCode: "12", kind: "province", nameFr: "Oued Ed-Dahab", nameEn: "Oued Ed-Dahab" },
    { code: "12.066", regionCode: "12", kind: "province", nameFr: "Aousserd", nameEn: "Aousserd" },
  ] as const satisfies readonly ProvinceDefinition[]).map((province) => Object.freeze(province)),
);

export type ProvinceCode = (typeof MOROCCO_PROVINCES)[number]["code"];
