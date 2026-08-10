import assert from "node:assert/strict";
import test from "node:test";
import { runPipeline } from "../lib/agents/pipeline.ts";
import { extractWebPage } from "../lib/extract-webpage.ts";
import { validateProfile } from "../lib/validate.ts";

test("generic repeated project cards keep metadata and links scoped to each exact class-token container", () => {
  const html = `<!doctype html>
    <html><head><title>Ari Tan — Portfolio</title></head><body>
      <h1>Ari Tan</h1>
      <section class="portfolio-grid">
        <article class="portfolio-item featured">
          <div class="portfolio-item-thumbnail"><img src="/images/orbit-atlas.webp" alt="Orbit Atlas cover"></div>
          <div class="portfolio-item-details">
            <h3>Orbit Atlas</h3>
            <p>An interactive WebGL atlas for listening to field recordings across coastal cities.</p>
            <p><strong>Created :</strong> May – June'2025</p>
            <p><strong>Role</strong> - Lead Creative Developer</p>
            <p><strong>Technologies used</strong> - Three.js, TypeScript, GLSL</p>
            <a href="https://github.com/example/orbit-atlas">Source Code</a>
            <a href="https://orbit.example.com">View Online</a>
          </div>
        </article>
        <article class="project-card">
          <div class="project-thumbnail"><img src="/images/archive-room.webp" alt="Archive Room cover"></div>
          <div class="project-details">
            <h3 class="project-title">Archive Room</h3>
            <p>A searchable oral-history installation built for a neighborhood museum.</p>
            <p>Created: 4 Dec 2020</p>
            <p>Role: Backend Engineer</p>
            <p>Tech stack: Node.js, PostgreSQL, WebSockets</p>
            <a href="javascript:void(0)">View Online</a>
            <a href="https://github.com/example/archive-room">Source Code</a>
          </div>
        </article>
        <div class="work-item">
          <img src="/images/light-study.webp" alt="Sculptural Light Study">
          <h3>Sculptural Light Study</h3>
          <p>A physical light-and-clay study documented as an independent artwork.</p>
          <p>Created: July' 2022</p>
          <p>Role: Artist</p>
          <p>Technologies used: Clay, LEDs</p>
        </div>
        <article class="project-card">
          <!-- <img src="/images/legacy-placeholder.webp" alt="Portfolio item thumb"> -->
          <img src="/images/image-analyzer.webp" alt="Portfolio item thumb">
          <h3 class="project-title">Image Analyzer</h3>
          <p>An image-analysis tool that accepts uploads and URLs, then presents structured recognition results.</p>
          <p>Created: July’ 2023</p>
          <p>Tech stack: React.js, TensorFlow</p>
        </article>
        <div class="project-item">
          <a href="#"><img src="/images/template.webp" alt="Project Title"></a>
          <div class="project-details">
            <h3>Project Title</h3>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
            <p>Created: Date</p>
            <a href="#">View Online</a>
          </div>
        </div>
        <div class="project-item">
          <a href="#"><img src="/images/starter-theme.webp" alt="Finance"></a>
          <h3 class="project-title">Finance</h3>
          <p>Web development</p>
        </div>
      </section>
    </body></html>`;

  const page = extractWebPage(html, "https://portfolio.example.com/");
  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projects = result.profile.items.filter((item) => item.kind === "project");
  const byTitle = Object.fromEntries(projects.map((item) => [item.title, item]));

  assert.equal(validateProfile(result.profile).length, 0);
  assert.deepEqual(projects.map((item) => item.title), [
    "Orbit Atlas",
    "Archive Room",
    "Sculptural Light Study",
    "Image Analyzer",
  ]);
  assert.equal(byTitle["Project Title"], undefined);
  assert.equal(byTitle.Finance, undefined);

  assert.equal(byTitle["Orbit Atlas"]?.timeRange, "May – June'2025");
  assert.equal(byTitle["Orbit Atlas"]?.role, "Lead Creative Developer");
  assert.deepEqual(byTitle["Orbit Atlas"]?.techStack, ["Three.js", "TypeScript", "GLSL"]);
  assert.equal(byTitle["Orbit Atlas"]?.projectUrl, "https://orbit.example.com/");
  assert.match(byTitle["Orbit Atlas"]?.fieldEvidence?.timeRange?.[0]?.excerpt ?? "", /Created/);
  assert.match(byTitle["Orbit Atlas"]?.fieldEvidence?.techStack?.[0]?.excerpt ?? "", /Technologies used/);
  assert.match(byTitle["Orbit Atlas"]?.fieldEvidence?.projectUrl?.[0]?.excerpt ?? "", /View Online/);
  assert.ok(result.profile.skills.includes("Three.js"));
  assert.match(result.profile.skillEvidence["Three.js"]?.[0]?.excerpt ?? "", /Technologies used/);

  assert.equal(byTitle["Archive Room"]?.timeRange, "4 Dec 2020");
  assert.equal(byTitle["Archive Room"]?.role, "Backend Engineer");
  assert.deepEqual(byTitle["Archive Room"]?.techStack, ["Node.js", "PostgreSQL", "WebSockets"]);
  assert.equal(byTitle["Archive Room"]?.projectUrl, "https://github.com/example/archive-room");
  assert.match(byTitle["Archive Room"]?.fieldEvidence?.projectUrl?.[0]?.excerpt ?? "", /Source Code/);

  assert.equal(byTitle["Sculptural Light Study"]?.timeRange, "July' 2022");
  assert.equal(byTitle["Sculptural Light Study"]?.projectUrl, undefined);
  assert.ok(byTitle["Sculptural Light Study"]?.fieldEvidence?.timeRange?.length);
  assert.equal(byTitle["Image Analyzer"]?.imageUrl, "https://portfolio.example.com/images/image-analyzer.webp");
  assert.equal(page.media.some((item) => item.originalUrl === "/images/legacy-placeholder.webp"), false);

  const templateMedia = page.media.find((item) => item.originalUrl === "/images/template.webp");
  assert.equal(templateMedia?.kind, "other");
  assert.ok((templateMedia?.categoryConfidence ?? 1) < 0.65);
});

