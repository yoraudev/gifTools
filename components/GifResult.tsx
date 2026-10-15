/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { saveFile } from "@utils/web";
import { DraftType } from "@vencord/discord-types/enums";
import { ChannelStore, SelectedChannelStore, showToast, UploadHandler, useEffect, useMemo, useState } from "@webpack/common";

import { encodeGif, GifSpec } from "../lib/encode";
import { checkStorageChannel, favoriteFile } from "../lib/favorites";
import { settings } from "../settings";
import { cl, errorMessage, formatBytes } from "../utils";
import { Progress } from "./Inputs";

export interface GifOutput {
    file: File;
    width: number;
    height: number;
}

export function useGifEncoder() {
    const [progress, setProgress] = useState<number | null>(null);
    const [output, setOutput] = useState<GifOutput | null>(null);

    const encode = async (spec: GifSpec, fileName: string) => {
        setProgress(0);
        setOutput(null);
        try {
            const file = await encodeGif(spec, {
                fileName,
                maxBytes: settings.store.maxUploadMb * 1024 * 1024,
                onProgress: setProgress
            });

            // encodeGif may have shrunk it, so read the real size back
            const bitmap = await createImageBitmap(file);
            const result = { file, width: bitmap.width, height: bitmap.height };
            bitmap.close();

            setOutput(result);
            return result;
        } catch (e) {
            showToast({ text: errorMessage(e), variant: "critical" });
            return null;
        } finally {
            setProgress(null);
        }
    };

    return { encode, progress, output, busy: progress != null };
}

export async function addToFavorites({ file, width, height }: GifOutput) {
    try {
        showToast({ text: "Uploading GIF..." });
        await favoriteFile(file, width, height);
        showToast({ text: "Added to your favorite GIFs!", variant: "success" });
        return true;
    } catch (e) {
        showToast({ text: `Couldn't add to favorites: ${errorMessage(e)}`, variant: "critical" });
        return false;
    }
}

function StorageChannelNotice() {
    const { storageChannelId } = settings.use(["storageChannelId"]);
    const error = checkStorageChannel(storageChannelId);
    if (!error) return null;

    return (
        <div className={cl("notice")}>
            <Paragraph>
                {error} GIFs need to be uploaded to a channel before they can be favorited.
                You can set the channel in the plugin settings or use the current one.
            </Paragraph>
            <Button size="small" variant="secondary" onClick={() => {
                const channelId = SelectedChannelStore.getChannelId();
                if (channelId) settings.store.storageChannelId = channelId;
            }}>
                Use current channel
            </Button>
        </div>
    );
}

interface GifResultProps {
    progress: number | null;
    output: GifOutput | null;
    onClose(): void;
}

export function GifResult({ progress, output, onClose }: GifResultProps) {
    const [favoriting, setFavoriting] = useState(false);
    const url = useMemo(() => output && URL.createObjectURL(output.file), [output]);
    useEffect(() => () => {
        if (url) URL.revokeObjectURL(url);
    }, [url]);

    if (progress != null) return <Progress value={progress} />;
    if (!output || !url) return null;

    return (
        <div className={cl("result")}>
            <img className={cl("preview")} src={url} alt="Created GIF" />
            <Paragraph className={cl("muted")}>
                {output.width}×{output.height} · {formatBytes(output.file.size)}
            </Paragraph>

            <StorageChannelNotice />

            <div className={cl("row")}>
                <Button disabled={favoriting} onClick={async () => {
                    setFavoriting(true);
                    await addToFavorites(output);
                    setFavoriting(false);
                }}>
                    {favoriting ? "Adding..." : "Add to favorites"}
                </Button>
                <Button variant="secondary" onClick={() => {
                    const channel = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
                    if (!channel) return showToast({ text: "Open a channel first", variant: "critical" });

                    UploadHandler.promptToUpload([output.file], channel, DraftType.ChannelMessage);
                    onClose();
                }}>
                    Send in this channel
                </Button>
                <Button variant="secondary" onClick={() => saveFile(output.file)}>
                    Download
                </Button>
            </div>
        </div>
    );
}
