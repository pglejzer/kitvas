// Style and asset imports as modules, for the types check of drafts and kits. esbuild bundles
// these files; tsc only needs to know what an import of one gives. The CSS Modules patterns come
// first: when two patterns match an import equally well, tsc takes the one declared first.

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.module.scss' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css' {
  // Imported for its effect: the bundler puts it into the page's CSS. It exports nothing.
}

declare module '*.scss' {
  // Imported for its effect, like a plain .css file.
}

// An image import gives the image's address.
declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.avif' {
  const src: string;
  export default src;
}
