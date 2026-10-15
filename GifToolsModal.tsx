/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, useEffect, useState } from "@webpack/common";
import type { ComponentType } from "react";

import { migrateCreatedFavorites } from "./lib/favorites";
import { Favorites } from "./tools/Favorites";
import { ImageToGif } from "./tools/ImageToGif";
import { Slideshow } from "./tools/Slideshow";
import { VideoToGif } from "./tools/VideoToGif";
import { cl, ToolProps } from "./utils";

interface Tool {
    name: string;
    icon: string;
    description: string;
    Component: ComponentType<ToolProps>;
}

const TOOLS = {
    image: {
        name: "Image to GIF",
        icon: "🖼️",
        description: "Paste an image, add effects and text, and save it straight to your favorites",
        Component: ImageToGif
    },
    video: {
        name: "Video to GIF",
        icon: "🎬",
        description: "Turn a part of a video into a GIF",
        Component: VideoToGif
    },
    slideshow: {
        name: "Slideshow",
        icon: "🎞️",
        description: "Combine several images into one GIF",
        Component: Slideshow
    },
    favorites: {
        name: "Favorites",
        icon: "⭐",
        description: "Add GIFs from links, back up your favorites and clean up broken ones",
        Component: Favorites
    }
} satisfies Record<string, Tool>;

export type ToolId = keyof typeof TOOLS;

interface OpenOptions extends Omit<ToolProps, "onClose"> {
    tool?: ToolId;
}

export function openGifTools(options: OpenOptions = {}) {
    openModal(props => <GifToolsModal {...props} {...options} />);
}

function GifToolsModal({ tool: initialTool, initialFiles, initialEffect, ...props }: RenderModalProps & OpenOptions) {
    const [toolId, setToolId] = useState<ToolId | null>(initialTool ?? null);
    // the preloaded files only belong to the tool the modal was opened with
    const [preloaded, setPreloaded] = useState(initialTool != null);
    const tool: Tool | null = toolId && TOOLS[toolId];

    useEffect(() => {
        migrateCreatedFavorites().catch(e => console.error("[GifTools] Failed to migrate favorites", e));
    }, []);

    return (
        <Modal
            {...props}
            size="md"
            title={tool ? `${tool.icon} ${tool.name}` : "GIF Tools"}
            subtitle={tool?.description ?? "Pick a tool"}
        >
            {tool ? (
                <div className={cl("tool-wrapper")}>
                    <Button size="small" variant="secondary" className={cl("back")} onClick={() => {
                        setToolId(null);
                        setPreloaded(false);
                    }}>
                        ← All tools
                    </Button>
                    <ErrorBoundary>
                        <tool.Component
                            onClose={props.onClose}
                            {...preloaded && { initialFiles, initialEffect }}
                        />
                    </ErrorBoundary>
                </div>
            ) : (
                <div className={cl("menu")}>
                    {(Object.keys(TOOLS) as ToolId[]).map(id => (
                        <button key={id} className={cl("card")} onClick={() => setToolId(id)}>
                            <span className={cl("card-icon")}>{TOOLS[id].icon}</span>
                            <span className={cl("card-name")}>{TOOLS[id].name}</span>
                            <Paragraph className={cl("muted")}>{TOOLS[id].description}</Paragraph>
                        </button>
                    ))}
                </div>
            )}
        </Modal>
    );
}
