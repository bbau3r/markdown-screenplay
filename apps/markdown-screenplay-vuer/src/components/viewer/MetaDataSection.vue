<script setup lang="ts">
import { reactive, watch } from "vue";
import type { FileData, MetadataData } from "@/interfaces/file-data";

const props = defineProps<{
  file: FileData | null;
}>();

const emit = defineEmits<{
  (e: "update:metadata", value: MetadataData): void;
}>();

const panel = defineModel<number[] | null>({ default: () => [0] });

const draft = reactive<MetadataData>({
  title: props.file?.metadata?.title ?? "",
  version: props.file?.metadata?.version ?? "",
  authors: props.file?.metadata?.authors?.length
    ? [...props.file.metadata.authors]
    : [""],
});

const syncDraft = (value?: MetadataData | null) => {
  const authors = value?.authors?.length ? [...value.authors] : [""];

  draft.title = value?.title ?? "";
  draft.version = value?.version ?? "";
  draft.authors = authors;
};

watch(
  () => props.file?.metadata,
  (value) => syncDraft(value),
  { deep: true },
);

const normalizeMetadata = (value: MetadataData): MetadataData => {
  const authors = value.authors.map((author) => author.trim());

  return {
    title: value.title.trim(),
    version: value.version.trim(),
    authors: authors.length > 0 ? authors : [""],
  };
};

watch(
  draft,
  () => {
    emit("update:metadata", normalizeMetadata(draft));
  },
  { deep: true },
);

const addAuthor = () => {
  draft.authors.push("");
};

const removeAuthor = (index: number) => {
  if (draft.authors.length === 1) {
    draft.authors[0] = "";
    return;
  }

  draft.authors.splice(index, 1);
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
              v-model="draft.title"
              variant="outlined"
              density="comfortable"
              hide-details
            />

            <div class="text-body-2 font-weight-medium">Version</div>
            <v-text-field
              v-model="draft.version"
              variant="outlined"
              density="comfortable"
              hide-details
            />

            <div>
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="text-body-2 font-weight-medium">Authors</div>
                <v-btn
                  color="primary"
                  variant="tonal"
                  size="small"
                  prepend-icon="mdi-plus"
                  @click="addAuthor"
                >
                  Add author
                </v-btn>
              </div>

              <div class="d-flex flex-column ga-3">
                <div
                  v-for="(author, index) in draft.authors"
                  :key="`${author}-${index}`"
                  class="d-flex align-center ga-2"
                >
                  <v-text-field
                    v-model="draft.authors[index]"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    class="flex-grow-1"
                  />
                  <v-btn
                    icon
                    variant="text"
                    color="error"
                    @click="removeAuthor(index)"
                    :disabled="draft.authors.length === 1"
                  >
                    <v-icon>mdi-close</v-icon>
                  </v-btn>
                </div>
              </div>
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </v-card>
</template>
