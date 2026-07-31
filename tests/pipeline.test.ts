import assert from "node:assert/strict";
import test from "node:test";
import { checkWorld } from "../lib/agents/checker.ts";
import { runPipeline } from "../lib/agents/pipeline.ts";
import { sampleResume } from "../lib/data/sample-resume.ts";
import { extractWebPage } from "../lib/extract-webpage.ts";
import { validateProfile, validateReport, validateWorld } from "../lib/validate.ts";
import { parseProfile } from "../lib/agents/parser.ts";

test("parser keeps line-level evidence for every content item", () => {
  const result = runPipeline(sampleResume);
  assert.equal(validateProfile(result.profile).length, 0);
  assert.ok(result.profile.items.every((item) => item.evidence[0]?.locator.startsWith("line")));
  assert.equal(result.profile.items.filter((item) => item.kind === "project").length, 4);
  assert.equal(result.profile.skills.length, 12);
});

test("parser extracts location for identity rows when available", () => {
  const text = [
    "Lina Zhou",
    "Senior AI Engineer @ Shanghai",
    "About",
    "Researching web-based interactive systems.",
  ].join("\n");

  const result = runPipeline(text);

  assert.equal(result.profile.location, "Shanghai");
  assert.equal(result.profile.identityEvidence.location?.length, 1);
  assert.equal(result.profile.identityEvidence.location?.[0]?.locator, "line:2");
  assert.equal(result.profile.identityEvidence.name?.[0]?.locator, "line:1");
  assert.equal(result.profile.identityEvidence.headline?.[0]?.locator, "line:2");
});

test("location inference prefers explicit location phrases and rejects organization names", () => {
  const cases: Array<{ lines: string[]; expected?: string }> = [
    { lines: ["Lina Zhou", "Senior Product @ Boston Dynamics"] },
    { lines: ["Lina Zhou", "Machine Learning Engineer @ New York University"] },
    { lines: ["Zhou@Shenzhen", "Software Engineer"] },
    { lines: ["Lina Zhou", "Lead Scientist from Beijing"], expected: "Beijing" },
    { lines: ["Lina Zhou", "Based in Boston."], expected: "Boston" },
    { lines: ["Lina Zhou", "来自上海"], expected: "上海" },
    { lines: ["Lina Zhou", "Product Manager", "Location Shanghai"], expected: "Shanghai" },
    { lines: ["Lina Zhou", "Researcher (Sydney)"], expected: "Sydney" },
    { lines: ["Lina Zhou", "Senior PM @ Beijing, from New York"], expected: "New York" },
    { lines: ["Lina Zhou", "Product Manager", "Location: Montreal"], expected: "Montreal" },
  ];

  for (const entry of cases) {
    const profile = parseProfile(entry.lines.join("\n"));
    assert.equal(profile.location, entry.expected, entry.lines.join(" | "));
    if (entry.expected) assert.ok(profile.identityEvidence.location?.length);
  }
});

test("orchestrator maps every résumé item into the public showroom and keeps résumé exhibits out of the private diary room", () => {
  const result = runPipeline(sampleResume);
  const expected = result.profile.items.length + result.profile.skills.length;
  assert.equal(result.world.rooms.length, 2);
  assert.equal(result.world.portals.length, 2);
  assert.deepEqual(result.world.rooms.find((room) => room.id === "room-lobby")?.size, [21.6, 0.3, 28]);
  assert.deepEqual(result.world.rooms.find((room) => room.id === "room-private")?.size, [10, 0.3, 12]);
  assert.deepEqual(result.world.rooms.find((room) => room.id === "room-private")?.center, [0, 3.53, -20]);
  assert.deepEqual(result.world.portals.find((portal) => portal.id === "portal-1")?.position, [2.5, 3.53, -15]);
  assert.deepEqual(result.world.portals.find((portal) => portal.id === "portal-entrance"), {
    id: "portal-entrance",
    fromRoomId: "exterior",
    toRoomId: "room-lobby",
    position: [2, 1.5, 8],
    label: "Museum Entrance",
  });
  assert.ok(result.world.exhibits.every((item) => item.roomId === "room-lobby"));
  assert.equal(result.world.rooms.find((room) => room.id === "room-private")?.kind, "bedroom");
  assert.deepEqual(result.world.rooms.find((room) => room.id === "room-private")?.exhibitIds, []);
  assert.equal(result.world.exhibits.length, expected);
  assert.equal(new Set(result.world.exhibits.map((item) => item.sourceItemId)).size, expected);
  const projectPedestals = result.world.exhibits.filter((item) => item.eyebrow === "PROJECT");
  assert.deepEqual(projectPedestals.map((item) => item.position), [
    [-4, 0, -3],
    [4, 0, -3],
    [-4, 0, -11],
    [4, 0, -11],
  ]);
  const horizontalSpan = Math.abs(projectPedestals[1].position[0] - projectPedestals[0].position[0]);
  const depthSpan = Math.abs(projectPedestals[2].position[2] - projectPedestals[0].position[2]);
  assert.equal(horizontalSpan, depthSpan);
  assert.deepEqual(result.world.displaySurfaces.map((surface) => surface.id), [
    "showroom-profile",
    "showroom-education",
    "showroom-experience",
    "showroom-highlights",
    "showroom-works",
    "showroom-skills",
    "showroom-contact",
  ]);
  const aggregatedSourceIds = result.world.displaySurfaces.flatMap((surface) => surface.sourceItemIds);
  const nonProjectSourceIds = result.world.exhibits
    .filter((exhibit) => exhibit.eyebrow !== "PROJECT")
    .map((exhibit) => exhibit.sourceItemId);
  assert.ok(nonProjectSourceIds.every((sourceId) => aggregatedSourceIds.includes(sourceId)));
  assert.ok(result.world.displaySurfaces.every((surface) => surface.interaction.clickable));
  assert.ok(result.world.displaySurfaces.every((surface) => surface.focusTarget.fov > 0));
  assert.ok(result.world.displaySurfaces.every((surface) => surface.layout?.position.length === 3));
  assert.equal(validateWorld(result.world).length, 0);
  assert.equal(result.report.checks.find((item) => item.name === "Room graph")?.passed, true);
});

