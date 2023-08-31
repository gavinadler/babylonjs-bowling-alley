import "./style.css";
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";
import { HavokPhysicsWithBindings } from "@babylonjs/havok";
import * as Hammer from 'hammerjs';

// using CDN in index.html
declare function HavokPhysics(): any;

class App {
    canvas: HTMLCanvasElement;
    engine: BABYLON.Engine;
    scene: BABYLON.Scene;
    havok!: HavokPhysicsWithBindings;
    camera!: BABYLON.ArcRotateCamera | BABYLON.FreeCamera;
    bowlingAlleyMesh!: {
        character: BABYLON.AbstractMesh;
        ball: BABYLON.AbstractMesh;
        pins: BABYLON.InstancedMesh[];
        facility: BABYLON.AbstractMesh[];
    };
    allowThrow: boolean = false;
    gameState: 0 | 1 | 2 | 3 = 0;
    round: number = 1;
    throwPower: number = 100;
    throwAngle: number = 0; // max: 5, min: -5, default: 0

    constructor() {
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.id = "babylonCanvas";
        document.getElementById("app")!.appendChild(this.canvas);

        // initialize babylon scene and engine
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);

        this.bowlingAlleyMesh = {
            ball: null!,
            character: null!,
            pins: [],
            facility: [],
        };

