import { Suspense, lazy } from "react";
import type { ComponentProps } from "react";

// The picker carries the emoji name and category data (about 0.4 MB), so
// load it only when a picker actually opens.
const EmojiPicker = lazy(async () => import("./emoji-picker"));

function LazyEmojiPicker(props: ComponentProps<typeof EmojiPicker>): JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-sm">Loading emoji…</div>}>
      <EmojiPicker {...props} />
    </Suspense>
  );
}

export default LazyEmojiPicker;
