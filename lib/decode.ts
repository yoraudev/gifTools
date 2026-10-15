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

/** Scales width and height so the longest side is `size` */
export function fitSize(width: number, height: number, size: number) {
    const scale = size / Math.max(width, height);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    };
}
