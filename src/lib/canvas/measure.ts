import type { Node } from './nodes.js';

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

let measureContext: CanvasRenderingContext2D | null = null;

export function getMeasureContext(): CanvasRenderingContext2D {
	if (measureContext) return measureContext;
	if (typeof document === 'undefined') {
		throw new Error('Canvas measurement needs a browser document.');
	}
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas measurement requires a 2D context.');
	measureContext = context;
	return context;
}

export function measureWorld(
	root: Node,
	ctx: CanvasRenderingContext2D = getMeasureContext()
): Map<Node, Bounds> {
	const bounds = new Map<Node, Bounds>();

	const visit = (node: Node, parentX: number, parentY: number, parentScale: number) => {
		const scale = parentScale * node.scale();
		const x = parentX + (node.x() + node.layoutX()) * parentScale;
		const y = parentY + (node.y() + node.layoutY()) * parentScale;
		const size = node.measure(ctx);
		bounds.set(node, {
			x,
			y,
			width: size.width * scale,
			height: size.height * scale
		});

		for (const child of node.children) visit(child, x, y, scale);
	};

	visit(root, 0, 0, 1);
	return bounds;
}

export function findNode(root: Node, id: string): Node | null {
	if (root.id === id) return root;
	for (const child of root.children) {
		const found = findNode(child, id);
		if (found) return found;
	}
	return null;
}
