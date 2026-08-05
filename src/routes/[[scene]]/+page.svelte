<script lang="ts">
	import { Scenes } from '#lib';
	import { plugins } from '#lib/config/plugins';
	import { sequence } from '#lib/config/scenes';
</script>

<Scenes {sequence} {plugins} />
