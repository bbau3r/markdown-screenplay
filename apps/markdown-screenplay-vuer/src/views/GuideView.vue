<script setup lang="ts">
import sampleContent from "../../../../samples/12_angry_men.mdsp?raw";
import { ReadFileService } from "@/services/readfile-service";
import { useFileStore } from "@/store/fileStore";
import { useRouter } from "vue-router";

const readFileService = new ReadFileService();
const fileStore = useFileStore();
const router = useRouter();

function loadSample() {
  const file = readFileService.processContent(
    sampleContent,
    "12_angry_men.mdsp",
  );
  fileStore.pushFile(file);
  router.push({ path: "/view/0" });
}
</script>
<style scoped>
code {
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  padding: 2px 6px;
  border-radius: 4px;
}
code,
.inline-code {
  font-family: "Fira Code", monospace;
  font-size: 0.95rem;
}
</style>

<template>
  <div class="mx-4 my-2">
    <h1>Markdown Screenplay</h1>
    <p>
      <b>markdown-screenplay</b> is a minimalist markup format for writing
      screenplays.
    </p>
    <p>
      Files use the <code>.mdsp</code> extension. Which can be loaded into this
      app's built-in viewer.
    </p>
    <p>
      This site is a Progressive Web App (PWA), so it works offline once
      installed or cached.
    </p>

    <h2>Basics</h2>
    <ul>
      <li><code>:</code> Scene Transition (e.g., <code>: CUT TO:</code>)</li>
      <li>
        <code>@</code> Scene Heading (e.g., <code>@ INT. KITCHEN – NIGHT</code>)
      </li>
      <li><code>></code> Character name / dialog block initiator</li>
      <li>
        <code>>> (...)</code> Parenthetical direction (e.g.,
        <code>>> (whispers)</code>)
      </li>
      <li><code>>></code> Dialog line that belongs to the active character</li>
      <li><code>**Bold Text**</code> → <b>Bold Text</b></li>
      <li><code>*Italicized Text*</code> → <i>Italicized Text</i></li>
      <li><code>_Underline Text_</code> → <u>Underline Text</u></li>
      <li><code>~Strikeout Text~</code> → <s>Strikeout Text</s></li>
      <li>
        <code>^[Superscript]</code> → <sup>Superscript</sup> (e.g.,
        H<sup>2</sup>O)
      </li>
      <li><code>_[Subscript]</code> → <sub>Subscript</sub></li>
    </ul>

    <h2>Metadata</h2>
    <p>
      Screenplay files can include optional metadata using a YAML block at the
      top of the file. This is not required, but allows for enhanced rendering
      features such as title displays, list of characters, or version tracking.
    </p>
    <v-sheet class="ma-2 pa-4" :elevation="12" rounded>
      <div class="inline-code">
        --- <br />
        title: The Last Light <br />
        author: Brian <br />
        version: 1.0 <br />
        ---
      </div>
    </v-sheet>

    Alternatively if there are multiple authors the metadata can be structured
    like this:
    <v-sheet class="ma-2 pa-4" :elevation="12" rounded>
      <div class="inline-code">
        --- <br />
        authors: <br />
        &nbsp;&nbsp;- Brian <br />
        &nbsp;&nbsp;- Alaa <br />
        ---
      </div>
    </v-sheet>

    <h2>Characters</h2>
    <p>
      Characters can be defined in metadata for reference and enhanced features
      like line highlighting or filtering during rehearsal.
    </p>
    <p>
      Use the <code>characters</code> section inside the YAML block like so:
    </p>

    <v-sheet class="ma-2 pa-4" :elevation="12" rounded>
      <div class="inline-code">
        characters: <br />
        &nbsp;&nbsp;- Morgan V <br />
        &nbsp;&nbsp;color: "#d31111"<br />
        &nbsp;&nbsp;- Elia <br />
        &nbsp;&nbsp;color: "#11d311"<br />
      </div>
    </v-sheet>

    <h3>Tagging Characters in the Script</h3>
    <p>
      Tagging characters is optional but allows your screenplay engine or viewer
      to recognize who is speaking or being referenced. This enables:
    </p>
    <ul>
      <li>Role highlighting for rehearsal</li>
      <li>Filtering by character</li>
      <li>Improved metadata linking</li>
    </ul>

    <h4>Supported Character Tagging Methods:</h4>
    <ul>
      <li>
        <code>&Elia</code> or <code>&(Morgan V)</code> — Marks Elia and Morgan
        as present or referenced in the scene. The parenthesis form is required
        when the reference name includes spaces.
      </li>
      <li>
        <code>[Momo](Morgan V)</code> — Displays "Momo" but links to reference
        <code>Morgan V</code>. Useful for nicknames or alternate names.
      </li>
    </ul>

    <h4>Example:</h4>
    <v-sheet class="ma-2 pa-4" :elevation="12" rounded>
      <div class="inline-code">
        <span class="syntax-highlight">:</span> Fade In<br />
        <span class="syntax-highlight">@</span> EXT. PLATFORM – NIGHT<br />
        The train screeches into view as &(Morgan V) checks her watch.<br />
        <span class="syntax-highlight">></span> [Momo](Morgan V)<br />
        <span class="syntax-highlight">>></span> (tense)<br />
        <span class="syntax-highlight">>></span> We’re out of time.<br />
        The wind catches her coat as &Elia arrives.
      </div>
    </v-sheet>
    <p>
      None of these tags are required, but using them allows your viewer/editor
      to detect character involvement and power advanced features like
      filtering, highlighting, and interaction analysis.
    </p>
    <h2>Samples</h2>
    <p>
      Below are sample screenplays, in the markdown format, that can be loaded
      into the viewer:
    </p>
    <v-btn
      class="mt-2"
      color="secondary"
      variant="tonal"
      rounded
      @click="loadSample"
    >
      12 Angry Men
    </v-btn>
  </div>
</template>
