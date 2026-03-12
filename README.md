<div align="center">

### motebaya.github.io

A responsive single-page portfolio built with React, TypeScript, and Tailwind CSS.

![React](https://img.shields.io/badge/react-%2361DAFB.svg?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/typescript-%233178C6.svg?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/tailwindcss-%2306B6D4.svg?style=flat&logo=tailwindcss&logoColor=white)
![Framer Motion](https://img.shields.io/badge/framer--motion-%230055FF.svg?style=flat&logo=framer&logoColor=white)

</div>

## Features

- Dark/light theme with system preference detection and localStorage persistence
- Smooth scrolling via [Lenis](https://github.com/darkroomengineering/lenis)
- Live2D character widget with interactive tooltips and drag support
- GitHub repositories fetched from the REST API (no token required)
- Responsive two-column grid layout (single column on mobile)
- Framer Motion animations that respect `prefers-reduced-motion`
- Code-split lazy loading for ProjectList and Live2DWidget
- Custom cursor, WebP cover images with responsive `srcset`

## Tech Stack

| Category | Tools |
|---|---|
| Framework | React 19, TypeScript 5.7 |
| Build | Vite 6 |
| Styling | Tailwind CSS 3 |
| Animation | Framer Motion 11 |
| Scrolling | Lenis |
| Icons | Lucide React |
| Markdown | react-markdown, remark-gfm |
| Testing | Vitest, Testing Library |
| Deployment | GitHub Pages via GitHub Actions |

## Development

```bash
npm install
npm run dev       # start dev server
npm run build     # type-check + production build
npm run preview   # preview production build
npm run test      # run tests
npm run lint      # lint with ESLint
```

## References

- Live2D widget: https://github.com/stevenjoezhang/live2d-widget
- Pointer & cursor: https://custom-cursor.com/en/collection/anime/rz-sliaw-rem-flail

## License

This project is licensed under the [MIT License](LICENSE).
