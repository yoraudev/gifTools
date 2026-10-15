/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { ImageIcon } from "@components/Icons";
import { Message, MessageAttachment } from "@vencord/discord-types";
import { Menu, showToast } from "@webpack/common";
import type { ReactElement } from "react";

import { addToFavorites } from "./components/GifResult";
import { openGifTools, ToolId } from "./GifToolsModal";
import { closeSource, loadSource } from "./lib/decode";
import { EffectId, EFFECTS } from "./lib/effects";
import { encodeGif } from "./lib/encode";
import { addFavorites } from "./lib/favorites";
import { settings } from "./settings";
import { buildSpec, defaultOptions } from "./tools/ImageToGif";
import { errorMessage, gifFileName } from "./utils";

interface Media {
    urls: string[];
    name: string;
    isVideo: boolean;
    /** set for GIF attachments, which can be favorited as they are */
    gifAttachment?: MessageAttachment;
}

function pathOf(url: string) {
    try {
        return new URL(url).pathname;
    } catch {
        return url;
    }
}

function collectMedia(message: Message, clickedSrc?: string) {
    const media: Media[] = [];
    const seen = new Set<string>();
    const add = (urls: (string | undefined)[], name: string, isVideo: boolean, gifAttachment?: MessageAttachment) => {
        const valid = urls.filter(Boolean) as string[];
        if (!valid.length || seen.has(pathOf(valid[0]))) return;

        seen.add(pathOf(valid[0]));
        media.push({ urls: valid, name, isVideo, gifAttachment });
    };

    for (const attachment of message.attachments) {
        const type = attachment.content_type ?? "";
        if (!type.startsWith("image/") && !type.startsWith("video/")) continue;

        add(
            [attachment.proxy_url, attachment.url],
            attachment.filename,
            type.startsWith("video/"),
            type === "image/gif" ? attachment : undefined
        );
    }

    for (const embed of message.embeds) {
        // gifv embeds (Tenor etc.) and uploaded videos come as mp4, other video embeds like YouTube can't be downloaded
        if (embed.video?.proxyURL && (embed.type === "gifv" || embed.type === "video")) {
            add([embed.video.proxyURL, embed.video.url], "video.mp4", true);
            continue;
        }

        for (const image of [embed.image, ...(embed.images ?? []), embed.type === "image" ? embed.thumbnail : undefined]) {
            if (image) add([image.proxyURL, image.url], "image.png", false);
        }
    }

    // the image that was right clicked comes first
    if (clickedSrc) {
        const clicked = pathOf(clickedSrc);
        media.sort((a, b) => Number(pathOf(b.urls[0]) === clicked) - Number(pathOf(a.urls[0]) === clicked));
    }

    return media;
}

async function download(media: Media) {
    let lastError: unknown;
    for (const url of media.urls) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const blob = await res.blob();
            return new File([blob], media.name, { type: blob.type });
        } catch (e) {
            lastError = e;
        }
    }
    throw new Error(`Couldn't download the media: ${errorMessage(lastError)}`);
}

async function openWith(tool: ToolId, media: Media[], initialEffect?: EffectId) {
    try {
        const initialFiles = await Promise.all(media.map(download));
        openGifTools({ tool, initialFiles, initialEffect });
    } catch (e) {
        showToast({ text: errorMessage(e), variant: "critical" });
    }
}

async function quickFavorite(media: Media) {
    try {
        const attachment = media.gifAttachment;
        if (attachment) {
            const added = await addFavorites([{
                url: attachment.url,
                src: attachment.proxy_url || attachment.url,
                width: attachment.width ?? 0,
                height: attachment.height ?? 0
            }]);
            showToast({
                text: added ? "Added to your favorite GIFs!" : "That GIF is already in your favorites",
                variant: added ? "success" : "default"
            });
            return;
        }

        showToast({ text: "Creating GIF..." });
        const source = await loadSource(await download(media));
        try {
            const spec = buildSpec(source, defaultOptions());
            const file = await encodeGif(spec, {
                fileName: gifFileName(media.name),
                maxBytes: settings.store.maxUploadMb * 1024 * 1024
            });
            await addToFavorites({ file, width: spec.width, height: spec.height });
        } finally {
            closeSource(source);
        }
    } catch (e) {
        showToast({ text: errorMessage(e), variant: "critical" });
    }
}

function buildMenu(media: Media[]) {
    const images = media.filter(m => !m.isVideo);
    const video = media.find(m => m.isVideo);
    const [image] = images;
    const items: ReactElement[] = [];

    if (image) {
        items.push(
            <Menu.MenuItem
                key="favorite"
                id="vc-gif-tools-favorite"
                label={image.gifAttachment ? "Add GIF to favorites" : "Make GIF & add to favorites"}
                action={() => quickFavorite(image)}
            />,
            <Menu.MenuItem
                key="edit"
                id="vc-gif-tools-edit"
                label="Edit in GifTools"
                action={() => openWith("image", [image])}
            />,
            <Menu.MenuItem key="effects" id="vc-gif-tools-effects" label="Effects">
                {(Object.keys(EFFECTS) as EffectId[]).filter(id => id !== "none").map(id => (
                    <Menu.MenuItem
                        key={id}
                        id={`vc-gif-tools-effect-${id}`}
                        label={EFFECTS[id].name}
                        action={() => openWith("image", [image], id)}
                    />
                ))}
            </Menu.MenuItem>
        );

        if (images.length > 1) {
            items.push(
                <Menu.MenuItem
                    key="slideshow"
                    id="vc-gif-tools-slideshow"
                    label={`Slideshow from ${images.length} images`}
                    action={() => openWith("slideshow", images)}
                />
            );
        }
    }

    if (video) {
        items.push(
            <Menu.MenuItem
                key="video"
                id="vc-gif-tools-video"
                label="Turn video into GIF"
                action={() => openWith("video", [video])}
            />
        );
    }

    return items;
}

export const messageContextMenuPatch: NavContextMenuPatchCallback = (children, { message, itemSrc }: { message?: Message; itemSrc?: string; }) => {
    if (!message) return;

    const media = collectMedia(message, itemSrc);
    if (!media.length) return;

    children.splice(-1, 0,
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-gif-tools"
                label="GifTools"
                leadingAccessory={{ type: "icon", icon: ImageIcon }}
            >
                {buildMenu(media)}
            </Menu.MenuItem>
        </Menu.MenuGroup>
    );
};
