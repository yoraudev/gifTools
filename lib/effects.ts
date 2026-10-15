/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

type Draw = (ctx: CanvasRenderingContext2D, img: CanvasImageSource, t: number, w: number, h: number) => void;

export interface Effect {
    name: string;
    draw: Draw;
}

const TAU = Math.PI * 2;

function drawTransformed(
    ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number,
    { scaleX = 1, scaleY = 1, rotate = 0, x = 0, y = 0, anchorBottom = false }
) {
    ctx.save();
    ctx.translate(w / 2 + x, (anchorBottom ? h : h / 2) + y);
    ctx.rotate(rotate);
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(img, -w / 2, anchorBottom ? -h : -h / 2, w, h);
    ctx.restore();
}

export const EFFECTS = {
    none: {
        name: "None",
        draw: (ctx, img, _t, w, h) => ctx.drawImage(img, 0, 0, w, h)
    },
    shake: {
        name: "Shake",
        draw: (ctx, img, t, w, h) => {
            const amount = Math.min(w, h) * 0.04;
            // deterministic jitter so the loop is seamless
            const x = Math.sin(t * TAU * 7) * amount;
            const y = Math.cos(t * TAU * 11) * amount;
            drawTransformed(ctx, img, w, h, { x, y, scaleX: 1.1, scaleY: 1.1 });
        }
    },
    spin: {
        name: "Spin",
        draw: (ctx, img, t, w, h) => {
            const scale = Math.min(w, h) / Math.hypot(w, h);
            drawTransformed(ctx, img, w, h, { rotate: t * TAU, scaleX: scale, scaleY: scale });
        }
    },
    pulse: {
        name: "Pulse",
        draw: (ctx, img, t, w, h) => {
            const scale = 0.85 + 0.15 * (1 + Math.sin(t * TAU)) / 2;
            drawTransformed(ctx, img, w, h, { scaleX: scale, scaleY: scale });
        }
    },
    bounce: {
        name: "Bounce",
        draw: (ctx, img, t, w, h) => {
            const jump = Math.abs(Math.sin(t * Math.PI));
            const squash = jump < 0.15 ? 1 - (0.15 - jump) : 1;
            drawTransformed(ctx, img, w, h, {
                scaleX: 0.8 * (2 - squash),
                scaleY: 0.8 * squash,
                y: -jump * h * 0.2,
                anchorBottom: true
            });
        }
    },
    squish: {
        name: "Squish",
        draw: (ctx, img, t, w, h) => {
            const s = Math.sin(t * TAU);
            drawTransformed(ctx, img, w, h, {
                scaleX: 0.9 + s * 0.1,
                scaleY: 0.9 - s * 0.1,
                anchorBottom: true
            });
        }
    },
    wobble: {
        name: "Wobble",
        draw: (ctx, img, t, w, h) => {
            drawTransformed(ctx, img, w, h, { rotate: Math.sin(t * TAU) * 0.2, scaleX: 0.85, scaleY: 0.85 });
        }
    },
    rainbow: {
        name: "Rainbow",
        draw: (ctx, img, t, w, h) => {
            ctx.save();
            ctx.filter = `hue-rotate(${Math.round(t * 360)}deg) saturate(1.6)`;
            ctx.drawImage(img, 0, 0, w, h);
            ctx.restore();
        }
    },
    blink: {
        name: "Blink",
        draw: (ctx, img, t, w, h) => {
            if (t < 0.5) ctx.drawImage(img, 0, 0, w, h);
        }
    },
    zoom: {
        name: "Zoom in",
        draw: (ctx, img, t, w, h) => {
            const scale = 1 + t * 1.5;
            drawTransformed(ctx, img, w, h, { scaleX: scale, scaleY: scale });
        }
    }
} satisfies Record<string, Effect>;

export type EffectId = keyof typeof EFFECTS;
