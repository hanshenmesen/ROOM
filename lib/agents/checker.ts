import type { CheckIssue, CheckReport, ExhibitPlan, WorldPlan } from "../types.ts";

function issue(
  category: CheckIssue["category"],
  severity: CheckIssue["severity"],
  message: string,
  entityIds: string[],
  suggestion: string,
): CheckIssue {
  return {
    id: `${category}-${Math.abs(message.split("").reduce((total, char) => total + char.charCodeAt(0), 0))}`,
    category,
    severity,
    message,
    entityIds,
    suggestion,
  };
}

function overlaps(a: ExhibitPlan, b: ExhibitPlan) {
  const x = Math.abs(a.position[0] - b.position[0]) < (a.size[0] + b.size[0]) / 2;
  const y = Math.abs(a.position[1] - b.position[1]) < (a.size[1] + b.size[1]) / 2;
  const z = Math.abs(a.position[2] - b.position[2]) < (a.size[2] + b.size[2]) / 2;
  return x && y && z;
}

function connectedRooms(world: WorldPlan) {
  if (!world.rooms.length) return new Set<string>();
  const seen = new Set([world.rooms[0].id]);
  const queue = [world.rooms[0].id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const portal of world.portals) {
      const next =
        portal.fromRoomId === current
          ? portal.toRoomId
          : portal.toRoomId === current
            ? portal.fromRoomId
            : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export function checkWorld(world: WorldPlan): CheckReport {
  const issues: CheckIssue[] = [];
  const expected = [
    ...world.profile.items.map((item) => item.id),
    ...world.profile.skills.map((skill) => `skill:${skill}`),
  ];
  const mapped = new Set(world.exhibits.map((exhibit) => exhibit.sourceItemId));
  const missing = expected.filter((id) => !mapped.has(id));
  if (missing.length) {
    issues.push(
      issue("content", "error", `${missing.length} 项履历内容未进入空间。`, missing, "为每个来源条目创建唯一展品。"),
    );
  }

  for (const room of world.rooms) {
    const exhibits = world.exhibits.filter((exhibit) => exhibit.roomId === room.id);
    for (let a = 0; a < exhibits.length; a += 1) {
      for (let b = a + 1; b < exhibits.length; b += 1) {
        if (overlaps(exhibits[a], exhibits[b])) {
          issues.push(
            issue(
              "overlap",
              "error",
              `${exhibits[a].title} 与 ${exhibits[b].title} 的包围盒重叠。`,
              [exhibits[a].id, exhibits[b].id],
              "重新运行网格布局或扩大房间。",
            ),
          );
        }
      }
    }
  }

  const inactive = world.exhibits.filter(
    (exhibit) =>
      !exhibit.interaction.clickable ||
      !exhibit.interaction.action ||
      exhibit.interaction.hitbox.some((dimension) => dimension <= 0),
  );
  if (inactive.length) {
    issues.push(
      issue(
        "interaction",
        "error",
        `${inactive.length} 件展品没有有效点击目标。`,
        inactive.map((item) => item.id),
        "补充点击动作与大于零的 hitbox。",
      ),
    );
  }

  const connected = connectedRooms(world);
  const disconnected = world.rooms.filter((room) => !connected.has(room.id));
  if (disconnected.length) {
    issues.push(
      issue(
        "navigation",
        "error",
        `${disconnected.length} 个房间无法从入口抵达。`,
        disconnected.map((room) => room.id),
        "将孤立房间连接到中庭传送门图。",
      ),
    );
  }

  const perfProblems = [
    world.metrics.estimatedDrawCalls > 80 ? `draw calls ${world.metrics.estimatedDrawCalls}/80` : "",
    world.metrics.estimatedTriangles > 250_000 ? `triangles ${world.metrics.estimatedTriangles}/250000` : "",
    world.metrics.realtimeLights > 4 ? `lights ${world.metrics.realtimeLights}/4` : "",
    world.metrics.exhibits > 32 ? `exhibits ${world.metrics.exhibits}/32` : "",
  ].filter(Boolean);
  if (perfProblems.length) {
    issues.push(
      issue(
        "performance",
        "warning",
        `移动端预算超限：${perfProblems.join("，")}。`,
        [world.id],
        "合并网格、实例化重复对象并降低实时灯光数量。",
      ),
    );
  }

  const errors = issues.filter((item) => item.severity === "error").length;
  const warnings = issues.filter((item) => item.severity === "warning").length;
  const score = Math.max(0, 100 - errors * 18 - warnings * 7);
  const checks = [
    { name: "Content parity", passed: !issues.some((item) => item.category === "content"), detail: `${mapped.size}/${expected.length} 来源条目已映射` },
    { name: "Spatial collisions", passed: !issues.some((item) => item.category === "overlap"), detail: `${world.exhibits.length} 个展品已做 AABB 检查` },
    { name: "Click targets", passed: !issues.some((item) => item.category === "interaction"), detail: `${world.exhibits.length - inactive.length}/${world.exhibits.length} 可交互` },
    { name: "Room graph", passed: disconnected.length === 0, detail: `${connected.size}/${world.rooms.length} 房间连通` },
    { name: "Mobile budget", passed: perfProblems.length === 0, detail: `${world.metrics.estimatedDrawCalls} calls · ${world.metrics.estimatedTriangles} tris · ${world.metrics.realtimeLights} lights` },
  ];

  return {
    passed: errors === 0,
    score,
    summary: issues.length ? `${errors} 个错误，${warnings} 个警告` : "内容、空间、交互与性能检查全部通过",
    checks,
    issues,
  };
}
