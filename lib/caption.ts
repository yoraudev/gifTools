/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface Captions {
    top: string;
    bottom: string;
}

const FONT = '"Impact", "Anton", "Arial Black", sans-serif';
const MAX_LINES = 3;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const lines: string[] = [];
    let line = "";

    for (const word of text.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);

    return lines;
}

function layout(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
    const maxWidth = w * 0.94;
    let size = Math.round(h / 7);

    while (true) {
        ctx.font = `${size}px ${FONT}`;
        const lines = wrap(ctx, text, maxWidth);
        const fits = lines.length <= MAX_LINES && lines.every(l => ctx.measureText(l).width <= maxWidth);
        if (fits || size <= 10) return { size, lines };
        size -= 2;
    }
}

function drawBlock(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, position: "top" | "bottom") {
    text = text.trim().toUpperCase();
    if (!text) return;

    const { size, lines } = layout(ctx, text, w, h);
    const lineHeight = size * 1.05;
    const margin = h * 0.03;
    const startY = position === "top"
        ? margin
        : h - margin - lineHeight * lines.length;

    ctx.save();
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size / 7);
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#fff";

    lines.forEach((line, i) => {
        const y = startY + i * lineHeight;
        ctx.strokeText(line, w / 2, y);
        ctx.fillText(line, w / 2, y);
    });
    ctx.restore();
}

export function drawCaptions(ctx: CanvasRenderingContext2D, captions: Captions, w: number, h: number) {
    drawBlock(ctx, captions.top, w, h, "top");
    drawBlock(ctx, captions.bottom, w, h, "bottom");
}

export function hasCaptions(captions: Captions) {
    return !!(captions.top.trim() || captions.bottom.trim());
}
