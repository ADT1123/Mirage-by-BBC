// The app's name lives in /brand.json so renaming the project is a one-file change
// (or run: npm run rename -- "New Name" newcommand).

const path = require('path');

const brand = require(path.join(__dirname, '..', '..', 'brand.json'));

module.exports = {
  name: brand.name || 'Wallpaper',
  command: brand.command || 'wallpaper',
  slug: brand.slug || 'wallpaper',
  tagline: brand.tagline || '',
};
