import type { Plugin, PluginContext } from './types';

export const jumpToSlidePlugin: Plugin = {
	name: 'jump-to-slide',

	init(ctx) {
		context = ctx;
	},

	onSlideChange({ slug }) {
		currentSlug = slug;
		if (dialog) renderList();
	},

	onKeydown(event) {
		if (event.key === 'g' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			toggleDialog();
			return true;
		}
		if (event.key === 'Escape' && dialog) {
			event.preventDefault();
			closeDialog();
			return true;
		}
	},

	cleanup() {
		closeDialog();
	}
};

let context: PluginContext;
let dialog: HTMLDialogElement | null = null;
let currentSlug: string | null = null;

function toggleDialog() {
	if (dialog) closeDialog();
	else openDialog();
}

function openDialog() {
	dialog = document.createElement('dialog');
	dialog.className =
		'max-h-[80vh] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-6 text-white shadow-xl backdrop:bg-black/60';

	renderList();

	dialog.addEventListener('click', (e) => {
		const button = (e.target as HTMLElement).closest('button[data-index]');
		if (!button) return;
		const index = parseInt(button.getAttribute('data-index')!, 10);
		context.navigateTo(context.deck[index].slug);
		closeDialog();
	});

	document.body.appendChild(dialog);
	dialog.showModal();
}

function renderList() {
	if (!dialog) return;

	dialog.innerHTML = `
		<h2 class="mb-4 text-xl font-bold">Jump to slide</h2>
		<ul class="space-y-1">
			${context.deck
				.map(
					(s, i) => `
				<li>
					<button
						data-index="${i}"
						class="w-full rounded px-2 py-1 text-left transition-colors ${
							s.slug === currentSlug
								? 'bg-amber-400 text-black font-medium'
								: 'hover:bg-zinc-800'
						}"
					>
						${String(i + 1).padStart(2, '0')} — ${s.slug.replace(/-/g, ' ')}
					</button>
				</li>
			`
				)
				.join('')}
		</ul>
		<p class="mt-4 text-xs text-zinc-500">Ctrl/Cmd + G toggles this dialog</p>
	`;
}

function closeDialog() {
	if (!dialog) return;
	dialog.close();
	dialog.remove();
	dialog = null;
}
