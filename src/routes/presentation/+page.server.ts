import { redirect } from '@sveltejs/kit';
import { defaultPresentationSlug } from '#lib/server/presentations.js';
import type { PageServerLoad } from './$types';

/* Redirect to the default presentation, or the dashboard when there is none. */
export const load: PageServerLoad = async ({ url }) => {
	const slug = await defaultPresentationSlug();
	if (!slug) throw redirect(307, `/${url.search}`);
	throw redirect(307, `/presentation/${slug}${url.search}`);
};
