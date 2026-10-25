import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { dbToGain, type VoiceoverFilterSettings } from './filters.js';
import {
	VOICEOVER_LIMITER_ATTACK_SECONDS,
	addCaptureWorklet,
	compressorSlope,
	createCompressorNode,
	createEqNode,
	createExpanderNode,
	createLimiterNode,
	expanderSlope
} from './worklet.js';

export interface FilterChain {
	input: AudioNode;
	output: AudioNode;
	dispose(): void;
}

type RnnoiseModule = typeof import('@sapphi-red/web-noise-suppressor');

let rnnoiseModule: Promise<RnnoiseModule> | null = null;
let wasmBinary: ArrayBuffer | null = null;
let wasmFailed = false;
const rnnoiseContexts = new WeakSet<AudioContext>();

/*
 * The package defines classes that extend AudioWorkletNode while its module
 * is evaluated, and that global only exists in a browser. Loading it lazily
 * keeps a server render of the editor from throwing, and the module is only
 * ever reached from a recording started by a user gesture.
 */
function loadRnnoiseModule(): Promise<RnnoiseModule> {
	rnnoiseModule ??= import('@sapphi-red/web-noise-suppressor');
	return rnnoiseModule;
}

async function rnnoiseBinary(
	loadRnnoise: RnnoiseModule['loadRnnoise']
): Promise<ArrayBuffer | null> {
	if (wasmBinary !== null) return wasmBinary;
	if (wasmFailed) return null;
	try {
		wasmBinary = await loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseSimdPath });
		return wasmBinary;
	} catch {
		// suppression is skipped below, the take still records
		wasmFailed = true;
		return null;
	}
}

async function ensureRnnoise(context: AudioContext): Promise<boolean> {
	if (rnnoiseContexts.has(context)) return true;
	try {
		await context.audioWorklet.addModule(rnnoiseWorkletPath);
		rnnoiseContexts.add(context);
		return true;
	} catch {
		return false;
	}
}

/*
 * One chain per take, in the exact order of the OBS filter list it copies,
 * noise suppression, gain, equalizer, expander, compressor, limiter. A
 * disabled filter is left out, so the path stays short. The caller connects
 * the mic to input and reads the take from output.
 */
export async function buildFilterChain(
	context: AudioContext,
	settings: VoiceoverFilterSettings
): Promise<FilterChain> {
	await addCaptureWorklet(context);

	const input = context.createGain();
	const output = context.createGain();
	let head: AudioNode = input;
	const owned: AudioNode[] = [input, output];
	const rnnoiseNodes: { destroy(): void }[] = [];

	if (settings.noiseSuppression.enabled) {
		const module = await loadRnnoiseModule().catch(() => null);
		if (module !== null) {
			const binary = await rnnoiseBinary(module.loadRnnoise);
			const ready = binary !== null && (await ensureRnnoise(context));
			if (ready && binary !== null) {
				try {
					const node = new module.RnnoiseWorkletNode(context, {
						maxChannels: 1,
						wasmBinary: binary
					});
					rnnoiseNodes.push(node);
					owned.push(node);
					head.connect(node);
					head = node;
				} catch {
					// fall through without suppression
				}
			}
		}
	}

	if (settings.gain.enabled) {
		const node = context.createGain();
		node.gain.value = dbToGain(settings.gain.db);
		owned.push(node);
		head.connect(node);
		head = node;
	}

	if (settings.eq.enabled) {
		const node = createEqNode(context, {
			low: settings.eq.low,
			mid: settings.eq.mid,
			high: settings.eq.high
		});
		owned.push(node);
		head.connect(node);
		head = node;
	}

	if (settings.expander.enabled) {
		const node = createExpanderNode(context, {
			threshold: settings.expander.threshold,
			slope: expanderSlope(settings.expander.ratio),
			attack: settings.expander.attack / 1000,
			release: settings.expander.release / 1000,
			outputGain: settings.expander.outputGain,
			detector: settings.expander.detector
		});
		owned.push(node);
		head.connect(node);
		head = node;
	}

	if (settings.compressor.enabled) {
		const node = createCompressorNode(context, {
			threshold: settings.compressor.threshold,
			slope: compressorSlope(settings.compressor.ratio),
			attack: settings.compressor.attack / 1000,
			release: settings.compressor.release / 1000,
			outputGain: settings.compressor.outputGain
		});
		owned.push(node);
		head.connect(node);
		head = node;
	}

	if (settings.limiter.enabled) {
		const node = createLimiterNode(context, {
			threshold: settings.limiter.threshold,
			slope: 1,
			attack: VOICEOVER_LIMITER_ATTACK_SECONDS,
			release: settings.limiter.release / 1000,
			outputGain: 0
		});
		owned.push(node);
		head.connect(node);
		head = node;
	}

	head.connect(output);

	return {
		input,
		output,
		dispose() {
			try {
				input.disconnect();
			} catch {
				// already torn down with the context
			}
			for (const node of owned) {
				try {
					node.disconnect();
				} catch {
					// one failed node must not block the rest
				}
			}
			for (const node of rnnoiseNodes) {
				try {
					node.destroy();
				} catch {
					// binary memory is freed on context close anyway
				}
			}
		}
	};
}
