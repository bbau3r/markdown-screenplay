<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import type { FileData, CharacterFileData } from "@/interfaces/file-data";

const props = defineProps<{
  file: FileData | null;
}>();

const emit = defineEmits<{
  (e: "update:characters", value: CharacterFileData[]): void;
}>();

const panel = ref<number[]>([]); // Starts collapsed by default

const draftCharacters = ref<CharacterFileData[]>(
  props.file?.characters?.length
    ? props.file.characters.map((c) => ({ ...c }))
    : []
);

let emitting = false;

watch(
  () => props.file?.characters,
  (value) => {
    if (emitting) return;
    draftCharacters.value = value?.length
      ? value.map((c) => ({ ...c }))
      : [];
  },
  { deep: true }
);

let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

function emitUpdate() {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }
  debounceTimeout = setTimeout(() => {
    debounceTimeout = null;
    emitting = true;
    emit(
      "update:characters",
      draftCharacters.value.map((c) => ({
        name: c.name.trim().toUpperCase(),
        color: c.color,
      }))
    );
    nextTick(() => {
      emitting = false;
    });
  }, 500);
}

onBeforeUnmount(() => {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    emitting = true;
    emit(
      "update:characters",
      draftCharacters.value.map((c) => ({
        name: c.name.trim().toUpperCase(),
        color: c.color,
      }))
    );
  }
});

watch(draftCharacters, emitUpdate, { deep: true });

function addCharacter() {
  draftCharacters.value.push({
    name: "",
    color: "#2EFFEF7D",
  });
}

function removeCharacter(index: number) {
  draftCharacters.value.splice(index, 1);
}

function clearCharacters() {
  draftCharacters.value = [];
}
</script>

<template>
  <v-card class="mb-4" elevation="2" rounded="lg">
    <v-expansion-panels v-model="panel" multiple>
      <v-expansion-panel value="0">
        <v-expansion-panel-title>
          <div class="d-flex align-center justify-space-between w-100 pr-4">
            <span class="text-subtitle-1 font-weight-bold">Characters</span>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="d-flex flex-column ga-4">
            <div class="text-body-2 text-medium-emphasis">
              Configure character names and text highlight colors.
            </div>

            <!-- List of characters -->
            <div class="d-flex flex-column ga-2">
              <div
                v-for="(character, index) in draftCharacters"
                :key="index"
                class="character-row d-flex align-center ga-3"
              >
                <!-- Color picker menu (broken out next to the text box) -->
                <v-menu :close-on-content-click="false" offset-y max-width="320">
                  <template #activator="{ props: menuProps }">
                    <v-btn
                      v-bind="menuProps"
                      icon
                      size="small"
                      :style="{ backgroundColor: character.color }"
                      class="character-color-btn elevation-1"
                    >
                      <v-icon size="16" color="white" style="text-shadow: 0px 1px 2px rgba(0,0,0,0.6)">mdi-eyedropper-variant</v-icon>
                    </v-btn>
                  </template>
                  <v-card>
                    <v-color-picker
                      v-model="character.color"
                      mode="hexa"
                      hide-mode-switch
                      hide-swatches
                      show-canvas
                      show-inputs
                      flat
                    />
                  </v-card>
                </v-menu>

                <!-- Input field with inline remove button (styled like author field) -->
                <div class="character-field flex-grow-1">
                  <input
                    v-model="character.name"
                    class="character-input"
                    placeholder="CHARACTER NAME (e.g. JOHN)"
                    spellcheck="false"
                  />

                  <button
                    class="character-remove-btn"
                    @click="removeCharacter(index)"
                    tabindex="-1"
                    type="button"
                  >
                    <v-icon size="16">mdi-close</v-icon>
                  </button>
                </div>
              </div>
            </div>

            <!-- Add character and clear actions -->
            <div class="d-flex align-center justify-center ga-4 mt-2">
              <v-btn
                icon
                size="x-small"
                variant="tonal"
                color="primary"
                @click="addCharacter"
              >
                <v-icon size="18">mdi-plus</v-icon>
              </v-btn>

              <v-btn
                v-if="draftCharacters.length > 0"
                size="small"
                variant="text"
                color="error"
                @click="clearCharacters"
              >
                Clear
              </v-btn>
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </v-card>
</template>

<style scoped>
.character-row {
  position: relative;
}

.character-color-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
}

.character-field {
  display: flex;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
  border-radius: 4px;
  transition: border-color 0.2s ease;
  overflow: hidden;
}

.character-field:focus-within {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

.character-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 14px;
  padding: 10px 12px;
  font-family: inherit;
  line-height: 1.5;
  text-transform: uppercase;
}

.character-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 100%;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.3);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
  padding: 0;
}

.character-row:hover .character-remove-btn,
.character-field:focus-within .character-remove-btn {
  opacity: 1;
}

.character-remove-btn:hover {
  color: rgb(var(--v-theme-error));
}
</style>
