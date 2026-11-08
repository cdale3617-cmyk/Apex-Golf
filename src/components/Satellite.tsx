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
export function satelliteZoom(hole: Hole, frame: MapFrame) {
  if (!hole.tee) return 14;
  return Math.max(
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
}
export function satelliteTiles(
  hole: Hole,
  frame: MapFrame,
  zoom = satelliteZoom(hole, frame),
) {
  if (!hole.tee || hole.mapBearing === undefined) return [];
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

/** Esri can return a grey no-data picture with HTTP 200. */
export function unavailablePixels(data: ArrayLike<number>): boolean {
  let opaque = 0,
    neutral = 0,
    flat = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 240) continue;
    opaque++;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 5) {
      neutral++;
      if (r > 170 && r < 240) flat++;
    }
  }
  return opaque === 0 || (neutral / opaque > 0.96 && flat / opaque > 0.7);
}

async function availableTile(blob: Blob): Promise<boolean> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw Error("Satellite image could not be checked.");
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    try {
      context.drawImage(bitmap, 0, 0, 64, 64);
    } finally {
      bitmap.close();
    }
  } else {
    const url = URL.createObjectURL(blob),
      image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(Error("Satellite image could not be decoded."));
        image.src = url;
      });
      context.drawImage(image, 0, 0, 64, 64);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return !unavailablePixels(context.getImageData(0, 0, 64, 64).data);
}

type Tile = ReturnType<typeof satelliteTiles>[number];
export async function loadSatelliteFrame<T>(
  hole: Hole,
  frame: MapFrame,
  loadTile: (tile: Tile) => Promise<T>,
  signal: AbortSignal,
) {
  if (!hole.tee || hole.mapBearing === undefined)
    throw Error("Satellite needs a mapped tee.");
  for (let zoom = satelliteZoom(hole, frame); zoom >= 14; zoom--) {
    if (signal.aborted) throw Error("Satellite loading stopped.");
    const tiles = satelliteTiles(hole, frame, zoom);
    if (!tiles.length) continue;
    const results = await Promise.allSettled(tiles.map(loadTile));
    if (signal.aborted) throw Error("Satellite loading stopped.");
    if (results.every((result) => result.status === "fulfilled")) {
      return {
        tiles,
        images: results.map(
          (result) => (result as PromiseFulfilledResult<T>).value,
        ),
      };
    }
  }
  throw Error("Satellite unavailable here. Try again online or use Map.");
}

export function Satellite({ hole, frame }: { hole: Hole; frame: MapFrame }) {
  const key = JSON.stringify([hole.tee, hole.mapBearing, frame]);
  const [images, setImages] = useState<{ tile: Tile; url: string }[]>([]);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController(),
      urls: string[] = [];
    setImages([]);
    setProblem("");
    void (async () => {
      const cache =
        typeof caches === "undefined"
          ? null
          : await caches.open("apex-satellite-v1").catch(() => null);
      const result = await loadSatelliteFrame(
        hole,
        frame,
        async (tile) => {
          const cached = await cache?.match(tile.url).catch(() => undefined);
          const response =
            cached ??
            (await fetch(tile.url, {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(10000),
              ]),
            }));
          if (!response.ok) throw Error("Satellite unavailable.");
          const copy = response.clone(),
            blob = await response.blob();
          try {
            if (!(await availableTile(blob)))
              throw Error("Satellite detail unavailable at this zoom.");
          } catch (error) {
            await cache?.delete(tile.url).catch(() => undefined);
            throw error;
          }
          if (!cached) await cache?.put(tile.url, copy).catch(() => undefined);
          return blob;
        },
        controller.signal,
      );
      if (!active) return;
      const complete = result.tiles.map((tile, i) => {
        const url = URL.createObjectURL(result.images[i]);
        urls.push(url);
        return { tile, url };
      });
      setImages(complete);
      const keys = await cache?.keys();
      if (keys && keys.length > 1024)
        await Promise.all(
          keys
            .slice(0, keys.length - 1024)
            .map((request) => cache!.delete(request)),
        );
    })().catch((error) => {
      if (active)
        setProblem(
          error instanceof Error ? error.message : "Satellite unavailable.",
        );
    });
    return () => {
      active = false;
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key]);
  return (
    <g className="satellite-layer" pointerEvents="none">
      {images.map(({ tile, url }) => (
        <image
          key={tile.url}
          href={url}
          width="256.5"
          height="256.5"
          transform={tile.transform}
        />
      ))}
      {(problem || !images.length) && (
        <text x="10" y="22" className="map-status" fontSize="9">
          {problem || "Loading available satellite imagery…"}
        </text>
      )}
      <text x="10" y="508" className="map-status" fontSize="7">
        Imagery © Esri, Maxar, Earthstar Geographics
      </text>
    </g>
  );
}