test("text-only article.card projects are extracted only inside an explicit projects section", () => {
  const html = `<!doctype html>
    <html><head><title>William Giddings — Software Engineer</title></head><body>
      <h1>William Giddings</h1>
      <ul class="svg-list">
        <li><svg role="img" aria-label="Java icon"></svg><h5>Java</h5></li>
        <li><svg role="img" aria-label="Git icon"></svg><h5>Git</h5></li>
      </ul>
      <h3 id="projects">Projects</h3>
      <article class="card">
        <h4>Campus Route Planner</h4>
        <a href="https://github.com/william/route-planner">Learn More</a>
        <p>A graph-based route planner for accessible paths across a large university campus.</p>
      </article>
      <article class="card shadow">
        <h4>Study Group Scheduler</h4>
        <p>A collaborative scheduling tool that finds overlap without exposing private calendars.</p>
        <a href="https://github.com/william/study-scheduler">Learn More</a>
      </article>
      <h3>Writing</h3>
      <article class="card">
        <h4>Ordinary blog card</h4>
        <p>This article card is outside the Projects section and must not become a project.</p>
        <a href="https://blog.example.com/post">Learn More</a>
      </article>
    </body></html>`;

  const page = extractWebPage(html, "https://william.example.com/");
  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projects = result.profile.items.filter((item) => item.kind === "project");

  assert.deepEqual(projects.map((item) => item.title), ["Campus Route Planner", "Study Group Scheduler"]);
  assert.deepEqual(projects.map((item) => item.projectUrl), [
    "https://github.com/william/route-planner",
    "https://github.com/william/study-scheduler",
  ]);
  assert.ok(projects.every((item) => item.fieldEvidence?.projectUrl?.length === 1));
  assert.match(projects[0]?.fieldEvidence?.projectUrl?.[0]?.excerpt ?? "", /route-planner/);
  assert.match(projects[1]?.fieldEvidence?.projectUrl?.[0]?.excerpt ?? "", /study-scheduler/);
  assert.equal(projects.some((item) => item.title === "Ordinary blog card"), false);
  assert.deepEqual(result.profile.skills, ["Java", "Git"]);
});

test("section wrapper cards yield to nested exact project cards without mixing sibling links", () => {
  const html = `<!doctype html>
    <html><head><title>Nested Works</title></head><body>
      <h1>Nested Works</h1>
      <h2>Projects</h2>
      <div class="card">
        <article class="project-card">
          <h3>First Nested Project</h3>
          <p>A complete first project description with enough detail to stand on its own.</p>
          <a href="https://example.com/first">View Online</a>
        </article>
        <article class="project-card">
          <h3>Second Nested Project</h3>
          <p>A complete second project description whose source must remain on this card.</p>
          <a href="https://example.com/second">View Online</a>
        </article>
      </div>
    </body></html>`;

  const page = extractWebPage(html, "https://nested.example.com/");
  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projects = result.profile.items.filter((item) => item.kind === "project");

  assert.deepEqual(projects.map((item) => item.title), [
    "First Nested Project",
    "Second Nested Project",
  ]);
  assert.deepEqual(projects.map((item) => item.projectUrl), [
    "https://example.com/first",
    "https://example.com/second",
  ]);
});