        // wait until scene has physics then create scene
        this.InitScene().then(async () => {
            this.InitSceneCamera();
            await this.CreateBowlingAlley(this.scene);
            await this.CreatePins(this.scene);
            await this.CreateBall(this.scene);
            await this.CreateCharacter(this.scene);
            this.CreateLight();

            this.allowThrow = true;

            this.engine.runRenderLoop(() => {
                if (this.scene) this.scene.render();
            });

            const handleKeydown = (ev: KeyboardEvent) => {
                // hide/show the Inspector by pressing i
                if (ev.key === "i") {
                    if (this.scene.debugLayer.isVisible()) {
                        this.scene.debugLayer.hide();
                    } else {
                        this.scene.debugLayer.show();
                    }
                }
                // switch to arc rotate camera by pressing 1
                if (ev.key === "1") {
                    this.InitSceneCamera();
                }
                // switch to first person controller by pressing 2
                if (ev.key === "2") {
                    this.InitFirstPersonController();
                }
            };

            const handleResize = () => {
                this.engine.resize();
            };
            window.addEventListener("keydown", handleKeydown);

            // the canvas/window resize event handler
            window.addEventListener("resize", handleResize);

            // remove event listener
            this.scene.onDispose = () => {
                window.removeEventListener("keydown", handleKeydown);
                window.removeEventListener("resize", handleResize);
            };
        });
    }

    async InitScene(): Promise<void> {
        const envMapTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
            "/env/sky.env",
            this.scene,
        );
        this.scene.environmentTexture = envMapTexture;
        this.scene.createDefaultSkybox(envMapTexture, true);
        this.scene.environmentIntensity = 0.5;

        // Enable physics
        const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
        this.havok = await HavokPhysics();
        // pass the engine to the plugin
        const havokPlugin = new BABYLON.HavokPlugin(true, this.havok);
        // enable physics in the scene with a gravity
        this.scene.enablePhysics(gravityVector, havokPlugin);

        this.scene.collisionsEnabled = true;
    }

    CleanUpCamera() {
        if (this.camera) {
            this.scene.removeCamera(this.camera);
            this.camera.dispose();

            this.engine.exitPointerlock();
            this.scene.onPointerDown = undefined;
        }
    }

    InitFirstPersonController() {
        this.CleanUpCamera();

        this.camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 2.5, -2),
            this.scene,
        );
        this.camera.attachControl();

        this.engine.enterPointerlock();
        this.scene.onPointerDown = e => {
            // left click
            if (e.button === 0) this.engine.enterPointerlock();

            // middle click
            if (e.button === 1) this.engine.exitPointerlock();
        };

        this.camera.applyGravity = true;
        this.camera.checkCollisions = true;
        this.camera.ellipsoid = new BABYLON.Vector3(1, 1.25, 1);
        this.camera.speed = 1.5; // walking speed
        this.camera.inertia = 0.5; // reduce slipping
        this.camera.minZ = 0.1; // prevent clipping
        this.camera.angularSensibility = 1500; // mouse sensitivity: higher value = less sensitive

        this.camera.keysUp.push(87); // W
        this.camera.keysLeft.push(65); // A
        this.camera.keysDown.push(83); // S
        this.camera.keysRight.push(68); // D
    }

    InitSceneCamera() {
        this.CleanUpCamera();

        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            -Math.PI * 0.5,
            Math.PI * 0.5,
            5,
            BABYLON.Vector3.Zero(),
            this.scene,
        );

        this.camera.position = new BABYLON.Vector3(0, 2.5, -5);
        this.camera.setTarget(new BABYLON.Vector3(0, 2, 0));

        // This attaches the camera to the canvas
        this.camera.attachControl(this.canvas, true);

        // prevent clipping
        this.camera.minZ = 0.1;

        this.camera.wheelPrecision = 50;

        // camera min distance and max distance
        this.camera.lowerRadiusLimit = 0.1;
        this.camera.upperRadiusLimit = 50;

        //  lower rotation sensitivity, higher value = less sensitive
        this.camera.angularSensibilityX = 2000;
        this.camera.angularSensibilityY = 2000;

        // disable rotation using keyboard arrow key
        this.camera.keysUp = [];
        this.camera.keysDown = [];
        this.camera.keysLeft = [];
        this.camera.keysRight = [];
    }

    CreateLight() {
        // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
        const hemiLight = new BABYLON.HemisphericLight(
            "hemiLight",
            new BABYLON.Vector3(0, 1, 0),
            this.scene,
        );

        // dim light a small amount
        hemiLight.intensity = 0.7;

        const dirLight = new BABYLON.DirectionalLight(
            "dirLight",
            new BABYLON.Vector3(-0.5, -1, -0.5),
            this.scene,
        );

        dirLight.position = new BABYLON.Vector3(30, 20, -10);
        dirLight.intensity = 2.5;
        dirLight.shadowEnabled = true;
        dirLight.shadowMinZ = 10;
        dirLight.shadowMaxZ = 60;

        // this.CreateLightGizmo(dirLight);

        // Shadows
        const shadowGenerator = new BABYLON.ShadowGenerator(2048, dirLight);
        shadowGenerator.bias = 0.01;

        // enable PCF shadows for WebGL2
        shadowGenerator.usePercentageCloserFiltering = true;
        shadowGenerator.blurScale = 0.1;

        // low quality for better performance
        // shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_LOW;

        this.bowlingAlleyMesh.ball.receiveShadows = true;
        shadowGenerator.addShadowCaster(this.bowlingAlleyMesh.ball);

        this.bowlingAlleyMesh.pins.forEach(mesh => {
            mesh.receiveShadows = true;
            shadowGenerator.addShadowCaster(mesh);
        });
        this.bowlingAlleyMesh.facility.forEach(mesh => {
            mesh.receiveShadows = true;
            shadowGenerator.addShadowCaster(mesh);
        });
    }

    CreateLightGizmo(customLight: BABYLON.Light) {
        const lightGizmo = new BABYLON.LightGizmo();
        lightGizmo.scaleRatio = 2;
        lightGizmo.light = customLight;

        const gizmoManager = new BABYLON.GizmoManager(this.scene);
        gizmoManager.positionGizmoEnabled = true;
        gizmoManager.rotationGizmoEnabled = true;
        gizmoManager.usePointerToAttachGizmos = false;
        gizmoManager.attachToMesh(lightGizmo.attachedMesh);
    }

    async CreateCharacter(scene: BABYLON.Scene) {
        const { meshes } = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "character.glb",
            scene,
        );

        // play Idle animation
        const idleAnim = scene.getAnimationGroupByName("Walking")!;
        idleAnim.start(true, 1.0, idleAnim.from, idleAnim.to, false);

        meshes[0].position = new BABYLON.Vector3(0, 0, -2);
        meshes[0].scaling.scaleInPlace(1.5);
    }

    async CreateBowlingAlley(scene: BABYLON.Scene) {
        const { meshes } = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "bowling-alley.glb",
            scene,
        );

        for (const mesh of meshes) {
            mesh.receiveShadows = true;
        }

        meshes.forEach(mesh => {
            mesh.scaling.scaleInPlace(6);
            mesh.position = new BABYLON.Vector3(1.34, 3.38, 58);

            // lane of user, enable physics collision
            if (
                mesh.name === "polygon1.001" ||
                mesh.name === "polygon133" ||
                mesh.name === "polygon139"
            ) {
                new BABYLON.PhysicsAggregate(
                    mesh,
                    BABYLON.PhysicsShapeType.MESH,
                    { mass: 0 },
                    scene,
                );
            }
        });

        this.bowlingAlleyMesh.facility = meshes;

        // Create invisible floor as ground to walk on with physics
        const ground = BABYLON.MeshBuilder.CreateGround(
            "ground",
            { width: 140, height: 63 },
            scene,
        );
        ground.position.y = -0.1;
        ground.checkCollisions = true;
        ground.material = new BABYLON.StandardMaterial("groundMat", scene);
        ground.material.alpha = 0;
    }

    async CreatePins(scene: BABYLON.Scene): Promise<void> {
        const { meshes } = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "pin.glb",
            scene,
        );

        const bowlingPin = meshes[1];
        bowlingPin.scaling = new BABYLON.Vector3(0.3, 0.3, 0.3);
        bowlingPin.setEnabled(false);

        // Pin positions
        const pinPositions = [
            new BABYLON.Vector3(0, 0, 31.51),
            new BABYLON.Vector3(0.55, 0, 32.455),
            new BABYLON.Vector3(-0.55, 0, 32.455),
            new BABYLON.Vector3(0, 0, 33.39),
            new BABYLON.Vector3(1.1, 0, 33.39),
            new BABYLON.Vector3(-1.1, 0, 33.39),
            new BABYLON.Vector3(-1.65, 0, 34.35),
            new BABYLON.Vector3(-0.55, 0, 34.35),
            new BABYLON.Vector3(0.55, 0, 34.35),
            new BABYLON.Vector3(1.65, 0, 34.35),
        ];

        // Create instances of the bowling pin
        pinPositions.forEach((positionInSpace, idx) => {
            const pin = new BABYLON.InstancedMesh(
                "pin-" + idx,
                bowlingPin as BABYLON.Mesh,
            );
            pin.position = positionInSpace;

            this.bowlingAlleyMesh.pins.push(pin);

            new BABYLON.PhysicsAggregate(
                pin,
                BABYLON.PhysicsShapeType.CONVEX_HULL,
                { mass: 1, restitution: 0.15 },
                scene,
            );
            return pin;
        });
    }

    async CreateBall(scene: BABYLON.Scene) {
        const result = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "ball.glb",
            scene,
        );

        const bowlingBall = result.meshes[1];
        bowlingBall.scaling.scaleInPlace(0.7);
        bowlingBall.position = new BABYLON.Vector3(0, 0.5, 1);

        this.bowlingAlleyMesh.ball = bowlingBall;

        const ballAggregate = new BABYLON.PhysicsAggregate(
            bowlingBall,
            BABYLON.PhysicsShapeType.SPHERE,
            { mass: 4, restitution: 0.25 },
            scene,
        );
        ballAggregate.body.disablePreStep = false;

        // Keyboard input for ball
        scene.onKeyboardObservable.add(kbInfo => {
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                if (!this.allowThrow) return;
                switch (kbInfo.event.key.toLowerCase().trim()) {
                    case "":
                        ballAggregate.body.applyImpulse(
                            new BABYLON.Vector3(this.throwAngle, 0, 100),
                            bowlingBall.getAbsolutePosition(),
                        );
                        this.allowThrow = false;
                        break;
                    case "w":
                    case "arrowup":
                        this.throwAngle += this.throwAngle >= 5 ? 0 : 0.5;
                        bowlingBall.rotate(BABYLON.Vector3.Up(), -Math.PI * 0.01);
                        break;
                    case "s":
                    case "arrowdown":
                        this.throwAngle -= this.throwAngle <= -5 ? 0 : 0.5;
                        bowlingBall.rotate(BABYLON.Vector3.Up(), Math.PI * 0.01);
                        break;
                    case "a":
                    case "arrowleft":
                        bowlingBall.position.x += bowlingBall.position.x > 1.8 ? 0 : 0.05;
                        break;
                    case "d":
                    case "arrowright":
                        bowlingBall.position.x -= bowlingBall.position.x < -1.8 ? 0 : 0.05;
                        break;
                }
            }
        });

        // phone input for ball
        const hammerManager = new Hammer.Manager(this.canvas);

        // create swipe gesture recognizer and add recognizer to manager
        const Swipe = new Hammer.Swipe();
        hammerManager.add(Swipe);

        hammerManager.get("swipe").set({ direction: Hammer.DIRECTION_ALL });
        hammerManager.on("swipe", (e: any) => {
            if (!this.allowThrow) return;
            switch (e.direction) {
                // swipe up to throw ball
                case Hammer.DIRECTION_UP:
                    ballAggregate.body.applyImpulse(
                        new BABYLON.Vector3(this.throwAngle, 0, 100),
                        bowlingBall.getAbsolutePosition(),
                    );
                    this.allowThrow = false;
                    break;
                case Hammer.DIRECTION_LEFT:
                    bowlingBall.position.x += bowlingBall.position.x > 1.8 ? 0 : 0.05;
                    break;
                case Hammer.DIRECTION_RIGHT:
                    bowlingBall.position.x -= bowlingBall.position.x < -1.8 ? 0 : 0.05;
                    break;
            }
        });
    }
}

new App();
