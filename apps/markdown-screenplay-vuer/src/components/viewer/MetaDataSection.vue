<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { FileData, MetadataData } from "@/interfaces/file-data";

const props = defineProps<{
  file: FileData | null;
}>();

const emit = defineEmits<{
  (e: "update:metadata", value: MetadataData): void;
}>();

const panel = defineModel<number[] | null>({ default: () => [0] });

// ── Local draft state ────────────────────────────────────────────
// Use refs instead of reactive to avoid circular watch issues.
const draftTitle = ref(props.file?.metadata?.title ?? "");
const draftVersion = ref(props.file?.metadata?.version ?? "");
const draftAuthors = ref<string[]>(
  props.file?.metadata?.authors?.length
    ? [...props.file.metadata.authors]
    : [""],
);

// Track whether we're currently emitting to avoid circular updates
let emitting = false;

// Sync from prop changes (e.g. when a different file is loaded)
watch(
  () => props.file?.metadata,
  (value) => {
    if (emitting) return;
    draftTitle.value = value?.title ?? "";
    draftVersion.value = value?.version ?? "";
    draftAuthors.value = value?.authors?.length ? [...value.authors] : [""];
  },
  { deep: true },
);

// Emit on changes — guarded against re-entry
function emitUpdate() {
  emitting = true;
  const authors = draftAuthors.value.map((a) => a.trim());
  emit("update:metadata", {
    title: draftTitle.value.trim(),
    version: draftVersion.value.trim(),
    authors: authors.length > 0 ? authors : [""],
  });
  nextTick(() => {
    emitting = false;
  });
}

watch(draftTitle, emitUpdate);
watch(draftVersion, emitUpdate);
watch(draftAuthors, emitUpdate, { deep: true });

// ── Author management ────────────────────────────────────────────
const authorInputRefs = ref<(HTMLInputElement | null)[]>([]);

const addAuthor = () => {
  draftAuthors.value.push("");
  nextTick(() => {
    const last = authorInputRefs.value[authorInputRefs.value.length - 1];
    last?.focus();
  });
};

const removeAuthor = (index: number) => {
  if (draftAuthors.value.length === 1) {
    draftAuthors.value[0] = "";
    return;
  }
  draftAuthors.value.splice(index, 1);
};

const handleAuthorKeydown = (event: KeyboardEvent, index: number) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addAuthor();
  }
  if (
    event.key === "Backspace" &&
    draftAuthors.value[index] === "" &&
    draftAuthors.value.length > 1
  ) {
    event.preventDefault();
    removeAuthor(index);
    // Focus the previous field
    nextTick(() => {
      const prev = authorInputRefs.value[Math.max(0, index - 1)];
      prev?.focus();
    });
  }
};
</script>

<template>
  <v-card class="mb-4" elevation="2" rounded="lg">
    <v-expansion-panels v-model="panel" multiple>
      <v-expansion-panel value="0">
        <v-expansion-panel-title>
          <div class="d-flex align-center justify-space-between w-100">
            <span class="text-subtitle-1 font-weight-bold">Metadata</span>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="d-flex flex-column ga-4">
            <div class="text-body-2 font-weight-medium">Title</div>
            <v-text-field
              v-model="draftTitle"
              variant="outlined"
              density="comfortable"
              hide-details
            />

            <div class="text-body-2 font-weight-medium">Version</div>
            <v-text-field
              v-model="draftVersion"
              variant="outlined"
              density="comfortable"
              hide-details
            />

            <div>
              <div class="text-body-2 font-weight-medium mb-2">Authors</div>

              <div class="d-flex flex-column ga-2">
                <div
                  v-for="(_author, index) in draftAuthors"
                  :key="index"
                  class="author-row"
                >
                  <div class="author-field">
                    <input
                      :ref="(el) => { authorInputRefs[index] = el as HTMLInputElement }"
                      v-model="draftAuthors[index]"
                      class="author-input"
                      :placeholder="`Author ${index + 1}`"
                      spellcheck="false"
                      @keydown="handleAuthorKeydown($event, index)"
                    />
                    <button
                      v-if="draftAuthors.length > 1"
                      class="author-remove-btn"
                      @click="removeAuthor(index)"
                      tabindex="-1"
                      type="button"
                    >
                      <v-icon size="16">mdi-close</v-icon>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Add author: small circular + button -->
              <div class="d-flex justify-center mt-2">
                <v-btn
                  icon
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  @click="addAuthor"
                >
                  <v-icon size="18">mdi-plus</v-icon>
                </v-btn>
              </div>
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </v-card>
</template>

<style scoped>
.author-row {
  position: relative;
}

.author-field {
  display: flex;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
  border-radius: 4px;
  transition: border-color 0.2s ease;
  overflow: hidden;
}

.author-field:focus-within {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

.author-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 14px;
  padding: 10px 12px;
  font-family: inherit;
  line-height: 1.5;
}

.author-input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.35);
}

.author-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 100%;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.3);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
  padding: 0;
}

.author-row:hover .author-remove-btn,
.author-field:focus-within .author-remove-btn {
  opacity: 1;
}

.author-remove-btn:hover {
  color: rgb(var(--v-theme-error));
}
</style>
