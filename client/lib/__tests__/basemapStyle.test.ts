import { buildBasemapStyle } from "@/lib/basemapStyle";

describe("buildBasemapStyle", () => {
  it("builds a v8 style with a fully-qualified pmtiles:// vector source", () => {
    const style = buildBasemapStyle("https://cdn.example/poland.pmtiles") as {
      version: number;
      sources: Record<
        string,
        { type: string; url: string; attribution: string }
      >;
      layers: { id: string }[];
    };
    expect(style.version).toBe(8);
    const src = style.sources.protomaps;
    expect(src.type).toBe("vector");
    // MapLibre Native requires the pmtiles URL fully specified.
    expect(src.url).toBe("pmtiles://https://cdn.example/poland.pmtiles");
    // ODbL attribution rides on the source too.
    expect(src.attribution).toContain("OpenStreetMap");
  });

  it("includes background/water/roads layers (a recognizable basemap)", () => {
    const style = buildBasemapStyle("https://cdn.example/poland.pmtiles") as {
      layers: { id: string }[];
    };
    const ids = style.layers.map((l) => l.id);
    expect(ids).toEqual(
      expect.arrayContaining(["background", "water", "roads"]),
    );
  });
});
