<script setup lang="ts">
import {
  ReadFileService,
  ReadFileServiceKey,
} from "@/services/readfile-service";
import FileSelector from "@/components/viewer/FileSelector.vue";
import { onBeforeUnmount, onMounted, provide } from "vue";
import type { FileData } from "@/interfaces/file-data";
import { useFileStore } from "@/store/fileStore";
import { useRouter } from "vue-router";

const readFileService = new ReadFileService();
provide(ReadFileServiceKey, readFileService);

const fileStore = useFileStore();
const router = useRouter();

function handleReadFileComplete(event: FileData) {
  fileStore.pushFile(event);
  router.push({
    path: `/view/0`,
  });
}

onMounted(() => {
  readFileService.onComplete.on(handleReadFileComplete);
});

onBeforeUnmount(() => {
  readFileService.onComplete.off(handleReadFileComplete);
});

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  const file = event.dataTransfer?.files.item(0);
  if (file) readFileService.readFile(file);
};
</script>
<template>
  <div @dragover.prevent @drop="handleDrop">
    <file-selector></file-selector>
  </div>
</template>
