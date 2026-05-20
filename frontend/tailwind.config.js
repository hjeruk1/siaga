import fs from 'fs';
import path from 'path';

let designThemeExtend = {};
try {
  const themePath = path.resolve('./tailwind.theme.json');
  if (fs.existsSync(themePath)) {
    const raw = JSON.parse(fs.readFileSync(themePath, 'utf8'));
    if (raw?.theme?.extend) {
      designThemeExtend = raw.theme.extend;
    }
  }
} catch (e) {
  console.warn("Could not load tailwind.theme.json");
}

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      ...designThemeExtend
    }
  },
  plugins: []
};