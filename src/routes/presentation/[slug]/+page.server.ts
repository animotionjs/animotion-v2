import { listPresentations } from '#lib/server/presentations.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const presentations = await listPresentations();
	return {
		name:
			presentations.find((presentation) => presentation.slug === params.slug)?.name ?? params.slug
	};
};
