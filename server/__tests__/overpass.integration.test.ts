import { searchOverpass, OverpassError } from "../overpass";

// Unit test for the Overpass client — global `fetch` is mocked, so no real
// network call (Overpass must never be hit in CI). Covers response parsing +
// error mapping. No DB.

const realFetch = global.fetch;
afterAll(() => {
  global.fetch = realFetch;
});

function mockFetch(impl: () => Promise<unknown>) {
  global.fetch = jest.fn(impl) as unknown as typeof fetch;
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("searchOverpass", () => {
  it("parses nodes + ways(center), builds address, tags the searched category", async () => {
    mockFetch(async () =>
      okJson({
        elements: [
          {
            type: "node",
            id: 1,
            lat: 52.23,
            lon: 21.01,
            tags: {
              name: "Tęczowa Kawiarnia",
              "addr:street": "Marszałkowska",
              "addr:housenumber": "10",
              "addr:city": "Warszawa",
            },
          },
          {
            type: "way",
            id: 2,
            center: { lat: 52.24, lon: 21.02 },
            tags: { name: "Klub Więź" },
          },
        ],
      }),
    );
    const out = await searchOverpass("Warszawa", "cafe");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      osmId: "node/1",
      name: "Tęczowa Kawiarnia",
      category: "cafe", // the searched category, regardless of OSM tag
      address: "Marszałkowska 10, Warszawa",
      latitude: 52.23,
      longitude: 21.01,
    });
    expect(out[1]).toMatchObject({ osmId: "way/2", latitude: 52.24 });
    expect(out[1].address).toBeNull();
  });

  it("matches the city across native + English name tags, case-insensitively", async () => {
    // Capture the Overpass QL sent so we can assert the area lookup accepts an
    // English name like "Warsaw" (OSM stores it as name:en, not name).
    let sentBody = "";
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return okJson({ elements: [] });
    }) as unknown as typeof fetch;

    await searchOverpass("Warsaw", "cafe");
    expect(sentBody).toContain('"name:en"'); // English name tag queried
    expect(sentBody).toContain('"alt_name"'); // alternate spellings too
    expect(sentBody).toContain("Warsaw"); // the admin's term, matched literally
    expect(sentBody).toMatch(/,i\]/); // case-insensitive area match
  });

  it("regex-escapes the city so metacharacters are matched literally", async () => {
    let sentBody = "";
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return okJson({ elements: [] });
    }) as unknown as typeof fetch;

    await searchOverpass("A.B (C)", "cafe");
    // The dot/parens are regex-escaped (\. \( \)) so they match literally; each
    // escape backslash is then doubled for the QL string literal → "\\." etc.
    expect(sentBody).toContain("A\\\\.B \\\\(C\\\\)");
  });

  it("drops elements without a name or without coordinates", async () => {
    mockFetch(async () =>
      okJson({
        elements: [
          { type: "node", id: 1, lat: 52, lon: 21, tags: {} }, // no name
          { type: "node", id: 2, tags: { name: "No Coords" } }, // no coords
          { type: "node", id: 3, lat: 52, lon: 21, tags: { name: "Keep" } },
        ],
      }),
    );
    const out = await searchOverpass("Kraków", "bar");
    expect(out.map((c) => c.name)).toEqual(["Keep"]);
  });

  it("throws OverpassError only after every retry attempt is exhausted", async () => {
    // A backend that always 429s — the client should retry across attempts and
    // only then surface the error (never on the first failure alone).
    let calls = 0;
    mockFetch(async () => {
      calls++;
      return { ok: false, status: 429 } as Response;
    });
    await expect(searchOverpass("Gdańsk", "club")).rejects.toBeInstanceOf(
      OverpassError,
    );
    expect(calls).toBeGreaterThan(1); // retried, not a single-shot failure
  });

  it("retries a transient failure, then succeeds on the next attempt", async () => {
    // First backend is busy (504); the retry lands on a healthy one — the admin
    // gets results without having to click search again.
    let calls = 0;
    mockFetch(async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 504 } as Response;
      return okJson({
        elements: [
          { type: "node", id: 7, lat: 52, lon: 21, tags: { name: "Retry OK" } },
        ],
      });
    });
    const out = await searchOverpass("Warszawa", "cafe");
    expect(out.map((c) => c.name)).toEqual(["Retry OK"]);
    expect(calls).toBe(2);
  });

  it("throws OverpassError when fetch rejects (network/timeout)", async () => {
    mockFetch(async () => {
      throw new Error("aborted");
    });
    await expect(searchOverpass("Łódź", "health")).rejects.toBeInstanceOf(
      OverpassError,
    );
  });

  it("throws OverpassError on malformed JSON", async () => {
    mockFetch(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("bad json");
          },
        }) as unknown as Response,
    );
    await expect(searchOverpass("Poznań", "education")).rejects.toBeInstanceOf(
      OverpassError,
    );
  });
});
