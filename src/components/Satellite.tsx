import React, { useEffect, useState } from "react";
import type { Hole } from "../store";

export { geographicPoint, satelliteTiles, satelliteZoom } from "../satellite-geometry";
import { satelliteTiles, satelliteZoom, type MapFrame } from "../satellite-geometry";
import { Capacitor } from "@capacitor/core";
import { GoogleSatellite } from "./GoogleSatellite";
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

export function Satellite({ hole, frame, onAttribution }: { hole: Hole; frame: MapFrame; onAttribution: (text: string) => void }) {
  return Capacitor.getPlatform() === "android"
    ? <GoogleSatellite hole={hole} frame={frame} onAttribution={onAttribution}/>
    : <EsriSatellite hole={hole} frame={frame} onAttribution={onAttribution}/>;
}

function EsriSatellite({ hole, frame, onAttribution }: { hole: Hole; frame: MapFrame; onAttribution: (text: string) => void }) {
  const key = JSON.stringify([hole.tee, hole.mapBearing, frame]);
  const [images, setImages] = useState<{ tile: Tile; url: string }[]>([]);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController(),
      urls: string[] = [];
    onAttribution("");
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
      onAttribution("Imagery © Esri, Maxar, Earthstar Geographics");
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

    </g>
  );
}
