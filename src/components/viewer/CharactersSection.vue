<script setup lang="ts">
import { ref } from "vue";
import CharacterHighlighter from "./CharacterHighlighter.vue";

const props = withDefaults(
  defineProps<{
    characters?: (CharacterData | string)[];
  }>(),
  {
    characters: () => [],
  }
);
// lets change this so that it converst strings to CharacterData objects with a default color, and if it's already a CharacterData object just use it as is
const characters = ref<CharacterData[]>(
  props.characters.map((char) => {
    if (typeof char === "string") {
      return { name: char, color: "#2EFFEF7D" };
    }
    return char;
  })
);
</script>

<template>
  <h4>Characters</h4>
  <div v-for="character of characters" :key="character.name">
    <character-highlighter :name="character.name" :color="character.color" />
  </div>
</template>