test("orchestrator builds semantic dynamic wall surfaces from parsed content volume", () => {
  const result = runPipeline(sampleResume);
  const surfaces = Object.fromEntries(result.world.displaySurfaces.map((surface) => [surface.id, surface]));
  const educationIds = result.profile.items.filter((item) => item.kind === "education").map((item) => item.id);
  const experienceIds = result.profile.items.filter((item) => item.kind === "experience").map((item) => item.id);
  const achievementIds = result.profile.items.filter((item) => item.kind === "achievement").map((item) => item.id);
  const projectIds = result.profile.items.filter((item) => item.kind === "project").map((item) => item.id);

  assert.deepEqual(surfaces["showroom-education"]?.sourceItemIds, educationIds);
  assert.deepEqual(surfaces["showroom-experience"]?.sourceItemIds, experienceIds);
  assert.deepEqual(surfaces["showroom-highlights"]?.sourceItemIds, achievementIds);
  assert.deepEqual(surfaces["showroom-works"]?.sourceItemIds, projectIds);
  assert.equal(surfaces["showroom-education"]?.semanticRole, "education");
  assert.equal(surfaces["showroom-experience"]?.semanticRole, "experience");
  assert.equal(surfaces["showroom-works"]?.semanticRole, "works");
  assert.equal(surfaces["showroom-works"]?.layout?.variant, "timeline");
  assert.ok((surfaces["showroom-profile"]?.layout?.width || 0) > (surfaces["showroom-education"]?.layout?.width || 0));
  assert.equal(surfaces["showroom-skills"]?.presentationMode, "paged");
  assert.equal(surfaces["showroom-skills"]?.pageSize, 10);
});

