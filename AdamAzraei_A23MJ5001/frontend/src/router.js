import { createRouter, createWebHistory } from 'vue-router'
import UploadConsole from './components/UploadConsole.vue'
import ViewerDashboard from './components/ViewerDashboard.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: ViewerDashboard
  },
  {
    path: '/upload',
    name: 'Upload',
    component: UploadConsole
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

// This export is what was likely missing or failing to read!
export default router