import { mkdir, writeFile } from "node:fs/promises";

const repositories = [
  "jrefusta/joan-portfolio",
  "andrewwoan/sooahs-room-folio",
  "maxime-mrl/3D-room-portofolio",
  "brunosimon/folio-2025",
  "ladunjexa/reactjs18-3d-portfolio",
  "sanidhyy/3D_Portfolio",
  "Jayant-1/3D-Portfolio",
];

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "ROOM-RAG-Sync/0.1" },
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function sync(repo) {
  const [owner, name] = repo.split("/");
  try {
    const metadata = await github(`/repos/${owner}/${name}`);
    const readme = await github(`/repos/${owner}/${name}/readme`).catch(() => null);
    const license = await github(`/repos/${owner}/${name}/license`).catch(() => null);
    const readmeText = readme?.content
      ? Buffer.from(readme.content, "base64").toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000)
      : "";
    return {
      id: repo.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      repo,
      url: metadata.html_url,
      description: metadata.description || "",
      topics: metadata.topics || [],
      defaultBranch: metadata.default_branch,
      stars: metadata.stargazers_count,
      license: license?.license?.spdx_id || metadata.license?.spdx_id || "NOASSERTION",
      fetchedAt: new Date().toISOString(),
      readmeExcerpt: readmeText,
    };
  } catch (error) {
    return { repo, error: error instanceof Error ? error.message : String(error), fetchedAt: new Date().toISOString() };
  }
}

const entries = [];
for (const repo of repositories) entries.push(await sync(repo));
await mkdir(new URL("../research/rag/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../research/rag/repositories.json", import.meta.url),
  `${JSON.stringify({ version: 1, purpose: "License-aware reference corpus for ROOM Creative Director", entries }, null, 2)}\n`,
);
console.log(`Synced ${entries.filter((entry) => !entry.error).length}/${entries.length} repositories.`);
