<!--
<script lang="ts">
	import { createScene } from '#lib/scene';
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import modelUrl from './assets/model.glb?url';

	let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera;
	let model: THREE.Group | null = null;

	function setup(canvas: HTMLCanvasElement) {
		renderer = new THREE.WebGLRenderer({ canvas });
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0xff819c);
		camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
		camera.position.z = 5;
		new GLTFLoader().load(modelUrl, (gltf) => {
			model = gltf.scene;
			const box = new THREE.Box3().setFromObject(model);
			const size = box.getSize(new THREE.Vector3());
			const maxDim = Math.max(size.x, size.y, size.z);
			const TARGET = 3;
			model.scale.setScalar(TARGET / maxDim);
			const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
			model.position.set(-center.x, -center.y, -center.z);
			scene.add(model);
			renderer.render(scene, camera);
		});
		scene.add(new THREE.AmbientLight(0xffffff, 0.4));
		const key = new THREE.DirectionalLight(0xffffff, 2.5);
		key.position.set(3, 3, 4);
		scene.add(key);
		const cyan = new THREE.PointLight(0x00ffff, 60, 20);
		cyan.position.set(-4, 1, 2);
		scene.add(cyan);
		const magenta = new THREE.PointLight(0xff2d95, 60, 20);
		magenta.position.set(3, -2, -3);
		scene.add(magenta);
		renderer.setSize(canvas.clientWidth, canvas.clientHeight);
		renderer.render(scene, camera);
	}

	createScene().tick(({ time }) => {
		if (!model) return;
		model.rotation.y = (time * Math.PI) / 4;
		renderer.render(scene, camera);
	}, 8);
</script>

<canvas class="h-full w-full" {@attach setup}></canvas>
-->
