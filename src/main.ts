import { createApp } from 'vue'

import './assets/main.css'

import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify';
import { createPinia } from 'pinia';

const app = createApp(App);
const pinia = createPinia()

app.use(vuetify);
app.use(pinia);
app.use(router);
app.mount('#app');
