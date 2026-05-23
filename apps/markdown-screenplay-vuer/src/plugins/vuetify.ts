import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: prefersDark.matches ? 'dark' : 'light',
  },
})

// Optional: Listen for user system theme change
prefersDark.addEventListener('change', (event) => {
  const newTheme = event.matches ? 'dark' : 'light'
  vuetify.theme.global.name.value = newTheme
})

export default vuetify
