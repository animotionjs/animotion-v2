import { Camera, frame as cameraFrame, type CameraOptions, type CameraTarget } from './camera.js';
import { CodeNode, type CodeNodeInit } from './code-node.js';
import { ImageNode, VideoNode, type MediaFit } from './media.js';
import { LayoutStep, type LayoutOptions } from './layout.js';
import type { AudioCue, AudioOptions } from './audio.js';
import {
	GroupNode,
	RectNode,
	TextNode,
	type DrawOptions,
	type Node,
	type NodeInit,
	type NodeState,
	type RectInit,
	type TextInit
} from './nodes.js';
import {
	BezierNode,
	CircleNode,
	LineNode,
	PathNode,
	PolygonNode,
	SplineNode,
	type BezierInit,
	type CircleInit,
	type LineInit,
	type PathInit,
	type SplineInit
} from './shapes.js';
import { RichTextNode, type RichTextInit, type RichTextRun } from './rich-text.js';
import { SvgNode, type SvgInit } from './svg.js';
import { StepRunner, Animation, type Step } from './steps.js';
import { ThreadRecorder, withThreadRecorder, type Thread } from './threading.js';
import type { TransitionConfig } from '../scene/options.js';

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
	readonly threads: readonly Thread[];
	readonly duration: number;
	readonly timeline: SceneTimeline;
	seek(seconds: number): void;
	draw(ctx: CanvasRenderingContext2D, transition?: TransitionState, options?: DrawOptions): void;
	snapshot(): NodeSnapshot;
	/** Called by async nodes when the picture needs to be drawn again. */
	setInvalidate(callback: (() => void) | null): void;
}

export interface SceneDefinition {
	readonly id: string;
	readonly chapter?: string;
	readonly notes?: string;
	/** Overrides the configured scene transition, or disables it with `null`. */
	readonly transition?: TransitionConfig | null;
	create(): SceneInstance;
	timeline(): SceneTimeline;
}

export type SceneBuild = (builder: SceneBuilder) => Generator<Step, void, unknown>;

export class SceneBuilder {
	readonly root = new GroupNode();
	readonly camera = new Camera();
	readonly threads = new ThreadRecorder();
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

	/** Starts an animation in the background at the current recorded time. */
	spawn(animation: Animation): Thread {
		return this.threads.spawn(animation);
	}

	/** Waits for a background thread to finish. */
	join(thread: Thread): Animation {
		return this.threads.join(thread);
	}

	/** Stops a background thread at the current recorded time. */
	cancel(thread: Thread) {
		this.threads.cancel(thread);
	}

	code(init: CodeNodeInit): CodeNode {
		const node = new CodeNode(init);
		this.root.add(node);
		return node;
	}

	image(
		init: {
			src: string;
			width?: number | null;
			height?: number | null;
			fit?: MediaFit;
			radius?: number;
			smoothness?: number;
			smoothing?: boolean;
		} & NodeInit
	): ImageNode {
		const node = new ImageNode(init);
		this.root.add(node);
		return node;
	}

	video(
		init: {
			src: string;
			width?: number | null;
			height?: number | null;
			fit?: MediaFit;
			radius?: number;
			smoothness?: number;
			smoothing?: boolean;
			muted?: boolean;
			loop?: boolean;
		} & NodeInit
	): VideoNode {
		const node = new VideoNode(init);
		this.root.add(node);
		return node;
	}

	svg(init: SvgInit): SvgNode {
		const node = new SvgNode(init);
		this.root.add(node);
		return node;
	}

