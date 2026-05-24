<script setup lang="ts">
import { RouterView, useRoute, useRouter } from "vue-router";
import AppBar from "./components/AppBar.vue";
import { useDisplay } from "vuetify";
import { AppBarService, AppBarServiceKey } from "./services/app-bar-service";
import { onMounted, provide } from "vue";
import { useFileStore } from "./store/fileStore";

const { smAndUp } = useDisplay();
const router = useRouter();
const route = useRoute();
const fileStore = useFileStore();

const appBarService = new AppBarService();
provide(AppBarServiceKey, appBarService);

onMounted(() => {
  router.afterEach((to) => {
    const id = Number(to.params.id);
    const isFileRoute =
      to.path.startsWith("/view/") || to.path.startsWith("/editor/");

    if (isFileRoute) {
      fileStore.setEditing(to.path.startsWith("/editor/"));
    }

    if (isFileRoute && !isNaN(id)) {
      const file = fileStore.getFile(id);
      appBarService.textOverride = file?.fileName ?? to.name?.toString() ?? "";
    } else {
      appBarService.textOverride = to.name?.toString() ?? "";
    }

    window.scroll({ behavior: "instant", top: 0 });
  });
});
</script>

<template>
  <v-app>
    <AppBar></AppBar>
    <v-main :class="smAndUp ? undefined : 'mt-12'">
      <RouterView />
    </v-main>
  </v-app>
</template>

<style scoped></style>
