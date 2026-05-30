<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  name: string;
  color: string;
}>();

const localName = ref(props.name);

const emit = defineEmits<{
  (e: "update:color", value: string): void;
  (e: "update:active", value: boolean): void;
}>();

const menu = ref(false);
const colorModel = ref(props.color);
const activeModel = ref(false);

// Sync props to local refs
watch(colorModel, (newColor) => {
  colorModel.value = newColor;
  if (activeModel.value) updateElements();
});

watch(activeModel, (isActive) => {
  activeModel.value = isActive;
  updateElements();
});

function updateElements() {
  const elements = document.querySelectorAll(
    `[data-character="${props.name.toLowerCase()}"]`,
  );
  elements.forEach((el) => {
    (el as HTMLElement).style.backgroundColor = activeModel.value
      ? colorModel.value
      : "";
  });
}

// Emit changes
watch(colorModel, (newColor) => emit("update:color", newColor));
watch(activeModel, (newVal) => emit("update:active", newVal));
</script>

<template>
  <v-row align="center" justify="space-between" gutter>
    <v-col cols="auto" class="ml-2">
      <v-switch
        v-model="activeModel"
        color="primary"
        :label="localName"
        hide-details
        density="compact"
      />
    </v-col>
    <v-col cols="auto">
      <v-menu
        v-model="menu"
        :close-on-content-click="false"
        offset-y
        max-width="320"
      >
        <template #activator="{ props: menuProps }">
          <v-btn
            size="small"
            :style="{ backgroundColor: colorModel || undefined }"
            v-bind="menuProps"
          >
            <v-icon size="small">mdi-eyedropper-variant</v-icon>
          </v-btn>
        </template>

        <v-card>
          <v-color-picker
            v-model="colorModel"
            mode="hexa"
            hide-mode-switch
            hide-swatches
            show-canvas
            show-inputs
            flat
          />
        </v-card>
      </v-menu>
    </v-col>
  </v-row>
</template>
