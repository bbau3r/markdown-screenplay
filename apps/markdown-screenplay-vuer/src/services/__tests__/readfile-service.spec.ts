import { describe, expect, it } from "vitest";
import { ReadFileService } from "../readfile-service";

describe("ReadFileService", () => {
    it("extracts metadata from the YAML block", () => {
        const service = new ReadFileService();

        const result = service.processContent(
            [
                "---",
                "title: Test Title",
                "version: 1.2",
                "authors:",
                "  - Alice",
                "  - Bob",
                "---",
                "@ INT. ROOM - NIGHT",
            ].join("\n"),
            "sample.mdsp",
        );

        expect(result.metadata).toEqual({
            title: "Test Title",
            version: "1.2",
            authors: ["Alice", "Bob"],
        });
    });
});
