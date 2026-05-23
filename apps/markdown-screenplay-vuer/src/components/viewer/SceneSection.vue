<script setup lang="ts">
import type { SceneData } from "@transformers";
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    scenes?: SceneData[];
  }>(),
  {
    scenes: () => [],
  },
);

const scenes = ref<SceneData[]>(props.scenes);

function scrollToScene(ref?: number) {
  const element: HTMLElement | null = document.getElementById(`scene_${ref}`);
  element?.scrollIntoView({ behavior: "instant" });
}
</script>

<template>
  <h4>Scenes</h4>
  <v-list>
    <v-list-item
      v-for="(scene, sceneIndex) in scenes"
      :key="sceneIndex"
      @click="scrollToScene(sceneIndex)"
    >
      <p class="scene-item" :class="scene.isSub ? 'ml-0' : 'ml-2'">
        {{ scene.name }}
      </p>
    </v-list-item>
  </v-list>
</template>

<style scoped lang="css">
.scene-item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
</style>
