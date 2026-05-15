import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js' // Explicitly pointing to the new file

createApp(App).use(router).mount('#app')