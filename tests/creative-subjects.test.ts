import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCreativeSubjectProviderResult,
  buildCreativeSubjectSceneDisclosure,
  findRenderableCreativeSubject,
  planCreativeSubjects,
  type CreativeSubjectMediaCandidate,
} from "../lib/agents/creative-subjects.ts";
import type { ParsedProfile, ProfileMedia, SourceEvidence } from "../lib/types.ts";

function evidence(sourceId: string, locator: string, excerpt: string): SourceEvidence {
  return { sourceId, locator, excerpt };
}

function profileMedia(overrides: Partial<ProfileMedia>): ProfileMedia {
  return {
    url: "https://example.test/image.jpg",
    originalUrl: "https://example.test/image.jpg",
    sourcePage: "https://example.test/home",
    locator: "profile-img:0",
    kind: "other",
    category: "other",
    categoryConfidence: 0.5,
    categoryReason: "fixture",
    ...overrides,
  };
}

function baseProfile(overrides: Partial<ParsedProfile> & { media?: CreativeSubjectMediaCandidate[] } = {}) {
  return {
    id: "profile-1",
    name: "Ada Example",
    headline: "Creative technologist",
    summary: "A portfolio with a visible portrait and one pet.",
    contacts: [],
    identityEvidence: {
      name: [evidence("source-1", "line:1", "Ada Example")],
      headline: [evidence("source-1", "line:2", "Creative technologist")],
      summary: [evidence("source-1", "line:3", "A portfolio with a visible portrait and one pet.")],
    },
    contactEvidence: {},
    media: [],
    skills: ["Three.js"],
    skillEvidence: { "Three.js": [evidence("source-1", "line:7", "Three.js")] },
    items: [
      {
        id: "summary-1",
        kind: "summary",
        title: "About",
        summary: "About Ada",
        bullets: [],
        tags: ["about"],
        evidence: [evidence("source-1", "line:2", "About Ada")],
      },
    ],
    source: {
      id: "source-1",
      type: "url",
      label: "demo",
      lineCount: 12,
    },
    ...overrides,
  } as ParsedProfile & { media?: CreativeSubjectMediaCandidate[] };
}

test("creates a person subject from a profile photo with provenance and stylized disclosure", () => {
  const profile = baseProfile({
    media: [
      profileMedia({
        url: "https://example.test/avatar.jpg",
        originalUrl: "https://example.test/avatar.jpg",
        alt: "Ada Example profile portrait",
        title: "Ada portrait",
        kind: "profile",
        linkUrl: "https://example.test",
        sourcePage: "https://example.test/home",
        locator: "profile-img:1",
        category: "profile-photo",
        categoryConfidence: 0.99,
        categoryReason: "Explicit profile avatar candidate in profile container.",
      }),
    ],
  });

  const subjects = planCreativeSubjects(profile);
  assert.equal(subjects.length, 1);
  const person = subjects[0];
  assert.equal(person.kind, "person");
  assert.equal(person.status, "approved");
  assert.equal(person.source.kind, "profile-photo");
  assert.equal(person.generation.mode, "2.5d-standee");
  assert.equal(person.source.media?.url, "https://example.test/avatar.jpg");
  assert.equal(person.source.media?.sourcePage, "https://example.test/home");
  assert.equal(person.source.media?.locator, "profile-img:1");
  assert.ok(person.similarityDisclosure.includes("Stylized collectible reinterpretation"));
  assert.ok(person.evidence.length > 0);
  assert.deepEqual(buildCreativeSubjectSceneDisclosure(person), {
    title: "CARTOON HOST",
    subtitle: "PHOTO REF · 2.5D · APPROVED · NO COPY",
  });
});

test("falls back to a source-less system person when no photo is available", () => {
  const profile = baseProfile({ media: [] });

  const subjects = planCreativeSubjects(profile);
  assert.equal(subjects.length, 1);
  const person = subjects[0];
  assert.equal(person.kind, "person");
  assert.equal(person.status, "fallback");
  assert.equal(person.source.kind, "source-less-system");
  assert.equal(person.fallback.kind, "source-less-system");
  assert.equal(person.generation.mode, "procedural-lowpoly");
  assert.deepEqual(person.source.evidence, []);
  assert.deepEqual(person.evidence, []);
  assert.match(person.asset?.description || "", /no additional identity claims|no inferred face/i);
  assert.deepEqual(buildCreativeSubjectSceneDisclosure(person), {
    title: "FALLBACK HOST",
    subtitle: "NO PHOTO · LOW-POLY · FALLBACK · SOURCELESS",
  });
});