test("CubePortfolio cbp-item titles and links remain scoped to their own card", () => {
  const html = `<!doctype html>
    <html><head><title>Damilola — Creative Portfolio</title></head><body>
      <h1>Damilola</h1>
      <a href="https://twitter.com/damilola"><i class="fab fa-twitter"></i></a>
      <div class="cbp-item motion branding">
        <iframe src="https://www.youtube.com/embed/alpha"></iframe>
        <a href="/images/festival.webp" class="cbp-lightbox"></a>
        <a class="cbp-l-grid-projects-title" href="https://www.youtube.com/watch?v=alpha">Festival Motion Identity</a>
        <p>A motion identity package combining typography, compositing, and sound design.</p>
      </div>
      <div class="cbp-item editorial">
        <iframe src="https://www.youtube.com/embed/beta123"></iframe>
        <a class="cbp-l-grid-projects-title" href="https://drive.google.com/file/d/beta/view">Editorial Campaign</a>
        <p>A print and social campaign for an independent arts publication.</p>
      </div>
      <div class="cbp-item motion">
        <iframe src="https://drive.google.com/file/d/drive456/preview"></iframe>
        <a class="cbp-l-grid-projects-title" href="https://drive.google.com/file/d/drive456/view">Production Reel</a>
        <p>A production reel collecting selected directing and editing work from recent short films.</p>
      </div>
    </body></html>`;

  const page = extractWebPage(html, "https://damilola.example.com/");
  const result = runPipeline(page.text, { type: "url", label: page.title, media: page.media });
  const projects = result.profile.items.filter((item) => item.kind === "project");

  assert.deepEqual(projects.map((item) => item.title), [
    "Festival Motion Identity",
    "Editorial Campaign",
    "Production Reel",
  ]);
  assert.equal(projects[0]?.projectUrl, "https://www.youtube.com/watch?v=alpha");
  assert.equal(projects[1]?.projectUrl, "https://drive.google.com/file/d/beta/view");
  assert.equal(projects[2]?.projectUrl, "https://drive.google.com/file/d/drive456/view");
  assert.match(projects[0]?.fieldEvidence?.projectUrl?.[0]?.excerpt ?? "", /youtube/);
  assert.match(projects[1]?.fieldEvidence?.projectUrl?.[0]?.excerpt ?? "", /drive\.google/);
  assert.equal(projects[0]?.imageUrl, "https://damilola.example.com/images/festival.webp");
  assert.equal(projects[1]?.imageUrl, "https://i.ytimg.com/vi/beta123/hqdefault.jpg");
  assert.equal(projects[2]?.imageUrl, "https://drive.google.com/thumbnail?id=drive456&sz=w1200");
  assert.equal(page.media.filter((item) => item.category === "project-cover").length, 3);
  assert.ok(result.profile.contacts.some((contact) => /https:\/\/twitter\.com\/damilola/i.test(contact)));
});

test("explicit project metadata accepts typographic month ranges and spaced dash separators", () => {
  const text = [
    "Nora Vale",
    "Interaction Designer",
    "Projects",
    "Memory Current",
    "- Created - Oct - Nov’ 2022",
    "- Role - Interaction Designer",
    "- Technologies used - WebGL, Tone.js",
    "- Source Code - https://github.com/example/memory-current",
    "- Project Link - https://memory.example.com/project",
    "- View Online - https://memory.example.com",
  ].join("\n");

  const result = runPipeline(text);
  const project = result.profile.items.find((item) => item.title === "Memory Current");

  assert.equal(validateProfile(result.profile).length, 0);
  assert.equal(project?.timeRange, "Oct - Nov’ 2022");
  assert.equal(project?.role, "Interaction Designer");
  assert.deepEqual(project?.techStack, ["WebGL", "Tone.js"]);
  assert.equal(project?.projectUrl, "https://memory.example.com");
  assert.match(project?.fieldEvidence?.timeRange?.[0]?.excerpt ?? "", /Created - Oct - Nov’ 2022/);
  assert.match(project?.fieldEvidence?.projectUrl?.[0]?.excerpt ?? "", /View Online/);
});

test("an en dash inside a project name is preserved instead of becoming a subtitle", () => {
  const result = runPipeline([
    "Shubhashis Roy",
    "Software Engineer",
    "Projects",
    "Crushes – Social Matching App",
    "- A full-stack matching application.",
  ].join("\n"));
  const projects = result.profile.items.filter((item) => item.kind === "project");

  assert.equal(projects[0]?.title, "Crushes – Social Matching App");
  assert.equal(projects[0]?.subtitle, undefined);
});

test("explicit projects do not inherit unrelated media or links by positional fallback", () => {
  const result = runPipeline([
    "Mina Park",
    "Designer",
    "Projects",
    "Documented Installation",
    "- A text-only project with its own explicit description.",
  ].join("\n"), {
    type: "url",
    id: "https://mina.example.com/",
    media: [{
      url: "https://cdn.example.com/unrelated.webp",
      originalUrl: "/unrelated.webp",
      sourcePage: "https://mina.example.com/",
      locator: "img:900",
      title: "Different Project",
      alt: "Different Project",
      linkUrl: "https://different.example.com/",
      kind: "project",
      category: "project-cover",
      categoryConfidence: 0.98,
      categoryReason: "Different card.",
    }],
  });
  const project = result.profile.items.find((item) => item.title === "Documented Installation");

  assert.equal(project?.imageUrl, undefined);
  assert.equal(project?.projectUrl, undefined);
  assert.equal(project?.sourceUrl, undefined);
  assert.equal(project?.mediaProvenance, undefined);
});
