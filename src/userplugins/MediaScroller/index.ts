import definePlugin from "@utils/types";

export default definePlugin({
    name: "Gallery Scroller",
    description: "Scroll up/down to go to the previous/next media in Discord's media viewer.",

    // Intercept wheel events only when the media viewer is open
    patches: [
        {
            find: "carouselModal_",
            replacement: {
                // Discord uses a React component with this className
                match: /className:\s*["'][^"']*carouselModal_[^"']*["']/,
                replace: "$& onWheel={window.MediaViewerScrollWheel_onWheel}"
            }
        }
    ],

    start() {
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;

            const prevBtn = document.querySelector<HTMLElement>('[aria-label="Previous"]');
            const nextBtn = document.querySelector<HTMLElement>('[aria-label="Next"]');

            if (!prevBtn || !nextBtn) return;

            e.preventDefault();
            e.stopPropagation();

            if (e.deltaY > 0) {
                nextBtn.click();
            } else {
                prevBtn.click();
            }
        };

        const observer = new MutationObserver(() => {
            const modal = document.querySelector(".carouselModal_");
            if (modal) {
                modal.addEventListener("wheel", onWheel, { passive: false });
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        (window as any).MediaViewerScrollWheel_onWheel = onWheel;
        (window as any).MediaViewerScrollWheel_observer = observer;
    },

    stop() {
        const observer: MutationObserver = (window as any).MediaViewerScrollWheel_observer;
        if (observer) observer.disconnect();

        const modal = document.querySelector(".carouselModal_");
        const handler: EventListener = (window as any).MediaViewerScrollWheel_onWheel;
        if (modal && handler) modal.removeEventListener("wheel", handler);

        delete (window as any).MediaViewerScrollWheel_onWheel;
        delete (window as any).MediaViewerScrollWheel_observer;
    }
});
