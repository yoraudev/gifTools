/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const MAX_FRAMES = 300;

export interface SourceFrame {
    image: ImageBitmap;
    /** in ms */
    delay: number;
}

export interface Source {
    frames: SourceFrame[];
    width: number;
    height: number;
    animated: boolean;
}

const ANIMATED_TYPES = ["image/gif", "image/webp", "image/apng", "image/png"];

async function decodeAnimated(file: Blob): Promise<SourceFrame[] | null> {
    if (typeof ImageDecoder === "undefined" || !ANIMATED_TYPES.includes(file.type)) return null;
    if (!await ImageDecoder.isTypeSupported(file.type)) return null;

    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
    try {
        await decoder.tracks.ready;
        const track = decoder.tracks.selectedTrack;
        if (!track?.animated || track.frameCount < 2) return null;

        const frames: SourceFrame[] = [];
        const count = Math.min(track.frameCount, MAX_FRAMES);
        for (let i = 0; i < count; i++) {
            const { image } = await decoder.decode({ frameIndex: i });
            frames.push({
                image: await createImageBitmap(image),
                // VideoFrame durations are in microseconds
                delay: Math.max(20, Math.round((image.duration ?? 100_000) / 1000))
            });
            image.close();
        }
        return frames;
    } finally {
        decoder.close();
    }
}

export async function loadSource(file: Blob): Promise<Source> {
    const animated = await decodeAnimated(file).catch(() => null);
    const frames = animated ?? [{ image: await createImageBitmap(file), delay: 100 }];

    return {
        frames,
        width: frames[0].image.width,
        height: frames[0].image.height,
        animated: animated != null
    };
}

export function closeSource(source: Source | null | undefined) {
    source?.frames.forEach(f => f.image.close());
}

/** Longest side used when keeping the original size. Discord shows images in chat at most around 550px wide */
export const MAX_SIDE = 1024;
/** Pixels of all frames together, keeps memory use and encoding time in check */
const PIXEL_BUDGET = 30_000_000;

/**
 * Scales width and height so the longest side is `size`, or keeps the original size (up to MAX_SIDE) if `size` is 0.
 * Animations with many frames are scaled down further to stay within the pixel budget.
 */
export function fitSize(width: number, height: number, size: number, frameCount = 1) {
    let scale = size > 0
        ? Math.min(size, MAX_SIDE) / Math.max(width, height)
        : Math.min(1, MAX_SIDE / Math.max(width, height));

    const pixels = width * height * scale * scale * frameCount;
    if (pixels > PIXEL_BUDGET) scale *= Math.sqrt(PIXEL_BUDGET / pixels);

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    };
}
