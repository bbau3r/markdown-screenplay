<script setup lang="ts">
import { computed, watch, onMounted, inject, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import MetaDataSection from "@/components/viewer/MetaDataSection.vue";
import CharactersEditSection from "@/components/editor/CharactersEditSection.vue";
import EditorContent from "@/components/editor/EditorContent.vue";
import { useFileStore } from "@/store/fileStore";
import { useEditorStore } from "@/store/editorStore";
import type { MetadataData, CharacterFileData } from "@/interfaces/file-data";
import { AppBarServiceKey, type AppBarService } from "@/services/app-bar-service";

const fileStore = useFileStore();
const editorStore = useEditorStore();
const route = useRoute();
const router = useRouter();
const { smAndUp } = useDisplay();
const appBarService = inject<AppBarService>(AppBarServiceKey);

const fileId = computed(() => Number(route.params.id));
const file = computed(() => fileStore.getFile(fileId.value));

const fileName = computed({
  get: () => file.value?.fileName ?? "",
  set: (val) => {
    if (file.value) {
      fileStore.updateFileName(fileId.value, val);
      if (appBarService) {
        appBarService.textOverride = val;
      }
    }
  }
});

// Redirect if file doesn't exist
watch(
  file,
  (value) => {
    if (!value) {
      router.replace({ path: "/" });
    }
  },
  { immediate: true },
);

function loadFileIntoEditor() {
  if (file.value) {
    editorStore.loadFromRawContent(file.value.rawContent);
    editorStore.setMetadata({ ...file.value.metadata });
    editorStore.setCharacters(file.value.characters.map((c) => ({ ...c })));
    editorStore.clearHistory();
  }
}

function focusActiveTab() {
  nextTick(() => {
    const activeTab = document.querySelector(".v-navigation-drawer .v-list-item--active");
    if (activeTab) {
      (activeTab as HTMLElement).focus();
    }
  });
}

onMounted(() => {
  loadFileIntoEditor();
  focusActiveTab();
});

// Reload editor if we switch to a different file
watch(fileId, () => {
  loadFileIntoEditor();
  focusActiveTab();
});

// Watch editor contents and write back to fileStore to keep viewer in sync
watch(
  () => editorStore.serializedMdsp,
  (newBody) => {
    if (file.value) {
      fileStore.updateBody(fileId.value, newBody);
    }
  },
);

// Watch editor metadata and write back to fileStore to keep in sync (including during undo/redo)
watch(
  () => editorStore.metadata,
  (newMeta) => {
    if (file.value) {
      fileStore.updateMetadata(fileId.value, { ...newMeta });
    }
  },
  { deep: true }
);

// Watch editor characters and write back to fileStore to keep in sync (including during undo/redo)
watch(
  () => editorStore.characters,
  (newChars) => {
    if (file.value) {
      fileStore.updateCharacters(fileId.value, newChars.map((c) => ({ ...c })));
    }
  },
  { deep: true }
);

const handleMetadataUpdate = (metadata: MetadataData) => {
  editorStore.setMetadata(metadata, true);
};

const handleCharactersUpdate = (characters: CharacterFileData[]) => {
  editorStore.setCharacters(characters, true);
};
</script>

<template>
  <v-container fluid class="editor-view pa-0">
    <v-row justify="center" no-gutters>
      <v-col cols="12" lg="11" xl="10">
        <div class="d-flex flex-column editor-view__layout">
          <!-- Header -->
          <div class="editor-view__header px-4 pt-4 mb-4 d-flex align-center ga-3">
            <v-icon color="primary" size="28">mdi-file-edit-outline</v-icon>
            <v-text-field
              v-model="fileName"
              variant="outlined"
              density="compact"
              hide-details
              placeholder="File Name"
              class="bg-surface rounded flex-grow-1"
            />
          </div>

          <!-- Responsive Layout Grid -->
          <v-row no-gutters class="px-4 pb-4 flex-grow-1">
            <!-- Left Area: Editor -->
            <v-col
              cols="12"
              md="8"
              class="pr-md-4 mb-4 mb-md-0 d-flex flex-column"
              order="2"
              order-md="1"
            >
              <v-sheet
                class="editor-view__body flex-grow-1 elevation-3"
                :rounded="smAndUp ? 'lg' : '0'"
              >
                <EditorContent />
              </v-sheet>
            </v-col>

            <!-- Right Area: Sidebar (Metadata & Characters) -->
            <v-col
              cols="12"
              md="4"
              order="1"
              order-md="2"
              class="editor-view__sidebar"
            >
              <MetaDataSection
                v-if="file"
                :file="file"
                @update:metadata="handleMetadataUpdate"
              />
              <CharactersEditSection
                v-if="file"
                :file="file"
                @update:characters="handleCharactersUpdate"
              />
            </v-col>
          </v-row>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.editor-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.editor-view__layout {
  min-height: calc(100vh - 64px);
}

.editor-view__header {
  flex-shrink: 0;
}

.editor-view__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 400px;
  overflow: hidden;
}

.editor-view__sidebar {
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--v-theme-on-surface), 0.12) transparent;
}

@media (min-width: 960px) {
  .editor-view__sidebar {
    position: sticky;
    top: 16px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    padding-right: 4px;
  }

  .editor-view__sidebar::-webkit-scrollbar {
    width: 6px;
  }
  .editor-view__sidebar::-webkit-scrollbar-track {
    background: transparent;
  }
  .editor-view__sidebar::-webkit-scrollbar-thumb {
    background: rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 3px;
  }
  .editor-view__sidebar::-webkit-scrollbar-thumb:hover {
    background: rgba(var(--v-theme-on-surface), 0.25);
  }
}
</style>
