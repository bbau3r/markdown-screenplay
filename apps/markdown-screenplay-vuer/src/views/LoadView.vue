<script setup lang="ts">
import {
  ReadFileService,
  ReadFileServiceKey,
} from "@/services/readfile-service";
import FileSelector from "@/components/viewer/FileSelector.vue";
import { onBeforeUnmount, onMounted, provide, computed } from "vue";
import type { FileData } from "@/interfaces/file-data";
import { useFileStore } from "@/store/fileStore";
import { useRouter } from "vue-router";

const readFileService = new ReadFileService();
provide(ReadFileServiceKey, readFileService);

const fileStore = useFileStore();
const router = useRouter();

const samplesGlob = import.meta.glob('../../../../samples/*.mdsp', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const samplesList = computed(() => {
  return Object.keys(samplesGlob).map((path) => {
    const filename = path.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.mdsp$/i, '');
    const cleanName = nameWithoutExt.replace(/_/g, ' ');
    const displayName = cleanName
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    
    return {
      filename,
      displayName,
      routePath: `/samples/${nameWithoutExt}`
    };
  });
});

function handleReadFileComplete(event: FileData) {
  fileStore.pushFile(event);
  router.push({
    path: `/view/${fileStore.files.length - 1}`,
  });
}

const loadFile = (file?: File | null) => {
  if (file) {
    readFileService.readFile(file);
  }
};

type LaunchQueueConsumer = {
  setConsumer: (
    consumer: (launchParams: {
      files: FileSystemFileHandle[];
    }) => void | Promise<void>,
  ) => void;
};

const handleLaunchQueue = () => {
  const launchQueue = (window as Window & { launchQueue?: LaunchQueueConsumer })
    .launchQueue;

  if (!launchQueue) {
    return;
  }

  launchQueue.setConsumer(async (launchParams) => {
    const [fileHandle] = launchParams.files;

    if (!fileHandle) {
      return;
    }

    const file = await fileHandle.getFile();
    loadFile(file);
  });
};

onMounted(() => {
  readFileService.onComplete.on(handleReadFileComplete);
  handleLaunchQueue();
});

onBeforeUnmount(() => {
  readFileService.onComplete.off(handleReadFileComplete);
});

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  const file = event.dataTransfer?.files.item(0);
  loadFile(file);
};
</script>

<template>
  <div @dragover.prevent @drop="handleDrop">
    <file-selector></file-selector>

    <div class="mx-auto px-6" style="max-width: 450px;">
      <!-- Divider with Text -->
      <div class="d-flex align-center my-6">
        <v-divider class="flex-grow-1" />
        <span class="mx-4 text-overline text-medium-emphasis font-weight-bold text-no-wrap">Sample Files</span>
        <v-divider class="flex-grow-1" />
      </div>

      <!-- Flex Wrap Grid of Samples -->
      <div class="d-flex flex-wrap justify-center ga-3 pb-6">
        <v-btn
          v-for="sample in samplesList"
          :key="sample.filename"
          color="secondary"
          variant="tonal"
          rounded
          :to="sample.routePath"
          prepend-icon="mdi-file-document-outline"
        >
          {{ sample.displayName }}
        </v-btn>
      </div>
    </div>
  </div>
</template>
