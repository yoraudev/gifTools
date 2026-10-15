/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, ExpressionPickerStore, FluxDispatcher, MessageActions, PendingReplyStore, PermissionsBits, PermissionStore, SelectedChannelStore } from "@webpack/common";

import { settings } from "../settings";
import { normalizeFavoriteUrl, refreshAttachmentUrls, uploadFile } from "./favorites";

interface PickedGif {
    url: string;
    src: string;
}

async function downloadGif(gif: PickedGif, url: string) {
    // favorites are keyed by the unsigned link, which Discord doesn't serve, so get a freshly signed one first
    const refreshed = (await refreshAttachmentUrls([url])).get(url);

    for (const link of [refreshed, gif.src, gif.url]) {
        if (!link) continue;
        try {
            const res = await fetch(link);
            if (!res.ok) continue;

            const blob = await res.blob();
            const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "gif.gif");
            return new File([blob], name, { type: blob.type || "image/gif" });
        } catch { }
    }

    throw new Error("Couldn't download the GIF");
}

async function send(gif: PickedGif, url: string, channelId: string) {
    const file = await downloadGif(gif, url);
    const reply = PendingReplyStore.getPendingReply(channelId);

    await uploadFile(file, channelId, {
        message_reference: reply ? MessageActions.getSendMessageOptionsForReply(reply)?.messageReference : undefined
    });

    if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
}

/**
 * Discord sends favorites as a link, and shows links much smaller than attachments.
 * So GIFs made with GifTools are sent as a file instead. Returns whether the GIF is handled here;
 * if sending fails, `fallback` sends it the normal way.
 */
export function sendFavoriteAsFile(gif: PickedGif | undefined, fallback: () => void) {
    if (!gif?.url || !settings.store.sendAsFile) return false;

    const url = normalizeFavoriteUrl(gif.url);
    if (!settings.store.created.includes(url)) return false;

    const channelId = SelectedChannelStore.getChannelId();
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;
    if (channel.guild_id && !PermissionStore.can(PermissionsBits.ATTACH_FILES, channel)) return false;

    ExpressionPickerStore.closeExpressionPicker();
    send(gif, url, channelId).catch(e => {
        console.error("[GifTools] Failed to send GIF as a file, sending the link instead", e);
        fallback();
    });

    return true;
}
