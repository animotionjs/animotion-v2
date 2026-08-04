<script lang="ts">
	import { Code, code, createScene } from '#lib/scene';

	createScene({
		code: `// cart.ts — shopping cart with validation
			import { Item, ITEM_TAX_RATE } from './catalog';

			const FREE_SHIPPING_MIN = 100;

			export class Cart {
				private items: Item[] = [];`,
		language: 'ts'
	})
		.codeSelection(code.lines(1, 2), 0.6)
		.codeAppend(
			`

			add(item: Item) {
				if (item.quantity <= 0) {
					throw new Error('quantity must be positive');
				}
				this.items.push(item);
			}`,
			0.8
		)
		.codeAppend(
			`

			remove(id: string) {
				this.items = this.items.filter((item) => item.id !== id);
			}

			subtotal() {
				return this.items.reduce((sum, item) => {
					return sum + item.price * item.quantity;
				}, 0);
			}`,
			0.8
		)
		.codeAppend(
			`

			total() {
				const subtotal = this.subtotal();
				const tax = subtotal * ITEM_TAX_RATE;
				const shipping = subtotal >= FREE_SHIPPING_MIN ? 0 : 10;
				return subtotal + tax + shipping;
			}`,
			0.8
		)
		.codeAppend(
			`

			format(amount: number) {
				return new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD'
				}).format(amount);
			}
		}`,
			0.8
		)
		.codeSelection(code.lines(1), 0.8)
		.codeSelection(code.lines(16, 18), 0.8)
		.codeSelection(code.lines(33, 39), 0.8)
		.codeSelection();
</script>

<Code class="text-2xl" />
