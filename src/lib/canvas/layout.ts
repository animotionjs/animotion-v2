import { clamp, easeInOut, lerp, type Easing } from './easing.js';
import { measureWorld, type Bounds } from './measure.js';
import type { Node, NodeState } from './nodes.js';
import type { Step } from './steps.js';

export type LayoutTransition = 'fade' | 'scale' | 'none';

export interface LayoutOptions {
	duration?: number;
	enter?: LayoutTransition;
	exit?: LayoutTransition;
	ease?: Easing;
}

interface RetainedLayout {
	node: Node;
	before: Bounds;
	after: Bounds;
}

interface ExitLayout {
	node: Node;
	bounds: Bounds;
}

function ratio(before: number, after: number): number {
	if (after === 0) return 1;
	return before / after;
}

function snapshotTree(root: Node): Map<Node, Node[]> {
	const tree = new Map<Node, Node[]>();
	const visit = (node: Node) => {
		tree.set(node, [...node.children]);
		for (const child of node.children) visit(child);
	};
	visit(root);
	return tree;
}

function snapshotStates(root: Node): Map<Node, NodeState> {
	const states = new Map<Node, NodeState>();
	const visit = (node: Node) => {
		states.set(node, node.saveState());
		for (const child of node.children) visit(child);
	};
	visit(root);
	return states;
}

export class LayoutStep implements Step {
	readonly label = 'layout';
	readonly duration: number;
	readonly root: Node;
	#change: () => void;
	#ease: Easing;
	#enter: LayoutTransition;
	#exit: LayoutTransition;
	#retained: RetainedLayout[] = [];
	#entering: Node[] = [];
	#exiting: ExitLayout[] = [];
	#tree: Map<Node, Node[]> | null = null;
	#afterTree: Map<Node, Node[]> | null = null;
	#states: Map<Node, NodeState> | null = null;

	constructor(root: Node, change: () => void, options: LayoutOptions = {}) {
		this.duration = options.duration ?? 0.5;
		this.root = root;
		this.#change = change;
		this.#ease = options.ease ?? easeInOut;
		this.#enter = options.enter ?? 'fade';
		this.#exit = options.exit ?? 'fade';
	}

	start() {
		this.#tree = snapshotTree(this.root);
		this.#states = snapshotStates(this.root);
		const before = measureWorld(this.root);

		this.#change();
		this.#afterTree = snapshotTree(this.root);

		const after = measureWorld(this.root);
		this.#retained = [];
		this.#entering = [];
		this.#exiting = [];

		for (const [node, beforeBounds] of before) {
			if (!node.layoutKey) continue;
			const afterBounds = after.get(node);
			if (afterBounds) {
				this.#retained.push({ node, before: beforeBounds, after: afterBounds });
			} else if (this.#exit !== 'none') {
				this.#exiting.push({ node, bounds: beforeBounds });
			}
		}

		for (const [node] of after) {
			if (!node.layoutKey || before.has(node)) continue;
			this.#entering.push(node);
		}

		this.setProgress(0);
	}

	setProgress(progress: number) {
		const eased = this.#ease(clamp(progress, 0, 1));

		for (const { node, before, after } of this.#retained) {
			node.layoutX(lerp(before.x - after.x, 0, eased));
			node.layoutY(lerp(before.y - after.y, 0, eased));
			node.layoutScaleX(lerp(ratio(before.width, after.width), 1, eased));
			node.layoutScaleY(lerp(ratio(before.height, after.height), 1, eased));
		}

		for (const node of this.#entering) {
			const alpha = this.#enter === 'fade' ? eased : 1;
			/*
			 * the original layout scale transition pops in from nothing, so the
			 * first frame of an enter is fully hidden without a separate fade
			 */
			const scale = this.#enter === 'scale' ? eased : 1;
			node.layoutAlpha(alpha);
			node.layoutScaleX(scale);
			node.layoutScaleY(scale);
		}

		for (const { node } of this.#exiting) {
			const alpha = this.#exit === 'fade' ? 1 - eased : 1;
			const scale = this.#exit === 'scale' ? 1 - eased : 1;
			node.layoutAlpha(alpha);
			node.layoutScaleX(scale);
			node.layoutScaleY(scale);
		}
	}

	end() {
		this.#reset();
	}

	revert() {
		const tree = this.#tree;
		const afterTree = this.#afterTree;
		if (tree) {
			for (const [parent, children] of tree) {
				/*
				 * Nodes added after the step are not part of its before or after
				 * snapshots. Keep them when the tree is restored, or rewinding an
				 * earlier layout step would delete them.
				 */
				const after = afterTree?.get(parent) ?? [];
				const later = parent.children.filter(
					(child) => !children.includes(child) && !after.includes(child)
				);
				parent.replaceChildren([...children, ...later]);
			}
		}

		const states = this.#states;
		if (states) {
			for (const [node, state] of states) node.restoreState(state);
		}

		this.#reset();
		this.#tree = null;
		this.#afterTree = null;
		this.#states = null;
	}

	drawOverlay(ctx: CanvasRenderingContext2D, time = 0) {
		for (const { node, bounds } of this.#exiting) {
			const alpha = this.#exit === 'fade' ? node.layoutAlpha() : 1;
			node.drawGhost(ctx, bounds.x, bounds.y, alpha, time);
		}
	}

	#reset() {
		for (const { node } of this.#retained) node.resetLayout();
		for (const node of this.#entering) node.resetLayout();
		for (const { node } of this.#exiting) node.resetLayout();
		this.#retained = [];
		this.#entering = [];
		this.#exiting = [];
	}
}
