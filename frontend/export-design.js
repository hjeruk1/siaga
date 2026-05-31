import { execSync } from 'child_process';
import fs from 'fs';

try {
  const output = execSync('node node_modules/@google/design.md/dist/index.js export --format tailwind DESIGN.md');
  fs.writeFileSync('tailwind.theme.json', output, 'utf8');
  console.log('Successfully exported design tokens to tailwind.theme.json (UTF-8)');
} catch (error) {
  console.error('Failed to export design tokens:', error);
  process.exit(1);
}
