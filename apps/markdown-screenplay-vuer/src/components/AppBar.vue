<script setup lang="ts">
import { AppBarService, AppBarServiceKey } from "@/services/app-bar-service";
import { useFileStore } from "@/store/fileStore";
import { ref, watch, computed, onMounted, onBeforeUnmount, inject } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDisplay } from "vuetify";

const fileStore = useFileStore();
const route = useRoute();
const router = useRouter();

const showFileActions = computed(
  () => route.path.startsWith("/view/") || route.path.startsWith("/editor/"),
);
const currentFileId = computed(() => Number(route.params.id ?? -1));

const appBarService = inject<AppBarService>(AppBarServiceKey);

const state = appBarService?.state;

const drawer = ref(true); // always visible on desktop
const isRail = ref(true); // collapsed by default

const group = ref(null);
watch(group, () => (drawer.value = false));

const isCurrentFileEditing = computed(() => {
  if (currentFileId.value < 0) return false;
  const file = fileStore.getFile(currentFileId.value);
  return file?.isEditing ?? false;
});

export interface NavItem {
  text: string;
  icon: string;
  route?: string;
  action?: "new";
  isFile?: boolean;
  fileIndex?: number;
  isActive?: boolean;
}

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [];
  items.push({ text: "New File", icon: "mdi-plus-box-outline", action: "new" });
  items.push({ text: "Load File", icon: "mdi-folder-outline", route: "/" });

  fileStore.files.forEach((file, index) => {
    const isActive = currentFileId.value === index;
    items.push({
      text: file.fileName,
      icon: file.isEditing ? "mdi-pencil" : "mdi-file-document",
      route: file.isEditing ? `/editor/${index}` : `/view/${index}`,
      isFile: true,
      fileIndex: index,
      isActive,
    });
  });

  items.push({ text: "Guide", icon: "mdi-progress-helper", route: "/guide" });
  return items;
});

function createNewFile() {
  fileStore.createNewFile();
  const newIndex = fileStore.files.length - 1;
  router.push(`/editor/${newIndex}`);
}

function closeFile(index: number) {
  fileStore.removeFile(index);

  if (currentFileId.value === index) {
    if (fileStore.files.length > 0) {
      const nextFile = fileStore.getFile(0);
      const routeType = nextFile?.isEditing ? "editor" : "view";
      router.push(`/${routeType}/0`);
    } else {
      router.push("/");
    }
  } else if (currentFileId.value > index) {
    const nextIndex = currentFileId.value - 1;
    const nextFile = fileStore.getFile(nextIndex);
    const routeType = nextFile?.isEditing ? "editor" : "view";
    router.push(`/${routeType}/${nextIndex}`);
  }
}

const { smAndUp } = useDisplay();

// Only use rail mode on desktop
const showRail = computed(() => smAndUp.value && isRail.value);

const showFab = ref(true);
let lastScrollY = 0;

function viewModeRoute() {
  return `/view/${currentFileId.value}`;
}

function editorModeRoute() {
  return `/editor/${currentFileId.value}`;
}

function handleToggleMode() {
  if (currentFileId.value < 0) {
    return;
  }

  fileStore.toggleEditing(currentFileId.value);
  const file = fileStore.getFile(currentFileId.value);
  const isEditing = file?.isEditing ?? false;

  router.push({
    path: isEditing ? editorModeRoute() : viewModeRoute(),
  });
}

function saveDocument() {
  const id = currentFileId.value;
  const file = fileStore.getFile(id);

  if (!file) {
    return;
  }

  const blob = new Blob([file.rawContent], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName || "screenplay.mdsp";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function printDocument() {
  try {
    const id = currentFileId.value;
    const file = fileStore.getFile(id);

    if (!file) {
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      throw new Error("Failed to open print window");
    }

    const doc = printWindow.document;

    const cssText = await import("@/assets/screenplay.css?raw");

    const style = doc.createElement("style");
    style.textContent = cssText.default;
    doc.head.appendChild(style);

    const spContainer = doc.createElement("div");
    spContainer.classList.add("sp-container");
    spContainer.innerHTML = file.content;
    doc.body.appendChild(spContainer);
    setTimeout(() => printWindow.print(), 1);
  } catch (error) {
    console.error("Failed to setup document for printing", error);
  }
}

function handleScroll() {
  const currentY = window.scrollY;
  showFab.value = currentY < lastScrollY || currentY < 16;
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
  <v-slide-y-transition>
    <div class="app-bar-container" v-if="!smAndUp && showFab && !drawer">
      <div class="app-bar bg-indigo">
        <v-btn
          icon
          size="small"
          elevation="0"
          class="fab-toggle"
          color="indigo"
          @click="drawer = !drawer"
        >
          <v-icon> mdi-menu </v-icon>
        </v-btn>
        <h3>{{ state?.textOverride }}</h3>
      </div>
    </div>
  </v-slide-y-transition>

  <v-navigation-drawer
    v-model="drawer"
    color="indigo"
    class="border-radius: 0px 1rem 1rem 0px;"
    :rail="showRail"
    expand-on-hover
    :permanent="smAndUp"
    :temporary="!smAndUp"
    location="left"
    width="220"
  >
    <div class="d-flex flex-column fill-height">
      <v-list nav :lines="false" class="flex-grow-1">
        <template v-for="(item, index) in navItems" :key="index">
          <v-divider v-if="index == navItems.length - 1" />
          <v-list-item
            v-if="item.route"
            :to="item.route"
            link
            :prepend-icon="item.icon"
            :title="item.text"
          >
            <template #append v-if="item.isFile">
              <v-btn
                icon="mdi-close"
                variant="text"
                size="x-small"
                density="compact"
                class="close-tab-btn"
                @click.prevent.stop="closeFile(item.fileIndex!)"
              />
            </template>
          </v-list-item>
          <v-list-item
            v-else-if="item.action === 'new'"
            link
            :prepend-icon="item.icon"
            :title="item.text"
            @click="createNewFile"
          >
          </v-list-item>
        </template>
      </v-list>
      <v-list>
        <v-list-item
          v-if="showFileActions"
          @click="handleToggleMode"
          :prepend-icon="isCurrentFileEditing ? 'mdi-eye' : 'mdi-pencil'"
          :title="isCurrentFileEditing ? 'View' : 'Edit'"
        ></v-list-item>
        <v-list-item
          v-if="showFileActions"
          @click="saveDocument"
          prepend-icon="mdi-download"
          title="Save"
        ></v-list-item>
        <v-list-item
          v-if="showFileActions"
          @click="printDocument"
          prepend-icon="mdi-printer"
          title="Print"
        ></v-list-item>
      </v-list>
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
.fab-toggle {
  width: 48px;
}
.app-bar-container {
  width: 100%;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  height: 2rem;
  background: rgb(var(--v-theme-background));
}

.app-bar {
  border-radius: 2rem;
  margin: 0.75rem 1rem;
  padding: 0 1rem;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 0.5rem;
  user-select: none;
}
.close-tab-btn {
  opacity: 0.35;
  transition:
    opacity 0.2s ease,
    color 0.2s ease;
}
.v-list-item:hover .close-tab-btn {
  opacity: 0.8;
}
.close-tab-btn:hover {
  opacity: 1 !important;
  color: rgb(var(--v-theme-error)) !important;
}
</style>