test("default world passes the deterministic checker", () => {
  const result = runPipeline(sampleResume);
  assert.equal(result.report.passed, true);
  assert.equal(result.report.score, 100);
  assert.equal(validateReport(result.report).length, 0);

  const worldWithoutEntrance = structuredClone(result.world);
  worldWithoutEntrance.portals = worldWithoutEntrance.portals.filter((portal) => portal.id !== "portal-entrance");
  const disconnectedReport = checkWorld(worldWithoutEntrance);
  assert.equal(disconnectedReport.checks.find((item) => item.name === "Room graph")?.passed, false);
  assert.ok(disconnectedReport.issues.some((item) => item.category === "navigation"));
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
        <a href="https://scholar.google.com/citations?user=abc">Google Scholar</a>
      </section></article>
    </body></html>`;
  const page = extractWebPage(html, "https://hanshenmesen.github.io/");
  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projects = result.profile.items.filter((item) => item.kind === "project");
  const profileImage = page.media.find((entry) => entry.originalUrl.includes("photo.png"));
  const projectImage = page.media.find((entry) => entry.originalUrl.includes("aaai2026.png"));

  assert.equal(result.profile.name, "韩晨（Chen Han）");
  assert.equal(result.profile.headline, "CS Phd Student · AMSS/SAIS, UCAS");
  assert.deepEqual(result.profile.skills, ["Large Language Models", "Multi-Agent Systems"]);
  assert.deepEqual(result.profile.contacts, ["Email: hanshenmesen@163.com", "Google Scholar: https://scholar.google.com/citations?user=abc"]);
  const emailEvidence = result.profile.contactEvidence["Email: hanshenmesen@163.com"]?.[0];
  const scholarEvidence = result.profile.contactEvidence["Google Scholar: https://scholar.google.com/citations?user=abc"]?.[0];
  assert.ok(emailEvidence?.locator.startsWith("lines:"));
  assert.ok(scholarEvidence?.locator.startsWith("lines:"));
  assert.ok(emailEvidence?.locator !== scholarEvidence?.locator);
  assert.equal(profileImage?.category, "profile-photo");
  assert.equal(projectImage?.category, "project-cover");
  assert.equal(projects.length, 1);
  assert.equal(projects[0]?.title, "Beyond Detection");
  assert.equal(projects[0]?.contentFamily, "publication");
  assert.equal(projects[0]?.subtitle, "AAAI 2026 (Oral)");
  assert.equal(projects[0]?.imageUrl, "https://hanshenmesen.github.io/images/aaai2026.png");
  assert.equal(projects[0]?.sourceUrl, "https://arxiv.org/abs/2511.07267");
  assert.equal(projects[0]?.mediaProvenance?.category, "project-cover");
  assert.equal(projects[0]?.mediaProvenance?.sourcePage, "https://hanshenmesen.github.io/");
  const mediaEvidence = projects[0]?.evidence.find((entry) => entry.excerpt.includes("project-cover"));
  assert.ok(mediaEvidence?.excerpt.includes(projects[0]?.imageUrl ?? ""));
  assert.equal(result.world.exhibits.find((item) => item.sourceItemId === projects[0]?.id)?.imageUrl, projects[0]?.imageUrl);
});

test("parser assigns contentFamily across all target headings without changing section kind", () => {
  const text = [
    "Liang Zhou",
    "Researcher",
    "项目",
    "Robust Retrieval with Contrastive Learning",
    "- Built a new retrieval benchmark.",
    "开源",
    "Open Source Foundation Toolkit",
    "- Published on GitHub.",
    "演讲",
    "Talk: Building Reliable Agents",
    "- OpenAI research talk.",
    "展览",
    "Future Interfaces Exhibition",
    "- Curated a multi-agent showcase.",
    "媒体报道",
    "Campus Times: https://news.example.com/agent-research",
    "- Interviewed by local media.",
  ].join("\n");

  const result = runPipeline(text);
  const itemByTitle = Object.fromEntries(result.profile.items.map((item) => [item.title, item]));
  const exhibitBySourceId = Object.fromEntries(result.world.exhibits.map((exhibit) => [exhibit.sourceItemId, exhibit]));

  assert.equal(itemByTitle["Robust Retrieval with Contrastive Learning"]?.kind, "project");
  assert.equal(itemByTitle["Robust Retrieval with Contrastive Learning"]?.contentFamily, undefined);
  assert.equal(itemByTitle["Open Source Foundation Toolkit"]?.kind, "project");
  assert.equal(itemByTitle["Open Source Foundation Toolkit"]?.contentFamily, "open-source");
  assert.equal(itemByTitle["Talk: Building Reliable Agents"]?.kind, "achievement");
  assert.equal(itemByTitle["Talk: Building Reliable Agents"]?.contentFamily, "talk");
  assert.equal(itemByTitle["Future Interfaces Exhibition"]?.kind, "achievement");
  assert.equal(itemByTitle["Future Interfaces Exhibition"]?.contentFamily, "exhibition");
  const mediaCoverageItem = result.profile.items.find((item) => item.sourceUrl === "https://news.example.com/agent-research");
  assert.equal(mediaCoverageItem?.kind, "achievement");
  assert.equal(mediaCoverageItem?.contentFamily, "media-coverage");
  assert.equal(mediaCoverageItem?.sourceUrl, "https://news.example.com/agent-research");
  assert.equal(result.world.exhibits.length, result.profile.items.length + result.profile.skills.length);
  assert.equal(
    exhibitBySourceId[itemByTitle["Robust Retrieval with Contrastive Learning"]?.id || ""]?.contentFamily,
    undefined,
  );
  assert.equal(
    exhibitBySourceId[itemByTitle["Open Source Foundation Toolkit"]?.id || ""]?.contentFamily,
    "open-source",
  );
  assert.equal(
    exhibitBySourceId[itemByTitle["Talk: Building Reliable Agents"]?.id || ""]?.contentFamily,
    "talk",
  );
  assert.equal(
    exhibitBySourceId[itemByTitle["Future Interfaces Exhibition"]?.id || ""]?.contentFamily,
    "exhibition",
  );
  assert.equal(
    exhibitBySourceId[mediaCoverageItem?.id || ""]?.contentFamily,
    "media-coverage",
  );
  assert.ok(itemByTitle["Robust Retrieval with Contrastive Learning"]?.evidence[0]?.locator.startsWith("line"));
});

test("project metadata fields require explicit labels and propagate with field evidence", () => {
  const text = [
    "Ari Tan",
    "Creative Engineer",
    "Projects",
    "Signal Room — 2024-01 - 2024-06",
    "- Built a WebGL listening room for portfolio visitors.",
    "- Role: Lead developer",
    "- Tech Stack: Three.js, TypeScript, Web Audio",
    "- Link: https://example.com/signal-room",
  ].join("\n");

  const result = runPipeline(text);
  const project = result.profile.items.find((item) => item.title === "Signal Room");
  const exhibit = result.world.exhibits.find((item) => item.sourceItemId === project?.id);

  assert.equal(validateProfile(result.profile).length, 0);
  assert.equal(validateWorld(result.world).length, 0);
  assert.equal(project?.subtitle, "2024-01 - 2024-06");
  assert.equal(project?.timeRange, "2024-01 - 2024-06");
  assert.equal(project?.role, "Lead developer");
  assert.deepEqual(project?.techStack, ["Three.js", "TypeScript", "Web Audio"]);
  assert.equal(project?.projectUrl, "https://example.com/signal-room");
  assert.equal(project?.sourceUrl, "https://example.com/signal-room");
  assert.ok(project?.fieldEvidence?.timeRange?.[0]?.locator.startsWith("line"));
  assert.ok(project?.fieldEvidence?.role?.[0]?.excerpt.includes("Role: Lead developer"));
  assert.ok(project?.fieldEvidence?.techStack?.[0]?.excerpt.includes("Tech Stack"));
  assert.ok(project?.fieldEvidence?.projectUrl?.[0]?.excerpt.includes("Link: https://example.com/signal-room"));
  assert.equal(exhibit?.timeRange, project?.timeRange);
  assert.equal(exhibit?.role, project?.role);
  assert.deepEqual(exhibit?.techStack, project?.techStack);
  assert.equal(exhibit?.projectUrl, project?.projectUrl);
  assert.deepEqual(exhibit?.fieldEvidence?.projectUrl, project?.fieldEvidence?.projectUrl);
});

test("project metadata parser does not infer structured fields from unlabeled prose", () => {
  const text = [
    "Ari Tan",
    "Creative Engineer",
    "Projects",
    "Ambient Atlas",
    "- Built in 2025 as lead designer with React and WebGL for https://example.com/ambient-atlas.",
  ].join("\n");

  const result = runPipeline(text);
  const project = result.profile.items.find((item) => item.title === "Ambient Atlas");

  assert.equal(validateProfile(result.profile).length, 0);
  assert.equal(project?.timeRange, undefined);
  assert.equal(project?.role, undefined);
  assert.equal(project?.techStack, undefined);
  assert.equal(project?.projectUrl, undefined);
  assert.equal(project?.fieldEvidence, undefined);
  assert.equal(project?.sourceUrl, "https://example.com/ambient-atlas.");
});

test("legacy project subtitle and Source lines still work without structured metadata", () => {
  const text = [
    "Ari Tan",
    "Creative Engineer",
    "Projects",
    "Legacy Showcase — Festival Selection",
    "- Interactive installation overview.",
    "Source: https://example.com/legacy-showcase",
  ].join("\n");

  const result = runPipeline(text);
  const project = result.profile.items.find((item) => item.title === "Legacy Showcase");

  assert.equal(validateProfile(result.profile).length, 0);
  assert.equal(project?.subtitle, "Festival Selection");
  assert.equal(project?.summary, "Interactive installation overview.");
  assert.equal(project?.sourceUrl, "https://example.com/legacy-showcase");
  assert.equal(project?.timeRange, undefined);
  assert.equal(project?.role, undefined);
  assert.equal(project?.techStack, undefined);
  assert.equal(project?.projectUrl, undefined);
});

test("extract-webpage maps publication/open-source/talk/exhibition/media sections into parser families and preserves sources", () => {
  const html = `<!doctype html>
    <html><head><title>Research Portfolio</title></head><body>
      <div class="profile_box">
        <h3 class="author__name">Mia Chen</h3>
        <div class="author__bio">Research Engineer</div>
      </div>
      <section class="page__content">
        <h1>Publications</h1>
        <p><a href="/papers/alpha">Adaptive Multi-Agent Debate</a></p>
        <p>- Introduced benchmark and dataset for debate traces.</p>
        <h1>Open Source</h1>
        <p><a href="/code/mia/moss">MOSS toolkit</a></p>
        <p>- Released a benchmarking toolkit.</p>
        <h1>Talks</h1>
        <p><a href="https://talks.example.com/2026-keynote">2026 Keynote: Trustworthy Agents</a></p>
        <p>- Presented at TrustConf.</p>
        <h1>Exhibitions</h1>
        <p><a href="https://museum.example.com/exhibit/agent-lab">Agent Lab Installation</a></p>
        <p>- Interactive installation for multi-agent governance.</p>
        <h1>Media</h1>
        <p>Interview: <a href="https://media.example.com/interview/mia">Global AI Journal</a></p>
        <p>Profile highlights and policy discussion.</p>
      </section>
    </body></html>`;
  const page = extractWebPage(html, "https://research.example.com/");
  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const items = Object.fromEntries(result.profile.items.map((item) => [item.title, item]));

  const publication = items["Adaptive Multi-Agent Debate"];
  const openSource = items["MOSS toolkit"];
  const talk = items["2026 Keynote: Trustworthy Agents"];
  const exhibition = items["Agent Lab Installation"];
  const media = result.profile.items.find((item) => item.sourceUrl === "https://media.example.com/interview/mia");

  assert.equal(publication?.kind, "project");
  assert.equal(publication?.contentFamily, "publication");
  assert.equal(openSource?.kind, "project");
  assert.equal(openSource?.contentFamily, "open-source");
  assert.equal(talk?.kind, "achievement");
  assert.equal(talk?.contentFamily, "talk");
  assert.equal(exhibition?.kind, "achievement");
  assert.equal(exhibition?.contentFamily, "exhibition");
  assert.equal(media?.kind, "achievement");
  assert.equal(media?.contentFamily, "media-coverage");

  assert.equal(publication?.sourceUrl, "https://research.example.com/papers/alpha");
  assert.equal(openSource?.sourceUrl, "https://research.example.com/code/mia/moss");
  assert.equal(talk?.sourceUrl, "https://talks.example.com/2026-keynote");

  assert.equal(media?.sourceUrl, "https://media.example.com/interview/mia");
  assert.ok(result.profile.name === "Mia Chen");
  assert.equal(result.profile.headline, "Research Engineer");
  assert.notEqual(result.profile.summary, result.profile.headline);
  assert.equal(result.profile.skills.length, 0);
  assert.ok(page.text.includes("Source: https://research.example.com/papers/alpha"));
  assert.ok(page.text.includes("Source: https://talks.example.com/2026-keynote"));
  assert.ok(page.text.includes("Source: https://media.example.com/interview/mia"));
  assert.ok(publication?.evidence[0]?.locator.startsWith("line"));
  assert.ok(media?.evidence[0]?.locator.startsWith("line"));
});

test("news updates stay in achievement while media remains media-coverage", () => {
  const profileText = [
    "Mia Chen",
    "Research Engineer",
    "News",
    "Campus Times: https://news.example.com/award-update",
    "- Accepted to the conference.",
    "媒体报道",
    "Global AI Journal: https://media.example.com/interview/mia",
    "- Interviewed about governance work.",
  ].join("\n");
  const textProfile = parseProfile(profileText);
  const newsItem = textProfile.items.find((item) => item.sourceUrl === "https://news.example.com/award-update");
  const mediaItem = textProfile.items.find((item) => item.sourceUrl === "https://media.example.com/interview/mia");
  assert.equal(newsItem?.kind, "achievement");
  assert.equal(newsItem?.contentFamily, undefined);
  assert.ok(newsItem?.evidence[0]?.locator.startsWith("line"));
  assert.equal(mediaItem?.kind, "achievement");
  assert.equal(mediaItem?.contentFamily, "media-coverage");
  assert.ok(mediaItem?.evidence[0]?.locator.startsWith("line"));

  const html = `<!doctype html>
    <html><head><title>News and Coverage</title></head><body>
      <div class="profile_box">
        <h3 class="author__name">Mia Chen</h3>
      </div>
      <section class="page__content">
        <h1>News</h1>
        <p><a href="/news/award-update">Campus News: Campus award</a></p>
        <p>- Paper accepted to AAAI 2027.</p>
        <h1>Media</h1>
        <p><a href="/media/mia-interview">Global AI Journal</a></p>
        <p>- Interviewed on policy and governance.</p>
      </section>
    </body></html>`;
  const page = extractWebPage(html, "https://research.example.com/");
  const htmlProfile = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const htmlNews = htmlProfile.profile.items.find((item) => item.sourceUrl === "https://research.example.com/news/award-update");
  const htmlMedia = htmlProfile.profile.items.find((item) => item.sourceUrl === "https://research.example.com/media/mia-interview");
  assert.equal(htmlNews?.kind, "achievement");
  assert.equal(htmlNews?.contentFamily, undefined);
  assert.equal(htmlMedia?.kind, "achievement");
  assert.equal(htmlMedia?.contentFamily, "media-coverage");
  assert.ok(page.text.includes("Source: https://research.example.com/news/award-update"));
  assert.ok(page.text.includes("Source: https://research.example.com/media/mia-interview"));

  const result = runPipeline(sampleResume);
  const projectPedestals = result.world.exhibits.filter((item) => item.eyebrow === "PROJECT");
  assert.deepEqual(projectPedestals.map((item) => item.position), [
    [-4, 0, -3],
    [4, 0, -3],
    [-4, 0, -11],
    [4, 0, -11],
  ]);
});

test("parser keeps a neutral headline fallback for minimal profiles", () => {
  const result = runPipeline("Single Name");
  assert.equal(result.profile.headline, "Profile details unavailable");
});

test("readable fallback strips inline tags and respects newlines", () => {
  const page = extractWebPage("<html><body><p>Alpha <span>line</span><br>Beta<div><u>Gamma", "https://example.com");
  assert.ok(page.text.includes("Alpha line"));
  assert.ok(page.text.includes("Beta Gamma"));
  assert.ok(page.text.includes("\n"));
  assert.ok(!/[<>]/.test(page.text));
});

test("readable fallback preserves unrecognized portfolio sections instead of collapsing to identity rows", () => {
  const page = extractWebPage(
    "<html><head><title>Jo Rivera</title></head><body><h1>Jo Rivera</h1><h2>Community Practice</h2><p>Runs public workshops that connect illustration, oral history, and neighborhood archives.</p></body></html>",
    "https://example.com/jo",
  );
  assert.ok(page.text.includes("Community Practice"));
  assert.ok(page.text.includes("Runs public workshops"));
});

test("summary fallback stays neutral and does not duplicate identity fields", () => {
  const profile = parseProfile("Minimal Person\nResearch Engineer");
  const summaryItem = profile.items.find((item) => item.kind === "summary");
  assert.equal(profile.name, "Minimal Person");
  assert.equal(profile.headline, "Research Engineer");
  assert.equal(profile.summary, "Profile summary unavailable");
  assert.notEqual(profile.summary, profile.name);
  assert.notEqual(profile.summary, profile.headline);
  assert.equal(summaryItem?.evidence[0]?.origin, "system-generated");
  assert.equal(summaryItem?.evidence[0]?.locator, "system:summary-unavailable");
  assert.equal(validateProfile(profile).length, 0);
});

test("a sourced project without an image keeps source evidence instead of placeholder evidence", () => {
  const profile = parseProfile([
    "Mina Park",
    "Creative Engineer",
    "Projects",
    "Accessible WebGL Atlas",
    "- Built an interactive map without a project image.",
  ].join("\n"));
  const project = profile.items.find((item) => item.kind === "project");

  assert.equal(project?.imageUrl, undefined);
  assert.equal(project?.evidence[0]?.origin, undefined);
  assert.match(project?.evidence[0]?.locator || "", /^lines?:/);
});

test("dedupe keeps explicit profile image over lower-confidence project with same URL", () => {
  const html = `<!doctype html>
    <html><head><title>Same URL Profile</title></head><body>
      <div class="profile_box">
        <img src="images/shared.png" alt="avatar">
        <h3 class="author__name">Tester</h3>
      </div>
      <article><section class="page__content">
        <h1>📝 Latest Publications</h1>
        <div class="paper-box"><div class="paper-box-image"><div class="badge">Badge</div><img src="images/shared.png" alt="paper"></div></div>
          <div class="paper-box-text"><p><a href="https://example.com/paper">Paper</a></p><ul><li>Item</li></ul></div>
        </div>
      </section></article>
    </body></html>`;
  const page = extractWebPage(html, "https://example.com/");
  const matches = page.media.filter((entry) => entry.originalUrl === "images/shared.png");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.kind, "profile");
  assert.equal(matches[0]?.category, "profile-photo");
});

test("synthesized projects are recovered from project-cover media when explicit project section is absent", () => {
  const html = `<!doctype html>
    <html><head><title>No Section Portfolio</title></head><body>
      <div class="profile_box">
        <img src="images/avatar.png" alt="Profile avatar">
      </div>
      <section class="page__content">
        <img src="images/logo.svg" class="logo" alt="logo icon">
        <img src="images/project-alpha.png" class="project-cover" alt="Alpha Project">
        <img src="images/project-beta.png" class="project-card" alt="Beta Study">
      </section>
    </body></html>`;
  const page = extractWebPage(html, "https://example.com/");
  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projects = result.profile.items.filter((item) => item.kind === "project");
  const titles = projects.map((item) => item.title);

  assert.ok(projects.length >= 2);
  assert.ok(titles.includes("Alpha Project"));
  assert.ok(titles.includes("Beta Study"));
  assert.ok(!titles.includes("logo icon"));
  assert.equal(
    projects.find((item) => item.title === "Alpha Project")?.imageUrl,
    "https://example.com/images/project-alpha.png",
  );
});

test("wrapped project card images keep their own anchor links as sourceUrl", () => {
  const html = `<!doctype html>
    <html><head><title>Nielisson Portfolio</title></head><body>
      <div class="profile_box">
        <img src="images/avatar.png" alt="Nielsson portrait">
      </div>
      <div class="page__content">
        <a href="https://www.artstation.com/artwork/skyline-bridge">
          <img src="images/card-one.png">
        </a>
        <a href="https://www.viz.com/work/portfolio-mirror">Read more</a>
        <img src="images/standalone-two.png">
        <a href="/projects/relative-vize">
          <img src="images/card-three.png">
        </a>
      </div>
    </body></html>`;
  const page = extractWebPage(html, "https://nielisson.example.com/");
  const directCardOne = page.media.find((entry) => entry.originalUrl === "images/card-one.png");
  const standalone = page.media.find((entry) => entry.originalUrl === "images/standalone-two.png");
  const relativeCard = page.media.find((entry) => entry.originalUrl === "images/card-three.png");

  assert.equal(directCardOne?.linkUrl, "https://www.artstation.com/artwork/skyline-bridge");
  assert.equal(relativeCard?.linkUrl, "https://nielisson.example.com/projects/relative-vize");
  assert.equal(standalone?.linkUrl, undefined);

  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projectItems = result.profile.items.filter((item) => item.kind === "project");
  const sourceUrls = new Set(projectItems.map((item) => item.sourceUrl));
  assert.equal(sourceUrls.has("https://www.artstation.com/artwork/skyline-bridge"), true);
  assert.equal(sourceUrls.has("https://nielisson.example.com/projects/relative-vize"), true);
  assert.equal(sourceUrls.has(undefined), false);
});

test("placeholder anchors do not promote generic template cards into sourced projects", () => {
  const html = `<!doctype html>
    <html><head><title>Mixed Portfolio Cards</title></head><body>
      <div class="profile_box">
        <img src="images/avatar.png" alt="Profile portrait">
      </div>
      <div class="page__content">
        <a href="#" class="project-card">
          <img src="images/template-project.png" class="project-cover" alt="Template Finance">
        </a>
        <a href="#modal" class="project-card">
          <img src="images/template-modal.png" class="project-cover" alt="Template Modal">
        </a>
        <a href="javascript:void(0)" class="project-card">
          <img src="images/template-script.png" class="project-cover" alt="Template Script">
        </a>
        <a href="/projects/real-study" class="project-card">
          <img src="images/real-study.png" class="project-cover" alt="Real Study">
        </a>
      </div>
    </body></html>`;
  const page = extractWebPage(html, "https://portfolio.example.com/");
  const templateMedia = page.media.filter((entry) => entry.originalUrl?.startsWith("images/template-"));
  const realMedia = page.media.find((entry) => entry.originalUrl === "images/real-study.png");

  assert.equal(templateMedia.length, 3);
  assert.ok(templateMedia.every((entry) => entry.linkUrl === undefined));
  assert.ok(templateMedia.every((entry) => entry.categoryConfidence < 0.65));
  assert.equal(realMedia?.linkUrl, "https://portfolio.example.com/projects/real-study");
  assert.equal(realMedia?.category, "project-cover");

  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projects = result.profile.items.filter((item) => item.kind === "project");
  assert.deepEqual(projects.map((item) => item.title), ["Real Study"]);
  assert.equal(projects[0]?.projectUrl, "https://portfolio.example.com/projects/real-study");
});

test("only true wrapping anchors are applied; neighboring links are ignored", () => {
  const html = `<!doctype html>
    <html><head><title>Nielisson Anchor Scope</title></head><body>
      <div class="page__content">
        <a href="https://example.com/not-card-link">Project label</a>
        <img src="images/loose-three.png">
        <a href="/projects/not-claimed"><img src="images/inner-link.png"></a>
      </div>
    </body></html>`;
  const page = extractWebPage(html, "https://nielisson.example.com/");

  const loose = page.media.find((entry) => entry.originalUrl === "images/loose-three.png");
  const inner = page.media.find((entry) => entry.originalUrl === "images/inner-link.png");
  assert.equal(loose?.linkUrl, undefined);
  assert.equal(inner?.linkUrl, "https://nielisson.example.com/projects/not-claimed");
});

test("multiple project cards preserve individual links to avoid cross-card matching", () => {
  const html = `<!doctype html>
    <html><head><title>Nielisson Multi Cards</title></head><body>
      <div class="profile_box">
        <img src="images/avatar.png" alt="Nielsson portrait">
      </div>
      <div class="page__content">
        <a href="https://www.artstation.com/artwork/01"><img src="assets/p01.png" alt="Aether Field"></a>
        <a href="/projects/vize-02"><img src="assets/p02.png" alt="VIZE Horizon"></a>
        <a href="https://vimeo.com/vid/03"><img src="assets/p03.png" alt="Motion Study"></a>
      </div>
    </body></html>`;
  const page = extractWebPage(html, "https://nielisson.example.com/");
  const byOriginal = Object.fromEntries(page.media.map((entry) => [entry.originalUrl, entry.linkUrl]));
  assert.equal(byOriginal["assets/p01.png"], "https://www.artstation.com/artwork/01");
  assert.equal(byOriginal["assets/p02.png"], "https://nielisson.example.com/projects/vize-02");
  assert.equal(byOriginal["assets/p03.png"], "https://vimeo.com/vid/03");

  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const urls = new Set(result.profile.items.filter((item) => item.kind === "project").map((item) => item.sourceUrl));
  assert.equal(urls.has("https://www.artstation.com/artwork/01"), true);
  assert.equal(urls.has("https://nielisson.example.com/projects/vize-02"), true);
  assert.equal(urls.has("https://vimeo.com/vid/03"), true);
});

test("high-confidence project-cover media without title or alt are synthesized with neutral placeholders", () => {
  const result = runPipeline("Damilola\nComputer Vision Researcher", {
    type: "url",
    label: "Damilola Page",
    media: [
      {
        url: "https://damilola.example.com/assets/project-1.png",
        originalUrl: "assets/project-1.png",
        sourcePage: "https://damilola.example.com/",
        locator: "img:1",
        kind: "project",
        category: "project-cover",
        categoryConfidence: 0.94,
        categoryReason: "high-confidence cover",
      },
      {
        url: "https://damilola.example.com/assets/project-2.png",
        originalUrl: "assets/project-2.png",
        sourcePage: "https://damilola.example.com/",
        locator: "img:2",
        kind: "project",
        category: "project-cover",
        categoryConfidence: 0.93,
        categoryReason: "high-confidence cover",
      },
    ],
  });
  const projects = result.profile.items.filter((item) => item.kind === "project");
  const names = projects.map((item) => item.title);
  assert.equal(projects.length, 2);
  assert.equal(names[0], "Untitled sourced project 01");
  assert.equal(names[1], "Untitled sourced project 02");
  assert.equal(projects[0]?.summary, "Untitled sourced project 01");
  assert.equal(projects[1]?.summary, "Untitled sourced project 02");
  assert.ok(projects.every((project) => !!project.mediaProvenance));
  assert.equal(projects.every((project) => project.contentFamily === undefined), true);
});

test("icon path images are prevented from project-cover and real portfolio thumbnails remain covered", () => {
  const page = extractWebPage(
    `<!doctype html><html><head><title>Media Mix</title></head><body>
      <img src="https://damilola.example.com/profile/avatar.png" alt="Damilola">
      <section class="page__content">
        <h1>Portfolio</h1>
        <img src="https://damilola.example.com/assets/icon/ebony.png" alt="Damilola icon">
        <img src="https://damilola.example.com/assets/portfolio_thumbnails/logo_vize.png" alt="Logo card">
      </section>
    </body></html>`,
    "https://damilola.example.com/",
  );

  const iconMedia = page.media.find((entry) => entry.originalUrl.includes("/icon/"));
  const logoCardMedia = page.media.find((entry) => entry.originalUrl.includes("/portfolio_thumbnails/logo_vize.png"));

  assert.ok(iconMedia, "icon media extracted");
  assert.ok(logoCardMedia, "portfolio thumbnail media extracted");
  assert.equal(iconMedia?.category, "logo");
  assert.notEqual(iconMedia?.category, "project-cover");
  assert.equal(logoCardMedia?.category, "project-cover");

  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const iconProject = result.profile.items.find((item) => item.sourceUrl === "https://damilola.example.com/assets/icon/ebony.png");
  const projects = result.profile.items.filter((item) => item.kind === "project");
  const logoProject = projects.find((project) => project.imageUrl === logoCardMedia?.url);

  assert.equal(iconProject, undefined);
  assert.ok(logoProject, "named logo thumbnail in portfolio should still become a project");
});

test("12+ synthetic media projects are all kept and paginated in world", () => {
  const syntheticMedia = Array.from({ length: 13 }, (_, index) => {
    const displayIndex = index + 1;
    const sourceIndex = Math.min(displayIndex, 12);
    return {
      url: `https://cdn.example.com/project-covers/media-${sourceIndex}.png`,
      originalUrl: `https://cdn.example.com/project-covers/media-${sourceIndex}.png`,
      sourcePage: "https://example.com/portfolio",
      locator: `img:${displayIndex}`,
      alt: `Media Project ${displayIndex}`,
      title: `Media Project ${displayIndex}`,
      linkUrl: `https://example.com/projects/project-${displayIndex}`,
      kind: "project" as const,
      category: "project-cover" as const,
      categoryConfidence: 0.97,
      categoryReason: "high-confidence media cover",
    };
  });

  const result = runPipeline("Nielsson\nResearch Scientist", {
    type: "url",
    label: "Synthetic Media Portfolio",
    media: syntheticMedia,
  });

  const projectItems = result.profile.items.filter((item) => item.kind === "project");
  const projectExhibits = result.world.exhibits.filter((item) => item.eyebrow === "PROJECT");

  assert.equal(projectItems.length, 12);
  assert.equal(projectExhibits.length, 12);
  assert.equal(result.world.exhibits.length, result.profile.items.length + result.profile.skills.length);

  assert.equal(projectItems.every((item) => item.contentFamily === undefined), true);
  assert.equal(projectItems.every((item) => item.mediaProvenance), true);
  assert.equal(projectItems.every((item) => typeof item.sourceUrl === "string"), true);
  assert.equal(projectItems.every((item) => item.evidence.length >= 1), true);

  assert.deepEqual(projectExhibits.slice(0, 4).map((item) => item.position), [
    [-4, 0, -3],
    [4, 0, -3],
    [-4, 0, -11],
    [4, 0, -11],
  ]);
  assert.deepEqual(projectExhibits[4]?.position, [-4.5, 0, -14]);
  assert.deepEqual(projectExhibits[11]?.position, [4.5, 0, -16.5]);

  for (const item of projectItems) {
    const exhibit = projectExhibits.find((entry) => entry.sourceItemId === item.id);
    assert.ok(exhibit, `exhibit exists for ${item.title}`);
    assert.equal(exhibit?.sourceUrl, item.sourceUrl);
  }
});

