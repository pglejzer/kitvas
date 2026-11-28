// The project's Tailwind 3 config: no content (kitvas names the files), one literal colour, and no
// preflight, so a page holds only what its classes say.
module.exports = {
  content: [],
  theme: {
    extend: {
      colors: {
        brand: '#1f5fd0',
      },
    },
  },
  corePlugins: { preflight: false },
};
