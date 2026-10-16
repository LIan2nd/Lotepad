import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PageContent } from "../../types";
const transport = vi.hoisted(() => vi.fn());
vi.mock("./runtime", () => ({ native: transport, isDesktop: true }));
import { NativeRepository } from "./repository";
beforeEach(() => {
  transport.mockReset();
});
function scene(id = "page-a"): PageContent {
  return {
    pageId: id,
    revision: 4,
    elements: [],
    appState: {},
    initialized: true,
    files: {
      photo: {
        id: "photo" as never,
        dataURL: "data:image/png;base64,aGVsbG8=" as never,
        mimeType: "image/png",
        created: 1,
      },
    },
  };
}
describe("typed native persistence transport", () => {
  it("sends changed media only and advances the revision only after a confirmed write", async () => {
    const repo = new NativeRepository(),
      content = scene();
    transport.mockResolvedValueOnce(content);
    await repo.loadContent(content.pageId);
    transport.mockResolvedValueOnce(5);
    await repo.saveContent(content);
    expect(transport.mock.calls[1][1].request).toMatchObject({
      type: "saveContent",
      expectedRevision: 4,
      fileIds: ["photo"],
      content: { files: {} },
    });
    const changed = {
      ...content,
      files: {
        photo: {
          ...content.files.photo,
          dataURL: "data:image/png;base64,bmV3" as never,
        },
      },
    };
    transport.mockResolvedValueOnce(6);
    await repo.saveContent(changed);
    expect(transport.mock.calls[2][1].request.expectedRevision).toBe(5);
    expect(transport.mock.calls[2][1].request.content.files.photo).toEqual(
      changed.files.photo,
    );
  });
  it("keeps revisions and page identifiers isolated across failed and successful saves", async () => {
    const repo = new NativeRepository(),
      a = scene(),
      b = scene("page-b");
    transport.mockResolvedValueOnce(a);
    await repo.loadContent(a.pageId);
    transport.mockRejectedValueOnce(new Error("disk full"));
    await expect(repo.saveContent(a)).rejects.toThrow("disk full");
    transport.mockResolvedValueOnce({ ...b, revision: 9 });
    await repo.loadContent(b.pageId);
    transport.mockResolvedValueOnce(10);
    await repo.saveContent(b);
    transport.mockResolvedValueOnce(5);
    await repo.saveContent(a);
    expect(transport.mock.calls.at(-1)![1].request).toMatchObject({
      expectedRevision: 4,
      content: { pageId: "page-a" },
    });
    expect(transport.mock.calls[3][1].request).toMatchObject({
      expectedRevision: 9,
      content: { pageId: "page-b" },
    });
  });
  it("serializes rapid metadata read-modify-write operations with native compare-and-set", async () => {
    const repo = new NativeRepository();
    let stored = "0";
    transport.mockImplementation(
      async (
        _command: string,
        args: { request: { type: string; value: string; expected: string } },
      ) => {
        const request = args.request;
        if (request.type === "getMeta") return stored;
        if (request.type === "compareMeta") {
          expect(request.expected).toBe(stored);
          stored = request.value;
          return null;
        }
        throw new Error("Unexpected command");
      },
    );
    await Promise.all(
      Array.from({ length: 8 }, () =>
        repo.updateMeta("counter", (value) => String(Number(value) + 1)),
      ),
    );
    expect(stored).toBe("8");
  });
});