test("explicit project section prevents synthetic media-project expansion", () => {
  const text = [
    "Nielsson",
    "Research Scientist",
    "项目",
    "Declared Project One",
    "- Published with explicit section.",
    "Declared Project Two",
    "- Published with explicit section.",
  ].join("\n");
  const syntheticMedia = Array.from({ length: 12 }, (_, index) => {
    const displayIndex = index + 1;
    return {
      url: `https://cdn.example.com/project-covers/project-${displayIndex}.png`,
      originalUrl: `https://cdn.example.com/project-covers/project-${displayIndex}.png`,
      sourcePage: "https://example.com/portfolio",
      locator: `img:${displayIndex}`,
      alt: `Unannounced Media ${displayIndex}`,
      title: `Unannounced Media ${displayIndex}`,
      linkUrl: `https://example.com/projects/project-${displayIndex}`,
      kind: "project" as const,
      category: "project-cover" as const,
      categoryConfidence: 0.97,
      categoryReason: "high-confidence media cover",
    };
  });

  const result = runPipeline(text, {
    type: "url",
    label: "Synthetic Media Portfolio",
    media: syntheticMedia,
  });

  const projectItems = result.profile.items.filter((item) => item.kind === "project");
  const titles = projectItems.map((item) => item.title);
  assert.equal(projectItems.length, 2);
  assert.ok(titles.includes("Declared Project One"));
  assert.ok(titles.includes("Declared Project Two"));
  assert.ok(!titles.some((title) => title.startsWith("Unannounced Media")));
});