	rich(runs: RichTextRun[], init: Omit<RichTextInit, 'runs'> = {}): RichTextNode {
		const node = new RichTextNode({ runs, ...init });
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

	circle(init: CircleInit): CircleNode {
		const node = new CircleNode(init);
		this.root.add(node);
		return node;
	}

	line(init: LineInit): LineNode {
		const node = new LineNode(init);
		this.root.add(node);
		return node;
	}

	polygon(init: Omit<LineInit, 'closed'> & { closed?: boolean }): PolygonNode {
		const node = new PolygonNode(init);
		this.root.add(node);
		return node;
	}

	spline(init: SplineInit): SplineNode {
		const node = new SplineNode(init);
		this.root.add(node);
		return node;
	}

	bezier(init: BezierInit): BezierNode {
		const node = new BezierNode(init);
		this.root.add(node);
		return node;
	}

	path(init: PathInit): PathNode {
		const node = new PathNode(init);
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

class ThreadRuntime {
	#runner: StepRunner;

	constructor(readonly thread: Thread) {
		this.#runner = new StepRunner([thread.animation.step]);
	}

	seek(time: number) {
		const span = this.thread.end - this.thread.start;
		if (span <= 0) {
			this.#runner.reset();
			return;
		}
		const local = time - this.thread.start;
		if (local <= 0) {
			this.#runner.reset();
			return;
		}
		this.#runner.seek(Math.min(local, span));
	}
}

class Instance implements SceneInstance {
	#runner: StepRunner;
	#runtimes: ThreadRuntime[];
	#time = 0;

	constructor(
		readonly id: string,
		readonly root: GroupNode,
		readonly steps: readonly Step[],
		readonly camera: Camera,
		readonly audio: readonly AudioCue[],
		readonly threads: readonly Thread[] = []
	) {
		this.#runner = new StepRunner(steps);
		this.#runtimes = threads.map((thread) => new ThreadRuntime(thread));
		this.root.onInvalidate = () => this.#invalidate?.();
	}

	#invalidate: (() => void) | null = null;

	setInvalidate(callback: (() => void) | null) {
		this.#invalidate = callback;
	}

	get duration(): number {
		return this.#runner.duration;
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
	 * Moves the scene to an absolute time. The step runner handles forward
	 * playback and backward seeks, and background threads follow the same clock.
	 */
	seek(seconds: number) {
		const total = this.duration;
		const target = Math.min(total, Math.max(0, seconds));
		this.#time = target;
		this.#runner.seek(target);
		for (const runtime of this.#runtimes) runtime.seek(target);
	}

	draw(
		ctx: CanvasRenderingContext2D,
		transition: TransitionState = IDENTITY_TRANSITION,
		options: DrawOptions = {}
	) {
		ctx.save();
		ctx.translate(transition.x, transition.y);
		ctx.scale(transition.scale, transition.scale);
		ctx.globalAlpha *= transition.opacity;

		ctx.save();
		ctx.scale(this.camera.zoom(), this.camera.zoom());
		ctx.rotate((this.camera.deg() * Math.PI) / 180);
		ctx.translate(-this.camera.x(), -this.camera.y());

		this.root.draw(ctx, this.#time, options);
		for (const step of this.steps) step.drawOverlay?.(ctx, this.#time);

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
	const steps: Step[] = [];

	withThreadRecorder(builder.threads, () => {
		const generator = build(builder);
		for (let next = generator.next(); !next.done; next = generator.next()) {
			const step = next.value;
			steps.push(step);
			step.start();
			step.setProgress(1);
			step.end();
			builder.threads.advance(step);
		}
	});

	for (let index = steps.length - 1; index >= 0; index--) {
		steps[index]?.revert();
	}

	return new Instance(
		id,
		builder.root,
		steps,
		builder.camera,
		builder.audio,
		builder.threads.threads
	);
}

export function defineScene(
	id: string,
	build: SceneBuild,
	meta: {
		chapter?: string;
		notes?: string;
		transition?: TransitionConfig | null;
	} = {}
): SceneDefinition {
	let cachedTimeline: SceneTimeline | null = null;

	return {
		id,
		chapter: meta.chapter,
		notes: meta.notes,
		transition: meta.transition,
		create: () => createInstance(id, build),
		timeline: () => {
			cachedTimeline ??= createInstance(id, build).timeline;
			return cachedTimeline;
		}
	};
}
