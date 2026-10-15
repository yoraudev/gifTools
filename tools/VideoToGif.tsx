/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { showToast, useEffect, useMemo, useState } from "@webpack/common";

import { GifResult, useGifEncoder } from "../components/GifResult";
import { MediaInput, Progress, Range, TextField } from "../components/Inputs";
import { Captions, drawCaptions, hasCaptions } from "../lib/caption";
import { fitSize, MAX_FRAMES } from "../lib/decode";
import { settings } from "../settings";
import { cl, errorMessage, gifFileName, ToolProps } from "../utils";

function waitFor(video: HTMLVideoElement, event: string) {
    return new Promise<void>((resolve, reject) => {
        const onError = () => reject(new Error("Couldn't load the video"));
        video.addEventListener(event, () => {
            video.removeEventListener("error", onError);
            resolve();
        }, { once: true });
        video.addEventListener("error", onError, { once: true });
    });
}

async function extractFrames(src: string, start: number, count: number, fps: number, width: number, height: number, onProgress: (p: number) => void) {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = src;
    await waitFor(video, "loadeddata");

    const frames: ImageBitmap[] = [];
    for (let i = 0; i < count; i++) {
        // the tiny offset makes sure a seek (and its seeked event) happens even for the current time
        video.currentTime = start + i / fps + 0.001;
        await waitFor(video, "seeked");
        frames.push(await createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" }));
        onProgress(i / count);
    }

    video.removeAttribute("src");
    video.load();
    return frames;
}

const formatTime = (s: number) => `${s.toFixed(1)}s`;

export function VideoToGif({ onClose, initialFiles }: ToolProps) {
    const [file, setFile] = useState<File | null>(initialFiles?.[0] ?? null);
    const [meta, setMeta] = useState({ duration: 0, width: 0, height: 0 });
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState(0);
    const [fps, setFps] = useState(15);
    const [size, setSize] = useState(settings.store.defaultSize);
    const [speed, setSpeed] = useState(1);
    const [captions, setCaptions] = useState<Captions>({ top: "", bottom: "" });
    const [extracting, setExtracting] = useState<number | null>(null);
    const { encode, progress, output, busy } = useGifEncoder();

    const url = useMemo(() => file && URL.createObjectURL(file), [file]);
    useEffect(() => () => {
        if (url) URL.revokeObjectURL(url);
    }, [url]);

    const frameCount = Math.max(1, Math.round((end - start) * fps));
    const tooLong = frameCount > MAX_FRAMES;

    const create = async () => {
        if (!url) return;

        const { width, height } = fitSize(meta.width, meta.height, size);
        let frames: ImageBitmap[] = [];
        try {
            setExtracting(0);
            frames = await extractFrames(url, start, frameCount, fps, width, height, setExtracting);
        } catch (e) {
            showToast({ text: errorMessage(e), variant: "critical" });
            return;
        } finally {
            setExtracting(null);
        }

        const withCaptions = hasCaptions(captions);
        await encode({
            width,
            height,
            frameCount: frames.length,
            delay: () => 1000 / fps / speed,
            draw(ctx, i, w, h) {
                ctx.drawImage(frames[i], 0, 0, w, h);
                if (withCaptions) drawCaptions(ctx, captions, w, h);
            }
        }, gifFileName(file!.name));

        frames.forEach(f => f.close());
    };

    return (
        <div className={cl("tool")}>
            <MediaInput
                accept="video/*"
                hint={file ? `${file.name}. Drop or paste another video to replace it.` : "Paste, drop or choose a short video (mp4, webm, mov...)."}
                onFiles={([f]) => setFile(f)}
            />

            {url && (
                <video
                    className={cl("preview")}
                    src={url}
                    controls
                    muted
                    onLoadedMetadata={e => {
                        const { duration, videoWidth, videoHeight } = e.currentTarget;
                        setMeta({ duration, width: videoWidth, height: videoHeight });
                        setStart(0);
                        setEnd(Math.min(duration, 5));
                    }}
                />
            )}

            {meta.duration > 0 && (
                <>
                    <Range label="Start" value={start} min={0} max={meta.duration} step={0.1} format={formatTime} onChange={v => {
                        setStart(v);
                        if (end <= v) setEnd(Math.min(meta.duration, v + 1));
                    }} />
                    <Range label="End" value={end} min={0} max={meta.duration} step={0.1} format={formatTime} onChange={v => setEnd(Math.max(v, start + 0.1))} />
                    <Range label="FPS" value={fps} min={5} max={30} onChange={setFps} />
                    <Range label="Size" value={size} min={64} max={512} step={16} suffix="px" onChange={setSize} />
                    <Range label="Speed" value={speed} min={0.25} max={4} step={0.25} suffix="×" onChange={setSpeed} />

                    <div className={cl("grid")}>
                        <TextField label="Top text" value={captions.top} onChange={top => setCaptions(c => ({ ...c, top }))} />
                        <TextField label="Bottom text" value={captions.bottom} onChange={bottom => setCaptions(c => ({ ...c, bottom }))} />
                    </div>

                    <Paragraph className={cl("muted")}>
                        {frameCount} frames{tooLong && ` — that's too many, the limit is ${MAX_FRAMES}. Shorten the clip or lower the FPS.`}
                    </Paragraph>

                    <Button disabled={tooLong || busy || extracting != null} onClick={create}>
                        Create GIF
                    </Button>
                </>
            )}

            {extracting != null && <Progress value={extracting} />}
            <GifResult progress={progress} output={output} onClose={onClose} />
        </div>
    );
}
