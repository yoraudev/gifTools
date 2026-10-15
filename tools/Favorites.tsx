/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { saveFile } from "@utils/web";
import { showToast, useState } from "@webpack/common";

import { Checkbox, Progress, TextField } from "../components/Inputs";
import { addFavorites, FavoriteGif, getFavorites, getPinnedUrls, GifFormat, isAttachmentUrl, refreshAttachmentUrls, removeFavorites, updateFavoriteSources } from "../lib/favorites";
import { settings } from "../settings";
import { cl, errorMessage, pickFiles } from "../utils";

const PROBE_TIMEOUT = 15_000;
const PROBE_CONCURRENCY = 8;

const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url);

/** Loads the media to check it works. Resolves with its size, rejects if it doesn't load */
function probeMedia(src: string) {
    return new Promise<{ width: number; height: number; format: GifFormat; }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out")), PROBE_TIMEOUT);
        const fail = () => {
            clearTimeout(timeout);
            reject(new Error("Couldn't load the media"));
        };

        if (isVideoUrl(src)) {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.muted = true;
            video.onloadedmetadata = () => {
                clearTimeout(timeout);
                resolve({ width: video.videoWidth, height: video.videoHeight, format: GifFormat.VIDEO });
                video.removeAttribute("src");
                video.load();
            };
            video.onerror = fail;
            video.src = src;
        } else {
            const img = new Image();
            img.onload = () => {
                clearTimeout(timeout);
                resolve({ width: img.naturalWidth, height: img.naturalHeight, format: GifFormat.IMAGE });
            };
            img.onerror = fail;
            img.src = src;
        }
    });
}

async function forEachLimited<T>(items: T[], fn: (item: T) => Promise<void>, onDone: (done: number) => void) {
    let index = 0;
    let done = 0;
    const worker = async () => {
        while (index < items.length) {
            await fn(items[index++]).catch(() => { });
            onDone(++done);
        }
    };
    await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
}

const works = (src: string) => probeMedia(src).then(() => true, () => false);

interface ScanResult {
    /** favorites that don't load at all */
    broken: { url: string; src: string; }[];
    /** favorites whose expired attachment link works again after refreshing: url -> refreshed src */
    expired: Map<string, string>;
}

async function scanFavorites(onProgress: (p: number) => void): Promise<ScanResult> {
    const pinned = getPinnedUrls();
    const entries = Object.entries(getFavorites()).filter(([url]) => !pinned.has(url));

    const failing: [string, FavoriteGif][] = [];
    await forEachLimited(entries, async entry => {
        if (!await works(entry[1].src)) failing.push(entry);
    }, done => onProgress(done / entries.length * 0.7));

    const refreshed = await refreshAttachmentUrls(
        failing.map(([, gif]) => gif.src).filter(isAttachmentUrl)
    );

    const result: ScanResult = { broken: [], expired: new Map() };
    await forEachLimited(failing, async ([url, gif]) => {
        const fresh = refreshed.get(gif.src);
        if (fresh && fresh !== gif.src && await works(fresh)) result.expired.set(url, fresh);
        else result.broken.push({ url, src: gif.src });
    }, done => onProgress(0.7 + done / failing.length * 0.3));

    return result;
}

function exportFavorites() {
    const data = JSON.stringify({ gifs: getFavorites() }, null, 2);
    saveFile(new File([data], `favorite-gifs-${new Date().toISOString().slice(0, 10)}.json`, { type: "application/json" }));
}

async function importFavorites() {
    const [file] = await pickFiles("application/json,.json");
    if (!file) return;

    try {
        const data = JSON.parse(await file.text());
        const gifs: Record<string, FavoriteGif> = data?.gifs ?? data;
        if (typeof gifs !== "object" || !gifs) throw new Error("This isn't a favorites export");

        const entries = Object.entries(gifs)
            .filter(([url, gif]) => typeof url === "string" && typeof gif?.src === "string")
            .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
            .map(([url, gif]) => ({ url, src: gif.src, width: gif.width, height: gif.height, format: gif.format }));

        const added = await addFavorites(entries);
        showToast({ text: `Imported ${added} GIFs, ${entries.length - added} were already in your favorites`, variant: "success" });
    } catch (e) {
        showToast({ text: `Import failed: ${errorMessage(e)}`, variant: "critical" });
    }
}

