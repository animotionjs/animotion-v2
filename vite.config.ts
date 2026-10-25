import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';

/*
 * Tailwind records every scanned file as a dependency of the stylesheet, so an
 * edit to one reaches the browser. A scene added after that scan is not a
 * dependency yet, so its classes stay off the client until the page reloads.
 * Watch added scenes and emit the stylesheet as changed again, so Vite runs its
 * normal CSS update and the first render is styled.
 */
function sceneStylesRefresh(): Plugin {
	return {
		name: 'animotion-scene-styles',
		configureServer(server) {
			const theme = resolve(server.config.root, 'src/styles/theme.css');
			server.watcher.on('add', (file) => {
				if (!/\/src\/projects\/.*\.svelte$/.test(file)) return;
				server.watcher.emit('change', theme);
			});
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sceneStylesRefresh(),
		sveltekit({
			compilerOptions: {
				// force runes mode for the project, except for libraries (can be removed in Svelte 6)
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},
			adapter: adapter(),
			experimental: { remoteFunctions: true }
		})
	],
	server: {
		/*
		 * Scene components are imported by the editor, so editing one must reach
		 * the browser. A project's voiceover audio and track are read with the file
		 * system on demand, so watching them only causes pointless page reloads.
		 */
		watch: {
			ignored: ['**/src/projects/**/voiceover/**', '**/src/projects/**/project.json']
		}
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
