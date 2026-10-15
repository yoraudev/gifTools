/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { showToast, useEffect, useRef, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { cl, errorMessage, matchesAccept, pickFiles } from "../utils";

interface MediaInputProps {
    accept: string;
    multiple?: boolean;
    hint: ReactNode;
    onFiles(files: File[], pasted: boolean): void;
}

async function readClipboard(accept: string) {
    const files: File[] = [];
    for (const item of await navigator.clipboard.read()) {
        const type = item.types.find(t => matchesAccept(t, accept));
        if (!type) continue;

        const blob = await item.getType(type);
        files.push(new File([blob], `clipboard.${type.split("/")[1]}`, { type }));
    }
    return files;
}

export function MediaInput({ accept, multiple, hint, onFiles }: MediaInputProps) {
    const [dragging, setDragging] = useState(false);
    const onFilesRef = useRef(onFiles);
    onFilesRef.current = onFiles;

    const accepted = (files: File[]) => {
        const matching = files.filter(f => matchesAccept(f.type, accept));
        return multiple ? matching : matching.slice(0, 1);
    };

    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const files = accepted(Array.from(e.clipboardData?.files ?? []));
            if (!files.length) return;

            // stop Discord from attaching the pasted file to the chat box
            e.preventDefault();
            e.stopPropagation();
            onFilesRef.current(files, true);
        };

        window.addEventListener("paste", onPaste, true);
        return () => window.removeEventListener("paste", onPaste, true);
    }, [accept, multiple]);

    return (
        <div
            className={cl("dropzone", { dragging })}
            onDragOver={e => {
                e.preventDefault();
                e.stopPropagation();
                setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                setDragging(false);
                const files = accepted(Array.from(e.dataTransfer.files));
                if (files.length) onFiles(files, false);
            }}
        >
            <Paragraph className={cl("dropzone-hint")}>{hint}</Paragraph>
            <div className={cl("row")}>
                <Button size="small" onClick={async () => {
                    const files = accepted(await pickFiles(accept, multiple));
                    if (files.length) onFiles(files, false);
                }}>
                    Choose file{multiple && "s"}
                </Button>
                <Button size="small" variant="secondary" onClick={async () => {
                    try {
                        const files = accepted(await readClipboard(accept));
                        if (files.length) onFiles(files, true);
                        else showToast({ text: "No matching file in your clipboard", variant: "critical" });
                    } catch (e) {
                        showToast({ text: `Couldn't read the clipboard: ${errorMessage(e)}`, variant: "critical" });
                    }
                }}>
                    Paste from clipboard
                </Button>
            </div>
        </div>
    );
}

interface RangeProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    suffix?: string;
    format?(value: number): string;
    onChange(value: number): void;
}

export function Range({ label, value, min, max, step = 1, suffix = "", format, onChange }: RangeProps) {
    return (
        <label className={cl("field")}>
            <span className={cl("label")}>{label}</span>
            <input
                className={cl("range")}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.currentTarget.value))}
            />
            <span className={cl("value")}>{format ? format(value) : value}{suffix}</span>
        </label>
    );
}

interface TextFieldProps {
    label: string;
    value: string;
    placeholder?: string;
    onChange(value: string): void;
}

export function TextField({ label, value, placeholder, onChange }: TextFieldProps) {
    return (
        <label className={cl("field")}>
            <span className={cl("label")}>{label}</span>
            <input
                className={cl("input")}
                value={value}
                placeholder={placeholder}
                onChange={e => onChange(e.currentTarget.value)}
            />
        </label>
    );
}

interface ChipsProps<T extends string> {
    label: string;
    value: T;
    options: Record<T, string>;
    onChange(value: T): void;
}

export function Chips<T extends string>({ label, value, options, onChange }: ChipsProps<T>) {
    return (
        <div className={cl("field")}>
            <span className={cl("label")}>{label}</span>
            <div className={cl("chips")}>
                {(Object.keys(options) as T[]).map(key => (
                    <button
                        key={key}
                        className={cl("chip", { selected: key === value })}
                        onClick={() => onChange(key)}
                    >
                        {options[key]}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function Checkbox({ label, value, onChange }: { label: string; value: boolean; onChange(value: boolean): void; }) {
    return (
        <label className={cl("checkbox")}>
            <input type="checkbox" checked={value} onChange={e => onChange(e.currentTarget.checked)} />
            {label}
        </label>
    );
}

export function Progress({ value }: { value: number; }) {
    return (
        <div className={cl("progress")}>
            <div className={cl("progress-bar")} style={{ width: `${Math.round(value * 100)}%` }} />
        </div>
    );
}
