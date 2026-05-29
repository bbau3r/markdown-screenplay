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

    it("extracts characters and strips quotes from their colors", () => {
        const service = new ReadFileService();

        const result = service.processContent(
            [
                "---",
                "title: Test Title",
                "characters:",
                "  ALICE:",
                "    color: '#ff0000'",
                "  BOB:",
                "    color: \"#00ff00\"",
                "---",
                "# INT. ROOM - NIGHT",
            ].join("\n"),
            "sample.mdsp",
        );

        expect(result.characters).toEqual([
            { name: "ALICE", color: "#ff0000" },
            { name: "BOB", color: "#00ff00" },
        ]);
    });
});
