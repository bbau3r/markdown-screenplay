<script setup lang="ts">
import { computed, watch, onMounted, inject } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import MetaDataSection from "@/components/viewer/MetaDataSection.vue";
import EditorContent from "@/components/editor/EditorContent.vue";
import { useFileStore } from "@/store/fileStore";
import { useEditorStore } from "@/store/editorStore";
import type { MetadataData } from "@/interfaces/file-data";
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
  }
}

onMounted(() => {
  loadFileIntoEditor();
});

// Reload editor if we switch to a different file
watch(fileId, () => {
  loadFileIntoEditor();
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

const handleMetadataUpdate = (metadata: MetadataData) => {
  fileStore.updateMetadata(fileId.value, metadata);
  editorStore.setMetadata(metadata);
};
</script>

<template>
  <v-container fluid class="editor-view pa-0">
    <v-row justify="center" no-gutters>
      <v-col cols="12" lg="9" xl="8">
        <div class="d-flex flex-column editor-view__layout">
          <!-- Header -->
          <div class="editor-view__header px-4 pt-4 mb-7 d-flex align-center ga-3">
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

          <!-- Metadata section (collapsible) -->
          <div class="px-4">
            <MetaDataSection
              v-if="file"
              :file="file"
              @update:metadata="handleMetadataUpdate"
            />
          </div>

          <!-- Editor body -->
          <v-sheet class="editor-view__body ma-sm-3 ma-0" elevation="3" :rounded="smAndUp ? 'lg' : '0'">
            <EditorContent />
          </v-sheet>
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
</style>
