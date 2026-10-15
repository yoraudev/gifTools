/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType } from "@api/Commands";
import definePlugin from "@utils/types";

import { messageContextMenuPatch } from "./contextMenu";
import { openGifTools } from "./GifToolsModal";
import { settings } from "./settings";
import managedStyle from "./styles.css?managed";

export default definePlugin({
    name: "GifTools",
    description: "Adds a /gif command with GIF tools: turn pasted images into GIFs and save them to your favorites, add effects and text, convert videos, make slideshows and manage your favorite GIFs. Also available from the context menu of messages with images or videos",
    tags: ["Media", "Commands"],
    authors: [{ name: "yoraudev", id: 0n }],
    settings,
    managedStyle,

    contextMenus: {
        "message": messageContextMenuPatch
    },

    commands: [{
        inputType: ApplicationCommandInputType.BUILT_IN,
        name: "gif",
        description: "Open GIF Tools",
        execute() {
            openGifTools();
        }
    }]
});