test("does not promote a non profile-photo portrait to an approved person", () => {
  const profile = baseProfile({
    media: [
      profileMedia({
        url: "https://example.test/portrait.jpg",
        originalUrl: "https://example.test/portrait.jpg",
        alt: "Ada Example portrait",
        title: "Ada portrait",
        kind: "profile",
        category: "content",
        categoryConfidence: 0.99,
        categoryReason: "Generic portrait crop.",
      }),
    ],
  });

  const subjects = planCreativeSubjects(profile);
  assert.equal(subjects.length, 1);
  assert.equal(subjects[0].kind, "person");
  assert.equal(subjects[0].status, "fallback");
  assert.equal(subjects[0].source.kind, "source-less-system");
});

test("does not misclassify ambiguous text as a pet", () => {
  const profile = baseProfile({
    summary: "We build catalog systems and dogma-free interfaces.",
    items: [
      {
        id: "summary-1",
        kind: "summary",
        title: "Catalog",
        summary: "Concatenate catalog data",
        bullets: ["A catalog is not a cat"],
        tags: ["catalog"],
        evidence: [evidence("source-1", "line:3", "Catalog systems")],
      },
    ],
    media: [
      profileMedia({
        url: "https://example.test/catalog.jpg",
        originalUrl: "https://example.test/catalog.jpg",
        alt: "Product catalog cover",
        title: "Catalog",
        kind: "other",
        category: "other",
        categoryConfidence: 0.4,
        categoryReason: "Generic cover image.",
      }),
    ],
  });

  const subjects = planCreativeSubjects(profile);
  assert.equal(subjects.some((subject) => subject.kind === "pet"), false);
});

test("does not create a pet from a name or project title alone", () => {
  const profile = baseProfile({
    summary: "Logo project and catalog system for an internal brand refresh.",
    items: [
      {
        id: "summary-1",
        kind: "summary",
        title: "Milo",
        summary: "Project title only.",
        bullets: ["Logo", "Catalog", "Dogma-free"],
        tags: ["project", "brand"],
        evidence: [evidence("source-1", "line:3", "Project title only.")],
      },
    ],
    media: [
      profileMedia({
        url: "https://example.test/logo.jpg",
        originalUrl: "https://example.test/logo.jpg",
        alt: "Project logo",
        title: "Milo",
        kind: "other",
        category: "other",
        categoryConfidence: 0.3,
        categoryReason: "Project logo asset.",
      }),
    ],
  });

  const subjects = planCreativeSubjects(profile);
  assert.equal(subjects.some((subject) => subject.kind === "pet"), false);
});

test("creates a pet only when the evidence is explicit", () => {
  const profile = baseProfile({
    summary: "Our cat Milo appears on the homepage.",
    items: [
      {
        id: "summary-1",
        kind: "summary",
        title: "Cat Milo",
        summary: "The cat sleeps near the window.",
        bullets: ["Milo the cat"],
        tags: ["cat", "milo"],
        evidence: [evidence("source-1", "line:4", "Milo the cat sleeps on the sofa.")],
      },
    ],
    media: [
      profileMedia({
        url: "https://example.test/cat.jpg",
        originalUrl: "https://example.test/cat.jpg",
        alt: "Milo the cat on a sofa",
        title: "Milo cat",
        kind: "other",
        sourcePage: "https://example.test/home",
        locator: "profile-img:2",
        category: "content",
        categoryConfidence: 0.96,
        categoryReason: "Explicit pet photo in homepage content.",
      }),
    ],
  });

  const subjects = planCreativeSubjects(profile);
  const pet = subjects.find((subject) => subject.kind === "pet");
  assert.ok(pet);
  assert.equal(pet?.status, "approved");
  assert.equal(pet?.source.kind, "pet-photo");
  assert.equal(pet?.source.media?.locator, "profile-img:2");
  assert.ok((pet?.confidence || 0) >= 0.76);
  assert.deepEqual(buildCreativeSubjectSceneDisclosure(pet), {
    title: "CARTOON PET CAT",
    subtitle: "PET PHOTO · 2.5D · APPROVED · NO COPY",
  });
});

