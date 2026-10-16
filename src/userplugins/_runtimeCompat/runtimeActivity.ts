/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type RuntimeTaskStatus = "running" | "completed" | "cancelled" | "failed";

export interface RuntimeTask {
    id: string;
    toolId: string;
    name: string;
    status: RuntimeTaskStatus;
    subtitle?: string;
    detail?: string;
    progressCurrent?: number;
    progressTotal?: number | null;
    startedAt: number;
    updatedAt: number;
}

const taskMap = new Map<string, RuntimeTask>();

export function mountRuntimeActivity() {
    return taskMap.size;
}

export function unmountRuntimeActivity() {
    return taskMap.size;
}

export function upsertRuntimeTask(task: Omit<RuntimeTask, "updatedAt"> & { updatedAt?: number; }) {
    taskMap.set(task.id, {
        ...task,
        updatedAt: task.updatedAt ?? Date.now(),
    });
}

export function removeRuntimeTask(taskId: string) {
    taskMap.delete(taskId);
}
