import { createRouter, createWebHistory } from 'vue-router'
import GuideView from '../views/GuideView.vue'
import FileView from '@/views/FileView.vue'
import LoadView from '@/views/LoadView.vue'
import { useFileStore } from '@/store/fileStore';

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
      path: "/",
      name: 'Load File',
      component: LoadView,
    },
  ],
})

router.beforeEach((to) => {
  if (to.path === '/view') {
    const fileStore = useFileStore()

    const id = Number(to.params.id)
    const isValid = fileStore && !isNaN(id) && id >= 0 && id < fileStore.files.length

    if (!isValid) {
      return { path: '/' }
    }
  }

  return true;
})

export default router
