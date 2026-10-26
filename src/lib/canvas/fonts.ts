/**
 * Loads the faces the canvas draws with. `document.fonts.ready` can resolve
 * before a face used only by canvas has been requested, which would let text
 * swap fonts after an animation has already started.
 */
const FACES = [
	'400 16px "Atkinson Hyperlegible"',
	'700 16px "Atkinson Hyperlegible"',
	'400 16px "JetBrains Mono Variable"',
	'700 16px "JetBrains Mono Variable"'
];

export async function loadCanvasFonts(): Promise<void> {
	if (typeof document === 'undefined') return;
	await Promise.all(FACES.map((face) => document.fonts.load(face)));
	await document.fonts.ready;
}