function AddFromUrl({ onAdded }: { onAdded(): void; }) {
    const [url, setUrl] = useState("");
    const [adding, setAdding] = useState(false);

    const add = async () => {
        const link = url.trim();
        if (!/^https?:\/\//.test(link)) return showToast({ text: "Enter a valid link", variant: "critical" });

        setAdding(true);
        try {
            const media = await probeMedia(link).catch(() => {
                throw new Error("Couldn't load it. Use a direct link to a GIF, image or video, not a web page.");
            });
            const added = await addFavorites([{ url: link, src: link, ...media }]);
            showToast({ text: added ? "Added to your favorites!" : "That GIF is already in your favorites", variant: added ? "success" : "default" });
            setUrl("");
            onAdded();
        } catch (e) {
            showToast({ text: errorMessage(e), variant: "critical" });
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className={cl("row", "row-end")}>
            <TextField label="GIF link" value={url} placeholder="https://media.tenor.com/....gif" onChange={setUrl} />
            <Button disabled={adding || !url} onClick={add}>{adding ? "Adding..." : "Add"}</Button>
        </div>
    );
}

function Cleanup({ onChanged }: { onChanged(): void; }) {
    const [progress, setProgress] = useState<number | null>(null);
    const [result, setResult] = useState<ScanResult | null>(null);
    const [selected, setSelected] = useState(new Set<string>());
    const [confirming, setConfirming] = useState(false);

    const scan = async () => {
        setResult(null);
        setConfirming(false);
        setProgress(0);
        try {
            const res = await scanFavorites(setProgress);
            setResult(res);
            setSelected(new Set(res.broken.map(b => b.url)));
        } catch (e) {
            showToast({ text: `Scan failed: ${errorMessage(e)}`, variant: "critical" });
        } finally {
            setProgress(null);
        }
    };

    const fixExpired = async () => {
        await updateFavoriteSources(result!.expired);
        showToast({ text: `Refreshed ${result!.expired.size} links`, variant: "success" });
        setResult({ ...result!, expired: new Map() });
        onChanged();
    };

    const removeSelected = async () => {
        await removeFavorites([...selected]);
        showToast({ text: `Removed ${selected.size} broken GIFs`, variant: "success" });
        setResult({ ...result!, broken: result!.broken.filter(b => !selected.has(b.url)) });
        setSelected(new Set());
        setConfirming(false);
        onChanged();
    };

    const toggle = (url: string, value: boolean) => {
        const copy = new Set(selected);
        if (value) copy.add(url);
        else copy.delete(url);
        setSelected(copy);
    };

    return (
        <>
            <Paragraph className={cl("muted")}>
                Checks every favorite and finds the ones that don't load anymore.
            </Paragraph>
            <Button size="small" variant="secondary" disabled={progress != null} onClick={scan}>
                {progress != null ? "Scanning..." : "Scan favorites"}
            </Button>
            {progress != null && <Progress value={progress} />}

            {result && !result.broken.length && !result.expired.size && (
                <Paragraph>All your favorites work!</Paragraph>
            )}

            {result && result.expired.size > 0 && (
                <div className={cl("row")}>
                    <Paragraph>{result.expired.size} GIFs have expired Discord links that can be refreshed.</Paragraph>
                    <Button size="small" onClick={fixExpired}>Refresh links</Button>
                </div>
            )}

            {result && result.broken.length > 0 && (
                <>
                    <Paragraph>{result.broken.length} GIFs don't load anymore:</Paragraph>
                    <div className={cl("broken-list")}>
                        {result.broken.map(({ url }) => (
                            <Checkbox key={url} label={url} value={selected.has(url)} onChange={v => toggle(url, v)} />
                        ))}
                    </div>
                    <Button
                        size="small"
                        variant={confirming ? "dangerPrimary" : "dangerSecondary"}
                        disabled={!selected.size}
                        onClick={() => confirming ? removeSelected() : setConfirming(true)}
                    >
                        {confirming ? `Really remove ${selected.size} GIFs?` : `Remove ${selected.size} selected`}
                    </Button>
                </>
            )}
        </>
    );
}

export function Favorites() {
    const [, setVersion] = useState(0);
    const refresh = () => setVersion(v => v + 1);

    const total = Object.keys(getFavorites()).length;
    const created = settings.store.created.length;

    return (
        <div className={cl("tool")}>
            <Paragraph>
                {total} favorite GIFs · {created} created with GifTools
            </Paragraph>

            <Heading tag="h5">Add from link</Heading>
            <AddFromUrl onAdded={refresh} />

            <Heading tag="h5">Backup</Heading>
            <Paragraph className={cl("muted")}>Importing only adds GIFs you don't have yet, nothing gets replaced.</Paragraph>
            <div className={cl("row")}>
                <Button size="small" variant="secondary" onClick={exportFavorites}>Export favorites</Button>
                <Button size="small" variant="secondary" onClick={async () => {
                    await importFavorites();
                    refresh();
                }}>
                    Import favorites
                </Button>
            </div>

            <Heading tag="h5">Clean up</Heading>
            <Cleanup onChanged={refresh} />
        </div>
    );
}
