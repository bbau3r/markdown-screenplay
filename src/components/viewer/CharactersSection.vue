<script setup lang="ts">
import { ref } from 'vue'
import CharacterHighlighter from './CharacterHighlighter.vue'

const props = withDefaults(
  defineProps<{
    characters?: string[]
  }>(),
  {
    characters: () => [],
  },
)

const characters = ref<string[]>(props.characters)
</script>

<template>
  <h4>Characters</h4>
  <div v-for="character of characters" :key="character">
    <character-highlighter :name="character" color="#2EFFEF7D" />
  </div>
</template>
