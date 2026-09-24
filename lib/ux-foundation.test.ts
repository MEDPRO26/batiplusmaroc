import { describe, expect, test } from "vitest";
import { presentationForQuery } from "./load-state";
import { createSubmitLock } from "./forms/submit";
import fr from "../messages/fr.json";
import en from "../messages/en.json";

describe("presentationForQuery", () => {
  test("shows loading before data and ready after data loads", () => {
    expect(presentationForQuery(undefined)).toBe("loading");
    expect(presentationForQuery([{ id: "1" }])).toBe("ready");
  });

  test("empty collections use the empty state", () => {
    expect(presentationForQuery([])).toBe("empty");
  });
});

describe("createSubmitLock", () => {
  test("blocks a second submit while the first is in flight", () => {
    const lock = createSubmitLock();
    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);
    lock.release();
    expect(lock.tryAcquire()).toBe(true);
  });
});

describe("ux copy", () => {
  test("FR and EN share the same ux keys", () => {
    expect(Object.keys(fr.ux.error.codes).sort()).toEqual(Object.keys(en.ux.error.codes).sort());
    expect(Object.keys(fr.ux.empty).sort()).toEqual(Object.keys(en.ux.empty).sort());
    expect(fr.ux.empty.projects.title).toBe("Vous n’avez pas encore publié de projet.");
    expect(en.ux.empty.projectDiscovery.title).toBe("No projects available yet.");
    expect(fr.ux.empty.projectDiscovery.title).toBe("Aucun projet disponible pour le moment.");
    expect(fr.ux.empty.proposals.title).toBe("Aucune proposition pour le moment.");
    expect(fr.ux.empty.messages.title).toBe("Vos conversations apparaîtront ici.");
    expect(fr.ux.empty.portfolio.title).toBe("Ajoutez votre première réalisation.");
    expect(en.ux.error.generic).toBe("Something went wrong. Please try again.");
  });
});
