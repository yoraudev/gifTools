/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";

import type { EffectId } from "./lib/effects";

export const cl = classNameFactory("vc-gifTools-");

export interface ToolProps {
    onClose(): void;
    /** Files to load right away, e.g. from the message context menu */
    initialFiles?: File[];
    initialEffect?: EffectId;
}

export function gifFileName(name: string) {
    return `${name.replace(/\.[^.]+$/, "")}.gif`;
}

export function errorMessage(e: unknown) {
    return e instanceof Error ? e.message : String(e);
}

export function matchesAccept(type: string, accept: string) {
    return accept.split(",").some(a => {
        a = a.trim();
        return a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a;
    });
}

export function pickFiles(accept: string, multiple = false) {
    return new Promise<File[]>(resolve => {
        const input = document.createElement("input");
        input.type = "file";
        input.style.display = "none";
        input.accept = accept;
        input.multiple = multiple;
        input.onchange = () => resolve(Array.from(input.files ?? []));

        document.body.appendChild(input);
        input.click();
        setImmediate(() => document.body.removeChild(input));
    });
}

export function formatBytes(bytes: number) {
    return bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(0)} KB`
        : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
