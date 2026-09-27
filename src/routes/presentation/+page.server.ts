import { redirect } from '@sveltejs/kit';
import { defaultProjectSlug } from '#lib/server/projects.js';
import type { PageServerLoad } from './$types';

/* Redirect to the default project, or the dashboard when there is none. */
export const load: PageServerLoad = async ({ url }) => {
	const slug = await defaultProjectSlug();
	if (!slug) throw redirect(307, `/${url.search}`);
	throw redirect(307, `/presentation/${slug}${url.search}`);
};
