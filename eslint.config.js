import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'node_modules/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    // WebGPURenderer ignores onBeforeCompile and the WebGL EffectComposer passes. Use node
    // materials (TSL) and the chain in src/view3d/post/pipeline.ts instead.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='onBeforeCompile']",
          message: 'onBeforeCompile does nothing under WebGPURenderer. Write a node material (three/tsl) instead.',
        },
        {
          selector: "Property[key.name='onBeforeCompile']",
          message: 'onBeforeCompile does nothing under WebGPURenderer. Write a node material (three/tsl) instead.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three/examples/jsm/postprocessing/*', 'three/addons/postprocessing/*'],
              message: 'WebGL-only post-processing. Add a TSL effect to src/view3d/post/pipeline.ts.',
            },
          ],
        },
      ],
    },
  },
)
