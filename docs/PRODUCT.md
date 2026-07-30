# Product specification

## Problem

Personal websites are usually flat collections of text and cards. High-quality 3D portfolios exist, but building one requires 3D modeling, real-time rendering, interaction design, and web engineering. ROOM turns an existing résumé or portfolio into a navigable personal environment.

## User promise

Paste a public portfolio URL or upload a résumé. Review the extracted information, choose a visual direction, and publish a multi-room world.

## MVP user journey

1. The owner submits a public URL, PDF, or structured résumé.
2. ROOM extracts facts with source evidence and confidence scores.
3. The owner confirms or corrects the profile.
4. ROOM proposes a room graph and exhibit plan.
5. The owner selects a visual theme from an approved asset catalog.
6. ROOM compiles and previews the world.
7. QA checks run before publishing.
8. Visitors navigate the world and leave spatial comments.
9. The owner moderates and replies to comments.

## Initial room grammar

A world is a graph rather than one monolithic model.

- **Room**: semantic container with a visual theme and performance budget.
- **Portal**: doorway connecting two rooms.
- **Exhibit**: interactive object representing one profile item.
- **Anchor**: stable semantic target for comments and navigation.
- **Guided stop**: optional camera position for visitors who do not want first-person controls.

Every important exhibit must also have an accessible HTML representation.

## Comment model

Comments bind primarily to a semantic `entity_id`, with optional local 3D coordinates.

This preserves comments when the owner changes room layouts or themes.

Comment scopes:

- world-level guestbook comment
- room-level comment
- exhibit/project comment
- reply thread

The owner can approve, hide, delete, pin, or disable comments. Anonymous comments require rate limiting and bot protection.

## Out of scope for Phase 1

- racing or vehicle navigation
- multiplayer avatars
- voice chat
- arbitrary AI-generated Three.js source code
- fully generated 3D assets
- VR-first interaction
- unrestricted crawling of authenticated websites
