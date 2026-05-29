import { createRouter, createWebHistory } from 'vue-router'
import { nextTick } from 'vue'
import GuideView from '../views/GuideView.vue'
import FileView from '@/views/FileView.vue'
import EditorView from '@/views/EditorView.vue'
import LoadView from '@/views/LoadView.vue'
import { useFileStore } from '@/store/fileStore';
import { ReadFileService } from '@/services/readfile-service';

const samples = import.meta.glob('../../../../samples/*.mdsp', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function getSampleContent(name: string): { content: string; filename: string } | null {
  let target = name.toLowerCase();
  if (!target.endsWith('.mdsp')) {
    target += '.mdsp';
  }

  for (const path in samples) {
    const filename = path.split('/').pop() || '';
    if (filename.toLowerCase() === target) {
      return {
        content: samples[path],
        filename
      };
    }
  }
  return null;
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/guide',
      name: 'Guide',
      component: GuideView,
    },
    {
      path: "/view/:id",
      name: 'View File',
      component: FileView,
    },
    {
      path: "/editor/:id",
      name: 'Editor',
      component: EditorView,
    },
    {
      path: "/samples/:name",
      name: 'Sample File',
      beforeEnter: (to) => {
        const name = to.params.name as string;
        const sample = getSampleContent(name);
        if (!sample) {
          return { path: '/' };
        }

        const fileStore = useFileStore();
        const existingIndex = fileStore.files.findIndex(
          (f) => f.fileName.toLowerCase() === sample.filename.toLowerCase()
        );

        if (existingIndex !== -1) {
          const file = fileStore.getFile(existingIndex);
          const routeType = file?.isEditing ? 'editor' : 'view';
          return { path: `/${routeType}/${existingIndex}` };
        }

        const readFileService = new ReadFileService();
        const fileData = readFileService.processContent(sample.content, sample.filename);
        fileStore.pushFile(fileData);
        
        const newIndex = fileStore.files.length - 1;
        const file = fileStore.getFile(newIndex);
        const routeType = file?.isEditing ? 'editor' : 'view';
        return { path: `/${routeType}/${newIndex}` };
      },
      component: LoadView,
    },
    {
      path: "/",
      name: 'Load File',
      component: LoadView,
    },
  ],
})

router.beforeEach((to) => {
  const isFileRoute = to.path.startsWith('/view/') || to.path.startsWith('/editor/')

  if (isFileRoute) {
    const fileStore = useFileStore()

    const id = Number(to.params.id)
    const isValid = fileStore && !isNaN(id) && id >= 0 && id < fileStore.files.length

    if (!isValid) {
      return { path: '/' }
    }
  }

  return true;
})

router.afterEach((to) => {
  const isFileRoute = to.path.startsWith('/view/') || to.path.startsWith('/editor/')
  if (isFileRoute) {
    nextTick(() => {
      const activeTab = document.querySelector(".v-navigation-drawer .v-list-item--active");
      if (activeTab) {
        (activeTab as HTMLElement).focus();
      }
    });
  }
})

export default router