test("synthetic project titles are recovered from nearest figure/anchor neighbors", () => {
  const html = `<!doctype html>
    <html><head><title>Project Card Titles</title></head><body>
      <div class="profile_box">
        <img src="images/avatar.png" alt="Profile avatar">
      </div>
      <section class="page__content">
        <article>
          <div class="project-card">
            <a href="https://example.com/paper">
              <figure>
                <img src="images/project-card.png" class="project-cover" alt="cover">
                <figcaption>Graph Contrastive Learning for Molecular Graphs</figcaption>
              </figure>
            </a>
          </div>
        </article>
      </section>
    </body></html>`;
  const page = extractWebPage(html, "https://example.com/");
  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projects = result.profile.items.filter((item) => item.kind === "project");

  assert.equal(projects.length, 1);
  assert.equal(projects[0]?.title, "Graph Contrastive Learning for Molecular Graphs");
  assert.equal(projects[0]?.imageUrl, "https://example.com/images/project-card.png");
});

test("contact dedupe keeps all unique channels while prioritizing key channels", () => {
  const text = [
    "Alex Liu",
    "AI Researcher",
    "Contact",
    "Email: alex@example.com",
    "GitHub: https://github.com/alexliu?utm_source=test",
    "LinkedIn: https://www.linkedin.com/in/alexliu/",
    "作品: https://juejin.cn/user/alexliu",
    "社媒: https://x.com/alexliu",
    "GitHub: https://github.com/alexliu",
    "作品: https://leetcode.com/u/alexliu",
    "社媒: https://instagram.com/alexliu",
    "作品: https://behance.net/alexliu",
    "社媒: https://youtube.com/alexliu",
    "Work: https://example.com/one",
    "Work: https://example.com/two",
    "Work: https://example.com/three",
    "Work: https://example.com/four",
    "Work: https://example.com/five",
    "Work: https://example.com/six",
    "Work: https://example.com/seven",
    "Work: https://example.com/eight",
    "Work: https://example.com/nine",
    "Work: https://example.com/ten",
    "Work: https://example.com/eleven",
  ].join("\n");
  const profile = parseProfile(text);

  assert.equal(profile.contacts.length, 20);
  assert.equal(profile.contacts[0], "Email: alex@example.com");
  assert.equal(profile.contacts[1], "GitHub: https://github.com/alexliu");
  assert.equal(profile.contacts[2], "LinkedIn: https://www.linkedin.com/in/alexliu/");
  assert.equal(profile.contacts[3], "作品: https://juejin.cn/user/alexliu");
  assert.equal(profile.contacts[4], "作品: https://leetcode.com/u/alexliu");
  assert.ok(profile.contacts.includes("作品: https://example.com/eleven"));
  assert.ok(profile.contacts.includes("社媒: https://youtube.com/alexliu"));
  assert.equal(profile.contactEvidence["Email: alex@example.com"]?.length, 1);
  assert.equal(profile.contactEvidence["GitHub: https://github.com/alexliu"]?.length, 1);
  assert.equal(profile.contactEvidence["LinkedIn: https://www.linkedin.com/in/alexliu/"]?.length, 1);
});

test("contact dedupe prioritizes high-value channels without discarding overflow", () => {
  const text = [
    "Alex Liu",
    "AI Researcher",
    "Contact",
    ...Array.from({ length: 12 }, (_, index) => `Work: https://example.com/project-${index + 1}`),
    "GitHub: https://github.com/alexliu",
    "LinkedIn: https://www.linkedin.com/in/alexliu/",
    "Email: alex@example.com",
  ].join("\n");
  const profile = parseProfile(text);

  assert.equal(profile.contacts.length, 15);
  assert.equal(profile.contacts[0], "Email: alex@example.com");
  assert.equal(profile.contacts[1], "GitHub: https://github.com/alexliu");
  assert.equal(profile.contacts[2], "LinkedIn: https://www.linkedin.com/in/alexliu/");
  assert.equal(profile.contacts[3], "作品: https://example.com/project-1");
  assert.equal(profile.contacts[14], "作品: https://example.com/project-12");
});
