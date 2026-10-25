/**
 * One scene as a chapter candidate, in presentation seconds.
 */
export interface ChapterScene {
	id: string;
	/** Authored title, or an empty string when the scene has none. */
	title: string;
	/** Seconds from the presentation start where the scene begins. */
	start: number;
	/** Seconds the scene occupies. */
	duration: number;
}

/** YouTube needs at least three chapters before it shows any of them. */
export const MINIMUM_CHAPTER_COUNT = 3;
/** YouTube hides chapters shorter than this, and refuses a list that has one. */
export const MINIMUM_CHAPTER_SECONDS = 10;

/**
 * Seconds as YouTube wants a timestamp, `m:ss` or `h:mm:ss` past an hour.
 * The seconds part is always two digits, which the parser relies on.
 */
export function formatTimestamp(seconds: number): string {
	const whole = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor((whole % 3600) / 60);
	const rest = whole % 60;
	const tail = `${String(rest).padStart(2, '0')}`;
	if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${tail}`;
	return `${minutes}:${tail}`;
}

/**
 * A readable label for a scene that has no authored title. The scene id comes
 * from the file name after the numeric prefix, so `first-idea` reads as
 * `First idea` and a presenter never has to name every scene to get a list.
 */
export function titleFromId(id: string): string {
	const words = id.replace(/[-_]+/g, ' ').trim();
	if (words.length === 0) return id;
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelOf(scene: ChapterScene): string {
	const title = scene.title.trim();
	return title.length > 0 ? title : titleFromId(scene.id);
}

/**
 * A scene whose start is too close to the previous kept chapter is folded into
 * it, so the list never has two timestamps under ten seconds apart, which is
 * what YouTube rejects. The first scene always starts the list, because YouTube
 * needs a chapter at `0:00`.
 */
function foldShortScenes(scenes: readonly ChapterScene[]): ChapterScene[] {
	const folded: ChapterScene[] = [];
	for (const scene of scenes) {
		const previous = folded[folded.length - 1];
		if (!previous || scene.start - previous.start >= MINIMUM_CHAPTER_SECONDS) {
			folded.push({ ...scene });
			continue;
		}
		// the gap is short, so this scene adds its time to the chapter it sits inside
		previous.duration += scene.duration;
	}
	return folded;
}

/**
 * Builds the chapter block for a YouTube description from the measured
 * timeline. Every line is a timestamp and a label, the first starts at `0:00`,
 * and a scene that starts too soon after the chapter before it is merged in.
 */
export function buildChapters(scenes: readonly ChapterScene[]): string {
	const usable = foldShortScenes(scenes);
	if (usable.length === 0) return '';
	/*
	 * YouTube only treats a block as chapters when the first line is `0:00`, so
	 * the first chapter is anchored there and the rest keep their own times.
	 */
	return usable
		.map((scene, index) => {
			const at = index === 0 ? 0 : scene.start;
			return `${formatTimestamp(at)} ${labelOf(scene)}`;
		})
		.join('\n');
}

/**
 * Why a chapter list would not be accepted, or null when it is fine. YouTube
 * needs at least three chapters and none under ten seconds. The check runs on
 * the built list, so a caller can warn the presenter before they paste it.
 */
export function chaptersWarning(scenes: readonly ChapterScene[]): string | null {
	const usable = foldShortScenes(scenes);
	if (usable.length === 0) return 'There are no scenes to make chapters from.';
	if (usable.length < MINIMUM_CHAPTER_COUNT) {
		return `YouTube needs at least ${MINIMUM_CHAPTER_COUNT} chapters. This video has ${usable.length}.`;
	}
	return null;
}
