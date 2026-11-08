import React, { useEffect, useState } from "react";
import type { Hole, XY } from "../store";
import type { Pt } from "../geo";
import { localPoint } from "../strategy";

export type MapFrame = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  scale: number;
};
export function geographicPoint(p: XY, tee: Pt, bearing: number): Pt {
  const angle = (bearing * Math.PI) / 180;
  const east = p[0] * Math.cos(angle) + p[1] * Math.sin(angle);
  const north = -p[0] * Math.sin(angle) + p[1] * Math.cos(angle);
  return {
    lat: tee.lat + north / 110540,
    lon: tee.lon + east / (111320 * Math.cos((tee.lat * Math.PI) / 180)),
  };
}
export function satelliteTiles(hole: Hole, frame: MapFrame) {
  if (!hole.tee || hole.mapBearing === undefined) return [];
  const zoom = Math.max(
    14,
    Math.min(
      19,
      Math.ceil(
        Math.log2(
          156543.03 *
            Math.cos((hole.tee.lat * Math.PI) / 180) *
            frame.scale *
            2,
        ),
      ),
    ),
  );
  const size = 256 * 2 ** zoom;
  const world = (p: Pt): XY => [
    ((p.lon + 180) / 360) * size,
    ((1 - Math.asinh(Math.tan((p.lat * Math.PI) / 180)) / Math.PI) / 2) * size,
  ];
  const screen = (wx: number, wy: number): XY => {
    const geo = {
      lon: (wx / size) * 360 - 180,
      lat:
        (Math.atan(Math.sinh(Math.PI * (1 - (2 * wy) / size))) * 180) / Math.PI,
    };
    const p = localPoint(geo, hole.tee!, hole.mapBearing!);
    return [
      160 + (p[0] - (frame.minX + frame.maxX) / 2) * frame.scale,
      270 - (p[1] - (frame.minY + frame.maxY) / 2) * frame.scale,
    ];
  };
  // Cover the full SVG viewport, including the margins around the hole.
  const corners: XY[] = [
    [0, 0],
    [320, 0],
    [320, 540],
    [0, 540],
  ].map(([x, y]) =>
    world(
      geographicPoint(
        [
          (x - 160) / frame.scale + (frame.minX + frame.maxX) / 2,
          (270 - y) / frame.scale + (frame.minY + frame.maxY) / 2,
        ],
        hole.tee!,
        hole.mapBearing!,
      ),
    ),
  );
  const left = Math.floor(Math.min(...corners.map((p) => p[0])) / 256),
    right = Math.floor(Math.max(...corners.map((p) => p[0])) / 256);
  const top = Math.floor(Math.min(...corners.map((p) => p[1])) / 256),
    bottom = Math.floor(Math.max(...corners.map((p) => p[1])) / 256);
  const tiles: { url: string; transform: string }[] = [];
  if ((right - left + 1) * (bottom - top + 1) > 80) return tiles;
  for (let x = left; x <= right; x++)
    for (let y = top; y <= bottom; y++) {
      if (y < 0 || y >= 2 ** zoom) continue;
      const p = screen(x * 256, y * 256),
        a = screen((x + 1) * 256, y * 256),
        b = screen(x * 256, (y + 1) * 256);
      tiles.push({
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom}`,
        transform: `matrix(${(a[0] - p[0]) / 256} ${(a[1] - p[1]) / 256} ${(b[0] - p[0]) / 256} ${(b[1] - p[1]) / 256} ${p[0]} ${p[1]})`,
      });
    }
  return tiles;
}

export function Satellite({ hole, frame }: { hole: Hole; frame: MapFrame }) {
  const tiles = satelliteTiles(hole, frame),
    key = tiles.map((t) => t.url + t.transform).join("|");
  const [images, setImages] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController(),
      urls: string[] = [];
    setImages({});
    setFailed(false);
    const timer = setTimeout(() => controller.abort(), 25000);
    void (async () => {
      const cache =
        typeof caches === "undefined"
          ? null
          : await caches.open("apex-satellite-v1").catch(() => null);
      await Promise.all(
        tiles.map(async (tile) => {
          try {
            let response = await cache?.match(tile.url).catch(() => undefined);
            if (!response) {
              response = await fetch(tile.url, { signal: controller.signal });
              if (!response.ok) throw Error("Satellite unavailable");
              await cache
                ?.put(tile.url, response.clone())
                .catch(() => undefined);
            }
            const url = URL.createObjectURL(await response.blob());
            urls.push(url);
            if (active)
              setImages((previous) => ({ ...previous, [tile.url]: url }));
            else URL.revokeObjectURL(url);
          } catch {
            if (active) setFailed(true);
          }
        }),
      );
      const keys = await cache?.keys();
      if (keys && keys.length > 1024)
        await Promise.all(
          keys
            .slice(0, keys.length - 1024)
            .map((request) => cache!.delete(request)),
        );
      clearTimeout(timer);
    })().catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key]);
  return (
    <g className="satellite-layer" pointerEvents="none">
      {tiles.map(
        (tile) =>
          images[tile.url] && (
            <image
              key={tile.url}
              href={images[tile.url]}
              width="256.5"
              height="256.5"
              transform={tile.transform}
            />
          ),
      )}
      {(!tiles.length || failed || !Object.keys(images).length) && (
        <text x="10" y="22" className="map-status" fontSize="10">
          {!tiles.length
            ? "Satellite needs a mapped tee"
            : failed
              ? "Satellite unavailable here · showing mapped features"
              : "Loading satellite…"}
        </text>
      )}
      <text x="10" y="508" className="map-status" fontSize="7">
        Imagery © Esri, Maxar, Earthstar Geographics
      </text>
    </g>
  );
}
