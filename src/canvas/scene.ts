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

	seek(seconds: number) {
		for (let index = this.steps.length - 1; index >= 0; index--) {
			this.steps[index]?.revert();
		}

		const target = Math.max(0, seconds);
		let cursor = 0;

		for (const step of this.steps) {
			const end = cursor + step.duration;
			if (target >= end) {
				step.start();
				step.setProgress(1);
				step.end();
				cursor = end;
				continue;
			}

			step.start();
			const local = Math.max(0, target - cursor);
			step.setProgress(step.duration > 0 ? local / step.duration : 1);
			return;
		}
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
