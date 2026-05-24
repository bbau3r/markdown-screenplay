<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import MetaDataSection from "@/components/viewer/MetaDataSection.vue";
import { useFileStore } from "@/store/fileStore";
import type { MetadataData } from "@/interfaces/file-data";

const fileStore = useFileStore();
const route = useRoute();
const router = useRouter();

const fileId = computed(() => Number(route.params.id));
const file = computed(() => fileStore.getFile(fileId.value));

watch(
  file,
  (value) => {
    if (!value) {
      router.replace({ path: "/" });
    }
  },
  { immediate: true },
);

const handleMetadataUpdate = (metadata: MetadataData) => {
  fileStore.updateMetadata(fileId.value, metadata);
};
</script>

<template>
  <v-container fluid class="pa-4">
    <v-row justify="center">
      <v-col cols="12" lg="8">
        <div class="d-flex flex-column ga-4">
          <div>
            <h1 class="text-h5 font-weight-bold mb-1">Editor</h1>
            <p class="text-body-2 text-medium-emphasis">
              Update the metadata for the active screenplay.
            </p>
          </div>

          <MetaDataSection
            v-if="file"
            :file="file"
            @update:metadata="handleMetadataUpdate"
          />
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>
