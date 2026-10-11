/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";

import { t } from "./esharqI18n";

export function BanRiskWarning({ ar, en }: { ar: string; en: string; }) {
    return (
        <BaseText tag="p" size="sm" color="text-danger">
            {t(ar, en)}
        </BaseText>
    );
}
