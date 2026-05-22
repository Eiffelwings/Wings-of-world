import { listSkillCommandsForAgents as listSkillCommandsForAgentsImpl } from "mechanical-wings/plugin-sdk/command-auth";

type ListSkillCommandsForAgents =
  typeof import("mechanical-wings/plugin-sdk/command-auth").listSkillCommandsForAgents;

export function listSkillCommandsForAgents(
  ...args: Parameters<ListSkillCommandsForAgents>
): ReturnType<ListSkillCommandsForAgents> {
  return listSkillCommandsForAgentsImpl(...args);
}
