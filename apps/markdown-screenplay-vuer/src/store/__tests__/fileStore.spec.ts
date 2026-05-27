import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import { useFileStore } from "../fileStore";
import type { FileData } from "@/interfaces/file-data";

const buildFile = (): FileData => ({
    content: [
        '<center class="title-section">',
        '<title>Old Title</title><h1>OLD TITLE</h1>',
        '<h2>Written by:<br/>Old Author</h2>',
        '</center>',
        '<div><p>version: 1.0</p></div>',
        '<hr/>',
        '<p class="section">Body content</p>',
    ].join("\n"),
    scenes: [],
    characters: [],
    fileName: "sample.mdsp",
    metadata: {
        title: "Old Title",
        version: "1.0",
        authors: ["Old Author"],
    },
});

describe("fileStore", () => {
    it("rebuilds rendered content when metadata changes", () => {
        setActivePinia(createPinia());
        const fileStore = useFileStore();

        fileStore.pushFile(buildFile());

        fileStore.updateMetadata(0, {
            title: "New Title",
            version: "2.0",
            authors: ["Alice", "Bob"],
        });

        expect(fileStore.getFile(0)?.metadata).toEqual({
            title: "New Title",
            version: "2.0",
            authors: ["Alice", "Bob"],
        });
        expect(fileStore.getFile(0)?.content).toContain("<title>New Title</title>");
        expect(fileStore.getFile(0)?.content).toContain("<h1>NEW TITLE</h1>");
        expect(fileStore.getFile(0)?.content).toContain("Written by:<br/>Alice and Bob");
        expect(fileStore.getFile(0)?.content).toContain("<p>version: 2.0</p>");
        expect(fileStore.getFile(0)?.content).toContain("<p class=\"section\">Body content</p>");
    });
});
