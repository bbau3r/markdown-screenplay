<script setup lang="ts">
import { ReadFileService, ReadFileServiceKey } from '@/services/readfile-service'
import { inject, ref } from 'vue'

// Services
const readFileService = inject<ReadFileService>(ReadFileServiceKey)

// HTML Element References
const fileInput = ref<HTMLInputElement | null>(null)

// Methods
const openFilePicker = () => {
  fileInput.value?.click()
}

const handleFile = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.item(0)
  if (file) readFileService?.readFile(file)
}
</script>

<template>
  <div class="mx-6">
    <input type="file" ref="fileInput" @change="handleFile" accept=".msd" hidden />
    <v-hover>
      <template v-slot:default="{ isHovering, props }">
        <v-card
          border="opacity-50 sm"
          variant="outlined"
          v-bind="props"
          :color="isHovering ? 'secondary' : 'undefined'"
          class="mt-16 pa-8 text-center mx-auto cursor-pointer color-box"
          max-width="450px"
          width="100%"
          elevation="12"
          rounded="lg"
          @click="openFilePicker"
        >
          <v-icon class="mb-5" color="secondary" icon="mdi-folder-open-outline" size="112">
          </v-icon>
          <h2 class="htext-h5 mb-6">Tap or drag <code>*.msd</code> file to load.</h2>
        </v-card>
      </template>
    </v-hover>
    <!--
      <center class="my-4">
        <v-btn color="secondary" variant="outlined" @click="handleGetDocs"
          ><v-icon left>mdi-google-drive</v-icon> Google Drive</v-btn
        >
      </center> -->
  </div>
</template>
