# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Scripts Disponibles

### Scripts de Desarrollo
- `npm run dev` - Inicia el servidor de desarrollo con Vite
- `npm run build` - Construye la aplicación para producción
- `npm run build:with-types` - Verifica tipos antes de construir
- `npm run preview` - Previsualiza la build de producción

### Scripts de Verificación de Tipos
- `npm run type-check` - Verifica tipos TypeScript (con flag --force para evitar problemas de cache)
- `npm run type-check:watch` - Verifica tipos en modo watch
- `npm run type-check:clean` - Limpia cache de TypeScript y verifica tipos desde cero

### Scripts de Linting
- `npm run lint` - Ejecuta ESLint sin cache (más confiable, recomendado)
- `npm run lint:cached` - Ejecuta ESLint con cache (más rápido en ejecuciones sucesivas)
- `npm run lint:fix` - Corrige automáticamente errores de linting
- `npm run lint:fix:cached` - Corrige con cache habilitado
- `npm run lint:debug` - Ejecuta ESLint en modo debug para troubleshooting

### Scripts de Limpieza
- `npm run clean` - Elimina directorios de build y cache
- `npm run clean:cache` - Elimina solo los caches (vite, TypeScript, ESLint)

## Solución a Problemas de Timeout

Si experimentas timeouts con los comandos `npm run type-check` o `npm run lint`, esto puede deberse a:

1. **Cache corrupto**: Ejecuta `npm run clean:cache` y vuelve a intentar
2. **Build info desactualizado**: Usa `npm run type-check:clean` para reconstruir desde cero
3. **Problemas de ESLint**: Los scripts principales ahora no usan cache por defecto para mayor confiabilidad

### Cambios Implementados

**ESLint Configuration** (eslint.config.js):
- Patrones de ignore mejorados con prefijos `**/` para mejor compatibilidad
- Scope de archivos limitado a `src/**/*.{ts,tsx}` para evitar analizar archivos innecesarios
- Plugins configurados explícitamente en lugar de usar configs que pueden causar problemas
- Eliminada la cache por defecto de los scripts principales

**TypeScript Configuration** (package.json):
- Agregado flag `--force` a `type-check` para evitar problemas con build info
- Nuevo script `type-check:clean` para limpiar y reconstruir completamente

**Limpieza de Cache**:
- Scripts de limpieza mejorados para incluir todos los directorios de cache relevantes
