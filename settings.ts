/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    storageChannelId: {
        type: OptionType.STRING,
        description: "ID of the channel GIFs are uploaded to before they are added to your favorites (e.g. a channel in your own private server)",
        default: ""
    },
    defaultSize: {
        type: OptionType.NUMBER,
        description: "Default size of the longest side of created GIFs, in pixels",
        default: 256
    },
    defaultDelay: {
        type: OptionType.NUMBER,
        description: "Default delay between frames of animated effects, in ms (at least 20)",
        default: 50
    },
    maxUploadMb: {
        type: OptionType.NUMBER,
        description: "Maximum GIF size in MB. Bigger GIFs are shrunk automatically",
        default: 10
    },
    autoFavoriteOnPaste: {
        type: OptionType.BOOLEAN,
        description: "Pasting an image into the Image to GIF tool immediately turns it into a GIF and adds it to your favorites",
        default: false
    },
    // urls of the favorites created with GifTools
    created: {
        type: OptionType.CUSTOM,
        default: [] as string[]
    }
});
