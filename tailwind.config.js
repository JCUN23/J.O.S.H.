/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Generate all color classes for dynamic theme switching
    ...['cyan', 'yellow', 'mocha'].flatMap(color => [
      ...['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].flatMap(shade => [
        `text-${color}-${shade}`,
        `bg-${color}-${shade}`,
        `bg-${color}-${shade}/30`,
        `bg-${color}-${shade}/50`,
        `border-${color}-${shade}`,
        `hover:bg-${color}-${shade}`,
        `hover:text-${color}-${shade}`,
      ])
    ])
  ],
  theme: {
    extend: {
      colors: {
        cyan: {
          '50': '#ecfaff',
          '100': '#cff3fe',
          '200': '#a5e7fc',
          '300': '#67d6f9',
          '400': '#22bdee',
          '500': '#06a3d4',
          '600': '#0889b2',
          '700': '#0e7190',
          '800': '#155e75',
          '900': '#165163',
          '950': '#083644',
        },
        blue: {
          '50': '#ecf8ff',
          '100': '#d4eeff',
          '200': '#b2e3ff',
          '300': '#7ed3ff',
          '400': '#41b8ff',
          '500': '#1694ff',
          '600': '#0072ff',
          '700': '#005afd',
          '800': '#0149cc',
          '900': '#0842a0',
          '950': '#0c2d6b',
        },
        yellow: {
          '50': '#fbffe7',
          '100': '#f3ffc1',
          '200': '#edff86',
          '300': '#eaff41',
          '400': '#f0ff0d',
          '500': '#fdff00',
          '600': '#d1c100',
          '700': '#a68c02',
          '800': '#896d0a',
          '900': '#74580f',
          '950': '#443004',
        },
        mocha: {
          '50': '#f5f3f1',
          '100': '#e6e1db',
          '200': '#cfc3b9',
          '300': '#b3a091',
          '400': '#9d8372',
          '500': '#967969',
          '600': '#7a5f54',
          '700': '#634b45',
          '800': '#55413e',
          '900': '#4a3a39',
          '950': '#2a1e1e',
        },

      },
    },
  },
  plugins: [],
}