test("creates a text-only pet as a procedural low-poly subject when no photo exists", () => {
  const profile = baseProfile({
    summary: "Our cat Milo appears on the homepage.",
    items: [
      {
        id: "summary-1",
        kind: "summary",
        title: "Cat Milo",
        summary: "The cat sleeps near the window.",
        bullets: ["Milo the cat", "Sleeping on the sofa"],
        tags: ["cat", "milo"],
        evidence: [evidence("source-1", "line:4", "Milo the cat sleeps on the sofa.")],
      },
    ],
    media: [],
  });

  const subjects = planCreativeSubjects(profile);
  const pet = subjects.find((subject) => subject.kind === "pet");
  assert.ok(pet);
  assert.equal(pet?.status, "approved");
  assert.equal(pet?.source.kind, "contextual-text");
  assert.equal(pet?.source.media, undefined);
  assert.equal(pet?.generation.mode, "procedural-lowpoly");
  assert.equal(pet?.asset?.kind, "procedural-lowpoly");
  assert.equal(pet?.fallback.kind, "none");
  assert.ok((pet?.confidence || 0) >= 0.6);
  assert.equal(findRenderableCreativeSubject(subjects, "pet")?.id, pet?.id);
  assert.deepEqual(buildCreativeSubjectSceneDisclosure(pet), {
    title: "CARTOON PET CAT",
    subtitle: "TEXT EVIDENCE · LOW-POLY · APPROVED · NO COPY",
  });
});

test("provider failure downgrades a subject without changing room state", () => {
  const profile = baseProfile({
    media: [
      profileMedia({
        url: "https://example.test/avatar.jpg",
        originalUrl: "https://example.test/avatar.jpg",
        alt: "Ada Example profile portrait",
        title: "Ada portrait",
        kind: "profile",
        category: "profile-photo",
        categoryConfidence: 0.99,
        categoryReason: "Explicit profile avatar candidate in profile container.",
      }),
    ],
  });
  const subject = planCreativeSubjects(profile)[0];
  const downgraded = applyCreativeSubjectProviderResult(subject, {
    ok: false,
    reason: "GPU unavailable",
    fallbackMode: "procedural-lowpoly",
  });

  assert.equal(downgraded.status, "fallback");
  assert.equal(downgraded.generation.mode, "procedural-lowpoly");
  assert.equal(downgraded.fallback.kind, "provider-failed");
  assert.match(downgraded.fallback.reason, /GPU unavailable/);
  assert.equal("roomId" in downgraded, false);
  assert.deepEqual(buildCreativeSubjectSceneDisclosure(downgraded), {
    title: "FALLBACK HOST",
    subtitle: "PHOTO REF · LOW-POLY · FALLBACK · FAILED: GPU UNAVAILABLE",
  });
});

test("successful provider output preserves provenance and marks the subject ready", () => {
  const profile = baseProfile({
    media: [
      profileMedia({
        url: "https://example.test/avatar.jpg",
        originalUrl: "https://example.test/avatar.jpg",
        alt: "Ada Example profile portrait",
        title: "Ada portrait",
        kind: "profile",
        locator: "profile-img:1",
        category: "profile-photo",
        categoryConfidence: 0.99,
        categoryReason: "Explicit profile avatar candidate in profile container.",
      }),
    ],
  });
  const subject = planCreativeSubjects(profile)[0];
  const ready = applyCreativeSubjectProviderResult(subject, {
    ok: true,
    asset: {
      kind: "offline-gltf",
      description: "Baked collectible",
      sourceUrl: "https://example.test/avatar.gltf",
      hash: "sha256:abc123",
    },
  });

  assert.equal(ready.status, "ready");
  assert.equal(ready.asset?.kind, "offline-gltf");
  assert.equal(ready.source.kind, subject.source.kind);
  assert.equal(ready.source.media?.locator, "profile-img:1");
});
