import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { checkWorld } from "../lib/agents/checker.ts";
import { runPipeline } from "../lib/agents/pipeline.ts";
import { sampleResume } from "../lib/data/sample-resume.ts";
import { extractWebPage } from "../lib/extract-webpage.ts";
import { validateProfile, validateReport, validateWorld } from "../lib/validate.ts";
import { MUSEUM_LAYOUT, MUSEUM_RENDER_POINTS } from "../lib/museum-layout.ts";

test("parser keeps line-level evidence for every content item", () => {
  const result = runPipeline(sampleResume);
  assert.equal(validateProfile(result.profile).length, 0);
  assert.ok(result.profile.items.every((item) => item.evidence[0]?.locator.startsWith("line")));
  assert.equal(result.profile.items.filter((item) => item.kind === "project").length, 4);
  assert.equal(result.profile.skills.length, 12);
});

test("orchestrator maps every résumé item into the public showroom and keeps résumé exhibits out of the private diary room", () => {
  const result = runPipeline(sampleResume);
  const expected = result.profile.items.length + result.profile.skills.length;
  assert.equal(result.world.rooms.length, 2);
  assert.equal(result.world.portals.length, 1);
  assert.deepEqual(result.world.rooms.find((room) => room.id === "room-lobby")?.size, MUSEUM_LAYOUT.bounds.groundSize);
  assert.deepEqual(result.world.rooms.find((room) => room.id === "room-private")?.size, MUSEUM_LAYOUT.bounds.privateSize);
  assert.deepEqual(result.world.rooms.find((room) => room.id === "room-private")?.center, MUSEUM_LAYOUT.bounds.privateCenter);
  assert.deepEqual(result.world.portals[0]?.position, MUSEUM_LAYOUT.portal);
  assert.ok((result.world.rooms.find((room) => room.id === "room-private")?.center[1] || 0) > 2);
  assert.ok(result.world.exhibits.every((item) => item.roomId === "room-lobby"));
  assert.equal(result.world.rooms.find((room) => room.id === "room-private")?.kind, "bedroom");
  assert.deepEqual(result.world.rooms.find((room) => room.id === "room-private")?.exhibitIds, []);
  assert.equal(result.world.exhibits.length, expected);
  assert.equal(new Set(result.world.exhibits.map((item) => item.sourceItemId)).size, expected);
  const projectPedestals = result.world.exhibits.filter((item) => item.eyebrow === "PROJECT");
  assert.deepEqual(
    projectPedestals.map((item) => item.position),
    MUSEUM_RENDER_POINTS.filter((point) => point.mesh === "Floor" && point.position[1] < 1)
      .slice(1)
      .slice(0, projectPedestals.length)
      .map((point) => point.position),
  );
  assert.equal(validateWorld(result.world).length, 0);
  assert.equal(result.report.checks.find((item) => item.name === "Room graph")?.passed, true);
});

test("Mardou museum asset keeps required nodes and the runtime creates no ROOM textures", () => {
  const glb = readFileSync("public/vendor/mardou/MardouMuseumResult.glb");
  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  const jsonLength = glb.readUInt32LE(12);
  const jsonType = glb.readUInt32LE(16);
  assert.equal(jsonType, 0x4e4f534a);
  const json = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength).replace(/\u0000+$/g, "")) as {
    nodes: Array<{ name?: string }>;
  };
  const names = new Set(json.nodes.map((node) => node.name));
  for (const required of ["Floor", "Chrome", "Ceiling", "Walls"]) assert.ok(names.has(required));

  assert.deepEqual(readdirSync("public/vendor/mardou").filter((name) => name.endsWith(".png")), []);
  const runtime = readFileSync("components/MuseumWorldCanvas.tsx", "utf8");
  assert.equal(runtime.includes("CanvasTexture"), false);
  assert.equal(runtime.includes("TextureLoader"), false);
  assert.equal(runtime.includes("imageUrl"), false);
});

test("default world passes the deterministic checker", () => {
  const result = runPipeline(sampleResume);
  assert.equal(result.report.passed, true);
  assert.equal(result.report.score, 100);
  assert.equal(validateReport(result.report).length, 0);
});

test("checker catches overlap, dead interaction, omissions, and mobile budget", () => {
  const result = runPipeline(sampleResume);
  const world = structuredClone(result.world);
  world.exhibits[2].position = [...world.exhibits[1].position];
  world.exhibits[1].interaction.clickable = false;
  world.exhibits.pop();
  world.metrics.estimatedDrawCalls = 120;
  const report = checkWorld(world);
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((item) => item.category === "overlap"));
  assert.ok(report.issues.some((item) => item.category === "interaction"));
  assert.ok(report.issues.some((item) => item.category === "content"));
  assert.ok(report.issues.some((item) => item.category === "performance"));
});

test("academic homepage extraction keeps semantic sections and maps real project images", () => {
  const html = `<!doctype html>
    <html><head><title>韩晨（Chen Han） - Homepage</title></head><body>
      <div class="profile_box">
        <img src="images/photo.png" alt="韩晨（Chen Han）">
        <h3 class="author__name">韩晨（Chen Han）</h3>
        <p class="author__bio">AMSS/SAIS, UCAS</p>
        <ul class="author__urls"><li><div>CS Phd Student</div></li><li><a href="mailto:hanshenmesen@163.com">Email</a></li></ul>
      </div>
      <article><section class="page__content">
        <p>I study <strong>Large Language Models</strong> and <strong>Multi-Agent Systems</strong> for trustworthy information systems.</p>
        <h1>📝 Latest Publications</h1>
        <div class="paper-box"><div class="paper-box-image"><div class="badge">AAAI 2026 (Oral)</div><img src="images/aaai2026.png" alt="paper overview"></div></div>
          <div class="paper-box-text"><p><a href="https://arxiv.org/abs/2511.07267">Beyond Detection</a></p><p>Chen Han, et al.</p><ul><li>Proposed an evidence-based debate framework.</li></ul></div>
        </div>
        <h1>🎖 Honors and Awards</h1><ul><li>2026 Top Intern</li></ul>
        <h1>📖 Educations</h1><ul><li>2025 – 2028, Ph.D., UCAS</li></ul>
        <h1>💻 Internships</h1><ul><li>2026, Xiaohongshu, Data Engineer Agent R&amp;D</li></ul>
      </section></article>
    </body></html>`;
  const page = extractWebPage(html, "https://hanshenmesen.github.io/");
  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projects = result.profile.items.filter((item) => item.kind === "project");

  assert.equal(result.profile.name, "韩晨（Chen Han）");
  assert.equal(result.profile.headline, "CS Phd Student · AMSS/SAIS, UCAS");
  assert.deepEqual(result.profile.skills, ["Large Language Models", "Multi-Agent Systems"]);
  assert.deepEqual(result.profile.contacts, ["Email: hanshenmesen@163.com"]);
  assert.equal(projects.length, 1);
  assert.equal(projects[0]?.title, "Beyond Detection");
  assert.equal(projects[0]?.subtitle, "AAAI 2026 (Oral)");
  assert.equal(projects[0]?.imageUrl, "https://hanshenmesen.github.io/images/aaai2026.png");
  assert.equal(projects[0]?.sourceUrl, "https://arxiv.org/abs/2511.07267");
  assert.equal(result.world.exhibits.find((item) => item.sourceItemId === projects[0]?.id)?.imageUrl, projects[0]?.imageUrl);
});
