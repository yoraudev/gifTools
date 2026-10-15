/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { showToast, useEffect, useState } from "@webpack/common";

import { addToFavorites, GifResult, useGifEncoder } from "../components/GifResult";
import { Checkbox, Chips, MediaInput, Range, TextField } from "../components/Inputs";
import { Captions, drawCaptions, hasCaptions } from "../lib/caption";
import { closeSource, fitSize, loadSource, Source } from "../lib/decode";
import { EffectId, EFFECTS } from "../lib/effects";
import { GifSpec } from "../lib/encode";
import { settings } from "../settings";
import { cl, errorMessage, gifFileName, sizeLabel, ToolProps } from "../utils";

const EFFECT_NAMES = Object.fromEntries(
    Object.entries(EFFECTS).map(([id, effect]) => [id, effect.name])
) as Record<EffectId, string>;

interface Options {
    effect: EffectId;
    captions: Captions;
    size: number;
    frames: number;
    delay: number;
    speed: number;
    reverse: boolean;
}

export function defaultOptions(): Options {
    return {
        effect: "none",
        captions: { top: "", bottom: "" },
        size: settings.store.gifSize,
        frames: 20,
        delay: Math.max(20, settings.store.defaultDelay),
        speed: 1,
        reverse: false
    };
}

export function buildSpec(source: Source, { effect, captions, size, frames, delay, speed, reverse }: Options): GifSpec {
    const frameCount = source.animated
        ? source.frames.length
        : effect === "none" ? 1 : frames;
    const { width, height } = fitSize(source.width, source.height, size, frameCount);
    const at = (i: number) => reverse ? frameCount - 1 - i : i;
    const withCaptions = hasCaptions(captions);

    return {
        width,
        height,
        frameCount,
        delay: i => (source.animated ? source.frames[at(i)].delay : delay) / speed,
        draw(ctx, i, w, h) {
            const j = at(i);
            const { image } = source.frames[source.animated ? j : 0];

            EFFECTS[effect].draw(ctx, image, j / frameCount, w, h);
            if (withCaptions) drawCaptions(ctx, captions, w, h);
        }
    };
}

export function ImageToGif({ onClose, initialFiles, initialEffect }: ToolProps) {
    const [source, setSource] = useState<Source | null>(null);
    const [name, setName] = useState("image");
    const [options, setOptions] = useState(() => ({ ...defaultOptions(), effect: initialEffect ?? "none" }));
    const { encode, progress, output, busy } = useGifEncoder();

    useEffect(() => () => closeSource(source), [source]);

    const set = <K extends keyof Options>(key: K) => (value: Options[K]) => setOptions(o => ({ ...o, [key]: value }));
    const setCaption = (key: keyof Captions) => (value: string) => setOptions(o => ({ ...o, captions: { ...o.captions, [key]: value } }));

    const fileName = gifFileName(name);

    const onFiles = async ([file]: File[], pasted: boolean, createNow = false) => {
        try {
            const loaded = await loadSource(file);
            setSource(loaded);
            setName(file.name);

            const favorite = pasted && settings.store.autoFavoriteOnPaste;
            if (favorite || createNow) {
                const result = await encode(buildSpec(loaded, options), gifFileName(file.name));
                if (result && favorite) await addToFavorites(result);
            }
        } catch (e) {
            showToast({ text: `Couldn't load the image: ${errorMessage(e)}`, variant: "critical" });
        }
    };

    useEffect(() => {
        // with a preselected effect, show the result right away
        if (initialFiles?.length) onFiles(initialFiles, false, initialEffect != null);
    }, []);

    const animates = source?.animated || options.effect !== "none";

    return (
        <div className={cl("tool")}>
            <MediaInput
                accept="image/*"
                hint={source
                    ? `${name} · ${source.width}×${source.height}${source.animated ? ` · ${source.frames.length} frames` : ""}. Paste or drop another image to replace it.`
                    : "Paste (Ctrl+V), drop or choose an image. Animated GIFs work too."}
                onFiles={onFiles}
            />

            <Chips label="Effect" value={options.effect} options={EFFECT_NAMES} onChange={set("effect")} />

            <div className={cl("grid")}>
                <TextField label="Top text" value={options.captions.top} onChange={setCaption("top")} />
                <TextField label="Bottom text" value={options.captions.bottom} onChange={setCaption("bottom")} />
            </div>

            <Range label="Size" value={options.size} min={0} max={1024} step={32} format={sizeLabel} onChange={set("size")} />
            {!source?.animated && options.effect !== "none" && (
                <>
                    <Range label="Frames" value={options.frames} min={4} max={60} onChange={set("frames")} />
                    <Range label="Frame delay" value={options.delay} min={20} max={500} step={10} suffix="ms" onChange={set("delay")} />
                </>
            )}
            {animates && (
                <>
                    <Range label="Speed" value={options.speed} min={0.25} max={4} step={0.25} suffix="×" onChange={set("speed")} />
                    <Checkbox label="Play in reverse" value={options.reverse} onChange={set("reverse")} />
                </>
            )}

            {!animates && source && (
                <Paragraph className={cl("muted")}>Without an effect the GIF is a single still frame.</Paragraph>
            )}

            <div className={cl("row")}>
                <Button disabled={!source || busy} onClick={() => encode(buildSpec(source!, options), fileName)}>
                    Create GIF
                </Button>
                <Button
                    variant="positive"
                    disabled={!source || busy}
                    onClick={async () => {
                        const result = await encode(buildSpec(source!, options), fileName);
                        if (result) await addToFavorites(result);
                    }}
                >
                    Create & add to favorites
                </Button>
            </div>

            <GifResult progress={progress} output={output} onClose={onClose} />
        </div>
    );
}
