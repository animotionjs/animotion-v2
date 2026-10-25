import { Camera, frame as cameraFrame, type CameraOptions, type CameraTarget } from './camera.js';
import { CodeNode, type CodeNodeInit } from './code-node.js';
import { LayoutStep, type LayoutOptions } from './layout.js';
import type { AudioCue, AudioOptions } from './audio.js';
import {
	GroupNode,
	RectNode,
	TextNode,
	type Node,
	type NodeInit,
	type NodeState,
	type RectInit,
	type TextInit
} from './nodes.js';
import { Animation, type Step } from './steps.js';

export interface TimelineStep {
	index: number;
	label: string;
	duration: number;
}

export interface SceneTimeline {
	steps: TimelineStep[];
	totalDuration: number;
}

export interface TransitionState {
	opacity: number;
	x: number;
	y: number;
	scale: number;
}

export interface NodeSnapshot {
	id: string;
	kind: string;
	layoutKey?: string;
	values: NodeState;
	children: NodeSnapshot[];
}

export interface SceneInstance {
	readonly id: string;
	readonly root: GroupNode;
	readonly steps: readonly Step[];
	readonly camera: Camera;
	readonly audio: readonly AudioCue[];
	readonly duration: number;
	readonly timeline: SceneTimeline;
	seek(seconds: number): void;
	draw(ctx: CanvasRenderingContext2D, transition?: TransitionState): void;
	snapshot(): NodeSnapshot;
}

export interface SceneDefinition {
	readonly id: string;
	readonly chapter?: string;
	readonly notes?: string;
	create(): SceneInstance;
	timeline(): SceneTimeline;
}

export type SceneBuild = (builder: SceneBuilder) => Generator<Step, void, unknown>;

export class SceneBuilder {
	readonly root = new GroupNode();
	readonly camera = new Camera();
	#audio: AudioCue[] = [];

	get audio(): readonly AudioCue[] {
		return this.#audio;
	}

	sound(src: string, options: AudioOptions = {}): this {
		this.#audio.push({
			src,
			at: options.at ?? 0,
			volume: options.volume ?? 1,
			loop: options.loop ?? false,
			duration: options.duration ?? null
		});
		return this;
	}

	add(...nodes: Node[]): this {
		this.root.add(...nodes);
		return this;
	}

	remove(...nodes: Node[]): this {
		for (const node of nodes) node.detach();
		return this;
	}

	layout(change: () => void, options: LayoutOptions = {}): Animation {
		return new Animation(new LayoutStep(this.root, change, options));
	}

	frame(target: CameraTarget, options: CameraOptions = {}): Animation {
		return cameraFrame(this.root, this.camera, target, options);
	}

	code(init: CodeNodeInit): CodeNode {
		const node = new CodeNode(init);
		this.root.add(node);
		return node;
	}

	text(content: string, init: Omit<TextInit, 'text'> = {}): TextNode {
		const node = new TextNode({ text: content, ...init });
		this.root.add(node);
		return node;
	}

	h1(content: string, init: Omit<TextInit, 'text'> = {}): TextNode {
		return this.text(content, {
			fontSize: 96,
			fontWeight: 700,
			fill: '#fafafa',
			...init
		});
	}

	h2(content: string, init: Omit<TextInit, 'text'> = {}): TextNode {
		return this.text(content, {
			fontSize: 64,
			fontWeight: 700,
			fill: '#fafafa',
			...init
		});
	}

	body(content: string, init: Omit<TextInit, 'text'> = {}): TextNode {
		return this.text(content, {
			fontSize: 24,
			fontWeight: 400,
			fill: '#a1a1aa',
			...init
		});
	}

	h3(content: string, init: Omit<TextInit, 'text'> = {}): TextNode {
		return this.text(content, {
			fontSize: 32,
			fontWeight: 600,
			fill: '#a1a1aa',
			...init
		});
	}

	rect(init: RectInit): RectNode {
		const node = new RectNode(init);
		this.root.add(node);
		return node;
	}

	card(init: RectInit, ...children: Node[]): RectNode {
		const node = new RectNode({
			fill: '#18181b',
			radius: 24,
			...init
		});
		node.add(...children);
		this.root.add(node);
		return node;
	}

	group(init: NodeInit = {}, ...children: Node[]): GroupNode {
		const node = new GroupNode(init);
		node.add(...children);
		this.root.add(node);
		return node;
	}
}

class Instance implements SceneInstance {
	#completed = 0;
	#active: number | null = null;
	#activeProgress = 0;

