<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { type SceneData } from "@/transformer";
import { useDisplay } from "vuetify";
import CharactersSection from "@/components/viewer/CharactersSection.vue";
import SceneSection from "@/components/viewer/SceneSection.vue";
import { useFileStore } from "@/store/fileStore";
import { useRoute } from "vue-router";
import type { FileData } from "@/interfaces/file-data";

const { mdAndUp } = useDisplay();
const fileStore = useFileStore();
const route = useRoute();

watch(
  () => route.params.id,
  (newVal) => {
    console.log(newVal);
    const id = Number(newVal ?? 0);
    getFileContents(id);
  }
);

function getFileContents(id: number) {
  file.value = fileStore.getFile(id) ?? undefined;
}

const file = ref<FileData | null>(null);

const fileContent = ref<string>(file?.value?.content ?? "");
const characters = ref<(CharacterData | string)[]>(
  file?.value?.characters ?? []
);
const scenes = ref<SceneData[]>(file?.value?.scenes ?? []);

getFileContents(Number(route.params.id));

const drawer = ref(false);
const tabs = ref(1);
const showFab = ref(true);

const drawerBinding = computed({
  get: () => (mdAndUp.value ? true : drawer.value),
  set: (val) => {
    if (!mdAndUp.value) drawer.value = val;
  },
});

const showTab = (index: number) => {
  drawer.value = !drawer.value;
  tabs.value = index;
};

let lastScrollY = 0;
function handleScroll() {
  const currentY = window.scrollY;
  showFab.value = currentY < lastScrollY || currentY < 8;
  lastScrollY = currentY;
}

onMounted(() => {
  window.addEventListener("scroll", handleScroll);
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", handleScroll);
});
</script>

<template>
  <v-sheet class="pa-4 ma-3" elevation="3" v-if="file?.content">
    <div v-html="file?.content" class="sp-container"></div>
  </v-sheet>

  <v-navigation-drawer
    location="right"
    :permanent="mdAndUp"
    v-if="file?.content"
    v-model="drawerBinding"
  >
    <div
      class="d-flex fill-height flex-column"
      v-touch="{
        right: () => (tabs = 1),
        left: () => (tabs = 2),
      }"
    >
      <div>
        <v-tabs v-model="tabs" color="secondary" grow>
          <v-tab :value="1" prepend-icon="mdi-account-group-outline"></v-tab>
          <v-tab
            :value="2"
            prepend-icon="mdi-format-list-bulleted-square"
          ></v-tab>
        </v-tabs>
      </div>
      <div class="flex-grow-1 overflow-y-auto">
        <v-tabs-window v-model="tabs" class="ma-2">
          <v-tabs-window-item :key="1" :value="1">
            <characters-section
              :characters="file?.characters"
            ></characters-section>
          </v-tabs-window-item>
          <v-tabs-window-item :key="2" :value="2">
            <scene-section :scenes="file?.scenes"></scene-section>
          </v-tabs-window-item>
        </v-tabs-window>
      </div>
    </div>
  </v-navigation-drawer>
  <v-slide-x-reverse-transition>
    <v-btn
      icon="mdi-account-group-outline"
      elevation="12"
      v-if="!mdAndUp && file?.content && showFab"
      class="fab-toggle-top"
      color="secondary"
      @click="showTab(1)"
    >
    </v-btn>
  </v-slide-x-reverse-transition>
  <v-slide-x-reverse-transition>
    <v-btn
      icon="mdi-format-list-bulleted-square"
      elevation="12"
      v-if="!mdAndUp && file?.content && showFab"
      class="fab-toggle-bottom"
      color="secondary"
      @click="showTab(2)"
    >
    </v-btn>
  </v-slide-x-reverse-transition>
</template>

<style scoped>
.fab-toggle-bottom {
  position: fixed;
  bottom: 16px;
  right: 16px;
}
.fab-toggle-top {
  position: fixed;
  bottom: 80px;
  right: 16px;
}
</style>
