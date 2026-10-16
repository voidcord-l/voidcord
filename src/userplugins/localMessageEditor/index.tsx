import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { Button, FluxDispatcher, Forms, Menu, TextArea, useState } from "@webpack/common";
import { findByPropsLazy } from "@webpack";

const MessageActions = findByPropsLazy("deleteMessage");
const PermissionStore = findByPropsLazy("can", "getGuildPermissions");

const localEdits = new Map<string, string>();
const localDeletes = new Set<string>();

let originalDeleteMessage: any;
let originalCan: any;

function getLocalEdit(channelId: string, messageId: string) {
    const key = `${channelId}-${messageId}`;
    return localEdits.get(key);
}

function isLocallyDeleted(channelId: string, messageId: string) {
    const key = `${channelId}-${messageId}`;
    return localDeletes.has(key);
}

function EditModal({ message, modalProps }: { message: Message; modalProps: any; }) {
    const key = `${message.channel_id}-${message.id}`;
    const [content, setContent] = useState(localEdits.get(key) || message.content);

    return (
        <ModalRoot {...modalProps}>
            <ModalHeader>
                <Forms.FormTitle tag="h2">Edit Message (Local Demo)</Forms.FormTitle>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <Forms.FormText style={{ marginBottom: "8px" }}>
                    This will only change the message locally on your client. Perfect for demonstrating security vulnerabilities.
                </Forms.FormText>
                <TextArea
                    value={content}
                    onChange={setContent}
                    placeholder="Enter new message content..."
                    rows={5}
                />
            </ModalContent>
            <ModalFooter>
                <Button
                    onClick={() => {
                        localEdits.set(key, content);

                        const selectors = [
                            `#chat-messages-${message.id}`,
                            `[id*="${message.id}"]`,
                            `li[id*="${message.id}"]`,
                            `div[id*="${message.id}"]`
                        ];

                        let found = false;
                        for (const selector of selectors) {
                            const messageElements = document.querySelectorAll(selector);

                            if (messageElements.length > 0) {
                                messageElements.forEach(element => {
                                    const textContent =
                                        element.querySelector('[class*="messageContent"]') ||
                                        element.querySelector('[class*="message-content"]') ||
                                        element.querySelector('[class*="markup"]') ||
                                        element.querySelector('div[class*="content"] > div');

                                    if (textContent) {
                                        textContent.textContent = content;
                                        found = true;
                                    }
                                });

                                if (found) break;
                            }
                        }

                        modalProps.onClose();
                    }}
                >
                    Save Local Edit
                </Button>
                <Button
                    color={Button.Colors.TRANSPARENT}
                    onClick={modalProps.onClose}
                >
                    Cancel
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message) return;

    const key = `${message.channel_id}-${message.id}`;
    const hasLocalEdit = localEdits.has(key);
    const hasLocalDelete = localDeletes.has(key);

    children.push(
        <Menu.MenuGroup id="vc-local-message-editor">
            <Menu.MenuItem
                id="vc-local-edit"
                label={hasLocalEdit ? "Edit Again (Local)" : "Edit Message (Local)"}
                action={() => {
                    openModal(props => <EditModal message={message} modalProps={props} />);
                }}
            />
            {(hasLocalEdit || hasLocalDelete) &&
                <Menu.MenuItem
                    id="vc-local-restore"
                    label="Restore Original Message"
                    action={() => {
                        localEdits.delete(key);
                        localDeletes.delete(key);

                        FluxDispatcher.dispatch({
                            type: "MESSAGE_UPDATE",
                            message: {
                                id: message.id,
                                channel_id: message.channel_id
                            }
                        });
                    }}
                />
            }
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "LocalMessageEditor",
    description: "Edit and delete any message locally to demonstrate Discord security vulnerabilities",
    authors: [{ name: "HENTUX", id: 1389444830882562131n }],

    patches: [],

    checkDeleted(message: any) {
        if (!message) return false;
        return isLocallyDeleted(message.channel_id, message.id);
    },

    getContent(message: any) {
        if (!message) return message?.content;
        const edited = getLocalEdit(message.channel_id, message.id);
        return edited !== undefined ? edited : message.content;
    },

    contextMenus: {
        "message": messageCtxPatch
    },

    start() {
        if (PermissionStore?.can) {
            originalCan = PermissionStore.can;
            PermissionStore.can = function() {
                return true;
            };
        }

        if (MessageActions?.deleteMessage) {
            originalDeleteMessage = MessageActions.deleteMessage;
            MessageActions.deleteMessage = function(channelId: string, messageId: string) {
                const key = `${channelId}-${messageId}`;
                localDeletes.add(key);

                FluxDispatcher.dispatch({
                    type: "MESSAGE_DELETE",
                    id: messageId,
                    channelId: channelId
                });

                return Promise.resolve();
            };
        }
    },

    stop() {
        if (originalCan && PermissionStore) {
            PermissionStore.can = originalCan;
        }
        if (originalDeleteMessage && MessageActions) {
            MessageActions.deleteMessage = originalDeleteMessage;
        }

        localEdits.clear();
        localDeletes.clear();
    }

});
