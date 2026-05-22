import fs from 'fs';
import { globSync } from 'glob';

const files = globSync('**/*.{ts,tsx,js,jsx,json,mjs,cjs}', {
  ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  nodir: true
});

console.log(`Found ${files.length} files to check.`);

let totalChanged = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let newContent = content;

  // Pattern 1: Wings🪽 followed by an uppercase letter
  // Example: WingsConfig -> WingsConfig
  newContent = newContent.replace(/Wings🪽([A-Z])/g, 'Wings$1');

  // Pattern 2: mechanical-wings followed by an uppercase letter
  // Example: mechanicalWingsHome -> mechanicalWingsHome
  newContent = newContent.replace(/mechanical-wings([A-Z])/g, 'mechanicalWings$1');

  // Pattern 3: __mechanical-wings followed by an uppercase letter
  // Example: __mechanicalWingsLegacy -> __mechanicalWingsLegacy
  newContent = newContent.replace(/__mechanical-wings([A-Z])/g, '__mechanicalWings$1');

  // Pattern 4: .mechanical-wings followed by an uppercase letter (for property access)
  // Example: dataset.mechanicalWingsDiffsReady -> dataset.mechanicalWingsDiffsReady
  // This is actually covered by Pattern 2, but let's be explicit if needed.
  // Wait, Pattern 2 covers it because it just looks for mechanical-wings followed by [A-Z].

  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Fixed: ${file}`);
    totalChanged++;
  }
});

console.log(`Total files fixed: ${totalChanged}`);
