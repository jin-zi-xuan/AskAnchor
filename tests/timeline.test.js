import { beforeEach, describe, expect, it } from "vitest";

const core = require("../src/core.js");

function createMessage(text) {
  return {
    innerText: text,
    textContent: text,
    children: [],
    contains(node) {
      return this === node || this.children.includes(node);
    }
  };
}

function createTimelineModule() {
  delete globalThis.AskAnchorModules;
  delete require.cache[require.resolve("../src/content/timeline.js")];
  require("../src/content/timeline.js");

  return globalThis.AskAnchorModules.timeline({
    normalizeComparableText: core.normalizeComparableText
  });
}

describe("conversation timeline", () => {
  beforeEach(() => {
    delete globalThis.AskAnchorModules;
  });

  it("deduplicates nested matches for the same user question", () => {
    const timeline = createTimelineModule();
    const outerQuestion = createMessage("How do I deploy this?");
    const innerQuestion = createMessage("How do I deploy this?");
    outerQuestion.children.push(innerQuestion);

    const distinctMessages = timeline.getDistinctTimelineMessages([
      innerQuestion,
      outerQuestion,
      createMessage("How do I test this?")
    ]);

    expect(distinctMessages).toEqual([
      outerQuestion,
      expect.objectContaining({ innerText: "How do I test this?" })
    ]);
  });

  it("deduplicates repeated selector hits with matching question text", () => {
    const timeline = createTimelineModule();

    expect(timeline.getDistinctTimelineMessages([
      createMessage(" Explain this error "),
      createMessage("Explain   this error"),
      createMessage("Explain the fix")
    ])).toHaveLength(2);
  });
});
