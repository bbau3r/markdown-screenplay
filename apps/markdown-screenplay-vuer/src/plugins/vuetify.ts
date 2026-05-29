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
    themes: {
      light: {
        colors: {
          'scene-heading': '#1976d2',
          'scene-heading-sub': '#0288d1',
          'action': '#616161',
          'dialog-character': '#7b1fa2',
          'dialog-parenthetical': '#00796b',
          'dialog': '#004d40',
          'scene-transition': '#e65100',
        },
      },
      dark: {
        colors: {
          'scene-heading': '#2196f3',
          'scene-heading-sub': '#64b5f6',
          'action': '#9e9e9e',
          'dialog-character': '#ba68c8',
          'dialog-parenthetical': '#4db6ac',
          'dialog': '#80cbc4',
          'scene-transition': '#ffb74d',
        },
      },
    },
  },
})

// Optional: Listen for user system theme change
prefersDark.addEventListener('change', (event) => {
  const newTheme = event.matches ? 'dark' : 'light'
  vuetify.theme.global.name.value = newTheme
})

export default vuetify
