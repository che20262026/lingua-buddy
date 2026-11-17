/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1c2440',
        muted: '#6b7592',
        brand: {
          50: '#eef4ff',
          100: '#dce8ff',
          200: '#bcd2ff',
          300: '#8fb3ff',
          400: '#5c8bfa',
          500: '#3b6bf4',
          600: '#2a51d8',
          700: '#2240ac',
        },
        coral: { 100: '#ffe9e3', 400: '#ff9478', 500: '#f97356', 600: '#e05a3d' },
        /** [系统提示] 服务端故障 / 鉴权失败专用红：与暖珊瑚区分 severity */
        danger: { 50: '#fff3f3', 100: '#ffe3e4', 200: '#ffc9cb', 400: '#f2555a', 500: '#e13b42', 600: '#c22f38' },
        mint: { 100: '#dcf7e9', 400: '#5fd6a3', 500: '#2bbd85', 600: '#189a6b' },
        sun: { 100: '#fff2cf', 400: '#ffc95c', 500: '#f5ac2b' },
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(38, 62, 130, 0.22)',
        card: '0 4px 18px -8px rgba(38, 62, 130, 0.18)',
        float: '0 18px 45px -18px rgba(38, 62, 130, 0.42)',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Trebuchet MS"', '"PingFang SC"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
