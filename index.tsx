/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType } from "@api/Commands";
import definePlugin from "@utils/types";

import { messageContextMenuPatch } from "./contextMenu";
import { openGifTools } from "./GifToolsModal";
import { sendFavoriteAsFile } from "./lib/send";
import { settings } from "./settings";
import managedStyle from "./styles.css?managed";

export default definePlugin({
    name: "GifTools",
    description: "Adds a /giftools command with GIF tools: turn pasted images into GIFs and save them to your favorites, add effects and text, convert videos, make slideshows and manage your favorite GIFs. Also available from the context menu of messages with images or videos",
    tags: ["Media", "Commands"],
    authors: [{ name: "yoraudev", id: 0n }],
    settings,
    managedStyle,

    patches: [{
        // GIF picker: send GIFs made with GifTools as a file, the same way GifPaste tells the chat picker apart
        find: "handleSelectGIF=",
        replacement: {
            match: /handleSelectGIF=\((\i),(\i)\)=>\{/,
            replace: "$&if(!this?.props?.className&&$self.sendAsFile($1,()=>this.props.onSelectGIF?.($1,$2)))return;"
        }
    }],

    sendAsFile(gif: { url: string; src: string; } | undefined, fallback: () => void) {
        try {
            return sendFavoriteAsFile(gif, fallback);
        } catch (e) {
            console.error("[GifTools] Failed to send GIF as a file", e);
            return false;
        }
    },

    contextMenus: {
        "message": messageContextMenuPatch
    },

    commands: [{
        inputType: ApplicationCommandInputType.BUILT_IN,
        name: "giftools",
        description: "Open GIF Tools",
        execute() {
            openGifTools();
        }
    }]
});
