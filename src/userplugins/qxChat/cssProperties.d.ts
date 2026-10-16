/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "react";

declare module "react" {
    interface CSSProperties {
        WebkitAppRegion?: "drag" | "no-drag";
    }
}
