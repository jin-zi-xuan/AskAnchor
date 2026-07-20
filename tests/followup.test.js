import { describe, expect, it, vi } from "vitest";

function loadFollowUpModule() {
  globalThis.AskAnchorModules = {};
  delete require.cache[require.resolve("../src/content/followup.js")];
  require("../src/content/followup.js");
  return globalThis.AskAnchorModules.followup;
}

describe("follow-up anchor creation", () => {
  it("keeps the original live selection instead of resolving duplicate text again", () => {
    const followup = loadFollowUpModule();
    const originalRange = {
      id: "original",
      cloneRange: () => ({
        id: "original-copy",
        cloneRange: () => ({ id: "original-marker-copy" })
      })
    };
    const resolvedRange = {
      id: "wrong-duplicate",
      cloneRange: () => ({ id: "wrong-duplicate-copy" })
    };
    const resolveAnchorRange = vi.fn(() => resolvedRange);
    const addAnchor = vi.fn((anchor) => anchor);
    const createSelectionMarker = vi.fn();
    const scrollPosition = { container: { id: "chat-scroll" }, containerTop: 420, windowTop: 0 };

    const module = followup({
      resolveAnchorRange,
      isAnchorRangeUsable: (range) => range === originalRange,
      createSelectionMarker,
      getRangeHighlightTarget: () => null,
      addAnchor
    });

    module.createAnchorFromPendingFollowUp({
      anchorDraft: {
        text: "重复文本",
        range: originalRange,
        selector: { exact: "重复文本" },
        messageLocator: { assistantIndex: 1 },
        anchorVersion: 2,
        element: { id: "answer" },
        scrollY: 100,
        scrollPosition
      }
    });

    expect(resolveAnchorRange).not.toHaveBeenCalled();
    expect(addAnchor).toHaveBeenCalledWith(expect.objectContaining({
      range: expect.objectContaining({ id: "original-copy" }),
      scrollPosition
    }));
  });
});
