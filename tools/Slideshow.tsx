/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { showToast, useEffect, useRef, useState } from "@webpack/common";

import { GifResult, useGifEncoder } from "../components/GifResult";
import { Checkbox, MediaInput, Range } from "../components/Inputs";
import { fitSize } from "../lib/decode";
import { settings } from "../settings";
import { cl, errorMessage, sizeLabel, ToolProps } from "../utils";

const FADE_STEPS = 6;
const FADE_DELAY = 40;

interface Slide {
    id: number;
    bitmap: ImageBitmap;
    url: string;
}

let nextId = 0;

function drawContained(ctx: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number) {
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function Slideshow({ onClose, initialFiles }: ToolProps) {
    const [slides, setSlides] = useState<Slide[]>([]);
    const [hold, setHold] = useState(1000);
    const [fade, setFade] = useState(true);
    const [size, setSize] = useState(settings.store.gifSize);
    const { encode, progress, output, busy } = useGifEncoder();

    const slidesRef = useRef(slides);
    slidesRef.current = slides;
    useEffect(() => () => slidesRef.current.forEach(s => {
        s.bitmap.close();
        URL.revokeObjectURL(s.url);
    }), []);

    const addFiles = async (files: File[]) => {
        try {
            const added = await Promise.all(files.map(async file => ({
                id: nextId++,
                bitmap: await createImageBitmap(file),
                url: URL.createObjectURL(file)
            })));
            setSlides(s => [...s, ...added]);
        } catch (e) {
            showToast({ text: `Couldn't load an image: ${errorMessage(e)}`, variant: "critical" });
        }
    };

    useEffect(() => {
        if (initialFiles?.length) addFiles(initialFiles);
    }, []);

    const remove = (slide: Slide) => {
        slide.bitmap.close();
        URL.revokeObjectURL(slide.url);
        setSlides(s => s.filter(x => x !== slide));
    };

    const move = (index: number, by: number) => setSlides(s => {
        const copy = [...s];
        [copy[index], copy[index + by]] = [copy[index + by], copy[index]];
        return copy;
    });

    const create = () => {
        const frames: { from: number; to: number; alpha: number; delay: number; }[] = [];
        slides.forEach((_, i) => {
            frames.push({ from: i, to: i, alpha: 0, delay: hold });
            if (fade && slides.length > 1) {
                for (let step = 1; step <= FADE_STEPS; step++)
                    frames.push({ from: i, to: (i + 1) % slides.length, alpha: step / (FADE_STEPS + 1), delay: FADE_DELAY });
            }
        });

        const { width, height } = fitSize(slides[0].bitmap.width, slides[0].bitmap.height, size, frames.length);
        encode({
            width,
            height,
            frameCount: frames.length,
            delay: i => frames[i].delay,
            draw(ctx, i, w, h) {
                const { from, to, alpha } = frames[i];
                drawContained(ctx, slides[from].bitmap, w, h);
                if (alpha) {
                    ctx.globalAlpha = alpha;
                    drawContained(ctx, slides[to].bitmap, w, h);
                    ctx.globalAlpha = 1;
                }
            }
        }, "slideshow.gif");
    };

    return (
        <div className={cl("tool")}>
            <MediaInput
                accept="image/*"
                multiple
                hint="Paste, drop or choose images. Each one becomes a slide."
                onFiles={addFiles}
            />

            {slides.length > 0 && (
                <div className={cl("slides")}>
                    {slides.map((slide, i) => (
                        <div key={slide.id} className={cl("slide")}>
                            <img src={slide.url} alt={`Slide ${i + 1}`} />
                            <div className={cl("slide-buttons")}>
                                <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move left">◀</button>
                                <button onClick={() => remove(slide)} aria-label="Remove">✕</button>
                                <button disabled={i === slides.length - 1} onClick={() => move(i, 1)} aria-label="Move right">▶</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Range label="Time per slide" value={hold} min={200} max={5000} step={100} suffix="ms" onChange={setHold} />
            <Range label="Size" value={size} min={0} max={1024} step={32} format={sizeLabel} onChange={setSize} />
            <Checkbox label="Fade between slides" value={fade} onChange={setFade} />

            <Button disabled={!slides.length || busy} onClick={create}>
                Create GIF
            </Button>

            <GifResult progress={progress} output={output} onClose={onClose} />
        </div>
    );
}
