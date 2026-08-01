import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MARDOU_COMPANION_SAFE_ZONE,
  MARDOU_LOBBY_INTRO_ROUTE,
  mardouSourcePointToWorld,
} from "../components/MardouMuseumLayout.ts";

const companionSource = await readFile(new URL("../components/RoomCompanion.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");
const worldCanvasSource = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("room companion patrol points stay on the lobby floor and away from blocked transitions", () => {
  assert.equal(
    MARDOU_COMPANION_SAFE_ZONE.floorY,
    mardouSourcePointToWorld([-10.2734, -16.2896, -513.2173])[1],
  );
  const suppliedPatrolPoints = [
    [-10.2734, -16.2896, -513.2173],
    [-15.9923, -16.2896, -517.8265],
    [-17.6125, -16.2896, -528.2268],
    [-8.709, -16.2896, -533.9021],
    [0.5097, -16.2896, -532.5879],
    [2.7494, -16.2896, -526.8054],
    [0.2899, -16.2896, -520.4543],
  ];
  assert.deepEqual(
    MARDOU_COMPANION_SAFE_ZONE.waypoints,
    suppliedPatrolPoints.map((point) => mardouSourcePointToWorld(point as [number, number, number])),
  );
  assert.deepEqual(MARDOU_COMPANION_SAFE_ZONE.dialoguePoint, MARDOU_COMPANION_SAFE_ZONE.waypoints[0]);
  assert.equal(MARDOU_COMPANION_SAFE_ZONE.dialoguePoint[1], MARDOU_COMPANION_SAFE_ZONE.floorY);

  for (const waypoint of MARDOU_COMPANION_SAFE_ZONE.waypoints) {
    assert.equal(waypoint[1], MARDOU_COMPANION_SAFE_ZONE.floorY);
    assert.ok(waypoint[1] < 1, "companion must never route to the upper floor");
    assert.ok(waypoint[2] < -9.5, "companion must stay clear of the entry threshold");

    const inStairBand = waypoint[0] > -1.1
      && waypoint[0] < 3.8
      && waypoint[2] > -10
      && waypoint[2] < -7.6;
    assert.equal(inStairBand, false, "companion waypoint must not sit on the stair treads");
  }
  assert.match(companionSource, /chooseNextWaypoint/);
  assert.match(companionSource, /currentIndex\.current \+ 1/);
  assert.match(companionSource, /currentIndex\.current - 1 \+ count/);
  assert.match(companionSource, /companionMovementBlocked/);
  assert.match(companionSource, /collisionRaycaster/);
  assert.match(companionSource, /object instanceof THREE\.Mesh/);
  assert.match(companionSource, /intersectObjects\(collisionMeshes, false\)/);
  assert.doesNotMatch(companionSource, /intersectObjects\(scene\.children, true\)/);
  assert.match(companionSource, /chooseNextWaypoint\(blockedTarget\)/);
});

test("room companion starts at door one, reaches point 19 on the final turn, and returns to the safe route", () => {
  assert.deepEqual(
    MARDOU_COMPANION_SAFE_ZONE.entranceSpawn,
    mardouSourcePointToWorld([-10.018, -16.2896, -510.6123]),
  );
  assert.deepEqual(
    MARDOU_COMPANION_SAFE_ZONE.entranceWelcome,
    mardouSourcePointToWorld([-9.603, -16.2896, -499.1433]),
  );
  assert.ok(Math.hypot(
    MARDOU_COMPANION_SAFE_ZONE.entranceSpawn[0] - MARDOU_COMPANION_SAFE_ZONE.waypoints[0][0],
    MARDOU_COMPANION_SAFE_ZONE.entranceSpawn[2] - MARDOU_COMPANION_SAFE_ZONE.waypoints[0][2],
  ) < 0.55, "point 52 must begin from its adjacent point 55, not a random waypoint");
  const welcomeDistance = Math.hypot(
    MARDOU_COMPANION_SAFE_ZONE.entranceSpawn[0] - MARDOU_COMPANION_SAFE_ZONE.entranceWelcome[0],
    MARDOU_COMPANION_SAFE_ZONE.entranceSpawn[2] - MARDOU_COMPANION_SAFE_ZONE.entranceWelcome[2],
  );
  assert.ok(welcomeDistance > 2 && welcomeDistance < 3, "the pet must stop at the closer point 19 greeting position");
  assert.equal(MARDOU_COMPANION_SAFE_ZONE.entranceWalkSeconds, MARDOU_LOBBY_INTRO_ROUTE.duration);
  assert.match(companionSource, /welcoming\.current = true/);
  assert.match(companionSource, /const startIndex = 0/);
  assert.match(companionSource, /target\.set\(\.\.\.MARDOU_COMPANION_SAFE_ZONE\.entranceWelcome\)/);
  assert.match(companionSource, /entranceGreetingStarted/);
  assert.match(companionSource, /entranceGreetingArrived/);
  assert.match(companionSource, /welcoming\.current && !entranceGreetingStarted/);
  assert.match(companionSource, /entranceWalkElapsed\.current \/ MARDOU_COMPANION_SAFE_ZONE\.entranceWalkSeconds/);
  assert.match(worldCanvasSource, /onLobbyIntroComplete/);
  assert.match(worldCanvasSource, /onLobbyIntroStart\(\)/);
  assert.match(worldCanvasSource, /lobbyIntro: shouldPlayLobbyIntro/);
  assert.match(worldCanvasSource, /if \(completedLobbyIntro\) onLobbyIntroComplete\(\)/);
  assert.match(worldCanvasSource, /entranceGreetingStarted=\{entranceGreetingStarted\}/);
  assert.match(worldCanvasSource, /entranceGreetingArrived=\{entranceGreetingArrived\}/);
  assert.match(companionSource, /direction\.copy\(entranceApproaching \? target : state\.camera\.position\)/);
  assert.match(companionSource, /root\.current\.position\.x = target\.x/);
  assert.match(companionSource, /entrancePettingStartedAt\.current = clock\.current/);
  assert.match(companionSource, /normal patrol resumes with full multi-ray collision/);
  assert.match(companionSource, /state\.camera\.position/);
  assert.match(companionSource, /targetIndex\.current = startIndex/);
  assert.match(companionSource, /setPatrolTarget\(startIndex\)/);
  assert.match(companionSource, /!sceneReady/);
  assert.match(worldCanvasSource, /sceneReady=\{sceneReady\}/);
});

test("the entrance greeting includes a petting hand, happy face, fast tail, and jump", () => {
  assert.match(companionSource, /name="entrance-petting-hand"/);
  assert.match(companionSource, /pettingEffect: true/);
  assert.match(companionSource, /name="companion-happy-face"/);
  assert.match(companionSource, /happyJump/);
  assert.match(companionSource, /entrancePetting \? 18 : 7\.5/);
  assert.match(companionSource, /happyFace\.current\.visible = entrancePetting/);
  assert.match(companionSource, /pettingHand\.current\.visible = entrancePetting/);
});

test("room companion stays procedural while consuming only validated profile-space customization", () => {
  assert.match(companionSource, /name="room-companion-xiaobai"/);
  assert.match(companionSource, /companionName: appearance\.name/);
  assert.match(companionSource, /icosahedronGeometry/);
  assert.match(companionSource, /capsuleGeometry/);
  assert.match(companionSource, /coneGeometry/);
  assert.match(companionSource, /normalizePetCustomization/);
  assert.match(companionSource, /appearance\.earStyle/);
  assert.match(companionSource, /appearance\.markingStyle/);
  assert.match(worldCanvasSource, /customization=\{petCustomization\}/);
  assert.match(worldCanvasSource, /<PetBed companionName=\{companionName\}/);
  assert.match(worldCanvasSource, /subtitle="ROOM COMPANION"/);

  assert.doesNotMatch(companionSource, /useLoader/);
  assert.doesNotMatch(companionSource, /\.glb|\.gltf|imageUrl|profile\.media|CreativePetFigure/);
  assert.doesNotMatch(companionSource, /petName|petAsset|parsedPet|sourcePet/i);
});

test("room companion freezes and faces the camera during named companion QA, then resumes through frame refs", () => {
  assert.match(companionSource, /qaOpen/);
  assert.match(companionSource, /else if \(qaOpen\) \{[\s\S]{0,260}state\.camera\.position/);
  assert.match(companionSource, /MARDOU_COMPANION_SAFE_ZONE\.floorY[\s\S]{0,80}\+ \(qaOpen \? 0/);
  assert.match(companionSource, /onOpenQa\(\)/);
  assert.match(companionSource, /pauseUntil\.current/);
  assert.match(companionSource, /useFrame/);
  assert.doesNotMatch(companionSource, /useState/);
  assert.match(companionSource, /root\.current\.position\.add\(movement\)/);
  assert.match(studioSource, /className="companion-qa-launch"/);
  assert.match(studioSource, /aria-controls="pet-qa-panel"/);
  assert.match(studioSource, /问问\{companionName\}/);
});
