/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GIFEncoder, nearestColorIndex, quantize } from "gifenc";

export interface GifSpec {
    width: number;
    height: number;
    frameCount: number;
    /** Delay of frame i in ms */
    delay(i: number): number;
    draw(ctx: CanvasRenderingContext2D, i: number, width: number, height: number): void;
}

export interface EncodeOptions {
    maxBytes?: number;
    fileName?: string;
    onProgress?(progress: number): void;
}

const TRANSPARENT_INDEX = 255;
const PALETTE_SAMPLE_FRAMES = 12;
// Frame delays < 20ms don't function correctly on chromium and firefox
const MIN_DELAY = 20;

const nextTick = () => new Promise(r => setTimeout(r, 0));

function rgb565(r: number, g: number, b: number) {
    return ((r << 8) & 0xf800) | ((g << 3) & 0x07e0) | (b >> 3);
}

function buildPalette(frames: ImageData[]) {
    const step = Math.max(1, Math.floor(frames.length / PALETTE_SAMPLE_FRAMES));
    const sampled = frames.filter((_, i) => i % step === 0).slice(0, PALETTE_SAMPLE_FRAMES);

    const sample = new Uint8ClampedArray(sampled.reduce((n, f) => n + f.data.length, 0));
    let offset = 0;
    for (const { data } of sampled) {
        sample.set(data, offset);
        offset += data.length;
    }

    const palette = quantize(sample, 255);
    // gifenc sizes the colour table to the palette, so pad it to make index 255 always exist for transparency
    while (palette.length < 256) palette.push([0, 0, 0]);
    return palette;
}

function indexFrame(data: Uint8ClampedArray, colors: number[][], cache: number[]) {
    const index = new Uint8Array(data.length / 4);

    for (let i = 0; i < index.length; i++) {
        const r = data[4 * i];
        const g = data[4 * i + 1];
        const b = data[4 * i + 2];

        if (data[4 * i + 3] < 128) {
            index[i] = TRANSPARENT_INDEX;
        } else {
            const key = rgb565(r, g, b);
            index[i] = cache[key] ?? (cache[key] = nearestColorIndex(colors, [r, g, b]));
        }
    }

    return index;
}

async function encodeOnce(spec: GifSpec, width: number, height: number, onProgress?: (p: number) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const frames: ImageData[] = [];
    for (let i = 0; i < spec.frameCount; i++) {
        ctx.clearRect(0, 0, width, height);
        spec.draw(ctx, i, width, height);
        frames.push(ctx.getImageData(0, 0, width, height));

        onProgress?.(i / spec.frameCount * 0.3);
        if (i % 4 === 0) await nextTick();
    }

    const palette = buildPalette(frames);
    const colors = palette.slice(0, TRANSPARENT_INDEX);
    const cache: number[] = new Array(2 ** 16);
    const gif = GIFEncoder();

    for (let i = 0; i < frames.length; i++) {
        gif.writeFrame(indexFrame(frames[i].data, colors, cache), width, height, {
            palette: i === 0 ? palette : undefined,
            delay: Math.max(MIN_DELAY, spec.delay(i)),
            transparent: true,
            transparentIndex: TRANSPARENT_INDEX
        });

        onProgress?.(0.3 + i / frames.length * 0.7);
        await nextTick();
    }

    gif.finish();
    return gif.bytes();
}

/**
 * Renders and encodes a GIF. If it ends up bigger than maxBytes, it is re-encoded at a smaller size.
 */
export async function encodeGif(spec: GifSpec, { maxBytes = Infinity, fileName = "gif.gif", onProgress }: EncodeOptions = {}) {
    let { width, height } = spec;

    for (let attempt = 0; attempt < 4; attempt++) {
        const bytes = await encodeOnce(spec, width, height, onProgress);
        if (bytes.length <= maxBytes) {
            onProgress?.(1);
            return new File([bytes.buffer as ArrayBuffer], fileName, { type: "image/gif" });
        }

        const scale = Math.sqrt(maxBytes / bytes.length) * 0.9;
        width = Math.max(16, Math.round(width * scale));
        height = Math.max(16, Math.round(height * scale));
    }

    throw new Error("The GIF is too big even after shrinking it. Try fewer frames or a smaller size.");
}