	constructor(
		readonly id: string,
		readonly root: GroupNode,
		readonly steps: readonly Step[],
		readonly camera: Camera,
		readonly audio: readonly AudioCue[]
	) {}

	get duration(): number {
		return this.steps.reduce((total, step) => total + step.duration, 0);
	}

	get timeline(): SceneTimeline {
		let cursor = 0;
		const steps = this.steps.map((step, index) => {
			const entry = { index, label: step.label, duration: step.duration };
			cursor += step.duration;
			return entry;
		});
		return { steps, totalDuration: cursor };
	}

	/**
	 * Moves the scene to an absolute time. Forward playback only advances the
	 * current step, while a backward seek rebuilds from the start, so scrubbing
	 * stays deterministic without replaying every earlier step on every frame.
	 */
	seek(seconds: number) {
		const total = this.duration;
		const target = Math.min(total, Math.max(0, seconds));

		if (target <= 0) {
			this.#reset();
		}

		let index = 0;
		let cursor = 0;
		for (; index < this.steps.length; index++) {
			const step = this.steps[index]!;
			const end = cursor + step.duration;
			if (target < end) break;
			cursor = end;
		}

		if (index >= this.steps.length) {
			this.#completeTo(this.steps.length);
			return;
		}

		const step = this.steps[index]!;
		const progress = step.duration > 0 ? (target - cursor) / step.duration : 1;
		const rewound =
			index < this.#completed ||
			(this.#active !== null &&
				(index < this.#active ||
					(index === this.#active && progress + 1e-9 < this.#activeProgress)));
		if (rewound) this.#reset();

		this.#completeTo(index);

		if (this.#active !== index) {
			step.start();
			this.#active = index;
			this.#activeProgress = 0;
		}

		step.setProgress(progress);
		this.#activeProgress = progress;
	}

	#completeTo(index: number) {
		while (this.#completed < index) {
			const step = this.steps[this.#completed]!;
			if (this.#active !== this.#completed) {
				step.start();
				this.#active = this.#completed;
			}
			step.setProgress(1);
			step.end();
			this.#active = null;
			this.#completed += 1;
			this.#activeProgress = 0;
		}
	}

	#reset() {
		if (this.#active !== null) this.steps[this.#active]?.revert();
		for (let index = this.#completed - 1; index >= 0; index--) {
			this.steps[index]?.revert();
		}
		this.#completed = 0;
		this.#active = null;
		this.#activeProgress = 0;
	}

	draw(ctx: CanvasRenderingContext2D, transition: TransitionState = IDENTITY_TRANSITION) {
		ctx.save();
		ctx.translate(transition.x, transition.y);
		ctx.scale(transition.scale, transition.scale);
		ctx.globalAlpha *= transition.opacity;

		ctx.save();
		ctx.scale(this.camera.zoom(), this.camera.zoom());
		ctx.rotate((this.camera.deg() * Math.PI) / 180);
		ctx.translate(-this.camera.x(), -this.camera.y());

		this.root.draw(ctx);
		for (const step of this.steps) step.drawOverlay?.(ctx);

		ctx.restore();
		ctx.restore();
	}

	snapshot(): NodeSnapshot {
		return snapshotNode(this.root);
	}
}

const IDENTITY_TRANSITION: TransitionState = { opacity: 1, x: 0, y: 0, scale: 1 };

function snapshotNode(node: Node): NodeSnapshot {
	return {
		id: node.id,
		kind: node.kind,
		layoutKey: node.layoutKey,
		values: node.saveState(),
		children: node.children.map(snapshotNode)
	};
}

function createInstance(id: string, build: SceneBuild): SceneInstance {
	const builder = new SceneBuilder();
	const generator = build(builder);
	const steps: Step[] = [];

	for (let next = generator.next(); !next.done; next = generator.next()) {
		const step = next.value;
		steps.push(step);
		step.start();
		step.setProgress(1);
		step.end();
	}

	for (let index = steps.length - 1; index >= 0; index--) {
		steps[index]?.revert();
	}

	return new Instance(id, builder.root, steps, builder.camera, builder.audio);
}

export function defineScene(
	id: string,
	build: SceneBuild,
	meta: { chapter?: string; notes?: string } = {}
): SceneDefinition {
	let cachedTimeline: SceneTimeline | null = null;

	return {
		id,
		chapter: meta.chapter,
		notes: meta.notes,
		create: () => createInstance(id, build),
		timeline: () => {
			cachedTimeline ??= createInstance(id, build).timeline;
			return cachedTimeline;
		}
	};
}
