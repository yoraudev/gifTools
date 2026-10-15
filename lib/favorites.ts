/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { CloudUpload as TCloudUpload } from "@vencord/discord-types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { findLazy } from "@webpack";
import { ChannelStore, Constants, PermissionsBits, PermissionStore, RestAPI, SnowflakeUtils, UserSettingsActionCreators, UserSettingsProtoStore } from "@webpack/common";

import { settings } from "../settings";

const CloudUpload: typeof TCloudUpload = findLazy(m => m.prototype?.trackUploadFinished);

export const enum GifFormat {
    NONE = 0,
    IMAGE = 1,
    VIDEO = 2
}

export interface FavoriteGif {
    format: GifFormat;
    src: string;
    width: number;
    height: number;
    order: number;
}

export interface NewFavorite {
    url: string;
    src: string;
    width: number;
    height: number;
    format?: GifFormat;
}

interface Attachment {
    url: string;
    proxy_url: string;
    width?: number;
    height?: number;
}

export function getFavorites(): Record<string, FavoriteGif> {
    return UserSettingsProtoStore.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs ?? {};
}

/** GIFs pinned with the PinFavoriteGifs plugin. These are never removed by GifTools */
export function getPinnedUrls() {
    return new Set<string>(Settings.plugins.PinFavoriteGifs?.pinned ?? []);
}

/** Adds favorites, skipping ones that already exist. Returns how many were added */
export async function addFavorites(gifs: NewFavorite[]) {
    let added = 0;

    await UserSettingsActionCreators.FrecencyUserSettingsActionCreators.updateAsync("favoriteGifs", (state: { gifs: Record<string, FavoriteGif>; }) => {
        let order = Math.max(0, ...Object.values(state.gifs).map(g => g.order ?? 0));

        for (const gif of gifs) {
            const url = normalizeFavoriteUrl(gif.url);
            if (state.gifs[url]) continue;

            state.gifs[url] = {
                format: gif.format ?? GifFormat.IMAGE,
                src: gif.src,
                width: gif.width,
                height: gif.height,
                order: ++order
            };
            added++;
        }
    }, 0);

    return added;
}

export async function removeFavorites(urls: string[]) {
    const pinned = getPinnedUrls();

    await UserSettingsActionCreators.FrecencyUserSettingsActionCreators.updateAsync("favoriteGifs", (state: { gifs: Record<string, FavoriteGif>; }) => {
        for (const url of urls) {
            if (!pinned.has(url)) delete state.gifs[url];
        }
    }, 0);
}

/** Replaces the src of existing favorites, e.g. with refreshed attachment links */
export async function updateFavoriteSources(sources: Map<string, string>) {
    await UserSettingsActionCreators.FrecencyUserSettingsActionCreators.updateAsync("favoriteGifs", (state: { gifs: Record<string, FavoriteGif>; }) => {
        for (const [url, src] of sources) {
            if (state.gifs[url]) state.gifs[url].src = src;
        }
    }, 0);
}

/**
 * Favorites added by older GifTools versions were keyed by the signed attachment url, which Discord never matches.
 * Re-keys them by the unsigned url and moves their PinFavoriteGifs pins along.
 */
export async function migrateCreatedFavorites() {
    const favorites = getFavorites();
    const renames = new Map(
        settings.store.created
            .filter(url => url in favorites && normalizeFavoriteUrl(url) !== url)
            .map(url => [url, normalizeFavoriteUrl(url)])
    );
    if (!renames.size) return;

    await UserSettingsActionCreators.FrecencyUserSettingsActionCreators.updateAsync("favoriteGifs", (state: { gifs: Record<string, FavoriteGif>; }) => {
        for (const [from, to] of renames) {
            const gif = state.gifs[from];
            if (!gif) continue;

            state.gifs[to] ??= gif;
            delete state.gifs[from];
        }
    }, 0);

    const rename = (url: string) => renames.get(url) ?? url;
    settings.store.created = settings.store.created.map(rename);

    const pinSettings = Settings.plugins.PinFavoriteGifs;
    if (pinSettings?.pinned?.some((url: string) => renames.has(url)))
        pinSettings.pinned = pinSettings.pinned.map(rename);
}

/** Returns an error message if GIFs can't be uploaded to the storage channel */
export function checkStorageChannel(channelId = settings.store.storageChannelId) {
    if (!channelId) return "No storage channel is set.";

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return "The storage channel could not be found. Make sure the ID is right and you can see the channel.";

    if (channel.guild_id && !(PermissionStore.can(PermissionsBits.SEND_MESSAGES, channel) && PermissionStore.can(PermissionsBits.ATTACH_FILES, channel)))
        return "You can't send files in the storage channel.";

    return null;
}

export function uploadFile(file: File, channelId: string) {
    return new Promise<Attachment>((resolve, reject) => {
        const upload = new CloudUpload({
            file,
            isThumbnail: false,
            platform: CloudUploadPlatform.WEB
        }, channelId);

        upload.on("complete", async () => {
            try {
                const { body } = await RestAPI.post({
                    url: Constants.Endpoints.MESSAGES(channelId),
                    body: {
                        channel_id: channelId,
                        content: "",
                        nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                        sticker_ids: [],
                        type: 0,
                        attachments: [{
                            id: "0",
                            filename: upload.filename,
                            uploaded_filename: upload.uploadedFilename
                        }]
                    }
                });

                const attachment = body?.attachments?.[0];
                if (!attachment?.url) throw new Error("Discord did not return the uploaded file");
                resolve(attachment);
            } catch (e) {
                reject(e);
            }
        });
        upload.on("error", () => reject(new Error("Failed to upload the GIF")));

        upload.upload();
    });
}

/** Uploads the GIF to the storage channel and adds it to the favorites */
export async function favoriteFile(file: File, width: number, height: number) {
    const error = checkStorageChannel();
    if (error) throw new Error(error);

    const attachment = await uploadFile(file, settings.store.storageChannelId);

    await addFavorites([{
        url: attachment.url,
        src: attachment.proxy_url || attachment.url,
        width: attachment.width ?? width,
        height: attachment.height ?? height
    }]);

    settings.store.created = [...settings.store.created, normalizeFavoriteUrl(attachment.url)];
}

const ATTACHMENT_URL = /^https:\/\/(cdn|media)\.discordapp\.(com|net)\/(ephemeral-)?attachments\//;

export function isAttachmentUrl(url: string) {
    return ATTACHMENT_URL.test(url);
}

/** Discord keys favorites by the attachment url without its expiring signature, so the same GIF matches from any signed link */
export function normalizeFavoriteUrl(url: string) {
    if (!isAttachmentUrl(url)) return url;

    try {
        const parsed = new URL(url);
        for (const param of ["ex", "is", "hm"]) parsed.searchParams.delete(param);
        return parsed.toString();
    } catch {
        return url;
    }
}

/** Gets freshly signed versions of Discord attachment urls. Returns a map of original url -> refreshed url */
export async function refreshAttachmentUrls(urls: string[]) {
    const result = new Map<string, string>();

    for (let i = 0; i < urls.length; i += 50) {
        try {
            const { body } = await RestAPI.post({
                url: "/attachments/refresh-urls",
                body: { attachment_urls: urls.slice(i, i + 50) }
            });

            for (const { original, refreshed } of body?.refreshed_urls ?? [])
                result.set(original, refreshed);
        } catch (e) {
            console.error("[GifTools] Failed to refresh attachment urls", e);
        }
    }

    return result;
}
