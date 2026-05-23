<script setup lang="ts">
import { ref } from "vue";
import CharacterHighlighter from "./CharacterHighlighter.vue";
import type { CharacterFileData } from "@/interfaces/file-data";

const props = withDefaults(
  defineProps<{
    characters?: CharacterFileData[];
  }>(),
  {
    characters: () => [],
  }
);

const characters = ref<CharacterFileData[]>(props.characters);
</script>

<template>
  <h4>Characters</h4>
  <div v-for="character of characters" :key="character.name">
    <character-highlighter :name="character.name" :color="character.color" />
  </div>
</template>
